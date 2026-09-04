"""週期性交易產生：依 `RecurringRule.day_of_month` 於當月產生一筆 `Transaction`。

- 月底夾日：設定日超過當月天數（如 31 號遇 2 月）時夾到當月最後一天（propose 決議，見 task-007）。
- 冪等：`RecurringRule.last_generated_year_month` 記錄最近一次成功產生的年月，同一規則同一月份
  重複觸發（服務啟動 / 每日排程重疊）不會產生兩筆交易。
- 「當月」以 `Settings.API_TZ`（使用者日曆）認定，不是 UTC（→ CORE-041）；跨表寫入（transactions +
  recurring_rules）包在同一個 transaction 邊界內（→ BE-038）。
"""

from calendar import monthrange
from datetime import date, datetime, time

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.recurring_rule import RecurringRule
from app.models.transaction import Transaction
from app.repositories.recurring_rule_repository import RecurringRuleRepository
from app.repositories.transaction_repository import TransactionRepository
from app.utils.datetime import API_TZ, now_utc, to_api_tz, to_utc


def clamp_day_of_month(year: int, month: int, day_of_month: int) -> int:
    """設定日超過當月天數時夾到當月最後一天（propose 決議）；否則原樣回傳。"""
    last_day_of_month = monthrange(year, month)[1]
    return min(day_of_month, last_day_of_month)


class RecurringService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.repo = RecurringRuleRepository(db)
        self.transaction_repo = TransactionRepository(db)

    async def generate_due_transactions(self, *, as_of: date | None = None) -> list[Transaction]:
        """對所有到期規則各產生一筆當月交易；本月已產生過的規則跳過（冪等）。

        `as_of` 供測試指定「今天」；未指定時取 `now_utc()` 轉 `API_TZ` 的日曆日期。
        """
        target = as_of or to_api_tz(now_utc()).date()
        year_month = _year_month(target)
        candidates = await self.repo.list_pending_for_year_month(year_month)

        generated: list[Transaction] = []
        for rule in candidates:
            due_day = clamp_day_of_month(target.year, target.month, rule.day_of_month)
            if due_day != target.day:
                continue
            generated.append(await self._generate_for_rule(rule, target, year_month))
        return generated

    async def _generate_for_rule(
        self, rule: RecurringRule, target: date, year_month: str
    ) -> Transaction:
        # 交易日期＝規則到期日在 API_TZ 的當地午夜，轉存 UTC（內部層一律 UTC，→ CORE-043/044）
        transaction_date = to_utc(datetime.combine(target, time.min, tzinfo=API_TZ))

        atomic = self.db.begin_nested() if self.db.in_transaction() else self.db.begin()
        async with atomic:
            transaction, _tags = await self.transaction_repo.create(
                user_uid=rule.user_uid,
                account_uid=rule.account_uid,
                category_uid=rule.category_uid,
                transaction_date=transaction_date,
                description=rule.description,
                amount=rule.amount,
                transaction_type=rule.transaction_type,
                payment_method=rule.payment_method,
                tag_names=[],
                created_by=rule.user_uid,
            )
            rule.last_generated_year_month = year_month
            await self.db.flush()
        return transaction


def _year_month(d: date) -> str:
    return f"{d.year:04d}-{d.month:02d}"


__all__ = ["RecurringService", "clamp_day_of_month"]
