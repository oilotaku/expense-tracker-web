from dataclasses import dataclass
from uuid import UUID

from sqlalchemy import Select, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import defer

from app.models.account import Account
from app.models.category import Category
from app.models.user_icon import UserIcon

CUSTOM_ICON_PREFIX = "custom:"
DEFAULT_ICON = "other"  # 與 accounts / categories.icon 的 server_default 相同


def icon_key(user_icon_uid: UUID) -> str:
    return f"{CUSTOM_ICON_PREFIX}{user_icon_uid}"


@dataclass(frozen=True)
class IconUsages:
    accounts: list[tuple[UUID, str]]
    categories: list[tuple[UUID, str]]


class UserIconRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    def _active(self, user_uid: UUID) -> Select[tuple[UserIcon]]:
        return select(UserIcon).where(UserIcon.user_uid == user_uid, UserIcon.is_deleted.is_(False))

    async def count_active(self, user_uid: UUID) -> int:
        stmt = select(func.count()).select_from(self._active(user_uid).subquery())
        return (await self.db.execute(stmt)).scalar_one()

    async def list_active(self, user_uid: UUID) -> list[UserIcon]:
        # 清單不需要圖片內容，defer 避免把每張 PNG 都撈出來
        stmt = (
            self._active(user_uid)
            .options(defer(UserIcon.image_png))
            .order_by(UserIcon.created_at.desc(), UserIcon.uid.desc())
        )
        return list((await self.db.execute(stmt)).scalars().all())

    async def find_active(self, user_uid: UUID, user_icon_uid: UUID) -> UserIcon | None:
        stmt = self._active(user_uid).where(UserIcon.user_icon_uid == user_icon_uid)
        return (await self.db.execute(stmt)).scalar_one_or_none()

    async def find_active_by_hash(self, user_uid: UUID, content_sha256: str) -> UserIcon | None:
        stmt = self._active(user_uid).where(UserIcon.content_sha256 == content_sha256)
        return (await self.db.execute(stmt)).scalar_one_or_none()

    async def create(self, user_uid: UUID, image_png: bytes, content_sha256: str) -> UserIcon:
        icon = UserIcon(
            user_uid=user_uid,
            image_png=image_png,
            content_sha256=content_sha256,
            byte_size=len(image_png),
            created_by=user_uid,
            updated_by=user_uid,
        )
        self.db.add(icon)
        await self.db.flush()
        return icon

    async def usage_counts(self, user_uid: UUID) -> dict[str, int]:
        """`custom:<uid>` → 使用中的帳戶 + 分類數（只算未刪除的）。"""
        counts: dict[str, int] = {}
        for model in (Account, Category):
            stmt = (
                select(model.icon, func.count())
                .where(
                    model.user_uid == user_uid,
                    model.is_deleted.is_(False),
                    model.icon.startswith(CUSTOM_ICON_PREFIX),
                )
                .group_by(model.icon)
            )
            for key, n in (await self.db.execute(stmt)).all():
                counts[key] = counts.get(key, 0) + n
        return counts

    async def usages(self, user_uid: UUID, key: str) -> IconUsages:
        accounts = (
            await self.db.execute(
                select(Account.account_uid, Account.name)
                .where(
                    Account.user_uid == user_uid,
                    Account.is_deleted.is_(False),
                    Account.icon == key,
                )
                .order_by(Account.name)
            )
        ).all()
        categories = (
            await self.db.execute(
                select(Category.category_uid, Category.name)
                .where(
                    Category.user_uid == user_uid,
                    Category.is_deleted.is_(False),
                    Category.icon == key,
                )
                .order_by(Category.name)
            )
        ).all()
        return IconUsages(
            accounts=[(uid, name) for uid, name in accounts],
            categories=[(uid, name) for uid, name in categories],
        )

    async def soft_delete_and_reset_usages(self, icon: UserIcon) -> tuple[int, int]:
        """同一個交易內：引用者改回預設圖示 → 圖示軟刪除（→ ADR-0006 §2）。

        回傳（重設的帳戶數, 重設的分類數），只算未刪除的帳戶 / 分類。
        """
        key = icon_key(icon.user_icon_uid)
        reset: list[int] = []
        for model in (Account, Category):
            result = await self.db.execute(
                update(model)
                .where(
                    model.user_uid == icon.user_uid,
                    model.is_deleted.is_(False),
                    model.icon == key,
                )
                .values(icon=DEFAULT_ICON, updated_by=icon.user_uid)
                .execution_options(synchronize_session=False)
            )
            reset.append(result.rowcount or 0)  # type: ignore[attr-defined]
        icon.is_deleted = True
        icon.updated_by = icon.user_uid
        await self.db.flush()
        return reset[0], reset[1]
