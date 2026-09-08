"""淨資產彙總 API：帳戶 + 股票 / 貴金屬金融資產 + 負債混合案例。

外部報價（`pricing_service`）以假物件取代（`app.dependency_overrides`），不打外部網路
（→ AGENTS.md § Testing）；`app/api/v1/net_worth.py` 特意把 `PricingService` 的建構拆成獨立
的 `get_pricing_service` dependency 正是為了讓這裡可以整段替換掉。
"""

from collections.abc import Callable
from decimal import Decimal

import pytest
from httpx import AsyncClient

from app.api.v1.net_worth import get_pricing_service
from app.clients.metal_price_client import MetalSymbol
from app.clients.stock_price_client import TwseMisTimeoutError
from app.main import app

_PASSWORD = "correct horse battery"


async def _register_and_login(client: AsyncClient, email: str) -> None:
    payload = {"email": email, "password": _PASSWORD}
    await client.post("/api/v1/auth/register", json=payload)
    res = await client.post("/api/v1/auth/login", json=payload)
    assert res.status_code == 200


class _FakePricingService:
    """固定回傳事先給定的股票 / 貴金屬單價，驗證彙總數字用，不含任何 I/O。"""

    def __init__(
        self,
        stock_prices: dict[str, Decimal] | None = None,
        metal_prices: dict[MetalSymbol, Decimal] | None = None,
    ) -> None:
        self._stock_prices = stock_prices or {}
        self._metal_prices = metal_prices or {}

    async def get_stock_price(self, ticker: str) -> Decimal:
        return self._stock_prices[ticker]

    async def get_metal_price_per_mace(self, symbol: MetalSymbol) -> Decimal:
        return self._metal_prices[symbol]


class _TimeoutPricingService:
    """模擬外部報價來源逾時：任何報價呼叫都拋出 client 層的逾時例外。"""

    async def get_stock_price(self, ticker: str) -> Decimal:
        raise TwseMisTimeoutError()

    async def get_metal_price_per_mace(self, symbol: MetalSymbol) -> Decimal:
        raise TwseMisTimeoutError()


def _override_pricing(factory: Callable[[], object]) -> None:
    # get_pricing_service 回傳型別是 PricingService，但 FastAPI dependency override 只在意
    # 呼叫時期的實際物件是否具備相同介面（duck typing），故 lambda 回傳假物件即可
    app.dependency_overrides[get_pricing_service] = factory


async def test_get_net_worth_without_jwt_returns_401(client: AsyncClient) -> None:
    res = await client.get("/api/v1/net-worth")
    assert res.status_code == 401


async def test_net_worth_with_no_data_is_zero(client: AsyncClient) -> None:
    await _register_and_login(client, "networth-empty@example.com")
    _override_pricing(lambda: _FakePricingService())

    res = await client.get("/api/v1/net-worth")
    assert res.status_code == 200
    body = res.json()["data"]
    assert body["total_assets"] == "0.00"
    assert body["total_liabilities"] == "0.00"
    assert body["net_worth"] == "0.00"


async def test_net_worth_mixed_account_stock_metal_and_liability(client: AsyncClient) -> None:
    await _register_and_login(client, "networth-mixed@example.com")

    account_res = await client.post(
        "/api/v1/accounts",
        json={"name": "現金", "balance": "10000.00", "color": "#8B6ED6", "icon": "wallet"},
    )
    assert account_res.status_code == 201

    stock_res = await client.post(
        "/api/v1/financial-assets",
        json={"asset_type": "stock", "name": "2330", "input_quantity": "2", "input_unit": "張"},
    )
    assert stock_res.status_code == 201
    assert Decimal(stock_res.json()["data"]["base_quantity"]) == Decimal("2000")  # 1 張=1000 股

    metal_res = await client.post(
        "/api/v1/financial-assets",
        json={"asset_type": "metal", "name": "黃金", "input_quantity": "5", "input_unit": "錢"},
    )
    assert metal_res.status_code == 201
    assert Decimal(metal_res.json()["data"]["base_quantity"]) == Decimal("5")

    liability_res = await client.post(
        "/api/v1/liabilities", json={"name": "信貸", "amount": "500000.00"}
    )
    assert liability_res.status_code == 201

    _override_pricing(
        lambda: _FakePricingService(
            stock_prices={"2330": Decimal("600.00")},
            metal_prices={"XAU": Decimal("8000.00")},
        )
    )

    res = await client.get("/api/v1/net-worth")
    assert res.status_code == 200
    body = res.json()["data"]

    # 總資產 = 10000.00（帳戶）+ 2000 股 * 600.00（股票市值 1,200,000.00）
    #        + 5 錢 * 8000.00（黃金市值 40,000.00） = 1,250,000.00
    assert body["total_assets"] == "1250000.00"
    assert body["total_liabilities"] == "500000.00"
    assert body["net_worth"] == "750000.00"
    assert Decimal(body["total_assets"]) - Decimal(body["total_liabilities"]) == Decimal(
        body["net_worth"]
    )


async def test_net_worth_unsupported_metal_name_returns_422(client: AsyncClient) -> None:
    await _register_and_login(client, "networth-unsupported-metal@example.com")
    create_res = await client.post(
        "/api/v1/financial-assets",
        json={"asset_type": "metal", "name": "白金", "input_quantity": "1", "input_unit": "錢"},
    )
    assert create_res.status_code == 201
    _override_pricing(lambda: _FakePricingService())

    res = await client.get("/api/v1/net-worth")
    assert res.status_code == 422
    assert res.json()["success"] is False


@pytest.mark.parametrize("asset_type,name", [("stock", "2330"), ("metal", "黃金")])
async def test_net_worth_pricing_timeout_returns_clear_non_5xx_error(
    client: AsyncClient, asset_type: str, name: str
) -> None:
    """外部報價來源逾時時，整個彙總請求需回傳明確錯誤（非整個服務以未預期例外崩潰成通用 500）。"""
    await _register_and_login(client, f"networth-timeout-{asset_type}@example.com")
    unit = "股" if asset_type == "stock" else "錢"
    create_res = await client.post(
        "/api/v1/financial-assets",
        json={"asset_type": asset_type, "name": name, "input_quantity": "1", "input_unit": unit},
    )
    assert create_res.status_code == 201

    _override_pricing(lambda: _TimeoutPricingService())

    res = await client.get("/api/v1/net-worth")
    body = res.json()

    assert res.status_code < 500  # 明確錯誤，非「伺服器發生錯誤」的通用 500 崩潰
    assert res.status_code == 424
    assert body["success"] is False
    assert body["detail"] == "報價服務暫時無法使用，請稍後再試"
