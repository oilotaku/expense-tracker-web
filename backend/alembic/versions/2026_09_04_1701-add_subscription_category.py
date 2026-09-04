"""add_subscription_category

Revision ID: e5a2d9c4f107
Revises: d3f8c6a1b2e4
Create Date: 2026-09-04 17:01:00+08:00
"""

from alembic import op

revision = "e5a2d9c4f107"
down_revision = "d3f8c6a1b2e4"
branch_labels = None
depends_on = None

# 系統預設種子清單新增「訂閱」（design-spec §8 / §12.4，→ A17）；不回頭改既有
# 2026_09_04_0900-add_categories.py，改用獨立 migration 對 seed_default_categories()
# 做 CREATE OR REPLACE。順序：餐飲、交通、娛樂、購物、醫療、居住、訂閱、薪資、其他。
_DEFAULT_CATEGORY_NAMES = ["餐飲", "交通", "娛樂", "購物", "醫療", "居住", "訂閱", "薪資", "其他"]

# 分類新增 color/icon（→ 2026_09_04_1700-add_color_icon_to_categories.py）為 NOT NULL，
# 種子 trigger 也要一併補上：color 依名稱雜湊挑色（與該支 migration 的既有列回填同一套公式），
# icon 一律先給中性預設值，實際圖示由使用者自行於前端圖示選擇器調整。
_SEED_FUNCTION_SQL = """
CREATE OR REPLACE FUNCTION seed_default_categories() RETURNS trigger AS $$
BEGIN
    INSERT INTO categories (user_uid, name, color, icon)
    SELECT
        NEW.user_uid,
        cat_name,
        (ARRAY[
            '#8B6ED6', '#E8834B', '#2FA98A', '#D9A428',
            '#3E8FD0', '#D65FA0', '#8AAE3C', '#5A4FA0'
        ])[(abs(('x' || substr(md5(cat_name), 1, 8))::bit(32)::int) % 8) + 1],
        'other'
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

# 冪等：只補「目前沒有『訂閱』分類（不分是否軟刪）」的既有使用者，WHERE NOT EXISTS 比對
# user_uid + name，避免對已手動建立同名「訂閱」分類的使用者觸發 unique constraint 衝突。
_BACKFILL_SUBSCRIPTION_SQL = """
INSERT INTO categories (user_uid, name, color, icon)
SELECT
    u.user_uid,
    '訂閱',
    (ARRAY[
        '#8B6ED6', '#E8834B', '#2FA98A', '#D9A428',
        '#3E8FD0', '#D65FA0', '#8AAE3C', '#5A4FA0'
    ])[(abs(('x' || substr(md5('訂閱'), 1, 8))::bit(32)::int) % 8) + 1],
    'other'
FROM users u
WHERE NOT EXISTS (
    SELECT 1 FROM categories c WHERE c.user_uid = u.user_uid AND c.name = '訂閱'
);
"""


def upgrade() -> None:
    op.execute(_SEED_FUNCTION_SQL)
    op.execute(_DROP_SEED_TRIGGER_SQL)
    op.execute(_CREATE_SEED_TRIGGER_SQL)
    op.execute(_BACKFILL_SUBSCRIPTION_SQL)


def downgrade() -> None:
    # 建表 migration 的 downgrade 禁 DROP TABLE/COLUMN（DB-033）；trigger / function 不是
    # 使用者資料，drop 後 upgrade() 會重新建立，round-trip（DB-050）不受影響；已種好的
    # 「訂閱」分類資料留著跳過（理由同 2026_09_04_0900-add_categories.py）。
    op.execute("DROP TRIGGER IF EXISTS trg_users_seed_default_categories ON users;")
    op.execute("DROP FUNCTION IF EXISTS seed_default_categories();")
