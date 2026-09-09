from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_db
from app.core.exceptions import NotFoundError
from app.core.response import success
from app.models.user import User
from app.repositories.account_repository import AccountRepository
from app.schemas.account import (
    AccountCreateRequest,
    AccountListResponse,
    AccountResponse,
    AccountUpdateRequest,
)
from app.schemas.response import ApiResponse

router = APIRouter(prefix="/accounts")

DbSession = Annotated[AsyncSession, Depends(get_db)]
CurrentUser = Annotated[User, Depends(get_current_user)]


@router.post(
    "",
    response_model=ApiResponse[AccountResponse],
    status_code=201,
    summary="建立帳戶",
)
async def create_account(
    payload: AccountCreateRequest, db: DbSession, current_user: CurrentUser
) -> ApiResponse[AccountResponse]:
    account = await AccountRepository(db).create(
        user_uid=current_user.user_uid,
        name=payload.name,
        balance=payload.balance,
        created_by=current_user.user_uid,
        color=payload.color,
        icon=payload.icon,
        currency=payload.currency.value,
    )
    return success(data=AccountResponse.model_validate(account), response_code=201)


@router.get(
    "",
    response_model=ApiResponse[AccountListResponse],
    summary="帳戶清單",
)
async def list_accounts(
    db: DbSession, current_user: CurrentUser
) -> ApiResponse[AccountListResponse]:
    accounts = await AccountRepository(db).list_by_user_uid(current_user.user_uid)
    items = [AccountResponse.model_validate(a) for a in accounts]
    return success(data=AccountListResponse(items=items, total=len(items)))


@router.get(
    "/{account_uid}",
    response_model=ApiResponse[AccountResponse],
    summary="單一帳戶",
)
async def get_account(
    account_uid: UUID, db: DbSession, current_user: CurrentUser
) -> ApiResponse[AccountResponse]:
    account = await AccountRepository(db).find_by_account_uid(account_uid, current_user.user_uid)
    if account is None:
        raise NotFoundError("帳戶不存在")
    return success(data=AccountResponse.model_validate(account))


@router.patch(
    "/{account_uid}",
    response_model=ApiResponse[AccountResponse],
    summary="更新帳戶",
)
async def update_account(
    account_uid: UUID,
    payload: AccountUpdateRequest,
    db: DbSession,
    current_user: CurrentUser,
) -> ApiResponse[AccountResponse]:
    repo = AccountRepository(db)
    account = await repo.find_by_account_uid(account_uid, current_user.user_uid)
    if account is None:
        raise NotFoundError("帳戶不存在")
    account = await repo.update_fields(
        account,
        name=payload.name,
        balance=payload.balance,
        color=payload.color,
        icon=payload.icon,
        updated_by=current_user.user_uid,
    )
    return success(data=AccountResponse.model_validate(account))


@router.delete(
    "/{account_uid}",
    response_model=ApiResponse[None],
    summary="刪除帳戶（軟刪）",
)
async def delete_account(
    account_uid: UUID, db: DbSession, current_user: CurrentUser
) -> ApiResponse[None]:
    deleted = await AccountRepository(db).soft_delete(account_uid, current_user.user_uid)
    if not deleted:
        raise NotFoundError("帳戶不存在")
    return success(data=None)
