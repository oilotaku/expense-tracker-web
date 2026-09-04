"""帳戶（Account）request / response schema：金額一律 Decimal，JSON 序列化為字串（DB-038）。

`color` / `icon`（design-spec §12.4）：做法與 `schemas/category.py` 對稱；`color` 後端驗證 hex
格式，`icon` 只驗證非空與長度上限，合法圖示清單由前端圖示選擇器維護（→ A9）。
"""

import re
from decimal import Decimal
from uuid import UUID

from pydantic import Field, field_serializer, field_validator

from app.schemas.base import ApiInput, ApiSchema

_COLOR_RE = re.compile(r"^#[0-9A-Fa-f]{6}$")


def _validate_color_format(v: str) -> str:
    if not _COLOR_RE.match(v):
        raise ValueError("color 格式錯誤，需為 #RRGGBB")
    return v


class AccountCreateRequest(ApiInput):
    name: str = Field(min_length=1, max_length=100)
    balance: Decimal = Field(max_digits=18, decimal_places=2)
    color: str = Field(
        min_length=7, max_length=7, description="hex 色碼，含 #", examples=["#8B6ED6"]
    )
    icon: str = Field(min_length=1, max_length=50, description="圖示 key", examples=["wallet"])

    @field_validator("color")
    @classmethod
    def _validate_color(cls, v: str) -> str:
        return _validate_color_format(v)


class AccountUpdateRequest(ApiInput):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    balance: Decimal | None = Field(default=None, max_digits=18, decimal_places=2)
    color: str | None = Field(
        default=None, min_length=7, max_length=7, description="hex 色碼，含 #"
    )
    icon: str | None = Field(default=None, min_length=1, max_length=50, description="圖示 key")

    @field_validator("color")
    @classmethod
    def _validate_color(cls, v: str | None) -> str | None:
        return _validate_color_format(v) if v is not None else v


class AccountResponse(ApiSchema):
    account_uid: UUID
    name: str
    balance: Decimal
    currency: str
    color: str
    icon: str

    @field_serializer("balance", when_used="json")
    def _balance_to_str(self, v: Decimal) -> str:
        return str(v)


class AccountListResponse(ApiSchema):
    items: list[AccountResponse]
    total: int
