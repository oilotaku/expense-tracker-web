"""淨資產彙總服務：帳戶餘額加總 + 金融資產市值（呼叫 task-014 `pricing_service`）－ 負債。

金融資產市值 = `base_quantity`（股數 / 錢數，已由 task-013 換算完成，→
`app/utils/unit_conversion.py` 模組頂註解）× 報價服務回傳的單位市價（台股／美股：每股價，
美股已含 USD→TWD 換算，→ ADR-0003；貴金屬：每錢價，`pricing_service.get_metal_price_per_mace`
已完成 troy oz → 錢的換算），此處不需再次換算。

貴金屬的 `financial_assets.name` 存的是品項名稱（例："黃金"），但
`app.clients.metal_price_client.MetalSymbol` 只認 `XAU` / `XAG` 代碼；本檔維護兩者對應
（`_METAL_NAME_TO_SYMBOL`），因為目前沒有其他地方定義過這個映射（task-013 只存自由文字
品項名稱，未限制枚舉）。品項名稱不在對應表內 → 視為輸入資料問題（422），不是外部服務問題。

外部報價來源逾時 / 失敗時（`pricing_service` 拋出的 `TwseMisError` / `MetalPriceError` /
`ExchangeRateError` 家族，皆為 `AppError` 子類 → BE-064），本服務**禁**讓整個彙總請求以未
預期例外崩潰（BE-051 禁裸 catch 靜默），統一轉成 `NetWorthPricingUnavailableError`
（424 Failed Dependency，刻意選非 5xx：語意是「上游報價服務暫時不可用」而非「本服務壞了」，
可與框架的通用 500 handler 明確區分），並在 log 保留原始例外（`logger.exception`，→ BE-052）。

**效能（使用者回報浮動資產卡片載入過久後補上，分兩輪修）**：

第一輪：報價 / 匯率查詢一律用 `asyncio.gather` 平行發起，不逐筆序列 `await`——序列寫法在
Redis 快取未命中時（TTL 過期後第一次載入）會讓 `TwseMisClient` / `YahooFinanceClient` 各自
的自我限速鎖（ADR-0001 ~1 req/2s、ADR-0003 1 req/s）在同一次請求內疊加等待，資產種類/檔數
越多越慢。平行發起後，不同外部來源（台股／美股／貴金屬／匯率）彼此不互等。同時對
`(asset_type, name)` 去重，同一標的分次持有時不重複打外部 API。

第二輪（使用者實測回報「持有多檔不同股票時仍然很慢」）：第一輪的平行化對「同一來源、不同
標的」沒有幫助——`TwseMisClient` 內部的自我限速鎖是同一個 client 實例共用，即使呼叫端同時
發起多個不同股號的查詢，它們還是會被同一個鎖依序放行（每次間隔 ~2 秒），這是刻意保留的行為
（避免對 TWSE 觸發速率限制）。真正的解法是把「查詢方式」本身改成批次：TWSE MIS 的 `ex_ch`
支援用 `|` 分隔多個股號一次查詢（2026-09-18 實測驗證，→ ADR-0001 補充 /
`stock_price_client.py` 模組頂註解），不論持有幾檔股票都只需要最多 2 次外部呼叫（`tse_`
一次、查無資料的再試 `otc_` 一次），而不是 N 次——`→ _fetch_stock_price_map` /
`PricingService.get_stock_prices`。美股／貴金屬持有檔數通常很少，維持第一輪的逐檔平行查詢。

不論哪一輪，都用 `asyncio.gather(..., return_exceptions=True)` 手動找出第一個例外重新拋出，
而非讓 `asyncio.gather` 直接拋——後者在有例外時不會等其他 still-pending 的 task，會留下
「exception never retrieved」的懸置 task。
"""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Awaitable, Sequence
from decimal import ROUND_HALF_UP, Decimal
from typing import Final
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.clients.metal_price_client import MetalSymbol
from app.core.exceptions import AppError
from app.models.financial_asset import FinancialAsset
from app.repositories.account_repository import AccountRepository
from app.repositories.financial_asset_repository import FinancialAssetRepository
from app.repositories.liability_repository import LiabilityRepository
from app.schemas.net_worth import NetWorthAccountItem, NetWorthAssetItem, NetWorthResponse
from app.services.pricing_service import PricingService

logger = logging.getLogger(__name__)

_CENTS: Final[Decimal] = Decimal("0.01")

_METAL_NAME_TO_SYMBOL: Final[dict[str, MetalSymbol]] = {
    "黃金": "XAU",
    "白銀": "XAG",
}

_PERCENT_PLACES: Final[Decimal] = Decimal("0.01")


def _gain_percent(market_value: Decimal, principal_amount: Decimal | None) -> Decimal | None:
    """漲跌幅 = (市值 - 本金) / 本金 * 100；本金為 null（舊資產列，本金功能上線前建立）或
    0 時無法計算，回 None（→ NetWorthAssetItem 註解：None 代表不適用，不是「漲跌 0%」）。
    """
    if principal_amount is None or principal_amount == 0:
        return None
    percent = (market_value - principal_amount) / principal_amount * 100
    return percent.quantize(_PERCENT_PLACES, rounding=ROUND_HALF_UP)


class NetWorthPricingUnavailableError(AppError):
    """彙總淨資產時，計算某項金融資產市值所需的外部報價來源逾時 / 失敗（非本服務崩潰）。"""

    def __init__(self, detail: str = "報價服務暫時無法使用，請稍後再試") -> None:
        super().__init__(
            detail, response_code=424, status_code=424, error_code="NET_WORTH_PRICING_UNAVAILABLE"
        )


class UnsupportedMetalAssetError(AppError):
    """`financial_assets.name` 不在已知貴金屬品項對應表內（資料問題，非外部服務問題）。"""

    def __init__(self, name: str) -> None:
        super().__init__(
            f"不支援的貴金屬品項：{name}",
            response_code=422,
            status_code=422,
            error_code="NET_WORTH_UNSUPPORTED_METAL",
        )


class NetWorthService:
    def __init__(self, db: AsyncSession, pricing_service: PricingService) -> None:
        self._db = db
        self._pricing_service = pricing_service

    async def compute(self, user_uid: UUID) -> NetWorthResponse:
        accounts = await AccountRepository(self._db).list_by_user_uid(user_uid)
        assets = await FinancialAssetRepository(self._db).list_by_user_uid(user_uid)
        liabilities = await LiabilityRepository(self._db).list_by_user_uid(user_uid)

        foreign_currencies = {account.currency for account in accounts if account.currency != "TWD"}
        fx_rates = await self._fetch_fx_rates(foreign_currencies)
        prices = await self._fetch_asset_prices(assets)

        total_assets = Decimal("0")
        account_items: list[NetWorthAccountItem] = []
        for account in accounts:
            if account.currency == "TWD":
                total_assets += account.balance
            else:
                converted = account.balance * fx_rates[account.currency]
                total_assets += converted
                # 前端「帳戶總覽」額外顯示外幣帳戶換算 NT$（使用者回報需求）：只給非 TWD 帳戶，
                # 這裡用未量化的 converted 加總 total_assets（沿用既有精度作法，只在最後量化
                # 一次），但存進 account_items 的是量化到分的顯示值，兩者用途不同不能共用同一份。
                account_items.append(
                    NetWorthAccountItem(
                        account_uid=account.account_uid,
                        converted_balance=converted.quantize(_CENTS, rounding=ROUND_HALF_UP),
                    )
                )

        asset_items: list[NetWorthAssetItem] = []
        for asset in assets:
            price = prices[(asset.asset_type, asset.name)]
            market_value = (asset.base_quantity * price).quantize(_CENTS, rounding=ROUND_HALF_UP)
            total_assets += market_value
            asset_items.append(
                NetWorthAssetItem(
                    financial_asset_uid=asset.financial_asset_uid,
                    asset_type=asset.asset_type,
                    name=asset.name,
                    market_value=market_value,
                    principal_amount=asset.principal_amount,
                    gain_percent=_gain_percent(market_value, asset.principal_amount),
                )
            )

        total_liabilities = sum((liability.amount for liability in liabilities), Decimal("0"))

        total_assets = total_assets.quantize(_CENTS, rounding=ROUND_HALF_UP)
        total_liabilities = total_liabilities.quantize(_CENTS, rounding=ROUND_HALF_UP)
        net_worth = (total_assets - total_liabilities).quantize(_CENTS, rounding=ROUND_HALF_UP)

        return NetWorthResponse(
            total_assets=total_assets,
            total_liabilities=total_liabilities,
            net_worth=net_worth,
            assets=asset_items,
            accounts=account_items,
        )

    async def _fetch_fx_rates(self, currencies: set[str]) -> dict[str, Decimal]:
        """外幣帳戶換算匯率，不同幣別平行查詢（模組頂註解「效能」段）。"""
        ordered = sorted(currencies)
        if not ordered:
            return {}
        results = await asyncio.gather(
            *(
                self._call_pricing(self._pricing_service.get_exchange_rate(currency, "TWD"))
                for currency in ordered
            ),
            return_exceptions=True,
        )
        return dict(zip(ordered, self._unwrap_or_raise(results), strict=True))

    async def _fetch_asset_prices(
        self, assets: Sequence[FinancialAsset]
    ) -> dict[tuple[str, str], Decimal]:
        """浮動資產報價：股票對股號去重後合併成一次批次查詢（→ `_fetch_stock_price_map` /
        `PricingService.get_stock_prices` / ADR-0001 補充）——這是使用者回報「持有多檔不同
        股票時淨資產卡片仍然很慢」的根因：即使個別報價查詢平行發起，`TwseMisClient` 內部的
        自我限速鎖是同一個 client 實例共用，仍會把「同一來源、不同標的」的查詢序列化，只有
        真正合併成一次外部請求才能避開。美股／貴金屬目前持有檔數通常很少（貴金屬固定只有
        XAU/XAG 兩種符號），維持逐檔查詢，但彼此平行、且與股票批次查詢平行（模組頂註解
        「效能」段：不同來源彼此不互等）。
        """
        stock_names = sorted({asset.name for asset in assets if asset.asset_type == "stock"})
        other_keys = sorted(
            {(asset.asset_type, asset.name) for asset in assets if asset.asset_type != "stock"}
        )

        results = await asyncio.gather(
            self._fetch_stock_price_map(stock_names),
            self._fetch_other_price_map(other_keys),
            return_exceptions=True,
        )
        price_map: dict[tuple[str, str], Decimal] = {}
        for result in results:
            if isinstance(result, BaseException):
                raise result
            price_map.update(result)
        return price_map

    async def _fetch_stock_price_map(self, names: Sequence[str]) -> dict[tuple[str, str], Decimal]:
        """不論去重後有幾檔股票，都合併成 `PricingService.get_stock_prices()` 的一次呼叫
        （該方法內部再依快取命中狀況決定要不要真的打外部 API，全部命中快取時完全不呼叫）。
        """
        if not names:
            return {}
        prices = await self._call_pricing(self._pricing_service.get_stock_prices(names))
        return {("stock", name): price for name, price in prices.items()}

    async def _fetch_other_price_map(
        self, keys: Sequence[tuple[str, str]]
    ) -> dict[tuple[str, str], Decimal]:
        """美股／貴金屬逐檔平行查詢（沿用去重 + gather 的既有寫法）。"""
        if not keys:
            return {}
        results = await asyncio.gather(
            *(self._get_unit_price(asset_type, name) for asset_type, name in keys),
            return_exceptions=True,
        )
        return dict(zip(keys, self._unwrap_or_raise(results), strict=True))

    @staticmethod
    def _unwrap_or_raise(results: Sequence[Decimal | BaseException]) -> list[Decimal]:
        """`asyncio.gather(return_exceptions=True)` 的結果攤平：遇到第一個例外就重新拋出
        （模組頂註解說明為何不直接讓 `gather` 拋），確保所有 task 都已被等待、不留懸置例外。
        """
        for result in results:
            if isinstance(result, BaseException):
                raise result
        return [result for result in results if isinstance(result, Decimal)]

    async def _get_unit_price(self, asset_type: str, name: str) -> Decimal:
        """美股／貴金屬單價查詢（股票走 `_fetch_stock_price_map` 的批次路徑，不經此函式）。"""
        if asset_type == "us_stock":
            return await self._call_pricing(self._pricing_service.get_us_stock_price(name))
        symbol = _METAL_NAME_TO_SYMBOL.get(name)
        if symbol is None:
            raise UnsupportedMetalAssetError(name)
        return await self._call_pricing(self._pricing_service.get_metal_price_per_mace(symbol))

    @staticmethod
    async def _call_pricing[T](call: Awaitable[T]) -> T:
        try:
            return await call
        except AppError as e:
            logger.exception("net_worth_pricing_failed")
            raise NetWorthPricingUnavailableError() from e
