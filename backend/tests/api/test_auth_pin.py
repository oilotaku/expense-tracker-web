"""PIN 登入（design-spec §12.2）：首次設定 / 變更 / 停用 / PIN 快速登入 + 鎖定機制。"""

from collections.abc import AsyncIterator
from uuid import UUID

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import AsyncSessionLocal
from app.main import app
from app.models.category import Category
from app.models.user import User, UserCredential

_PASSWORD = "correct horse battery"
_PIN = "123456"
_OTHER_PIN = "654321"


async def _register_and_login(client: AsyncClient, email: str) -> UUID:
    payload = {"email": email, "password": _PASSWORD}
    res = await client.post("/api/v1/auth/register", json=payload)
    login_res = await client.post("/api/v1/auth/login", json=payload)
    assert login_res.status_code == 200
    return UUID(res.json()["data"]["user_uid"])


async def _credential_for(db: AsyncSession, user_uid: UUID) -> UserCredential:
    return (
        await db.execute(select(UserCredential).where(UserCredential.user_uid == user_uid))
    ).scalar_one()


async def test_set_pin_first_time_succeeds(client: AsyncClient, db: AsyncSession) -> None:
    user_uid = await _register_and_login(client, "pin-1@example.com")

    res = await client.post("/api/v1/auth/pin", json={"pin": _PIN, "password": _PASSWORD})
    assert res.status_code == 201
    assert res.json()["success"] is True

    credential = await _credential_for(db, user_uid)
    assert credential.pin_hash is not None
    assert credential.pin_hash != _PIN
    assert credential.pin_updated_at is not None


async def test_set_pin_when_already_set_returns_409(client: AsyncClient) -> None:
    await _register_and_login(client, "pin-2@example.com")
    first = await client.post("/api/v1/auth/pin", json={"pin": _PIN, "password": _PASSWORD})
    assert first.status_code == 201

    second = await client.post("/api/v1/auth/pin", json={"pin": _OTHER_PIN, "password": _PASSWORD})
    assert second.status_code == 409
    assert second.json()["success"] is False


async def test_set_pin_wrong_password_returns_401(client: AsyncClient) -> None:
    await _register_and_login(client, "pin-3@example.com")
    res = await client.post("/api/v1/auth/pin", json={"pin": _PIN, "password": "wrong password"})
    assert res.status_code == 401


async def test_set_pin_without_jwt_returns_401(client: AsyncClient) -> None:
    res = await client.post("/api/v1/auth/pin", json={"pin": _PIN, "password": _PASSWORD})
    assert res.status_code == 401


async def test_change_pin_requires_correct_current_pin(client: AsyncClient) -> None:
    user_uid = await _register_and_login(client, "pin-4@example.com")
    await client.post("/api/v1/auth/pin", json={"pin": _PIN, "password": _PASSWORD})

    wrong = await client.patch(
        "/api/v1/auth/pin", json={"current_pin": "000000", "new_pin": _OTHER_PIN}
    )
    assert wrong.status_code == 401

    ok = await client.patch("/api/v1/auth/pin", json={"current_pin": _PIN, "new_pin": _OTHER_PIN})
    assert ok.status_code == 200
    assert ok.json()["success"] is True

    # 新 PIN 生效、舊 PIN 失效
    old_pin_login = await client.post(
        "/api/v1/auth/login/pin", json={"user_uid": str(user_uid), "pin": _PIN}
    )
    assert old_pin_login.status_code == 401

    new_pin_login = await client.post(
        "/api/v1/auth/login/pin", json={"user_uid": str(user_uid), "pin": _OTHER_PIN}
    )
    assert new_pin_login.status_code == 200


async def test_change_pin_without_jwt_returns_401(client: AsyncClient) -> None:
    res = await client.patch("/api/v1/auth/pin", json={"current_pin": _PIN, "new_pin": _OTHER_PIN})
    assert res.status_code == 401


async def test_disable_pin_requires_password(client: AsyncClient) -> None:
    await _register_and_login(client, "pin-5@example.com")
    await client.post("/api/v1/auth/pin", json={"pin": _PIN, "password": _PASSWORD})

    wrong = await client.request("DELETE", "/api/v1/auth/pin", json={"password": "wrong password"})
    assert wrong.status_code == 401

    ok = await client.request("DELETE", "/api/v1/auth/pin", json={"password": _PASSWORD})
    assert ok.status_code == 200
    assert ok.json()["success"] is True


async def test_disable_pin_without_jwt_returns_401(client: AsyncClient) -> None:
    res = await client.request("DELETE", "/api/v1/auth/pin", json={"password": _PASSWORD})
    assert res.status_code == 401


async def test_login_pin_succeeds_and_sets_cookie(client: AsyncClient) -> None:
    user_uid = await _register_and_login(client, "pin-6@example.com")
    await client.post("/api/v1/auth/pin", json={"pin": _PIN, "password": _PASSWORD})

    fresh_client = client
    res = await fresh_client.post(
        "/api/v1/auth/login/pin", json={"user_uid": str(user_uid), "pin": _PIN}
    )
    assert res.status_code == 200
    body = res.json()
    assert body["success"] is True
    assert body["data"]["user_uid"] == str(user_uid)
    assert "access_token=" in res.headers.get("set-cookie", "")


async def test_login_pin_locks_after_five_failures_and_returns_429(
    client: AsyncClient, db: AsyncSession
) -> None:
    user_uid = await _register_and_login(client, "pin-7@example.com")
    await client.post("/api/v1/auth/pin", json={"pin": _PIN, "password": _PASSWORD})

    for _ in range(5):
        res = await client.post(
            "/api/v1/auth/login/pin", json={"user_uid": str(user_uid), "pin": "000000"}
        )
        assert res.status_code == 401

    sixth = await client.post(
        "/api/v1/auth/login/pin", json={"user_uid": str(user_uid), "pin": "000000"}
    )
    assert sixth.status_code == 429

    # 鎖定期間內，正確 PIN 也回 429（不再比對 PIN 本身）
    correct_during_lock = await client.post(
        "/api/v1/auth/login/pin", json={"user_uid": str(user_uid), "pin": _PIN}
    )
    assert correct_during_lock.status_code == 429

    credential = await _credential_for(db, user_uid)
    assert credential.pin_locked_until is not None


async def test_login_pin_resets_failed_attempts_on_success(
    client: AsyncClient, db: AsyncSession
) -> None:
    user_uid = await _register_and_login(client, "pin-8@example.com")
    await client.post("/api/v1/auth/pin", json={"pin": _PIN, "password": _PASSWORD})

    for _ in range(2):
        res = await client.post(
            "/api/v1/auth/login/pin", json={"user_uid": str(user_uid), "pin": "000000"}
        )
        assert res.status_code == 401

    credential_before = await _credential_for(db, user_uid)
    assert credential_before.pin_failed_attempts == 2

    ok = await client.post("/api/v1/auth/login/pin", json={"user_uid": str(user_uid), "pin": _PIN})
    assert ok.status_code == 200

    credential_after = await _credential_for(db, user_uid)
    assert credential_after.pin_failed_attempts == 0
    assert credential_after.pin_locked_until is None


async def test_login_pin_unknown_user_and_unset_pin_share_same_message(
    client: AsyncClient,
) -> None:
    # user_uid 不存在
    unknown = await client.post(
        "/api/v1/auth/login/pin",
        json={"user_uid": "00000000-0000-4000-8000-000000000000", "pin": _PIN},
    )
    assert unknown.status_code == 401

    # 使用者存在但未設定 PIN
    user_uid = await _register_and_login(client, "pin-9@example.com")
    not_set = await client.post(
        "/api/v1/auth/login/pin", json={"user_uid": str(user_uid), "pin": _PIN}
    )
    assert not_set.status_code == 401

    assert unknown.json()["detail"] == not_set.json()["detail"]


async def test_set_pin_invalid_format_returns_422(client: AsyncClient) -> None:
    await _register_and_login(client, "pin-10@example.com")
    res = await client.post("/api/v1/auth/pin", json={"pin": "12ab56", "password": _PASSWORD})
    assert res.status_code == 422


async def _cleanup_real_user(user_uid: UUID) -> None:
    """這組測試不走 conftest 的 db fixture（那個外層 transaction 最後會 rollback），
    改用真實 get_db，會真的 commit 進 DB，所以要自己清乾淨。

    註冊會觸發 DB trigger（`trg_users_seed_default_categories`，見
    `backend/alembic/versions/2026_09_04_0900-add_categories.py`）自動種預設分類，
    須先刪 categories 才能刪 users（FK）。
    """
    async with AsyncSessionLocal() as session:
        await session.execute(delete(Category).where(Category.user_uid == user_uid))
        await session.execute(delete(UserCredential).where(UserCredential.user_uid == user_uid))
        await session.execute(delete(User).where(User.user_uid == user_uid))
        await session.commit()


@pytest.fixture
async def real_client() -> AsyncIterator[AsyncClient]:
    """task-030：**不** override `get_db`，走正式的 commit/rollback 生命週期。

    `conftest.py` 的 `client` fixture 把 `get_db` override 成直接 yield 測試用的
    `db`（外層 transaction + 最後 rollback），完全繞過正式 `get_db` 的
    try/commit/except/rollback，這正是先前 PIN 鎖定計數假綠燈的根源。這裡對照
    既有 `client` fixture 的 lifespan 管理方式，唯一差異是不做 dependency override。
    """
    async with app.router.lifespan_context(app):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            yield ac


async def test_login_pin_lockout_persists_across_independent_requests_via_real_get_db(
    real_client: AsyncClient,
) -> None:
    """task-030：用真實 app + 真實 get_db（見 `real_client` fixture），
    並用另一條全新的 session（獨立連線）讀回資料，驗證鎖定計數是「真的持久化到
    DB」而不是同一個 session 內的物件狀態錯覺。"""
    email = "pin-lockout-real-get-db@example.com"
    user_uid: UUID | None = None
    try:
        user_uid = await _register_and_login(real_client, email)
        set_res = await real_client.post(
            "/api/v1/auth/pin", json={"pin": _PIN, "password": _PASSWORD}
        )
        assert set_res.status_code == 201

        for _ in range(5):
            res = await real_client.post(
                "/api/v1/auth/login/pin",
                json={"user_uid": str(user_uid), "pin": "000000"},
            )
            assert res.status_code == 401

        sixth = await real_client.post(
            "/api/v1/auth/login/pin",
            json={"user_uid": str(user_uid), "pin": "000000"},
        )
        assert sixth.status_code == 429

        # 鎖定期間內，正確 PIN 也回 429（不再比對 PIN 本身）
        correct_during_lock = await real_client.post(
            "/api/v1/auth/login/pin",
            json={"user_uid": str(user_uid), "pin": _PIN},
        )
        assert correct_during_lock.status_code == 429

        # 每次請求都經過真實 get_db；這裡再開一條全新連線 / session 讀回，
        # 若先前的 commit 沒有真的落地，這裡會讀到 pin_failed_attempts == 0。
        async with AsyncSessionLocal() as fresh_session:
            credential = await _credential_for(fresh_session, user_uid)
            assert credential.pin_failed_attempts >= 5
            assert credential.pin_locked_until is not None
    finally:
        if user_uid is not None:
            await _cleanup_real_user(user_uid)


async def test_login_pin_reset_on_success_persists_across_independent_requests_via_real_get_db(
    real_client: AsyncClient,
) -> None:
    """task-030：成功登入後 pin_failed_attempts 歸零，同樣要用真實 get_db 驗證
    跨連線可見，而不是只驗同一個 session 內的物件狀態。"""
    email = "pin-reset-real-get-db@example.com"
    user_uid: UUID | None = None
    try:
        user_uid = await _register_and_login(real_client, email)
        await real_client.post("/api/v1/auth/pin", json={"pin": _PIN, "password": _PASSWORD})

        for _ in range(2):
            res = await real_client.post(
                "/api/v1/auth/login/pin",
                json={"user_uid": str(user_uid), "pin": "000000"},
            )
            assert res.status_code == 401

        ok = await real_client.post(
            "/api/v1/auth/login/pin",
            json={"user_uid": str(user_uid), "pin": _PIN},
        )
        assert ok.status_code == 200

        async with AsyncSessionLocal() as fresh_session:
            credential = await _credential_for(fresh_session, user_uid)
            assert credential.pin_failed_attempts == 0
            assert credential.pin_locked_until is None
    finally:
        if user_uid is not None:
            await _cleanup_real_user(user_uid)
