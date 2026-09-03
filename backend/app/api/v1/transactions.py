"""交易 CRUD：所有查詢皆以 `Depends(get_current_user)` 限定當前使用者（→ BE-023）。"""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_db
from app.core.exceptions import NotFoundError
from app.core.response import success
from app.models.tag import Tag
from app.models.transaction import Transaction
from app.models.user import User
from app.repositories.account_repository import AccountRepository
from app.repositories.category_repository import CategoryRepository
from app.repositories.transaction_repository import TransactionRepository
from app.schemas.response import ApiResponse
from app.schemas.transaction import (
    TagResponse,
    TransactionCreateRequest,
    TransactionListFilter,
    TransactionListResponse,
    TransactionResponse,
    TransactionUpdateRequest,
)

router = APIRouter(prefix="/transactions")

DbSession = Annotated[AsyncSession, Depends(get_db)]
CurrentUser = Annotated[User, Depends(get_current_user)]

_NOT_FOUND_DETAIL = "交易不存在"
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


def _to_response(transaction: Transaction, tags: list[Tag]) -> TransactionResponse:
    return TransactionResponse(
        transaction_uid=transaction.transaction_uid,
        account_uid=transaction.account_uid,
        category_uid=transaction.category_uid,
        transaction_date=transaction.transaction_date,
        description=transaction.description,
        amount=transaction.amount,
        transaction_type=transaction.transaction_type,
        payment_method=transaction.payment_method,
        tags=[TagResponse(tag_uid=t.tag_uid, name=t.name) for t in tags],
    )


@router.post(
    "",
    response_model=ApiResponse[TransactionResponse],
    status_code=201,
    summary="建立交易",
)
async def create_transaction(
    payload: TransactionCreateRequest, db: DbSession, current_user: CurrentUser
) -> ApiResponse[TransactionResponse]:
    await _ensure_account_owned(db, payload.account_uid, current_user.user_uid)
    await _ensure_category_owned(db, payload.category_uid, current_user.user_uid)
    transaction, tags = await TransactionRepository(db).create(
        user_uid=current_user.user_uid,
        account_uid=payload.account_uid,
        category_uid=payload.category_uid,
        transaction_date=payload.transaction_date,
        description=payload.description,
        amount=payload.amount,
        transaction_type=payload.transaction_type,
        payment_method=payload.payment_method,
        tag_names=payload.tags,
        created_by=current_user.user_uid,
    )
    return success(data=_to_response(transaction, tags), response_code=201)


@router.get(
    "",
    response_model=ApiResponse[TransactionListResponse],
    summary="交易清單（可依分類 / 日期區間篩選）",
)
async def list_transactions(
    db: DbSession,
    current_user: CurrentUser,
    filters: Annotated[TransactionListFilter, Query()],
) -> ApiResponse[TransactionListResponse]:
    repo = TransactionRepository(db)
    transactions, total = await repo.list_by_user_uid(
        current_user.user_uid,
        category_uid=filters.category_uid,
        date_from=filters.date_from,
        date_to=filters.date_to,
        limit=filters.limit,
        offset=filters.offset,
    )
    items = [
        _to_response(t, list(await repo.list_tags_for_transaction_uid(t.transaction_uid)))
        for t in transactions
    ]
    return success(data=TransactionListResponse(items=items, total=total))


@router.get(
    "/{transaction_uid}",
    response_model=ApiResponse[TransactionResponse],
    summary="單一交易",
)
async def get_transaction(
    transaction_uid: UUID, db: DbSession, current_user: CurrentUser
) -> ApiResponse[TransactionResponse]:
    repo = TransactionRepository(db)
    transaction = await repo.find_by_transaction_uid(transaction_uid, current_user.user_uid)
    if transaction is None:
        raise NotFoundError(_NOT_FOUND_DETAIL)
    tags = list(await repo.list_tags_for_transaction_uid(transaction.transaction_uid))
    return success(data=_to_response(transaction, tags))


@router.patch(
    "/{transaction_uid}",
    response_model=ApiResponse[TransactionResponse],
    summary="更新交易",
)
async def update_transaction(
    transaction_uid: UUID,
    payload: TransactionUpdateRequest,
    db: DbSession,
    current_user: CurrentUser,
) -> ApiResponse[TransactionResponse]:
    repo = TransactionRepository(db)
    transaction = await repo.find_by_transaction_uid(transaction_uid, current_user.user_uid)
    if transaction is None:
        raise NotFoundError(_NOT_FOUND_DETAIL)
    if payload.account_uid is not None:
        await _ensure_account_owned(db, payload.account_uid, current_user.user_uid)
    if payload.category_uid is not None:
        await _ensure_category_owned(db, payload.category_uid, current_user.user_uid)
    transaction, tags = await repo.update_fields(
        transaction,
        account_uid=payload.account_uid,
        category_uid=payload.category_uid,
        transaction_date=payload.transaction_date,
        description=payload.description,
        amount=payload.amount,
        transaction_type=payload.transaction_type,
        payment_method=payload.payment_method,
        tag_names=payload.tags,
        updated_by=current_user.user_uid,
    )
    return success(data=_to_response(transaction, list(tags)))


@router.delete(
    "/{transaction_uid}",
    response_model=ApiResponse[None],
    summary="刪除交易（軟刪）",
)
async def delete_transaction(
    transaction_uid: UUID, db: DbSession, current_user: CurrentUser
) -> ApiResponse[None]:
    repo = TransactionRepository(db)
    transaction = await repo.find_by_transaction_uid(transaction_uid, current_user.user_uid)
    if transaction is None:
        raise NotFoundError(_NOT_FOUND_DETAIL)
    await repo.soft_delete(transaction, current_user.user_uid)
    return success(data=None)
