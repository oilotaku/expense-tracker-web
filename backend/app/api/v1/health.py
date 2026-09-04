from typing import Annotated

from fastapi import APIRouter, Depends, Response, status
from redis.asyncio import Redis
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.core.cache import get_redis, ping_redis
from app.core.response import success
from app.schemas.response import ApiResponse

router = APIRouter()

DbSession = Annotated[AsyncSession, Depends(get_db)]
RedisDep = Annotated[Redis | None, Depends(get_redis)]


@router.get(
    "/health",
    response_model=ApiResponse[dict[str, str]],
    summary="健康檢查（db / redis）",
)
async def health(response: Response, db: DbSession, redis: RedisDep) -> ApiResponse[dict[str, str]]:
    checks: dict[str, str] = {}
    try:
        await db.execute(text("SELECT 1"))
        checks["db"] = "ok"
    except Exception:
        checks["db"] = "fail"
    # redis 屬純加速型快取（→ CACHE-025）："disabled"／"degraded" 不影響 HTTP 200
    checks["redis"] = await ping_redis(redis)
    if checks["db"] != "ok":
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    return success(data=checks)
