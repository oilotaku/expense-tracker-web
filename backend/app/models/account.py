"""帳戶（現金 / 銀行帳戶）：餘額歸屬使用者，供交易帳戶欄位與淨資產彙總引用。"""

from decimal import Decimal
from uuid import UUID

from sqlalchemy import CHAR, CheckConstraint, ForeignKey, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import BaseModel, public_uid
from app.utils.currency import SupportedCurrency

_CURRENCY_LIST_SQL = ", ".join(f"'{member.value}'" for member in SupportedCurrency)


class Account(BaseModel):
    __tablename__ = "accounts"

    account_uid: Mapped[UUID] = public_uid()
    user_uid: Mapped[UUID] = mapped_column(ForeignKey("users.user_uid"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    balance: Mapped[Decimal] = mapped_column(Numeric(18, 2), nullable=False)
    # 幣別（→ app.utils.currency.SupportedCurrency，固定選單）：建立後不可變更（比照
    # financial_assets.asset_type 的既有慣例），事後改幣別代表要重新解讀所有歷史餘額/交易數字，
    # 語意上不合理，AccountUpdateRequest 因此刻意不接受這個欄位。
    currency: Mapped[str] = mapped_column(CHAR(3), nullable=False, server_default="TWD")
    # hex 色碼含 #（design-spec §12.4）；後端只驗證格式 ^#[0-9A-Fa-f]{6}$，不做語意檢查。
    # server_default 只在繞過 schema 直接呼叫 repository（如既有服務層測試 fixture）未帶色值
    # 時兜底，一般建立流程一律由 AccountCreateRequest 要求明確帶入（做法與 Category 對稱）。
    color: Mapped[str] = mapped_column(String(7), nullable=False, server_default="#9C96AF")
    # 圖示 key；只驗證非空/長度上限，不做 enum 檢查（合法清單由前端圖示選擇器維護，→ A9）
    icon: Mapped[str] = mapped_column(String(50), nullable=False, server_default="other")

    __table_args__ = (
        CheckConstraint(f"currency IN ({_CURRENCY_LIST_SQL})", name="ck_accounts_currency"),
    )
