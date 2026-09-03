"""分類 CRUD request / response schema：分類與標籤是分開欄位，不合併。"""

from uuid import UUID

from pydantic import Field, field_validator

from app.schemas.base import ApiInput, ApiSchema


class _CategoryNameInput(ApiInput):
    name: str = Field(min_length=1, max_length=50)

    @field_validator("name")
    @classmethod
    def _strip_name(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("分類名稱不可為空白")
        return v


class CategoryCreateRequest(_CategoryNameInput):
    pass


class CategoryUpdateRequest(_CategoryNameInput):
    pass


class CategoryResponse(ApiSchema):
    category_uid: UUID
    name: str


class CategoryListResponse(ApiSchema):
    items: list[CategoryResponse]
    total: int
