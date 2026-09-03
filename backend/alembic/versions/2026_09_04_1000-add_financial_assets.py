"""add_financial_assets

Revision ID: beea39a9b5ca
Revises: b264f3d7d7fd
Create Date: 2026-09-04 10:00:00+08:00
"""

import sqlalchemy as sa
from alembic import op

revision = "beea39a9b5ca"
down_revision = "b264f3d7d7fd"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "financial_assets",
        sa.Column("uid", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column(
            "financial_asset_uid",
            sa.Uuid(),
            nullable=False,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("user_uid", sa.Uuid(), nullable=False),
        sa.Column("asset_type", sa.String(10), nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("input_quantity", sa.Numeric(18, 4), nullable=False),
        sa.Column("input_unit", sa.String(10), nullable=False),
        sa.Column("base_quantity", sa.Numeric(18, 4), nullable=False),
        sa.Column("is_deleted", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column("created_by", sa.Uuid(), nullable=True),
        sa.Column("updated_by", sa.Uuid(), nullable=True),
        sa.PrimaryKeyConstraint("uid", name="pk_financial_assets"),
        sa.UniqueConstraint("financial_asset_uid", name="uq_financial_assets_financial_asset_uid"),
        sa.ForeignKeyConstraint(["user_uid"], ["users.user_uid"], name="fk_financial_assets_users"),
        sa.CheckConstraint(
            "asset_type IN ('stock', 'metal')", name="ck_financial_assets_asset_type"
        ),
        sa.CheckConstraint(
            "(asset_type = 'stock' AND input_unit IN ('張', '股')) OR "
            "(asset_type = 'metal' AND input_unit IN ('兩', '錢'))",
            name="ck_financial_assets_input_unit",
        ),
        sa.CheckConstraint(
            "input_quantity > 0", name="ck_financial_assets_input_quantity_positive"
        ),
        sa.CheckConstraint(
            "base_quantity > 0", name="ck_financial_assets_base_quantity_positive"
        ),
        if_not_exists=True,
    )
    op.create_index(
        "idx_financial_assets_financial_asset_uid",
        "financial_assets",
        ["financial_asset_uid"],
        if_not_exists=True,
    )
    op.create_index(
        "idx_financial_assets_user_uid", "financial_assets", ["user_uid"], if_not_exists=True
    )


def downgrade() -> None:
    # 建表 migration 的 downgrade 禁 DROP TABLE（DB-033）；索引可 drop，表留空跳過
    # （理由同 2026_09_03_2100-add_accounts.py）。round-trip（DB-050）不受影響。
    op.drop_index("idx_financial_assets_user_uid", table_name="financial_assets", if_exists=True)
    op.drop_index(
        "idx_financial_assets_financial_asset_uid", table_name="financial_assets", if_exists=True
    )
