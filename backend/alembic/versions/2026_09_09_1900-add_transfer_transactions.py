"""add_transfer_transactions

Revision ID: d3f8a1c6e9b2
Revises: c2e7f4a9d1b6
Create Date: 2026-09-09 19:00:00+08:00
"""

from alembic import op

revision = "d3f8a1c6e9b2"
down_revision = "c2e7f4a9d1b6"
branch_labels = None
depends_on = None

# Postgres 沒有 ALTER CHECK，只能 DROP + ADD CONSTRAINT（→ 沿用 2026_09_09_1600 us_stock
# migration 既有寫法）。
_DROP_TYPE_CHECK = "ALTER TABLE transactions DROP CONSTRAINT ck_transactions_transaction_type;"
_ADD_TYPE_CHECK = """
ALTER TABLE transactions ADD CONSTRAINT ck_transactions_transaction_type
    CHECK (transaction_type IN ('income', 'expense', 'transfer'));
"""
_DOWNGRADE_ADD_TYPE_CHECK = """
ALTER TABLE transactions ADD CONSTRAINT ck_transactions_transaction_type
    CHECK (transaction_type IN ('income', 'expense'));
"""

_ADD_SHAPE_CHECK = """
ALTER TABLE transactions ADD CONSTRAINT ck_transactions_transfer_shape
    CHECK (
        (transaction_type <> 'transfer' AND category_uid IS NOT NULL
                                         AND transfer_group_uid IS NULL AND transfer_direction IS NULL)
        OR
        (transaction_type = 'transfer' AND category_uid IS NULL
                                        AND transfer_group_uid IS NOT NULL AND transfer_direction IS NOT NULL)
    );
"""
_DROP_SHAPE_CHECK = "ALTER TABLE transactions DROP CONSTRAINT ck_transactions_transfer_shape;"

# 欄位/索引用 IF NOT EXISTS / IF EXISTS：downgrade 依 DB-033 刻意不 DROP COLUMN（見下方），
# 所以 downgrade → upgrade 再跑一次時欄位/索引可能已經存在，用 IF NOT EXISTS 保持 upgrade
# 冪等，不會因為「已存在」而炸掉（→ DB-050 migration round-trip 安全）。
_ADD_GROUP_UID_COLUMN = """
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS transfer_group_uid UUID;
"""
_ADD_DIRECTION_COLUMN = """
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS transfer_direction VARCHAR(10);
"""
_CREATE_GROUP_UID_INDEX = """
CREATE INDEX IF NOT EXISTS idx_transactions_transfer_group_uid
    ON transactions (transfer_group_uid);
"""
_DROP_GROUP_UID_INDEX = "DROP INDEX IF EXISTS idx_transactions_transfer_group_uid;"


def upgrade() -> None:
    # 轉帳沒有分類概念，category_uid 對轉帳列必須是 NULL（→ ck_transactions_transfer_shape）。
    op.alter_column("transactions", "category_uid", nullable=True)

    op.execute(_ADD_GROUP_UID_COLUMN)
    op.execute(_ADD_DIRECTION_COLUMN)
    op.execute(_CREATE_GROUP_UID_INDEX)

    op.execute(_DROP_TYPE_CHECK)
    op.execute(_ADD_TYPE_CHECK)
    op.execute(_ADD_SHAPE_CHECK)


def downgrade() -> None:
    # 還原 constraint 與 category_uid NOT NULL：跟 2026_09_09_1600 us_stock migration 同一套
    # 刻意行為——資料庫裡若已有轉帳資料（category_uid IS NULL 或 transaction_type='transfer'
    # 的列），還原會因違反舊 constraint 而失敗，不悄悄砍資料。
    #
    # DB-033：新增的 transfer_group_uid / transfer_direction 欄位不在 downgrade 內 DROP COLUMN，
    # 保留欄位本身，只還原 constraint 與索引。
    op.execute(_DROP_SHAPE_CHECK)
    op.execute(_DROP_TYPE_CHECK)
    op.execute(_DOWNGRADE_ADD_TYPE_CHECK)

    op.execute(_DROP_GROUP_UID_INDEX)

    op.alter_column("transactions", "category_uid", nullable=False)
