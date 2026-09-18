"""TWSE MIS 個股報價 client，依 `docs/Arch/adr/0001-stock-price-source.md`。

- 端點非官方文件化，`Content-Type` 回傳 `text/html` 但內容是 JSON，**禁**依賴 content-type
  自動解析，一律 `json.loads(response.text)`。
- 市場別未知（本專案未儲存股號所屬市場）：先試上市（`tse_`），空殼回應（`msgArray[0].c` 為空）
  再試上櫃（`otc_`）；兩者皆空殼視為查無資料。
- `z`（最近成交價）為 `"-"` 時（當日尚無成交），退化取五檔委賣 `a` / 委買 `b` 的第一檔。
- 自限速率 ~1 req/2s（ADR-0001 記載的社群觀察上限之保守下限，非官方公告值），
  避免同一 process 內連續抓多檔股票時對外部觸發速率限制（→ BE-068，單機 in-memory 即可）。

**批次查詢**（使用者回報持有多檔不同股票時淨資產卡片仍然很慢後補上，2026-09-18 實測驗證，
→ ADR-0001 補充）：`ex_ch` 支援用 `|` 分隔多個值一次查詢（`ex_ch=tse_A.tw|tse_B.tw|...`），
回應 `msgArray` **依請求順序逐一對應**（查無資料的股號在對應位置回同一種空殼物件，陣列長度
與請求數一致，非官方文件記載，本檔已用真實 API 驗證過含「批次中混一檔市場前綴錯誤」的情況）。
`get_quotes()` 用這個特性把 N 檔查詢併成最多 2 次外部呼叫（先整批試 `tse_`，查無資料的再
整批試 `otc_`），取代逐檔序列呼叫——序列寫法下，即使呼叫端平行發起，本檔內部的自我限速鎖
仍會把它們序列化（鎖是同一個 client 實例共用），持有檔數越多等越久；批次查詢從根本上避開
這個問題，因為只需要 1（或 2）次外部呼叫本身受限速鎖排隊，不是 N 次。`get_quote()`（單檔）
保留、改為呼叫 `get_quotes([ticker])`，行為與呼叫次數皆不變，供既有呼叫端沿用。

**刻意不在本檔範圍內**（task-014 worker 報告已列出）：ADR-0001 提到的
`STOCK_DAY_ALL` 收盤價退化路徑；task-014 的 Acceptance 未涵蓋此案例，留待後續視需要另開任務。
"""

from __future__ import annotations

import asyncio
import json
import logging
from collections.abc import Sequence
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
        """依序嘗試上市（`tse_`）與上櫃（`otc_`）前綴；皆為空殼回應則視為查無資料。

        單檔查詢，內部走 `get_quotes()` 的批次程式碼路徑（傳入單一元素清單），呼叫次數與
        行為皆與過去相同（先試 `tse_` 一次外部呼叫，查無資料才試 `otc_` 再一次）。
        """
        quotes = await self.get_quotes([ticker])
        return quotes[ticker]

    async def get_quotes(self, tickers: Sequence[str]) -> dict[str, StockQuote]:
        """批次查詢多檔股票市價（模組頂註解「批次查詢」段）：對 `tickers` 去重後，先整批
        試上市（`tse_`）前綴，回應中仍是空殼物件的股號再整批試上櫃（`otc_`）——不論去重後有
        幾檔，最多只有 2 次外部呼叫（也因此最多被限速鎖排隊等待 2 次，不是 N 次）。任何股號
        兩種市場別皆查無資料則整批視為失敗（`TwseMisNotFoundError`），沿用單檔版本「查無資料
        即拋錯」的既有語意，由呼叫端決定如何處理（→ `net_worth_service.NetWorthService`
        目前的作法是整個彙總請求一起失敗，跟過去逐檔查詢時的行為一致）。
        """
        unique = list(dict.fromkeys(tickers))
        if not unique:
            return {}
        quotes = await self._fetch_batch(unique, "tse")
        missing = [ticker for ticker in unique if ticker not in quotes]
        if missing:
            quotes.update(await self._fetch_batch(missing, "otc"))
        still_missing = [ticker for ticker in unique if ticker not in quotes]
        if still_missing:
            raise TwseMisNotFoundError(still_missing[0])
        return quotes

    async def _fetch_batch(self, tickers: Sequence[str], market: Market) -> dict[str, StockQuote]:
        """對 `tickers` 發一次批次請求（`ex_ch` 用 `|` 分隔），依請求順序把回應
        `msgArray` 逐一對應回各股號（模組頂註解「批次查詢」段：查無資料的股號在對應位置回
        空殼物件，陣列長度與請求數一致，非官方文件記載，已用真實 API 驗證）。回傳的 dict
        只包含成功取得報價的股號，缺漏的留給呼叫端（`get_quotes`）判斷是否要試下一個市場別。
        """
        await self._gate.wait()
        ex_ch = "|".join(f"{market}_{ticker}.tw" for ticker in tickers)
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
        if not isinstance(msg_array, list) or len(msg_array) != len(tickers):
            raise TwseMisError("證交所報價服務回應格式異常（批次查詢筆數與請求不符）")

        result: dict[str, StockQuote] = {}
        for ticker, row in zip(tickers, msg_array, strict=True):
            if not isinstance(row, dict) or not row.get("c"):
                # 空殼回應：{"tv":"-","s":"-","c":"","z":"-"}（市場別用錯前綴或查無資料）
                continue

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
            result[ticker] = StockQuote(
                ticker=ticker,
                market=market,
                name=name if isinstance(name, str) else ticker,
                price=price,
            )
        return result
