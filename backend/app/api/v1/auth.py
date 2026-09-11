from typing import Annotated

from fastapi import APIRouter, Depends, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_db
from app.core.cookies import clear_jwt_cookie, set_jwt_cookie
from app.core.response import success
from app.models.user import User
from app.schemas.auth import (
    ChangePasswordRequest,
    ChangePinRequest,
    DisablePinRequest,
    LoginRequest,
    PinLoginRequest,
    RegisterRequest,
    SetPinRequest,
    UserResponse,
)
from app.schemas.response import ApiResponse
from app.services.auth_service import AuthService

router = APIRouter(prefix="/auth")

DbSession = Annotated[AsyncSession, Depends(get_db)]
CurrentUser = Annotated[User, Depends(get_current_user)]


@router.post(
    "/register",
    response_model=ApiResponse[UserResponse],
    status_code=201,
    summary="註冊",
)
async def register(payload: RegisterRequest, db: DbSession) -> ApiResponse[UserResponse]:
    user = await AuthService(db).register(payload.email, payload.password)
    return success(data=user, response_code=201)


@router.post(
    "/login",
    response_model=ApiResponse[UserResponse],
    summary="登入",
)
async def login(
    payload: LoginRequest, db: DbSession, response: Response
) -> ApiResponse[UserResponse]:
    user, token = await AuthService(db).login(payload.email, payload.password)
    set_jwt_cookie(response, token)
    return success(data=user)


@router.post(
    "/logout",
    response_model=ApiResponse[None],
    summary="登出",
)
async def logout(response: Response) -> ApiResponse[None]:
    clear_jwt_cookie(response)
    return success(data=None)


@router.get(
    "/me",
    response_model=ApiResponse[UserResponse],
    summary="取得目前登入使用者",
)
async def me(current_user: CurrentUser, db: DbSession) -> ApiResponse[UserResponse]:
    return success(data=await AuthService(db).get_me(current_user))


@router.patch(
    "/change-password",
    response_model=ApiResponse[None],
    summary="改密碼（自助；後台管理員重設密碼後強制走這裡才能清除 must_change_password）",
)
async def change_password(
    payload: ChangePasswordRequest, db: DbSession, current_user: CurrentUser
) -> ApiResponse[None]:
    await AuthService(db).change_password(
        current_user.user_uid, payload.current_password, payload.new_password
    )
    return success(data=None)


@router.post(
    "/pin",
    response_model=ApiResponse[None],
    status_code=201,
    summary="首次設定 PIN",
)
async def set_pin(
    payload: SetPinRequest, db: DbSession, current_user: CurrentUser
) -> ApiResponse[None]:
    await AuthService(db).set_pin(current_user.user_uid, payload.pin, payload.password)
    return success(data=None, response_code=201)


@router.patch(
    "/pin",
    response_model=ApiResponse[None],
    summary="變更 PIN",
)
async def change_pin(
    payload: ChangePinRequest, db: DbSession, current_user: CurrentUser
) -> ApiResponse[None]:
    await AuthService(db).change_pin(current_user.user_uid, payload.current_pin, payload.new_pin)
    return success(data=None)


@router.delete(
    "/pin",
    response_model=ApiResponse[None],
    summary="停用 PIN 快速登入",
)
async def delete_pin(
    payload: DisablePinRequest, db: DbSession, current_user: CurrentUser
) -> ApiResponse[None]:
    await AuthService(db).disable_pin(current_user.user_uid, payload.password)
    return success(data=None)


@router.post(
    "/login/pin",
    response_model=ApiResponse[UserResponse],
    summary="PIN 快速登入",
)
async def login_pin(
    payload: PinLoginRequest, db: DbSession, response: Response
) -> ApiResponse[UserResponse]:
    user, token = await AuthService(db).login_with_pin(payload.user_uid, payload.pin)
    set_jwt_cookie(response, token)
    return success(data=user)
