"""金融資產：股票（股號 + 張/股）與貴金屬（品項 + 兩/錢），歸屬使用者。

`input_quantity` / `input_unit` 存原始輸入；`base_quantity` 存換算後的基本單位數量
（股票 → 股數、貴金屬 → 錢數，換算函式見 `app.utils.unit_conversion`），供 task-014 抓價、
task-016 彙總淨資產時直接使用，不需重新換算。抓價本身（含市值欄位）不在本 task 範圍
（→ task-014）。
"""

from decimal import Decimal
from uuid import UUID

from sqlalchemy import CheckConstraint, ForeignKey, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import BaseModel, public_uid


class FinancialAsset(BaseModel):
    __tablename__ = "financial_assets"
    # 預設 __public_uid__（"financial_asset_uid"）已符合，不需覆寫

    financial_asset_uid: Mapped[UUID] = public_uid()
    user_uid: Mapped[UUID] = mapped_column(ForeignKey("users.user_uid"), nullable=False, index=True)
    # "stock" | "metal"（→ ck_financial_assets_asset_type）
    asset_type: Mapped[str] = mapped_column(String(10), nullable=False)
    # 股票存股號（例："2330"）；貴金屬存品項名稱（例："黃金"）
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    # 原始輸入量與單位：股票「張」或「股」、貴金屬「兩」或「錢」
    input_quantity: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False)
    input_unit: Mapped[str] = mapped_column(String(10), nullable=False)
    # 換算後基本單位數量：asset_type = stock → 股數；asset_type = metal → 錢數
    base_quantity: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False)
    # 本金（原始購入成本）：nullable，讓既有資產列不用回填一個編造的本金
    principal_amount: Mapped[Decimal | None] = mapped_column(Numeric(18, 2), nullable=True)

    __table_args__ = (
        CheckConstraint("asset_type IN ('stock', 'metal')", name="ck_financial_assets_asset_type"),
        CheckConstraint(
            "(asset_type = 'stock' AND input_unit IN ('張', '股')) OR "
            "(asset_type = 'metal' AND input_unit IN ('兩', '錢'))",
            name="ck_financial_assets_input_unit",
        ),
        CheckConstraint("input_quantity > 0", name="ck_financial_assets_input_quantity_positive"),
        CheckConstraint("base_quantity > 0", name="ck_financial_assets_base_quantity_positive"),
        CheckConstraint(
            "principal_amount IS NULL OR principal_amount > 0",
            name="ck_financial_assets_principal_amount_positive",
        ),
    )
