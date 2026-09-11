"""週期性交易規則 request / response schema：金額一律 Decimal（DB-038）；週期由 `anchor_date` +
`interval_unit` + `interval_count` 描述（design-spec §12.3），取代舊版單一 `day_of_month`。
"""

from datetime import date
from decimal import Decimal
from uuid import UUID

from pydantic import Field, field_serializer

from app.models.recurring_rule import RecurringIntervalUnit
from app.models.transaction import TransactionType
from app.schemas.base import ApiInput, ApiSchema


class RecurringRuleCreateRequest(ApiInput):
    account_uid: UUID
    category_uid: UUID
    description: str = Field(max_length=255)
    amount: Decimal = Field(gt=0, max_digits=18, decimal_places=2)
    transaction_type: TransactionType
    payment_method: str = Field(max_length=50)
    interval_unit: RecurringIntervalUnit = Field(
        default=RecurringIntervalUnit.MONTH, description="週期單位：week/month/year"
    )
    interval_count: int = Field(default=1, ge=1, le=99, description="每幾個 interval_unit 觸發一次")
    anchor_date: date = Field(description="錨點日期，下一次執行日由此起算")
    liability_uid: UUID | None = Field(
        default=None, description="連結負債定期還款；設定時 transaction_type 必須是 expense"
    )


class RecurringRuleUpdateRequest(ApiInput):
    account_uid: UUID | None = None
    category_uid: UUID | None = None
    description: str | None = Field(default=None, max_length=255)
    amount: Decimal | None = Field(default=None, gt=0, max_digits=18, decimal_places=2)
    transaction_type: TransactionType | None = None
    payment_method: str | None = Field(default=None, max_length=50)
    interval_unit: RecurringIntervalUnit | None = Field(
        default=None, description="週期單位：week/month/year"
    )
    interval_count: int | None = Field(
        default=None, ge=1, le=99, description="每幾個 interval_unit 觸發一次"
    )
    anchor_date: date | None = Field(default=None, description="錨點日期，下一次執行日由此起算")
    liability_uid: UUID | None = Field(
        default=None, description="連結負債定期還款；設定時 transaction_type 必須是 expense"
    )
    is_active: bool | None = Field(default=None, description="暫停（false）/恢復（true）此規則")


class RecurringRuleResponse(ApiSchema):
    recurring_rule_uid: UUID
    account_uid: UUID
    category_uid: UUID
    description: str
    amount: Decimal
    transaction_type: TransactionType
    payment_method: str
    interval_unit: RecurringIntervalUnit
    interval_count: int
    anchor_date: date
    last_generated_year_month: str | None
    liability_uid: UUID | None
    is_active: bool

    @field_serializer("amount", when_used="json")
    def _amount_to_str(self, v: Decimal) -> str:
        return str(v)


class RecurringRuleListResponse(ApiSchema):
    items: list[RecurringRuleResponse]
    total: int
