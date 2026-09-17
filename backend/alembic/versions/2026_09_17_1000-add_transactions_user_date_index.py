"""add_transactions_user_date_index

Revision ID: f1a2b3c4d5e6
Revises: d4e5c234b00d
Create Date: 2026-09-17 10:00:00+08:00
"""

import sqlalchemy as sa
from alembic import op

revision = "f1a2b3c4d5e6"
down_revision = "d4e5c234b00d"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 交易分頁列表（TransactionRepository.list_by_user_uid）用 user_uid 篩選、依
    # transaction_date DESC, uid DESC 排序分頁，原本只有各自獨立的單欄索引，複合索引不足時
    # 排序/COUNT 需額外掃過整批符合條件的列（→ ADR-0004）。partial WHERE 比照既有慣例
    # （DB-057），因為 list_by_user_uid 永遠帶 is_deleted = false 篩選。
    # CONCURRENTLY 避免上線後（ADR-0004 估算 1000 人×3 年約 300–900 萬列）建索引鎖表擋寫入
    # （→ DB-052）；PG 禁止在交易內跑 CONCURRENTLY，需跳出 env.py 預設的 begin_transaction()。
    with op.get_context().autocommit_block():
        op.create_index(
            "idx_transactions_user_uid_transaction_date",
            "transactions",
            ["user_uid", sa.text("transaction_date DESC"), sa.text("uid DESC")],
            postgresql_where=sa.text("is_deleted = false"),
            postgresql_concurrently=True,
            if_not_exists=True,
        )


def downgrade() -> None:
    op.drop_index(
        "idx_transactions_user_uid_transaction_date",
        table_name="transactions",
        if_exists=True,
    )
