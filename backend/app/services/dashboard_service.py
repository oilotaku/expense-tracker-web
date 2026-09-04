"""Dashboard 期間彙總 service：income/expense 用一次 SQL `GROUP BY transaction_type` 加總

（→ BE-095，避免抓全部交易到 app 層再加總）。`budget_remaining` 沿用
`BudgetService.get_summary`（`app/services/budget_service.py`）「同分類同期間已花費」的計算邏輯，
但改寫成單一 SQL（相關子查詢逐筆算 `limit_amount - spent`，DB 端一次 `SUM` 加總），
避免對 `BudgetRepository` 逐筆呼叫造成的迴圈式 N+1（→ BE-095 / BE-089）。
"""

from datetime import datetime
from decimal import Decimal
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.budget import Budget, BudgetPeriodType
from app.models.transaction import Transaction, TransactionType
from app.schemas.dashboard import DashboardSummaryResponse

_CENTS = Decimal("0.01")


class DashboardService:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    async def get_summary(
        self, user_uid: UUID, period: str, date_from: datetime, date_to: datetime
    ) -> DashboardSummaryResponse:
        income, expense = await self._sum_income_expense(user_uid, date_from, date_to)
        balance = (income - expense).quantize(_CENTS)
        budget_remaining = (
            await self._sum_budget_remaining(user_uid, date_from, date_to)
            if period == "month"
            else None
        )
        return DashboardSummaryResponse(
            period=period,
            date_from=date_from,
            date_to=date_to,
            income=income,
            expense=expense,
            balance=balance,
            budget_remaining=budget_remaining,
        )

    async def _sum_income_expense(
        self, user_uid: UUID, date_from: datetime, date_to: datetime
    ) -> tuple[Decimal, Decimal]:
        stmt = (
            select(Transaction.transaction_type, func.coalesce(func.sum(Transaction.amount), 0))
            .where(
                Transaction.user_uid == user_uid,
                Transaction.is_deleted.is_(False),
                Transaction.transaction_date >= date_from,
                Transaction.transaction_date <= date_to,
            )
            .group_by(Transaction.transaction_type)
        )
        rows = (await self._db.execute(stmt)).all()
        totals = {row[0]: Decimal(row[1]).quantize(_CENTS) for row in rows}
        income = totals.get(TransactionType.INCOME, Decimal("0.00"))
        expense = totals.get(TransactionType.EXPENSE, Decimal("0.00"))
        return income, expense

    async def _sum_budget_remaining(
        self, user_uid: UUID, date_from: datetime, date_to: datetime
    ) -> Decimal:
        spent = (
            select(func.coalesce(func.sum(Transaction.amount), 0))
            .where(
                Transaction.user_uid == Budget.user_uid,
                Transaction.category_uid == Budget.category_uid,
                Transaction.transaction_type == TransactionType.EXPENSE,
                Transaction.is_deleted.is_(False),
                Transaction.transaction_date >= date_from,
                Transaction.transaction_date <= date_to,
            )
            .correlate(Budget)
            .scalar_subquery()
        )
        stmt = select(func.coalesce(func.sum(Budget.limit_amount - spent), 0)).where(
            Budget.user_uid == user_uid,
            Budget.period_type == BudgetPeriodType.MONTHLY,
            Budget.is_deleted.is_(False),
        )
        total = Decimal((await self._db.execute(stmt)).scalar_one())
        return total.quantize(_CENTS)
