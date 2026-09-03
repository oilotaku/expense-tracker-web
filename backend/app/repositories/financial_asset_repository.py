from collections.abc import Sequence
from decimal import Decimal
from typing import Any, cast
from uuid import UUID

from sqlalchemy import CursorResult, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.financial_asset import FinancialAsset


class FinancialAssetRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def create(
        self,
        user_uid: UUID,
        asset_type: str,
        name: str,
        input_quantity: Decimal,
        input_unit: str,
        base_quantity: Decimal,
        created_by: UUID,
    ) -> FinancialAsset:
        asset = FinancialAsset(
            user_uid=user_uid,
            asset_type=asset_type,
            name=name,
            input_quantity=input_quantity,
            input_unit=input_unit,
            base_quantity=base_quantity,
            created_by=created_by,
            updated_by=created_by,
        )
        self.db.add(asset)
        await self.db.flush()
        return asset

    async def list_by_user_uid(self, user_uid: UUID) -> Sequence[FinancialAsset]:
        stmt = (
            select(FinancialAsset)
            .where(FinancialAsset.user_uid == user_uid, FinancialAsset.is_deleted.is_(False))
            .order_by(FinancialAsset.created_at)
        )
        return (await self.db.execute(stmt)).scalars().all()

    async def find_by_financial_asset_uid(
        self, financial_asset_uid: UUID, user_uid: UUID
    ) -> FinancialAsset | None:
        # 同時以 user_uid 收斂：非本人的資產視同不存在（回 404，不洩漏存在性）
        stmt = select(FinancialAsset).where(
            FinancialAsset.financial_asset_uid == financial_asset_uid,
            FinancialAsset.user_uid == user_uid,
            FinancialAsset.is_deleted.is_(False),
        )
        return (await self.db.execute(stmt)).scalar_one_or_none()

    async def update_fields(
        self,
        asset: FinancialAsset,
        *,
        name: str | None,
        input_quantity: Decimal | None,
        input_unit: str | None,
        base_quantity: Decimal | None,
        updated_by: UUID,
    ) -> FinancialAsset:
        if name is not None:
            asset.name = name
        # input_quantity / input_unit / base_quantity 只要三者任一有變就會一起帶入（換算在
        # API 層先算好，→ financial_assets.py），此處只負責寫回。
        if input_quantity is not None:
            asset.input_quantity = input_quantity
        if input_unit is not None:
            asset.input_unit = input_unit
        if base_quantity is not None:
            asset.base_quantity = base_quantity
        asset.updated_by = updated_by
        await self.db.flush()
        return asset

    async def soft_delete(self, financial_asset_uid: UUID, user_uid: UUID) -> bool:
        result = await self.db.execute(
            update(FinancialAsset)
            .where(
                FinancialAsset.financial_asset_uid == financial_asset_uid,
                FinancialAsset.user_uid == user_uid,
                FinancialAsset.is_deleted.is_(False),
            )
            .values(is_deleted=True, updated_at=func.now(), updated_by=user_uid)
        )
        # CursorResult 帶 rowcount；execute() 對非 Select 的公開型別是 Result[Any]（SQLAlchemy
        # 自身 stub 如此），此處只收斂到有 rowcount 的子類，不影響其餘查詢的型別安全
        return cast(CursorResult[Any], result).rowcount > 0
