"""週期性交易產生：依 `RecurringRule.anchor_date` + `interval_unit` + `interval_count` 算出下一次
執行日，到期時產生一筆 `Transaction`（design-spec §12.3）。

- `month` 單位：月底夾日規則不變——設定日超過當月天數（如 31 號遇 2 月）時夾到當月最後一天
  （propose 決議，見 task-007），「設定日」改由 `anchor_date` 的日部分提供，不再讀舊欄位
  `day_of_month`。
- `year` 單位：`anchor_date` 為 2/29 時，目標年非閏年比照同一條夾日規則夾到 2/28。
- 冪等：`RecurringRule.last_generated_year_month` 記錄最近一次成功產生的年月，同一規則同一月份
  重複觸發（服務啟動 / 每日排程重疊）不會產生兩筆交易；此為月粒度冪等，`week` 單位若同月內到期
  兩次，第二次會被目前粒度跳過——本版沿用既有 `month` 粒度設計，未來如需週內多次觸發需另拆改用
  `last_generated_date`。
- 「當月」以 `Settings.API_TZ`（使用者日曆）認定，不是 UTC（→ CORE-041）；跨表寫入（transactions +
  recurring_rules）包在同一個 transaction 邊界內（→ BE-038）。
"""

from calendar import isleap, monthrange
from datetime import date, datetime, time

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.recurring_rule import RecurringIntervalUnit, RecurringRule
from app.models.transaction import Transaction
from app.repositories.recurring_rule_repository import RecurringRuleRepository
from app.repositories.transaction_repository import TransactionRepository
from app.utils.datetime import API_TZ, now_utc, to_api_tz, to_utc


def clamp_day_of_month(year: int, month: int, day_of_month: int) -> int:
    """設定日超過當月天數時夾到當月最後一天（propose 決議）；否則原樣回傳。"""
    last_day_of_month = monthrange(year, month)[1]
    return min(day_of_month, last_day_of_month)


def _months_between(earlier: date, later: date) -> int:
    return (later.year - earlier.year) * 12 + (later.month - earlier.month)


def is_due(rule: RecurringRule, target: date) -> bool:
    """`target` 是否為 `rule` 依 `anchor_date` + `interval_unit` + `interval_count` 算出的到期日。

    （設計見 design-spec §12.3；三種單位分別對應每週 / 每月 / 每年循環）
    """
    anchor = rule.anchor_date
    if target < anchor:
        return False

    if rule.interval_unit == RecurringIntervalUnit.WEEK:
        days_since = (target - anchor).days
        if days_since % 7 != 0:
            return False
        return (days_since // 7) % rule.interval_count == 0

    if rule.interval_unit == RecurringIntervalUnit.MONTH:
        months_since = _months_between(anchor, target)
        if months_since % rule.interval_count != 0:
            return False
        due_day = clamp_day_of_month(target.year, target.month, anchor.day)
        return target.day == due_day

    if rule.interval_unit == RecurringIntervalUnit.YEAR:
        years_since = target.year - anchor.year
        if years_since % rule.interval_count != 0:
            return False
        due_day = anchor.day
        # 2/29 錨定日遇目標年非閏年時，比照 month 單位的夾日規則夾到 2/28
        if anchor.month == 2 and anchor.day == 29 and not isleap(target.year):
            due_day = 28
        return target.month == anchor.month and target.day == due_day

    return False


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
            if not is_due(rule, target):
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


__all__ = ["RecurringService", "clamp_day_of_month", "is_due"]
