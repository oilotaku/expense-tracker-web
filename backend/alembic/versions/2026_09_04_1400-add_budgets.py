"""add_budgets

Revision ID: db5265815c0b
Revises: c1bb036a0c2b
Create Date: 2026-09-04 14:00:00+08:00
"""

import sqlalchemy as sa
from alembic import op

revision = "db5265815c0b"
down_revision = "c1bb036a0c2b"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "budgets",
        sa.Column("uid", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column(
            "budget_uid",
            sa.Uuid(),
            nullable=False,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("user_uid", sa.Uuid(), nullable=False),
        sa.Column("category_uid", sa.Uuid(), nullable=False),
        sa.Column("period_type", sa.String(length=10), nullable=False),
        sa.Column("limit_amount", sa.Numeric(18, 2), nullable=False),
        sa.Column("is_deleted", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column("created_by", sa.Uuid(), nullable=True),
        sa.Column("updated_by", sa.Uuid(), nullable=True),
        sa.PrimaryKeyConstraint("uid", name="pk_budgets"),
        sa.UniqueConstraint("budget_uid", name="uq_budgets_budget_uid"),
        sa.ForeignKeyConstraint(["user_uid"], ["users.user_uid"], name="fk_budgets_users"),
        sa.ForeignKeyConstraint(
            ["category_uid"], ["categories.category_uid"], name="fk_budgets_categories"
        ),
        # 注意：naming_convention 的 "ck" 規則會再套一次 `ck_%(table_name)s_%(constraint_name)s`，
        # name 只給短標籤，不可先自行拼出完整前綴（見 2026_09_04_1000-add_financial_assets.py 的教訓）。
        sa.CheckConstraint("period_type IN ('monthly', 'daily')", name="period_type"),
        if_not_exists=True,
    )
    op.create_index("idx_budgets_budget_uid", "budgets", ["budget_uid"], if_not_exists=True)
    op.create_index("idx_budgets_user_uid", "budgets", ["user_uid"], if_not_exists=True)
    op.create_index("idx_budgets_category_uid", "budgets", ["category_uid"], if_not_exists=True)
    op.create_index(
        "uq_budgets_user_uid_category_uid_period_type",
        "budgets",
        ["user_uid", "category_uid", "period_type"],
        unique=True,
        postgresql_where=sa.text("is_deleted = false"),
        if_not_exists=True,
    )


def downgrade() -> None:
    # 建表 migration 的 downgrade 禁 DROP TABLE（DB-033）；索引可 drop，表留空跳過
    # （理由同 2026_09_03_1200-add_users.py）。round-trip（DB-050）不受影響。
    op.drop_index(
        "uq_budgets_user_uid_category_uid_period_type", table_name="budgets", if_exists=True
    )
    op.drop_index("idx_budgets_category_uid", table_name="budgets", if_exists=True)
    op.drop_index("idx_budgets_user_uid", table_name="budgets", if_exists=True)
    op.drop_index("idx_budgets_budget_uid", table_name="budgets", if_exists=True)
