"""Dashboard 期間彙總 API：月 / 年 / 自訂範圍三種 period，budget_remaining 依 period 分流。"""

from datetime import datetime

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


async def _create_budget(
    client: AsyncClient, category_uid: str, period_type: str, limit_amount: str
) -> str:
    res = await client.post(
        "/api/v1/budgets",
        json={
            "category_uid": category_uid,
            "period_type": period_type,
            "limit_amount": limit_amount,
        },
    )
    assert res.status_code == 201
    budget_uid: str = res.json()["data"]["budget_uid"]
    return budget_uid


async def _create_transaction(
    client: AsyncClient,
    account_uid: str,
    category_uid: str,
    when: datetime,
    amount: str,
    transaction_type: str,
) -> None:
    res = await client.post(
        "/api/v1/transactions",
        json={
            "account_uid": account_uid,
            "category_uid": category_uid,
            "transaction_date": when.isoformat(),
            "description": "測試交易",
            "amount": amount,
            "transaction_type": transaction_type,
            "payment_method": "現金",
        },
    )
    assert res.status_code == 201


async def _get_summary(
    client: AsyncClient, period: str, date_from: str, date_to: str
) -> dict[str, object]:
    res = await client.get(
        "/api/v1/dashboard/summary",
        params={"period": period, "date_from": date_from, "date_to": date_to},
    )
    assert res.status_code == 200
    data: dict[str, object] = res.json()["data"]
    return data


async def test_dashboard_summary_without_jwt_returns_401(client: AsyncClient) -> None:
    res = await client.get(
        "/api/v1/dashboard/summary",
        params={
            "period": "month",
            "date_from": "2026-01-01T00:00:00+08:00",
            "date_to": "2026-01-31T23:59:59+08:00",
        },
    )
    assert res.status_code == 401


async def test_dashboard_summary_date_to_before_date_from_returns_422(client: AsyncClient) -> None:
    await _register_and_login(client, "dashboard-invalid-range@example.com")
    res = await client.get(
        "/api/v1/dashboard/summary",
        params={
            "period": "month",
            "date_from": "2026-01-31T00:00:00+08:00",
            "date_to": "2026-01-01T00:00:00+08:00",
        },
    )
    assert res.status_code == 422


async def test_dashboard_summary_month_period_income_expense_balance(
    client: AsyncClient,
) -> None:
    await _register_and_login(client, "dashboard-month@example.com")
    account_uid = await _create_account(client)
    categories = await _list_category_uids(client)
    food_uid = categories["餐飲"]

    # 期間內的收入與支出
    await _create_transaction(
        client,
        account_uid,
        food_uid,
        datetime.fromisoformat("2026-01-15T12:00:00+08:00"),
        "45000.00",
        "income",
    )
    await _create_transaction(
        client,
        account_uid,
        food_uid,
        datetime.fromisoformat("2026-01-16T12:00:00+08:00"),
        "28000.00",
        "expense",
    )
    # 期間外（2 月）的交易不應計入
    await _create_transaction(
        client,
        account_uid,
        food_uid,
        datetime.fromisoformat("2026-02-01T12:00:00+08:00"),
        "9999.00",
        "expense",
    )

    body = await _get_summary(
        client, "month", "2026-01-01T00:00:00+08:00", "2026-01-31T23:59:59+08:00"
    )
    assert body["period"] == "month"
    assert body["income"] == "45000.00"
    assert body["expense"] == "28000.00"
    assert body["balance"] == "17000.00"


async def test_dashboard_summary_year_and_custom_period_scoped_to_range(
    client: AsyncClient,
) -> None:
    await _register_and_login(client, "dashboard-year-custom@example.com")
    account_uid = await _create_account(client)
    categories = await _list_category_uids(client)
    food_uid = categories["餐飲"]

    await _create_transaction(
        client,
        account_uid,
        food_uid,
        datetime.fromisoformat("2026-03-10T12:00:00+08:00"),
        "1000.00",
        "income",
    )
    await _create_transaction(
        client,
        account_uid,
        food_uid,
        datetime.fromisoformat("2026-07-10T12:00:00+08:00"),
        "300.00",
        "expense",
    )
    # 隔年的交易不應計入「年」彙總
    await _create_transaction(
        client,
        account_uid,
        food_uid,
        datetime.fromisoformat("2027-01-01T12:00:00+08:00"),
        "9999.00",
        "income",
    )

    year_body = await _get_summary(
        client, "year", "2026-01-01T00:00:00+08:00", "2026-12-31T23:59:59+08:00"
    )
    assert year_body["income"] == "1000.00"
    assert year_body["expense"] == "300.00"
    assert year_body["balance"] == "700.00"

    custom_body = await _get_summary(
        client, "custom", "2026-03-01T00:00:00+08:00", "2026-03-31T23:59:59+08:00"
    )
    assert custom_body["income"] == "1000.00"
    assert custom_body["expense"] == "0.00"


async def test_dashboard_summary_budget_remaining_null_when_not_month(
    client: AsyncClient,
) -> None:
    await _register_and_login(client, "dashboard-budget-null@example.com")
    categories = await _list_category_uids(client)
    await _create_budget(client, categories["餐飲"], "monthly", "1000.00")

    year_body = await _get_summary(
        client, "year", "2026-01-01T00:00:00+08:00", "2026-12-31T23:59:59+08:00"
    )
    assert year_body["budget_remaining"] is None

    custom_body = await _get_summary(
        client, "custom", "2026-01-01T00:00:00+08:00", "2026-01-15T00:00:00+08:00"
    )
    assert custom_body["budget_remaining"] is None


async def test_dashboard_summary_budget_remaining_zero_when_no_budgets(
    client: AsyncClient,
) -> None:
    await _register_and_login(client, "dashboard-budget-zero@example.com")

    body = await _get_summary(
        client, "month", "2026-01-01T00:00:00+08:00", "2026-01-31T23:59:59+08:00"
    )
    assert body["budget_remaining"] == "0.00"


async def test_dashboard_summary_budget_remaining_sums_all_monthly_budgets(
    client: AsyncClient,
) -> None:
    await _register_and_login(client, "dashboard-budget-sum@example.com")
    account_uid = await _create_account(client)
    categories = await _list_category_uids(client)
    food_uid = categories["餐飲"]
    transport_uid = categories["交通"]

    await _create_budget(client, food_uid, "monthly", "1000.00")
    await _create_budget(client, transport_uid, "monthly", "500.00")
    # daily 預算不計入 dashboard 的月度彙總
    await _create_budget(client, categories["娛樂"], "daily", "100.00")

    await _create_transaction(
        client,
        account_uid,
        food_uid,
        datetime.fromisoformat("2026-01-15T12:00:00+08:00"),
        "300.00",
        "expense",
    )
    await _create_transaction(
        client,
        account_uid,
        transport_uid,
        datetime.fromisoformat("2026-01-16T12:00:00+08:00"),
        "50.00",
        "expense",
    )
    # 期間外的支出不應計入 budget_remaining
    await _create_transaction(
        client,
        account_uid,
        food_uid,
        datetime.fromisoformat("2026-02-01T12:00:00+08:00"),
        "9999.00",
        "expense",
    )

    body = await _get_summary(
        client, "month", "2026-01-01T00:00:00+08:00", "2026-01-31T23:59:59+08:00"
    )
    # (1000 - 300) + (500 - 50) = 1150.00
    assert body["budget_remaining"] == "1150.00"


async def test_dashboard_summary_response_has_all_required_fields(client: AsyncClient) -> None:
    await _register_and_login(client, "dashboard-fields@example.com")
    body = await _get_summary(
        client, "month", "2026-01-01T00:00:00+08:00", "2026-01-31T23:59:59+08:00"
    )
    assert {"income", "expense", "balance", "budget_remaining"} <= body.keys()
