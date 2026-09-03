from datetime import datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User, UserCredential


class UserRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def find_by_email(self, email: str) -> User | None:
        stmt = select(User).where(User.email == email, User.is_deleted.is_(False))
        return (await self.db.execute(stmt)).scalar_one_or_none()

    async def find_by_user_uid(self, user_uid: UUID) -> User | None:
        stmt = select(User).where(User.user_uid == user_uid, User.is_deleted.is_(False))
        return (await self.db.execute(stmt)).scalar_one_or_none()

    async def find_credential_by_user_uid(self, user_uid: UUID) -> UserCredential | None:
        stmt = select(UserCredential).where(
            UserCredential.user_uid == user_uid, UserCredential.is_deleted.is_(False)
        )
        return (await self.db.execute(stmt)).scalar_one_or_none()

    async def create_user(self, email: str, password_hash: str, now: datetime) -> User:
        user = User(email=email)
        self.db.add(user)
        await self.db.flush()
        credential = UserCredential(
            user_uid=user.user_uid,
            password_hash=password_hash,
            password_updated_at=now,
        )
        self.db.add(credential)
        await self.db.flush()
        return user
