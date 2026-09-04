"""PricingService：cache-aside 是否真的避免重打外部 API，以及貴金屬換算公式。

外部 HTTP 一律用 `respx` mock（→ AGENTS.md § Testing），**禁**真打 TWSE / gold-api /
open.er-api.com。Redis 走真實測試實例（→ CACHE-026），db index 1（與 production 的
db 0 隔開），測試前後清掉本檔用到的 `price:*` key（**禁** `FLUSHALL`/`FLUSHDB`，
即使是測試 fixture 也一樣，→ CACHE-017）。
"""

import json
from collections.abc import AsyncIterator
from decimal import Decimal

import httpx
import pytest
import respx
from redis.asyncio import Redis

from app.clients.stock_price_client import TwseMisNotFoundError
from app.core.cache import create_redis
from app.core.config import get_settings
from app.services.pricing_service import (
    GRAMS_PER_TAEL,
    MACE_PER_TAEL,
    METAL_PRICE_TTL_SECONDS,
    STOCK_QUOTE_TTL_SECONDS,
    TROY_OUNCE_GRAMS,
    PricingService,
    _fx_rate_key,
    _metal_price_key,
    _stock_quote_key,
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
