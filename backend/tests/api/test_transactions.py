from httpx import AsyncClient

_PASSWORD = "correct horse battery"


async def _register_and_login(client: AsyncClient, email: str) -> None:
    payload = {"email": email, "password": _PASSWORD}
    await client.post("/api/v1/auth/register", json=payload)
    res = await client.post("/api/v1/auth/login", json=payload)
    assert res.status_code == 200


async def _create_account(client: AsyncClient, name: str = "現金") -> str:
    res = await client.post(
        "/api/v1/accounts",
        json={"name": name, "balance": "1000.00", "color": "#8B6ED6", "icon": "wallet"},
    )
    account_uid: str = res.json()["data"]["account_uid"]
    return account_uid


async def _list_category_uids(client: AsyncClient) -> dict[str, str]:
    res = await client.get("/api/v1/categories")
    return {item["name"]: item["category_uid"] for item in res.json()["data"]["items"]}


async def _account_balance(client: AsyncClient, account_uid: str) -> str:
    res = await client.get(f"/api/v1/accounts/{account_uid}")
    balance: str = res.json()["data"]["balance"]
    return balance


async def _create_transfer(
    client: AsyncClient,
    *,
    from_account_uid: str,
    to_account_uid: str,
    amount: str = "100.00",
    description: str = "轉帳",
) -> dict[str, object]:
    res = await client.post(
        "/api/v1/transactions/transfer",
        json={
            "from_account_uid": from_account_uid,
            "to_account_uid": to_account_uid,
            "transaction_date": "2026-09-09T12:00:00+08:00",
            "description": description,
            "amount": amount,
            "payment_method": "銀行轉帳",
        },
    )
    assert res.status_code == 201
    data: dict[str, object] = res.json()["data"]
    return data


async def _get_summary(client: AsyncClient) -> dict[str, object]:
    res = await client.get(
        "/api/v1/dashboard/summary",
        params={
            "period": "month",
            "date_from": "2026-09-01T00:00:00+08:00",
            "date_to": "2026-09-30T23:59:59+08:00",
        },
    )
    assert res.status_code == 200
    data: dict[str, object] = res.json()["data"]
    return data


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


async def test_create_transaction_with_blank_description_and_payment_method(
    client: AsyncClient,
) -> None:
    await _register_and_login(client, "tx-user-blank@example.com")
    account_uid = await _create_account(client)
    categories = await _list_category_uids(client)
    category_uid = categories["其他"]

    res = await client.post(
        "/api/v1/transactions",
        json={
            "account_uid": account_uid,
            "category_uid": category_uid,
            "transaction_date": "2026-09-01T12:00:00+08:00",
            "description": "",
            "amount": "100.00",
            "transaction_type": "expense",
            "payment_method": "",
        },
    )
    assert res.status_code == 201
    data = res.json()["data"]
    assert data["description"] == ""
    assert data["payment_method"] == ""


async def test_create_transaction_syncs_account_balance(client: AsyncClient) -> None:
    """帳戶餘額隨交易即時同步：收入加、支出減（帳戶原始餘額 1000.00）。"""
    await _register_and_login(client, "tx-balance-create@example.com")
    account_uid = await _create_account(client)
    categories = await _list_category_uids(client)

    income_res = await client.post(
        "/api/v1/transactions",
        json={
            "account_uid": account_uid,
            "category_uid": categories["薪資"],
            "transaction_date": "2026-09-01T09:00:00+08:00",
            "description": "薪水",
            "amount": "5000.00",
            "transaction_type": "income",
            "payment_method": "轉帳",
        },
    )
    assert income_res.status_code == 201
    assert await _account_balance(client, account_uid) == "6000.00"

    expense_res = await client.post(
        "/api/v1/transactions",
        json={
            "account_uid": account_uid,
            "category_uid": categories["餐飲"],
            "transaction_date": "2026-09-01T12:00:00+08:00",
            "description": "午餐",
            "amount": "200.00",
            "transaction_type": "expense",
            "payment_method": "現金",
        },
    )
    assert expense_res.status_code == 201
    assert await _account_balance(client, account_uid) == "5800.00"


async def test_update_transaction_syncs_account_balance(client: AsyncClient) -> None:
    """改金額、收支類型互轉、換帳戶三種情境的餘額都要對齊。"""
    await _register_and_login(client, "tx-balance-update@example.com")
    account_uid = await _create_account(client)
    other_account_uid = await _create_account(client, "銀行帳戶")
    categories = await _list_category_uids(client)

    created = await client.post(
        "/api/v1/transactions",
        json={
            "account_uid": account_uid,
            "category_uid": categories["其他"],
            "transaction_date": "2026-09-01T00:00:00+08:00",
            "description": "原始交易",
            "amount": "100.00",
            "transaction_type": "expense",
            "payment_method": "現金",
        },
    )
    transaction_uid = created.json()["data"]["transaction_uid"]
    assert await _account_balance(client, account_uid) == "900.00"

    amount_res = await client.patch(
        f"/api/v1/transactions/{transaction_uid}", json={"amount": "250.00"}
    )
    assert amount_res.status_code == 200
    assert await _account_balance(client, account_uid) == "750.00"

    type_res = await client.patch(
        f"/api/v1/transactions/{transaction_uid}", json={"transaction_type": "income"}
    )
    assert type_res.status_code == 200
    assert await _account_balance(client, account_uid) == "1250.00"

    move_res = await client.patch(
        f"/api/v1/transactions/{transaction_uid}", json={"account_uid": other_account_uid}
    )
    assert move_res.status_code == 200
    assert await _account_balance(client, account_uid) == "1000.00"
    assert await _account_balance(client, other_account_uid) == "1250.00"


async def test_delete_transaction_reverts_account_balance(client: AsyncClient) -> None:
    await _register_and_login(client, "tx-balance-delete@example.com")
    account_uid = await _create_account(client)
    categories = await _list_category_uids(client)

    created = await client.post(
        "/api/v1/transactions",
        json={
            "account_uid": account_uid,
            "category_uid": categories["其他"],
            "transaction_date": "2026-09-01T00:00:00+08:00",
            "description": "待刪除",
            "amount": "300.00",
            "transaction_type": "expense",
            "payment_method": "現金",
        },
    )
    transaction_uid = created.json()["data"]["transaction_uid"]
    assert await _account_balance(client, account_uid) == "700.00"

    del_res = await client.delete(f"/api/v1/transactions/{transaction_uid}")
    assert del_res.status_code == 200
    assert await _account_balance(client, account_uid) == "1000.00"


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


# ---------------------------------------------------------------------------
# 轉帳（雙分錄）：多帳戶互轉不計入當月收支累積
# ---------------------------------------------------------------------------


async def test_create_transfer_moves_balance_without_affecting_income_expense(
    client: AsyncClient,
) -> None:
    await _register_and_login(client, "tx-transfer-balance@example.com")
    cash_uid = await _create_account(client, "現金")
    bank_uid = await _create_account(client, "銀行")
    categories = await _list_category_uids(client)

    # 先建一筆收入，確認 Dashboard 收支彙總「轉帳前」的基準值。
    await client.post(
        "/api/v1/transactions",
        json={
            "account_uid": cash_uid,
            "category_uid": categories["其他"],
            "transaction_date": "2026-09-01T00:00:00+08:00",
            "description": "薪水",
            "amount": "10000.00",
            "transaction_type": "income",
            "payment_method": "銀行轉帳",
        },
    )
    summary_before = await _get_summary(client)

    await _create_transfer(
        client, from_account_uid=cash_uid, to_account_uid=bank_uid, amount="3000.00"
    )

    assert await _account_balance(client, cash_uid) == "8000.00"  # 1000 起始 + 10000 收入 - 3000
    assert await _account_balance(client, bank_uid) == "4000.00"  # 1000 起始 + 3000

    summary_after = await _get_summary(client)
    assert summary_after == summary_before  # 轉帳完全不影響收支彙總


async def test_create_transfer_same_account_returns_422(client: AsyncClient) -> None:
    await _register_and_login(client, "tx-transfer-same-account@example.com")
    cash_uid = await _create_account(client, "現金")

    res = await client.post(
        "/api/v1/transactions/transfer",
        json={
            "from_account_uid": cash_uid,
            "to_account_uid": cash_uid,
            "transaction_date": "2026-09-09T12:00:00+08:00",
            "description": "自轉",
            "amount": "100.00",
            "payment_method": "銀行轉帳",
        },
    )
    assert res.status_code == 422


async def test_create_transfer_response_shape(client: AsyncClient) -> None:
    await _register_and_login(client, "tx-transfer-shape@example.com")
    cash_uid = await _create_account(client, "現金")
    bank_uid = await _create_account(client, "銀行")

    data = await _create_transfer(
        client, from_account_uid=cash_uid, to_account_uid=bank_uid, amount="500.00"
    )
    outbound = data["outbound"]
    inbound = data["inbound"]
    assert isinstance(outbound, dict) and isinstance(inbound, dict)

    assert outbound["transaction_type"] == "transfer"
    assert outbound["transfer_direction"] == "out"
    assert outbound["category_uid"] is None
    assert outbound["account_uid"] == cash_uid
    assert outbound["transfer_counterpart_account_uid"] == bank_uid
    assert outbound["transfer_group_uid"] == inbound["transfer_group_uid"]

    assert inbound["transaction_type"] == "transfer"
    assert inbound["transfer_direction"] == "in"
    assert inbound["category_uid"] is None
    assert inbound["account_uid"] == bank_uid
    assert inbound["transfer_counterpart_account_uid"] == cash_uid


async def test_old_update_endpoint_rejects_transfer_leg_with_409(client: AsyncClient) -> None:
    await _register_and_login(client, "tx-transfer-old-patch@example.com")
    cash_uid = await _create_account(client, "現金")
    bank_uid = await _create_account(client, "銀行")

    data = await _create_transfer(client, from_account_uid=cash_uid, to_account_uid=bank_uid)
    outbound_uid = data["outbound"]["transaction_uid"]  # type: ignore[index]

    res = await client.patch(f"/api/v1/transactions/{outbound_uid}", json={"description": "改一下"})
    assert res.status_code == 409


async def test_old_delete_endpoint_rejects_transfer_leg_with_409(client: AsyncClient) -> None:
    await _register_and_login(client, "tx-transfer-old-delete@example.com")
    cash_uid = await _create_account(client, "現金")
    bank_uid = await _create_account(client, "銀行")

    data = await _create_transfer(client, from_account_uid=cash_uid, to_account_uid=bank_uid)
    outbound_uid = data["outbound"]["transaction_uid"]  # type: ignore[index]

    res = await client.delete(f"/api/v1/transactions/{outbound_uid}")
    assert res.status_code == 409


async def test_update_transfer_amount_resyncs_both_balances(client: AsyncClient) -> None:
    await _register_and_login(client, "tx-transfer-update-amount@example.com")
    cash_uid = await _create_account(client, "現金")
    bank_uid = await _create_account(client, "銀行")

    data = await _create_transfer(
        client, from_account_uid=cash_uid, to_account_uid=bank_uid, amount="1000.00"
    )
    group_uid = data["outbound"]["transfer_group_uid"]  # type: ignore[index]

    res = await client.patch(
        f"/api/v1/transactions/transfer/{group_uid}", json={"amount": "4000.00"}
    )
    assert res.status_code == 200

    assert await _account_balance(client, cash_uid) == "-3000.00"  # 1000 起始 - 4000
    assert await _account_balance(client, bank_uid) == "5000.00"  # 1000 起始 + 4000


async def test_update_transfer_changing_account_resyncs_old_and_new_accounts(
    client: AsyncClient,
) -> None:
    await _register_and_login(client, "tx-transfer-update-account@example.com")
    cash_uid = await _create_account(client, "現金")
    bank_uid = await _create_account(client, "銀行")
    savings_uid = await _create_account(client, "儲蓄")

    data = await _create_transfer(
        client, from_account_uid=cash_uid, to_account_uid=bank_uid, amount="1000.00"
    )
    group_uid = data["outbound"]["transfer_group_uid"]  # type: ignore[index]

    # 轉入帳戶從銀行改成儲蓄：銀行退回 1000、儲蓄收到 1000，現金不受影響。
    res = await client.patch(
        f"/api/v1/transactions/transfer/{group_uid}", json={"to_account_uid": savings_uid}
    )
    assert res.status_code == 200

    assert await _account_balance(client, cash_uid) == "0.00"  # 1000 起始 - 1000，不受這次更新影響
    assert await _account_balance(client, bank_uid) == "1000.00"  # 1000 起始，退回轉入的 1000
    assert await _account_balance(client, savings_uid) == "2000.00"  # 1000 起始 + 1000


async def test_update_transfer_to_same_account_returns_409(client: AsyncClient) -> None:
    await _register_and_login(client, "tx-transfer-update-same-account@example.com")
    cash_uid = await _create_account(client, "現金")
    bank_uid = await _create_account(client, "銀行")

    data = await _create_transfer(client, from_account_uid=cash_uid, to_account_uid=bank_uid)
    group_uid = data["outbound"]["transfer_group_uid"]  # type: ignore[index]

    res = await client.patch(
        f"/api/v1/transactions/transfer/{group_uid}", json={"to_account_uid": cash_uid}
    )
    assert res.status_code == 409


async def test_delete_transfer_refunds_both_accounts(client: AsyncClient) -> None:
    await _register_and_login(client, "tx-transfer-delete@example.com")
    cash_uid = await _create_account(client, "現金")
    bank_uid = await _create_account(client, "銀行")

    data = await _create_transfer(
        client, from_account_uid=cash_uid, to_account_uid=bank_uid, amount="600.00"
    )
    group_uid = data["outbound"]["transfer_group_uid"]  # type: ignore[index]

    res = await client.delete(f"/api/v1/transactions/transfer/{group_uid}")
    assert res.status_code == 200

    assert await _account_balance(client, cash_uid) == "1000.00"
    assert await _account_balance(client, bank_uid) == "1000.00"

    second_delete = await client.delete(f"/api/v1/transactions/transfer/{group_uid}")
    assert second_delete.status_code == 404

    list_res = await client.get("/api/v1/transactions")
    assert list_res.json()["data"]["total"] == 0


async def test_get_transfer_not_owned_returns_404(client: AsyncClient) -> None:
    await _register_and_login(client, "tx-transfer-owner-a@example.com")
    cash_uid = await _create_account(client, "現金")
    bank_uid = await _create_account(client, "銀行")
    data = await _create_transfer(client, from_account_uid=cash_uid, to_account_uid=bank_uid)
    group_uid = data["outbound"]["transfer_group_uid"]  # type: ignore[index]

    await _register_and_login(client, "tx-transfer-owner-b@example.com")

    patch_res = await client.patch(
        f"/api/v1/transactions/transfer/{group_uid}", json={"description": "被 B 改"}
    )
    assert patch_res.status_code == 404

    delete_res = await client.delete(f"/api/v1/transactions/transfer/{group_uid}")
    assert delete_res.status_code == 404
