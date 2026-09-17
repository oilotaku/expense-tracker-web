"""登入 / 註冊限流：功能依賴型 Redis 使用（→ CACHE-007）。Redis 不可用時**禁放行**
（放行等於沒有限流），一律回 503（`error_code="CACHE_UNAVAILABLE"`），交由呼叫端決定要不要
重試；`production` 已由 `Settings._fail_fast` 強制 `REDIS_URL` 必設，不會啟動即無 Redis。

Sliding window 用 sorted set 一次 pipeline 完成（`ZREMRANGEBYSCORE` → `ZADD` → `ZCARD` →
`EXPIRE`），依 CACHE-022 範例寫法。
"""

from __future__ import annotations

import secrets
import time
from typing import Final

from redis.asyncio import Redis
from redis.exceptions import RedisError

from app.core.exceptions import AppError

_APP: Final[str] = "expense_tracker_web"
_VERSION: Final[str] = "v1"


class RateLimitExceededError(AppError):
    def __init__(self, retry_after: int) -> None:
        super().__init__(
            "請求過於頻繁，請稍後再試",
            response_code=429,
            status_code=429,
            error_code="RATE_LIMIT_EXCEEDED",
            headers={"Retry-After": str(retry_after)},
        )


class RateLimitUnavailableError(AppError):
    """Redis 不可用時的功能依賴型 fallback（→ CACHE-007）。"""

    def __init__(self) -> None:
        super().__init__(
            "服務暫時無法使用，請稍後再試",
            response_code=503,
            status_code=503,
            error_code="CACHE_UNAVAILABLE",
        )


def _rate_limit_key(scope: str, subject: str) -> str:
    return f"{_APP}:{_VERSION}:ratelimit:{scope}:{subject}"


async def enforce_rate_limit(
    redis: Redis | None, *, scope: str, subject: str, limit: int, window_s: int
) -> None:
    """超過 `limit` 次／`window_s` 秒 → `RateLimitExceededError`；Redis 不可用 →
    `RateLimitUnavailableError`。"""
    if redis is None:
        raise RateLimitUnavailableError()
    key = _rate_limit_key(scope, subject)
    now = time.time()
    member = f"{now}:{secrets.token_hex(4)}"
    try:
        async with redis.pipeline(transaction=True) as pipe:
            pipe.zremrangebyscore(key, 0, now - window_s)
            pipe.zadd(key, {member: now})
            pipe.zcard(key)
            pipe.expire(key, window_s)
            results = await pipe.execute()
    except RedisError as e:
        raise RateLimitUnavailableError() from e
    count = int(results[2])
    if count > limit:
        raise RateLimitExceededError(retry_after=window_s)
