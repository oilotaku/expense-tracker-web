from collections.abc import AsyncIterator
from typing import Annotated
from uuid import UUID

import jwt
from fastapi import Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.cookies import JWT_COOKIE_NAME
from app.core.db import AsyncSessionLocal
from app.core.exceptions import AppError
from app.core.security import decode_access_token
from app.models.user import User
from app.repositories.user_repository import UserRepository


async def get_db() -> AsyncIterator[AsyncSession]:
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


async def get_current_user(
    request: Request, db: Annotated[AsyncSession, Depends(get_db)]
) -> User:
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
