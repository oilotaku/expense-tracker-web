"""後台管理 API：全部路由掛 `require_admin`（`ADMIN_EMAILS` 名單比對，→ app/api/deps.py）。
只做「查使用者 + 刪使用者 + 重設密碼」，不做直接編輯使用者財務資料（責任歸屬不清，
真要修資料回去用 psql）——範圍見使用者與 assistant 討論後的決議，不擅自擴權。"""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db, require_admin
from app.core.response import success
from app.models.user import User
from app.schemas.admin import AdminResetPasswordResponse, AdminUserListFilter, AdminUserListResponse
from app.schemas.response import ApiResponse
from app.services.admin_service import AdminService

router = APIRouter(prefix="/admin")

DbSession = Annotated[AsyncSession, Depends(get_db)]
AdminUser = Annotated[User, Depends(require_admin)]


@router.get(
    "/users",
    response_model=ApiResponse[AdminUserListResponse],
    summary="使用者清單（含帳戶/交易數量，不含明細內容）",
)
async def list_users(
    db: DbSession,
    _admin: AdminUser,
    filters: Annotated[AdminUserListFilter, Query()],
) -> ApiResponse[AdminUserListResponse]:
    data = await AdminService(db).list_users(limit=filters.limit, offset=filters.offset)
    return success(data=data)


@router.delete(
    "/users/{user_uid}",
    response_model=ApiResponse[None],
    summary="刪除使用者（軟刪，→ DB-033；不能刪除自己）",
)
async def delete_user(user_uid: UUID, db: DbSession, admin: AdminUser) -> ApiResponse[None]:
    await AdminService(db).delete_user(user_uid, admin)
    return success(data=None)


@router.post(
    "/users/{user_uid}/reset-password",
    response_model=ApiResponse[AdminResetPasswordResponse],
    status_code=201,
    summary="重設使用者密碼（產生隨機臨時密碼，該使用者下次登入強制改密碼）",
)
async def reset_password(
    user_uid: UUID, db: DbSession, admin: AdminUser
) -> ApiResponse[AdminResetPasswordResponse]:
    data = await AdminService(db).reset_password(user_uid, admin)
    return success(data=data, response_code=201)
