"""交易：日期 / 分類 / 明細 / 金額 / 收支類型 / 支付方式 / 帳戶；標籤透過多對多關聯表掛載

（分類與標籤是分開欄位，不合併，見 propose In Scope）。
"""

from datetime import datetime
from decimal import Decimal
from enum import StrEnum
from uuid import UUID

from sqlalchemy import Column, DateTime, Enum, ForeignKey, Numeric, String, Table
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base
from app.models.base import BaseModel, public_uid


class TransactionType(StrEnum):
    INCOME = "income"
    EXPENSE = "expense"


# 交易 ↔ 標籤多對多關聯表：純連接表，不繼承 BaseModel（無需 soft delete / 稽核欄位）。
transaction_tags = Table(
    "transaction_tags",
    Base.metadata,
    Column(
        "transaction_uid",
        PG_UUID(as_uuid=True),
        ForeignKey("transactions.transaction_uid"),
        primary_key=True,
    ),
    Column(
        "tag_uid",
        PG_UUID(as_uuid=True),
        ForeignKey("tags.tag_uid"),
        primary_key=True,
    ),
)


class Transaction(BaseModel):
    __tablename__ = "transactions"

    transaction_uid: Mapped[UUID] = public_uid()
    user_uid: Mapped[UUID] = mapped_column(ForeignKey("users.user_uid"), nullable=False, index=True)
    account_uid: Mapped[UUID] = mapped_column(
        ForeignKey("accounts.account_uid"), nullable=False, index=True
    )
    category_uid: Mapped[UUID] = mapped_column(
        ForeignKey("categories.category_uid"), nullable=False, index=True
    )
    transaction_date: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, index=True
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
