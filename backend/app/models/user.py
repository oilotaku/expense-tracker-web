"""使用者與密碼憑證：PII 與憑證分離儲存（harness rules/30-database DB-027）。"""

from datetime import datetime
from uuid import UUID

from sqlalchemy import DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import BaseModel, public_uid


class User(BaseModel):
    __tablename__ = "users"

    user_uid: Mapped[UUID] = public_uid()
    email: Mapped[str] = mapped_column(
        String(255), nullable=False, unique=True, comment="PII: email"
    )


class UserCredential(BaseModel):
    __tablename__ = "user_credentials"

    user_credential_uid: Mapped[UUID] = public_uid()
    user_uid: Mapped[UUID] = mapped_column(
        ForeignKey("users.user_uid"), nullable=False, unique=True
    )
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    password_updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    # PIN 快速登入（design-spec §12.2）：pin_hash None = 未設定；沿用 app.core.security.pwd_context
    # 同一套 bcrypt，不另建 hash 機制。鎖定機制（連續 5 次失敗鎖 15 分鐘）→ AuthService。
    pin_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)
    pin_updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    pin_failed_attempts: Mapped[int] = mapped_column(nullable=False, default=0, server_default="0")
    pin_locked_until: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
