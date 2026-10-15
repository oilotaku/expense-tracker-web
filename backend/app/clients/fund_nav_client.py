"""鉅亨網（fund.api.cnyes.com）基金淨值 client，依 `docs/Arch/adr/0005`。

與 TWSE MIS / Yahoo Finance 同一類風險：非官方文件化、無公告速率限制。要點（實測見 ADR-0005）：
- 代號必須與鉅亨網 `cnyesId` **完全相同**：境內無逗號（`A16003`）、境外含逗號（`B16,009`），
  且區分大小寫；寫錯格式端點回 HTTP 404 **text/html**（不是 JSON）。
- 回應 `items.nav` 是陣列（最新在 `[0]`），`items.classCurrency` 是該級別幣別（ISO，如 `TWD`／
  `EUR`），非 TWD 的換算在 `pricing_service` 用既有 `ExchangeRateClient` 處理。
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

_BASE_URL: Final[str] = "https://fund.api.cnyes.com"
_MIN_INTERVAL_SECONDS: Final[float] = 1.0  # 保守自我限速，非官方公告值（同 ADR-0001 精神）

_DEFAULT_TIMEOUT: Final[httpx.Timeout] = httpx.Timeout(connect=5.0, read=30.0, write=10.0, pool=5.0)
_DEFAULT_LIMITS: Final[httpx.Limits] = httpx.Limits(max_connections=20, max_keepalive_connections=5)


class FundNavError(AppError):
    """鉅亨網基金淨值基底錯誤（→ BE-064）。"""

    def __init__(
        self,
        detail: str = "基金淨值服務錯誤",
        *,
        status_code: int = 502,
        error_code: str = "FUND_NAV_ERROR",
    ) -> None:
        super().__init__(
            detail, response_code=status_code, status_code=status_code, error_code=error_code
        )


class FundNavTimeoutError(FundNavError):
    def __init__(self, detail: str = "基金淨值服務逾時") -> None:
        super().__init__(detail, status_code=504, error_code="FUND_NAV_TIMEOUT")


class FundNavNotFoundError(FundNavError):
    """查無此基金代號（端點回 404 HTML、或 200 但 `items` 空，→ ADR-0005 實測記錄）。"""

    def __init__(self, fund_id: str) -> None:
        super().__init__(
            f"查無基金代號 {fund_id} 的淨值", status_code=404, error_code="FUND_NAV_NOT_FOUND"
        )


class FundNavRateLimitError(FundNavError):
    def __init__(self, retry_after: str | None = None) -> None:
        super().__init__("基金淨值服務暫時限流", status_code=429, error_code="FUND_NAV_RATE_LIMIT")
        self.retry_after = retry_after


class _NavItems(BaseModel):
    nav: list[Decimal]
    classCurrency: str  # noqa: N815 — 第三方回應欄位原樣命名


class _NavResponse(BaseModel):
    """`{"items": {...}}`；查無代號時曾觀察到 `{"items": [], "statusCode": 404}`（→ ADR-0005）。"""

    items: _NavItems | list[object] | None = None


class FundQuote(BaseModel):
    """每單位淨值與該級別幣別（ISO 大寫）。"""

    nav: Decimal
    currency: str


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


class CnyesFundClient:
    """鉅亨網單檔基金淨值（`docs/Arch/adr/0005-fund-nav-source.md`）。"""

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

    async def get_nav(self, fund_id: str) -> FundQuote:
        """回傳最新每單位淨值與幣別；`fund_id` 原樣放進路徑（含逗號，httpx 不會轉義）。"""
        await self._gate.wait()
        try:
            resp = await self._http.get(f"/fund/api/v1/funds/{fund_id}/nav")
        except httpx.TimeoutException as e:
            raise FundNavTimeoutError() from e
        except httpx.HTTPError as e:
            raise FundNavError("基金淨值服務連線失敗") from e

        if resp.status_code == 404:
            raise FundNavNotFoundError(fund_id)
        if resp.status_code == 429:
            raise FundNavRateLimitError(resp.headers.get("Retry-After"))
        if resp.status_code >= 400:
            raise FundNavError(f"基金淨值服務錯誤：{resp.status_code}")

        try:
            raw = resp.json()
        except ValueError as e:
            # 錯誤代號會回 HTML 頁（實測），視為查無此代號而非服務異常。
            raise FundNavNotFoundError(fund_id) from e
        try:
            payload = _NavResponse.model_validate(raw)
        except ValidationError as e:
            raise FundNavError("基金淨值服務回應格式異常") from e

        if not isinstance(payload.items, _NavItems):
            raise FundNavNotFoundError(fund_id)
        if not payload.items.nav:
            raise FundNavError("基金淨值服務回應格式異常")
        return FundQuote(nav=payload.items.nav[0], currency=payload.items.classCurrency.upper())
