"""預算花費彙總 service：即時加總同分類、同期間（依 API_TZ 計算日曆邊界）的支出交易，與上限比較。"""

from app.models.budget import Budget
from app.repositories.budget_repository import BudgetRepository
from app.schemas.budget import BudgetSummaryResponse
from app.utils.datetime import period_bounds_utc


class BudgetService:
    def __init__(self, budget_repo: BudgetRepository) -> None:
        self._budget_repo = budget_repo

    async def get_summary(self, budget: Budget) -> BudgetSummaryResponse:
        date_from, date_to = period_bounds_utc(budget.period_type.value)
        spent_amount = await self._budget_repo.sum_expense_amount(
            budget.user_uid, budget.category_uid, date_from, date_to
        )
        return BudgetSummaryResponse(
            budget_uid=budget.budget_uid,
            category_uid=budget.category_uid,
            period_type=budget.period_type,
            limit_amount=budget.limit_amount,
            spent_amount=spent_amount,
            remaining_amount=budget.limit_amount - spent_amount,
            is_over_budget=spent_amount > budget.limit_amount,
        )
