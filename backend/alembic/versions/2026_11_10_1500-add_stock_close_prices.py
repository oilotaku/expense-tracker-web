"""add_stock_close_prices

Revision ID: b7d2f1e4c5a6
Revises: a6c1e0d2b3f4
Create Date: 2026-11-10 15:00:00+08:00
"""

import sqlalchemy as sa
from alembic import op

revision = "b7d2f1e4c5a6"
down_revision = "a6c1e0d2b3f4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 台股收盤價快照（→ ADR-0007）：不歸屬使用者，(ticker, trade_date) 唯一。
    op.create_table(
        "stock_close_prices",
        sa.Column("uid", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column(
            "stock_close_price_uid",
            sa.Uuid(),
            nullable=False,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("ticker", sa.String(16), nullable=False),
        sa.Column("trade_date", sa.Date(), nullable=False),
        sa.Column("close_price", sa.Numeric(18, 4), nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("fetched_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("is_deleted", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column("created_by", sa.Uuid(), nullable=True),
        sa.Column("updated_by", sa.Uuid(), nullable=True),
        sa.PrimaryKeyConstraint("uid", name="pk_stock_close_prices"),
        sa.UniqueConstraint("stock_close_price_uid", name="uq_stock_close_prices_stock_close_price_uid"),
        sa.CheckConstraint("close_price > 0", name="close_price_positive"),
        if_not_exists=True,
    )
    op.create_index(
        "idx_stock_close_prices_stock_close_price_uid",
        "stock_close_prices",
        ["stock_close_price_uid"],
        if_not_exists=True,
    )
    op.create_index(
        "uq_stock_close_prices_ticker_trade_date",
        "stock_close_prices",
        ["ticker", "trade_date"],
        unique=True,
        postgresql_where=sa.text("is_deleted = false"),
        if_not_exists=True,
    )


def downgrade() -> None:
    # 依 harness 毀滅性操作禁止不 DROP TABLE；只移除索引，資料表留著（同既有 migration 慣例）。
    op.drop_index(
        "uq_stock_close_prices_ticker_trade_date", table_name="stock_close_prices", if_exists=True
    )
    op.drop_index(
        "idx_stock_close_prices_stock_close_price_uid",
        table_name="stock_close_prices",
        if_exists=True,
    )
