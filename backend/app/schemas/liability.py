"""負債 request / response schema：金額 / 利率一律 Decimal，JSON 序列化為字串（DB-038）。"""

from decimal import Decimal
from uuid import UUID

from pydantic import Field, field_serializer

from app.schemas.base import ApiInput, ApiSchema


class LiabilityCreateRequest(ApiInput):
    name: str = Field(min_length=1, max_length=255)
    amount: Decimal = Field(gt=0, max_digits=18, decimal_places=2)
    interest_rate: Decimal | None = Field(default=None, ge=0, max_digits=5, decimal_places=2)


class LiabilityUpdateRequest(ApiInput):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    amount: Decimal | None = Field(default=None, gt=0, max_digits=18, decimal_places=2)
    interest_rate: Decimal | None = Field(default=None, ge=0, max_digits=5, decimal_places=2)


class LiabilityResponse(ApiSchema):
    liability_uid: UUID
    name: str
    amount: Decimal
    interest_rate: Decimal | None

    @field_serializer("amount", when_used="json")
    def _amount_to_str(self, v: Decimal) -> str:
        return str(v)

    @field_serializer("interest_rate", when_used="json")
    def _interest_rate_to_str(self, v: Decimal | None) -> str | None:
        return str(v) if v is not None else None


class LiabilityListResponse(ApiSchema):
    items: list[LiabilityResponse]
    total: int
