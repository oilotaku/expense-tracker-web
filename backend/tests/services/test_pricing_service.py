"""PricingService：cache-aside 是否真的避免重打外部 API，以及貴金屬換算公式。

外部 HTTP 一律用 `respx` mock（→ AGENTS.md § Testing），**禁**真打 TWSE / gold-api /
open.er-api.com / query1.finance.yahoo.com。Redis 走真實測試實例（→ CACHE-026），db index 1
（與 production 的 db 0 隔開），測試前後清掉本檔用到的 `price:*` key（**禁**
`FLUSHALL`/`FLUSHDB`，即使是測試 fixture 也一樣，→ CACHE-017）。
"""

import json
from collections.abc import AsyncIterator
from decimal import Decimal

import httpx
import pytest
import respx
from redis.asyncio import Redis

from app.clients.stock_price_client import TwseMisNotFoundError
from app.clients.us_stock_price_client import UsStockPriceNotFoundError
from app.core.cache import create_redis
from app.core.config import get_settings
from app.services.pricing_service import (
    GRAMS_PER_TAEL,
    MACE_PER_TAEL,
    METAL_PRICE_TTL_SECONDS,
    STOCK_QUOTE_TTL_SECONDS,
    TROY_OUNCE_GRAMS,
    US_STOCK_QUOTE_TTL_SECONDS,
    PricingService,
    _fx_rate_key,
    _metal_price_key,
    _stock_quote_key,
    _us_stock_quote_key,
)

_PRICE_KEY_PATTERN = "expense_tracker_web:v1:price:*"


@pytest.fixture
async def redis_client() -> AsyncIterator[Redis]:
    settings = get_settings()
    base_url = settings.REDIS_URL or "redis://redis:6379/0"
    test_url = base_url.rsplit("/", 1)[0] + "/1"  # 測試用獨立 db index（→ CACHE-026）
    client = create_redis(test_url)
    try:
        yield client
    finally:
        async for key in client.scan_iter(match=_PRICE_KEY_PATTERN, count=500):
            await client.unlink(key)
        await client.aclose()


def _mis_body(*, code: str, name: str, price: str) -> str:
    return json.dumps(
        {
            "msgArray": [{"c": code, "n": name, "z": price}],
            "rtcode": "0000",
            "rtmessage": "OK",
        }
    )


def _mis_shell_body() -> str:
    # ADR-0001：市場別用錯前綴時的空殼回應
    return json.dumps({"msgArray": [{"tv": "-", "s": "-", "c": "", "z": "-"}], "rtcode": "0000"})


def _mis_batch_body(entries: list[tuple[str, str, str] | None]) -> str:
    """批次查詢的 msgArray：`None` 代表該位置回空殼物件（→ ADR-0001 補充，位置對應
    請求順序，與單檔查詢的空殼回應同一種格式）。"""
    msg_array: list[dict[str, str]] = []
    for entry in entries:
        if entry is None:
            msg_array.append({"tv": "-", "s": "-", "c": "", "z": "-"})
        else:
            code, name, price = entry
            msg_array.append({"c": code, "n": name, "z": price})
    return json.dumps({"msgArray": msg_array, "rtcode": "0000", "rtmessage": "OK"})


def _mis_response(text: str) -> httpx.Response:
    # 端點回傳 Content-Type 為 text/html 但內容是 JSON（ADR-0001）
    return httpx.Response(200, text=text, headers={"Content-Type": "text/html;charset=UTF-8"})


@respx.mock
async def test_stock_price_cache_prevents_second_external_call(redis_client: Redis) -> None:
    route = respx.get(url__regex=r"https://mis\.twse\.com\.tw/stock/api/getStockInfo\.jsp.*").mock(
        return_value=_mis_response(_mis_body(code="2330", name="台積電", price="600.0000"))
    )
    service = PricingService(redis=redis_client)

    price1 = await service.get_stock_price("2330")
    price2 = await service.get_stock_price("2330")

    assert price1 == price2 == Decimal("600.0000")
    assert route.call_count == 1  # 第二次命中快取，未重打外部 API

    ttl = await redis_client.ttl(_stock_quote_key("2330"))
    assert 0 < ttl <= STOCK_QUOTE_TTL_SECONDS


@respx.mock
async def test_stock_price_falls_back_to_otc_when_tse_is_shell(redis_client: Redis) -> None:
    route = respx.get(url__regex=r"https://mis\.twse\.com\.tw/stock/api/getStockInfo\.jsp.*").mock(
        side_effect=[
            _mis_response(_mis_shell_body()),  # tse_ 前綴：空殼回應
            _mis_response(_mis_body(code="3105", name="穩懋", price="446.5000")),  # otc_ 前綴成功
        ]
    )
    service = PricingService(redis=redis_client)

    price = await service.get_stock_price("3105")

    assert price == Decimal("446.5000")
    assert route.call_count == 2


@respx.mock
async def test_stock_price_not_found_when_both_markets_are_shell(redis_client: Redis) -> None:
    respx.get(url__regex=r"https://mis\.twse\.com\.tw/stock/api/getStockInfo\.jsp.*").mock(
        return_value=_mis_response(_mis_shell_body())
    )
    service = PricingService(redis=redis_client)

    with pytest.raises(TwseMisNotFoundError):
        await service.get_stock_price("0000")


@respx.mock
async def test_stock_prices_batches_all_misses_into_a_single_external_call(
    redis_client: Redis,
) -> None:
    """使用者回報「持有多檔不同股票時淨資產卡片仍然很慢」的修法核心：全部快取未命中時，
    不論幾檔股票都只打一次外部 API（→ ADR-0001 補充、net_worth_service.py 模組頂註解
    「效能」第二輪），`ex_ch` 帶所有股號、用 `|` 分隔。"""
    route = respx.get(url__regex=r"https://mis\.twse\.com\.tw/stock/api/getStockInfo\.jsp.*").mock(
        return_value=_mis_response(
            _mis_batch_body(
                [
                    ("2330", "台積電", "600.0000"),
                    ("0050", "元大台灣50", "110.0000"),
                    ("1101", "台泥", "24.5000"),
                ]
            )
        )
    )
    service = PricingService(redis=redis_client)

    prices = await service.get_stock_prices(["2330", "0050", "1101"])

    assert prices == {
        "2330": Decimal("600.0000"),
        "0050": Decimal("110.0000"),
        "1101": Decimal("24.5000"),
    }
    assert route.call_count == 1
    ex_ch = route.calls[0].request.url.params["ex_ch"]
    assert set(ex_ch.split("|")) == {"tse_2330.tw", "tse_0050.tw", "tse_1101.tw"}

    for ticker in ("2330", "0050", "1101"):
        ttl = await redis_client.ttl(_stock_quote_key(ticker))
        assert 0 < ttl <= STOCK_QUOTE_TTL_SECONDS


@respx.mock
async def test_stock_prices_only_fetches_cache_misses(redis_client: Redis) -> None:
    """部分股號已在快取中時，批次查詢只帶未命中的股號，不重查已快取的。"""
    route = respx.get(url__regex=r"https://mis\.twse\.com\.tw/stock/api/getStockInfo\.jsp.*").mock(
        side_effect=[
            # 暖身：先個別查詢 2330，讓它進快取
            _mis_response(_mis_body(code="2330", name="台積電", price="600.0000")),
            # 批次查詢：2330 命中快取，這次只帶 0050
            _mis_response(_mis_batch_body([("0050", "元大台灣50", "110.0000")])),
        ]
    )
    service = PricingService(redis=redis_client)
    await service.get_stock_price("2330")

    prices = await service.get_stock_prices(["2330", "0050"])

    assert prices == {"2330": Decimal("600.0000"), "0050": Decimal("110.0000")}
    assert route.call_count == 2
    second_ex_ch = route.calls[1].request.url.params["ex_ch"]
    assert second_ex_ch == "tse_0050.tw"


@respx.mock
async def test_stock_prices_returns_all_from_cache_without_external_call(
    redis_client: Redis,
) -> None:
    route = respx.get(url__regex=r"https://mis\.twse\.com\.tw/stock/api/getStockInfo\.jsp.*").mock(
        return_value=_mis_response(
            _mis_batch_body([("2330", "台積電", "600.0000"), ("0050", "元大台灣50", "110.0000")])
        )
    )
    service = PricingService(redis=redis_client)
    await service.get_stock_prices(["2330", "0050"])
    assert route.call_count == 1

    prices = await service.get_stock_prices(["2330", "0050"])

    assert prices == {"2330": Decimal("600.0000"), "0050": Decimal("110.0000")}
    assert route.call_count == 1  # 全部命中快取，沒有再打外部 API


@respx.mock
async def test_stock_prices_falls_back_to_otc_for_tickers_missing_in_tse_batch(
    redis_client: Redis,
) -> None:
    """批次裡有股號在 tse_ 批次回空殼，該股號整批再試一次 otc_（其他已成功的股號不會被
    重查），驗證位置對應解析在混合成功/空殼結果時仍正確（→ ADR-0001 補充的實測記錄）。"""
    route = respx.get(url__regex=r"https://mis\.twse\.com\.tw/stock/api/getStockInfo\.jsp.*").mock(
        side_effect=[
            _mis_response(_mis_batch_body([("2330", "台積電", "600.0000"), None])),
            _mis_response(_mis_batch_body([("3105", "穩懋", "446.5000")])),
        ]
    )
    service = PricingService(redis=redis_client)

    prices = await service.get_stock_prices(["2330", "3105"])

    assert prices == {"2330": Decimal("600.0000"), "3105": Decimal("446.5000")}
    assert route.call_count == 2
    first_ex_ch = route.calls[0].request.url.params["ex_ch"]
    assert first_ex_ch == "tse_2330.tw|tse_3105.tw"
    second_ex_ch = route.calls[1].request.url.params["ex_ch"]
    assert second_ex_ch == "otc_3105.tw"


@respx.mock
async def test_stock_prices_raises_not_found_when_missing_from_both_markets(
    redis_client: Redis,
) -> None:
    respx.get(url__regex=r"https://mis\.twse\.com\.tw/stock/api/getStockInfo\.jsp.*").mock(
        side_effect=[
            _mis_response(_mis_batch_body([("2330", "台積電", "600.0000"), None])),
            _mis_response(_mis_batch_body([None])),
        ]
    )
    service = PricingService(redis=redis_client)

    with pytest.raises(TwseMisNotFoundError):
        await service.get_stock_prices(["2330", "0000"])


def _yahoo_chart_body(price: str) -> dict[str, object]:
    return {"chart": {"result": [{"meta": {"regularMarketPrice": price}}], "error": None}}


@respx.mock
async def test_us_stock_price_cache_prevents_second_external_call_and_converts_to_twd(
    redis_client: Redis,
) -> None:
    quote_route = respx.get("https://query1.finance.yahoo.com/v8/finance/chart/AAPL").mock(
        return_value=httpx.Response(200, json=_yahoo_chart_body("200.00"))
    )
    fx_route = respx.get("https://open.er-api.com/v6/latest/USD").mock(
        return_value=httpx.Response(
            200, json={"result": "success", "base_code": "USD", "rates": {"TWD": 31.5}}
        )
    )
    service = PricingService(redis=redis_client)

    price1 = await service.get_us_stock_price("AAPL")
    price2 = await service.get_us_stock_price("AAPL")

    # ADR-0003：美股報價（USD）× USD/TWD 匯率 = TWD 市價
    assert price1 == price2 == Decimal("200.00") * Decimal("31.5")
    assert quote_route.call_count == 1  # 第二次命中快取，未重打外部 API
    assert fx_route.call_count == 1  # 匯率也命中快取（跟貴金屬換算共用同一份匯率快取）

    ttl = await redis_client.ttl(_us_stock_quote_key("AAPL"))
    assert 0 < ttl <= US_STOCK_QUOTE_TTL_SECONDS


@respx.mock
async def test_get_exchange_rate_same_currency_returns_one_without_external_call(
    redis_client: Redis,
) -> None:
    """帳戶幣別換算（外幣帳戶功能）常見情境：帳戶本身就是 TWD，不該為此打匯率 API 或佔快取。"""
    fx_route = respx.get("https://open.er-api.com/v6/latest/TWD").mock(
        return_value=httpx.Response(
            200, json={"result": "success", "base_code": "TWD", "rates": {"TWD": 1}}
        )
    )
    service = PricingService(redis=redis_client)

    rate = await service.get_exchange_rate("TWD", "TWD")

    assert rate == Decimal(1)
    assert fx_route.call_count == 0
    assert await redis_client.get(_fx_rate_key("TWD", "TWD")) is None


@respx.mock
async def test_get_exchange_rate_caches_result(redis_client: Redis) -> None:
    """帳戶幣別換算重用既有的匯率快取機制：同一組 base/quote 命中快取 TTL 內不重打外部 API
    （跟美股/貴金屬換算共用同一份快取，`_fx_rate_key` 本身就是通用的，不是寫死 USD/TWD）。"""
    fx_route = respx.get("https://open.er-api.com/v6/latest/EUR").mock(
        return_value=httpx.Response(
            200, json={"result": "success", "base_code": "EUR", "rates": {"TWD": 34.2}}
        )
    )
    service = PricingService(redis=redis_client)

    rate1 = await service.get_exchange_rate("EUR", "TWD")
    rate2 = await service.get_exchange_rate("EUR", "TWD")

    assert rate1 == rate2 == Decimal("34.2")
    assert fx_route.call_count == 1

    ttl = await redis_client.ttl(_fx_rate_key("EUR", "TWD"))
    assert 0 < ttl <= 43200


@respx.mock
async def test_us_stock_price_not_found_returns_404(redis_client: Redis) -> None:
    respx.get("https://query1.finance.yahoo.com/v8/finance/chart/ZZZZZ").mock(
        return_value=httpx.Response(404)
    )
    service = PricingService(redis=redis_client)

    with pytest.raises(UsStockPriceNotFoundError):
        await service.get_us_stock_price("ZZZZZ")


@respx.mock
async def test_metal_price_cache_prevents_second_external_call_and_matches_formula(
    redis_client: Redis,
) -> None:
    gold_route = respx.get("https://api.gold-api.com/price/XAU").mock(
        return_value=httpx.Response(
            200,
            json={
                "currency": "USD",
                "symbol": "XAU",
                "name": "Gold",
                "price": 4443.0,
                "updatedAt": "2026-09-03T12:17:54Z",
            },
        )
    )
    fx_route = respx.get("https://open.er-api.com/v6/latest/USD").mock(
        return_value=httpx.Response(
            200, json={"result": "success", "base_code": "USD", "rates": {"TWD": 31.757562}}
        )
    )
    service = PricingService(redis=redis_client)

    price1 = await service.get_metal_price_per_mace("XAU")
    price2 = await service.get_metal_price_per_mace("XAU")

    assert price1 == price2
    assert gold_route.call_count == 1
    assert fx_route.call_count == 1

    # 換算公式（docs/Arch/adr/0002-metal-price-source.md）：USD/g → TWD/g → TWD/兩 → TWD/錢
    expected = (
        (Decimal("4443.0") / TROY_OUNCE_GRAMS) * Decimal("31.757562") * GRAMS_PER_TAEL
    ) / MACE_PER_TAEL
    assert price1 == expected

    metal_ttl = await redis_client.ttl(_metal_price_key("XAU"))
    fx_ttl = await redis_client.ttl(_fx_rate_key("USD", "TWD"))
    assert 0 < metal_ttl <= METAL_PRICE_TTL_SECONDS
    assert fx_ttl > METAL_PRICE_TTL_SECONDS  # 匯率 TTL 遠長於金屬現貨價（每日才更新一次）


@respx.mock
async def test_redis_unavailable_falls_back_to_source_without_error(redis_client: Redis) -> None:
    """純加速型快取（→ CACHE-007）：Redis 未啟用（`None`）時仍能正常取價，只是每次都打外部 API。"""
    route = respx.get(url__regex=r"https://mis\.twse\.com\.tw/stock/api/getStockInfo\.jsp.*").mock(
        return_value=_mis_response(_mis_body(code="2330", name="台積電", price="600.0000"))
    )
    service = PricingService(redis=None)

    price1 = await service.get_stock_price("2330")
    price2 = await service.get_stock_price("2330")

    assert price1 == price2 == Decimal("600.0000")
    assert route.call_count == 2  # 沒有快取可用，兩次都真打外部 API
