"""使用者自訂圖示：只存後端重新編碼後的 PNG（→ ADR-0006）。"""

from uuid import UUID

from sqlalchemy import ForeignKey, Index, Integer, LargeBinary, String, text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import BaseModel, public_uid


class UserIcon(BaseModel):
    __tablename__ = "user_icons"

    user_icon_uid: Mapped[UUID] = public_uid()
    user_uid: Mapped[UUID] = mapped_column(ForeignKey("users.user_uid"), nullable=False, index=True)
    # 建立後不可變：換圖一律新增一列，圖片端點才能用 immutable 長快取
    image_png: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
    content_sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    byte_size: Mapped[int] = mapped_column(Integer, nullable=False)

    __table_args__ = (
        # 同一使用者同一張圖只留一份；軟刪後可重新上傳（→ DB-024）
        Index(
            "uq_user_icons_user_uid_content_sha256",
            "user_uid",
            "content_sha256",
            unique=True,
            postgresql_where=text("is_deleted = false"),
        ),
    )
