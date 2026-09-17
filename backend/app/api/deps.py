from collections.abc import AsyncIterator
from typing import Annotated, Final
from uuid import UUID

import jwt
from fastapi import Depends, Request
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.cache import get_redis
from app.core.config import get_settings
from app.core.cookies import JWT_COOKIE_NAME
from app.core.db import AsyncSessionLocal
from app.core.exceptions import AppError
from app.core.rate_limit import enforce_rate_limit
from app.core.security import decode_access_token
from app.models.user import User
from app.repositories.user_repository import UserRepository
from app.services.pricing_service import PricingService

# 登入 / 註冊限流門檻（→ BE-034 / CACHE-022）；註冊視窗較長因為正常使用者一天頂多註冊個位數次，
# 登入視窗較短因為合法使用者忘記密碼重試也可能在一分鐘內連續多次。
_LOGIN_RATE_LIMIT: Final[int] = 10
_LOGIN_RATE_LIMIT_WINDOW_SECONDS: Final[int] = 60
_REGISTER_RATE_LIMIT: Final[int] = 5
_REGISTER_RATE_LIMIT_WINDOW_SECONDS: Final[int] = 3600


async def get_db() -> AsyncIterator[AsyncSession]:
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


async def get_current_user(request: Request, db: Annotated[AsyncSession, Depends(get_db)]) -> User:
    token = request.cookies.get(JWT_COOKIE_NAME)
    if not token:
        raise AppError("未登入", status_code=401, response_code=401)
    try:
        payload = decode_access_token(token)
    except jwt.InvalidTokenError as e:
        raise AppError("登入已失效", status_code=401, response_code=401) from e
    user = await UserRepository(db).find_by_user_uid(UUID(str(payload["sub"])))
    if user is None or user.is_deleted:
        raise AppError("登入已失效", status_code=401, response_code=401)
    return user


async def require_admin(current_user: Annotated[User, Depends(get_current_user)]) -> User:
    """`ADMIN_EMAILS` 名單比對，403 不透露「有這個 endpoint 但你沒權限」以外的資訊
    （不用 404，因為 admin 路由本身存在與否不是需要隱藏的機密）。"""
    if current_user.email not in get_settings().ADMIN_EMAILS:
        raise AppError("沒有權限", status_code=403, response_code=403)
    return current_user


def get_pricing_service(redis: Annotated[Redis | None, Depends(get_redis)]) -> PricingService:
    """獨立成一個 dependency（而非在 endpoint 內直接 `PricingService(redis)`），供測試以
    `app.dependency_overrides` 換成假報價服務，避免整合測試依賴真實外部 API
    （→ AGENTS.md § Testing）。原本只有 `net_worth.py` 用，帳戶幣別換算上線後
    `dashboard.py` 也需要同一份匯率服務，移到這裡共用（→ 兩處使用即抽共用檔）。
    """
    return PricingService(redis=redis)


PricingServiceDep = Annotated[PricingService, Depends(get_pricing_service)]


def _client_ip(request: Request) -> str:
    return request.client.host if request.client is not None else "unknown"


async def enforce_login_rate_limit(
    request: Request, redis: Annotated[Redis | None, Depends(get_redis)]
) -> None:
    await enforce_rate_limit(
        redis,
        scope="login",
        subject=_client_ip(request),
        limit=_LOGIN_RATE_LIMIT,
        window_s=_LOGIN_RATE_LIMIT_WINDOW_SECONDS,
    )


async def enforce_register_rate_limit(
    request: Request, redis: Annotated[Redis | None, Depends(get_redis)]
) -> None:
    await enforce_rate_limit(
        redis,
        scope="register",
        subject=_client_ip(request),
        limit=_REGISTER_RATE_LIMIT,
        window_s=_REGISTER_RATE_LIMIT_WINDOW_SECONDS,
    )
