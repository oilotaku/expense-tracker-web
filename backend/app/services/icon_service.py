"""自訂圖示的商業規則：去重、配額、帳戶 / 分類引用驗證（→ ADR-0006）。"""

import asyncio
import hashlib
from typing import Final
from uuid import UUID

from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool

from app.core.exceptions import AppError, ConflictError
from app.models.user_icon import UserIcon
from app.repositories.user_icon_repository import CUSTOM_ICON_PREFIX, UserIconRepository
from app.services.icon_image import process_icon

ICON_QUOTA: Final[int] = 50

# 影像處理吃 CPU 與記憶體，Pi 上同時只處理一張（ADR-0006 §3 step 8）
_PROCESS_LOCK = asyncio.Semaphore(1)


async def render_icon(raw: bytes, *, remove_white_background: bool) -> bytes:
    async with _PROCESS_LOCK:
        return await run_in_threadpool(
            process_icon, raw, remove_white_background=remove_white_background
        )


async def save_icon(db: AsyncSession, user_uid: UUID, png: bytes) -> tuple[UserIcon, bool]:
    """存處理後的 PNG。回傳（圖示, 是否新增）；同一張圖已存在時回既有那張、不佔配額。"""
    repo = UserIconRepository(db)
    digest = hashlib.sha256(png).hexdigest()
    existing = await repo.find_active_by_hash(user_uid, digest)
    if existing is not None:
        return existing, False
    if await repo.count_active(user_uid) >= ICON_QUOTA:
        raise ConflictError(f"已達 {ICON_QUOTA} 張上限，請先刪除不用的圖示")
    try:
        async with db.begin_nested():
            icon = await repo.create(user_uid, png, digest)
    except IntegrityError:
        # 同一張圖併發上傳：唯一索引擋下後改回既有那張
        existing = await repo.find_active_by_hash(user_uid, digest)
        if existing is None:
            raise
        return existing, False
    return icon, True


async def ensure_icon_usable(db: AsyncSession, user_uid: UUID, icon: str | None) -> None:
    """帳戶 / 分類寫入 icon 前呼叫：`custom:` 必須是本人未刪除的圖示；內建 key 不檢查。"""
    if icon is None or not icon.startswith(CUSTOM_ICON_PREFIX):
        return
    try:
        user_icon_uid = UUID(icon.removeprefix(CUSTOM_ICON_PREFIX))
    except ValueError as e:
        raise AppError("自訂圖示不存在", status_code=422, response_code=422) from e
    if await UserIconRepository(db).find_active(user_uid, user_icon_uid) is None:
        raise AppError("自訂圖示不存在", status_code=422, response_code=422)
