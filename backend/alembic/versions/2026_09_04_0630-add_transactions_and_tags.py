"""add_transactions_and_tags

Revision ID: ae4293a9d201
Revises: b264f3d7d7fd
Create Date: 2026-09-04 06:30:00+08:00
"""

import sqlalchemy as sa
from alembic import op

revision = "ae4293a9d201"
down_revision = "b264f3d7d7fd"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "tags",
        sa.Column("uid", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column(
            "tag_uid",
            sa.Uuid(),
            nullable=False,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("user_uid", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(50), nullable=False),
        sa.Column("is_deleted", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column("created_by", sa.Uuid(), nullable=True),
        sa.Column("updated_by", sa.Uuid(), nullable=True),
        sa.PrimaryKeyConstraint("uid", name="pk_tags"),
        sa.UniqueConstraint("tag_uid", name="uq_tags_tag_uid"),
        sa.ForeignKeyConstraint(["user_uid"], ["users.user_uid"], name="fk_tags_users"),
        if_not_exists=True,
    )
    op.create_index("idx_tags_tag_uid", "tags", ["tag_uid"], if_not_exists=True)
    op.create_index("idx_tags_user_uid", "tags", ["user_uid"], if_not_exists=True)
    op.create_index(
        "uq_tags_user_uid_name",
        "tags",
        ["user_uid", "name"],
        unique=True,
        postgresql_where=sa.text("is_deleted = false"),
        if_not_exists=True,
    )

    op.create_table(
        "transactions",
        sa.Column("uid", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column(
            "transaction_uid",
            sa.Uuid(),
            nullable=False,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("user_uid", sa.Uuid(), nullable=False),
        sa.Column("account_uid", sa.Uuid(), nullable=False),
        sa.Column("category_uid", sa.Uuid(), nullable=False),
        sa.Column("transaction_date", sa.DateTime(timezone=True), nullable=False),
        sa.Column("description", sa.String(255), nullable=False),
        sa.Column("amount", sa.Numeric(18, 2), nullable=False),
        sa.Column("transaction_type", sa.String(length=10), nullable=False),
        sa.Column("payment_method", sa.String(50), nullable=False),
        sa.Column("is_deleted", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column("created_by", sa.Uuid(), nullable=True),
        sa.Column("updated_by", sa.Uuid(), nullable=True),
        sa.PrimaryKeyConstraint("uid", name="pk_transactions"),
        sa.UniqueConstraint("transaction_uid", name="uq_transactions_transaction_uid"),
        sa.ForeignKeyConstraint(["user_uid"], ["users.user_uid"], name="fk_transactions_users"),
        sa.ForeignKeyConstraint(
            ["account_uid"], ["accounts.account_uid"], name="fk_transactions_accounts"
        ),
        sa.ForeignKeyConstraint(
            ["category_uid"], ["categories.category_uid"], name="fk_transactions_categories"
        ),
        # 注意：op.create_table 綁定 env.py 的 target_metadata，"ck" naming convention 會再套一次
        # `ck_%(table_name)s_%(constraint_name)s`，name 只給短標籤，不可先自行拼出完整前綴
        sa.CheckConstraint(
            "transaction_type IN ('income', 'expense')", name="transaction_type"
        ),
        if_not_exists=True,
    )
    op.create_index(
        "idx_transactions_transaction_uid", "transactions", ["transaction_uid"], if_not_exists=True
    )
    op.create_index("idx_transactions_user_uid", "transactions", ["user_uid"], if_not_exists=True)
    op.create_index(
        "idx_transactions_account_uid", "transactions", ["account_uid"], if_not_exists=True
    )
    op.create_index(
        "idx_transactions_category_uid", "transactions", ["category_uid"], if_not_exists=True
    )
    op.create_index(
        "idx_transactions_transaction_date",
        "transactions",
        ["transaction_date"],
        if_not_exists=True,
    )

    op.create_table(
        "transaction_tags",
        sa.Column("transaction_uid", sa.Uuid(), nullable=False),
        sa.Column("tag_uid", sa.Uuid(), nullable=False),
        sa.PrimaryKeyConstraint("transaction_uid", "tag_uid", name="pk_transaction_tags"),
        sa.ForeignKeyConstraint(
            ["transaction_uid"],
            ["transactions.transaction_uid"],
            name="fk_transaction_tags_transactions",
        ),
        sa.ForeignKeyConstraint(
            ["tag_uid"], ["tags.tag_uid"], name="fk_transaction_tags_tags"
        ),
        if_not_exists=True,
    )


def downgrade() -> None:
    # 建表 migration 的 downgrade 禁 DROP TABLE（DB-033）；索引可 drop，表與資料留著跳過
    # （理由同 2026_09_03_1200-add_users.py）。round-trip（DB-050）不受影響。
    op.drop_index(
        "idx_transactions_transaction_date", table_name="transactions", if_exists=True
    )
    op.drop_index("idx_transactions_category_uid", table_name="transactions", if_exists=True)
    op.drop_index("idx_transactions_account_uid", table_name="transactions", if_exists=True)
    op.drop_index("idx_transactions_user_uid", table_name="transactions", if_exists=True)
    op.drop_index(
        "idx_transactions_transaction_uid", table_name="transactions", if_exists=True
    )
    op.drop_index("uq_tags_user_uid_name", table_name="tags", if_exists=True)
    op.drop_index("idx_tags_user_uid", table_name="tags", if_exists=True)
    op.drop_index("idx_tags_tag_uid", table_name="tags", if_exists=True)
