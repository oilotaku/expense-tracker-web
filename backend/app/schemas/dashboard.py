"""Dashboard 期間彙總 request / response schema：金額一律 Decimal，JSON 序列化為字串（DB-038）。

`date_from`/`date_to` 沿用既有 `TransactionListFilter.date_from/date_to`（`datetime`）的邊界慣例
（→ A14），不引入新的日期序列化慣例。
"""

from datetime import datetime
from decimal import Decimal
from typing import Literal
from uuid import UUID

from pydantic import Field, field_serializer, model_validator

from app.schemas.base import ApiInput, ApiSchema
from app.utils.currency import SupportedCurrency

DashboardPeriod = Literal["month", "year", "custom"]


class DashboardSummaryFilter(ApiInput):
    period: DashboardPeriod
    date_from: datetime
    date_to: datetime

    @model_validator(mode="after")
    def _validate_date_range(self) -> DashboardSummaryFilter:
        if self.date_to < self.date_from:
            raise ValueError("date_to 必須大於等於 date_from")
        return self


class DashboardDateRangeFilter(ApiInput):
    """分類彙總 / 趨勢彙總共用：不像 `DashboardSummaryFilter` 有 `period`（budget_remaining 只在
    period=month/year 才有意義），這兩支彙總只需要日期範圍。"""

    date_from: datetime
    date_to: datetime

    @model_validator(mode="after")
    def _validate_date_range(self) -> DashboardDateRangeFilter:
        if self.date_to < self.date_from:
            raise ValueError("date_to 必須大於等於 date_from")
        return self


class CategoryBreakdownItem(ApiSchema):
    category_uid: UUID
    amount: Decimal

    @field_serializer("amount", when_used="json")
    def _amount_to_str(self, v: Decimal) -> str:
        return str(v)


class CategoryBreakdownResponse(ApiSchema):
    items: list[CategoryBreakdownItem]


class DashboardTrendPoint(ApiSchema):
    # 本地日曆日（`Settings.API_TZ`，非 UTC，→ CORE-041），"YYYY-MM-DD"
    date: str
    income: Decimal
    expense: Decimal

    @field_serializer("income", "expense", when_used="json")
    def _amounts_to_str(self, v: Decimal) -> str:
        return str(v)


class DashboardTrendResponse(ApiSchema):
    items: list[DashboardTrendPoint]


class DashboardSummaryResponse(ApiSchema):
    period: str
    date_from: datetime
    date_to: datetime
    income: Decimal
    expense: Decimal
    balance: Decimal
    # period == "custom" 時一律 null（區間不對齊月份邊界，估算會失真）；period == "month" /
    # "year" 為「月度預算 × 涵蓋月份數 − 已花費」的加總（年視圖固定 12 個月，取代舊決策 A7 的
    # 一律 null 作法）；未設定任何月度預算時為 0.00（非 null，區分「不適用」與「有查、目前是 0」）
    budget_remaining: Decimal | None

    @field_serializer("income", "expense", "balance", when_used="json")
    def _amounts_to_str(self, v: Decimal) -> str:
        return str(v)

    @field_serializer("budget_remaining", when_used="json")
    def _budget_remaining_to_str(self, v: Decimal | None) -> str | None:
        return str(v) if v is not None else None


class CurrencyRatesResponse(ApiSchema):
    """固定 10 種支援幣別對 TWD 的即時匯率，供前端圖表換算多幣別交易用（→ Dashboard 分類圖表 /
    趨勢線圖不能直接加總不同幣別的原始金額，需先換算成 TWD 再加總）。"""

    rates: dict[SupportedCurrency, Decimal] = Field(
        ..., description="幣別代碼對 TWD 的匯率（TWD 本身固定為 1，不打外部 API）"
    )

    @field_serializer("rates", when_used="json")
    def _rates_to_str(self, v: dict[SupportedCurrency, Decimal]) -> dict[str, str]:
        return {currency.value: str(rate) for currency, rate in v.items()}
