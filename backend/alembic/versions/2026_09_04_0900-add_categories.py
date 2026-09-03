"""add_categories

Revision ID: b264f3d7d7fd
Revises: 22ea81aa123d
Create Date: 2026-09-04 09:00:00+08:00
"""

import sqlalchemy as sa
from alembic import op

revision = "b264f3d7d7fd"
down_revision = "22ea81aa123d"
branch_labels = None
depends_on = None

# 系統預設種子清單（新使用者註冊時自動套用，見下方 trigger）；固定但使用者可自行增刪。
_DEFAULT_CATEGORY_NAMES = ["餐飲", "交通", "娛樂", "購物", "醫療", "居住", "薪資", "其他"]

_SEED_FUNCTION_SQL = """
CREATE OR REPLACE FUNCTION seed_default_categories() RETURNS trigger AS $$
BEGIN
    INSERT INTO categories (user_uid, name)
    SELECT NEW.user_uid, cat_name
    FROM unnest(ARRAY[{names}]) AS cat_name;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
""".format(names=", ".join(f"'{n}'" for n in _DEFAULT_CATEGORY_NAMES))

_DROP_SEED_TRIGGER_SQL = "DROP TRIGGER IF EXISTS trg_users_seed_default_categories ON users;"

# asyncpg 的 prepared statement 一次只接受一條 SQL 敘述，DROP 與 CREATE 須分兩次 op.execute()。
_CREATE_SEED_TRIGGER_SQL = """
CREATE TRIGGER trg_users_seed_default_categories
AFTER INSERT ON users
FOR EACH ROW
EXECUTE FUNCTION seed_default_categories();
"""

# 冪等：只補「目前一個分類都沒有」的既有使用者（migration 上線前就存在的帳號），
# 之後的新使用者一律由上面的 trigger 即時套用（DB-051）。
_BACKFILL_EXISTING_USERS_SQL = """
INSERT INTO categories (user_uid, name)
SELECT u.user_uid, cat_name
FROM users u
CROSS JOIN unnest(ARRAY[{names}]) AS cat_name
WHERE NOT EXISTS (
    SELECT 1 FROM categories c WHERE c.user_uid = u.user_uid
);
""".format(names=", ".join(f"'{n}'" for n in _DEFAULT_CATEGORY_NAMES))


def upgrade() -> None:
    op.create_table(
        "categories",
        sa.Column("uid", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column(
            "category_uid",
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
        sa.PrimaryKeyConstraint("uid", name="pk_categories"),
        sa.UniqueConstraint("category_uid", name="uq_categories_category_uid"),
        sa.ForeignKeyConstraint(["user_uid"], ["users.user_uid"], name="fk_categories_users"),
        if_not_exists=True,
    )
    op.create_index(
        "idx_categories_category_uid", "categories", ["category_uid"], if_not_exists=True
    )
    op.create_index("idx_categories_user_uid", "categories", ["user_uid"], if_not_exists=True)
    op.create_index(
        "uq_categories_user_uid_name",
        "categories",
        ["user_uid", "name"],
        unique=True,
        postgresql_where=sa.text("is_deleted = false"),
        if_not_exists=True,
    )

    # 新使用者註冊即自動套用系統預設分類；DROP TRIGGER IF EXISTS + CREATE 讓整段冪等可重跑。
    op.execute(_SEED_FUNCTION_SQL)
    op.execute(_DROP_SEED_TRIGGER_SQL)
    op.execute(_CREATE_SEED_TRIGGER_SQL)
    op.execute(_BACKFILL_EXISTING_USERS_SQL)


def downgrade() -> None:
    # 建表 migration 的 downgrade 禁 DROP TABLE（DB-033）；表與已種好的分類資料留著跳過
    # （理由同 2026_09_03_1200-add_users.py）。trigger / function 不是使用者資料、也不在
    # DB-033 禁列（DROP DATABASE/SCHEMA/TABLE/COLUMN/TRUNCATE）之內，drop 後 upgrade()
    # 會重新建立，round-trip（DB-050）不受影響。
    op.execute("DROP TRIGGER IF EXISTS trg_users_seed_default_categories ON users;")
    op.execute("DROP FUNCTION IF EXISTS seed_default_categories();")
