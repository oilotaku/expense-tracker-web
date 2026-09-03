from httpx import AsyncClient

_PASSWORD = "correct horse battery"


async def _register_and_login(client: AsyncClient, email: str) -> None:
    payload = {"email": email, "password": _PASSWORD}
    await client.post("/api/v1/auth/register", json=payload)
    res = await client.post("/api/v1/auth/login", json=payload)
    assert res.status_code == 200


async def test_create_account_without_jwt_returns_401(client: AsyncClient) -> None:
    res = await client.post("/api/v1/accounts", json={"name": "現金", "balance": "1000.00"})
    assert res.status_code == 401
    assert res.json()["success"] is False


async def test_list_accounts_without_jwt_returns_401(client: AsyncClient) -> None:
    res = await client.get("/api/v1/accounts")
    assert res.status_code == 401


async def test_create_and_list_account(client: AsyncClient) -> None:
    await _register_and_login(client, "acct-owner-1@example.com")

    create_res = await client.post("/api/v1/accounts", json={"name": "現金", "balance": "1000.00"})
    assert create_res.status_code == 201
    body = create_res.json()
    assert body["success"] is True
    assert body["data"]["name"] == "現金"
    assert body["data"]["balance"] == "1000.00"
    assert isinstance(body["data"]["balance"], str)

    list_res = await client.get("/api/v1/accounts")
    assert list_res.status_code == 200
    list_body = list_res.json()
    assert list_body["data"]["total"] == 1
    assert list_body["data"]["items"][0]["name"] == "現金"


async def test_get_single_account(client: AsyncClient) -> None:
    await _register_and_login(client, "acct-owner-2@example.com")
    create_res = await client.post(
        "/api/v1/accounts", json={"name": "銀行帳戶", "balance": "500.50"}
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
    create_res = await client.post("/api/v1/accounts", json={"name": "現金", "balance": "100.00"})
    account_uid = create_res.json()["data"]["account_uid"]

    res = await client.patch(f"/api/v1/accounts/{account_uid}", json={"balance": "250.75"})
    assert res.status_code == 200
    body = res.json()["data"]
    assert body["balance"] == "250.75"
    assert body["name"] == "現金"


async def test_soft_delete_account_hides_it(client: AsyncClient) -> None:
    await _register_and_login(client, "acct-owner-5@example.com")
    create_res = await client.post("/api/v1/accounts", json={"name": "待刪除", "balance": "10.00"})
    account_uid = create_res.json()["data"]["account_uid"]

    del_res = await client.delete(f"/api/v1/accounts/{account_uid}")
    assert del_res.status_code == 200
    assert del_res.json()["success"] is True

    get_res = await client.get(f"/api/v1/accounts/{account_uid}")
    assert get_res.status_code == 404

    list_res = await client.get("/api/v1/accounts")
    assert list_res.json()["data"]["total"] == 0


async def test_accounts_scoped_to_owner_not_leaked_to_other_user(client: AsyncClient) -> None:
    await _register_and_login(client, "acct-owner-a@example.com")
    create_res = await client.post(
        "/api/v1/accounts", json={"name": "A 的帳戶", "balance": "999.00"}
    )
    account_uid = create_res.json()["data"]["account_uid"]

    # 切換為另一使用者（同一 client 的 cookie 被覆寫）
    await _register_and_login(client, "acct-owner-b@example.com")

    list_res = await client.get("/api/v1/accounts")
    assert list_res.status_code == 200
    assert list_res.json()["data"]["total"] == 0
    assert list_res.json()["data"]["items"] == []

    get_res = await client.get(f"/api/v1/accounts/{account_uid}")
    assert get_res.status_code == 404

    patch_res = await client.patch(f"/api/v1/accounts/{account_uid}", json={"name": "偷改"})
    assert patch_res.status_code == 404

    del_res = await client.delete(f"/api/v1/accounts/{account_uid}")
    assert del_res.status_code == 404
