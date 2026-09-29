"""新增金融資產時,同類型同名稱的既有資產直接合併(2026-09-29 使用者要求)。

起因:使用者加碼 0050 時用「新增」輸入,系統另開一筆,清單出現兩筆 0050。
"""

from decimal import Decimal

from httpx import AsyncClient

from app.api.v1.financial_assets import _merged_principal

_PASSWORD = "correct horse battery"
_URL = "/api/v1/financial-assets"


async def _login(client: AsyncClient, email: str) -> None:
    payload = {"email": email, "password": _PASSWORD}
    await client.post("/api/v1/auth/register", json=payload)
    res = await client.post("/api/v1/auth/login", json=payload)
    assert res.status_code == 200


async def _add(client: AsyncClient, **fields: str) -> dict:
    res = await client.post(_URL, json=fields)
    assert res.status_code == 201, res.text
    return res.json()["data"]


async def _items(client: AsyncClient) -> list[dict]:
    res = await client.get(_URL)
    assert res.status_code == 200
    return res.json()["data"]["items"]


async def test_same_stock_is_merged_into_one_row(client: AsyncClient) -> None:
    await _login(client, "merge-same@example.com")
    first = await _add(
        client,
        asset_type="stock",
        name="0050",
        input_quantity="413",
        input_unit="股",
        principal_amount="43188.00",
    )
    second = await _add(
        client,
        asset_type="stock",
        name="0050",
        input_quantity="50",
        input_unit="股",
        principal_amount="5511.00",
    )

    assert second["financial_asset_uid"] == first["financial_asset_uid"]
    items = await _items(client)
    assert len(items) == 1
    assert items[0]["input_quantity"] == "463.0000"
    assert items[0]["base_quantity"] == "463.0000"
    assert items[0]["principal_amount"] == "48699.00"


async def test_different_units_fall_back_to_base_unit(client: AsyncClient) -> None:
    await _login(client, "merge-units@example.com")
    await _add(
        client,
        asset_type="stock",
        name="2330",
        input_quantity="1",
        input_unit="張",
        principal_amount="600000.00",
    )
    merged = await _add(
        client,
        asset_type="stock",
        name="2330",
        input_quantity="10",
        input_unit="股",
        principal_amount="6000.00",
    )

    assert merged["input_unit"] == "股"
    assert merged["input_quantity"] == "1010.0000"
    assert merged["base_quantity"] == "1010.0000"
    assert merged["principal_amount"] == "606000.00"


async def test_name_match_ignores_case_and_spaces(client: AsyncClient) -> None:
    # 台股 / 美股代號格式固定(數字 / 大寫),自由名稱只有貴金屬,用它驗大小寫與空白
    await _login(client, "merge-case@example.com")
    await _add(
        client,
        asset_type="metal",
        name="Gold",
        input_quantity="3",
        input_unit="錢",
        principal_amount="38290.00",
    )
    await _add(
        client,
        asset_type="metal",
        name=" gold ",
        input_quantity="1",
        input_unit="錢",
        principal_amount="13000.00",
    )

    items = await _items(client)
    assert len(items) == 1
    assert items[0]["name"] == "Gold"
    assert Decimal(items[0]["base_quantity"]) == 4
    assert Decimal(items[0]["principal_amount"]) == Decimal("51290.00")


def test_merged_principal_keeps_known_side() -> None:
    # 新增時成本必填,但舊資料可能是 null(update 端點允許不帶),合併時保留已知的一邊
    assert _merged_principal(None, Decimal("100")) == Decimal("100")
    assert _merged_principal(Decimal("100"), None) == Decimal("100")
    assert _merged_principal(None, None) is None
    assert _merged_principal(Decimal("100"), Decimal("50")) == Decimal("150")


async def test_different_names_types_or_users_are_not_merged(client: AsyncClient) -> None:
    await _login(client, "merge-other-a@example.com")
    await _add(
        client,
        asset_type="stock",
        name="0050",
        input_quantity="10",
        input_unit="股",
        principal_amount="1000.00",
    )
    await _add(
        client,
        asset_type="stock",
        name="0056",
        input_quantity="10",
        input_unit="股",
        principal_amount="1000.00",
    )
    assert len(await _items(client)) == 2

    await _login(client, "merge-other-b@example.com")
    await _add(
        client,
        asset_type="stock",
        name="0050",
        input_quantity="5",
        input_unit="股",
        principal_amount="500.00",
    )
    items = await _items(client)
    assert len(items) == 1
    assert items[0]["base_quantity"] == "5.0000"


async def test_deleted_asset_is_not_merged_into(client: AsyncClient) -> None:
    await _login(client, "merge-deleted@example.com")
    old = await _add(
        client,
        asset_type="stock",
        name="0050",
        input_quantity="16",
        input_unit="股",
        principal_amount="1794.00",
    )
    res = await client.delete(f"{_URL}/{old['financial_asset_uid']}")
    assert res.status_code in (200, 204)

    fresh = await _add(
        client,
        asset_type="stock",
        name="0050",
        input_quantity="10",
        input_unit="股",
        principal_amount="1100.00",
    )
    assert fresh["financial_asset_uid"] != old["financial_asset_uid"]
    assert Decimal(fresh["base_quantity"]) == 10
