"""台股收盤價快照（→ ADR-0007）：盤中判斷、快照寫入、非盤中讀快照、即時失敗退回快照。

DB 走真實測試實例（外層 transaction rollback）；MIS 用 `respx` mock，不打外部網路。
"""

import json
from collections.abc import Callable
from datetime import UTC, date, datetime
from decimal import Decimal

import httpx
import pytest
import respx
from sqlalchemy.ext.asyncio import AsyncSession

from app.clients.stock_price_client import StockQuote, TwseMisClient, TwseMisTimeoutError
from app.models.financial_asset import FinancialAsset
from app.models.user import User
from app.repositories.stock_close_price_repository import StockClosePriceRepository
from app.services.net_worth_service import NetWorthPricingUnavailableError, NetWorthService
from app.services.stock_close_service import (
    MARKET_TZ,
    StockCloseService,
    is_trading_session,
    last_close_boundary,
)

_MIS_URL = r"https://mis\.twse\.com\.tw/stock/api/getStockInfo\.jsp.*"


def _tpe(y: int, mo: int, d: int, h: int, mi: int) -> datetime:
    return datetime(y, mo, d, h, mi, tzinfo=MARKET_TZ)


def _clock(dt: datetime) -> Callable[[], datetime]:
    return lambda: dt.astimezone(UTC)


# 2026-11-10 是星期二、11-14 星期六、11-16 星期一
@pytest.mark.parametrize(
    ("now", "expected"),
    [
        (_tpe(2026, 11, 10, 8, 59), False),
        (_tpe(2026, 11, 10, 9, 0), True),
        (_tpe(2026, 11, 10, 13, 34), True),
        (_tpe(2026, 11, 10, 13, 35), False),
        (_tpe(2026, 11, 14, 10, 0), False),
    ],
)
def test_is_trading_session(now: datetime, expected: bool) -> None:
    assert is_trading_session(now.astimezone(UTC)) is expected


@pytest.mark.parametrize(
    ("now", "expected"),
    [
        (_tpe(2026, 11, 10, 15, 0), _tpe(2026, 11, 10, 13, 35)),
        (_tpe(2026, 11, 10, 8, 0), _tpe(2026, 11, 9, 13, 35)),
        (_tpe(2026, 11, 14, 12, 0), _tpe(2026, 11, 13, 13, 35)),
        (_tpe(2026, 11, 16, 8, 30), _tpe(2026, 11, 13, 13, 35)),
    ],
)
def test_last_close_boundary(now: datetime, expected: datetime) -> None:
    assert last_close_boundary(now.astimezone(UTC)) == expected


def _quote(ticker: str, price: str, trade_date: date) -> StockQuote:
    return StockQuote(
        ticker=ticker, market="tse", name=ticker, price=Decimal(price), trade_date=trade_date
    )


async def _seed_user_with_stocks(db: AsyncSession, email: str, tickers: list[str]) -> User:
    user = User(email=email)
    db.add(user)
    await db.flush()
    for ticker in tickers:
        db.add(
            FinancialAsset(
                user_uid=user.user_uid,
                asset_type="stock",
                name=ticker,
                input_quantity=Decimal(1),
                input_unit="股",
                base_quantity=Decimal(10),
                principal_amount=None,
            )
        )
    await db.flush()
    return user


async def test_upsert_overwrites_same_trade_date(db: AsyncSession) -> None:
    repo = StockClosePriceRepository(db)
    first = _tpe(2026, 11, 10, 14, 40).astimezone(UTC)
    second = _tpe(2026, 11, 11, 14, 40).astimezone(UTC)
    await repo.upsert([_quote("9901", "10.5", date(2026, 11, 10))], first)
    await repo.upsert([_quote("9901", "11.0", date(2026, 11, 10))], second)

    rows = await repo.latest_by_tickers(["9901"])
    assert rows["9901"].close_price == Decimal("11.0000")
    assert rows["9901"].fetched_at == second


async def test_latest_by_tickers_picks_newest_trade_date(db: AsyncSession) -> None:
    repo = StockClosePriceRepository(db)
    at = _tpe(2026, 11, 10, 14, 40).astimezone(UTC)
    await repo.upsert(
        [_quote("9902", "20", date(2026, 11, 9)), _quote("9902", "21", date(2026, 11, 10))], at
    )
    rows = await repo.latest_by_tickers(["9902", "9999"])
    assert set(rows) == {"9902"}
    assert rows["9902"].trade_date == date(2026, 11, 10)


@respx.mock
async def test_snapshot_saves_held_tickers_with_mis_trade_date(db: AsyncSession) -> None:
    await _seed_user_with_stocks(db, "close-snap@example.com", ["9903", "9904"])
    held = await StockClosePriceRepository(db).list_held_tickers()
    body = json.dumps(
        {
            "msgArray": [
                {"c": t, "n": f"n{t}", "z": "12.3400", "d": "20261110"}
                if t in ("9903", "9904")
                else {"c": t, "n": t, "z": "1.0000", "d": "20261110"}
                for t in held
            ]
        }
    )
    respx.get(url__regex=_MIS_URL).mock(return_value=httpx.Response(200, text=body))

    service = StockCloseService(db, now=_clock(_tpe(2026, 11, 10, 14, 40)))
    saved = await service.snapshot(TwseMisClient())

    assert saved == len(held)
    rows = await StockClosePriceRepository(db).latest_by_tickers(["9903", "9904"])
    assert {r.trade_date for r in rows.values()} == {date(2026, 11, 10)}
    assert rows["9903"].close_price == Decimal("12.3400")
    assert rows["9903"].name == "n9903"


async def test_fresh_close_prices_only_outside_session_and_after_last_close(
    db: AsyncSession,
) -> None:
    repo = StockClosePriceRepository(db)
    await repo.upsert(
        [_quote("9905", "30", date(2026, 11, 10))], _tpe(2026, 11, 10, 14, 40).astimezone(UTC)
    )

    evening = StockCloseService(db, now=_clock(_tpe(2026, 11, 10, 20, 0)))
    assert await evening.fresh_close_prices(["9905"]) == {"9905": Decimal("30.0000")}

    next_morning = StockCloseService(db, now=_clock(_tpe(2026, 11, 11, 8, 30)))
    assert await next_morning.fresh_close_prices(["9905"]) == {"9905": Decimal("30.0000")}

    in_session = StockCloseService(db, now=_clock(_tpe(2026, 11, 11, 10, 0)))
    assert await in_session.fresh_close_prices(["9905"]) == {}

    # 隔天收盤後、排程還沒跑：快照已過期，要改抓即時
    next_close = StockCloseService(db, now=_clock(_tpe(2026, 11, 11, 13, 50)))
    assert await next_close.fresh_close_prices(["9905"]) == {}


class _StockOnlyPricing:
    def __init__(self, *, fail: bool) -> None:
        self.fail = fail
        self.calls: list[list[str]] = []

    async def get_stock_prices(self, tickers: list[str]) -> dict[str, Decimal]:
        self.calls.append(list(tickers))
        if self.fail:
            raise TwseMisTimeoutError()
        return {t: Decimal("99") for t in tickers}


async def test_net_worth_uses_snapshot_after_close_without_live_call(db: AsyncSession) -> None:
    user = await _seed_user_with_stocks(db, "close-nw1@example.com", ["9906"])
    await StockClosePriceRepository(db).upsert(
        [_quote("9906", "50", date(2026, 11, 10))], _tpe(2026, 11, 10, 14, 40).astimezone(UTC)
    )
    pricing = _StockOnlyPricing(fail=False)
    close = StockCloseService(db, now=_clock(_tpe(2026, 11, 10, 21, 0)))

    result = await NetWorthService(db, pricing, close).compute(user.user_uid)  # type: ignore[arg-type]

    assert pricing.calls == []
    assert result.assets[0].market_value == Decimal("500.00")


async def test_net_worth_falls_back_to_stale_snapshot_when_live_fails(db: AsyncSession) -> None:
    user = await _seed_user_with_stocks(db, "close-nw2@example.com", ["9907"])
    await StockClosePriceRepository(db).upsert(
        [_quote("9907", "40", date(2026, 11, 6))], _tpe(2026, 11, 6, 14, 40).astimezone(UTC)
    )
    pricing = _StockOnlyPricing(fail=True)
    close = StockCloseService(db, now=_clock(_tpe(2026, 11, 10, 10, 0)))

    result = await NetWorthService(db, pricing, close).compute(user.user_uid)  # type: ignore[arg-type]

    assert pricing.calls == [["9907"]]
    assert result.assets[0].market_value == Decimal("400.00")


async def test_net_worth_still_424_when_live_fails_and_no_snapshot(db: AsyncSession) -> None:
    user = await _seed_user_with_stocks(db, "close-nw3@example.com", ["9908"])
    close = StockCloseService(db, now=_clock(_tpe(2026, 11, 10, 10, 0)))

    with pytest.raises(NetWorthPricingUnavailableError):
        await NetWorthService(db, _StockOnlyPricing(fail=True), close).compute(user.user_uid)  # type: ignore[arg-type]
