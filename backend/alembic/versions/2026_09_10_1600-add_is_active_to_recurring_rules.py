"""add_is_active_to_recurring_rules

Revision ID: b2d9f4e7a103
Revises: a1c8e3f5b9d0
Create Date: 2026-09-10 16:00:00+08:00
"""

import sqlalchemy as sa
from alembic import op

revision = "b2d9f4e7a103"
down_revision = "a1c8e3f5b9d0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "recurring_rules",
        sa.Column(
            "is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")
        ),
        if_not_exists=True,
    )


def downgrade() -> None:
    # 新欄位不 DROP（DB-033）；upgrade() 用 if_not_exists 冪等，downgrade 為 no-op，
    # round-trip（DB-050）靠 upgrade() 全程可重跑達成。
    pass
