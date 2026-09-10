from collections.abc import Sequence
from decimal import Decimal
from typing import Any, cast
from uuid import UUID

from sqlalchemy import CursorResult, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.liability import Liability


class LiabilityRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def create(
        self,
        user_uid: UUID,
        name: str,
        amount: Decimal,
        interest_rate: Decimal | None,
        created_by: UUID,
    ) -> Liability:
        liability = Liability(
            user_uid=user_uid,
            name=name,
            amount=amount,
            interest_rate=interest_rate,
            created_by=created_by,
            updated_by=created_by,
        )
        self.db.add(liability)
        await self.db.flush()
        return liability

    async def list_by_user_uid(self, user_uid: UUID) -> Sequence[Liability]:
        stmt = (
            select(Liability)
            .where(Liability.user_uid == user_uid, Liability.is_deleted.is_(False))
            .order_by(Liability.created_at)
        )
        return (await self.db.execute(stmt)).scalars().all()

    async def find_by_liability_uid(self, liability_uid: UUID, user_uid: UUID) -> Liability | None:
        # 同時以 user_uid 收斂：非本人的負債視同不存在（回 404，不洩漏存在性）
        stmt = select(Liability).where(
            Liability.liability_uid == liability_uid,
            Liability.user_uid == user_uid,
            Liability.is_deleted.is_(False),
        )
        return (await self.db.execute(stmt)).scalar_one_or_none()

    async def get_for_update(self, liability_uid: UUID) -> Liability | None:
        """定期還款產生交易時鎖列讀取，避免同一負債被併發扣款算出錯誤餘額。"""
        stmt = (
            select(Liability)
            .where(Liability.liability_uid == liability_uid, Liability.is_deleted.is_(False))
            .with_for_update()
        )
        return (await self.db.execute(stmt)).scalar_one_or_none()

    async def apply_repayment(
        self, liability: Liability, payment: Decimal, updated_by: UUID
    ) -> bool:
        """套用一筆還款金額；呼叫端保證 `0 < payment <= liability.amount`。

        還清（`payment == liability.amount`）時軟刪負債（`amount` 欄位 `gt=0` 不可設為 0，
        比照既有手動還款 UI 慣例：全部還清改用刪除）。回傳是否已還清。
        """
        paid_off = payment == liability.amount
        if paid_off:
            liability.is_deleted = True
        else:
            liability.amount -= payment
        liability.updated_by = updated_by
        await self.db.flush()
        return paid_off

    async def update_fields(
        self,
        liability: Liability,
        *,
        name: str | None,
        amount: Decimal | None,
        interest_rate: Decimal | None,
        updated_by: UUID,
    ) -> Liability:
        if name is not None:
            liability.name = name
        if amount is not None:
            liability.amount = amount
        # 限制：一旦設定利率，PATCH 目前無法將其清回 None（與 balance 同樣的部分更新語意）；
        # 如需要明確清除，之後另開 endpoint 或改用 sentinel 區分「未帶欄位」與「帶 null」。
        if interest_rate is not None:
            liability.interest_rate = interest_rate
        liability.updated_by = updated_by
        await self.db.flush()
        return liability

    async def soft_delete(self, liability_uid: UUID, user_uid: UUID) -> bool:
        result = await self.db.execute(
            update(Liability)
            .where(
                Liability.liability_uid == liability_uid,
                Liability.user_uid == user_uid,
                Liability.is_deleted.is_(False),
            )
            .values(is_deleted=True, updated_at=func.now(), updated_by=user_uid)
        )
        # CursorResult 帶 rowcount；execute() 對非 Select 的公開型別是 Result[Any]（SQLAlchemy
        # 自身 stub 如此），此處只收斂到有 rowcount 的子類，不影響其餘查詢的型別安全
        return cast(CursorResult[Any], result).rowcount > 0
