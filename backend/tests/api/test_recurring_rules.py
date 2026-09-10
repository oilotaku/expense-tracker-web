"""週期性交易規則 API：`interval_unit` / `interval_count` / `anchor_date`（design-spec §12.3）。"""

from datetime import date

from httpx import AsyncClient

_PASSWORD = "correct horse battery"


async def _register_and_login(client: AsyncClient, email: str) -> None:
    payload = {"email": email, "password": _PASSWORD}
    await client.post("/api/v1/auth/register", json=payload)
    res = await client.post("/api/v1/auth/login", json=payload)
    assert res.status_code == 200


async def _make_account_and_category(client: AsyncClient) -> tuple[str, str]:
    account_res = await client.post(
        "/api/v1/accounts",
        json={"name": "現金", "balance": "0.00", "color": "#8B6ED6", "icon": "wallet"},
    )
    category_res = await client.post(
        "/api/v1/categories",
        json={"name": "訂閱服務", "color": "#E8834B", "icon": "bell"},
    )
    return account_res.json()["data"]["account_uid"], category_res.json()["data"]["category_uid"]


async def test_create_recurring_rule_with_default_interval_fields(client: AsyncClient) -> None:
    await _register_and_login(client, "recur-1@example.com")
    account_uid, category_uid = await _make_account_and_category(client)

    res = await client.post(
        "/api/v1/recurring-rules",
        json={
            "account_uid": account_uid,
            "category_uid": category_uid,
            "description": "Netflix",
            "amount": "390.00",
            "transaction_type": "expense",
            "payment_method": "信用卡",
            "anchor_date": "2026-09-15",
        },
    )
    assert res.status_code == 201
    body = res.json()["data"]
    # 未帶 interval_unit/interval_count 時預設 month/1（既有月規則行為，→ design-spec §12.3）
    assert body["interval_unit"] == "month"
    assert body["interval_count"] == 1
    assert body["anchor_date"] == "2026-09-15"


async def test_create_recurring_rule_with_explicit_week_interval(client: AsyncClient) -> None:
    await _register_and_login(client, "recur-2@example.com")
    account_uid, category_uid = await _make_account_and_category(client)

    res = await client.post(
        "/api/v1/recurring-rules",
        json={
            "account_uid": account_uid,
            "category_uid": category_uid,
            "description": "健身房",
            "amount": "500.00",
            "transaction_type": "expense",
            "payment_method": "現金",
            "interval_unit": "week",
            "interval_count": 2,
            "anchor_date": "2026-09-01",
        },
    )
    assert res.status_code == 201
    body = res.json()["data"]
    assert body["interval_unit"] == "week"
    assert body["interval_count"] == 2
    assert body["anchor_date"] == "2026-09-01"


async def test_create_recurring_rule_interval_count_over_99_returns_422(
    client: AsyncClient,
) -> None:
    await _register_and_login(client, "recur-3@example.com")
    account_uid, category_uid = await _make_account_and_category(client)

    res = await client.post(
        "/api/v1/recurring-rules",
        json={
            "account_uid": account_uid,
            "category_uid": category_uid,
            "description": "測試",
            "amount": "100.00",
            "transaction_type": "expense",
            "payment_method": "現金",
            "interval_count": 100,
            "anchor_date": "2026-09-01",
        },
    )
    assert res.status_code == 422


async def test_create_recurring_rule_interval_count_zero_returns_422(client: AsyncClient) -> None:
    await _register_and_login(client, "recur-4@example.com")
    account_uid, category_uid = await _make_account_and_category(client)

    res = await client.post(
        "/api/v1/recurring-rules",
        json={
            "account_uid": account_uid,
            "category_uid": category_uid,
            "description": "測試",
            "amount": "100.00",
            "transaction_type": "expense",
            "payment_method": "現金",
            "interval_count": 0,
            "anchor_date": "2026-09-01",
        },
    )
    assert res.status_code == 422


async def test_update_recurring_rule_interval_fields(client: AsyncClient) -> None:
    await _register_and_login(client, "recur-5@example.com")
    account_uid, category_uid = await _make_account_and_category(client)

    created = await client.post(
        "/api/v1/recurring-rules",
        json={
            "account_uid": account_uid,
            "category_uid": category_uid,
            "description": "訂閱",
            "amount": "199.00",
            "transaction_type": "expense",
            "payment_method": "信用卡",
            "anchor_date": "2026-01-10",
        },
    )
    recurring_rule_uid = created.json()["data"]["recurring_rule_uid"]

    res = await client.patch(
        f"/api/v1/recurring-rules/{recurring_rule_uid}",
        json={"interval_unit": "year", "interval_count": 2, "anchor_date": "2026-03-01"},
    )
    assert res.status_code == 200
    body = res.json()["data"]
    assert body["interval_unit"] == "year"
    assert body["interval_count"] == 2
    assert body["anchor_date"] == "2026-03-01"


async def test_list_recurring_rules_reflects_interval_fields(client: AsyncClient) -> None:
    await _register_and_login(client, "recur-6@example.com")
    account_uid, category_uid = await _make_account_and_category(client)
    await client.post(
        "/api/v1/recurring-rules",
        json={
            "account_uid": account_uid,
            "category_uid": category_uid,
            "description": "水電費",
            "amount": "1200.00",
            "transaction_type": "expense",
            "payment_method": "轉帳",
            "interval_unit": "month",
            "interval_count": 1,
            "anchor_date": str(date(2026, 5, 31)),
        },
    )

    res = await client.get("/api/v1/recurring-rules")
    assert res.status_code == 200
    items = res.json()["data"]["items"]
    assert len(items) == 1
    assert items[0]["interval_unit"] == "month"
    assert items[0]["interval_count"] == 1
    assert items[0]["anchor_date"] == "2026-05-31"


async def _make_liability(client: AsyncClient, amount: str = "1000.00") -> str:
    res = await client.post(
        "/api/v1/liabilities", json={"name": "測試負債", "amount": amount, "interest_rate": None}
    )
    return res.json()["data"]["liability_uid"]


async def test_create_recurring_rule_with_liability_uid(client: AsyncClient) -> None:
    await _register_and_login(client, "recur-liability-1@example.com")
    account_uid, category_uid = await _make_account_and_category(client)
    liability_uid = await _make_liability(client)

    res = await client.post(
        "/api/v1/recurring-rules",
        json={
            "account_uid": account_uid,
            "category_uid": category_uid,
            "description": "房貸還款",
            "amount": "10000.00",
            "transaction_type": "expense",
            "payment_method": "轉帳",
            "anchor_date": "2026-09-15",
            "liability_uid": liability_uid,
        },
    )
    assert res.status_code == 201
    assert res.json()["data"]["liability_uid"] == liability_uid


async def test_create_recurring_rule_with_liability_uid_requires_expense(
    client: AsyncClient,
) -> None:
    await _register_and_login(client, "recur-liability-2@example.com")
    account_uid, category_uid = await _make_account_and_category(client)
    liability_uid = await _make_liability(client)

    res = await client.post(
        "/api/v1/recurring-rules",
        json={
            "account_uid": account_uid,
            "category_uid": category_uid,
            "description": "錯誤示範",
            "amount": "100.00",
            "transaction_type": "income",
            "payment_method": "轉帳",
            "anchor_date": "2026-09-15",
            "liability_uid": liability_uid,
        },
    )
    assert res.status_code == 422


async def test_create_recurring_rule_with_others_liability_uid_returns_404(
    client: AsyncClient,
) -> None:
    await _register_and_login(client, "recur-liability-owner@example.com")
    other_liability_uid = await _make_liability(client)

    await _register_and_login(client, "recur-liability-attacker@example.com")
    account_uid, category_uid = await _make_account_and_category(client)

    res = await client.post(
        "/api/v1/recurring-rules",
        json={
            "account_uid": account_uid,
            "category_uid": category_uid,
            "description": "測試",
            "amount": "100.00",
            "transaction_type": "expense",
            "payment_method": "轉帳",
            "anchor_date": "2026-09-15",
            "liability_uid": other_liability_uid,
        },
    )
    assert res.status_code == 404


async def test_deleting_liability_soft_deletes_its_recurring_rule(client: AsyncClient) -> None:
    await _register_and_login(client, "recur-liability-3@example.com")
    account_uid, category_uid = await _make_account_and_category(client)
    liability_uid = await _make_liability(client)

    created = await client.post(
        "/api/v1/recurring-rules",
        json={
            "account_uid": account_uid,
            "category_uid": category_uid,
            "description": "房貸還款",
            "amount": "10000.00",
            "transaction_type": "expense",
            "payment_method": "轉帳",
            "anchor_date": "2026-09-15",
            "liability_uid": liability_uid,
        },
    )
    recurring_rule_uid = created.json()["data"]["recurring_rule_uid"]

    delete_res = await client.delete(f"/api/v1/liabilities/{liability_uid}")
    assert delete_res.status_code == 200

    get_res = await client.get(f"/api/v1/recurring-rules/{recurring_rule_uid}")
    assert get_res.status_code == 404


async def test_new_rule_defaults_to_active(client: AsyncClient) -> None:
    await _register_and_login(client, "recur-active-1@example.com")
    account_uid, category_uid = await _make_account_and_category(client)

    res = await client.post(
        "/api/v1/recurring-rules",
        json={
            "account_uid": account_uid,
            "category_uid": category_uid,
            "description": "訂閱",
            "amount": "199.00",
            "transaction_type": "expense",
            "payment_method": "信用卡",
            "anchor_date": "2026-09-01",
        },
    )
    assert res.json()["data"]["is_active"] is True


async def test_pause_and_resume_rule_via_patch(client: AsyncClient) -> None:
    await _register_and_login(client, "recur-active-2@example.com")
    account_uid, category_uid = await _make_account_and_category(client)

    created = await client.post(
        "/api/v1/recurring-rules",
        json={
            "account_uid": account_uid,
            "category_uid": category_uid,
            "description": "訂閱",
            "amount": "199.00",
            "transaction_type": "expense",
            "payment_method": "信用卡",
            "anchor_date": "2026-09-01",
        },
    )
    recurring_rule_uid = created.json()["data"]["recurring_rule_uid"]

    pause_res = await client.patch(
        f"/api/v1/recurring-rules/{recurring_rule_uid}", json={"is_active": False}
    )
    assert pause_res.status_code == 200
    assert pause_res.json()["data"]["is_active"] is False

    resume_res = await client.patch(
        f"/api/v1/recurring-rules/{recurring_rule_uid}", json={"is_active": True}
    )
    assert resume_res.status_code == 200
    assert resume_res.json()["data"]["is_active"] is True
