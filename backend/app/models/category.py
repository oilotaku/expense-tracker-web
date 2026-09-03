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
