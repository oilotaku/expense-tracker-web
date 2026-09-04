"""分類：系統預設種子清單，使用者可自行增刪（不與標籤欄位合併）。"""

from uuid import UUID

from sqlalchemy import ForeignKey, Index, String, text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import BaseModel, public_uid


class Category(BaseModel):
    __tablename__ = "categories"
    __public_uid__ = "category_uid"  # 不規則複數表名覆寫（→ DB-016）

    category_uid: Mapped[UUID] = public_uid()
    user_uid: Mapped[UUID] = mapped_column(ForeignKey("users.user_uid"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(50), nullable=False)
    # hex 色碼含 #（design-spec §12.4）；後端只驗證格式 ^#[0-9A-Fa-f]{6}$，不做語意檢查。
    # server_default 對齊 migration 的佔位色（中性灰，→ 圖表色票「其他」），只在極少數繞過
    # schema 直接呼叫 repository（如既有服務層測試 fixture）未帶色值時兜底，一般建立流程
    # 一律由 CategoryCreateRequest 要求明確帶入。
    color: Mapped[str] = mapped_column(String(7), nullable=False, server_default="#9C96AF")
    # 圖示 key；只驗證非空/長度上限，不做 enum 檢查（合法清單由前端圖示選擇器維護，→ A9）
    icon: Mapped[str] = mapped_column(String(50), nullable=False, server_default="other")

    __table_args__ = (
        # 同一使用者不重複分類名稱；軟刪後名稱可重用（→ DB-024 / DB-057）
        Index(
            "uq_categories_user_uid_name",
            "user_uid",
            "name",
            unique=True,
            postgresql_where=text("is_deleted = false"),
        ),
    )
