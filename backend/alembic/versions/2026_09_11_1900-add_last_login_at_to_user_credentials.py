"""add_last_login_at_to_user_credentials

Revision ID: d4e5c234b00d
Revises: 8dd18af682d7
Create Date: 2026-09-11 19:00:00+08:00
"""

import sqlalchemy as sa
from alembic import op

revision = "d4e5c234b00d"
down_revision = "8dd18af682d7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "user_credentials",
        sa.Column("last_login_at", sa.DateTime(timezone=True), nullable=True),
        if_not_exists=True,
    )


def downgrade() -> None:
    # 新欄位不 DROP（DB-033）；upgrade() 用 if_not_exists 冪等，downgrade 為 no-op，
    # round-trip（DB-050）靠 upgrade() 全程可重跑達成。
    pass
