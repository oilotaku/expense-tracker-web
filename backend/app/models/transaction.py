"""交易：日期 / 分類 / 明細 / 金額 / 收支類型 / 支付方式 / 帳戶；標籤透過多對多關聯表掛載

（分類與標籤是分開欄位，不合併，見 propose In Scope）。
"""

from datetime import datetime
from decimal import Decimal
from enum import StrEnum
from uuid import UUID

from sqlalchemy import CheckConstraint, Column, DateTime, Enum, ForeignKey, Numeric, String, Table
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base
from app.models.base import BaseModel, public_uid


class TransactionType(StrEnum):
    INCOME = "income"
    EXPENSE = "expense"
    TRANSFER = "transfer"


class TransferDirection(StrEnum):
    """轉帳雙分錄的方向：一筆轉帳由兩列 Transaction 組成（`→ transfer_group_uid`），
    來源帳戶那列是 OUT、目標帳戶那列是 IN，供 `_signed_delta` 決定餘額增減方向。"""

    OUT = "out"
    IN = "in"


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
    # 轉帳沒有分類概念（→ CHECK ck_transactions_transfer_shape），一般收支交易仍必填。
    category_uid: Mapped[UUID | None] = mapped_column(
        ForeignKey("categories.category_uid"), nullable=True, index=True
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
    # 轉帳雙分錄分組 key（→ transfer_direction）：只是把同一筆轉帳的兩列串起來的標籤，
    # 不是指向對方列的 FK——兩列互相 FK 會有插入順序的雞生蛋問題，用獨立產生的 UUID
    # 分組更單純。一般收支交易恆為 NULL。
    transfer_group_uid: Mapped[UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), nullable=True, index=True
    )
    transfer_direction: Mapped[TransferDirection | None] = mapped_column(
        Enum(
            TransferDirection,
            name="transfer_direction",
            native_enum=False,
            validate_strings=True,
            length=10,
            values_callable=lambda enum_cls: [member.value for member in enum_cls],
        ),
        nullable=True,
    )

    __table_args__ = (
        # 一般收支交易必有分類、無轉帳分組欄位；轉帳交易反過來，兩種形狀互斥（→ 雙分錄設計，
        # transfer_group_uid/transfer_direction 只在轉帳列才有值）。
        CheckConstraint(
            "(transaction_type <> 'transfer' AND category_uid IS NOT NULL "
            "AND transfer_group_uid IS NULL AND transfer_direction IS NULL) OR "
            "(transaction_type = 'transfer' AND category_uid IS NULL "
            "AND transfer_group_uid IS NOT NULL AND transfer_direction IS NOT NULL)",
            name="ck_transactions_transfer_shape",
        ),
    )
