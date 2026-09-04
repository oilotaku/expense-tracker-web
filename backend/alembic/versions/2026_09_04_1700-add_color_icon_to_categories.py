"""add_color_icon_to_categories

Revision ID: d3f8c6a1b2e4
Revises: c7e1a4d90b3f
Create Date: 2026-09-04 17:00:00+08:00
"""

import sqlalchemy as sa
from alembic import op

revision = "d3f8c6a1b2e4"
down_revision = "c7e1a4d90b3f"
branch_labels = None
depends_on = None

# 佔位預設值：ADD COLUMN 當下即套用到既有列，下面的 UPDATE 立刻依名稱雜湊改配色，
# 避免既有分類第一次看到新版視覺時顏色無預警跳動（design-spec §12.4）。
_PLACEHOLDER_COLOR = "#9C96AF"
_PLACEHOLDER_ICON = "other"

# 圖表 8 色（design-spec §2.3），依名稱 md5 雜湊取前 8 hex 轉 32-bit 整數 mod 8 做確定性挑色，
# 同名分類（不同使用者）永遠得到同一顏色，符合「確定性雜湊挑色」需求。
_BACKFILL_COLOR_SQL = """
UPDATE categories
SET color = (ARRAY[
    '#8B6ED6', '#E8834B', '#2FA98A', '#D9A428',
    '#3E8FD0', '#D65FA0', '#8AAE3C', '#5A4FA0'
])[(abs(('x' || substr(md5(name), 1, 8))::bit(32)::int) % 8) + 1]
WHERE color = '#9C96AF';
"""


def upgrade() -> None:
    op.add_column(
        "categories",
        sa.Column("color", sa.String(length=7), nullable=False, server_default=_PLACEHOLDER_COLOR),
        if_not_exists=True,
    )
    op.add_column(
        "categories",
        sa.Column("icon", sa.String(length=50), nullable=False, server_default=_PLACEHOLDER_ICON),
        if_not_exists=True,
    )
    op.execute(_BACKFILL_COLOR_SQL)


def downgrade() -> None:
    # 新欄位不 DROP（DB-033）；backfill 依佔位值比對，重跑 upgrade()（round-trip，DB-050）
    # 對已回填過的既有列是 no-op，對（理論上不存在的）新增列仍會補上雜湊色。
    pass
