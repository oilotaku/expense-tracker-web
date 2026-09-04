"""add_color_icon_to_accounts

Revision ID: f6b9d2e8a3c5
Revises: e5a2d9c4f107
Create Date: 2026-09-04 18:00:00+08:00
"""

import sqlalchemy as sa
from alembic import op

revision = "f6b9d2e8a3c5"
down_revision = "e5a2d9c4f107"
branch_labels = None
depends_on = None

# 做法與 2026_09_04_1700-add_color_icon_to_categories.py 對稱：佔位預設值套用到既有列後，
# 立刻依名稱雜湊改配色，避免既有帳戶（含新使用者預設帳戶）第一次看到新版視覺時顏色跳動。
_PLACEHOLDER_COLOR = "#9C96AF"
_PLACEHOLDER_ICON = "other"

# 圖表 8 色（design-spec §2.3），公式與 categories 的 backfill 同一套。
_BACKFILL_COLOR_SQL = """
UPDATE accounts
SET color = (ARRAY[
    '#8B6ED6', '#E8834B', '#2FA98A', '#D9A428',
    '#3E8FD0', '#D65FA0', '#8AAE3C', '#5A4FA0'
])[(abs(('x' || substr(md5(name), 1, 8))::bit(32)::int) % 8) + 1]
WHERE color = '#9C96AF';
"""


def upgrade() -> None:
    op.add_column(
        "accounts",
        sa.Column("color", sa.String(length=7), nullable=False, server_default=_PLACEHOLDER_COLOR),
        if_not_exists=True,
    )
    op.add_column(
        "accounts",
        sa.Column("icon", sa.String(length=50), nullable=False, server_default=_PLACEHOLDER_ICON),
        if_not_exists=True,
    )
    op.execute(_BACKFILL_COLOR_SQL)


def downgrade() -> None:
    # 新欄位不 DROP（DB-033）；backfill 依佔位值比對，重跑 upgrade()（round-trip，DB-050）
    # 對已回填過的既有列是 no-op。
    pass
