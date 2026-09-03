from collections.abc import Sequence
from datetime import datetime
from decimal import Decimal
from uuid import UUID

from sqlalchemy import delete, func, insert, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.tag import Tag
from app.models.transaction import Transaction, TransactionType, transaction_tags


class TransactionRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def create(
        self,
        *,
        user_uid: UUID,
        account_uid: UUID,
        category_uid: UUID,
        transaction_date: datetime,
        description: str,
        amount: Decimal,
        transaction_type: TransactionType,
        payment_method: str,
        tag_names: list[str],
        created_by: UUID,
    ) -> tuple[Transaction, list[Tag]]:
        transaction = Transaction(
            user_uid=user_uid,
            account_uid=account_uid,
            category_uid=category_uid,
            transaction_date=transaction_date,
            description=description,
            amount=amount,
            transaction_type=transaction_type,
            payment_method=payment_method,
            created_by=created_by,
            updated_by=created_by,
        )
        self.db.add(transaction)
        await self.db.flush()
        tags = await self._get_or_create_tags(user_uid, tag_names, created_by)
        await self._replace_tags(transaction.transaction_uid, tags)
        return transaction, tags

    async def list_by_user_uid(
        self,
        user_uid: UUID,
        *,
        category_uid: UUID | None = None,
        date_from: datetime | None = None,
        date_to: datetime | None = None,
        limit: int = 20,
        offset: int = 0,
    ) -> tuple[list[Transaction], int]:
        base = select(Transaction).where(
            Transaction.user_uid == user_uid, Transaction.is_deleted.is_(False)
        )
        if category_uid is not None:
            base = base.where(Transaction.category_uid == category_uid)
        if date_from is not None:
            base = base.where(Transaction.transaction_date >= date_from)
        if date_to is not None:
            base = base.where(Transaction.transaction_date <= date_to)

        total = (
            await self.db.execute(select(func.count()).select_from(base.subquery()))
        ).scalar_one()
        stmt = (
            base.order_by(Transaction.transaction_date.desc(), Transaction.uid.desc())
            .limit(limit)
            .offset(offset)
        )
        items = list((await self.db.execute(stmt)).scalars().all())
        return items, total

    async def find_by_transaction_uid(
        self, transaction_uid: UUID, user_uid: UUID
    ) -> Transaction | None:
        stmt = select(Transaction).where(
            Transaction.transaction_uid == transaction_uid,
            Transaction.user_uid == user_uid,
            Transaction.is_deleted.is_(False),
        )
        return (await self.db.execute(stmt)).scalar_one_or_none()

    async def list_tags_for_transaction_uid(self, transaction_uid: UUID) -> Sequence[Tag]:
        stmt = (
            select(Tag)
            .join(transaction_tags, transaction_tags.c.tag_uid == Tag.tag_uid)
            .where(
                transaction_tags.c.transaction_uid == transaction_uid,
                Tag.is_deleted.is_(False),
            )
            .order_by(Tag.name)
        )
        return (await self.db.execute(stmt)).scalars().all()

    async def update_fields(
        self,
        transaction: Transaction,
        *,
        account_uid: UUID | None,
        category_uid: UUID | None,
        transaction_date: datetime | None,
        description: str | None,
        amount: Decimal | None,
        transaction_type: TransactionType | None,
        payment_method: str | None,
        tag_names: list[str] | None,
        updated_by: UUID,
    ) -> tuple[Transaction, Sequence[Tag]]:
        if account_uid is not None:
            transaction.account_uid = account_uid
        if category_uid is not None:
            transaction.category_uid = category_uid
        if transaction_date is not None:
            transaction.transaction_date = transaction_date
        if description is not None:
            transaction.description = description
        if amount is not None:
            transaction.amount = amount
        if transaction_type is not None:
            transaction.transaction_type = transaction_type
        if payment_method is not None:
            transaction.payment_method = payment_method
        transaction.updated_by = updated_by

        if tag_names is not None:
            new_tags = await self._get_or_create_tags(transaction.user_uid, tag_names, updated_by)
            await self._replace_tags(transaction.transaction_uid, new_tags)

        await self.db.flush()
        tags = await self.list_tags_for_transaction_uid(transaction.transaction_uid)
        return transaction, tags

    async def soft_delete(self, transaction: Transaction, deleted_by: UUID) -> None:
        transaction.is_deleted = True
        transaction.updated_by = deleted_by
        await self.db.flush()

    async def _get_or_create_tags(
        self, user_uid: UUID, names: list[str], created_by: UUID
    ) -> list[Tag]:
        if not names:
            return []
        stmt = select(Tag).where(
            Tag.user_uid == user_uid, Tag.name.in_(names), Tag.is_deleted.is_(False)
        )
        existing = list((await self.db.execute(stmt)).scalars().all())
        existing_names = {t.name for t in existing}
        missing_names = [n for n in names if n not in existing_names]

        new_tags = [
            Tag(user_uid=user_uid, name=name, created_by=created_by, updated_by=created_by)
            for name in missing_names
        ]
        for tag in new_tags:
            self.db.add(tag)
        if new_tags:
            await self.db.flush()
        return existing + new_tags

    async def _replace_tags(self, transaction_uid: UUID, tags: list[Tag]) -> None:
        await self.db.execute(
            delete(transaction_tags).where(transaction_tags.c.transaction_uid == transaction_uid)
        )
        if tags:
            await self.db.execute(
                insert(transaction_tags),
                [{"transaction_uid": transaction_uid, "tag_uid": tag.tag_uid} for tag in tags],
            )
