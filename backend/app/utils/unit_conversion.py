"""金融資產輸入單位 → 基本單位換算：純數學，無 I/O（供 task-013 CRUD 呼叫）。

- 台股基本單位是「股」：1 張 = 1000 股（`SHARES_PER_LOT`）。
- 美股（`us_stock`）沒有台股「張」的整手概念，市場慣例直接以股為單位，只有「股」一種輸入單位
  （使用者確認，本次 session），輸入量即基本單位量，無需換算係數。
- 貴金屬基本單位是「錢」：1 兩 = 10 錢（`MACE_PER_TAEL`；台制 1 錢 = 3.75 g），
  對應 `docs/Arch/adr/0002-metal-price-source.md` 換算公式最終落在「TWD/錢」，
  task-014 抓價、task-016 彙總淨資產時直接以 base_quantity（股數 / 錢數）乘上單位市價即可，
  不需再次換算。
"""

from decimal import Decimal
from enum import StrEnum


class StockUnit(StrEnum):
    LOT = "張"
    SHARE = "股"


class UsStockUnit(StrEnum):
    SHARE = "股"


class MetalUnit(StrEnum):
    TAEL = "兩"
    MACE = "錢"


SHARES_PER_LOT = Decimal(1000)
MACE_PER_TAEL = Decimal(10)


def _ensure_positive(quantity: Decimal) -> None:
    if quantity <= 0:
        raise ValueError("數量必須為正數")


def stock_to_shares(quantity: Decimal, unit: StockUnit) -> Decimal:
    """台股輸入量（張或股）換算為基本單位「股」。"""
    _ensure_positive(quantity)
    if unit is StockUnit.LOT:
        return quantity * SHARES_PER_LOT
    return quantity


def us_stock_to_shares(quantity: Decimal, unit: UsStockUnit) -> Decimal:
    """美股輸入量（僅「股」）即基本單位量；保留函式與 `stock_to_shares` 對稱，供
    `_to_base_quantity` 統一分派、驗證正數。
    """
    _ensure_positive(quantity)
    return quantity


def metal_to_mace(quantity: Decimal, unit: MetalUnit) -> Decimal:
    """貴金屬輸入量（兩或錢）換算為基本單位「錢」。"""
    _ensure_positive(quantity)
    if unit is MetalUnit.TAEL:
        return quantity * MACE_PER_TAEL
    return quantity
