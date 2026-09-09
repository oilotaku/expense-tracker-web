from collections.abc import AsyncIterator
from typing import Annotated
from uuid import UUID

import jwt
from fastapi import Depends, Request
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.cache import get_redis
from app.core.cookies import JWT_COOKIE_NAME
from app.core.db import AsyncSessionLocal
from app.core.exceptions import AppError
from app.core.security import decode_access_token
from app.models.user import User
from app.repositories.user_repository import UserRepository
from app.services.pricing_service import PricingService


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


def get_pricing_service(redis: Annotated[Redis | None, Depends(get_redis)]) -> PricingService:
    """獨立成一個 dependency（而非在 endpoint 內直接 `PricingService(redis)`），供測試以
    `app.dependency_overrides` 換成假報價服務，避免整合測試依賴真實外部 API
    （→ AGENTS.md § Testing）。原本只有 `net_worth.py` 用，帳戶幣別換算上線後
    `dashboard.py` 也需要同一份匯率服務，移到這裡共用（→ 兩處使用即抽共用檔）。
    """
    return PricingService(redis=redis)


PricingServiceDep = Annotated[PricingService, Depends(get_pricing_service)]
