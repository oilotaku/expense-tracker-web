"""使用者自訂圖示（→ ADR-0006）：預覽、上傳、清單、取圖、使用情況、刪除。

全部限定當前使用者；別人的圖示一律 404（不回 403，避免探測 uid 是否存在）。
"""

from typing import Annotated, Final
from uuid import UUID

from fastapi import APIRouter, Depends, Request, Response
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.datastructures import UploadFile

from app.api.deps import get_current_user, get_db
from app.core.cache import get_redis
from app.core.exceptions import AppError, NotFoundError
from app.core.rate_limit import enforce_rate_limit
from app.core.response import success
from app.models.user import User
from app.models.user_icon import UserIcon
from app.repositories.user_icon_repository import UserIconRepository, icon_key
from app.schemas.icon import (
    IconDeleteResponse,
    IconListResponse,
    IconQuota,
    IconResponse,
    IconUsageAccount,
    IconUsageCategory,
    IconUsagesResponse,
)
from app.schemas.response import ApiResponse
from app.services.icon_image import MAX_UPLOAD_BYTES, IconTooLargeError
from app.services.icon_service import ICON_QUOTA, render_icon, save_icon

router = APIRouter(prefix="/icons")

DbSession = Annotated[AsyncSession, Depends(get_db)]
CurrentUser = Annotated[User, Depends(get_current_user)]

UPLOAD_RATE_LIMIT: Final[int] = 20
PREVIEW_RATE_LIMIT: Final[int] = 60
_RATE_LIMIT_WINDOW_SECONDS: Final[int] = 3600
_NOT_FOUND_DETAIL: Final[str] = "圖示不存在"
_TRUE_VALUES: Final[frozenset[str]] = frozenset({"1", "true", "on", "yes"})

# 內容建立後不可變（換圖 = 新 uid），可以放心長快取
_IMAGE_HEADERS: Final[dict[str, str]] = {
    "Cache-Control": "private, max-age=31536000, immutable",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'",
    "Content-Disposition": "inline",
}

_MULTIPART_BODY: Final[dict[str, object]] = {
    "requestBody": {
        "required": True,
        "content": {
            "multipart/form-data": {
                "schema": {
                    "type": "object",
                    "required": ["file"],
                    "properties": {
                        "file": {
                            "type": "string",
                            "format": "binary",
                            "description": "PNG / JPEG / WebP / GIF，上限 10 MB、5,000 萬像素",
                        },
                        "remove_white_background": {
                            "type": "boolean",
                            "default": False,
                            "description": "把與圖片邊緣相連的近白色改成透明",
                        },
                    },
                }
            }
        },
    }
}
_UPLOAD_ERRORS: Final[dict[int | str, dict[str, object]]] = {
    413: {"description": "原檔超過 10 MB"},
    422: {"description": "格式不支援、超過 5,000 萬像素、缺少檔案或去背後沒有內容"},
    429: {"description": "超過限流"},
}


async def enforce_icon_upload_rate_limit(
    current_user: CurrentUser, redis: Annotated[Redis | None, Depends(get_redis)]
) -> None:
    await enforce_rate_limit(
        redis,
        scope="icon_upload",
        subject=str(current_user.user_uid),
        limit=UPLOAD_RATE_LIMIT,
        window_s=_RATE_LIMIT_WINDOW_SECONDS,
    )


async def enforce_icon_preview_rate_limit(
    current_user: CurrentUser, redis: Annotated[Redis | None, Depends(get_redis)]
) -> None:
    await enforce_rate_limit(
        redis,
        scope="icon_preview",
        subject=str(current_user.user_uid),
        limit=PREVIEW_RATE_LIMIT,
        window_s=_RATE_LIMIT_WINDOW_SECONDS,
    )


async def _read_upload(request: Request) -> tuple[bytes, bool]:
    """先看 Content-Length 再解析 multipart，超過上限的請求不必讀完整個 body。"""
    length = request.headers.get("content-length")
    if length is not None and length.isdigit() and int(length) > MAX_UPLOAD_BYTES:
        raise IconTooLargeError()
    async with request.form(max_files=1, max_fields=2) as form:
        upload = form.get("file")
        if not isinstance(upload, UploadFile):
            raise AppError("缺少圖片檔案", status_code=422, response_code=422)
        raw = await upload.read(MAX_UPLOAD_BYTES + 1)
        flag = form.get("remove_white_background")
    if len(raw) > MAX_UPLOAD_BYTES:
        raise IconTooLargeError()
    remove_white_background = isinstance(flag, str) and flag.strip().lower() in _TRUE_VALUES
    return raw, remove_white_background


def _to_response(icon: UserIcon, usage_count: int) -> IconResponse:
    return IconResponse(
        user_icon_uid=icon.user_icon_uid,
        icon_key=icon_key(icon.user_icon_uid),
        url=f"/api/v1/icons/{icon.user_icon_uid}",
        content_sha256=icon.content_sha256,
        byte_size=icon.byte_size,
        usage_count=usage_count,
        created_at=icon.created_at,
    )


@router.post(
    "/preview",
    response_class=Response,
    summary="預覽自訂圖示（不儲存）",
    description="跑完整處理管線並直接回處理後的 PNG；與正式上傳同輸入同參數時位元組完全相同。",
    openapi_extra=_MULTIPART_BODY,
    responses={200: {"content": {"image/png": {}}}, **_UPLOAD_ERRORS},
    dependencies=[Depends(enforce_icon_preview_rate_limit)],
)
async def preview_icon(request: Request, current_user: CurrentUser) -> Response:
    raw, remove_white_background = await _read_upload(request)
    png = await render_icon(raw, remove_white_background=remove_white_background)
    return Response(
        content=png,
        media_type="image/png",
        headers={**_IMAGE_HEADERS, "Cache-Control": "no-store"},
    )


@router.post(
    "",
    response_model=ApiResponse[IconResponse],
    status_code=201,
    summary="上傳自訂圖示",
    description="新增回 201；處理後與既有圖示完全相同時回既有那張（200），不佔配額。",
    openapi_extra=_MULTIPART_BODY,
    responses={
        200: {"description": "同一張圖已存在，回既有圖示"},
        409: {"description": f"已達 {ICON_QUOTA} 張上限"},
        **_UPLOAD_ERRORS,
    },
    dependencies=[Depends(enforce_icon_upload_rate_limit)],
)
async def upload_icon(
    request: Request, response: Response, db: DbSession, current_user: CurrentUser
) -> ApiResponse[IconResponse]:
    raw, remove_white_background = await _read_upload(request)
    png = await render_icon(raw, remove_white_background=remove_white_background)
    icon, created = await save_icon(db, current_user.user_uid, png)
    usage = 0
    if not created:
        usage = (await UserIconRepository(db).usage_counts(current_user.user_uid)).get(
            icon_key(icon.user_icon_uid), 0
        )
    status = 201 if created else 200
    response.status_code = status
    return success(_to_response(icon, usage), response_code=status)


@router.get("", response_model=ApiResponse[IconListResponse], summary="自訂圖示清單")
async def list_icons(db: DbSession, current_user: CurrentUser) -> ApiResponse[IconListResponse]:
    repo = UserIconRepository(db)
    icons = await repo.list_active(current_user.user_uid)
    counts = await repo.usage_counts(current_user.user_uid)
    items = [_to_response(i, counts.get(icon_key(i.user_icon_uid), 0)) for i in icons]
    return success(
        IconListResponse(items=items, quota=IconQuota(used=len(items), limit=ICON_QUOTA))
    )


@router.get(
    "/{user_icon_uid}",
    response_class=Response,
    summary="取得自訂圖示圖片",
    responses={200: {"content": {"image/png": {}}}, 304: {"description": "ETag 相同"}, 404: {}},
)
async def get_icon_image(
    user_icon_uid: UUID, request: Request, db: DbSession, current_user: CurrentUser
) -> Response:
    icon = await UserIconRepository(db).find_active(current_user.user_uid, user_icon_uid)
    if icon is None:
        raise NotFoundError(_NOT_FOUND_DETAIL)
    etag = f'"{icon.content_sha256}"'
    headers = {**_IMAGE_HEADERS, "ETag": etag}
    if request.headers.get("if-none-match") == etag:
        return Response(status_code=304, headers=headers)
    return Response(content=icon.image_png, media_type="image/png", headers=headers)


@router.get(
    "/{user_icon_uid}/usages",
    response_model=ApiResponse[IconUsagesResponse],
    summary="使用這張圖示的帳戶 / 分類",
)
async def get_icon_usages(
    user_icon_uid: UUID, db: DbSession, current_user: CurrentUser
) -> ApiResponse[IconUsagesResponse]:
    repo = UserIconRepository(db)
    icon = await repo.find_active(current_user.user_uid, user_icon_uid)
    if icon is None:
        raise NotFoundError(_NOT_FOUND_DETAIL)
    usages = await repo.usages(current_user.user_uid, icon_key(user_icon_uid))
    return success(
        IconUsagesResponse(
            accounts=[IconUsageAccount(account_uid=u, name=n) for u, n in usages.accounts],
            categories=[IconUsageCategory(category_uid=u, name=n) for u, n in usages.categories],
        )
    )


@router.delete(
    "/{user_icon_uid}",
    response_model=ApiResponse[IconDeleteResponse],
    summary="刪除自訂圖示（軟刪）",
    description="使用中的帳戶 / 分類在同一個交易內改回預設圖示 `other`。",
)
async def delete_icon(
    user_icon_uid: UUID, db: DbSession, current_user: CurrentUser
) -> ApiResponse[IconDeleteResponse]:
    repo = UserIconRepository(db)
    icon = await repo.find_active(current_user.user_uid, user_icon_uid)
    if icon is None:
        raise NotFoundError(_NOT_FOUND_DETAIL)
    reset_accounts, reset_categories = await repo.soft_delete_and_reset_usages(icon)
    return success(
        IconDeleteResponse(reset_accounts=reset_accounts, reset_categories=reset_categories)
    )
