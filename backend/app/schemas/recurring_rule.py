"""週期性交易規則 request / response schema：金額一律 Decimal（DB-038），日期為每月第幾天
（1–31）。
"""

from decimal import Decimal
from uuid import UUID

from pydantic import Field, field_serializer

from app.models.transaction import TransactionType
from app.schemas.base import ApiInput, ApiSchema


class RecurringRuleCreateRequest(ApiInput):
    account_uid: UUID
    category_uid: UUID
    description: str = Field(min_length=1, max_length=255)
    amount: Decimal = Field(gt=0, max_digits=18, decimal_places=2)
    transaction_type: TransactionType
    payment_method: str = Field(min_length=1, max_length=50)
    day_of_month: int = Field(ge=1, le=31)


class RecurringRuleUpdateRequest(ApiInput):
    account_uid: UUID | None = None
    category_uid: UUID | None = None
    description: str | None = Field(default=None, min_length=1, max_length=255)
    amount: Decimal | None = Field(default=None, gt=0, max_digits=18, decimal_places=2)
    transaction_type: TransactionType | None = None
    payment_method: str | None = Field(default=None, min_length=1, max_length=50)
    day_of_month: int | None = Field(default=None, ge=1, le=31)


class RecurringRuleResponse(ApiSchema):
    recurring_rule_uid: UUID
    account_uid: UUID
    category_uid: UUID
    description: str
    amount: Decimal
    transaction_type: TransactionType
    payment_method: str
    day_of_month: int
    last_generated_year_month: str | None

    @field_serializer("amount", when_used="json")
    def _amount_to_str(self, v: Decimal) -> str:
        return str(v)


class RecurringRuleListResponse(ApiSchema):
    items: list[RecurringRuleResponse]
    total: int
