"""內部排程觸發 API（`POST /internal/recurring/run`）：獨立 secret 驗證，不走使用者 JWT。"""

from httpx import AsyncClient

from app.core.config import get_settings


async def test_run_recurring_without_secret_returns_401(client: AsyncClient) -> None:
    res = await client.post("/api/v1/internal/recurring/run")
    assert res.status_code == 401


async def test_run_recurring_with_wrong_secret_returns_401(client: AsyncClient) -> None:
    res = await client.post(
        "/api/v1/internal/recurring/run", headers={"X-Internal-Secret": "wrong-secret"}
    )
    assert res.status_code == 401


async def test_run_recurring_with_correct_secret_returns_200(client: AsyncClient) -> None:
    settings = get_settings()
    res = await client.post(
        "/api/v1/internal/recurring/run",
        headers={"X-Internal-Secret": settings.INTERNAL_TRIGGER_SECRET},
    )
    assert res.status_code == 200
    assert "generated" in res.json()["data"]
