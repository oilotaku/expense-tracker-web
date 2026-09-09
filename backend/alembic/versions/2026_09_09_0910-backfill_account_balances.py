"""backfill_account_balances

Revision ID: b7d4f2a9c6e1
Revises: a3c7e1f4d8b2
Create Date: 2026-09-09 09:10:00+08:00
"""

from alembic import op

revision = "b7d4f2a9c6e1"
down_revision = "a3c7e1f4d8b2"
branch_labels = None
depends_on = None

# 既有帳戶的 balance 從未被交易影響過（TransactionRepository 直到本版才寫回餘額），
# 一次性回補「原始餘額 + 該帳戶所有未刪除交易的淨額」。
_NET_BY_ACCOUNT_SQL = """
SELECT account_uid,
       SUM(CASE WHEN transaction_type = 'income' THEN amount ELSE -amount END) AS net
FROM transactions
WHERE is_deleted = false
GROUP BY account_uid
"""

_APPLY_NET_SQL = f"""
UPDATE accounts a
SET balance = a.balance + s.net
FROM ({_NET_BY_ACCOUNT_SQL}) s
WHERE a.account_uid = s.account_uid;
"""

_REVERT_NET_SQL = f"""
UPDATE accounts a
SET balance = a.balance - s.net
FROM ({_NET_BY_ACCOUNT_SQL}) s
WHERE a.account_uid = s.account_uid;
"""


def upgrade() -> None:
    op.execute(_APPLY_NET_SQL)


def downgrade() -> None:
    # 數值型 delta 沒有可比對的 sentinel 值（不同於 add_color_icon 系列的冪等回填），
    # 只能用同一條 net-sum 子查詢反向扣回，才能讓 upgrade → downgrade → upgrade
    # round-trip（DB-050）不重複疊加。
    op.execute(_REVERT_NET_SQL)
