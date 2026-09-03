"""標籤：使用者自訂，透過多對多關聯表掛在交易上；與分類是分開欄位，不合併。"""

from uuid import UUID

from sqlalchemy import ForeignKey, Index, String, text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import BaseModel, public_uid


class Tag(BaseModel):
    __tablename__ = "tags"

    tag_uid: Mapped[UUID] = public_uid()
    user_uid: Mapped[UUID] = mapped_column(ForeignKey("users.user_uid"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(50), nullable=False)

    __table_args__ = (
        # 同一使用者不重複標籤名稱；軟刪後名稱可重用（→ DB-024 / DB-057）
        Index(
            "uq_tags_user_uid_name",
            "user_uid",
            "name",
            unique=True,
            postgresql_where=text("is_deleted = false"),
        ),
    )
