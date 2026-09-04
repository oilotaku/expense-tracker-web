"""add_recurring_rules

Revision ID: c1bb036a0c2b
Revises: cfe7ee3553a3
Create Date: 2026-09-04 13:00:00+08:00
"""

import sqlalchemy as sa
from alembic import op

revision = "c1bb036a0c2b"
down_revision = "cfe7ee3553a3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "recurring_rules",
        sa.Column("uid", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column(
            "recurring_rule_uid",
            sa.Uuid(),
            nullable=False,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("user_uid", sa.Uuid(), nullable=False),
        sa.Column("account_uid", sa.Uuid(), nullable=False),
        sa.Column("category_uid", sa.Uuid(), nullable=False),
        sa.Column("description", sa.String(255), nullable=False),
        sa.Column("amount", sa.Numeric(18, 2), nullable=False),
        sa.Column("transaction_type", sa.String(length=10), nullable=False),
        sa.Column("payment_method", sa.String(50), nullable=False),
        sa.Column("day_of_month", sa.Integer(), nullable=False),
        sa.Column("last_generated_year_month", sa.String(7), nullable=True),
        sa.Column("is_deleted", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column("created_by", sa.Uuid(), nullable=True),
        sa.Column("updated_by", sa.Uuid(), nullable=True),
        sa.PrimaryKeyConstraint("uid", name="pk_recurring_rules"),
        sa.UniqueConstraint("recurring_rule_uid", name="uq_recurring_rules_recurring_rule_uid"),
        sa.ForeignKeyConstraint(["user_uid"], ["users.user_uid"], name="fk_recurring_rules_users"),
        sa.ForeignKeyConstraint(
            ["account_uid"], ["accounts.account_uid"], name="fk_recurring_rules_accounts"
        ),
        sa.ForeignKeyConstraint(
            ["category_uid"], ["categories.category_uid"], name="fk_recurring_rules_categories"
        ),
        # 注意：op.create_table 綁定 env.py 的 target_metadata，"ck" naming convention 會再套一次
        # `ck_%(table_name)s_%(constraint_name)s`，name 只給短標籤，不可先自行拼出完整前綴
        # （見 docs/Tasks/v1.0.0/fixed.md §5）
        sa.CheckConstraint("transaction_type IN ('income', 'expense')", name="transaction_type"),
        sa.CheckConstraint("day_of_month BETWEEN 1 AND 31", name="day_of_month_range"),
        if_not_exists=True,
    )
    op.create_index(
        "idx_recurring_rules_recurring_rule_uid",
        "recurring_rules",
        ["recurring_rule_uid"],
        if_not_exists=True,
    )
    op.create_index(
        "idx_recurring_rules_user_uid", "recurring_rules", ["user_uid"], if_not_exists=True
    )
    op.create_index(
        "idx_recurring_rules_account_uid", "recurring_rules", ["account_uid"], if_not_exists=True
    )
    op.create_index(
        "idx_recurring_rules_category_uid", "recurring_rules", ["category_uid"], if_not_exists=True
    )


def downgrade() -> None:
    # 建表 migration 的 downgrade 禁 DROP TABLE（DB-033）；索引可 drop，表與資料留著跳過
    # （理由同 2026_09_04_0630-add_transactions_and_tags.py）。round-trip（DB-050）不受影響。
    op.drop_index("idx_recurring_rules_category_uid", table_name="recurring_rules", if_exists=True)
    op.drop_index("idx_recurring_rules_account_uid", table_name="recurring_rules", if_exists=True)
    op.drop_index("idx_recurring_rules_user_uid", table_name="recurring_rules", if_exists=True)
    op.drop_index(
        "idx_recurring_rules_recurring_rule_uid", table_name="recurring_rules", if_exists=True
    )
