"""報價快取層：cache-aside（純加速型快取，→ CACHE-007）。

流程：查 Redis cache → miss 才呼叫外部 client → 寫回 cache（帶 TTL）→ 回傳；
Redis 不可用時 `app.core.cache` 已回 `None`，直接退化為每次都呼叫外部來源，
只記 `WARNING`，不向使用者回錯。外部 client 的錯誤（逾時 / 限流 / 格式異常）
一律原樣往外拋（`TwseMisError` / `MetalPriceError` / `ExchangeRateError` 家族，
→ BE-064），由呼叫端（task-016 淨資產彙總）決定如何呈現。

TTL 依 ADR 記載的自限速率設定：
- 股票（ADR-0001）：`STOCK_QUOTE_TTL_SECONDS`，配合 client 端 ~1 req/2s 限速。
- 貴金屬現貨價（ADR-0002）：`METAL_PRICE_TTL_SECONDS` = 5 分鐘（每來源最多每 5 分鐘 1 次）。
- 匯率（ADR-0002）：`FX_RATE_TTL_SECONDS`，`open.er-api.com` 每日才更新一次。

回傳的單價已是 `financial_assets.base_quantity`（股數 / 錢數）可直接相乘的基本單位市價，
不需呼叫端再次換算（→ `app/utils/unit_conversion.py` 模組頂註解）。
"""

from __future__ import annotations

import logging
from decimal import Decimal
from typing import Final

from pydantic import BaseModel, field_serializer
from redis.asyncio import Redis

from app.clients.metal_price_client import ExchangeRateClient, GoldApiClient, MetalSymbol
from app.clients.stock_price_client import StockQuote, TwseMisClient
from app.core.cache import get_cached_bytes, set_cached_bytes

logger = logging.getLogger(__name__)

_APP: Final[str] = "expense_tracker_web"
_VERSION: Final[str] = "v1"

# TTL 上限依 CACHE-013「純加速快取 60–600s」；股票/貴金屬皆屬此類。
STOCK_QUOTE_TTL_SECONDS: Final[int] = 90  # ADR-0001：~1 req/2s 自限 + 可接受數分鐘延遲
METAL_PRICE_TTL_SECONDS: Final[int] = 300  # ADR-0002：每來源最多每 5 分鐘 1 次
FX_RATE_TTL_SECONDS: Final[int] = 43200  # ADR-0002：open.er-api.com 每日更新一次，取 12 小時

# 換算常數（ADR-0002）
TROY_OUNCE_GRAMS: Final[Decimal] = Decimal("31.1034768")
GRAMS_PER_TAEL: Final[Decimal] = Decimal("37.5")  # 1 台兩 = 37.5 g
MACE_PER_TAEL: Final[Decimal] = Decimal(10)  # 1 錢 = 1/10 兩


def _stock_quote_key(ticker: str) -> str:
    return f"{_APP}:{_VERSION}:price:stock:{ticker}"


def _metal_price_key(symbol: MetalSymbol) -> str:
    return f"{_APP}:{_VERSION}:price:metal:{symbol}"


def _fx_rate_key(base: str, quote: str) -> str:
    return f"{_APP}:{_VERSION}:price:fx:{base}:{quote}"


class _CachedDecimal(BaseModel):
    """快取 value 一律 JSON（→ CACHE-015）；Decimal 明確序列化為字串以保留精度（→ DB-038）。"""

    value: Decimal

    @field_serializer("value", when_used="json")
    def _value_to_str(self, v: Decimal) -> str:
        return str(v)


async def _get_cached_decimal(redis: Redis | None, key: str) -> Decimal | None:
    raw = await get_cached_bytes(redis, key)
    if raw is None:
        return None
    return _CachedDecimal.model_validate_json(raw).value


async def _set_cached_decimal(redis: Redis | None, key: str, value: Decimal, ttl: int) -> None:
    await set_cached_bytes(redis, key, _CachedDecimal(value=value).model_dump_json().encode(), ttl)


class PricingService:
    """股票 / 貴金屬報價服務，皆為純加速型快取（→ CACHE-007）。"""

    def __init__(
        self,
        redis: Redis | None,
        stock_client: TwseMisClient | None = None,
        gold_client: GoldApiClient | None = None,
        fx_client: ExchangeRateClient | None = None,
    ) -> None:
        self._redis = redis
        self._stock_client = stock_client or TwseMisClient()
        self._gold_client = gold_client or GoldApiClient()
        self._fx_client = fx_client or ExchangeRateClient()

    async def get_stock_price(self, ticker: str) -> Decimal:
        """回傳每股市價（TWD）；命中快取 TTL 內不重打 TWSE MIS。"""
        key = _stock_quote_key(ticker)
        cached = await _get_cached_decimal(self._redis, key)
        if cached is not None:
            return cached
        quote: StockQuote = await self._stock_client.get_quote(ticker)
        await _set_cached_decimal(self._redis, key, quote.price, STOCK_QUOTE_TTL_SECONDS)
        return quote.price

    async def get_metal_price_per_mace(self, symbol: MetalSymbol) -> Decimal:
        """回傳每錢市價（TWD），公式見 `docs/Arch/adr/0002-metal-price-source.md`。

        金屬現貨價與 USD/TWD 匯率各自獨立快取（TTL 不同），任一項命中快取即不重打對應來源。
        """
        price_usd_per_ozt = await self._get_metal_spot_price(symbol)
        usd_twd_rate = await self._get_usd_twd_rate()
        usd_per_gram = price_usd_per_ozt / TROY_OUNCE_GRAMS
        twd_per_gram = usd_per_gram * usd_twd_rate
        twd_per_tael = twd_per_gram * GRAMS_PER_TAEL
        return twd_per_tael / MACE_PER_TAEL

    async def _get_metal_spot_price(self, symbol: MetalSymbol) -> Decimal:
        key = _metal_price_key(symbol)
        cached = await _get_cached_decimal(self._redis, key)
        if cached is not None:
            return cached
        price = await self._gold_client.get_spot_price(symbol)
        await _set_cached_decimal(self._redis, key, price, METAL_PRICE_TTL_SECONDS)
        return price

    async def _get_usd_twd_rate(self) -> Decimal:
        key = _fx_rate_key("USD", "TWD")
        cached = await _get_cached_decimal(self._redis, key)
        if cached is not None:
            return cached
        rate = await self._fx_client.get_rate("USD", "TWD")
        await _set_cached_decimal(self._redis, key, rate, FX_RATE_TTL_SECONDS)
        return rate
