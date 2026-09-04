"""Redis 連線與 cache-aside 輔助函式。

本專案的快取屬**純加速型快取**（→ CACHE-007）：Redis 不可用或發生 `RedisError` 時一律
退化為直接呼叫來源（呼叫端自行處理，本檔只回傳 `None`），只記 `WARNING`，**不**向使用者回錯。
所有 Redis 內容皆可由外部來源（第三方報價 API）重建，清空 Redis 只會讓系統變慢。

一個 `Redis` client 建立於 app lifespan（`app/main.py`），掛在 `app.state.redis`，關閉時
`aclose()`；**禁**在 request 或 service 內另外 `Redis.from_url()`（→ CACHE-005）。

key 命名 / TTL → `rules/40-cache/01-keys-and-ttl.md`；cache-aside 模式 → `02-patterns.md`。
"""

from __future__ import annotations

import logging
from typing import cast

from fastapi import Request
from redis.asyncio import Redis
from redis.exceptions import RedisError

logger = logging.getLogger(__name__)


def create_redis(url: str) -> Redis:
    """建立單一 Redis client（→ CACHE-004 / CACHE-005）。"""
    return Redis.from_url(
        url,
        decode_responses=False,
        socket_timeout=1.0,
        socket_connect_timeout=1.0,
        health_check_interval=30,
    )


def get_redis(request: Request) -> Redis | None:
    """FastAPI dependency：取得 lifespan 建立的 Redis client；未啟用 Redis 時回 `None`。"""
    redis: Redis | None = getattr(request.app.state, "redis", None)
    return redis


async def get_cached_bytes(redis: Redis | None, key: str) -> bytes | None:
    """純加速型快取讀取：Redis 未啟用或發生錯誤時回 `None`，呼叫端退化查來源（→ CACHE-007）。"""
    if redis is None:
        return None
    try:
        # decode_responses=False（create_redis）保證回傳 bytes；redis-py 的型別樁不知道這點
        value = cast(bytes | None, await redis.get(key))
    except RedisError:
        logger.warning(
            "redis unavailable, fallback to source", extra={"cache": "error", "key": key}
        )
        return None
    if value is not None:
        logger.debug("cache hit", extra={"cache": "hit", "key": key})
    else:
        logger.debug("cache miss", extra={"cache": "miss", "key": key})
    return value


async def set_cached_bytes(redis: Redis | None, key: str, value: bytes, ttl: int) -> None:
    """純加速型快取寫入：每次寫入必帶 TTL（→ CACHE-012）；Redis 不可用時靜默略過。"""
    if redis is None:
        return
    try:
        await redis.set(key, value, ex=ttl)
    except RedisError:
        logger.warning("redis unavailable, skip cache write", extra={"cache": "error", "key": key})


async def ping_redis(redis: Redis | None) -> str:
    """供 `/api/v1/health` 使用（→ CACHE-025）：回傳 `"ok" | "degraded" | "disabled"`。"""
    if redis is None:
        return "disabled"
    try:
        await redis.ping()
    except RedisError:
        return "degraded"
    return "ok"
