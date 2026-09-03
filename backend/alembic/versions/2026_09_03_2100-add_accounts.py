"""add_accounts

Revision ID: 7c3a1f5b9d2e
Revises: 1046b568e121
Create Date: 2026-09-03 21:00:00+08:00
"""

import sqlalchemy as sa
from alembic import op

revision = "7c3a1f5b9d2e"
down_revision = "1046b568e121"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "accounts",
        sa.Column("uid", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column(
            "account_uid",
            sa.Uuid(),
            nullable=False,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("user_uid", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("balance", sa.Numeric(18, 2), nullable=False),
        sa.Column(
            "currency", sa.CHAR(3), nullable=False, server_default=sa.text("'TWD'")
        ),
        sa.Column("is_deleted", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column("created_by", sa.Uuid(), nullable=True),
        sa.Column("updated_by", sa.Uuid(), nullable=True),
        sa.PrimaryKeyConstraint("uid", name="pk_accounts"),
        sa.UniqueConstraint("account_uid", name="uq_accounts_account_uid"),
        sa.ForeignKeyConstraint(["user_uid"], ["users.user_uid"], name="fk_accounts_users"),
        if_not_exists=True,
    )
    op.create_index("idx_accounts_account_uid", "accounts", ["account_uid"], if_not_exists=True)
    op.create_index("idx_accounts_user_uid", "accounts", ["user_uid"], if_not_exists=True)


def downgrade() -> None:
    # 建表 migration 的 downgrade 禁 DROP TABLE（DB-033）；索引可 drop，表留空跳過
    # （理由同 2026_09_03_1200-add_users.py：避免 pk_/uq_ 命名卡住下次 upgrade head 的
    # CREATE TABLE IF NOT EXISTS）。round-trip（DB-050）不受影響。
    op.drop_index("idx_accounts_user_uid", table_name="accounts", if_exists=True)
    op.drop_index("idx_accounts_account_uid", table_name="accounts", if_exists=True)
