"""add_must_change_password_to_user_credentials

Revision ID: 8dd18af682d7
Revises: b2d9f4e7a103
Create Date: 2026-09-11 18:30:00+08:00
"""

import sqlalchemy as sa
from alembic import op

revision = "8dd18af682d7"
down_revision = "b2d9f4e7a103"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "user_credentials",
        sa.Column(
            "must_change_password", sa.Boolean(), nullable=False, server_default=sa.text("false")
        ),
        if_not_exists=True,
    )


def downgrade() -> None:
    # 新欄位不 DROP（DB-033）；upgrade() 用 if_not_exists 冪等，downgrade 為 no-op，
    # round-trip（DB-050）靠 upgrade() 全程可重跑達成。
    pass
