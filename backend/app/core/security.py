import asyncio
from datetime import UTC, datetime, timedelta

import jwt
from passlib.context import CryptContext

from app.core.config import get_settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
JWT_ALGORITHM = "HS256"


def hash_password(plain: str) -> str:
    # passlib 無型別（ignore_missing_imports）→ 明確收斂為 str，避免 no-any-return
    return str(pwd_context.hash(plain))


def verify_password(plain: str, hashed: str) -> bool:
    return bool(pwd_context.verify(plain, hashed))


async def hash_password_async(plain: str) -> str:
    return await asyncio.to_thread(hash_password, plain)


async def verify_password_async(plain: str, hashed: str) -> bool:
    return await asyncio.to_thread(verify_password, plain, hashed)


def create_access_token(subject: str, expires_in: timedelta = timedelta(hours=8)) -> str:
    now = datetime.now(UTC)
    payload = {"sub": subject, "iat": now, "exp": now + expires_in}
    return jwt.encode(payload, get_settings().JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)


def decode_access_token(token: str) -> dict[str, object]:
    decoded: dict[str, object] = jwt.decode(
        token, get_settings().JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM]
    )
    return decoded
