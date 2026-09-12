"""後台管理 API schema：只給 ADMIN_EMAILS 名單內的使用者用（→ app/api/deps.py::require_admin）。"""

from datetime import datetime
from uuid import UUID

from pydantic import Field

from app.schemas.base import ApiInput, ApiSchema


class AdminUserListFilter(ApiInput):
    limit: int = Field(default=50, ge=1, le=100)
    offset: int = Field(default=0, ge=0)


class AdminUserListItem(ApiSchema):
    user_uid: UUID
    email: str
    created_at: datetime
    # 不回傳交易/帳戶內容本身（尊重隱私），只回數量供管理員判斷這是不是空的測試帳號
    # （→ 今天手動 psql 清 3 個 e2e 殘留帳號的同一種需求，這裡改成有介面做）。
    account_count: int
    transaction_count: int
    # 追蹤活躍度（task-038）：只記「最後一次」登入（密碼/PIN 皆算），None = 從未登入過
    # （例如剛註冊但還沒登入，或已經被清理但 credential 本身還沒被 admin 刪除的邊界情況）。
    last_login_at: datetime | None


class AdminUserListResponse(ApiSchema):
    items: list[AdminUserListItem]
    total: int


class AdminResetPasswordResponse(ApiSchema):
    # 明文密碼只在這次回應出現一次，不存明文、不記進 log（→ CORE-111/CORE-135 機密不入 log）。
    temporary_password: str
