"""add_fund_asset_type

Revision ID: e7f8a9b0c1d2
Revises: f1a2b3c4d5e6
Create Date: 2026-10-15 12:00:00+08:00
"""

from alembic import op

revision = "e7f8a9b0c1d2"
down_revision = "f1a2b3c4d5e6"
branch_labels = None
depends_on = None

# Postgres 沒有 ALTER CHECK，只能 DROP + ADD CONSTRAINT（→ 沿用 add_us_stock_asset_type 的寫法）。
_DROP_ASSET_TYPE_CHECK = "ALTER TABLE financial_assets DROP CONSTRAINT ck_financial_assets_asset_type;"
_ADD_ASSET_TYPE_CHECK = """
ALTER TABLE financial_assets ADD CONSTRAINT ck_financial_assets_asset_type
    CHECK (asset_type IN ('stock', 'us_stock', 'metal', 'fund'));
"""
_DROP_INPUT_UNIT_CHECK = "ALTER TABLE financial_assets DROP CONSTRAINT ck_financial_assets_input_unit;"
_ADD_INPUT_UNIT_CHECK = """
ALTER TABLE financial_assets ADD CONSTRAINT ck_financial_assets_input_unit
    CHECK (
        (asset_type = 'stock' AND input_unit IN ('張', '股')) OR
        (asset_type = 'us_stock' AND input_unit = '股') OR
        (asset_type = 'metal' AND input_unit IN ('兩', '錢')) OR
        (asset_type = 'fund' AND input_unit = '單位')
    );
"""

# downgrade 用回舊版本的 constraint 定義（此時資料庫裡不應存在任何 fund 列，否則
# downgrade 會因違反舊 constraint 而失敗——這是刻意行為，避免悄悄砍掉不相容的資料）。
_DOWNGRADE_ADD_ASSET_TYPE_CHECK = """
ALTER TABLE financial_assets ADD CONSTRAINT ck_financial_assets_asset_type
    CHECK (asset_type IN ('stock', 'us_stock', 'metal'));
"""
_DOWNGRADE_ADD_INPUT_UNIT_CHECK = """
ALTER TABLE financial_assets ADD CONSTRAINT ck_financial_assets_input_unit
    CHECK (
        (asset_type = 'stock' AND input_unit IN ('張', '股')) OR
        (asset_type = 'us_stock' AND input_unit = '股') OR
        (asset_type = 'metal' AND input_unit IN ('兩', '錢'))
    );
"""


def upgrade() -> None:
    op.execute(_DROP_ASSET_TYPE_CHECK)
    op.execute(_ADD_ASSET_TYPE_CHECK)
    op.execute(_DROP_INPUT_UNIT_CHECK)
    op.execute(_ADD_INPUT_UNIT_CHECK)


def downgrade() -> None:
    op.execute(_DROP_INPUT_UNIT_CHECK)
    op.execute(_DOWNGRADE_ADD_INPUT_UNIT_CHECK)
    op.execute(_DROP_ASSET_TYPE_CHECK)
    op.execute(_DOWNGRADE_ADD_ASSET_TYPE_CHECK)
