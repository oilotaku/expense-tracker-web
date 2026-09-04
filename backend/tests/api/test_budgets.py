from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from httpx import AsyncClient

_PASSWORD = "correct horse battery"
_TAIPEI = ZoneInfo("Asia/Taipei")


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


async def _create_expense(
    client: AsyncClient, account_uid: str, category_uid: str, when: datetime, amount: str
) -> None:
    res = await client.post(
        "/api/v1/transactions",
        json={
            "account_uid": account_uid,
            "category_uid": category_uid,
            "transaction_date": when.isoformat(),
            "description": "測試交易",
            "amount": amount,
            "transaction_type": "expense",
            "payment_method": "現金",
        },
    )
    assert res.status_code == 201


def _taipei_now() -> datetime:
    return datetime.now(_TAIPEI)


def _previous_month_local(now: datetime) -> datetime:
    first_of_this_month = now.replace(day=1)
    last_month_end = first_of_this_month - timedelta(days=1)
    return last_month_end.replace(hour=12, minute=0, second=0, microsecond=0)


async def test_create_budget(client: AsyncClient) -> None:
    await _register_and_login(client, "budget-user-1@example.com")
    categories = await _list_category_uids(client)

    res = await client.post(
        "/api/v1/budgets",
        json={
            "category_uid": categories["餐飲"],
            "period_type": "monthly",
            "limit_amount": "5000.00",
        },
    )
    assert res.status_code == 201
    body = res.json()
    assert body["success"] is True
    assert body["data"]["period_type"] == "monthly"
    assert body["data"]["limit_amount"] == "5000.00"


async def test_list_budgets_without_cookie_returns_401(client: AsyncClient) -> None:
    res = await client.get("/api/v1/budgets")
    assert res.status_code == 401


async def test_create_duplicate_budget_same_category_and_period_returns_409(
    client: AsyncClient,
) -> None:
    await _register_and_login(client, "budget-user-2@example.com")
    categories = await _list_category_uids(client)

    await _create_budget(client, categories["交通"], "daily", "200.00")

    second = await client.post(
        "/api/v1/budgets",
        json={"category_uid": categories["交通"], "period_type": "daily", "limit_amount": "300.00"},
    )
    assert second.status_code == 409


async def test_update_budget_limit(client: AsyncClient) -> None:
    await _register_and_login(client, "budget-user-3@example.com")
    categories = await _list_category_uids(client)

    budget_uid = await _create_budget(client, categories["娛樂"], "monthly", "1000.00")

    res = await client.patch(f"/api/v1/budgets/{budget_uid}", json={"limit_amount": "1500.00"})
    assert res.status_code == 200
    assert res.json()["data"]["limit_amount"] == "1500.00"


async def test_delete_budget_is_soft_delete(client: AsyncClient) -> None:
    await _register_and_login(client, "budget-user-4@example.com")
    categories = await _list_category_uids(client)

    budget_uid = await _create_budget(client, categories["購物"], "monthly", "1000.00")

    del_res = await client.delete(f"/api/v1/budgets/{budget_uid}")
    assert del_res.status_code == 200

    second_delete = await client.delete(f"/api/v1/budgets/{budget_uid}")
    assert second_delete.status_code == 404


async def test_budgets_are_scoped_to_owner(client: AsyncClient) -> None:
    await _register_and_login(client, "budget-owner-a@example.com")
    categories = await _list_category_uids(client)
    budget_uid = await _create_budget(client, categories["醫療"], "monthly", "1000.00")

    await _register_and_login(client, "budget-owner-b@example.com")

    update_res = await client.patch(f"/api/v1/budgets/{budget_uid}", json={"limit_amount": "1.00"})
    assert update_res.status_code == 404

    summary_res = await client.get(f"/api/v1/budgets/{budget_uid}/summary")
    assert summary_res.status_code == 404


async def test_budget_summary_under_budget(client: AsyncClient) -> None:
    await _register_and_login(client, "budget-summary-1@example.com")
    account_uid = await _create_account(client)
    categories = await _list_category_uids(client)
    category_uid = categories["餐飲"]

    budget_uid = await _create_budget(client, category_uid, "monthly", "1000.00")

    now = _taipei_now()
    await _create_expense(client, account_uid, category_uid, now, "300.00")
    # 上個月的支出不計入本月彙總
    await _create_expense(client, account_uid, category_uid, _previous_month_local(now), "9999.00")

    res = await client.get(f"/api/v1/budgets/{budget_uid}/summary")
    assert res.status_code == 200
    body = res.json()["data"]
    assert body["limit_amount"] == "1000.00"
    assert body["spent_amount"] == "300.00"
    assert body["remaining_amount"] == "700.00"
    assert body["is_over_budget"] is False


async def test_budget_summary_over_budget_daily(client: AsyncClient) -> None:
    await _register_and_login(client, "budget-summary-2@example.com")
    account_uid = await _create_account(client)
    categories = await _list_category_uids(client)
    category_uid = categories["交通"]

    budget_uid = await _create_budget(client, category_uid, "daily", "100.00")

    now = _taipei_now()
    await _create_expense(client, account_uid, category_uid, now, "150.00")
    # 昨天的支出不計入今天的彙總
    await _create_expense(client, account_uid, category_uid, now - timedelta(days=1), "9999.00")

    res = await client.get(f"/api/v1/budgets/{budget_uid}/summary")
    assert res.status_code == 200
    body = res.json()["data"]
    assert body["limit_amount"] == "100.00"
    assert body["spent_amount"] == "150.00"
    assert body["remaining_amount"] == "-50.00"
    assert body["is_over_budget"] is True


async def test_budget_summary_excludes_income_and_other_category(client: AsyncClient) -> None:
    await _register_and_login(client, "budget-summary-3@example.com")
    account_uid = await _create_account(client)
    categories = await _list_category_uids(client)
    category_uid = categories["居住"]
    other_category_uid = categories["其他"]

    budget_uid = await _create_budget(client, category_uid, "monthly", "500.00")

    now = _taipei_now()
    # 同分類的收入不算支出
    res = await client.post(
        "/api/v1/transactions",
        json={
            "account_uid": account_uid,
            "category_uid": category_uid,
            "transaction_date": now.isoformat(),
            "description": "退款",
            "amount": "9999.00",
            "transaction_type": "income",
            "payment_method": "現金",
        },
    )
    assert res.status_code == 201
    # 不同分類的支出不算進來
    await _create_expense(client, account_uid, other_category_uid, now, "9999.00")

    res = await client.get(f"/api/v1/budgets/{budget_uid}/summary")
    assert res.status_code == 200
    body = res.json()["data"]
    assert body["spent_amount"] == "0.00"
    assert body["is_over_budget"] is False
