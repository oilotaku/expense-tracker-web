"""貴金屬現貨價（gold-api.com）與美元/台幣匯率（open.er-api.com）client，
依 `docs/Arch/adr/0002-metal-price-source.md`。

兩個 client 皆免 API key。回傳一律是**原始值**（金屬：每金衡盎司 troy oz 美元價；
匯率：USD/TWD 匯率），單位換算（troy oz → 台制兩/錢）留在 `app/services/pricing_service.py`。

`→ BE-058/059` 要求每個第三方服務各自一個 `app/clients/<service>/` 目錄
（`__init__.py` / `client.py` / `schemas.py` / `errors.py` / `README.md`）；本 task 的
`affected_files` 只列出單一檔案 `metal_price_client.py`，故把 `gold-api` 與
`exchange-rate` 兩個 client 合併在此檔，是對目錄結構地板的刻意偏離
（已在 task-014 worker 報告中列出，供 PR review 決定是否需要拆分成獨立目錄）。
"""

from __future__ import annotations

import logging
from decimal import Decimal
from typing import Final, Literal

import httpx
from pydantic import BaseModel, ValidationError

from app.core.exceptions import AppError

logger = logging.getLogger(__name__)

MetalSymbol = Literal["XAU", "XAG"]

_GOLD_API_BASE_URL: Final[str] = "https://api.gold-api.com"
_EXCHANGE_RATE_BASE_URL: Final[str] = "https://open.er-api.com"

_DEFAULT_TIMEOUT: Final[httpx.Timeout] = httpx.Timeout(connect=5.0, read=30.0, write=10.0, pool=5.0)
_DEFAULT_LIMITS: Final[httpx.Limits] = httpx.Limits(max_connections=20, max_keepalive_connections=5)


# ---- 錯誤（→ BE-064，金屬價與匯率各自獨立的 <Service>Error 家族） ----


class MetalPriceError(AppError):
    """gold-api.com 貴金屬報價基底錯誤。"""

    def __init__(
        self,
        detail: str = "貴金屬報價服務錯誤",
        *,
        status_code: int = 502,
        error_code: str = "METAL_PRICE_ERROR",
    ) -> None:
        super().__init__(
            detail, response_code=status_code, status_code=status_code, error_code=error_code
        )


class MetalPriceTimeoutError(MetalPriceError):
    def __init__(self, detail: str = "貴金屬報價服務逾時") -> None:
        super().__init__(detail, status_code=504, error_code="METAL_PRICE_TIMEOUT")


class MetalPriceRateLimitError(MetalPriceError):
    def __init__(self, retry_after: str | None = None) -> None:
        super().__init__(
            "貴金屬報價服務暫時限流", status_code=429, error_code="METAL_PRICE_RATE_LIMIT"
        )
        self.retry_after = retry_after


class ExchangeRateError(AppError):
    """open.er-api.com 匯率基底錯誤。"""

    def __init__(
        self,
        detail: str = "匯率服務錯誤",
        *,
        status_code: int = 502,
        error_code: str = "EXCHANGE_RATE_ERROR",
    ) -> None:
        super().__init__(
            detail, response_code=status_code, status_code=status_code, error_code=error_code
        )


class ExchangeRateTimeoutError(ExchangeRateError):
    def __init__(self, detail: str = "匯率服務逾時") -> None:
        super().__init__(detail, status_code=504, error_code="EXCHANGE_RATE_TIMEOUT")


class ExchangeRateRateLimitError(ExchangeRateError):
    def __init__(self, retry_after: str | None = None) -> None:
        super().__init__("匯率服務暫時限流", status_code=429, error_code="EXCHANGE_RATE_RATE_LIMIT")
        self.retry_after = retry_after


# ---- 第三方回應 schema ----


class _GoldApiPriceResponse(BaseModel):
    symbol: str
    price: Decimal


class _ExchangeRateResponse(BaseModel):
    rates: dict[str, Decimal]


# ---- clients ----


class GoldApiClient:
    """gold-api.com 現貨價（USD/troy oz），無需 API key，即時價 endpoint 官方聲明無限流
    （ADR-0002）；`app/services/pricing_service.py` 仍以 Redis 快取自限每來源 5 分鐘 1 次。
    """

    def __init__(self, http: httpx.AsyncClient | None = None) -> None:
        self._http = http or httpx.AsyncClient(
            base_url=_GOLD_API_BASE_URL,
            timeout=_DEFAULT_TIMEOUT,
            limits=_DEFAULT_LIMITS,
            headers={"User-Agent": "expense-tracker-web/1.0"},
        )

    async def aclose(self) -> None:
        await self._http.aclose()

    async def get_spot_price(self, symbol: MetalSymbol) -> Decimal:
        """回傳每金衡盎司（troy oz）美元價；台制兩/錢換算在 `pricing_service` 處理。"""
        try:
            resp = await self._http.get(f"/price/{symbol}")
            resp.raise_for_status()
        except httpx.TimeoutException as e:
            raise MetalPriceTimeoutError() from e
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 429:
                raise MetalPriceRateLimitError(e.response.headers.get("Retry-After")) from e
            raise MetalPriceError(f"貴金屬報價服務錯誤：{e.response.status_code}") from e
        except httpx.HTTPError as e:
            raise MetalPriceError("貴金屬報價服務連線失敗") from e

        try:
            payload = _GoldApiPriceResponse.model_validate(resp.json())
        except (ValueError, ValidationError) as e:
            raise MetalPriceError("貴金屬報價服務回應格式異常") from e
        return payload.price


class ExchangeRateClient:
    """open.er-api.com 匯率，無需 API key，每日更新一次（ADR-0002）。"""

    def __init__(self, http: httpx.AsyncClient | None = None) -> None:
        self._http = http or httpx.AsyncClient(
            base_url=_EXCHANGE_RATE_BASE_URL,
            timeout=_DEFAULT_TIMEOUT,
            limits=_DEFAULT_LIMITS,
            headers={"User-Agent": "expense-tracker-web/1.0"},
        )

    async def aclose(self) -> None:
        await self._http.aclose()

    async def get_rate(self, base: str, quote: str) -> Decimal:
        """回傳 `base` → `quote` 匯率（例：`get_rate("USD", "TWD")`）。"""
        try:
            resp = await self._http.get(f"/v6/latest/{base}")
            resp.raise_for_status()
        except httpx.TimeoutException as e:
            raise ExchangeRateTimeoutError() from e
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 429:
                raise ExchangeRateRateLimitError(e.response.headers.get("Retry-After")) from e
            raise ExchangeRateError(f"匯率服務錯誤：{e.response.status_code}") from e
        except httpx.HTTPError as e:
            raise ExchangeRateError("匯率服務連線失敗") from e

        try:
            payload = _ExchangeRateResponse.model_validate(resp.json())
        except (ValueError, ValidationError) as e:
            raise ExchangeRateError("匯率服務回應格式異常") from e
        rate = payload.rates.get(quote)
        if rate is None:
            raise ExchangeRateError(f"匯率服務回應缺少 {quote} 匯率")
        return rate
