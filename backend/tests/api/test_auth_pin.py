"""PIN 登入（design-spec §12.2）：首次設定 / 變更 / 停用 / PIN 快速登入 + 鎖定機制。"""

from uuid import UUID

from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import UserCredential

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
