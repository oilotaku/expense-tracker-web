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

    async def set_pin(self, credential: UserCredential, pin_hash: str, now: datetime) -> None:
        credential.pin_hash = pin_hash
        credential.pin_updated_at = now
        credential.pin_failed_attempts = 0
        credential.pin_locked_until = None
        await self.db.flush()

    async def clear_pin(self, credential: UserCredential) -> None:
        credential.pin_hash = None
        credential.pin_updated_at = None
        credential.pin_failed_attempts = 0
        credential.pin_locked_until = None
        await self.db.flush()

    async def record_pin_failure(
        self, credential: UserCredential, attempts: int, locked_until: datetime | None
    ) -> None:
        credential.pin_failed_attempts = attempts
        credential.pin_locked_until = locked_until
        await self.db.flush()

    async def reset_pin_failures(self, credential: UserCredential) -> None:
        credential.pin_failed_attempts = 0
        credential.pin_locked_until = None
        await self.db.flush()

    async def record_login(self, credential: UserCredential, now: datetime) -> None:
        credential.last_login_at = now
        await self.db.flush()

    async def update_password(
        self,
        credential: UserCredential,
        password_hash: str,
        now: datetime,
        *,
        must_change_password: bool,
    ) -> None:
        """自助改密碼（`must_change_password=False`）與後台管理員重設密碼
        （`must_change_password=True`）共用；後者額外標記下次登入強制改密碼。"""
        credential.password_hash = password_hash
        credential.password_updated_at = now
        credential.must_change_password = must_change_password
        await self.db.flush()
