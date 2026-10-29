"""add_user_icons

Revision ID: a6c1e0d2b3f4
Revises: e7f8a9b0c1d2
Create Date: 2026-10-29 16:00:00+08:00
"""

import sqlalchemy as sa
from alembic import op

revision = "a6c1e0d2b3f4"
down_revision = "e7f8a9b0c1d2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 使用者自訂圖示（→ ADR-0006）：只存後端重新編碼後的 PNG，帳戶 / 分類以
    # `icon = 'custom:<user_icon_uid>'` 引用，不加外鍵也不改 accounts / categories schema。
    op.create_table(
        "user_icons",
        sa.Column("uid", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column(
            "user_icon_uid",
            sa.Uuid(),
            nullable=False,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("user_uid", sa.Uuid(), nullable=False),
        sa.Column("image_png", sa.LargeBinary(), nullable=False),
        sa.Column("content_sha256", sa.String(64), nullable=False),
        sa.Column("byte_size", sa.Integer(), nullable=False),
        sa.Column("is_deleted", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column("created_by", sa.Uuid(), nullable=True),
        sa.Column("updated_by", sa.Uuid(), nullable=True),
        sa.PrimaryKeyConstraint("uid", name="pk_user_icons"),
        sa.UniqueConstraint("user_icon_uid", name="uq_user_icons_user_icon_uid"),
        sa.ForeignKeyConstraint(["user_uid"], ["users.user_uid"], name="fk_user_icons_users"),
        sa.CheckConstraint("byte_size > 0", name="byte_size_positive"),
        if_not_exists=True,
    )
    op.create_index(
        "idx_user_icons_user_icon_uid", "user_icons", ["user_icon_uid"], if_not_exists=True
    )
    op.create_index("idx_user_icons_user_uid", "user_icons", ["user_uid"], if_not_exists=True)
    op.create_index(
        "uq_user_icons_user_uid_content_sha256",
        "user_icons",
        ["user_uid", "content_sha256"],
        unique=True,
        postgresql_where=sa.text("is_deleted = false"),
        if_not_exists=True,
    )


def downgrade() -> None:
    # 依 harness 毀滅性操作禁止不 DROP TABLE；只移除索引，資料表留著（同既有 migration 慣例）。
    op.drop_index("uq_user_icons_user_uid_content_sha256", table_name="user_icons", if_exists=True)
    op.drop_index("idx_user_icons_user_uid", table_name="user_icons", if_exists=True)
    op.drop_index("idx_user_icons_user_icon_uid", table_name="user_icons", if_exists=True)
