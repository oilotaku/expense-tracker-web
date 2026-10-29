"""自訂圖示 response schema（→ ADR-0006 §2）。圖片本體走 `GET /icons/{uid}` 的 image/png。"""

from datetime import datetime
from uuid import UUID

from app.schemas.base import ApiSchema


class IconResponse(ApiSchema):
    user_icon_uid: UUID
    icon_key: str  # 寫進帳戶 / 分類 icon 欄位的值：custom:<user_icon_uid>
    url: str  # 相對路徑，網頁同源直接用，iOS 接在 API base URL 後面
    content_sha256: str
    byte_size: int
    usage_count: int
    created_at: datetime


class IconQuota(ApiSchema):
    used: int
    limit: int


class IconListResponse(ApiSchema):
    items: list[IconResponse]
    quota: IconQuota


class IconUsageAccount(ApiSchema):
    account_uid: UUID
    name: str


class IconUsageCategory(ApiSchema):
    category_uid: UUID
    name: str


class IconUsagesResponse(ApiSchema):
    accounts: list[IconUsageAccount]
    categories: list[IconUsageCategory]


class IconDeleteResponse(ApiSchema):
    reset_accounts: int
    reset_categories: int
