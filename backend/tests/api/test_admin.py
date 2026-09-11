"""後台管理 API：權限（ADMIN_EMAILS 名單）、使用者清單、刪除、重設密碼強制改密碼流程。"""

import pytest
from httpx import AsyncClient

from app.core.config import get_settings

_PASSWORD = "correct horse battery"


async def _register_and_login(client: AsyncClient, email: str) -> None:
    payload = {"email": email, "password": _PASSWORD}
    await client.post("/api/v1/auth/register", json=payload)
    res = await client.post("/api/v1/auth/login", json=payload)
    assert res.status_code == 200


def _make_admin(monkeypatch: pytest.MonkeyPatch, *emails: str) -> None:
    monkeypatch.setattr(get_settings(), "ADMIN_EMAILS", list(emails))


async def test_non_admin_gets_403_on_admin_routes(client: AsyncClient) -> None:
    await _register_and_login(client, "not-admin@example.com")
    res = await client.get("/api/v1/admin/users")
    assert res.status_code == 403


async def test_admin_can_list_users_with_account_counts(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    _make_admin(monkeypatch, "admin-list@example.com")

    # 每個新使用者註冊時 DB trigger（trg_users_seed_default_accounts）會自動種 2 個預設帳戶
    # （現金/銀行，→ migration add_default_accounts），這裡再手動建 1 個，預期共 3 個。
    await _register_and_login(client, "member-list@example.com")
    await client.post(
        "/api/v1/accounts",
        json={"name": "副業收入", "balance": "0.00", "color": "#8B6ED6", "icon": "wallet"},
    )

    await _register_and_login(client, "admin-list@example.com")
    res = await client.get("/api/v1/admin/users")
    assert res.status_code == 200
    body = res.json()["data"]
    by_email = {item["email"]: item for item in body["items"]}
    assert by_email["member-list@example.com"]["account_count"] == 3
    assert by_email["member-list@example.com"]["transaction_count"] == 0
    assert by_email["admin-list@example.com"]["account_count"] == 2
    # 兩者都在這個測試裡登入過，last_login_at 不應該是 None（task-038）
    assert by_email["member-list@example.com"]["last_login_at"] is not None
    assert by_email["admin-list@example.com"]["last_login_at"] is not None


async def test_admin_cannot_delete_own_account(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    _make_admin(monkeypatch, "admin-self@example.com")
    await _register_and_login(client, "admin-self@example.com")
    me = (await client.get("/api/v1/auth/me")).json()["data"]

    res = await client.delete(f"/api/v1/admin/users/{me['user_uid']}")
    assert res.status_code == 409


async def test_admin_delete_nonexistent_user_returns_404(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    _make_admin(monkeypatch, "admin-404@example.com")
    await _register_and_login(client, "admin-404@example.com")
    res = await client.delete("/api/v1/admin/users/00000000-0000-4000-8000-000000000000")
    assert res.status_code == 404


async def test_admin_delete_user_soft_deletes_and_blocks_login(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    _make_admin(monkeypatch, "admin-delete@example.com")

    await _register_and_login(client, "member-delete@example.com")
    member = (await client.get("/api/v1/auth/me")).json()["data"]

    await _register_and_login(client, "admin-delete@example.com")
    res = await client.delete(f"/api/v1/admin/users/{member['user_uid']}")
    assert res.status_code == 200

    login_res = await client.post(
        "/api/v1/auth/login",
        json={"email": "member-delete@example.com", "password": _PASSWORD},
    )
    assert login_res.status_code == 401


async def test_admin_reset_password_forces_must_change_password_on_next_login(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    _make_admin(monkeypatch, "admin-reset@example.com")

    await _register_and_login(client, "member-reset@example.com")
    member = (await client.get("/api/v1/auth/me")).json()["data"]
    assert member["must_change_password"] is False

    await _register_and_login(client, "admin-reset@example.com")
    reset_res = await client.post(f"/api/v1/admin/users/{member['user_uid']}/reset-password")
    assert reset_res.status_code == 201
    temporary_password = reset_res.json()["data"]["temporary_password"]
    assert len(temporary_password) >= 8

    # 舊密碼失效
    old_login = await client.post(
        "/api/v1/auth/login",
        json={"email": "member-reset@example.com", "password": _PASSWORD},
    )
    assert old_login.status_code == 401

    # 臨時密碼可登入，且回應標記 must_change_password
    new_login = await client.post(
        "/api/v1/auth/login",
        json={"email": "member-reset@example.com", "password": temporary_password},
    )
    assert new_login.status_code == 200
    assert new_login.json()["data"]["must_change_password"] is True

    # 改密碼後 flag 清除
    change_res = await client.patch(
        "/api/v1/auth/change-password",
        json={"current_password": temporary_password, "new_password": "a-brand-new-password"},
    )
    assert change_res.status_code == 200

    me_after = (await client.get("/api/v1/auth/me")).json()["data"]
    assert me_after["must_change_password"] is False

    final_login = await client.post(
        "/api/v1/auth/login",
        json={"email": "member-reset@example.com", "password": "a-brand-new-password"},
    )
    assert final_login.status_code == 200


async def test_admin_reset_password_nonexistent_user_returns_404(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    _make_admin(monkeypatch, "admin-reset-404@example.com")
    await _register_and_login(client, "admin-reset-404@example.com")
    res = await client.post(
        "/api/v1/admin/users/00000000-0000-4000-8000-000000000000/reset-password"
    )
    assert res.status_code == 404


async def test_registered_but_never_logged_in_user_has_null_last_login_at(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    _make_admin(monkeypatch, "admin-nulllogin@example.com")

    # 只註冊不登入（register 本身不設 cookie，不算一次登入，→ backend/app/api/v1/auth.py）
    await client.post(
        "/api/v1/auth/register",
        json={"email": "never-logged-in@example.com", "password": _PASSWORD},
    )

    await _register_and_login(client, "admin-nulllogin@example.com")
    res = await client.get("/api/v1/admin/users")
    body = res.json()["data"]
    by_email = {item["email"]: item for item in body["items"]}
    assert by_email["never-logged-in@example.com"]["last_login_at"] is None


async def test_pin_login_also_updates_last_login_at(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    _make_admin(monkeypatch, "admin-pinlogin@example.com")

    await _register_and_login(client, "member-pinlogin@example.com")
    member = (await client.get("/api/v1/auth/me")).json()["data"]
    set_pin_res = await client.post(
        "/api/v1/auth/pin", json={"pin": "123456", "password": _PASSWORD}
    )
    assert set_pin_res.status_code == 201

    pin_login_res = await client.post(
        "/api/v1/auth/login/pin", json={"user_uid": member["user_uid"], "pin": "123456"}
    )
    assert pin_login_res.status_code == 200

    await _register_and_login(client, "admin-pinlogin@example.com")
    res = await client.get("/api/v1/admin/users")
    by_email = {item["email"]: item for item in res.json()["data"]["items"]}
    assert by_email["member-pinlogin@example.com"]["last_login_at"] is not None


async def test_change_password_wrong_current_password_returns_401(client: AsyncClient) -> None:
    await _register_and_login(client, "change-pw-wrong@example.com")
    res = await client.patch(
        "/api/v1/auth/change-password",
        json={"current_password": "wrong password", "new_password": "another-new-password"},
    )
    assert res.status_code == 401
