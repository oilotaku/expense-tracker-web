from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_db
from app.core.exceptions import NotFoundError
from app.core.response import success
from app.models.user import User
from app.repositories.account_repository import AccountRepository
from app.repositories.category_repository import CategoryRepository
from app.repositories.liability_repository import LiabilityRepository
from app.repositories.recurring_rule_repository import RecurringRuleRepository
from app.schemas.liability import (
    LiabilityCreateRequest,
    LiabilityListResponse,
    LiabilityRepayRequest,
    LiabilityResponse,
    LiabilityUpdateRequest,
)
from app.schemas.response import ApiResponse
from app.services.liability_service import LiabilityService

router = APIRouter(prefix="/liabilities")

DbSession = Annotated[AsyncSession, Depends(get_db)]
CurrentUser = Annotated[User, Depends(get_current_user)]

_NOT_FOUND_DETAIL = "負債不存在"
_ACCOUNT_NOT_FOUND_DETAIL = "帳戶不存在"
_CATEGORY_NOT_FOUND_DETAIL = "分類不存在"


async def _ensure_account_owned(db: AsyncSession, account_uid: UUID, user_uid: UUID) -> None:
    account = await AccountRepository(db).find_by_account_uid(account_uid, user_uid)
    if account is None:
        raise NotFoundError(_ACCOUNT_NOT_FOUND_DETAIL)


async def _ensure_category_owned(db: AsyncSession, category_uid: UUID, user_uid: UUID) -> None:
    category = await CategoryRepository(db).find_by_category_uid(user_uid, category_uid)
    if category is None:
        raise NotFoundError(_CATEGORY_NOT_FOUND_DETAIL)


@router.post(
    "",
    response_model=ApiResponse[LiabilityResponse],
    status_code=201,
    summary="新增負債",
)
async def create_liability(
    payload: LiabilityCreateRequest, db: DbSession, current_user: CurrentUser
) -> ApiResponse[LiabilityResponse]:
    liability = await LiabilityRepository(db).create(
        user_uid=current_user.user_uid,
        name=payload.name,
        amount=payload.amount,
        interest_rate=payload.interest_rate,
        created_by=current_user.user_uid,
    )
    return success(data=LiabilityResponse.model_validate(liability), response_code=201)


@router.get(
    "",
    response_model=ApiResponse[LiabilityListResponse],
    summary="負債清單",
)
async def list_liabilities(
    db: DbSession, current_user: CurrentUser
) -> ApiResponse[LiabilityListResponse]:
    liabilities = await LiabilityRepository(db).list_by_user_uid(current_user.user_uid)
    items = [LiabilityResponse.model_validate(item) for item in liabilities]
    return success(data=LiabilityListResponse(items=items, total=len(items)))


@router.get(
    "/{liability_uid}",
    response_model=ApiResponse[LiabilityResponse],
    summary="負債詳情",
)
async def get_liability(
    liability_uid: UUID, db: DbSession, current_user: CurrentUser
) -> ApiResponse[LiabilityResponse]:
    liability = await LiabilityRepository(db).find_by_liability_uid(
        liability_uid, current_user.user_uid
    )
    if liability is None:
        raise NotFoundError(_NOT_FOUND_DETAIL)
    return success(data=LiabilityResponse.model_validate(liability))


@router.patch(
    "/{liability_uid}",
    response_model=ApiResponse[LiabilityResponse],
    summary="更新負債",
)
async def update_liability(
    liability_uid: UUID,
    payload: LiabilityUpdateRequest,
    db: DbSession,
    current_user: CurrentUser,
) -> ApiResponse[LiabilityResponse]:
    repo = LiabilityRepository(db)
    liability = await repo.find_by_liability_uid(liability_uid, current_user.user_uid)
    if liability is None:
        raise NotFoundError(_NOT_FOUND_DETAIL)
    liability = await repo.update_fields(
        liability,
        name=payload.name,
        amount=payload.amount,
        interest_rate=payload.interest_rate,
        updated_by=current_user.user_uid,
    )
    return success(data=LiabilityResponse.model_validate(liability))


@router.post(
    "/{liability_uid}/repay",
    response_model=ApiResponse[LiabilityResponse],
    summary="負債一次性還款（產生支出交易並扣減負債）",
)
async def repay_liability(
    liability_uid: UUID,
    payload: LiabilityRepayRequest,
    db: DbSession,
    current_user: CurrentUser,
) -> ApiResponse[LiabilityResponse]:
    await _ensure_account_owned(db, payload.account_uid, current_user.user_uid)
    await _ensure_category_owned(db, payload.category_uid, current_user.user_uid)
    liability, _transaction = await LiabilityService(db).record_manual_repayment(
        liability_uid=liability_uid,
        user_uid=current_user.user_uid,
        amount=payload.amount,
        account_uid=payload.account_uid,
        category_uid=payload.category_uid,
        payment_method=payload.payment_method,
    )
    return success(data=LiabilityResponse.model_validate(liability))


@router.delete(
    "/{liability_uid}",
    response_model=ApiResponse[None],
    summary="刪除負債（軟刪）",
)
async def delete_liability(
    liability_uid: UUID, db: DbSession, current_user: CurrentUser
) -> ApiResponse[None]:
    deleted = await LiabilityRepository(db).soft_delete(liability_uid, current_user.user_uid)
    if not deleted:
        raise NotFoundError(_NOT_FOUND_DETAIL)
    # 連動軟刪其定期還款規則，避免規則失去對應負債後仍繼續嘗試產生交易
    await RecurringRuleRepository(db).soft_delete_by_liability_uid(
        liability_uid, current_user.user_uid
    )
    return success(data=None)
