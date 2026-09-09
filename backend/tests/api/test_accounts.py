import re
from datetime import UTC, datetime
from decimal import Decimal
from uuid import UUID

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories.account_repository import AccountRepository
from app.repositories.user_repository import UserRepository

_PASSWORD = "correct horse battery"
_COLOR_RE = re.compile(r"^#[0-9A-Fa-f]{6}$")
# 註冊時由 DB trigger 自動種入（2026_09_09_0900-add_default_accounts），故新使用者的
# 帳戶清單基準是 2 筆而非 0 筆。
_DEFAULT_ACCOUNT_NAMES = {"現金", "銀行"}
_DEFAULT_ACCOUNT_COUNT = len(_DEFAULT_ACCOUNT_NAMES)


async def _register_and_login(client: AsyncClient, email: str) -> None:
    payload = {"email": email, "password": _PASSWORD}
    await client.post("/api/v1/auth/register", json=payload)
    res = await client.post("/api/v1/auth/login", json=payload)
    assert res.status_code == 200


async def test_create_account_without_jwt_returns_401(client: AsyncClient) -> None:
    res = await client.post(
        "/api/v1/accounts",
        json={"name": "現金", "balance": "1000.00", "color": "#8B6ED6", "icon": "wallet"},
    )
    assert res.status_code == 401
    assert res.json()["success"] is False


async def test_list_accounts_without_jwt_returns_401(client: AsyncClient) -> None:
    res = await client.get("/api/v1/accounts")
    assert res.status_code == 401


async def test_create_and_list_account(client: AsyncClient) -> None:
    await _register_and_login(client, "acct-owner-1@example.com")

    create_res = await client.post(
        "/api/v1/accounts",
        json={"name": "現金", "balance": "1000.00", "color": "#8B6ED6", "icon": "wallet"},
    )
    assert create_res.status_code == 201
    body = create_res.json()
    assert body["success"] is True
    assert body["data"]["name"] == "現金"
    assert body["data"]["balance"] == "1000.00"
    assert isinstance(body["data"]["balance"], str)
    assert body["data"]["color"] == "#8B6ED6"
    assert body["data"]["icon"] == "wallet"
    account_uid = body["data"]["account_uid"]

    list_res = await client.get("/api/v1/accounts")
    assert list_res.status_code == 200
    list_body = list_res.json()
    assert list_body["data"]["total"] == _DEFAULT_ACCOUNT_COUNT + 1
    assert account_uid in {item["account_uid"] for item in list_body["data"]["items"]}


async def test_new_user_gets_default_accounts(client: AsyncClient) -> None:
    """註冊即由 users 的 AFTER INSERT trigger 種入「現金」「銀行」兩個預設帳戶，餘額 0。"""
    await _register_and_login(client, "acct-default-seed@example.com")

    res = await client.get("/api/v1/accounts")
    assert res.status_code == 200
    body = res.json()["data"]
    assert body["total"] == _DEFAULT_ACCOUNT_COUNT
    assert {item["name"] for item in body["items"]} == _DEFAULT_ACCOUNT_NAMES
    assert {item["balance"] for item in body["items"]} == {"0.00"}
    assert all(_COLOR_RE.match(item["color"]) for item in body["items"])
    assert all(item["icon"] for item in body["items"])


async def test_create_account_invalid_color_returns_422(client: AsyncClient) -> None:
    await _register_and_login(client, "acct-owner-1b@example.com")

    res = await client.post(
        "/api/v1/accounts",
        json={"name": "現金", "balance": "0.00", "color": "not-a-color", "icon": "wallet"},
    )
    assert res.status_code == 422


async def test_create_account_without_currency_defaults_to_twd(client: AsyncClient) -> None:
    await _register_and_login(client, "acct-currency-default@example.com")
    res = await client.post(
        "/api/v1/accounts",
        json={"name": "現金", "balance": "0.00", "color": "#8B6ED6", "icon": "wallet"},
    )
    assert res.status_code == 201
    assert res.json()["data"]["currency"] == "TWD"


async def test_create_account_with_foreign_currency(client: AsyncClient) -> None:
    await _register_and_login(client, "acct-currency-foreign@example.com")
    res = await client.post(
        "/api/v1/accounts",
        json={
            "name": "美金帳戶",
            "balance": "100.00",
            "color": "#8B6ED6",
            "icon": "wallet",
            "currency": "USD",
        },
    )
    assert res.status_code == 201
    assert res.json()["data"]["currency"] == "USD"


async def test_create_account_invalid_currency_returns_422(client: AsyncClient) -> None:
    await _register_and_login(client, "acct-currency-invalid@example.com")
    res = await client.post(
        "/api/v1/accounts",
        json={
            "name": "假幣帳戶",
            "balance": "0.00",
            "color": "#8B6ED6",
            "icon": "wallet",
            "currency": "XXX",
        },
    )
    assert res.status_code == 422


async def test_update_account_does_not_accept_currency_change(client: AsyncClient) -> None:
    await _register_and_login(client, "acct-currency-immutable@example.com")
    create_res = await client.post(
        "/api/v1/accounts",
        json={
            "name": "美金帳戶",
            "balance": "100.00",
            "color": "#8B6ED6",
            "icon": "wallet",
            "currency": "USD",
        },
    )
    account_uid = create_res.json()["data"]["account_uid"]

    res = await client.patch(f"/api/v1/accounts/{account_uid}", json={"currency": "JPY"})
    assert res.status_code == 200
    # AccountUpdateRequest 沒有 currency 欄位，多餘欄位被忽略，幣別維持建立時的值
    assert res.json()["data"]["currency"] == "USD"


async def test_get_single_account(client: AsyncClient) -> None:
    await _register_and_login(client, "acct-owner-2@example.com")
    create_res = await client.post(
        "/api/v1/accounts",
        json={"name": "銀行帳戶", "balance": "500.50", "color": "#3E8FD0", "icon": "bank"},
    )
    account_uid = create_res.json()["data"]["account_uid"]

    res = await client.get(f"/api/v1/accounts/{account_uid}")
    assert res.status_code == 200
    assert res.json()["data"]["account_uid"] == account_uid


async def test_get_nonexistent_account_returns_404(client: AsyncClient) -> None:
    await _register_and_login(client, "acct-owner-3@example.com")
    res = await client.get("/api/v1/accounts/00000000-0000-4000-8000-000000000000")
    assert res.status_code == 404
    assert res.json()["success"] is False


async def test_update_account_balance(client: AsyncClient) -> None:
    await _register_and_login(client, "acct-owner-4@example.com")
    create_res = await client.post(
        "/api/v1/accounts",
        json={"name": "現金", "balance": "100.00", "color": "#8B6ED6", "icon": "wallet"},
    )
    account_uid = create_res.json()["data"]["account_uid"]

    res = await client.patch(f"/api/v1/accounts/{account_uid}", json={"balance": "250.75"})
    assert res.status_code == 200
    body = res.json()["data"]
    assert body["balance"] == "250.75"
    assert body["name"] == "現金"
    # 只改餘額，color/icon 不受影響
    assert body["color"] == "#8B6ED6"
    assert body["icon"] == "wallet"


async def test_update_account_color_and_icon_without_touching_balance(
    client: AsyncClient,
) -> None:
    await _register_and_login(client, "acct-owner-4b@example.com")
    create_res = await client.post(
        "/api/v1/accounts",
        json={"name": "現金", "balance": "100.00", "color": "#8B6ED6", "icon": "wallet"},
    )
    account_uid = create_res.json()["data"]["account_uid"]

    res = await client.patch(
        f"/api/v1/accounts/{account_uid}", json={"color": "#E8834B", "icon": "piggy-bank"}
    )
    assert res.status_code == 200
    body = res.json()["data"]
    assert body["balance"] == "100.00"
    assert body["color"] == "#E8834B"
    assert body["icon"] == "piggy-bank"


async def test_soft_delete_account_hides_it(client: AsyncClient) -> None:
    await _register_and_login(client, "acct-owner-5@example.com")
    create_res = await client.post(
        "/api/v1/accounts",
        json={"name": "待刪除", "balance": "10.00", "color": "#D65FA0", "icon": "trash"},
    )
    account_uid = create_res.json()["data"]["account_uid"]

    del_res = await client.delete(f"/api/v1/accounts/{account_uid}")
    assert del_res.status_code == 200
    assert del_res.json()["success"] is True

    get_res = await client.get(f"/api/v1/accounts/{account_uid}")
    assert get_res.status_code == 404

    list_res = await client.get("/api/v1/accounts")
    assert list_res.json()["data"]["total"] == _DEFAULT_ACCOUNT_COUNT
    assert account_uid not in {item["account_uid"] for item in list_res.json()["data"]["items"]}


async def test_accounts_scoped_to_owner_not_leaked_to_other_user(client: AsyncClient) -> None:
    await _register_and_login(client, "acct-owner-a@example.com")
    create_res = await client.post(
        "/api/v1/accounts",
        json={"name": "A 的帳戶", "balance": "999.00", "color": "#8AAE3C", "icon": "lock"},
    )
    account_uid = create_res.json()["data"]["account_uid"]

    # 切換為另一使用者（同一 client 的 cookie 被覆寫）
    await _register_and_login(client, "acct-owner-b@example.com")

    list_res = await client.get("/api/v1/accounts")
    assert list_res.status_code == 200
    # B 只看得到自己註冊時的預設帳戶，看不到 A 建立的那一筆
    assert list_res.json()["data"]["total"] == _DEFAULT_ACCOUNT_COUNT
    assert account_uid not in {item["account_uid"] for item in list_res.json()["data"]["items"]}

    get_res = await client.get(f"/api/v1/accounts/{account_uid}")
    assert get_res.status_code == 404

    patch_res = await client.patch(f"/api/v1/accounts/{account_uid}", json={"name": "偷改"})
    assert patch_res.status_code == 404

    del_res = await client.delete(f"/api/v1/accounts/{account_uid}")
    assert del_res.status_code == 404


async def test_account_created_without_explicit_color_icon_gets_valid_default(
    db: AsyncSession,
) -> None:
    """模擬既有帳戶升級：繞過 schema 直接呼叫 repository（不帶 color/icon），驗證 DB
    server_default 兜底出來的初始值合法（非空、符合 hex 格式），對應 migration 的既有列回填。
    """
    user = await UserRepository(db).create_user(
        "acct-legacy@example.com", "dummy_hash", datetime.now(UTC)
    )
    user_uid: UUID = user.user_uid
    account = await AccountRepository(db).create(
        user_uid=user_uid, name="舊帳戶", balance=Decimal("0.00"), created_by=user_uid
    )

    assert account.color
    assert _COLOR_RE.match(account.color)
    assert account.icon
