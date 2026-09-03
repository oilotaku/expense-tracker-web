from decimal import Decimal

import pytest

from app.utils.unit_conversion import (
    MACE_PER_TAEL,
    SHARES_PER_LOT,
    MetalUnit,
    StockUnit,
    metal_to_mace,
    stock_to_shares,
)


def test_one_lot_equals_1000_shares() -> None:
    assert stock_to_shares(Decimal(1), StockUnit.LOT) == Decimal(1000)
    assert SHARES_PER_LOT == Decimal(1000)


def test_stock_share_unit_passes_through_unchanged() -> None:
    assert stock_to_shares(Decimal(250), StockUnit.SHARE) == Decimal(250)


def test_fractional_lot_converts_proportionally() -> None:
    assert stock_to_shares(Decimal("1.5"), StockUnit.LOT) == Decimal("1500")


def test_one_tael_equals_10_mace() -> None:
    assert metal_to_mace(Decimal(1), MetalUnit.TAEL) == Decimal(10)
    assert MACE_PER_TAEL == Decimal(10)


def test_metal_mace_unit_passes_through_unchanged() -> None:
    assert metal_to_mace(Decimal("2.5"), MetalUnit.MACE) == Decimal("2.5")


def test_fractional_tael_converts_proportionally() -> None:
    assert metal_to_mace(Decimal("0.5"), MetalUnit.TAEL) == Decimal("5")


@pytest.mark.parametrize("quantity", [Decimal(0), Decimal(-1), Decimal("-0.01")])
def test_stock_rejects_zero_or_negative_quantity(quantity: Decimal) -> None:
    with pytest.raises(ValueError):
        stock_to_shares(quantity, StockUnit.LOT)
    with pytest.raises(ValueError):
        stock_to_shares(quantity, StockUnit.SHARE)


@pytest.mark.parametrize("quantity", [Decimal(0), Decimal(-1), Decimal("-0.01")])
def test_metal_rejects_zero_or_negative_quantity(quantity: Decimal) -> None:
    with pytest.raises(ValueError):
        metal_to_mace(quantity, MetalUnit.TAEL)
    with pytest.raises(ValueError):
        metal_to_mace(quantity, MetalUnit.MACE)
