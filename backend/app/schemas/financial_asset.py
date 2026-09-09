"""金融資產 request / response schema：數量一律 Decimal，JSON 序列化為字串（DB-038）。

單位換算的純數學留在 `app.utils.unit_conversion`；本檔只驗證輸入單位是否搭配資產類型
（台股只收「張」/「股」、美股只收「股」、貴金屬只收「兩」/「錢」）。
"""

import re
from decimal import Decimal
from typing import Literal
from uuid import UUID

from pydantic import Field, field_serializer, model_validator

from app.schemas.base import ApiInput, ApiSchema
from app.utils.unit_conversion import MetalUnit, StockUnit, UsStockUnit

AssetType = Literal["stock", "us_stock", "metal"]

_VALID_UNITS_BY_TYPE: dict[AssetType, frozenset[str]] = {
    "stock": frozenset({StockUnit.LOT.value, StockUnit.SHARE.value}),
    "us_stock": frozenset({UsStockUnit.SHARE.value}),
    "metal": frozenset({MetalUnit.TAEL.value, MetalUnit.MACE.value}),
}

# 台股上市櫃證券代號一律 4-6 位數字（含 ETF，例：2330／0050／00919）；net_worth_service 用這個
# 值直接向 TWSE MIS 查價，收公司中文名（例："聯發科"）會查無報價（→ TwseMisNotFoundError）。
_STOCK_TICKER_RE = re.compile(r"^\d{4,6}$")

# 美股代號：1-5 位大寫英文字母，選配一個「.字母」後綴（例：BRK.B）；不含台股常見的純數字格式，
# 避免兩種市場的代號互相誤填（→ us_stock_price_client 直接拿這個值查 Yahoo Finance）。
_US_STOCK_TICKER_RE = re.compile(r"^[A-Z]{1,5}(\.[A-Z])?$")


def validate_unit_for_asset_type(asset_type: AssetType, unit: str) -> None:
    """確認 `unit` 是 `asset_type` 允許的輸入單位；供 create 的 schema 驗證與 update 端點重用。"""
    allowed = _VALID_UNITS_BY_TYPE[asset_type]
    if unit not in allowed:
        raise ValueError(f"{asset_type} 的單位必須為 {sorted(allowed)} 其中之一，收到 {unit!r}")


def validate_name_for_asset_type(asset_type: AssetType, name: str) -> None:
    """`stock`/`us_stock` 的 `name` 即報價查詢用的證券代號，格式依市場而定；`metal` 無此限制
    （自由品項名）。供 create 的 schema 驗證與 update 端點重用（→ validate_unit_for_asset_type
    同一慣例）。
    """
    if asset_type == "stock" and not _STOCK_TICKER_RE.match(name):
        raise ValueError(f"台股請輸入 4-6 位數字證券代號（例：2330），收到 {name!r}")
    if asset_type == "us_stock" and not _US_STOCK_TICKER_RE.match(name):
        raise ValueError(f"美股請輸入 1-5 位大寫英文字母代號（例：AAPL），收到 {name!r}")


class FinancialAssetCreateRequest(ApiInput):
    asset_type: AssetType
    name: str = Field(min_length=1, max_length=100)
    input_quantity: Decimal = Field(gt=0, max_digits=18, decimal_places=4)
    input_unit: str = Field(min_length=1, max_length=10)
    # 本金（原始購入成本）：新建資產一律要求輸入
    principal_amount: Decimal = Field(gt=0, max_digits=18, decimal_places=2)

    @model_validator(mode="after")
    def _validate_unit(self) -> FinancialAssetCreateRequest:
        validate_unit_for_asset_type(self.asset_type, self.input_unit)
        validate_name_for_asset_type(self.asset_type, self.name)
        return self


class FinancialAssetUpdateRequest(ApiInput):
    """`asset_type` 建立後不可變更；只能改名稱 / 數量 / 單位 / 本金。單位是否與既有 `asset_type`
    搭配，因需要既有資料才知道 `asset_type`，改在 API 層（`financial_assets.py`）驗證。
    """

    name: str | None = Field(default=None, min_length=1, max_length=100)
    input_quantity: Decimal | None = Field(default=None, gt=0, max_digits=18, decimal_places=4)
    input_unit: str | None = Field(default=None, min_length=1, max_length=10)
    principal_amount: Decimal | None = Field(default=None, gt=0, max_digits=18, decimal_places=2)


class FinancialAssetResponse(ApiSchema):
    financial_asset_uid: UUID
    asset_type: AssetType
    name: str
    input_quantity: Decimal
    input_unit: str
    base_quantity: Decimal
    principal_amount: Decimal | None

    @field_serializer("input_quantity", when_used="json")
    def _input_quantity_to_str(self, v: Decimal) -> str:
        return str(v)

    @field_serializer("base_quantity", when_used="json")
    def _base_quantity_to_str(self, v: Decimal) -> str:
        return str(v)

    @field_serializer("principal_amount", when_used="json")
    def _principal_amount_to_str(self, v: Decimal | None) -> str | None:
        return None if v is None else str(v)


class FinancialAssetListResponse(ApiSchema):
    items: list[FinancialAssetResponse]
    total: int
