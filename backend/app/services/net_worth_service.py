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
"""

from __future__ import annotations

import logging
from collections.abc import Awaitable
from decimal import ROUND_HALF_UP, Decimal
from typing import Final
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.clients.metal_price_client import MetalSymbol
from app.core.exceptions import AppError
from app.repositories.account_repository import AccountRepository
from app.repositories.financial_asset_repository import FinancialAssetRepository
from app.repositories.liability_repository import LiabilityRepository
from app.schemas.net_worth import NetWorthAssetItem, NetWorthResponse
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

        total_assets = Decimal("0")
        for account in accounts:
            if account.currency == "TWD":
                total_assets += account.balance
            else:
                rate = await self._call_pricing(
                    self._pricing_service.get_exchange_rate(account.currency, "TWD")
                )
                total_assets += account.balance * rate
        asset_items: list[NetWorthAssetItem] = []
        for asset in assets:
            price = await self._get_unit_price(asset.asset_type, asset.name)
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
        )

    async def _get_unit_price(self, asset_type: str, name: str) -> Decimal:
        if asset_type == "stock":
            return await self._call_pricing(self._pricing_service.get_stock_price(name))
        if asset_type == "us_stock":
            return await self._call_pricing(self._pricing_service.get_us_stock_price(name))
        symbol = _METAL_NAME_TO_SYMBOL.get(name)
        if symbol is None:
            raise UnsupportedMetalAssetError(name)
        return await self._call_pricing(self._pricing_service.get_metal_price_per_mace(symbol))

    @staticmethod
    async def _call_pricing(call: Awaitable[Decimal]) -> Decimal:
        try:
            return await call
        except AppError as e:
            logger.exception("net_worth_pricing_failed")
            raise NetWorthPricingUnavailableError() from e
