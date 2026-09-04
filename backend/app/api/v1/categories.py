"""分類 CRUD：所有查詢皆以 `Depends(get_current_user)` 限定當前使用者（→ BE-023）。"""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_db
from app.core.exceptions import ConflictError, NotFoundError
from app.core.response import success
from app.models.user import User
from app.repositories.category_repository import CategoryRepository
from app.schemas.category import (
    CategoryCreateRequest,
    CategoryListResponse,
    CategoryResponse,
    CategoryUpdateRequest,
)
from app.schemas.response import ApiResponse

router = APIRouter(prefix="/categories")

DbSession = Annotated[AsyncSession, Depends(get_db)]
CurrentUser = Annotated[User, Depends(get_current_user)]

_DUPLICATE_NAME_DETAIL = "已存在同名分類"
_NOT_FOUND_DETAIL = "分類不存在"


@router.post(
    "",
    response_model=ApiResponse[CategoryResponse],
    status_code=201,
    summary="新增分類",
)
async def create_category(
    payload: CategoryCreateRequest, db: DbSession, current_user: CurrentUser
) -> ApiResponse[CategoryResponse]:
    repo = CategoryRepository(db)
    try:
        category = await repo.create(
            current_user.user_uid, payload.name, payload.color, payload.icon
        )
    except IntegrityError as e:
        raise ConflictError(_DUPLICATE_NAME_DETAIL) from e
    return success(CategoryResponse.model_validate(category), response_code=201)


@router.get(
    "",
    response_model=ApiResponse[CategoryListResponse],
    summary="分類清單",
)
async def list_categories(
    db: DbSession,
    current_user: CurrentUser,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> ApiResponse[CategoryListResponse]:
    repo = CategoryRepository(db)
    categories, total = await repo.list_by_user_uid(
        current_user.user_uid, limit=limit, offset=offset
    )
    items = [CategoryResponse.model_validate(c) for c in categories]
    return success(CategoryListResponse(items=items, total=total))


@router.patch(
    "/{category_uid}",
    response_model=ApiResponse[CategoryResponse],
    summary="更新分類（重新命名 / 改色 / 改圖示）",
)
async def update_category(
    category_uid: UUID,
    payload: CategoryUpdateRequest,
    db: DbSession,
    current_user: CurrentUser,
) -> ApiResponse[CategoryResponse]:
    repo = CategoryRepository(db)
    category = await repo.find_by_category_uid(current_user.user_uid, category_uid)
    if category is None:
        raise NotFoundError(_NOT_FOUND_DETAIL)
    try:
        category = await repo.update_fields(
            category, name=payload.name, color=payload.color, icon=payload.icon
        )
    except IntegrityError as e:
        raise ConflictError(_DUPLICATE_NAME_DETAIL) from e
    return success(CategoryResponse.model_validate(category))


@router.delete(
    "/{category_uid}",
    response_model=ApiResponse[None],
    summary="刪除分類",
)
async def delete_category(
    category_uid: UUID, db: DbSession, current_user: CurrentUser
) -> ApiResponse[None]:
    repo = CategoryRepository(db)
    category = await repo.find_by_category_uid(current_user.user_uid, category_uid)
    if category is None:
        raise NotFoundError(_NOT_FOUND_DETAIL)
    await repo.soft_delete(category)
    return success(None)
