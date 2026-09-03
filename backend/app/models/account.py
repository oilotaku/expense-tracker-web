"""帳戶（現金 / 銀行帳戶）：餘額歸屬使用者，供交易帳戶欄位與淨資產彙總引用。"""

from decimal import Decimal
from uuid import UUID

from sqlalchemy import CHAR, ForeignKey, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import BaseModel, public_uid


class Account(BaseModel):
    __tablename__ = "accounts"

    account_uid: Mapped[UUID] = public_uid()
    user_uid: Mapped[UUID] = mapped_column(ForeignKey("users.user_uid"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    balance: Mapped[Decimal] = mapped_column(Numeric(18, 2), nullable=False)
    # 本版單幣別（新台幣），欄位仍獨立存放（DB-039），不塞進金額欄位或欄名
    currency: Mapped[str] = mapped_column(CHAR(3), nullable=False, server_default="TWD")
