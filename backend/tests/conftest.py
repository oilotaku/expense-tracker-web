from collections.abc import AsyncIterator

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import enforce_login_rate_limit, enforce_register_rate_limit, get_db
from app.core.db import engine
from app.main import app


@pytest.fixture
async def db() -> AsyncIterator[AsyncSession]:
    """每個測試包在外層 transaction，結束 rollback，測試間互不污染（BE-081）。

    schema 由 `alembic upgrade head` 事先建好（BE-080）；打真實 PostgreSQL，不 mock。
    """
    async with engine.connect() as conn:
        await conn.begin()
        session = AsyncSession(
            bind=conn, expire_on_commit=False, join_transaction_mode="create_savepoint"
        )
        try:
            yield session
        finally:
            await session.close()
            await conn.rollback()


@pytest.fixture
async def client(db: AsyncSession) -> AsyncIterator[AsyncClient]:
    async def _override_get_db() -> AsyncIterator[AsyncSession]:
        yield db

    app.dependency_overrides[get_db] = _override_get_db
    # 幾乎每個測試都會呼叫 `/auth/login`/`/auth/register`；限流是依（假）client IP 算，
    # ASGITransport 底下所有測試共用同一個假 IP，不 override 會被無關測試的登入次數觸發
    # 429。限流本身的正確性由 tests/api/test_auth_rate_limit.py 專門移除這兩個 override
    # 後驗證（同 get_pricing_service 的既有 override 慣例）。
    app.dependency_overrides[enforce_login_rate_limit] = lambda: None
    app.dependency_overrides[enforce_register_rate_limit] = lambda: None
    try:
        async with app.router.lifespan_context(app):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as ac:
                yield ac
    finally:
        app.dependency_overrides.clear()
