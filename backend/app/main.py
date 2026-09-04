from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from redis.asyncio import Redis

from app.api.v1 import router as api_router
from app.core.cache import create_redis
from app.core.config import get_settings
from app.core.db import engine
from app.core.exceptions import register_exception_handlers
from app.core.middleware import register_secure_headers


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings = get_settings()
    # 純加速型快取（→ CACHE-005/006/007）：未設定 REDIS_URL 時 redis 為 None，app 仍可啟動
    redis: Redis | None = create_redis(settings.REDIS_URL) if settings.REDIS_URL else None
    app.state.redis = redis
    yield
    if redis is not None:
        await redis.aclose()
    await engine.dispose()


def create_app() -> FastAPI:
    settings = get_settings()
    docs_enabled = settings.is_development  # production 關閉 API docs
    app = FastAPI(
        title=settings.APP_NAME,
        lifespan=lifespan,
        docs_url="/api/docs" if docs_enabled else None,
        redoc_url=None,
        openapi_url="/api/openapi.json" if docs_enabled else None,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type"],
    )
    register_secure_headers(app, settings)
    register_exception_handlers(app)
    app.include_router(api_router, prefix="/api/v1")
    return app


app = create_app()
