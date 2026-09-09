"""add_accounts_currency_check

Revision ID: e4a9b2d7f1c3
Revises: d3f8a1c6e9b2
Create Date: 2026-09-09 20:00:00+08:00
"""

from alembic import op

revision = "e4a9b2d7f1c3"
down_revision = "d3f8a1c6e9b2"
branch_labels = None
depends_on = None

# 固定選單同 backend/app/utils/currency.py SupportedCurrency——兩處手動保持同步（enum 本身無法
# 在 migration 內 import model，同 us_stock/transfer migration 既有的原生 SQL 字面值寫法）。
_ADD_CURRENCY_CHECK = """
ALTER TABLE accounts ADD CONSTRAINT ck_accounts_currency
    CHECK (currency IN ('TWD', 'USD', 'JPY', 'EUR', 'CNY', 'HKD', 'GBP', 'AUD', 'KRW', 'THB'));
"""
_DROP_CURRENCY_CHECK = "ALTER TABLE accounts DROP CONSTRAINT IF EXISTS ck_accounts_currency;"


def upgrade() -> None:
    op.execute(_DROP_CURRENCY_CHECK)
    op.execute(_ADD_CURRENCY_CHECK)


def downgrade() -> None:
    # DB-033：只移除 constraint，不動既有資料（本版之前所有帳戶本來就恆為 'TWD'，即使有非 TWD
    # 資料，降級後 currency 欄位本身依然存在、只是不再被 CHECK 約束，不會遺失/損毀資料）。
    op.execute(_DROP_CURRENCY_CHECK)
