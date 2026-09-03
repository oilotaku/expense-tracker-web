"""負債：使用者手動登記的負債項目（名稱 / 金額 / 可選利率），不含還款排程

（propose Out of Scope 明確排除）。
"""

from decimal import Decimal
from uuid import UUID

from sqlalchemy import ForeignKey, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import BaseModel, public_uid


class Liability(BaseModel):
    __tablename__ = "liabilities"
    __public_uid__ = "liability_uid"  # 不規則複數（liabilities → liability_uid）

    liability_uid: Mapped[UUID] = public_uid()
    user_uid: Mapped[UUID] = mapped_column(ForeignKey("users.user_uid"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(18, 2), nullable=False)
    interest_rate: Mapped[Decimal | None] = mapped_column(Numeric(5, 2), nullable=True)
