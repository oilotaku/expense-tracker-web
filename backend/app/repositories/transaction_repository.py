from collections.abc import Sequence
from datetime import datetime
from decimal import Decimal
from uuid import UUID, uuid4

from sqlalchemy import delete, func, insert, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.account import Account
from app.models.tag import Tag
from app.models.transaction import Transaction, TransactionType, TransferDirection, transaction_tags


def _signed_delta(
    amount: Decimal,
    transaction_type: TransactionType,
    transfer_direction: TransferDirection | None = None,
) -> Decimal:
    """交易對帳戶餘額的影響：收入為正、支出為負；轉帳依 transfer_direction（轉入為正、
    轉出為負）——一般收支交易的 transfer_direction 恆為 None，不影響既有行為。"""
    if transaction_type is TransactionType.TRANSFER:
        return amount if transfer_direction is TransferDirection.IN else -amount
    return amount if transaction_type is TransactionType.INCOME else -amount


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
        await self._adjust_account_balance(
            account_uid, _signed_delta(amount, transaction_type, transaction.transfer_direction)
        )
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
        # 欄位改寫前先鎖定舊值：改寫後才算新 delta，兩者相減即可同時涵蓋金額變動、
        # 收支類型互轉與換帳戶（含三者同時發生），不需個別特判。
        old_account_uid = transaction.account_uid
        old_delta = _signed_delta(
            transaction.amount, transaction.transaction_type, transaction.transfer_direction
        )

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

        new_account_uid = transaction.account_uid
        new_delta = _signed_delta(
            transaction.amount, transaction.transaction_type, transaction.transfer_direction
        )
        if new_account_uid == old_account_uid:
            await self._adjust_account_balance(old_account_uid, new_delta - old_delta)
        else:
            await self._adjust_account_balance(old_account_uid, -old_delta)
            await self._adjust_account_balance(new_account_uid, new_delta)

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
        await self._adjust_account_balance(
            transaction.account_uid,
            -_signed_delta(
                transaction.amount, transaction.transaction_type, transaction.transfer_direction
            ),
        )

    async def create_transfer(
        self,
        *,
        user_uid: UUID,
        from_account_uid: UUID,
        to_account_uid: UUID,
        transaction_date: datetime,
        description: str,
        from_amount: Decimal,
        to_amount: Decimal,
        payment_method: str,
        created_by: UUID,
    ) -> tuple[Transaction, Transaction]:
        """雙分錄轉帳：來源帳戶一列 OUT、目標帳戶一列 IN，用共同的 transfer_group_uid 串起來
        （不是彼此的 FK，避免插入順序的雞生蛋問題，→ Transaction model 註解）。轉帳沒有分類、
        不支援標籤（本次範圍刻意排除）。`from_amount`/`to_amount` 兩個帳戶幣別相同時數值相等，
        不同幣別時 `to_amount` 已由呼叫端（API 層）用即時匯率換算好——repository 本身不碰
        `PricingService`，只負責把兩個已經算好的金額寫進兩列、分別套用到兩個帳戶餘額。"""
        group_uid = uuid4()
        outbound = Transaction(
            user_uid=user_uid,
            account_uid=from_account_uid,
            category_uid=None,
            transaction_date=transaction_date,
            description=description,
            amount=from_amount,
            transaction_type=TransactionType.TRANSFER,
            transfer_group_uid=group_uid,
            transfer_direction=TransferDirection.OUT,
            payment_method=payment_method,
            created_by=created_by,
            updated_by=created_by,
        )
        inbound = Transaction(
            user_uid=user_uid,
            account_uid=to_account_uid,
            category_uid=None,
            transaction_date=transaction_date,
            description=description,
            amount=to_amount,
            transaction_type=TransactionType.TRANSFER,
            transfer_group_uid=group_uid,
            transfer_direction=TransferDirection.IN,
            payment_method=payment_method,
            created_by=created_by,
            updated_by=created_by,
        )
        self.db.add_all([outbound, inbound])
        await self.db.flush()
        await self._adjust_account_balance(from_account_uid, -from_amount)
        await self._adjust_account_balance(to_account_uid, to_amount)
        return outbound, inbound

    async def find_transfer_by_group_uid(
        self, transfer_group_uid: UUID, user_uid: UUID
    ) -> tuple[Transaction, Transaction] | None:
        stmt = select(Transaction).where(
            Transaction.transfer_group_uid == transfer_group_uid,
            Transaction.user_uid == user_uid,
            Transaction.is_deleted.is_(False),
        )
        rows = list((await self.db.execute(stmt)).scalars().all())
        if len(rows) != 2:
            return None
        outbound = next((r for r in rows if r.transfer_direction is TransferDirection.OUT), None)
        inbound = next((r for r in rows if r.transfer_direction is TransferDirection.IN), None)
        if outbound is None or inbound is None:
            return None
        return outbound, inbound

    async def update_transfer(
        self,
        outbound: Transaction,
        inbound: Transaction,
        *,
        from_account_uid: UUID | None,
        to_account_uid: UUID | None,
        transaction_date: datetime | None,
        description: str | None,
        from_amount: Decimal | None,
        to_amount: Decimal | None,
        payment_method: str | None,
        updated_by: UUID,
    ) -> tuple[Transaction, Transaction]:
        """不像 `update_fields` 特判「帳戶沒變就用差額」：轉帳要同時處理兩個帳戶、且各自都可能
        換帳戶，統一「全退回舊 delta、全套用新 delta」邏輯簡單很多、不容易漏 case
        （`_adjust_account_balance` 對 delta=0 是 no-op，多送幾次不影響正確性）。`from_amount`/
        `to_amount` 分開傳（不像 create_transfer 假設呼叫端一定會給兩個值）：呼叫端
        （API 層）只在「金額或帳戶幣別組合真的變了」時才重新算 `to_amount`，沒變就傳 None
        維持原本換算結果，避免單純改備註卻因為即時匯率飄動而讓轉入金額跟著變。"""
        old_from_account_uid = outbound.account_uid
        old_to_account_uid = inbound.account_uid
        old_from_amount = outbound.amount
        old_to_amount = inbound.amount

        if from_account_uid is not None:
            outbound.account_uid = from_account_uid
        if to_account_uid is not None:
            inbound.account_uid = to_account_uid
        if from_amount is not None:
            outbound.amount = from_amount
        if to_amount is not None:
            inbound.amount = to_amount
        for leg in (outbound, inbound):
            if transaction_date is not None:
                leg.transaction_date = transaction_date
            if description is not None:
                leg.description = description
            if payment_method is not None:
                leg.payment_method = payment_method
            leg.updated_by = updated_by

        new_from_account_uid = outbound.account_uid
        new_to_account_uid = inbound.account_uid
        new_from_amount = outbound.amount
        new_to_amount = inbound.amount

        await self._adjust_account_balance(old_from_account_uid, old_from_amount)
        await self._adjust_account_balance(old_to_account_uid, -old_to_amount)
        await self._adjust_account_balance(new_from_account_uid, -new_from_amount)
        await self._adjust_account_balance(new_to_account_uid, new_to_amount)

        await self.db.flush()
        return outbound, inbound

    async def soft_delete_transfer(
        self, outbound: Transaction, inbound: Transaction, deleted_by: UUID
    ) -> None:
        outbound.is_deleted = True
        inbound.is_deleted = True
        outbound.updated_by = deleted_by
        inbound.updated_by = deleted_by
        await self.db.flush()
        await self._adjust_account_balance(outbound.account_uid, outbound.amount)
        await self._adjust_account_balance(inbound.account_uid, -inbound.amount)

    async def _adjust_account_balance(self, account_uid: UUID, delta: Decimal) -> None:
        # 原子加減（UPDATE ... SET balance = balance + :delta），不做 load-and-mutate，
        # 天然避免併發 race，不需額外 SELECT ... FOR UPDATE。
        if delta == 0:
            return
        await self.db.execute(
            update(Account)
            .where(Account.account_uid == account_uid)
            .values(balance=Account.balance + delta)
        )

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
