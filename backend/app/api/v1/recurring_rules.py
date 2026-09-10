"""週期性交易規則 CRUD：所有查詢皆以 `Depends(get_current_user)` 限定當前使用者（→ BE-023）。

實際產生交易的邏輯（含月底夾日、冪等）在 `app.services.recurring_service.RecurringService`，
由服務啟動 / 每日排程觸發（不在本檔範圍）。
"""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_db
from app.core.exceptions import AppError, NotFoundError
from app.core.response import success
from app.models.recurring_rule import RecurringRule
from app.models.transaction import TransactionType
from app.models.user import User
from app.repositories.account_repository import AccountRepository
from app.repositories.category_repository import CategoryRepository
from app.repositories.liability_repository import LiabilityRepository
from app.repositories.recurring_rule_repository import RecurringRuleRepository
from app.schemas.recurring_rule import (
    RecurringRuleCreateRequest,
    RecurringRuleListResponse,
    RecurringRuleResponse,
    RecurringRuleUpdateRequest,
)
from app.schemas.response import ApiResponse

router = APIRouter(prefix="/recurring-rules")

DbSession = Annotated[AsyncSession, Depends(get_db)]
CurrentUser = Annotated[User, Depends(get_current_user)]

_NOT_FOUND_DETAIL = "週期性交易規則不存在"
_ACCOUNT_NOT_FOUND_DETAIL = "帳戶不存在"
_CATEGORY_NOT_FOUND_DETAIL = "分類不存在"
_LIABILITY_NOT_FOUND_DETAIL = "負債不存在"
_LIABILITY_REQUIRES_EXPENSE_DETAIL = "連結負債還款的規則，transaction_type 必須是 expense"


async def _ensure_account_owned(db: AsyncSession, account_uid: UUID, user_uid: UUID) -> None:
    account = await AccountRepository(db).find_by_account_uid(account_uid, user_uid)
    if account is None:
        raise NotFoundError(_ACCOUNT_NOT_FOUND_DETAIL)


async def _ensure_category_owned(db: AsyncSession, category_uid: UUID, user_uid: UUID) -> None:
    category = await CategoryRepository(db).find_by_category_uid(user_uid, category_uid)
    if category is None:
        raise NotFoundError(_CATEGORY_NOT_FOUND_DETAIL)


async def _ensure_liability_owned(db: AsyncSession, liability_uid: UUID, user_uid: UUID) -> None:
    liability = await LiabilityRepository(db).find_by_liability_uid(liability_uid, user_uid)
    if liability is None:
        raise NotFoundError(_LIABILITY_NOT_FOUND_DETAIL)


def _to_response(rule: RecurringRule) -> RecurringRuleResponse:
    return RecurringRuleResponse(
        recurring_rule_uid=rule.recurring_rule_uid,
        account_uid=rule.account_uid,
        category_uid=rule.category_uid,
        description=rule.description,
        amount=rule.amount,
        transaction_type=rule.transaction_type,
        payment_method=rule.payment_method,
        interval_unit=rule.interval_unit,
        interval_count=rule.interval_count,
        anchor_date=rule.anchor_date,
        last_generated_year_month=rule.last_generated_year_month,
        liability_uid=rule.liability_uid,
        is_active=rule.is_active,
    )


def _ensure_liability_requires_expense(
    liability_uid: UUID | None, transaction_type: TransactionType | None
) -> None:
    if liability_uid is not None and transaction_type is not TransactionType.EXPENSE:
        raise AppError(_LIABILITY_REQUIRES_EXPENSE_DETAIL, response_code=422, status_code=422)


@router.post(
    "",
    response_model=ApiResponse[RecurringRuleResponse],
    status_code=201,
    summary="建立週期性交易規則",
)
async def create_recurring_rule(
    payload: RecurringRuleCreateRequest, db: DbSession, current_user: CurrentUser
) -> ApiResponse[RecurringRuleResponse]:
    await _ensure_account_owned(db, payload.account_uid, current_user.user_uid)
    await _ensure_category_owned(db, payload.category_uid, current_user.user_uid)
    _ensure_liability_requires_expense(payload.liability_uid, payload.transaction_type)
    if payload.liability_uid is not None:
        await _ensure_liability_owned(db, payload.liability_uid, current_user.user_uid)
    rule = await RecurringRuleRepository(db).create(
        user_uid=current_user.user_uid,
        account_uid=payload.account_uid,
        category_uid=payload.category_uid,
        description=payload.description,
        amount=payload.amount,
        transaction_type=payload.transaction_type,
        payment_method=payload.payment_method,
        interval_unit=payload.interval_unit,
        interval_count=payload.interval_count,
        anchor_date=payload.anchor_date,
        created_by=current_user.user_uid,
        liability_uid=payload.liability_uid,
    )
    return success(data=_to_response(rule), response_code=201)


@router.get(
    "",
    response_model=ApiResponse[RecurringRuleListResponse],
    summary="週期性交易規則清單",
)
async def list_recurring_rules(
    db: DbSession, current_user: CurrentUser
) -> ApiResponse[RecurringRuleListResponse]:
    rules = await RecurringRuleRepository(db).list_by_user_uid(current_user.user_uid)
    items = [_to_response(r) for r in rules]
    return success(data=RecurringRuleListResponse(items=items, total=len(items)))


@router.get(
    "/{recurring_rule_uid}",
    response_model=ApiResponse[RecurringRuleResponse],
    summary="單一週期性交易規則",
)
async def get_recurring_rule(
    recurring_rule_uid: UUID, db: DbSession, current_user: CurrentUser
) -> ApiResponse[RecurringRuleResponse]:
    rule = await RecurringRuleRepository(db).find_by_recurring_rule_uid(
        recurring_rule_uid, current_user.user_uid
    )
    if rule is None:
        raise NotFoundError(_NOT_FOUND_DETAIL)
    return success(data=_to_response(rule))


@router.patch(
    "/{recurring_rule_uid}",
    response_model=ApiResponse[RecurringRuleResponse],
    summary="更新週期性交易規則",
)
async def update_recurring_rule(
    recurring_rule_uid: UUID,
    payload: RecurringRuleUpdateRequest,
    db: DbSession,
    current_user: CurrentUser,
) -> ApiResponse[RecurringRuleResponse]:
    repo = RecurringRuleRepository(db)
    rule = await repo.find_by_recurring_rule_uid(recurring_rule_uid, current_user.user_uid)
    if rule is None:
        raise NotFoundError(_NOT_FOUND_DETAIL)
    if payload.account_uid is not None:
        await _ensure_account_owned(db, payload.account_uid, current_user.user_uid)
    if payload.category_uid is not None:
        await _ensure_category_owned(db, payload.category_uid, current_user.user_uid)
    if payload.liability_uid is not None:
        await _ensure_liability_owned(db, payload.liability_uid, current_user.user_uid)
    effective_liability_uid = (
        payload.liability_uid if payload.liability_uid is not None else rule.liability_uid
    )
    effective_transaction_type = payload.transaction_type or rule.transaction_type
    _ensure_liability_requires_expense(effective_liability_uid, effective_transaction_type)
    rule = await repo.update_fields(
        rule,
        account_uid=payload.account_uid,
        category_uid=payload.category_uid,
        description=payload.description,
        amount=payload.amount,
        transaction_type=payload.transaction_type,
        payment_method=payload.payment_method,
        interval_unit=payload.interval_unit,
        interval_count=payload.interval_count,
        anchor_date=payload.anchor_date,
        updated_by=current_user.user_uid,
        liability_uid=payload.liability_uid,
        is_active=payload.is_active,
    )
    return success(data=_to_response(rule))


@router.delete(
    "/{recurring_rule_uid}",
    response_model=ApiResponse[None],
    summary="刪除週期性交易規則（軟刪）",
)
async def delete_recurring_rule(
    recurring_rule_uid: UUID, db: DbSession, current_user: CurrentUser
) -> ApiResponse[None]:
    repo = RecurringRuleRepository(db)
    rule = await repo.find_by_recurring_rule_uid(recurring_rule_uid, current_user.user_uid)
    if rule is None:
        raise NotFoundError(_NOT_FOUND_DETAIL)
    await repo.soft_delete(rule, current_user.user_uid)
    return success(data=None)
