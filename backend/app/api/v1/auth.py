from typing import Annotated

from fastapi import APIRouter, Depends, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_db
from app.core.cookies import set_jwt_cookie
from app.core.response import success
from app.models.user import User
from app.schemas.auth import LoginRequest, RegisterRequest, UserResponse
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


@router.get(
    "/me",
    response_model=ApiResponse[UserResponse],
    summary="取得目前登入使用者",
)
async def me(current_user: CurrentUser) -> ApiResponse[UserResponse]:
    return success(data=current_user)
