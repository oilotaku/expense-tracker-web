"""Yahoo Finance 非官方 chart API 美股報價 client，依 `docs/Arch/adr/0003`。

端點與 TWSE MIS（→ ADR-0001）同一類風險：非官方文件化、社群長期依賴（`yfinance` 套件底層
即呼叫同一端點）、無官方公告速率限制。查無此代號時端點直接回 HTTP 404（非 200 + 錯誤 JSON），
本檔已實測驗證過，見 ADR-0003。
"""

from __future__ import annotations

import asyncio
import logging
from decimal import Decimal
from time import monotonic
from typing import Final

import httpx
from pydantic import BaseModel, ValidationError

from app.core.exceptions import AppError

logger = logging.getLogger(__name__)

_BASE_URL: Final[str] = "https://query1.finance.yahoo.com"
_MIN_INTERVAL_SECONDS: Final[float] = 1.0  # 保守自我限速，非官方公告值（同 ADR-0001 精神）

_DEFAULT_TIMEOUT: Final[httpx.Timeout] = httpx.Timeout(connect=5.0, read=30.0, write=10.0, pool=5.0)
_DEFAULT_LIMITS: Final[httpx.Limits] = httpx.Limits(max_connections=20, max_keepalive_connections=5)


class UsStockPriceError(AppError):
    """Yahoo Finance 美股報價基底錯誤（→ BE-064）。"""

    def __init__(
        self,
        detail: str = "美股報價服務錯誤",
        *,
        status_code: int = 502,
        error_code: str = "US_STOCK_PRICE_ERROR",
    ) -> None:
        super().__init__(
            detail, response_code=status_code, status_code=status_code, error_code=error_code
        )


class UsStockPriceTimeoutError(UsStockPriceError):
    def __init__(self, detail: str = "美股報價服務逾時") -> None:
        super().__init__(detail, status_code=504, error_code="US_STOCK_PRICE_TIMEOUT")


class UsStockPriceNotFoundError(UsStockPriceError):
    """查無此美股代號（端點回 404，→ ADR-0003 實測記錄）。"""

    def __init__(self, ticker: str) -> None:
        super().__init__(
            f"查無美股代號 {ticker} 的報價", status_code=404, error_code="US_STOCK_PRICE_NOT_FOUND"
        )


class UsStockPriceRateLimitError(UsStockPriceError):
    def __init__(self, retry_after: str | None = None) -> None:
        super().__init__(
            "美股報價服務暫時限流", status_code=429, error_code="US_STOCK_PRICE_RATE_LIMIT"
        )
        self.retry_after = retry_after


class _ChartMeta(BaseModel):
    regularMarketPrice: Decimal  # noqa: N815 — 第三方回應欄位原樣命名


class _ChartResult(BaseModel):
    meta: _ChartMeta


class _Chart(BaseModel):
    result: list[_ChartResult] | None = None


class _ChartResponse(BaseModel):
    """回應外層包一層 `chart`：`{"chart": {"result": [...], "error": ...}}`（→ ADR-0003）。"""

    chart: _Chart


class _RateGate:
    """單機 in-memory 限速（→ BE-068），同 `stock_price_client.py` 的既有模式。"""

    def __init__(self, min_interval: float) -> None:
        self._min_interval = min_interval
        self._lock = asyncio.Lock()
        self._last_call: float | None = None

    async def wait(self) -> None:
        async with self._lock:
            now = monotonic()
            if self._last_call is not None:
                elapsed = now - self._last_call
                if elapsed < self._min_interval:
                    await asyncio.sleep(self._min_interval - elapsed)
            self._last_call = monotonic()


class YahooFinanceClient:
    """Yahoo Finance chart API 美股報價（`docs/Arch/adr/0003-us-stock-price-source.md`）。"""

    def __init__(self, http: httpx.AsyncClient | None = None) -> None:
        self._http = http or httpx.AsyncClient(
            base_url=_BASE_URL,
            timeout=_DEFAULT_TIMEOUT,
            limits=_DEFAULT_LIMITS,
            headers={"User-Agent": "expense-tracker-web/1.0"},
        )
        self._gate = _RateGate(_MIN_INTERVAL_SECONDS)

    async def aclose(self) -> None:
        await self._http.aclose()

    async def get_quote(self, ticker: str) -> Decimal:
        """回傳每股市價（USD）；台幣換算在 `pricing_service` 處理（沿用既有
        `ExchangeRateClient`）。"""
        await self._gate.wait()
        try:
            resp = await self._http.get(f"/v8/finance/chart/{ticker}")
        except httpx.TimeoutException as e:
            raise UsStockPriceTimeoutError() from e
        except httpx.HTTPError as e:
            raise UsStockPriceError("美股報價服務連線失敗") from e

        if resp.status_code == 404:
            raise UsStockPriceNotFoundError(ticker)
        if resp.status_code == 429:
            raise UsStockPriceRateLimitError(resp.headers.get("Retry-After"))
        if resp.status_code >= 400:
            raise UsStockPriceError(f"美股報價服務錯誤：{resp.status_code}")

        try:
            payload = _ChartResponse.model_validate(resp.json())
        except (ValueError, ValidationError) as e:
            raise UsStockPriceError("美股報價服務回應格式異常") from e

        if not payload.chart.result:
            raise UsStockPriceNotFoundError(ticker)
        return payload.chart.result[0].meta.regularMarketPrice
