"""add_interval_to_recurring_rules

Revision ID: c7e1a4d90b3f
Revises: a8af1af9f8be
Create Date: 2026-09-04 16:00:00+08:00
"""

import sqlalchemy as sa
from alembic import op

revision = "c7e1a4d90b3f"
down_revision = "a8af1af9f8be"
branch_labels = None
depends_on = None

# 既有規則回填 anchor_date：created_at 所在月份 + day_of_month（超過當月天數夾到月底，與既有
# clamp_day_of_month 語意一致）；interval_unit='month'、interval_count=1（欄位 server_default 已
# 涵蓋）使既有規則的下一次執行日計算 100% 維持原行為（→ 服務層只看 anchor_date 的日部分）。
_BACKFILL_ANCHOR_DATE_SQL = """
UPDATE recurring_rules
SET anchor_date = LEAST(
    (date_trunc('month', created_at)::date + (COALESCE(day_of_month, 1) - 1)),
    (date_trunc('month', created_at) + interval '1 month' - interval '1 day')::date
)
WHERE anchor_date IS NULL;
"""

# ADD CONSTRAINT 無 IF NOT EXISTS 語法（DB-051 冪等要求），用 DO block 吞掉 duplicate_object
# 例外，讓 downgrade()（no-op，欄位/約束不 DROP → DB-033）之後重跑 upgrade() 仍安全。
_ADD_INTERVAL_UNIT_CHECK_SQL = """
DO $$ BEGIN
    ALTER TABLE recurring_rules ADD CONSTRAINT ck_recurring_rules_recurring_interval_unit
        CHECK (interval_unit IN ('week', 'month', 'year'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
"""

_ADD_INTERVAL_COUNT_CHECK_SQL = """
DO $$ BEGIN
    ALTER TABLE recurring_rules ADD CONSTRAINT ck_recurring_rules_interval_count_range
        CHECK (interval_count BETWEEN 1 AND 99);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
"""


def upgrade() -> None:
    op.add_column(
        "recurring_rules",
        sa.Column("interval_unit", sa.String(length=10), nullable=False, server_default="month"),
        if_not_exists=True,
    )
    op.execute(_ADD_INTERVAL_UNIT_CHECK_SQL)
    op.add_column(
        "recurring_rules",
        sa.Column("interval_count", sa.Integer(), nullable=False, server_default="1"),
        if_not_exists=True,
    )
    op.execute(_ADD_INTERVAL_COUNT_CHECK_SQL)
    op.add_column(
        "recurring_rules",
        sa.Column("anchor_date", sa.Date(), nullable=True),
        if_not_exists=True,
    )
    op.execute(_BACKFILL_ANCHOR_DATE_SQL)
    op.alter_column("recurring_rules", "anchor_date", nullable=False)
    op.alter_column("recurring_rules", "day_of_month", nullable=True)


def downgrade() -> None:
    # 新欄位不 DROP（DB-033）；nullable 收緊/放寬與 CHECK 新增皆冪等（DO block / 條件式），
    # downgrade 為 no-op，round-trip（DB-050）靠 upgrade() 全程可重跑達成。
    pass
