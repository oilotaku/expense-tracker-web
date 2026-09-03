from collections.abc import Sequence
from decimal import Decimal
from typing import Any, cast
from uuid import UUID

from sqlalchemy import func, select, update
from sqlalchemy.engine import CursorResult
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.account import Account


class AccountRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def create(
        self, user_uid: UUID, name: str, balance: Decimal, created_by: UUID
    ) -> Account:
        account = Account(
            user_uid=user_uid,
            name=name,
            balance=balance,
            created_by=created_by,
            updated_by=created_by,
        )
        self.db.add(account)
        await self.db.flush()
        return account

    async def list_by_user_uid(self, user_uid: UUID) -> Sequence[Account]:
        stmt = (
            select(Account)
            .where(Account.user_uid == user_uid, Account.is_deleted.is_(False))
            .order_by(Account.created_at)
        )
        return (await self.db.execute(stmt)).scalars().all()

    async def find_by_account_uid(self, account_uid: UUID, user_uid: UUID) -> Account | None:
        # 同時以 user_uid 收斂：非本人的帳戶視同不存在（回 404，不洩漏存在性）
        stmt = select(Account).where(
            Account.account_uid == account_uid,
            Account.user_uid == user_uid,
            Account.is_deleted.is_(False),
        )
        return (await self.db.execute(stmt)).scalar_one_or_none()

    async def update_fields(
        self,
        account: Account,
        *,
        name: str | None,
        balance: Decimal | None,
        updated_by: UUID,
    ) -> Account:
        if name is not None:
            account.name = name
        if balance is not None:
            account.balance = balance
        account.updated_by = updated_by
        await self.db.flush()
        return account

    async def soft_delete(self, account_uid: UUID, user_uid: UUID) -> bool:
        result = await self.db.execute(
            update(Account)
            .where(
                Account.account_uid == account_uid,
                Account.user_uid == user_uid,
                Account.is_deleted.is_(False),
            )
            .values(is_deleted=True, updated_at=func.now(), updated_by=user_uid)
        )
        # CursorResult 帶 rowcount；execute() 對非 Select 的公開型別是 Result[Any]（SQLAlchemy
        # 自身 stub 如此），此處只收斂到有 rowcount 的子類，不影響其餘查詢的型別安全
        return cast(CursorResult[Any], result).rowcount > 0
