"""TWSE MIS 個股報價 client，依 `docs/Arch/adr/0001-stock-price-source.md`。

- 端點非官方文件化，`Content-Type` 回傳 `text/html` 但內容是 JSON，**禁**依賴 content-type
  自動解析，一律 `json.loads(response.text)`。
- 市場別未知（本專案未儲存股號所屬市場）：先試上市（`tse_`），空殼回應（`msgArray[0].c` 為空）
  再試上櫃（`otc_`）；兩者皆空殼視為查無資料。
- `z`（最近成交價）為 `"-"` 時（當日尚無成交），退化取五檔委賣 `a` / 委買 `b` 的第一檔。
- 自限速率 ~1 req/2s（ADR-0001 記載的社群觀察上限之保守下限，非官方公告值），
  避免同一 process 內連續抓多檔股票時對外部觸發速率限制（→ BE-068，單機 in-memory 即可）。

**刻意不在本檔範圍內**（task-014 worker 報告已列出）：ADR-0001 提到的
`STOCK_DAY_ALL` 收盤價退化路徑；task-014 的 Acceptance 未涵蓋此案例，留待後續視需要另開任務。
"""

from __future__ import annotations

import asyncio
import json
import logging
from decimal import Decimal, InvalidOperation
from time import monotonic
from typing import Final, Literal

import httpx
from pydantic import BaseModel

from app.core.exceptions import AppError

logger = logging.getLogger(__name__)

Market = Literal["tse", "otc"]

_BASE_URL: Final[str] = "https://mis.twse.com.tw"
_QUOTE_PATH: Final[str] = "/stock/api/getStockInfo.jsp"
_MIN_INTERVAL_SECONDS: Final[float] = 2.0  # ADR-0001：自限 ~1 req/2s

_DEFAULT_TIMEOUT: Final[httpx.Timeout] = httpx.Timeout(connect=5.0, read=30.0, write=10.0, pool=5.0)
_DEFAULT_LIMITS: Final[httpx.Limits] = httpx.Limits(max_connections=20, max_keepalive_connections=5)


class TwseMisError(AppError):
    """TWSE MIS 報價服務基底錯誤（→ BE-064）。"""

    def __init__(
        self,
        detail: str = "證交所報價服務錯誤",
        *,
        status_code: int = 502,
        error_code: str = "TWSE_MIS_ERROR",
    ) -> None:
        super().__init__(
            detail, response_code=status_code, status_code=status_code, error_code=error_code
        )


class TwseMisTimeoutError(TwseMisError):
    def __init__(self, detail: str = "證交所報價服務逾時") -> None:
        super().__init__(detail, status_code=504, error_code="TWSE_MIS_TIMEOUT")


class TwseMisNotFoundError(TwseMisError):
    """查無此股號：上市／上櫃兩個前綴皆回空殼物件（ADR-0001）。"""

    def __init__(self, ticker: str) -> None:
        super().__init__(
            f"查無股號 {ticker} 的報價", status_code=404, error_code="TWSE_MIS_NOT_FOUND"
        )


class TwseMisRateLimitError(TwseMisError):
    def __init__(self, retry_after: str | None = None) -> None:
        super().__init__(
            "證交所報價服務暫時限流", status_code=429, error_code="TWSE_MIS_RATE_LIMIT"
        )
        self.retry_after = retry_after


class StockQuote(BaseModel):
    ticker: str
    market: Market
    name: str
    price: Decimal


class _RateGate:
    """單機 in-memory 限速（→ BE-068）：確保連續呼叫間隔 ≥ `min_interval` 秒。"""

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


def _first_quote_price(field: object) -> str | None:
    """解析 `a`/`b` 五檔委賣/委買價字串（例："2395.0000_2400.0000_..."），取第一檔。"""
    if not isinstance(field, str) or not field:
        return None
    first = field.split("_", 1)[0]
    return first or None


class TwseMisClient:
    """TWSE MIS 看盤中心個股報價（`docs/Arch/adr/0001-stock-price-source.md`）。"""

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

    async def get_quote(self, ticker: str) -> StockQuote:
        """依序嘗試上市（`tse_`）與上櫃（`otc_`）前綴；皆為空殼回應則視為查無資料。"""
        for market in ("tse", "otc"):
            quote = await self._fetch(ticker, market)
            if quote is not None:
                return quote
        raise TwseMisNotFoundError(ticker)

    async def _fetch(self, ticker: str, market: Market) -> StockQuote | None:
        await self._gate.wait()
        ex_ch = f"{market}_{ticker}.tw"
        try:
            resp = await self._http.get(
                _QUOTE_PATH, params={"ex_ch": ex_ch, "json": "1", "delay": "0"}
            )
            resp.raise_for_status()
        except httpx.TimeoutException as e:
            raise TwseMisTimeoutError() from e
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 429:
                raise TwseMisRateLimitError(e.response.headers.get("Retry-After")) from e
            raise TwseMisError(f"證交所報價服務錯誤：{e.response.status_code}") from e
        except httpx.HTTPError as e:
            raise TwseMisError("證交所報價服務連線失敗") from e

        # Content-Type 為 text/html 但內容是 JSON（ADR-0001），需手動解析
        try:
            payload: dict[str, object] = json.loads(resp.text)
        except json.JSONDecodeError as e:
            raise TwseMisError("證交所報價服務回應格式異常") from e

        msg_array = payload.get("msgArray")
        if not isinstance(msg_array, list) or not msg_array:
            return None
        row = msg_array[0]
        if not isinstance(row, dict) or not row.get("c"):
            # 空殼回應：{"tv":"-","s":"-","c":"","z":"-"}（市場別用錯前綴或查無資料）
            return None

        price_raw = row.get("z")
        if price_raw in (None, "-", ""):
            price_raw = _first_quote_price(row.get("a")) or _first_quote_price(row.get("b"))
        if price_raw in (None, "-", ""):
            raise TwseMisError(f"股號 {ticker} 目前無可用報價")

        try:
            price = Decimal(str(price_raw))
        except InvalidOperation as e:
            raise TwseMisError("證交所報價服務回應價格格式異常") from e

        name = row.get("n")
        return StockQuote(
            ticker=ticker,
            market=market,
            name=name if isinstance(name, str) else ticker,
            price=price,
        )
