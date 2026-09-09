"""add_principal_amount_to_financial_assets

Revision ID: b5d9f2a6c1e8
Revises: b7d4f2a9c6e1
Create Date: 2026-09-09 15:00:00+08:00
"""

import sqlalchemy as sa
from alembic import op

revision = "b5d9f2a6c1e8"
down_revision = "b7d4f2a9c6e1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "financial_assets",
        sa.Column("principal_amount", sa.Numeric(18, 2), nullable=True),
        if_not_exists=True,
    )
    op.create_check_constraint(
        "ck_financial_assets_principal_amount_positive",
        "financial_assets",
        "principal_amount IS NULL OR principal_amount > 0",
    )


def downgrade() -> None:
    # 新欄位不 DROP COLUMN（DB-033）；constraint 不是使用者資料，drop 即可，欄位留空跳過。
    op.drop_constraint(
        "ck_financial_assets_principal_amount_positive",
        "financial_assets",
        type_="check",
    )
