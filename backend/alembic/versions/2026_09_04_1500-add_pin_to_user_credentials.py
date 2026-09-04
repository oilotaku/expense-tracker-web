"""add_pin_to_user_credentials

Revision ID: a8af1af9f8be
Revises: db5265815c0b
Create Date: 2026-09-04 15:00:00+08:00
"""

import sqlalchemy as sa
from alembic import op

revision = "a8af1af9f8be"
down_revision = "db5265815c0b"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "user_credentials",
        sa.Column("pin_hash", sa.String(255), nullable=True),
        if_not_exists=True,
    )
    op.add_column(
        "user_credentials",
        sa.Column("pin_updated_at", sa.DateTime(timezone=True), nullable=True),
        if_not_exists=True,
    )
    op.add_column(
        "user_credentials",
        sa.Column(
            "pin_failed_attempts", sa.Integer(), nullable=False, server_default=sa.text("0")
        ),
        if_not_exists=True,
    )
    op.add_column(
        "user_credentials",
        sa.Column("pin_locked_until", sa.DateTime(timezone=True), nullable=True),
        if_not_exists=True,
    )


def downgrade() -> None:
    # 四個新欄位皆 nullable 或有 default，既有列不受影響；欄位不 DROP（DB-033），downgrade 為
    # no-op，靠 upgrade() 的 if_not_exists=True 讓重跑冪等（round-trip，DB-050）。
    pass
