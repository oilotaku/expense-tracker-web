"""金融資產 request / response schema：數量一律 Decimal，JSON 序列化為字串（DB-038）。

單位換算的純數學留在 `app.utils.unit_conversion`；本檔只驗證輸入單位是否搭配資產類型
（股票只收「張」/「股」、貴金屬只收「兩」/「錢」）。
"""

from decimal import Decimal
from typing import Literal
from uuid import UUID

from pydantic import Field, field_serializer, model_validator

from app.schemas.base import ApiInput, ApiSchema
from app.utils.unit_conversion import MetalUnit, StockUnit

AssetType = Literal["stock", "metal"]

_VALID_UNITS_BY_TYPE: dict[AssetType, frozenset[str]] = {
    "stock": frozenset({StockUnit.LOT.value, StockUnit.SHARE.value}),
    "metal": frozenset({MetalUnit.TAEL.value, MetalUnit.MACE.value}),
}


def validate_unit_for_asset_type(asset_type: AssetType, unit: str) -> None:
    """確認 `unit` 是 `asset_type` 允許的輸入單位；供 create 的 schema 驗證與 update 端點重用。"""
    allowed = _VALID_UNITS_BY_TYPE[asset_type]
    if unit not in allowed:
        raise ValueError(
            f"{asset_type} 的單位必須為 {sorted(allowed)} 其中之一，收到 {unit!r}"
        )


class FinancialAssetCreateRequest(ApiInput):
    asset_type: AssetType
    name: str = Field(min_length=1, max_length=100)
    input_quantity: Decimal = Field(gt=0, max_digits=18, decimal_places=4)
    input_unit: str = Field(min_length=1, max_length=10)

    @model_validator(mode="after")
    def _validate_unit(self) -> FinancialAssetCreateRequest:
        validate_unit_for_asset_type(self.asset_type, self.input_unit)
        return self


class FinancialAssetUpdateRequest(ApiInput):
    """`asset_type` 建立後不可變更；只能改名稱 / 數量 / 單位。單位是否與既有 `asset_type`
    搭配，因需要既有資料才知道 `asset_type`，改在 API 層（`financial_assets.py`）驗證。
    """

    name: str | None = Field(default=None, min_length=1, max_length=100)
    input_quantity: Decimal | None = Field(default=None, gt=0, max_digits=18, decimal_places=4)
    input_unit: str | None = Field(default=None, min_length=1, max_length=10)


class FinancialAssetResponse(ApiSchema):
    financial_asset_uid: UUID
    asset_type: AssetType
    name: str
    input_quantity: Decimal
    input_unit: str
    base_quantity: Decimal

    @field_serializer("input_quantity", when_used="json")
    def _input_quantity_to_str(self, v: Decimal) -> str:
        return str(v)

    @field_serializer("base_quantity", when_used="json")
    def _base_quantity_to_str(self, v: Decimal) -> str:
        return str(v)


class FinancialAssetListResponse(ApiSchema):
    items: list[FinancialAssetResponse]
    total: int
