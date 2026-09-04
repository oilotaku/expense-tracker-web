from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.category import Category


class CategoryRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def list_by_user_uid(
        self, user_uid: UUID, *, limit: int = 20, offset: int = 0
    ) -> tuple[list[Category], int]:
        base = select(Category).where(Category.user_uid == user_uid, Category.is_deleted.is_(False))
        total = (
            await self.db.execute(select(func.count()).select_from(base.subquery()))
        ).scalar_one()
        stmt = (
            base.order_by(Category.created_at.desc(), Category.uid.desc())
            .limit(limit)
            .offset(offset)
        )
        items = list((await self.db.execute(stmt)).scalars().all())
        return items, total

    async def find_by_category_uid(self, user_uid: UUID, category_uid: UUID) -> Category | None:
        stmt = select(Category).where(
            Category.category_uid == category_uid,
            Category.user_uid == user_uid,
            Category.is_deleted.is_(False),
        )
        return (await self.db.execute(stmt)).scalar_one_or_none()

    async def create(
        self, user_uid: UUID, name: str, color: str | None = None, icon: str | None = None
    ) -> Category:
        # color/icon 為 None 時不寫入該欄位，交由 DB server_default 兜底（→ Category model 註解）；
        # 一般建立流程經 CategoryCreateRequest 一律帶入明確值。
        category = Category(user_uid=user_uid, name=name)
        if color is not None:
            category.color = color
        if icon is not None:
            category.icon = icon
        self.db.add(category)
        await self.db.flush()
        return category

    async def update_fields(
        self,
        category: Category,
        *,
        name: str | None,
        color: str | None,
        icon: str | None,
    ) -> Category:
        if name is not None:
            category.name = name
        if color is not None:
            category.color = color
        if icon is not None:
            category.icon = icon
        await self.db.flush()
        return category

    async def soft_delete(self, category: Category) -> None:
        category.is_deleted = True
        await self.db.flush()
