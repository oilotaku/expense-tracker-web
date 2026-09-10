"""add_liability_uid_to_recurring_rules

Revision ID: a1c8e3f5b9d0
Revises: e4a9b2d7f1c3
Create Date: 2026-09-10 10:00:00+08:00
"""

import sqlalchemy as sa
from alembic import op

revision = "a1c8e3f5b9d0"
down_revision = "e4a9b2d7f1c3"
branch_labels = None
depends_on = None

# ADD CONSTRAINT 無 IF NOT EXISTS 語法（DB-051 冪等要求），用 DO block 吞掉 duplicate_object
# 例外（同 2026_09_04_1600-add_interval_to_recurring_rules.py 慣例）。FK 是既有表後補欄位的第一個
# 案例（既有 migration 的 FK 皆在 create_table 當下建立），一併比照同一套 DO block 寫法。
_ADD_LIABILITY_FK_SQL = """
DO $$ BEGIN
    ALTER TABLE recurring_rules ADD CONSTRAINT fk_recurring_rules_liabilities
        FOREIGN KEY (liability_uid) REFERENCES liabilities (liability_uid) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
"""

_ADD_LIABILITY_EXPENSE_CHECK_SQL = """
DO $$ BEGIN
    ALTER TABLE recurring_rules ADD CONSTRAINT ck_recurring_rules_liability_requires_expense
        CHECK (liability_uid IS NULL OR transaction_type = 'expense');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
"""


def upgrade() -> None:
    op.add_column(
        "recurring_rules",
        sa.Column("liability_uid", sa.Uuid(), nullable=True),
        if_not_exists=True,
    )
    op.execute(_ADD_LIABILITY_FK_SQL)
    op.create_index(
        "idx_recurring_rules_liability_uid",
        "recurring_rules",
        ["liability_uid"],
        if_not_exists=True,
    )
    op.execute(_ADD_LIABILITY_EXPENSE_CHECK_SQL)


def downgrade() -> None:
    # 新欄位/約束不 DROP（DB-033）；upgrade() 全程用 if_not_exists / DO block 冪等，
    # downgrade 為 no-op，round-trip（DB-050）靠 upgrade() 全程可重跑達成。
    pass
