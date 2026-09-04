"""預算 CRUD 與花費彙總：所有查詢皆以 `Depends(get_current_user)` 限定當前使用者（→ BE-023）。"""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_db
from app.core.exceptions import ConflictError, NotFoundError
from app.core.response import success
from app.models.user import User
from app.repositories.budget_repository import BudgetRepository
from app.repositories.category_repository import CategoryRepository
from app.schemas.budget import (
    BudgetCreateRequest,
    BudgetListResponse,
    BudgetResponse,
    BudgetSummaryResponse,
    BudgetUpdateRequest,
)
from app.schemas.response import ApiResponse
from app.services.budget_service import BudgetService

router = APIRouter(prefix="/budgets")

DbSession = Annotated[AsyncSession, Depends(get_db)]
CurrentUser = Annotated[User, Depends(get_current_user)]

_NOT_FOUND_DETAIL = "預算不存在"
_CATEGORY_NOT_FOUND_DETAIL = "分類不存在"
_DUPLICATE_BUDGET_DETAIL = "此分類已存在同期間類型的預算"


@router.post(
    "",
    response_model=ApiResponse[BudgetResponse],
    status_code=201,
    summary="新增預算",
)
async def create_budget(
    payload: BudgetCreateRequest, db: DbSession, current_user: CurrentUser
) -> ApiResponse[BudgetResponse]:
    category = await CategoryRepository(db).find_by_category_uid(
        current_user.user_uid, payload.category_uid
    )
    if category is None:
        raise NotFoundError(_CATEGORY_NOT_FOUND_DETAIL)
    repo = BudgetRepository(db)
    try:
        budget = await repo.create(
            current_user.user_uid,
            payload.category_uid,
            payload.period_type,
            payload.limit_amount,
        )
    except IntegrityError as e:
        raise ConflictError(_DUPLICATE_BUDGET_DETAIL) from e
    return success(BudgetResponse.model_validate(budget), response_code=201)


@router.get(
    "",
    response_model=ApiResponse[BudgetListResponse],
    summary="預算清單",
)
async def list_budgets(
    db: DbSession,
    current_user: CurrentUser,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> ApiResponse[BudgetListResponse]:
    repo = BudgetRepository(db)
    budgets, total = await repo.list_by_user_uid(current_user.user_uid, limit=limit, offset=offset)
    items = [BudgetResponse.model_validate(b) for b in budgets]
    return success(BudgetListResponse(items=items, total=total))


@router.patch(
    "/{budget_uid}",
    response_model=ApiResponse[BudgetResponse],
    summary="更新預算上限",
)
async def update_budget(
    budget_uid: UUID,
    payload: BudgetUpdateRequest,
    db: DbSession,
    current_user: CurrentUser,
) -> ApiResponse[BudgetResponse]:
    repo = BudgetRepository(db)
    budget = await repo.find_by_budget_uid(current_user.user_uid, budget_uid)
    if budget is None:
        raise NotFoundError(_NOT_FOUND_DETAIL)
    budget = await repo.update_limit_amount(budget, payload.limit_amount)
    return success(BudgetResponse.model_validate(budget))


@router.delete(
    "/{budget_uid}",
    response_model=ApiResponse[None],
    summary="刪除預算",
)
async def delete_budget(
    budget_uid: UUID, db: DbSession, current_user: CurrentUser
) -> ApiResponse[None]:
    repo = BudgetRepository(db)
    budget = await repo.find_by_budget_uid(current_user.user_uid, budget_uid)
    if budget is None:
        raise NotFoundError(_NOT_FOUND_DETAIL)
    await repo.soft_delete(budget)
    return success(None)


@router.get(
    "/{budget_uid}/summary",
    response_model=ApiResponse[BudgetSummaryResponse],
    summary="預算花費彙總（同分類、同期間支出加總與上限比較）",
)
async def get_budget_summary(
    budget_uid: UUID, db: DbSession, current_user: CurrentUser
) -> ApiResponse[BudgetSummaryResponse]:
    repo = BudgetRepository(db)
    budget = await repo.find_by_budget_uid(current_user.user_uid, budget_uid)
    if budget is None:
        raise NotFoundError(_NOT_FOUND_DETAIL)
    summary = await BudgetService(repo).get_summary(budget)
    return success(summary)
