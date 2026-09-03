from uuid import UUID

from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import UserCredential

_PASSWORD = "correct horse battery"


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
