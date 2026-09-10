"""負債一次性手動還款：與 `RecurringService` 產生的定期還款交易語意一致（同一筆負債的還款，不論
是排程自動觸發還是使用者手動觸發，都要在 `transactions` 留下紀錄並扣減負債餘額），差別只在於由
使用者即時觸發、金額不受規則約束。

金額規則同既有手動還款 UI 慣例（`frontend/src/app/assets/page.tsx` 的 `LiabilityRow`）：必須嚴格
小於目前負債金額，全部還清請改用刪除（`liabilities.amount` 欄位 `gt=0` 不可設為 0）；交易建立與
負債扣減包在同一個 DB transaction 邊界內（→ BE-038）。
"""

from decimal import Decimal
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AppError, NotFoundError
from app.models.liability import Liability
from app.models.transaction import Transaction, TransactionType
from app.repositories.liability_repository import LiabilityRepository
from app.repositories.transaction_repository import TransactionRepository
from app.utils.datetime import now_utc

_NOT_FOUND_DETAIL = "負債不存在"
_AMOUNT_TOO_LARGE_DETAIL = "還款金額須小於目前負債金額；全部還清請改用「刪除」"


class LiabilityService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.liability_repo = LiabilityRepository(db)
        self.transaction_repo = TransactionRepository(db)

    async def record_manual_repayment(
        self,
        *,
        liability_uid: UUID,
        user_uid: UUID,
        amount: Decimal,
        account_uid: UUID,
        category_uid: UUID,
        payment_method: str,
    ) -> tuple[Liability, Transaction]:
        atomic = self.db.begin_nested() if self.db.in_transaction() else self.db.begin()
        async with atomic:
            liability = await self.liability_repo.get_for_update(liability_uid, user_uid)
            if liability is None:
                raise NotFoundError(_NOT_FOUND_DETAIL)
            if amount >= liability.amount:
                raise AppError(_AMOUNT_TOO_LARGE_DETAIL, response_code=422, status_code=422)

            transaction, _tags = await self.transaction_repo.create(
                user_uid=user_uid,
                account_uid=account_uid,
                category_uid=category_uid,
                transaction_date=now_utc(),
                description=f"{liability.name} 還款",
                amount=amount,
                transaction_type=TransactionType.EXPENSE,
                payment_method=payment_method,
                tag_names=[],
                created_by=user_uid,
            )
            await self.liability_repo.apply_repayment(liability, amount, user_uid)
            await self.db.flush()
        return liability, transaction


__all__ = ["LiabilityService"]
