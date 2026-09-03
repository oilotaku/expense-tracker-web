"""帳戶（Account）request / response schema：金額一律 Decimal，JSON 序列化為字串（DB-038）。"""

from decimal import Decimal
from uuid import UUID

from pydantic import Field, field_serializer

from app.schemas.base import ApiInput, ApiSchema


class AccountCreateRequest(ApiInput):
    name: str = Field(min_length=1, max_length=100)
    balance: Decimal = Field(max_digits=18, decimal_places=2)


class AccountUpdateRequest(ApiInput):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    balance: Decimal | None = Field(default=None, max_digits=18, decimal_places=2)


class AccountResponse(ApiSchema):
    account_uid: UUID
    name: str
    balance: Decimal
    currency: str

    @field_serializer("balance", when_used="json")
    def _balance_to_str(self, v: Decimal) -> str:
        return str(v)


class AccountListResponse(ApiSchema):
    items: list[AccountResponse]
    total: int
