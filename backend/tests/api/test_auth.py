from uuid import UUID

from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import UserCredential

_PASSWORD = "correct horse battery"
_PIN = "123456"


async def test_register_creates_user_with_hashed_password(
    client: AsyncClient, db: AsyncSession
) -> None:
    res = await client.post(
        "/api/v1/auth/register",
        json={"email": "user-1@example.com", "password": _PASSWORD},
    )
    assert res.status_code == 201
    body = res.json()
    assert body["success"] is True
    assert body["data"]["email"] == "user-1@example.com"
    # 新帳號一定還沒有 PIN（PIN 只能登入後在設定頁設）
    assert body["data"]["has_pin"] is False
    # 預設不是 admin、不用強制改密碼（ADMIN_EMAILS 測試環境預設空清單）
    assert body["data"]["is_admin"] is False
    assert body["data"]["must_change_password"] is False
    user_uid = UUID(body["data"]["user_uid"])

    credential = (
        await db.execute(select(UserCredential).where(UserCredential.user_uid == user_uid))
    ).scalar_one()
    assert credential.password_hash != _PASSWORD
    assert credential.password_hash.startswith("$2b$")


async def test_register_duplicate_email_returns_4xx_not_500(client: AsyncClient) -> None:
    payload = {"email": "user-2@example.com", "password": _PASSWORD}
    first = await client.post("/api/v1/auth/register", json=payload)
    assert first.status_code == 201

    second = await client.post("/api/v1/auth/register", json=payload)
    assert 400 <= second.status_code < 500
    assert second.json()["success"] is False


async def test_register_duplicate_email_case_insensitive(client: AsyncClient) -> None:
    await client.post(
        "/api/v1/auth/register",
        json={"email": "user-2b@example.com", "password": _PASSWORD},
    )
    res = await client.post(
        "/api/v1/auth/register",
        json={"email": "User-2B@Example.com", "password": _PASSWORD},
    )
    assert 400 <= res.status_code < 500


async def test_login_succeeds_and_sets_cookie(client: AsyncClient) -> None:
    payload = {"email": "user-3@example.com", "password": _PASSWORD}
    await client.post("/api/v1/auth/register", json=payload)

    res = await client.post("/api/v1/auth/login", json=payload)
    assert res.status_code == 200
    body = res.json()
    assert body["success"] is True
    assert body["data"]["email"] == "user-3@example.com"
    assert "access_token=" in res.headers.get("set-cookie", "")


async def test_login_wrong_password_returns_401(client: AsyncClient) -> None:
    payload = {"email": "user-4@example.com", "password": _PASSWORD}
    await client.post("/api/v1/auth/register", json=payload)

    res = await client.post(
        "/api/v1/auth/login", json={"email": payload["email"], "password": "wrong password"}
    )
    assert res.status_code == 401
    assert res.json()["success"] is False


async def test_login_unknown_email_returns_401(client: AsyncClient) -> None:
    res = await client.post(
        "/api/v1/auth/login",
        json={"email": "no-such-user@example.com", "password": "whatever password"},
    )
    assert res.status_code == 401


async def test_me_returns_has_pin_false_before_setup_and_true_after(client: AsyncClient) -> None:
    payload = {"email": "user-5@example.com", "password": _PASSWORD}
    await client.post("/api/v1/auth/register", json=payload)
    login = await client.post("/api/v1/auth/login", json=payload)
    assert login.status_code == 200
    assert login.json()["data"]["has_pin"] is False

    before = await client.get("/api/v1/auth/me")
    assert before.status_code == 200
    body = before.json()
    assert body["data"]["email"] == payload["email"]
    assert body["data"]["has_pin"] is False

    set_pin = await client.post("/api/v1/auth/pin", json={"pin": _PIN, "password": _PASSWORD})
    assert set_pin.status_code == 201

    after = await client.get("/api/v1/auth/me")
    assert after.status_code == 200
    assert after.json()["data"]["has_pin"] is True


async def test_me_without_cookie_returns_401(client: AsyncClient) -> None:
    res = await client.get("/api/v1/auth/me")
    assert res.status_code == 401


async def test_logout_clears_cookie_and_revokes_session(client: AsyncClient) -> None:
    """task-034：httpOnly cookie 原本只能等 TTL 過期，`/auth/logout` 讓它可以主動撤銷。"""
    payload = {"email": "user-6@example.com", "password": _PASSWORD}
    await client.post("/api/v1/auth/register", json=payload)
    await client.post("/api/v1/auth/login", json=payload)

    before = await client.get("/api/v1/auth/me")
    assert before.status_code == 200

    logout = await client.post("/api/v1/auth/logout")
    assert logout.status_code == 200
    assert logout.json()["success"] is True
    set_cookie = logout.headers.get("set-cookie", "")
    assert 'access_token=""' in set_cookie
    assert "Max-Age=0" in set_cookie

    after = await client.get("/api/v1/auth/me")
    assert after.status_code == 401


async def test_logout_without_cookie_still_succeeds(client: AsyncClient) -> None:
    res = await client.post("/api/v1/auth/logout")
    assert res.status_code == 200
    assert res.json()["success"] is True
