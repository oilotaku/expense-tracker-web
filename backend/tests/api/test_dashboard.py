"""Dashboard 期間彙總 API：月 / 年 / 自訂範圍三種 period，budget_remaining 依 period 分流。

外幣帳戶跨幣別彙總（→ dashboard_service.py 頂部註解）以假匯率服務取代
（`app.dependency_overrides`），不打外部網路（→ AGENTS.md § Testing），同
`test_net_worth.py` 既有的 `get_pricing_service` override 手法。
"""

from collections.abc import Callable
from datetime import datetime
from decimal import Decimal

from httpx import AsyncClient

from app.api.deps import get_pricing_service
from app.clients.stock_price_client import TwseMisTimeoutError
from app.main import app

_PASSWORD = "correct horse battery"


class _FakePricingService:
    """固定回傳事先給定的匯率，驗證跨幣別彙總數字用，不含任何 I/O。"""

    def __init__(self, exchange_rates: dict[tuple[str, str], Decimal] | None = None) -> None:
        self._exchange_rates = exchange_rates or {}

    async def get_exchange_rate(self, base: str, quote: str) -> Decimal:
        if base == quote:
            return Decimal(1)
        return self._exchange_rates[(base, quote)]


class _TimeoutPricingService:
    """模擬外部匯率來源逾時：驗證 /dashboard/exchange-rates 對外回 424 而非未攔截的例外。"""

    async def get_exchange_rate(self, base: str, quote: str) -> Decimal:
        raise TwseMisTimeoutError()


def _override_pricing(factory: Callable[[], object]) -> None:
    app.dependency_overrides[get_pricing_service] = factory


async def _register_and_login(client: AsyncClient, email: str) -> None:
    payload = {"email": email, "password": _PASSWORD}
    await client.post("/api/v1/auth/register", json=payload)
    res = await client.post("/api/v1/auth/login", json=payload)
    assert res.status_code == 200


async def _create_account(
    client: AsyncClient, name: str = "現金", currency: str | None = None
) -> str:
    body: dict[str, str] = {
        "name": name,
        "balance": "1000.00",
        "color": "#8B6ED6",
        "icon": "wallet",
    }
    if currency is not None:
        body["currency"] = currency
    res = await client.post("/api/v1/accounts", json=body)
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


async def test_dashboard_summary_converts_foreign_currency_transactions_to_twd(
    client: AsyncClient,
) -> None:
    await _register_and_login(client, "dashboard-foreign-currency@example.com")
    _override_pricing(lambda: _FakePricingService(exchange_rates={("USD", "TWD"): Decimal("31.5")}))

    twd_account = await _create_account(client, "現金")
    usd_account = await _create_account(client, "美金帳戶", currency="USD")
    categories = await _list_category_uids(client)
    food_uid = categories["餐飲"]

    await _create_transaction(
        client,
        twd_account,
        food_uid,
        datetime.fromisoformat("2026-01-15T12:00:00+08:00"),
        "300.00",
        "expense",
    )
    await _create_transaction(
        client,
        usd_account,
        food_uid,
        datetime.fromisoformat("2026-01-16T12:00:00+08:00"),
        "10.00",
        "expense",
    )

    body = await _get_summary(
        client, "month", "2026-01-01T00:00:00+08:00", "2026-01-31T23:59:59+08:00"
    )
    # 300 TWD + 10 USD * 31.5 = 300 + 315 = 615.00
    assert body["expense"] == "615.00"


async def test_dashboard_budget_remaining_converts_foreign_currency_spending(
    client: AsyncClient,
) -> None:
    await _register_and_login(client, "dashboard-budget-foreign-currency@example.com")
    _override_pricing(lambda: _FakePricingService(exchange_rates={("USD", "TWD"): Decimal("31.5")}))

    twd_account = await _create_account(client, "現金")
    usd_account = await _create_account(client, "美金帳戶", currency="USD")
    categories = await _list_category_uids(client)
    food_uid = categories["餐飲"]

    await _create_budget(client, food_uid, "monthly", "1000.00")
    await _create_transaction(
        client,
        twd_account,
        food_uid,
        datetime.fromisoformat("2026-01-15T12:00:00+08:00"),
        "200.00",
        "expense",
    )
    await _create_transaction(
        client,
        usd_account,
        food_uid,
        datetime.fromisoformat("2026-01-16T12:00:00+08:00"),
        "10.00",
        "expense",
    )

    body = await _get_summary(
        client, "month", "2026-01-01T00:00:00+08:00", "2026-01-31T23:59:59+08:00"
    )
    # 1000 - (200 + 10 * 31.5) = 1000 - 515 = 485.00
    assert body["budget_remaining"] == "485.00"


async def test_dashboard_exchange_rates_returns_all_supported_currencies(
    client: AsyncClient,
) -> None:
    """供前端圖表換算多幣別交易用（→ dashboard_service.py get_currency_rates 頂註解）：
    固定 10 種支援幣別皆須有匯率，TWD 固定 1 且不觸發假匯率服務（未在 exchange_rates 給值）。"""
    await _register_and_login(client, "dashboard-exchange-rates@example.com")
    _override_pricing(
        lambda: _FakePricingService(
            exchange_rates={
                ("USD", "TWD"): Decimal("31.5"),
                ("JPY", "TWD"): Decimal("0.2"),
                ("EUR", "TWD"): Decimal("34.2"),
                ("CNY", "TWD"): Decimal("4.3"),
                ("HKD", "TWD"): Decimal("4.0"),
                ("GBP", "TWD"): Decimal("40.0"),
                ("AUD", "TWD"): Decimal("21.0"),
                ("KRW", "TWD"): Decimal("0.023"),
                ("THB", "TWD"): Decimal("0.9"),
            }
        )
    )

    res = await client.get("/api/v1/dashboard/exchange-rates")

    assert res.status_code == 200
    rates = res.json()["data"]["rates"]
    assert rates == {
        "TWD": "1",
        "USD": "31.5",
        "JPY": "0.2",
        "EUR": "34.2",
        "CNY": "4.3",
        "HKD": "4.0",
        "GBP": "40.0",
        "AUD": "21.0",
        "KRW": "0.023",
        "THB": "0.9",
    }


async def test_dashboard_exchange_rates_pricing_unavailable_returns_424(
    client: AsyncClient,
) -> None:
    await _register_and_login(client, "dashboard-exchange-rates-424@example.com")
    _override_pricing(lambda: _TimeoutPricingService())

    res = await client.get("/api/v1/dashboard/exchange-rates")

    assert res.status_code == 424


async def test_dashboard_exchange_rates_without_jwt_returns_401(client: AsyncClient) -> None:
    res = await client.get("/api/v1/dashboard/exchange-rates")
    assert res.status_code == 401
