"""週期性交易規則：每月固定收支，到期時（→ `app.services.recurring_service`）依 `day_of_month`
產生當月一筆 `Transaction`。

`day_of_month` 超過當月天數時夾到當月最後一天（propose 決議，見 task-007）。
`last_generated_year_month`（`YYYY-MM`）記錄最近一次成功產生交易的年月，供服務層冪等判斷：
同一規則同一月份重複觸發（服務啟動 / 每日排程重疊）不會產生兩筆交易。
"""

from decimal import Decimal
from uuid import UUID

from sqlalchemy import CheckConstraint, Enum, ForeignKey, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import BaseModel, public_uid
from app.models.transaction import TransactionType


class RecurringRule(BaseModel):
    __tablename__ = "recurring_rules"

    recurring_rule_uid: Mapped[UUID] = public_uid()
    user_uid: Mapped[UUID] = mapped_column(ForeignKey("users.user_uid"), nullable=False, index=True)
    account_uid: Mapped[UUID] = mapped_column(
        ForeignKey("accounts.account_uid"), nullable=False, index=True
    )
    category_uid: Mapped[UUID] = mapped_column(
        ForeignKey("categories.category_uid"), nullable=False, index=True
    )
    description: Mapped[str] = mapped_column(String(255), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(18, 2), nullable=False)
    transaction_type: Mapped[TransactionType] = mapped_column(
        Enum(
            TransactionType,
            name="transaction_type",
            native_enum=False,
            validate_strings=True,
            length=10,
            # StrEnum 的 name（大寫）與 value（小寫）不同；DB 存 value，需明確指定，
            # 否則 SQLAlchemy 預設寫入 .name 而非 .value（會違反 CHECK constraint）。
            values_callable=lambda enum_cls: [member.value for member in enum_cls],
        ),
        nullable=False,
    )
    payment_method: Mapped[str] = mapped_column(String(50), nullable=False)
    day_of_month: Mapped[int] = mapped_column(nullable=False)
    # None = 尚未產生過任何交易；產生成功後寫入該次的 "YYYY-MM"（冪等判斷用，見 RecurringService）
    last_generated_year_month: Mapped[str | None] = mapped_column(String(7), nullable=True)

    __table_args__ = (
        # 短標籤：naming_convention 會自組 ck_recurring_rules_day_of_month_range（見 task 操作備註）
        CheckConstraint("day_of_month BETWEEN 1 AND 31", name="day_of_month_range"),
    )
