from collections.abc import Sequence
from datetime import date
from decimal import Decimal
from uuid import UUID

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.recurring_rule import RecurringIntervalUnit, RecurringRule
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
        interval_unit: RecurringIntervalUnit,
        interval_count: int,
        anchor_date: date,
        created_by: UUID,
        liability_uid: UUID | None = None,
    ) -> RecurringRule:
        rule = RecurringRule(
            user_uid=user_uid,
            account_uid=account_uid,
            category_uid=category_uid,
            description=description,
            amount=amount,
            transaction_type=transaction_type,
            payment_method=payment_method,
            interval_unit=interval_unit,
            interval_count=interval_count,
            anchor_date=anchor_date,
            created_by=created_by,
            updated_by=created_by,
            liability_uid=liability_uid,
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
        interval_unit: RecurringIntervalUnit | None,
        interval_count: int | None,
        anchor_date: date | None,
        updated_by: UUID,
        liability_uid: UUID | None = None,
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
        if interval_unit is not None:
            rule.interval_unit = interval_unit
        if interval_count is not None:
            rule.interval_count = interval_count
        if anchor_date is not None:
            rule.anchor_date = anchor_date
        if liability_uid is not None:
            rule.liability_uid = liability_uid
        rule.updated_by = updated_by
        await self.db.flush()
        return rule

    async def soft_delete(self, rule: RecurringRule, deleted_by: UUID) -> None:
        rule.is_deleted = True
        rule.updated_by = deleted_by
        await self.db.flush()

    async def soft_delete_by_liability_uid(self, liability_uid: UUID, deleted_by: UUID) -> None:
        """負債刪除時連動軟刪其還款規則，避免規則失去對應負債後仍繼續嘗試產生交易。"""
        stmt = select(RecurringRule).where(
            RecurringRule.liability_uid == liability_uid, RecurringRule.is_deleted.is_(False)
        )
        rules = (await self.db.execute(stmt)).scalars().all()
        for rule in rules:
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
