from datetime import datetime
from decimal import Decimal
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.budget import Budget, BudgetPeriodType
from app.models.transaction import Transaction, TransactionType


class BudgetRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def list_by_user_uid(
        self, user_uid: UUID, *, limit: int = 20, offset: int = 0
    ) -> tuple[list[Budget], int]:
        base = select(Budget).where(Budget.user_uid == user_uid, Budget.is_deleted.is_(False))
        total = (
            await self.db.execute(select(func.count()).select_from(base.subquery()))
        ).scalar_one()
        stmt = (
            base.order_by(Budget.created_at.desc(), Budget.uid.desc()).limit(limit).offset(offset)
        )
        items = list((await self.db.execute(stmt)).scalars().all())
        return items, total

    async def find_by_budget_uid(self, user_uid: UUID, budget_uid: UUID) -> Budget | None:
        stmt = select(Budget).where(
            Budget.budget_uid == budget_uid,
            Budget.user_uid == user_uid,
            Budget.is_deleted.is_(False),
        )
        return (await self.db.execute(stmt)).scalar_one_or_none()

    async def create(
        self,
        user_uid: UUID,
        category_uid: UUID,
        period_type: BudgetPeriodType,
        limit_amount: Decimal,
    ) -> Budget:
        budget = Budget(
            user_uid=user_uid,
            category_uid=category_uid,
            period_type=period_type,
            limit_amount=limit_amount,
        )
        self.db.add(budget)
        await self.db.flush()
        return budget

    async def update_limit_amount(self, budget: Budget, limit_amount: Decimal) -> Budget:
        budget.limit_amount = limit_amount
        await self.db.flush()
        return budget

    async def soft_delete(self, budget: Budget) -> None:
        budget.is_deleted = True
        await self.db.flush()

    async def sum_expense_amount(
        self, user_uid: UUID, category_uid: UUID, date_from: datetime, date_to: datetime
    ) -> Decimal:
        """加總同使用者、同分類、`[date_from, date_to)` 半開區間內的支出交易金額。"""
        stmt = select(func.coalesce(func.sum(Transaction.amount), 0)).where(
            Transaction.user_uid == user_uid,
            Transaction.category_uid == category_uid,
            Transaction.transaction_type == TransactionType.EXPENSE,
            Transaction.is_deleted.is_(False),
            Transaction.transaction_date >= date_from,
            Transaction.transaction_date < date_to,
        )
        total = Decimal((await self.db.execute(stmt)).scalar_one())
        return total.quantize(Decimal("0.01"))
