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
from app.schemas.dashboard import DashboardSummaryResponse
from app.services.pricing_service import PricingService

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
