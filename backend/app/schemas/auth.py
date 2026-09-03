"""註冊 / 登入 request 與回應 schema。"""

import re
from uuid import UUID

from pydantic import Field, field_validator

from app.schemas.base import ApiInput, ApiSchema

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class _EmailInput(ApiInput):
    email: str = Field(max_length=255)

    @field_validator("email")
    @classmethod
    def _normalize_email(cls, v: str) -> str:
        v = v.strip().lower()
        if not _EMAIL_RE.match(v):
            raise ValueError("email 格式錯誤")
        return v


class RegisterRequest(_EmailInput):
    # bcrypt 只處理前 72 bytes，超過會被靜默截斷比對，故上限鎖 72（BE-027）
    password: str = Field(min_length=8, max_length=72)


class LoginRequest(_EmailInput):
    password: str = Field(min_length=1, max_length=72)


class UserResponse(ApiSchema):
    user_uid: UUID
    email: str
