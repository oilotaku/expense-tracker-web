"""add_default_accounts

Revision ID: a3c7e1f4d8b2
Revises: f6b9d2e8a3c5
Create Date: 2026-09-09 09:00:00+08:00
"""

from alembic import op

revision = "a3c7e1f4d8b2"
down_revision = "f6b9d2e8a3c5"
branch_labels = None
depends_on = None

# 系統預設種子清單（新使用者註冊時自動套用，見下方 trigger）；固定但使用者可自行增刪。
# color 取圖表 8 色（design-spec §2.3）其中兩色，icon key 對應前端 AccountCard 既有圖示。
_DEFAULT_ACCOUNTS = [("現金", "#8B6ED6", "wallet"), ("銀行", "#3E8FD0", "bank")]

_SEED_VALUES_SQL = ", ".join(
    f"(NEW.user_uid, '{name}', 0, '{color}', '{icon}')" for name, color, icon in _DEFAULT_ACCOUNTS
)
_BACKFILL_VALUES_SQL = ", ".join(
    f"('{name}', '{color}', '{icon}')" for name, color, icon in _DEFAULT_ACCOUNTS
)

_SEED_FUNCTION_SQL = f"""
CREATE OR REPLACE FUNCTION seed_default_accounts() RETURNS trigger AS $$
BEGIN
    INSERT INTO accounts (user_uid, name, balance, color, icon)
    VALUES {_SEED_VALUES_SQL};
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
"""

_DROP_SEED_TRIGGER_SQL = "DROP TRIGGER IF EXISTS trg_users_seed_default_accounts ON users;"

# asyncpg 的 prepared statement 一次只接受一條 SQL 敘述，DROP 與 CREATE 須分兩次 op.execute()。
_CREATE_SEED_TRIGGER_SQL = """
CREATE TRIGGER trg_users_seed_default_accounts
AFTER INSERT ON users
FOR EACH ROW
EXECUTE FUNCTION seed_default_accounts();
"""

# 冪等：只補「目前一個帳戶都沒有」的既有使用者（migration 上線前就存在的帳號），
# 之後的新使用者一律由上面的 trigger 即時套用（DB-051）。guard 用帳戶總數而非逐名稱比對，
# 避免使用者已自建同名帳戶時被重複塞入。
_BACKFILL_EXISTING_USERS_SQL = f"""
INSERT INTO accounts (user_uid, name, balance, color, icon)
SELECT u.user_uid, seed.name, 0, seed.color, seed.icon
FROM users u
CROSS JOIN (VALUES {_BACKFILL_VALUES_SQL}) AS seed(name, color, icon)
WHERE NOT EXISTS (
    SELECT 1 FROM accounts a WHERE a.user_uid = u.user_uid
);
"""


def upgrade() -> None:
    # 新使用者註冊即自動套用系統預設帳戶；DROP TRIGGER IF EXISTS + CREATE 讓整段冪等可重跑。
    op.execute(_SEED_FUNCTION_SQL)
    op.execute(_DROP_SEED_TRIGGER_SQL)
    op.execute(_CREATE_SEED_TRIGGER_SQL)
    op.execute(_BACKFILL_EXISTING_USERS_SQL)


def downgrade() -> None:
    # 已種好的帳戶資料留著（同 2026_09_04_0900-add_categories.py）；trigger / function 不是
    # 使用者資料、也不在 DB-033 禁列之內，drop 後 upgrade() 會重新建立，round-trip（DB-050）
    # 因 backfill 的「目前 0 筆」guard 而不會重複塞。
    op.execute("DROP TRIGGER IF EXISTS trg_users_seed_default_accounts ON users;")
    op.execute("DROP FUNCTION IF EXISTS seed_default_accounts();")
