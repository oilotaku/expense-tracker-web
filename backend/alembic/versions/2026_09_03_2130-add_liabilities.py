"""add_liabilities

Revision ID: ea38b7a1a098
Revises: 1046b568e121
Create Date: 2026-09-03 21:30:00+08:00
"""

import sqlalchemy as sa
from alembic import op

revision = "ea38b7a1a098"
down_revision = "1046b568e121"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "liabilities",
        sa.Column("uid", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column(
            "liability_uid",
            sa.Uuid(),
            nullable=False,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("user_uid", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("amount", sa.Numeric(18, 2), nullable=False),
        sa.Column("interest_rate", sa.Numeric(5, 2), nullable=True),
        sa.Column("is_deleted", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column("created_by", sa.Uuid(), nullable=True),
        sa.Column("updated_by", sa.Uuid(), nullable=True),
        sa.PrimaryKeyConstraint("uid", name="pk_liabilities"),
        sa.UniqueConstraint("liability_uid", name="uq_liabilities_liability_uid"),
        sa.ForeignKeyConstraint(["user_uid"], ["users.user_uid"], name="fk_liabilities_users"),
        if_not_exists=True,
    )
    op.create_index(
        "idx_liabilities_liability_uid", "liabilities", ["liability_uid"], if_not_exists=True
    )
    op.create_index(
        "idx_liabilities_user_uid", "liabilities", ["user_uid"], if_not_exists=True
    )


def downgrade() -> None:
    # 建表 migration 的 downgrade 禁 DROP TABLE（DB-033）。upgrade() 全程用 if_not_exists，
    # 表已存在時安全跳過，round-trip（DB-050）不受影響；理由同
    # 2026_09_03_1200-add_users.py。真要撤銷這個 migration 應寫新的前進 migration。
    pass
