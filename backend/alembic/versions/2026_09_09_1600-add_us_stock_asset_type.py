"""add_us_stock_asset_type

Revision ID: c2e7f4a9d1b6
Revises: b5d9f2a6c1e8
Create Date: 2026-09-09 16:00:00+08:00
"""

import sqlalchemy as sa
from alembic import op

revision = "c2e7f4a9d1b6"
down_revision = "b5d9f2a6c1e8"
branch_labels = None
depends_on = None

# Postgres 沒有 ALTER CHECK，只能 DROP + ADD CONSTRAINT（→ 沿用既有 model CheckConstraint 定義）。
_DROP_ASSET_TYPE_CHECK = "ALTER TABLE financial_assets DROP CONSTRAINT ck_financial_assets_asset_type;"
_ADD_ASSET_TYPE_CHECK = """
ALTER TABLE financial_assets ADD CONSTRAINT ck_financial_assets_asset_type
    CHECK (asset_type IN ('stock', 'us_stock', 'metal'));
"""
_DROP_INPUT_UNIT_CHECK = "ALTER TABLE financial_assets DROP CONSTRAINT ck_financial_assets_input_unit;"
_ADD_INPUT_UNIT_CHECK = """
ALTER TABLE financial_assets ADD CONSTRAINT ck_financial_assets_input_unit
    CHECK (
        (asset_type = 'stock' AND input_unit IN ('張', '股')) OR
        (asset_type = 'us_stock' AND input_unit = '股') OR
        (asset_type = 'metal' AND input_unit IN ('兩', '錢'))
    );
"""

# downgrade 用回舊版本的 constraint 定義（此時資料庫裡不應存在任何 us_stock 列，否則
# downgrade 會因違反舊 constraint 而失敗——這是刻意行為，避免悄悄砍掉不相容的資料）。
_DOWNGRADE_ADD_ASSET_TYPE_CHECK = """
ALTER TABLE financial_assets ADD CONSTRAINT ck_financial_assets_asset_type
    CHECK (asset_type IN ('stock', 'metal'));
"""
_DOWNGRADE_ADD_INPUT_UNIT_CHECK = """
ALTER TABLE financial_assets ADD CONSTRAINT ck_financial_assets_input_unit
    CHECK (
        (asset_type = 'stock' AND input_unit IN ('張', '股')) OR
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
