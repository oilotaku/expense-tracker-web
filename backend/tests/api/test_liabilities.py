from httpx import AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

_PASSWORD = "correct horse battery"


async def _register_and_login(client: AsyncClient, email: str) -> None:
    payload = {"email": email, "password": _PASSWORD}
    await client.post("/api/v1/auth/register", json=payload)
    res = await client.post("/api/v1/auth/login", json=payload)
    assert res.status_code == 200


async def test_create_liability_without_jwt_returns_401(client: AsyncClient) -> None:
    res = await client.post("/api/v1/liabilities", json={"name": "信用卡", "amount": "1000.00"})
    assert res.status_code == 401
    assert res.json()["success"] is False


async def test_list_liabilities_without_jwt_returns_401(client: AsyncClient) -> None:
    res = await client.get("/api/v1/liabilities")
    assert res.status_code == 401


async def test_create_and_list_liability(client: AsyncClient) -> None:
    await _register_and_login(client, "liability-owner-1@example.com")

    create_res = await client.post(
        "/api/v1/liabilities",
        json={"name": "房貸", "amount": "5000000.00", "interest_rate": "2.15"},
    )
    assert create_res.status_code == 201
    body = create_res.json()
    assert body["success"] is True
    assert body["data"]["name"] == "房貸"
    assert body["data"]["amount"] == "5000000.00"
    assert isinstance(body["data"]["amount"], str)
    assert body["data"]["interest_rate"] == "2.15"
    assert isinstance(body["data"]["interest_rate"], str)

    list_res = await client.get("/api/v1/liabilities")
    assert list_res.status_code == 200
    list_body = list_res.json()
    assert list_body["data"]["total"] == 1
    assert list_body["data"]["items"][0]["name"] == "房貸"


async def test_create_liability_without_interest_rate(client: AsyncClient) -> None:
    await _register_and_login(client, "liability-owner-2@example.com")

    create_res = await client.post(
        "/api/v1/liabilities", json={"name": "信用卡", "amount": "12000.00"}
    )
    assert create_res.status_code == 201
    body = create_res.json()["data"]
    assert body["interest_rate"] is None

    invalid_res = await client.post(
        "/api/v1/liabilities", json={"name": "小數過長", "amount": "100.999"}
    )
    assert invalid_res.status_code == 422


async def test_get_single_liability(client: AsyncClient) -> None:
    await _register_and_login(client, "liability-owner-3@example.com")
    create_res = await client.post(
        "/api/v1/liabilities", json={"name": "信貸", "amount": "300000.00"}
    )
    liability_uid = create_res.json()["data"]["liability_uid"]

    res = await client.get(f"/api/v1/liabilities/{liability_uid}")
    assert res.status_code == 200
    assert res.json()["data"]["liability_uid"] == liability_uid


async def test_get_nonexistent_liability_returns_404(client: AsyncClient) -> None:
    await _register_and_login(client, "liability-owner-4@example.com")
    res = await client.get("/api/v1/liabilities/00000000-0000-4000-8000-000000000000")
    assert res.status_code == 404
    assert res.json()["success"] is False


async def test_update_liability_amount(client: AsyncClient) -> None:
    await _register_and_login(client, "liability-owner-5@example.com")
    create_res = await client.post(
        "/api/v1/liabilities", json={"name": "車貸", "amount": "600000.00"}
    )
    liability_uid = create_res.json()["data"]["liability_uid"]

    res = await client.patch(f"/api/v1/liabilities/{liability_uid}", json={"amount": "550000.00"})
    assert res.status_code == 200
    body = res.json()["data"]
    assert body["amount"] == "550000.00"
    assert body["name"] == "車貸"


async def test_soft_delete_liability_hides_it(client: AsyncClient) -> None:
    await _register_and_login(client, "liability-owner-6@example.com")
    create_res = await client.post(
        "/api/v1/liabilities", json={"name": "待清償", "amount": "10.00"}
    )
    liability_uid = create_res.json()["data"]["liability_uid"]

    del_res = await client.delete(f"/api/v1/liabilities/{liability_uid}")
    assert del_res.status_code == 200
    assert del_res.json()["success"] is True

    get_res = await client.get(f"/api/v1/liabilities/{liability_uid}")
    assert get_res.status_code == 404

    list_res = await client.get("/api/v1/liabilities")
    assert list_res.json()["data"]["total"] == 0


async def test_liabilities_scoped_to_owner_not_leaked_to_other_user(
    client: AsyncClient,
) -> None:
    await _register_and_login(client, "liability-owner-a@example.com")
    create_res = await client.post(
        "/api/v1/liabilities", json={"name": "A 的負債", "amount": "999.00"}
    )
    liability_uid = create_res.json()["data"]["liability_uid"]

    # 切換為另一使用者（同一 client 的 cookie 被覆寫）
    await _register_and_login(client, "liability-owner-b@example.com")

    list_res = await client.get("/api/v1/liabilities")
    assert list_res.status_code == 200
    assert list_res.json()["data"]["total"] == 0
    assert list_res.json()["data"]["items"] == []

    get_res = await client.get(f"/api/v1/liabilities/{liability_uid}")
    assert get_res.status_code == 404

    patch_res = await client.patch(f"/api/v1/liabilities/{liability_uid}", json={"name": "偷改"})
    assert patch_res.status_code == 404

    del_res = await client.delete(f"/api/v1/liabilities/{liability_uid}")
    assert del_res.status_code == 404


async def test_amount_and_interest_rate_columns_are_numeric(db: AsyncSession) -> None:
    stmt = text(
        "SELECT column_name, data_type, numeric_precision, numeric_scale "
        "FROM information_schema.columns "
        "WHERE table_name = 'liabilities' AND column_name IN ('amount', 'interest_rate')"
    )
    rows = {row.column_name: row for row in (await db.execute(stmt)).fetchall()}

    assert rows["amount"].data_type == "numeric"
    assert rows["amount"].numeric_precision == 18
    assert rows["amount"].numeric_scale == 2

    assert rows["interest_rate"].data_type == "numeric"
    assert rows["interest_rate"].numeric_precision == 5
    assert rows["interest_rate"].numeric_scale == 2


async def _make_account_and_category(client: AsyncClient) -> tuple[str, str]:
    account_res = await client.post(
        "/api/v1/accounts",
        json={"name": "現金", "balance": "0.00", "color": "#8B6ED6", "icon": "wallet"},
    )
    category_res = await client.post(
        "/api/v1/categories",
        json={"name": "還款", "color": "#E8834B", "icon": "bell"},
    )
    return account_res.json()["data"]["account_uid"], category_res.json()["data"]["category_uid"]


async def test_repay_liability_creates_expense_transaction_and_decreases_amount(
    client: AsyncClient,
) -> None:
    await _register_and_login(client, "liability-repay-1@example.com")
    account_uid, category_uid = await _make_account_and_category(client)
    created = await client.post(
        "/api/v1/liabilities", json={"name": "信用卡", "amount": "10000.00"}
    )
    liability_uid = created.json()["data"]["liability_uid"]

    res = await client.post(
        f"/api/v1/liabilities/{liability_uid}/repay",
        json={
            "amount": "3000.00",
            "account_uid": account_uid,
            "category_uid": category_uid,
            "payment_method": "轉帳",
        },
    )
    assert res.status_code == 200
    assert res.json()["data"]["amount"] == "7000.00"

    transactions_res = await client.get("/api/v1/transactions")
    items = transactions_res.json()["data"]["items"]
    assert len(items) == 1
    assert items[0]["amount"] == "3000.00"
    assert items[0]["transaction_type"] == "expense"
    assert items[0]["description"] == "信用卡 還款"


async def test_repay_liability_amount_greater_than_or_equal_returns_422(
    client: AsyncClient,
) -> None:
    await _register_and_login(client, "liability-repay-2@example.com")
    account_uid, category_uid = await _make_account_and_category(client)
    created = await client.post(
        "/api/v1/liabilities", json={"name": "信用卡", "amount": "10000.00"}
    )
    liability_uid = created.json()["data"]["liability_uid"]

    res = await client.post(
        f"/api/v1/liabilities/{liability_uid}/repay",
        json={
            "amount": "10000.00",
            "account_uid": account_uid,
            "category_uid": category_uid,
            "payment_method": "轉帳",
        },
    )
    assert res.status_code == 422

    transactions_res = await client.get("/api/v1/transactions")
    assert transactions_res.json()["data"]["items"] == []


async def test_repay_liability_with_others_account_returns_404(client: AsyncClient) -> None:
    await _register_and_login(client, "liability-repay-owner@example.com")
    other_account_uid, other_category_uid = await _make_account_and_category(client)

    await _register_and_login(client, "liability-repay-attacker@example.com")
    created = await client.post(
        "/api/v1/liabilities", json={"name": "信用卡", "amount": "10000.00"}
    )
    liability_uid = created.json()["data"]["liability_uid"]

    res = await client.post(
        f"/api/v1/liabilities/{liability_uid}/repay",
        json={
            "amount": "1000.00",
            "account_uid": other_account_uid,
            "category_uid": other_category_uid,
            "payment_method": "轉帳",
        },
    )
    assert res.status_code == 404


async def test_repay_liability_without_jwt_returns_401(client: AsyncClient) -> None:
    res = await client.post(
        "/api/v1/liabilities/nonexistent/repay",
        json={
            "amount": "100.00",
            "account_uid": "00000000-0000-0000-0000-000000000000",
            "category_uid": "00000000-0000-0000-0000-000000000000",
            "payment_method": "轉帳",
        },
    )
    assert res.status_code in (401, 422)
