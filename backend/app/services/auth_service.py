from datetime import UTC, datetime

from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AppError, ConflictError
from app.core.security import create_access_token, hash_password_async, verify_password_async
from app.repositories.user_repository import UserRepository
from app.schemas.auth import UserResponse

_LOGIN_FAILED_DETAIL = "帳號或密碼錯誤"


class AuthService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.repo = UserRepository(db)

    async def register(self, email: str, password: str) -> UserResponse:
        if await self.repo.find_by_email(email) is not None:
            raise ConflictError("此 email 已被註冊")
        password_hash = await hash_password_async(password)
        try:
            user = await self.repo.create_user(email, password_hash, datetime.now(UTC))
        except IntegrityError as e:
            # 併發註冊同一 email 的最後防線；平時靠上面的 find_by_email 先擋
            raise ConflictError("此 email 已被註冊") from e
        return UserResponse.model_validate(user)

    async def login(self, email: str, password: str) -> tuple[UserResponse, str]:
        user = await self.repo.find_by_email(email)
        if user is None:
            raise AppError(_LOGIN_FAILED_DETAIL, response_code=401, status_code=401)
        credential = await self.repo.find_credential_by_user_uid(user.user_uid)
        if credential is None or not await verify_password_async(
            password, credential.password_hash
        ):
            raise AppError(_LOGIN_FAILED_DETAIL, response_code=401, status_code=401)
        token = create_access_token(str(user.user_uid))
        return UserResponse.model_validate(user), token
