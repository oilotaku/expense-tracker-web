"""後台管理查詢：跨 User/Account/Transaction 幾個 domain，屬於「admin」這個獨立 bounded
context（→ app/schemas/admin.py），不放進各自的 domain repository（AccountRepository 等
刻意不 import 其他 domain 的 model，維持單一職責）。
"""

from collections.abc import Sequence
from datetime import UTC, datetime
from typing import Any, cast
from uuid import UUID

from sqlalchemy import CursorResult, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.account import Account
from app.models.transaction import Transaction
from app.models.user import User, UserCredential


class AdminRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def list_users(self, *, limit: int = 50, offset: int = 0) -> tuple[list[User], int]:
        base = select(User).where(User.is_deleted.is_(False))
        total = (
            await self.db.execute(select(func.count()).select_from(base.subquery()))
        ).scalar_one()
        stmt = base.order_by(User.created_at.desc(), User.uid.desc()).limit(limit).offset(offset)
        items = list((await self.db.execute(stmt)).scalars().all())
        return items, total

    async def count_accounts_by_user_uids(self, user_uids: Sequence[UUID]) -> dict[UUID, int]:
        """單次 GROUP BY 批次撈整頁使用者的帳戶數，避免對每個使用者各發一次查詢造成 N+1
        （→ backend/app/api/v1/transactions.py 今天才修過同一種問題）。"""
        if not user_uids:
            return {}
        stmt = (
            select(Account.user_uid, func.count().label("row_count"))
            .where(Account.user_uid.in_(user_uids), Account.is_deleted.is_(False))
            .group_by(Account.user_uid)
        )
        return {row.user_uid: row.row_count for row in await self.db.execute(stmt)}

    async def count_transactions_by_user_uids(self, user_uids: Sequence[UUID]) -> dict[UUID, int]:
        if not user_uids:
            return {}
        stmt = (
            select(Transaction.user_uid, func.count().label("row_count"))
            .where(Transaction.user_uid.in_(user_uids), Transaction.is_deleted.is_(False))
            .group_by(Transaction.user_uid)
        )
        return {row.user_uid: row.row_count for row in await self.db.execute(stmt)}

    async def soft_delete_user(self, user_uid: UUID, admin_user_uid: UUID) -> bool:
        """軟刪 User + UserCredential（比照全站既有慣例，禁硬刪，→ DB-033）；子資料
        （帳戶/交易/固定收支等）不連動軟刪——使用者一旦被軟刪，`get_current_user` 的
        `is_deleted` 檢查就會直接擋掉所有後續請求，子資料自然無法再被存取到，效果等同
        「不可見」，不需要逐表連動（→ 同 liability 軟刪只連動 recurring_rule 的既有慣例，
        不往下鑽到已產生的 transaction）。"""
        now = datetime.now(UTC)
        user_result = await self.db.execute(
            update(User)
            .where(User.user_uid == user_uid, User.is_deleted.is_(False))
            .values(is_deleted=True, updated_at=now, updated_by=admin_user_uid)
        )
        if cast(CursorResult[Any], user_result).rowcount == 0:
            return False
        await self.db.execute(
            update(UserCredential)
            .where(UserCredential.user_uid == user_uid, UserCredential.is_deleted.is_(False))
            .values(is_deleted=True, updated_at=now, updated_by=admin_user_uid)
        )
        await self.db.flush()
        return True
