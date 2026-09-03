"""add_users

Revision ID: 1046b568e121
Revises:
Create Date: 2026-09-03 12:00:00+08:00
"""

import sqlalchemy as sa
from alembic import op

revision = "1046b568e121"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("uid", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column(
            "user_uid",
            sa.Uuid(),
            nullable=False,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("email", sa.String(255), nullable=False, comment="PII: email"),
        sa.Column("is_deleted", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column("created_by", sa.Uuid(), nullable=True),
        sa.Column("updated_by", sa.Uuid(), nullable=True),
        sa.PrimaryKeyConstraint("uid", name="pk_users"),
        sa.UniqueConstraint("user_uid", name="uq_users_user_uid"),
        sa.UniqueConstraint("email", name="uq_users_email"),
        if_not_exists=True,
    )
    op.create_index("idx_users_user_uid", "users", ["user_uid"], if_not_exists=True)

    op.create_table(
        "user_credentials",
        sa.Column("uid", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column(
            "user_credential_uid",
            sa.Uuid(),
            nullable=False,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("user_uid", sa.Uuid(), nullable=False),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column("password_updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("is_deleted", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column("created_by", sa.Uuid(), nullable=True),
        sa.Column("updated_by", sa.Uuid(), nullable=True),
        sa.PrimaryKeyConstraint("uid", name="pk_user_credentials"),
        sa.UniqueConstraint(
            "user_credential_uid", name="uq_user_credentials_user_credential_uid"
        ),
        sa.UniqueConstraint("user_uid", name="uq_user_credentials_user_uid"),
        sa.ForeignKeyConstraint(
            ["user_uid"], ["users.user_uid"], name="fk_user_credentials_users"
        ),
        if_not_exists=True,
    )
    op.create_index(
        "idx_user_credentials_user_credential_uid",
        "user_credentials",
        ["user_credential_uid"],
        if_not_exists=True,
    )
    op.create_index(
        "idx_user_credentials_user_uid", "user_credentials", ["user_uid"], if_not_exists=True
    )


def downgrade() -> None:
    # 建表 migration 的 downgrade 禁 DROP TABLE（DB-033）。rename 保留資料的做法會讓
    # 兩張表底下由約束自動產生的索引（pk_* / uq_*）留在 schema 全域命名空間中卡住，
    # 導致下一次 upgrade head 的 CREATE TABLE IF NOT EXISTS 撞名失敗；因此依 DB-036
    # 「改為 rename 或留空並註明原因」選擇留空——upgrade() 全程用 if_not_exists，
    # 表已存在時安全跳過，round-trip（DB-050）不受影響。真要撤銷這個 migration
    # 應寫新的前進 migration。
    pass
