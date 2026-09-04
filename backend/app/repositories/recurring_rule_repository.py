from collections.abc import Sequence
from decimal import Decimal
from uuid import UUID

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.recurring_rule import RecurringRule
from app.models.transaction import TransactionType


class RecurringRuleRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def create(
        self,
        *,
        user_uid: UUID,
        account_uid: UUID,
        category_uid: UUID,
        description: str,
        amount: Decimal,
        transaction_type: TransactionType,
        payment_method: str,
        day_of_month: int,
        created_by: UUID,
    ) -> RecurringRule:
        rule = RecurringRule(
            user_uid=user_uid,
            account_uid=account_uid,
            category_uid=category_uid,
            description=description,
            amount=amount,
            transaction_type=transaction_type,
            payment_method=payment_method,
            day_of_month=day_of_month,
            created_by=created_by,
            updated_by=created_by,
        )
        self.db.add(rule)
        await self.db.flush()
        return rule

    async def list_by_user_uid(self, user_uid: UUID) -> Sequence[RecurringRule]:
        stmt = (
            select(RecurringRule)
            .where(RecurringRule.user_uid == user_uid, RecurringRule.is_deleted.is_(False))
            .order_by(RecurringRule.created_at)
        )
        return (await self.db.execute(stmt)).scalars().all()

    async def find_by_recurring_rule_uid(
        self, recurring_rule_uid: UUID, user_uid: UUID
    ) -> RecurringRule | None:
        stmt = select(RecurringRule).where(
            RecurringRule.recurring_rule_uid == recurring_rule_uid,
            RecurringRule.user_uid == user_uid,
            RecurringRule.is_deleted.is_(False),
        )
        return (await self.db.execute(stmt)).scalar_one_or_none()

    async def update_fields(
        self,
        rule: RecurringRule,
        *,
        account_uid: UUID | None,
        category_uid: UUID | None,
        description: str | None,
        amount: Decimal | None,
        transaction_type: TransactionType | None,
        payment_method: str | None,
        day_of_month: int | None,
        updated_by: UUID,
    ) -> RecurringRule:
        if account_uid is not None:
            rule.account_uid = account_uid
        if category_uid is not None:
            rule.category_uid = category_uid
        if description is not None:
            rule.description = description
        if amount is not None:
            rule.amount = amount
        if transaction_type is not None:
            rule.transaction_type = transaction_type
        if payment_method is not None:
            rule.payment_method = payment_method
        if day_of_month is not None:
            rule.day_of_month = day_of_month
        rule.updated_by = updated_by
        await self.db.flush()
        return rule

    async def soft_delete(self, rule: RecurringRule, deleted_by: UUID) -> None:
        rule.is_deleted = True
        rule.updated_by = deleted_by
        await self.db.flush()

    async def list_pending_for_year_month(self, year_month: str) -> Sequence[RecurringRule]:
        """回傳尚未於該年月產生過交易的規則（含從未產生過）；是否到期（含月底夾日）交給呼叫端判斷。"""
        stmt = select(RecurringRule).where(
            RecurringRule.is_deleted.is_(False),
            or_(
                RecurringRule.last_generated_year_month.is_(None),
                RecurringRule.last_generated_year_month != year_month,
            ),
        )
        return (await self.db.execute(stmt)).scalars().all()
