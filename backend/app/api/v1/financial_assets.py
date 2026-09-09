from decimal import Decimal
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_db
from app.core.exceptions import AppError, NotFoundError
from app.core.response import success
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
from app.utils.unit_conversion import MetalUnit, StockUnit, metal_to_mace, stock_to_shares

router = APIRouter(prefix="/financial-assets")

DbSession = Annotated[AsyncSession, Depends(get_db)]
CurrentUser = Annotated[User, Depends(get_current_user)]

_NOT_FOUND_DETAIL = "金融資產不存在"


def _to_base_quantity(asset_type: AssetType, quantity: Decimal, unit: str) -> Decimal:
    """依 asset_type 挑選對應的純換算函式（→ app.utils.unit_conversion）。"""
    if asset_type == "stock":
        return stock_to_shares(quantity, StockUnit(unit))
    return metal_to_mace(quantity, MetalUnit(unit))


@router.post(
    "",
    response_model=ApiResponse[FinancialAssetResponse],
    status_code=201,
    summary="新增金融資產",
)
async def create_financial_asset(
    payload: FinancialAssetCreateRequest, db: DbSession, current_user: CurrentUser
) -> ApiResponse[FinancialAssetResponse]:
    base_quantity = _to_base_quantity(
        payload.asset_type, payload.input_quantity, payload.input_unit
    )
    asset = await FinancialAssetRepository(db).create(
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
    # 需自行轉成 422，否則會被當成未預期例外回 500（→ BE-064）
    asset_type: AssetType = "stock" if asset.asset_type == "stock" else "metal"
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
