"""週期性交易規則：到期時（→ `app.services.recurring_service`）依 `anchor_date` + `interval_unit` +
`interval_count` 產生一筆 `Transaction`（design-spec §12.3）。

`day_of_month` 為 v1.0.0 舊欄位，**保留但放寬為 nullable**（不刪欄位，→ DB-033），服務層改讀
`anchor_date` 的日部分；`month` 單位超過當月天數時夾到當月最後一天（propose 決議，見 task-007，
語意不變）。`last_generated_year_month`（`YYYY-MM`）記錄最近一次成功產生交易的年月，供服務層冪等
判斷：同一規則同一月份重複觸發（服務啟動 / 每日排程重疊）不會產生兩筆交易。
"""

from datetime import date
from decimal import Decimal
from enum import StrEnum
from uuid import UUID

from sqlalchemy import Boolean, CheckConstraint, Date, Enum, ForeignKey, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import BaseModel, public_uid
from app.models.transaction import TransactionType


class RecurringIntervalUnit(StrEnum):
    WEEK = "week"
    MONTH = "month"
    YEAR = "year"


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
    # v1.0.0 舊欄位，保留但放寬為 nullable（→ DB-033）；服務層不再讀取，改用 anchor_date
    day_of_month: Mapped[int | None] = mapped_column(nullable=True)
    interval_unit: Mapped[RecurringIntervalUnit] = mapped_column(
        Enum(
            RecurringIntervalUnit,
            name="recurring_interval_unit",
            native_enum=False,
            validate_strings=True,
            length=10,
            values_callable=lambda enum_cls: [member.value for member in enum_cls],
        ),
        nullable=False,
        server_default=RecurringIntervalUnit.MONTH.value,
    )
    interval_count: Mapped[int] = mapped_column(nullable=False, default=1, server_default="1")
    # 下一次執行日由服務層依此日起，每 interval_count 個 interval_unit 累加一次算出（→ §7.2）
    anchor_date: Mapped[date] = mapped_column(Date, nullable=False)
    # None = 尚未產生過任何交易；產生成功後寫入該次的 "YYYY-MM"（冪等判斷用，見 RecurringService）
    last_generated_year_month: Mapped[str | None] = mapped_column(String(7), nullable=True)
    # 連結負債定期還款（→ RecurringService）；None = 一般收支週期性交易
    liability_uid: Mapped[UUID | None] = mapped_column(
        ForeignKey("liabilities.liability_uid", ondelete="SET NULL"), nullable=True, index=True
    )
    # 使用者暫停/恢復（與 is_deleted 語意不同：暫停仍保留規則、清單可見，只是服務層跳過產生；
    # is_deleted 是刪除，兩者互相獨立）
    is_active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default="true"
    )

    __table_args__ = (
        # 短標籤：naming_convention 會自組 ck_recurring_rules_day_of_month_range（見 task 操作備註）
        CheckConstraint("day_of_month BETWEEN 1 AND 31", name="day_of_month_range"),
        CheckConstraint("interval_count BETWEEN 1 AND 99", name="interval_count_range"),
        CheckConstraint(
            "liability_uid IS NULL OR transaction_type = 'expense'",
            name="liability_requires_expense",
        ),
    )
