"""淨資產彙總 response schema：金額一律 Decimal，JSON 序列化為字串（DB-038）。"""

from decimal import Decimal
from uuid import UUID

from pydantic import field_serializer

from app.schemas.base import ApiSchema
from app.schemas.financial_asset import AssetType


class NetWorthAssetItem(ApiSchema):
    """單筆金融資產的即時市值與漲跌幅：`gain_percent` 需要 `principal_amount`（本金）才能算，
    舊資產列若本金為 null 則回 None（前端不顯示漲跌幅，非 0%，區分「不適用」與「真的沒漲跌」）。
    """

    financial_asset_uid: UUID
    asset_type: AssetType
    name: str
    market_value: Decimal
    principal_amount: Decimal | None
    gain_percent: Decimal | None

    @field_serializer("market_value", when_used="json")
    def _market_value_to_str(self, v: Decimal) -> str:
        return str(v)

    @field_serializer("principal_amount", when_used="json")
    def _principal_amount_to_str(self, v: Decimal | None) -> str | None:
        return None if v is None else str(v)

    @field_serializer("gain_percent", when_used="json")
    def _gain_percent_to_str(self, v: Decimal | None) -> str | None:
        return None if v is None else str(v)


class NetWorthResponse(ApiSchema):
    total_assets: Decimal
    total_liabilities: Decimal
    net_worth: Decimal
    assets: list[NetWorthAssetItem]

    @field_serializer("total_assets", when_used="json")
    def _total_assets_to_str(self, v: Decimal) -> str:
        return str(v)

    @field_serializer("total_liabilities", when_used="json")
    def _total_liabilities_to_str(self, v: Decimal) -> str:
        return str(v)

    @field_serializer("net_worth", when_used="json")
    def _net_worth_to_str(self, v: Decimal) -> str:
        return str(v)
