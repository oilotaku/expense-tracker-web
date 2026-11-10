"""台股收盤價快照（→ ADR-0007）。

- 寫入：`snapshot()` 由每個交易日收盤後的 host 端 systemd timer 觸發（`POST
  /internal/stock-close/run`），抓所有使用者持有的股號一次存進 `stock_close_prices`。
  交易日以 MIS 回的 `d` 為準，休市日觸發只會覆寫前一個交易日那列，不需要假日行事曆。
- 讀取：非盤中時段（平日 09:00–13:35 以外，台北時間）且快照是在最近一次收盤之後抓的，
  直接用快照，不打外部 API；盤中照舊走即時報價，即時報價失敗時才退回最近一筆快照
  （ADR-0001 原本規劃、一直沒實作的收盤價退化路徑）。

盤中判斷用的是交易所所在地的固定時區，不是 `Settings.API_TZ`（後者是使用者日曆，→ CORE-041）。
"""

from __future__ import annotations

import logging
from collections.abc import Callable, Sequence
from datetime import UTC, datetime, time, timedelta
from decimal import Decimal
from typing import Final
from zoneinfo import ZoneInfo

from sqlalchemy.ext.asyncio import AsyncSession

from app.clients.stock_price_client import StockQuote, TwseMisClient, TwseMisNotFoundError
from app.repositories.stock_close_price_repository import StockClosePriceRepository

logger = logging.getLogger(__name__)

MARKET_TZ: Final[ZoneInfo] = ZoneInfo("Asia/Taipei")
SESSION_OPEN: Final[time] = time(9, 0)
# 13:30 收盤，多留 5 分鐘讓 MIS 的最後成交價（收盤價）穩定
SESSION_CLOSE: Final[time] = time(13, 35)


def _utcnow() -> datetime:
    return datetime.now(UTC)


def is_trading_session(now: datetime) -> bool:
    local = now.astimezone(MARKET_TZ)
    return local.weekday() < 5 and SESSION_OPEN <= local.time() < SESSION_CLOSE


def last_close_boundary(now: datetime) -> datetime:
    """`now` 當下或之前最近一個平日的 13:35（台北）；快照的 `fetched_at` 不早於它才算新鮮。"""
    local = now.astimezone(MARKET_TZ)
    day = local.date()
    if not (local.weekday() < 5 and local.time() >= SESSION_CLOSE):
        day -= timedelta(days=1)
    while day.weekday() >= 5:
        day -= timedelta(days=1)
    return datetime.combine(day, SESSION_CLOSE, tzinfo=MARKET_TZ)


class StockCloseService:
    def __init__(self, db: AsyncSession, now: Callable[[], datetime] = _utcnow) -> None:
        self._repo = StockClosePriceRepository(db)
        self._now = now

    async def snapshot(self, client: TwseMisClient) -> int:
        """抓所有持有股號的報價存成收盤價；回傳寫入（含覆寫）筆數。"""
        tickers = await self._repo.list_held_tickers()
        if not tickers:
            return 0
        quotes = await self._fetch_quotes(client, tickers)
        return await self._repo.upsert(quotes, self._now())

    @staticmethod
    async def _fetch_quotes(client: TwseMisClient, tickers: Sequence[str]) -> list[StockQuote]:
        try:
            return list((await client.get_quotes(tickers)).values())
        except TwseMisNotFoundError:
            # 批次中有一檔查無資料（打錯股號 / 已下市）整批會失敗；改逐檔查，跳過查不到的
            logger.warning("stock_close_batch_not_found_fallback_per_ticker")
        quotes: list[StockQuote] = []
        for ticker in tickers:
            try:
                quotes.append(await client.get_quote(ticker))
            except TwseMisNotFoundError:
                logger.warning("stock_close_ticker_not_found", extra={"ticker": ticker})
        return quotes

    async def fresh_close_prices(self, tickers: Sequence[str]) -> dict[str, Decimal]:
        """非盤中且在最近一次收盤後抓的快照；盤中一律回空（呼叫端改走即時報價）。"""
        now = self._now()
        if not tickers or is_trading_session(now):
            return {}
        boundary = last_close_boundary(now)
        rows = await self._repo.latest_by_tickers(tickers)
        return {t: r.close_price for t, r in rows.items() if r.fetched_at >= boundary}

    async def latest_close_prices(self, tickers: Sequence[str]) -> dict[str, Decimal]:
        """不論新舊的最近一筆快照，供即時報價失敗時退回。"""
        rows = await self._repo.latest_by_tickers(tickers)
        return {t: r.close_price for t, r in rows.items()}
