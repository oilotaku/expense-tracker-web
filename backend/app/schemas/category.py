"""分類 CRUD request / response schema：分類與標籤是分開欄位，不合併。

`color` / `icon`（design-spec §12.4）：`color` 後端驗證 hex 格式；`icon` 只驗證非空與長度上限，
不做 enum 檢查，合法圖示清單由前端圖示選擇器維護（→ A9）。
"""

import re
from uuid import UUID

from pydantic import Field, field_validator

from app.schemas.base import ApiInput, ApiSchema

_COLOR_RE = re.compile(r"^#[0-9A-Fa-f]{6}$")


def _validate_color_format(v: str) -> str:
    if not _COLOR_RE.match(v):
        raise ValueError("color 格式錯誤，需為 #RRGGBB")
    return v


class CategoryCreateRequest(ApiInput):
    name: str = Field(min_length=1, max_length=50)
    color: str = Field(
        min_length=7, max_length=7, description="hex 色碼，含 #", examples=["#8B6ED6"]
    )
    icon: str = Field(min_length=1, max_length=50, description="圖示 key", examples=["utensils"])

    @field_validator("name")
    @classmethod
    def _strip_name(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("分類名稱不可為空白")
        return v

    @field_validator("color")
    @classmethod
    def _validate_color(cls, v: str) -> str:
        return _validate_color_format(v)


class CategoryUpdateRequest(ApiInput):
    # 改色/改圖示不需通過重新命名流程（→ design-spec §8），name 與 color/icon 皆各自 optional
    name: str | None = Field(default=None, min_length=1, max_length=50)
    color: str | None = Field(
        default=None, min_length=7, max_length=7, description="hex 色碼，含 #"
    )
    icon: str | None = Field(default=None, min_length=1, max_length=50, description="圖示 key")

    @field_validator("name")
    @classmethod
    def _strip_name(cls, v: str | None) -> str | None:
        if v is None:
            return v
        v = v.strip()
        if not v:
            raise ValueError("分類名稱不可為空白")
        return v

    @field_validator("color")
    @classmethod
    def _validate_color(cls, v: str | None) -> str | None:
        return _validate_color_format(v) if v is not None else v


class CategoryResponse(ApiSchema):
    category_uid: UUID
    name: str
    color: str
    icon: str


class CategoryListResponse(ApiSchema):
    items: list[CategoryResponse]
    total: int
