from datetime import UTC, datetime, timedelta
from uuid import UUID

from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AppError, ConflictError
from app.core.security import create_access_token, hash_password_async, verify_password_async
from app.models.user import UserCredential
from app.repositories.user_repository import UserRepository
from app.schemas.auth import UserResponse

_LOGIN_FAILED_DETAIL = "帳號或密碼錯誤"
# 「PIN 錯誤」同時用於：PIN 本身錯誤、user_uid 不存在、該使用者未設定 PIN 三種情境，
# 避免帳號列舉（design-spec §12.2、tasks-v1.1.0.md 頂部盲點掃描備註）。
_PIN_FAILED_DETAIL = "PIN 錯誤"
_PIN_LOCKED_DETAIL = "PIN 已鎖定，請改用密碼登入或稍後再試"
_PIN_ALREADY_SET_DETAIL = "PIN 已設定，請使用變更 PIN"
_PIN_LOCK_THRESHOLD = 5
_PIN_LOCK_MINUTES = 15


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

    async def set_pin(self, user_uid: UUID, pin: str, password: str) -> None:
        credential = await self.repo.find_credential_by_user_uid(user_uid)
        if credential is None or not await verify_password_async(
            password, credential.password_hash
        ):
            raise AppError(_LOGIN_FAILED_DETAIL, response_code=401, status_code=401)
        if credential.pin_hash is not None:
            raise ConflictError(_PIN_ALREADY_SET_DETAIL)
        pin_hash = await hash_password_async(pin)
        await self.repo.set_pin(credential, pin_hash, datetime.now(UTC))

    async def change_pin(self, user_uid: UUID, current_pin: str, new_pin: str) -> None:
        credential = await self.repo.find_credential_by_user_uid(user_uid)
        if credential is None:
            raise AppError(_PIN_FAILED_DETAIL, response_code=401, status_code=401)
        await self._verify_pin_or_raise(credential, current_pin)
        new_hash = await hash_password_async(new_pin)
        await self.repo.set_pin(credential, new_hash, datetime.now(UTC))

    async def disable_pin(self, user_uid: UUID, password: str) -> None:
        credential = await self.repo.find_credential_by_user_uid(user_uid)
        if credential is None or not await verify_password_async(
            password, credential.password_hash
        ):
            raise AppError(_LOGIN_FAILED_DETAIL, response_code=401, status_code=401)
        await self.repo.clear_pin(credential)

    async def login_with_pin(self, user_uid: UUID, pin: str) -> tuple[UserResponse, str]:
        user = await self.repo.find_by_user_uid(user_uid)
        if user is None:
            raise AppError(_PIN_FAILED_DETAIL, response_code=401, status_code=401)
        credential = await self.repo.find_credential_by_user_uid(user.user_uid)
        if credential is None or credential.pin_hash is None:
            raise AppError(_PIN_FAILED_DETAIL, response_code=401, status_code=401)
        await self._verify_pin_or_raise(credential, pin)
        token = create_access_token(str(user.user_uid))
        return UserResponse.model_validate(user), token

    async def _verify_pin_or_raise(self, credential: UserCredential, pin: str) -> None:
        """鎖定機制：連續 5 次失敗鎖 15 分鐘，鎖定期間一律 429 且不比對 PIN 本身；成功歸零。"""
        now = datetime.now(UTC)
        if credential.pin_locked_until is not None and credential.pin_locked_until > now:
            raise AppError(_PIN_LOCKED_DETAIL, response_code=429, status_code=429)
        if credential.pin_hash is None or not await verify_password_async(pin, credential.pin_hash):
            attempts = credential.pin_failed_attempts + 1
            locked_until = (
                now + timedelta(minutes=_PIN_LOCK_MINUTES)
                if attempts >= _PIN_LOCK_THRESHOLD
                else None
            )
            await self.repo.record_pin_failure(credential, attempts, locked_until)
            # 這裡刻意先 commit 再拋業務錯誤：get_db 對「未預期例外」一律 rollback，
            # 若不在此先落地，剛才記錄的失敗次數會被那個通用 rollback 一併回捲，
            # 導致鎖定機制從未真正持久化（task-030）。
            await self.db.commit()
            raise AppError(_PIN_FAILED_DETAIL, response_code=401, status_code=401)
        await self.repo.reset_pin_failures(credential)
