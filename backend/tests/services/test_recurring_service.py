"""RecurringService：`anchor_date` + `interval_unit` + `interval_count` 算出下一次執行日
（design-spec §12.3），含月底夾日、閏年夾日與冪等（同規則同月重複觸發不重複產生）。

不打 HTTP，直接用 `db` fixture（真實 PostgreSQL，測試結束 rollback）與各 repository 建立資料
（→ BE-080/081，見 `tests/conftest.py`）。
"""

from calendar import isleap
from datetime import date
from decimal import Decimal
from uuid import UUID

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.recurring_rule import RecurringIntervalUnit, RecurringRule
from app.models.transaction import TransactionType
from app.repositories.account_repository import AccountRepository
from app.repositories.category_repository import CategoryRepository
from app.repositories.recurring_rule_repository import RecurringRuleRepository
from app.repositories.transaction_repository import TransactionRepository
from app.repositories.user_repository import UserRepository
from app.services.recurring_service import RecurringService, clamp_day_of_month, is_due


async def _make_user(db: AsyncSession, email: str) -> UUID:
    user = await UserRepository(db).create_user(email, "dummy_hash", date.today())  # type: ignore[arg-type]
    return user.user_uid


async def _make_account(db: AsyncSession, user_uid: UUID) -> UUID:
    account = await AccountRepository(db).create(
        user_uid=user_uid, name="現金", balance=Decimal("0.00"), created_by=user_uid
    )
    return account.account_uid


async def _make_category(db: AsyncSession, user_uid: UUID) -> UUID:
    # 名稱刻意避開系統預設種子清單（含「訂閱」，→ design-spec §8），避免與使用者建立時
    # 由 trg_users_seed_default_categories 自動種好的同名分類撞 unique constraint。
    category = await CategoryRepository(db).create(user_uid=user_uid, name="測試訂閱服務")
    return category.category_uid


async def _make_rule(
    db: AsyncSession,
    *,
    user_uid: UUID,
    account_uid: UUID,
    category_uid: UUID,
    anchor_date: date | None = None,
    day_of_month: int | None = None,
    interval_unit: RecurringIntervalUnit = RecurringIntervalUnit.MONTH,
    interval_count: int = 1,
    amount: Decimal = Decimal("100.00"),
) -> UUID:
    """`day_of_month` 為既有測試的相容捷徑：換算成 2020-01-<day> 的 `anchor_date`（早於所有測試
    的 `as_of`），`month`/1 的到期判斷只看日部分，故不影響既有案例的既有行為。
    """
    resolved_anchor = anchor_date if anchor_date is not None else date(2020, 1, day_of_month or 1)
    rule = await RecurringRuleRepository(db).create(
        user_uid=user_uid,
        account_uid=account_uid,
        category_uid=category_uid,
        description="週期性支出",
        amount=amount,
        transaction_type=TransactionType.EXPENSE,
        payment_method="信用卡",
        interval_unit=interval_unit,
        interval_count=interval_count,
        anchor_date=resolved_anchor,
        created_by=user_uid,
    )
    return rule.recurring_rule_uid


class TestClampDayOfMonth:
    def test_day_within_month_is_unchanged(self) -> None:
        assert clamp_day_of_month(2026, 1, 15) == 15

    def test_day_31_in_30_day_month_clamps_to_30(self) -> None:
        assert clamp_day_of_month(2026, 4, 31) == 30

    def test_day_31_in_february_clamps_to_28_or_29_by_leap_year(self) -> None:
        # 2026 非閏年 → 28；2028 閏年 → 29（斷言依 calendar.isleap 動態算，不寫死年份判斷）
        for year in (2026, 2027, 2028, 2029, 2000, 2100):
            expected = 29 if isleap(year) else 28
            assert clamp_day_of_month(year, 2, 31) == expected


def _rule(
    *,
    anchor_date: date,
    interval_unit: RecurringIntervalUnit = RecurringIntervalUnit.MONTH,
    interval_count: int = 1,
) -> RecurringRule:
    return RecurringRule(
        anchor_date=anchor_date, interval_unit=interval_unit, interval_count=interval_count
    )


class TestIsDue:
    def test_week_unit_fires_every_n_weeks_on_same_weekday(self) -> None:
        rule = _rule(
            anchor_date=date(2026, 9, 1),  # 週二
            interval_unit=RecurringIntervalUnit.WEEK,
            interval_count=2,
        )
        assert is_due(rule, date(2026, 9, 1)) is True
        # 隔一週（interval_count=2 代表每 2 週）不到期
        assert is_due(rule, date(2026, 9, 8)) is False
        # 隔兩週到期
        assert is_due(rule, date(2026, 9, 15)) is True
        # 同週但非同一星期幾不到期
        assert is_due(rule, date(2026, 9, 16)) is False
        # 錨定日之前一律不到期
        assert is_due(rule, date(2026, 8, 25)) is False

    def test_month_unit_interval_count_greater_than_one(self) -> None:
        rule = _rule(anchor_date=date(2026, 1, 15), interval_count=3)
        assert is_due(rule, date(2026, 1, 15)) is True
        assert is_due(rule, date(2026, 2, 15)) is False
        assert is_due(rule, date(2026, 3, 15)) is False
        assert is_due(rule, date(2026, 4, 15)) is True

    def test_year_unit_fires_on_same_month_day_every_n_years(self) -> None:
        rule = _rule(
            anchor_date=date(2026, 3, 10),
            interval_unit=RecurringIntervalUnit.YEAR,
            interval_count=2,
        )
        assert is_due(rule, date(2026, 3, 10)) is True
        assert is_due(rule, date(2027, 3, 10)) is False
        assert is_due(rule, date(2028, 3, 10)) is True

    @pytest.mark.parametrize("year,expected_day", [(2026, 28), (2028, 29)])
    def test_year_unit_leap_day_anchor_clamps_to_feb_28_on_non_leap_year(
        self, year: int, expected_day: int
    ) -> None:
        # 錨定日 2024/2/29（閏年）；之後每年比對是否夾到 2/28（非閏年）或維持 2/29（閏年）
        rule = _rule(anchor_date=date(2024, 2, 29), interval_unit=RecurringIntervalUnit.YEAR)
        assert is_due(rule, date(year, 2, expected_day)) is True


class TestGenerateDueTransactions:
    async def test_generates_transaction_when_day_matches(self, db: AsyncSession) -> None:
        user_uid = await _make_user(db, "recurring-1@example.com")
        account_uid = await _make_account(db, user_uid)
        category_uid = await _make_category(db, user_uid)
        await _make_rule(
            db,
            user_uid=user_uid,
            account_uid=account_uid,
            category_uid=category_uid,
            day_of_month=15,
            amount=Decimal("299.00"),
        )

        service = RecurringService(db)
        generated = await service.generate_due_transactions(as_of=date(2026, 9, 15))

        assert len(generated) == 1
        assert generated[0].amount == Decimal("299.00")
        assert generated[0].transaction_type == TransactionType.EXPENSE
        assert generated[0].user_uid == user_uid

        transactions, total = await TransactionRepository(db).list_by_user_uid(user_uid)
        assert total == 1
        assert transactions[0].transaction_uid == generated[0].transaction_uid

    async def test_skips_when_day_not_due_yet(self, db: AsyncSession) -> None:
        user_uid = await _make_user(db, "recurring-2@example.com")
        account_uid = await _make_account(db, user_uid)
        category_uid = await _make_category(db, user_uid)
        await _make_rule(
            db,
            user_uid=user_uid,
            account_uid=account_uid,
            category_uid=category_uid,
            day_of_month=20,
        )

        service = RecurringService(db)
        generated = await service.generate_due_transactions(as_of=date(2026, 9, 15))

        assert generated == []
        _, total = await TransactionRepository(db).list_by_user_uid(user_uid)
        assert total == 0

    async def test_triggering_twice_in_same_month_is_idempotent(self, db: AsyncSession) -> None:
        user_uid = await _make_user(db, "recurring-3@example.com")
        account_uid = await _make_account(db, user_uid)
        category_uid = await _make_category(db, user_uid)
        await _make_rule(
            db,
            user_uid=user_uid,
            account_uid=account_uid,
            category_uid=category_uid,
            day_of_month=10,
        )

        service = RecurringService(db)
        first = await service.generate_due_transactions(as_of=date(2026, 9, 10))
        # 模擬服務啟動 / 每日排程重疊：同一天（同一年月）再觸發一次
        second = await service.generate_due_transactions(as_of=date(2026, 9, 10))
        # 同月晚幾天再檢查一次也不該重複產生
        third = await service.generate_due_transactions(as_of=date(2026, 9, 28))

        assert len(first) == 1
        assert second == []
        assert third == []
        _, total = await TransactionRepository(db).list_by_user_uid(user_uid)
        assert total == 1

    async def test_next_month_after_previous_generation_produces_new_transaction(
        self, db: AsyncSession
    ) -> None:
        user_uid = await _make_user(db, "recurring-4@example.com")
        account_uid = await _make_account(db, user_uid)
        category_uid = await _make_category(db, user_uid)
        await _make_rule(
            db,
            user_uid=user_uid,
            account_uid=account_uid,
            category_uid=category_uid,
            day_of_month=5,
        )

        service = RecurringService(db)
        await service.generate_due_transactions(as_of=date(2026, 9, 5))
        second_month = await service.generate_due_transactions(as_of=date(2026, 10, 5))

        assert len(second_month) == 1
        _, total = await TransactionRepository(db).list_by_user_uid(user_uid)
        assert total == 2

    @pytest.mark.parametrize("year,expected_day", [(2026, 28), (2028, 29)])
    async def test_day_31_rule_generates_on_last_day_of_february(
        self, db: AsyncSession, year: int, expected_day: int
    ) -> None:
        user_uid = await _make_user(db, f"recurring-feb-{year}@example.com")
        account_uid = await _make_account(db, user_uid)
        category_uid = await _make_category(db, user_uid)
        await _make_rule(
            db,
            user_uid=user_uid,
            account_uid=account_uid,
            category_uid=category_uid,
            day_of_month=31,
        )

        service = RecurringService(db)
        # 月底前一天（clamp 前）尚未到期
        not_due = await service.generate_due_transactions(as_of=date(year, 2, expected_day - 1))
        assert not_due == []

        generated = await service.generate_due_transactions(as_of=date(year, 2, expected_day))
        assert len(generated) == 1

        _, total = await TransactionRepository(db).list_by_user_uid(user_uid)
        assert total == 1

    async def test_interval_count_greater_than_one_skips_off_cycle_months(
        self, db: AsyncSession
    ) -> None:
        user_uid = await _make_user(db, "recurring-interval@example.com")
        account_uid = await _make_account(db, user_uid)
        category_uid = await _make_category(db, user_uid)
        await _make_rule(
            db,
            user_uid=user_uid,
            account_uid=account_uid,
            category_uid=category_uid,
            anchor_date=date(2026, 1, 15),
            interval_unit=RecurringIntervalUnit.MONTH,
            interval_count=3,
        )

        service = RecurringService(db)
        off_cycle = await service.generate_due_transactions(as_of=date(2026, 2, 15))
        on_cycle = await service.generate_due_transactions(as_of=date(2026, 4, 15))

        assert off_cycle == []
        assert len(on_cycle) == 1
