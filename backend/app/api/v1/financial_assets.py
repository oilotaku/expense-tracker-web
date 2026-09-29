from decimal import Decimal
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_db
from app.core.exceptions import AppError, NotFoundError
from app.core.response import success
from app.models.financial_asset import FinancialAsset
from app.models.user import User
from app.repositories.financial_asset_repository import FinancialAssetRepository
from app.schemas.financial_asset import (
    AssetType,
    FinancialAssetCreateRequest,
    FinancialAssetListResponse,
    FinancialAssetResponse,
    FinancialAssetUpdateRequest,
    validate_name_for_asset_type,
    validate_unit_for_asset_type,
)
from app.schemas.response import ApiResponse
from app.utils.unit_conversion import (
    MetalUnit,
    StockUnit,
    UsStockUnit,
    metal_to_mace,
    stock_to_shares,
    us_stock_to_shares,
)

router = APIRouter(prefix="/financial-assets")

DbSession = Annotated[AsyncSession, Depends(get_db)]
CurrentUser = Annotated[User, Depends(get_current_user)]

_NOT_FOUND_DETAIL = "金融資產不存在"


def _to_base_quantity(asset_type: AssetType, quantity: Decimal, unit: str) -> Decimal:
    """依 asset_type 挑選對應的純換算函式（→ app.utils.unit_conversion）。"""
    if asset_type == "stock":
        return stock_to_shares(quantity, StockUnit(unit))
    if asset_type == "us_stock":
        return us_stock_to_shares(quantity, UsStockUnit(unit))
    return metal_to_mace(quantity, MetalUnit(unit))


_BASE_UNIT: dict[str, str] = {
    "stock": StockUnit.SHARE.value,
    "us_stock": UsStockUnit.SHARE.value,
    "metal": MetalUnit.MACE.value,
}


def _merged_quantity(
    existing: FinancialAsset,
    asset_type: AssetType,
    input_quantity: Decimal,
    input_unit: str,
    base_quantity: Decimal,
) -> tuple[Decimal, str, Decimal]:
    """合併數量,回傳 (input_quantity, input_unit, base_quantity)。

    單位相同就直接相加輸入數量;單位不同(如 張 + 股)改以基本單位記錄。
    """
    total_base = existing.base_quantity + base_quantity
    if existing.input_unit == input_unit:
        return existing.input_quantity + input_quantity, input_unit, total_base
    return total_base, _BASE_UNIT[asset_type], total_base


def _merged_principal(existing: Decimal | None, added: Decimal | None) -> Decimal | None:
    """成本:兩邊都有就相加;只有一邊有就用那一邊;都沒有維持空值。"""
    if existing is None:
        return added
    if added is None:
        return existing
    return existing + added


@router.post(
    "",
    response_model=ApiResponse[FinancialAssetResponse],
    status_code=201,
    summary="新增金融資產(同類型同名稱已存在時合併數量與成本)",
)
async def create_financial_asset(
    payload: FinancialAssetCreateRequest, db: DbSession, current_user: CurrentUser
) -> ApiResponse[FinancialAssetResponse]:
    base_quantity = _to_base_quantity(
        payload.asset_type, payload.input_quantity, payload.input_unit
    )
    repo = FinancialAssetRepository(db)
    # 同一標的(同類型、同名稱)不另開一筆,直接加到既有那筆(使用者要求:分次買進應合併)
    existing = await repo.find_active_by_name(
        current_user.user_uid, payload.asset_type, payload.name
    )
    if existing is not None:
        merged_input, merged_unit, merged_base = _merged_quantity(
            existing, payload.asset_type, payload.input_quantity, payload.input_unit, base_quantity
        )
        merged = await repo.update_fields(
            existing,
            name=None,
            input_quantity=merged_input,
            input_unit=merged_unit,
            base_quantity=merged_base,
            principal_amount=_merged_principal(existing.principal_amount, payload.principal_amount),
            updated_by=current_user.user_uid,
        )
        return success(data=FinancialAssetResponse.model_validate(merged), response_code=201)
    asset = await repo.create(
        user_uid=current_user.user_uid,
        asset_type=payload.asset_type,
        name=payload.name,
        input_quantity=payload.input_quantity,
        input_unit=payload.input_unit,
        base_quantity=base_quantity,
        principal_amount=payload.principal_amount,
        created_by=current_user.user_uid,
    )
    return success(data=FinancialAssetResponse.model_validate(asset), response_code=201)


@router.get(
    "",
    response_model=ApiResponse[FinancialAssetListResponse],
    summary="金融資產清單",
)
async def list_financial_assets(
    db: DbSession, current_user: CurrentUser
) -> ApiResponse[FinancialAssetListResponse]:
    assets = await FinancialAssetRepository(db).list_by_user_uid(current_user.user_uid)
    items = [FinancialAssetResponse.model_validate(item) for item in assets]
    return success(data=FinancialAssetListResponse(items=items, total=len(items)))


@router.get(
    "/{financial_asset_uid}",
    response_model=ApiResponse[FinancialAssetResponse],
    summary="金融資產詳情",
)
async def get_financial_asset(
    financial_asset_uid: UUID, db: DbSession, current_user: CurrentUser
) -> ApiResponse[FinancialAssetResponse]:
    asset = await FinancialAssetRepository(db).find_by_financial_asset_uid(
        financial_asset_uid, current_user.user_uid
    )
    if asset is None:
        raise NotFoundError(_NOT_FOUND_DETAIL)
    return success(data=FinancialAssetResponse.model_validate(asset))


@router.patch(
    "/{financial_asset_uid}",
    response_model=ApiResponse[FinancialAssetResponse],
    summary="更新金融資產",
)
async def update_financial_asset(
    financial_asset_uid: UUID,
    payload: FinancialAssetUpdateRequest,
    db: DbSession,
    current_user: CurrentUser,
) -> ApiResponse[FinancialAssetResponse]:
    repo = FinancialAssetRepository(db)
    asset = await repo.find_by_financial_asset_uid(financial_asset_uid, current_user.user_uid)
    if asset is None:
        raise NotFoundError(_NOT_FOUND_DETAIL)

    new_quantity = payload.input_quantity
    new_unit = payload.input_unit
    base_quantity: Decimal | None = None
    # asset_type 建立後不可變更（見 schema 註解），單位／名稱是否與 asset_type 搭配用既有型別驗證；
    # 這裡不是 pydantic 的驗證流程（asset_type 不在 payload 內，來自既有資料），ValueError
    # 需自行轉成 422，否則會被當成未預期例外回 500（→ BE-064）。asset_type 存在 DB 已被
    # ck_financial_assets_asset_type 限制在三個合法值內，cast 而非再猜測分派。
    asset_type: AssetType = asset.asset_type  # type: ignore[assignment]
    try:
        if payload.name is not None:
            validate_name_for_asset_type(asset_type, payload.name)
        if new_quantity is not None or new_unit is not None:
            effective_unit = new_unit if new_unit is not None else asset.input_unit
            effective_quantity = new_quantity if new_quantity is not None else asset.input_quantity
            validate_unit_for_asset_type(asset_type, effective_unit)
            base_quantity = _to_base_quantity(asset_type, effective_quantity, effective_unit)
    except ValueError as e:
        raise AppError(str(e), response_code=422, status_code=422) from e

    asset = await repo.update_fields(
        asset,
        name=payload.name,
        input_quantity=payload.input_quantity,
        input_unit=payload.input_unit,
        base_quantity=base_quantity,
        principal_amount=payload.principal_amount,
        updated_by=current_user.user_uid,
    )
    return success(data=FinancialAssetResponse.model_validate(asset))


@router.delete(
    "/{financial_asset_uid}",
    response_model=ApiResponse[None],
    summary="刪除金融資產（軟刪）",
)
async def delete_financial_asset(
    financial_asset_uid: UUID, db: DbSession, current_user: CurrentUser
) -> ApiResponse[None]:
    deleted = await FinancialAssetRepository(db).soft_delete(
        financial_asset_uid, current_user.user_uid
    )
    if not deleted:
        raise NotFoundError(_NOT_FOUND_DETAIL)
    return success(data=None)
