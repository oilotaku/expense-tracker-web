"""Dashboard 期間彙總 service：income/expense 用一次 SQL `GROUP BY transaction_type` 加總

（→ BE-095，避免抓全部交易到 app 層再加總）。`budget_remaining` 沿用
`BudgetService.get_summary`（`app/services/budget_service.py`）「同分類同期間已花費」的計算邏輯，
但改寫成單一 SQL（相關子查詢逐筆算 `limit_amount - spent`，DB 端一次 `SUM` 加總），
避免對 `BudgetRepository` 逐筆呼叫造成的迴圈式 N+1（→ BE-095 / BE-089）。

帳戶幣別換算（外幣帳戶功能）：`GROUP BY` 多加一個 `Account.currency` 維度，SQL 端仍是一次查詢
把同幣別的交易先加總好，只有極少數（使用者實際使用的帳戶幣別種類，通常 1–3 種）子總額需要在
Python 端呼叫一次 `PricingService.get_exchange_rate()` 換算成 TWD，不會退化成逐筆交易的 N+1；
預算金額本身固定以 TWD 計價（`Budget.limit_amount` 沒有幣別欄位），花費計算把該分類底下所有
幣別的交易都換算成 TWD 再跟預算比較，維持「一個分類一個預算上限」的既有語意。
"""

from datetime import datetime
from decimal import Decimal
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AppError
from app.models.account import Account
from app.models.budget import Budget, BudgetPeriodType
from app.models.transaction import Transaction, TransactionType
from app.schemas.dashboard import (
    CategoryBreakdownItem,
    CategoryBreakdownResponse,
    DashboardSummaryResponse,
    DashboardTrendPoint,
    DashboardTrendResponse,
)
from app.services.pricing_service import PricingService
from app.utils.currency import SupportedCurrency
from app.utils.datetime import to_api_tz

_CENTS = Decimal("0.01")


class DashboardPricingUnavailableError(AppError):
    """彙總收支/預算花費時，非 TWD 帳戶所需的匯率外部來源逾時 / 失敗（非本服務崩潰），
    同 `net_worth_service.NetWorthPricingUnavailableError` 的既有處理慣例（424，非 5xx）。"""

    def __init__(
        self, detail: str = "匯率服務暫時無法使用，收支金額可能不準確，請稍後再試"
    ) -> None:
        super().__init__(
            detail, response_code=424, status_code=424, error_code="DASHBOARD_PRICING_UNAVAILABLE"
        )


class DashboardService:
    def __init__(self, db: AsyncSession, pricing_service: PricingService) -> None:
        self._db = db
        self._pricing_service = pricing_service

    async def _to_twd(self, amount: Decimal, currency: str) -> Decimal:
        if currency == "TWD" or amount == 0:
            return amount
        try:
            rate = await self._pricing_service.get_exchange_rate(currency, "TWD")
        except AppError as e:
            raise DashboardPricingUnavailableError() from e
        return amount * rate

    async def get_currency_rates(self) -> dict[SupportedCurrency, Decimal]:
        """固定 10 種支援幣別對 TWD 的即時匯率，供前端圖表換算多幣別交易用（→ 前端
        dashboard/page.tsx 的分類圖表/趨勢線圖不能像本服務的 SQL 彙總那樣先分幣別 GROUP BY，
        因為圖表資料是既有的 useListTransactionsQuery 原始交易清單，改成前端算）。"""
        rates: dict[SupportedCurrency, Decimal] = {}
        for currency in SupportedCurrency:
            rates[currency] = await self._to_twd(Decimal(1), currency.value)
        return rates

    async def get_summary(
        self, user_uid: UUID, period: str, date_from: datetime, date_to: datetime
    ) -> DashboardSummaryResponse:
        income, expense = await self._sum_income_expense(user_uid, date_from, date_to)
        balance = (income - expense).quantize(_CENTS)
        budget_remaining = (
            await self._sum_budget_remaining(user_uid, date_from, date_to)
            if period == "month"
            else None
        )
        return DashboardSummaryResponse(
            period=period,
            date_from=date_from,
            date_to=date_to,
            income=income,
            expense=expense,
            balance=balance,
            budget_remaining=budget_remaining,
        )

    async def _sum_income_expense(
        self, user_uid: UUID, date_from: datetime, date_to: datetime
    ) -> tuple[Decimal, Decimal]:
        # GROUP BY 多一個 Account.currency 維度（→ 本檔頂部註解），同幣別的交易仍在 SQL 端一次
        # 加總好，只有少數子總額需要在 Python 端換算。
        stmt = (
            select(
                Transaction.transaction_type,
                Account.currency,
                func.coalesce(func.sum(Transaction.amount), 0),
            )
            .join(Account, Account.account_uid == Transaction.account_uid)
            .where(
                Transaction.user_uid == user_uid,
                Transaction.is_deleted.is_(False),
                Transaction.transaction_date >= date_from,
                Transaction.transaction_date <= date_to,
            )
            .group_by(Transaction.transaction_type, Account.currency)
        )
        rows = (await self._db.execute(stmt)).all()
        income = Decimal("0")
        expense = Decimal("0")
        for transaction_type, currency, subtotal in rows:
            converted = await self._to_twd(Decimal(subtotal), currency)
            if transaction_type == TransactionType.INCOME:
                income += converted
            elif transaction_type == TransactionType.EXPENSE:
                expense += converted
            # transaction_type == TRANSFER 的子總額落在這裡會被忽略（不進 income/expense
            # 任何一支），維持既有「轉帳不計入收支」的行為，不需要額外過濾條件。
        return income.quantize(_CENTS), expense.quantize(_CENTS)

    async def _sum_budget_remaining(
        self, user_uid: UUID, date_from: datetime, date_to: datetime
    ) -> Decimal:
        # 原本是「一次 SQL 用相關子查詢算完」，但換算幣別需要 Python 端呼叫匯率服務，沒辦法在
        # 純 SQL 內完成，改成兩個查詢（budgets 本身 + 依 category/currency 分組的花費子總額）；
        # 查詢數量固定是 2，不是逐一 budget 迴圈，仍避免 BE-089 要防的 N+1。
        budgets_stmt = select(Budget.category_uid, Budget.limit_amount).where(
            Budget.user_uid == user_uid,
            Budget.period_type == BudgetPeriodType.MONTHLY,
            Budget.is_deleted.is_(False),
        )
        budgets = (await self._db.execute(budgets_stmt)).all()
        if not budgets:
            return Decimal("0.00")

        category_uids = [category_uid for category_uid, _ in budgets]
        spent_stmt = (
            select(
                Transaction.category_uid,
                Account.currency,
                func.coalesce(func.sum(Transaction.amount), 0),
            )
            .join(Account, Account.account_uid == Transaction.account_uid)
            .where(
                Transaction.user_uid == user_uid,
                Transaction.category_uid.in_(category_uids),
                Transaction.transaction_type == TransactionType.EXPENSE,
                Transaction.is_deleted.is_(False),
                Transaction.transaction_date >= date_from,
                Transaction.transaction_date <= date_to,
            )
            .group_by(Transaction.category_uid, Account.currency)
        )
        spent_rows = (await self._db.execute(spent_stmt)).all()

        spent_by_category: dict[UUID, Decimal] = {}
        for category_uid, currency, subtotal in spent_rows:
            converted = await self._to_twd(Decimal(subtotal), currency)
            existing = spent_by_category.get(category_uid, Decimal("0"))
            spent_by_category[category_uid] = existing + converted

        total = sum(
            (
                limit_amount - spent_by_category.get(category_uid, Decimal("0"))
                for category_uid, limit_amount in budgets
            ),
            Decimal("0"),
        )
        return total.quantize(_CENTS)

    async def get_category_breakdown(
        self, user_uid: UUID, date_from: datetime, date_to: datetime
    ) -> CategoryBreakdownResponse:
        """依分類彙總期間內支出（→ Dashboard 分類圓餅圖/長條圖），取代舊版前端吃
        `GET /transactions?limit=100` 自算的做法（該做法交易數超過 100 筆時資料不完整）。

        SQL 端先依 (category_uid, currency) GROUP BY 加總，只有少數子總額需要在 Python 端呼叫
        `PricingService` 換算 TWD（同 `_sum_income_expense` 既有模式，→ BE-089）。
        """
        stmt = (
            select(
                Transaction.category_uid,
                Account.currency,
                func.coalesce(func.sum(Transaction.amount), 0),
            )
            .join(Account, Account.account_uid == Transaction.account_uid)
            .where(
                Transaction.user_uid == user_uid,
                Transaction.is_deleted.is_(False),
                Transaction.transaction_type == TransactionType.EXPENSE,
                Transaction.transaction_date >= date_from,
                Transaction.transaction_date <= date_to,
            )
            .group_by(Transaction.category_uid, Account.currency)
        )
        rows = (await self._db.execute(stmt)).all()

        totals: dict[UUID, Decimal] = {}
        for category_uid, currency, subtotal in rows:
            converted = await self._to_twd(Decimal(subtotal), currency)
            totals[category_uid] = totals.get(category_uid, Decimal("0")) + converted

        return CategoryBreakdownResponse(
            items=[
                CategoryBreakdownItem(category_uid=category_uid, amount=amount.quantize(_CENTS))
                for category_uid, amount in totals.items()
            ]
        )

    async def get_trend(
        self, user_uid: UUID, date_from: datetime, date_to: datetime
    ) -> DashboardTrendResponse:
        """依日期彙總收支（→ Dashboard 收支趨勢線圖），取代舊版前端吃
        `GET /transactions?limit=100` 自算的做法（同 `get_category_breakdown` 動機）。

        分桶用的「日期」是 `Settings.API_TZ` 的本地日曆日，不是 UTC（→ CORE-041）；本 repo 目前
        沒有 SQL 層級時區轉換的既有寫法（無 `AT TIME ZONE`/`date_trunc` 前例），改成 SQL 只依
        (transaction_type, currency) 排除轉帳後撈出，Python 端用既有 `to_api_tz()` 分桶——
        `PricingService` 呼叫次數跟「不重複的 (日期, 幣別, 收支類型) 組合數」成正比，不是逐筆
        交易（→ BE-089 精神不變，只是分桶點從 SQL 移到 Python）。
        """
        stmt = (
            select(
                Transaction.transaction_date,
                Transaction.transaction_type,
                Account.currency,
                Transaction.amount,
            )
            .join(Account, Account.account_uid == Transaction.account_uid)
            .where(
                Transaction.user_uid == user_uid,
                Transaction.is_deleted.is_(False),
                Transaction.transaction_type != TransactionType.TRANSFER,
                Transaction.transaction_date >= date_from,
                Transaction.transaction_date <= date_to,
            )
        )
        rows = (await self._db.execute(stmt)).all()

        subtotals: dict[tuple[str, str, TransactionType], Decimal] = {}
        for transaction_date, transaction_type, currency, amount in rows:
            local_date = to_api_tz(transaction_date).date().isoformat()
            key = (local_date, currency, transaction_type)
            subtotals[key] = subtotals.get(key, Decimal("0")) + amount

        points: dict[str, dict[str, Decimal]] = {}
        for (local_date, currency, transaction_type), subtotal in subtotals.items():
            converted = await self._to_twd(subtotal, currency)
            point = points.setdefault(local_date, {"income": Decimal("0"), "expense": Decimal("0")})
            if transaction_type == TransactionType.INCOME:
                point["income"] += converted
            else:
                point["expense"] += converted

        return DashboardTrendResponse(
            items=[
                DashboardTrendPoint(
                    date=date_str,
                    income=values["income"].quantize(_CENTS),
                    expense=values["expense"].quantize(_CENTS),
                )
                for date_str, values in sorted(points.items(), key=lambda item: item[0])
            ]
        )
