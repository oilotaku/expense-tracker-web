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
    # PIN 快速登入是否已設定（UserCredential.pin_hash 非 null）。前端據此決定設定/變更 PIN 的
    # 入口與提醒，不必再用 localStorage 猜（換瀏覽器 / 換裝置時那份近似值會錯）。
    has_pin: bool = Field(description="是否已設定 PIN 快速登入")


_PIN_RE = re.compile(r"^\d{6}$")


def _validate_pin_digits(v: str) -> str:
    if not _PIN_RE.match(v):
        raise ValueError("PIN 必須為 6 碼數字")
    return v


class SetPinRequest(ApiInput):
    pin: str = Field(
        min_length=6, max_length=6, description="欲設定的 6 碼數字 PIN", examples=["123456"]
    )
    # bcrypt 只處理前 72 bytes（BE-027 同慣例），密碼欄位長度上限與 LoginRequest 一致
    password: str = Field(min_length=1, max_length=72, description="目前登入密碼，供身份重驗證")

    @field_validator("pin")
    @classmethod
    def _validate_pin(cls, v: str) -> str:
        return _validate_pin_digits(v)


class ChangePinRequest(ApiInput):
    current_pin: str = Field(min_length=6, max_length=6, description="目前 6 碼數字 PIN")
    new_pin: str = Field(min_length=6, max_length=6, description="欲變更的新 6 碼數字 PIN")

    @field_validator("current_pin", "new_pin")
    @classmethod
    def _validate_pins(cls, v: str) -> str:
        return _validate_pin_digits(v)


class DisablePinRequest(ApiInput):
    password: str = Field(min_length=1, max_length=72, description="目前登入密碼，供身份重驗證")


class PinLoginRequest(ApiInput):
    user_uid: UUID = Field(description="目標使用者 uid（本機記住的帳號清單提供）")
    pin: str = Field(min_length=6, max_length=6, description="6 碼數字 PIN")

    @field_validator("pin")
    @classmethod
    def _validate_pin(cls, v: str) -> str:
        return _validate_pin_digits(v)
