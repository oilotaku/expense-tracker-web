"""預算 CRUD 與花費彙總 schema。

金額一律 Decimal（DB-038），期間邊界依 API_TZ 計算（→ CORE-041）。
"""

from decimal import Decimal
from uuid import UUID

from pydantic import Field, field_serializer

from app.models.budget import BudgetPeriodType
from app.schemas.base import ApiInput, ApiSchema


class BudgetCreateRequest(ApiInput):
    category_uid: UUID
    period_type: BudgetPeriodType
    limit_amount: Decimal = Field(gt=0, max_digits=18, decimal_places=2)


class BudgetUpdateRequest(ApiInput):
    limit_amount: Decimal = Field(gt=0, max_digits=18, decimal_places=2)


class BudgetResponse(ApiSchema):
    budget_uid: UUID
    category_uid: UUID
    period_type: BudgetPeriodType
    limit_amount: Decimal

    @field_serializer("limit_amount", when_used="json")
    def _limit_amount_to_str(self, v: Decimal) -> str:
        return str(v)


class BudgetListResponse(ApiSchema):
    items: list[BudgetResponse]
    total: int


class BudgetSummaryResponse(ApiSchema):
    budget_uid: UUID
    category_uid: UUID
    period_type: BudgetPeriodType
    limit_amount: Decimal
    spent_amount: Decimal
    remaining_amount: Decimal
    is_over_budget: bool

    @field_serializer("limit_amount", "spent_amount", "remaining_amount", when_used="json")
    def _amounts_to_str(self, v: Decimal) -> str:
        return str(v)
