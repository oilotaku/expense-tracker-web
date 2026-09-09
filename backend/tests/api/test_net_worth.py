"""淨資產彙總 API：帳戶 + 股票 / 貴金屬金融資產 + 負債混合案例。

外部報價（`pricing_service`）以假物件取代（`app.dependency_overrides`），不打外部網路
（→ AGENTS.md § Testing）；`app/api/deps.py` 特意把 `PricingService` 的建構拆成獨立的
`get_pricing_service` dependency 正是為了讓這裡可以整段替換掉（原本定義在 `net_worth.py`，
帳戶幣別換算上線後 `dashboard.py` 也需要同一份匯率服務，搬到 `deps.py` 共用，
→ `test_dashboard.py` 用同一個 override 目標）。
"""

from collections.abc import Callable
from decimal import Decimal

import pytest
from httpx import AsyncClient

from app.api.deps import get_pricing_service
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
    """固定回傳事先給定的台股 / 美股 / 貴金屬單價 / 匯率，驗證彙總數字用，不含任何 I/O。"""

    def __init__(
        self,
        stock_prices: dict[str, Decimal] | None = None,
        us_stock_prices: dict[str, Decimal] | None = None,
        metal_prices: dict[MetalSymbol, Decimal] | None = None,
        exchange_rates: dict[tuple[str, str], Decimal] | None = None,
    ) -> None:
        self._stock_prices = stock_prices or {}
        self._us_stock_prices = us_stock_prices or {}
        self._metal_prices = metal_prices or {}
        self._exchange_rates = exchange_rates or {}

    async def get_stock_price(self, ticker: str) -> Decimal:
        return self._stock_prices[ticker]

    async def get_us_stock_price(self, ticker: str) -> Decimal:
        return self._us_stock_prices[ticker]

    async def get_metal_price_per_mace(self, symbol: MetalSymbol) -> Decimal:
        return self._metal_prices[symbol]

    async def get_exchange_rate(self, base: str, quote: str) -> Decimal:
        if base == quote:
            return Decimal(1)
        return self._exchange_rates[(base, quote)]


class _TimeoutPricingService:
    """模擬外部報價來源逾時：任何報價呼叫都拋出 client 層的逾時例外。"""

    async def get_stock_price(self, ticker: str) -> Decimal:
        raise TwseMisTimeoutError()

    async def get_us_stock_price(self, ticker: str) -> Decimal:
        raise TwseMisTimeoutError()

    async def get_metal_price_per_mace(self, symbol: MetalSymbol) -> Decimal:
        raise TwseMisTimeoutError()

    async def get_exchange_rate(self, base: str, quote: str) -> Decimal:
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


async def test_net_worth_converts_foreign_currency_account_to_twd(client: AsyncClient) -> None:
    await _register_and_login(client, "networth-foreign-currency@example.com")
    _override_pricing(lambda: _FakePricingService(exchange_rates={("USD", "TWD"): Decimal("31.5")}))

    twd_res = await client.post(
        "/api/v1/accounts",
        json={"name": "現金", "balance": "1000.00", "color": "#8B6ED6", "icon": "wallet"},
    )
    assert twd_res.status_code == 201
    usd_res = await client.post(
        "/api/v1/accounts",
        json={
            "name": "美金帳戶",
            "balance": "100.00",
            "color": "#3E8FD0",
            "icon": "bank",
            "currency": "USD",
        },
    )
    assert usd_res.status_code == 201

    res = await client.get("/api/v1/net-worth")
    assert res.status_code == 200
    body = res.json()["data"]
    # 1000 TWD + 100 USD * 31.5 = 1000 + 3150 = 4150
    assert body["total_assets"] == "4150.00"
    assert body["net_worth"] == "4150.00"


async def test_net_worth_mixed_account_stock_metal_and_liability(client: AsyncClient) -> None:
    await _register_and_login(client, "networth-mixed@example.com")

    account_res = await client.post(
        "/api/v1/accounts",
        json={"name": "現金", "balance": "10000.00", "color": "#8B6ED6", "icon": "wallet"},
    )
    assert account_res.status_code == 201

    stock_res = await client.post(
        "/api/v1/financial-assets",
        json={
            "asset_type": "stock",
            "name": "2330",
            "input_quantity": "2",
            "input_unit": "張",
            "principal_amount": "60000.00",
        },
    )
    assert stock_res.status_code == 201
    assert Decimal(stock_res.json()["data"]["base_quantity"]) == Decimal("2000")  # 1 張=1000 股

    us_stock_res = await client.post(
        "/api/v1/financial-assets",
        json={
            "asset_type": "us_stock",
            "name": "AAPL",
            "input_quantity": "10",
            "input_unit": "股",
            "principal_amount": "40000.00",
        },
    )
    assert us_stock_res.status_code == 201
    # 美股沒有「張」概念，輸入量即基本單位量，不需換算（→ ADR-0003 / unit_conversion.py）
    assert Decimal(us_stock_res.json()["data"]["base_quantity"]) == Decimal("10")

    metal_res = await client.post(
        "/api/v1/financial-assets",
        json={
            "asset_type": "metal",
            "name": "黃金",
            "input_quantity": "5",
            "input_unit": "錢",
            "principal_amount": "30000.00",
        },
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
            us_stock_prices={"AAPL": Decimal("5000.00")},  # 已含 USD→TWD 換算（→ ADR-0003）
            metal_prices={"XAU": Decimal("8000.00")},
        )
    )

    res = await client.get("/api/v1/net-worth")
    assert res.status_code == 200
    body = res.json()["data"]

    # 總資產 = 10000.00（帳戶）+ 2000 股 * 600.00（台股市值 1,200,000.00）
    #        + 10 股 * 5000.00（美股市值 50,000.00）
    #        + 5 錢 * 8000.00（黃金市值 40,000.00） = 1,300,000.00
    assert body["total_assets"] == "1300000.00"
    assert body["total_liabilities"] == "500000.00"
    assert body["net_worth"] == "800000.00"
    assert Decimal(body["total_assets"]) - Decimal(body["total_liabilities"]) == Decimal(
        body["net_worth"]
    )

    # 每筆資產的市值與對比本金的漲跌幅（→ NetWorthAssetItem）
    assets_by_name = {item["name"]: item for item in body["assets"]}
    stock_item = assets_by_name["2330"]
    assert stock_item["market_value"] == "1200000.00"
    assert stock_item["principal_amount"] == "60000.00"
    # (1200000 - 60000) / 60000 * 100 = 1900.00%
    assert stock_item["gain_percent"] == "1900.00"

    us_stock_item = assets_by_name["AAPL"]
    assert us_stock_item["market_value"] == "50000.00"
    assert us_stock_item["principal_amount"] == "40000.00"
    # (50000 - 40000) / 40000 * 100 = 25.00%
    assert us_stock_item["gain_percent"] == "25.00"

    metal_item = assets_by_name["黃金"]
    assert metal_item["market_value"] == "40000.00"
    assert metal_item["principal_amount"] == "30000.00"
    # (40000 - 30000) / 30000 * 100 = 33.333...% → 33.33
    assert metal_item["gain_percent"] == "33.33"


@pytest.mark.parametrize(
    "case,bad_ticker", [("name", "聯發科"), ("en", "TSM"), ("short", "23"), ("long", "23300000")]
)
async def test_create_stock_asset_rejects_non_numeric_ticker(
    client: AsyncClient, case: str, bad_ticker: str
) -> None:
    """`name` 是報價查詢用的證券代號，收公司名稱／英文代號等非 4-6 位數字一律 422，
    避免建立後每次算淨資產都因查無報價而失敗（真實案例：使用者輸入「聯發科」而非「2454」）。
    """
    # email local-part 避免直接塞中文（EmailStr 可能不允許），改用 case 這個 ASCII 識別字。
    await _register_and_login(client, f"networth-bad-ticker-{case}@example.com")
    res = await client.post(
        "/api/v1/financial-assets",
        json={
            "asset_type": "stock",
            "name": bad_ticker,
            "input_quantity": "1",
            "input_unit": "股",
            "principal_amount": "1000.00",
        },
    )
    assert res.status_code == 422
    assert res.json()["success"] is False


@pytest.mark.parametrize(
    "case,bad_ticker",
    [("tw_style", "2330"), ("lowercase", "aapl"), ("too_long", "TOOLONG"), ("with_space", "AA PL")],
)
async def test_create_us_stock_asset_rejects_non_ticker_format(
    client: AsyncClient, case: str, bad_ticker: str
) -> None:
    """美股代號須為 1-5 位大寫英文字母（選配 `.字母` 後綴），拒絕台股代號格式、小寫、
    超長或含空白（→ validate_name_for_asset_type / ADR-0003）。
    """
    await _register_and_login(client, f"networth-bad-us-ticker-{case}@example.com")
    res = await client.post(
        "/api/v1/financial-assets",
        json={
            "asset_type": "us_stock",
            "name": bad_ticker,
            "input_quantity": "1",
            "input_unit": "股",
            "principal_amount": "1000.00",
        },
    )
    assert res.status_code == 422
    assert res.json()["success"] is False


async def test_create_us_stock_asset_rejects_lot_unit(client: AsyncClient) -> None:
    """美股沒有「張」的整手概念，只收「股」（→ 使用者確認，本次 session；ADR-0003）。"""
    await _register_and_login(client, "networth-us-stock-no-lot@example.com")
    res = await client.post(
        "/api/v1/financial-assets",
        json={
            "asset_type": "us_stock",
            "name": "AAPL",
            "input_quantity": "1",
            "input_unit": "張",
            "principal_amount": "1000.00",
        },
    )
    assert res.status_code == 422
    assert res.json()["success"] is False


async def test_net_worth_unsupported_metal_name_returns_422(client: AsyncClient) -> None:
    await _register_and_login(client, "networth-unsupported-metal@example.com")
    create_res = await client.post(
        "/api/v1/financial-assets",
        json={
            "asset_type": "metal",
            "name": "白金",
            "input_quantity": "1",
            "input_unit": "錢",
            "principal_amount": "1000.00",
        },
    )
    assert create_res.status_code == 201
    _override_pricing(lambda: _FakePricingService())

    res = await client.get("/api/v1/net-worth")
    assert res.status_code == 422
    assert res.json()["success"] is False


@pytest.mark.parametrize(
    "asset_type,name", [("stock", "2330"), ("us_stock", "AAPL"), ("metal", "黃金")]
)
async def test_net_worth_pricing_timeout_returns_clear_non_5xx_error(
    client: AsyncClient, asset_type: str, name: str
) -> None:
    """外部報價來源逾時時，整個彙總請求需回傳明確錯誤（非整個服務以未預期例外崩潰成通用 500）。"""
    await _register_and_login(client, f"networth-timeout-{asset_type}@example.com")
    unit = "錢" if asset_type == "metal" else "股"
    create_res = await client.post(
        "/api/v1/financial-assets",
        json={
            "asset_type": asset_type,
            "name": name,
            "input_quantity": "1",
            "input_unit": unit,
            "principal_amount": "1000.00",
        },
    )
    assert create_res.status_code == 201

    _override_pricing(lambda: _TimeoutPricingService())

    res = await client.get("/api/v1/net-worth")
    body = res.json()

    assert res.status_code < 500  # 明確錯誤，非「伺服器發生錯誤」的通用 500 崩潰
    assert res.status_code == 424
    assert body["success"] is False
    assert body["detail"] == "報價服務暫時無法使用，請稍後再試"


async def test_net_worth_foreign_currency_pricing_timeout_returns_424(client: AsyncClient) -> None:
    await _register_and_login(client, "networth-currency-timeout@example.com")
    res = await client.post(
        "/api/v1/accounts",
        json={
            "name": "美金帳戶",
            "balance": "100.00",
            "color": "#8B6ED6",
            "icon": "wallet",
            "currency": "USD",
        },
    )
    assert res.status_code == 201

    _override_pricing(lambda: _TimeoutPricingService())

    res = await client.get("/api/v1/net-worth")
    body = res.json()
    assert res.status_code == 424
    assert body["success"] is False
