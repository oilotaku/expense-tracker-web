from httpx import AsyncClient

_PASSWORD = "correct horse battery"


async def _register_and_login(client: AsyncClient, email: str) -> None:
    payload = {"email": email, "password": _PASSWORD}
    await client.post("/api/v1/auth/register", json=payload)
    res = await client.post("/api/v1/auth/login", json=payload)
    assert res.status_code == 200


async def _create_account(client: AsyncClient, name: str = "現金") -> str:
    res = await client.post("/api/v1/accounts", json={"name": name, "balance": "1000.00"})
    account_uid: str = res.json()["data"]["account_uid"]
    return account_uid


async def _list_category_uids(client: AsyncClient) -> dict[str, str]:
    res = await client.get("/api/v1/categories")
    return {item["name"]: item["category_uid"] for item in res.json()["data"]["items"]}


async def test_create_transaction_with_two_tags(client: AsyncClient) -> None:
    await _register_and_login(client, "tx-user-1@example.com")
    account_uid = await _create_account(client)
    categories = await _list_category_uids(client)
    category_uid = categories["餐飲"]

    res = await client.post(
        "/api/v1/transactions",
        json={
            "account_uid": account_uid,
            "category_uid": category_uid,
            "transaction_date": "2026-09-01T12:00:00+08:00",
            "description": "午餐",
            "amount": "150.00",
            "transaction_type": "expense",
            "payment_method": "現金",
            "tags": ["外食", "同事聚餐"],
        },
    )
    assert res.status_code == 201
    body = res.json()
    assert body["success"] is True
    data = body["data"]
    assert data["description"] == "午餐"
    assert data["amount"] == "150.00"
    assert isinstance(data["amount"], str)
    assert data["transaction_type"] == "expense"
    assert data["payment_method"] == "現金"
    assert {t["name"] for t in data["tags"]} == {"外食", "同事聚餐"}


async def test_list_transactions_without_cookie_returns_401(client: AsyncClient) -> None:
    res = await client.get("/api/v1/transactions")
    assert res.status_code == 401


async def test_list_transactions_filtered_by_category(client: AsyncClient) -> None:
    await _register_and_login(client, "tx-user-2@example.com")
    account_uid = await _create_account(client)
    categories = await _list_category_uids(client)
    food_uid = categories["餐飲"]
    transport_uid = categories["交通"]

    await client.post(
        "/api/v1/transactions",
        json={
            "account_uid": account_uid,
            "category_uid": food_uid,
            "transaction_date": "2026-09-01T12:00:00+08:00",
            "description": "早餐",
            "amount": "80.00",
            "transaction_type": "expense",
            "payment_method": "現金",
        },
    )
    await client.post(
        "/api/v1/transactions",
        json={
            "account_uid": account_uid,
            "category_uid": transport_uid,
            "transaction_date": "2026-09-01T13:00:00+08:00",
            "description": "捷運",
            "amount": "30.00",
            "transaction_type": "expense",
            "payment_method": "電子票證",
        },
    )

    res = await client.get("/api/v1/transactions", params={"category_uid": food_uid})
    assert res.status_code == 200
    body = res.json()["data"]
    assert body["total"] == 1
    assert body["items"][0]["description"] == "早餐"


async def test_list_transactions_filtered_by_date_range(client: AsyncClient) -> None:
    await _register_and_login(client, "tx-user-3@example.com")
    account_uid = await _create_account(client)
    categories = await _list_category_uids(client)
    category_uid = categories["其他"]

    await client.post(
        "/api/v1/transactions",
        json={
            "account_uid": account_uid,
            "category_uid": category_uid,
            "transaction_date": "2026-08-01T00:00:00+08:00",
            "description": "八月交易",
            "amount": "10.00",
            "transaction_type": "income",
            "payment_method": "轉帳",
        },
    )
    await client.post(
        "/api/v1/transactions",
        json={
            "account_uid": account_uid,
            "category_uid": category_uid,
            "transaction_date": "2026-09-01T00:00:00+08:00",
            "description": "九月交易",
            "amount": "20.00",
            "transaction_type": "income",
            "payment_method": "轉帳",
        },
    )

    res = await client.get(
        "/api/v1/transactions",
        params={"date_from": "2026-09-01T00:00:00+08:00", "date_to": "2026-09-30T23:59:59+08:00"},
    )
    assert res.status_code == 200
    body = res.json()["data"]
    assert body["total"] == 1
    assert body["items"][0]["description"] == "九月交易"


async def test_get_nonexistent_transaction_returns_404(client: AsyncClient) -> None:
    await _register_and_login(client, "tx-user-4@example.com")
    res = await client.get("/api/v1/transactions/00000000-0000-4000-8000-000000000000")
    assert res.status_code == 404


async def test_update_transaction_replaces_tags(client: AsyncClient) -> None:
    await _register_and_login(client, "tx-user-5@example.com")
    account_uid = await _create_account(client)
    categories = await _list_category_uids(client)
    category_uid = categories["其他"]

    created = await client.post(
        "/api/v1/transactions",
        json={
            "account_uid": account_uid,
            "category_uid": category_uid,
            "transaction_date": "2026-09-01T00:00:00+08:00",
            "description": "原始描述",
            "amount": "50.00",
            "transaction_type": "expense",
            "payment_method": "現金",
            "tags": ["舊標籤"],
        },
    )
    transaction_uid = created.json()["data"]["transaction_uid"]

    res = await client.patch(
        f"/api/v1/transactions/{transaction_uid}",
        json={"description": "新描述", "tags": ["新標籤"]},
    )
    assert res.status_code == 200
    body = res.json()["data"]
    assert body["description"] == "新描述"
    assert [t["name"] for t in body["tags"]] == ["新標籤"]


async def test_delete_transaction_is_soft_delete(client: AsyncClient) -> None:
    await _register_and_login(client, "tx-user-6@example.com")
    account_uid = await _create_account(client)
    categories = await _list_category_uids(client)
    category_uid = categories["其他"]

    created = await client.post(
        "/api/v1/transactions",
        json={
            "account_uid": account_uid,
            "category_uid": category_uid,
            "transaction_date": "2026-09-01T00:00:00+08:00",
            "description": "待刪除",
            "amount": "10.00",
            "transaction_type": "expense",
            "payment_method": "現金",
        },
    )
    transaction_uid = created.json()["data"]["transaction_uid"]

    del_res = await client.delete(f"/api/v1/transactions/{transaction_uid}")
    assert del_res.status_code == 200

    get_res = await client.get(f"/api/v1/transactions/{transaction_uid}")
    assert get_res.status_code == 404

    second_delete = await client.delete(f"/api/v1/transactions/{transaction_uid}")
    assert second_delete.status_code == 404


async def test_transactions_are_scoped_to_owner(client: AsyncClient) -> None:
    await _register_and_login(client, "tx-owner-a@example.com")
    account_uid = await _create_account(client)
    categories = await _list_category_uids(client)
    category_uid = categories["其他"]

    created = await client.post(
        "/api/v1/transactions",
        json={
            "account_uid": account_uid,
            "category_uid": category_uid,
            "transaction_date": "2026-09-01T00:00:00+08:00",
            "description": "只屬於 A",
            "amount": "10.00",
            "transaction_type": "expense",
            "payment_method": "現金",
        },
    )
    transaction_uid = created.json()["data"]["transaction_uid"]

    await _register_and_login(client, "tx-owner-b@example.com")

    list_res = await client.get("/api/v1/transactions")
    assert list_res.json()["data"]["total"] == 0

    get_res = await client.get(f"/api/v1/transactions/{transaction_uid}")
    assert get_res.status_code == 404

    patch_res = await client.patch(
        f"/api/v1/transactions/{transaction_uid}", json={"description": "被 B 改"}
    )
    assert patch_res.status_code == 404

    delete_res = await client.delete(f"/api/v1/transactions/{transaction_uid}")
    assert delete_res.status_code == 404
