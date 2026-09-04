"""淨資產彙總 response schema：金額一律 Decimal，JSON 序列化為字串（DB-038）。"""

from decimal import Decimal

from pydantic import field_serializer

from app.schemas.base import ApiSchema


class NetWorthResponse(ApiSchema):
    total_assets: Decimal
    total_liabilities: Decimal
    net_worth: Decimal

    @field_serializer("total_assets", when_used="json")
    def _total_assets_to_str(self, v: Decimal) -> str:
        return str(v)

    @field_serializer("total_liabilities", when_used="json")
    def _total_liabilities_to_str(self, v: Decimal) -> str:
        return str(v)

    @field_serializer("net_worth", when_used="json")
    def _net_worth_to_str(self, v: Decimal) -> str:
        return str(v)
