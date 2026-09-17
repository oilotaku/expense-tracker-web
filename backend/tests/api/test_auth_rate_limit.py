"""登入 / 註冊限流（→ BE-034）：真實 Redis 滑動視窗，`limit+1` 次回 429（→ CACHE-026）。

`conftest.py` 的 `client` fixture 預設把這兩個限流 dependency override 成 no-op（避免其他
測試共用同一個假 client IP 而互相觸發），這裡故意移除 override 才走真實限流路徑。
"""

import pytest
from httpx import AsyncClient

from app.api.deps import enforce_login_rate_limit, enforce_register_rate_limit
from app.core.rate_limit import RateLimitUnavailableError, enforce_rate_limit
from app.main import app

_PASSWORD = "correct horse battery"


async def test_login_rate_limit_returns_429_after_limit_exceeded(client: AsyncClient) -> None:
    email = "rate-limit-login@example.com"
    await client.post("/api/v1/auth/register", json={"email": email, "password": _PASSWORD})

    del app.dependency_overrides[enforce_login_rate_limit]
    responses = []
    for _ in range(11):
        res = await client.post("/api/v1/auth/login", json={"email": email, "password": _PASSWORD})
        responses.append(res)

    assert [r.status_code for r in responses[:10]] == [200] * 10
    assert responses[10].status_code == 429
    assert "Retry-After" in responses[10].headers


async def test_register_rate_limit_returns_429_after_limit_exceeded(client: AsyncClient) -> None:
    del app.dependency_overrides[enforce_register_rate_limit]
    responses = []
    for i in range(6):
        res = await client.post(
            "/api/v1/auth/register",
            json={"email": f"rate-limit-register-{i}@example.com", "password": _PASSWORD},
        )
        responses.append(res)

    assert [r.status_code for r in responses[:5]] == [201] * 5
    assert responses[5].status_code == 429
    assert "Retry-After" in responses[5].headers


async def test_enforce_rate_limit_without_redis_raises_unavailable() -> None:
    with pytest.raises(RateLimitUnavailableError) as exc_info:
        await enforce_rate_limit(None, scope="login", subject="1.2.3.4", limit=10, window_s=60)
    assert exc_info.value.status_code == 503
    assert exc_info.value.error_code == "CACHE_UNAVAILABLE"
