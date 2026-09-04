"""預算：使用者依分類設定當月或當日支出上限；

已花費彙總由 service 即時加總同分類同期間交易計算，不落地快取。
"""

from decimal import Decimal
from enum import StrEnum
from uuid import UUID

from sqlalchemy import Enum, ForeignKey, Index, Numeric, text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import BaseModel, public_uid


class BudgetPeriodType(StrEnum):
    MONTHLY = "monthly"
    DAILY = "daily"


class Budget(BaseModel):
    __tablename__ = "budgets"

    budget_uid: Mapped[UUID] = public_uid()
    user_uid: Mapped[UUID] = mapped_column(ForeignKey("users.user_uid"), nullable=False, index=True)
    category_uid: Mapped[UUID] = mapped_column(
        ForeignKey("categories.category_uid"), nullable=False, index=True
    )
    period_type: Mapped[BudgetPeriodType] = mapped_column(
        Enum(
            BudgetPeriodType,
            name="period_type",
            native_enum=False,
            validate_strings=True,
            length=10,
            # StrEnum 的 name（大寫）與 value（小寫）不同；DB 存 value，需明確指定，
            # 否則 SQLAlchemy 預設寫入 .name 而非 .value（會違反 CHECK constraint）。
            values_callable=lambda enum_cls: [member.value for member in enum_cls],
        ),
        nullable=False,
    )
    limit_amount: Mapped[Decimal] = mapped_column(Numeric(18, 2), nullable=False)

    __table_args__ = (
        # 同一使用者、同分類、同期間類型只能有一筆生效預算；軟刪後可重建（同 categories 的作法）。
        Index(
            "uq_budgets_user_uid_category_uid_period_type",
            "user_uid",
            "category_uid",
            "period_type",
            unique=True,
            postgresql_where=text("is_deleted = false"),
        ),
    )
