import logging
import secrets
from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AppError, NotFoundError
from app.core.security import hash_password_async
from app.models.user import User
from app.repositories.admin_repository import AdminRepository
from app.repositories.user_repository import UserRepository
from app.schemas.admin import AdminResetPasswordResponse, AdminUserListItem, AdminUserListResponse

logger = logging.getLogger(__name__)

_USER_NOT_FOUND_DETAIL = "使用者不存在"
_CANNOT_DELETE_SELF_DETAIL = "不能刪除自己的管理員帳號"
# 隨機臨時密碼：token_urlsafe 產生的 base64url 字元集足夠通過 RegisterRequest 的密碼規則
# （min_length=8），不特意排除易混淆字元——反正只出現一次、複製貼上給使用者，不用手key。
_TEMP_PASSWORD_BYTES = 12


def _to_list_item(
    user: User,
    account_counts: dict[UUID, int],
    transaction_counts: dict[UUID, int],
    last_logins: dict[UUID, datetime | None],
) -> AdminUserListItem:
    return AdminUserListItem(
        user_uid=user.user_uid,
        email=user.email,
        created_at=user.created_at,
        account_count=account_counts.get(user.user_uid, 0),
        transaction_count=transaction_counts.get(user.user_uid, 0),
        last_login_at=last_logins.get(user.user_uid),
    )


class AdminService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.admin_repo = AdminRepository(db)
        self.user_repo = UserRepository(db)

    async def list_users(self, *, limit: int, offset: int) -> AdminUserListResponse:
        users, total = await self.admin_repo.list_users(limit=limit, offset=offset)
        user_uids = [u.user_uid for u in users]
        account_counts = await self.admin_repo.count_accounts_by_user_uids(user_uids)
        transaction_counts = await self.admin_repo.count_transactions_by_user_uids(user_uids)
        last_logins = await self.admin_repo.find_last_login_by_user_uids(user_uids)
        items = [_to_list_item(u, account_counts, transaction_counts, last_logins) for u in users]
        return AdminUserListResponse(items=items, total=total)

    async def delete_user(self, target_user_uid: UUID, admin_user: User) -> None:
        if target_user_uid == admin_user.user_uid:
            raise AppError(_CANNOT_DELETE_SELF_DETAIL, response_code=409, status_code=409)
        deleted = await self.admin_repo.soft_delete_user(target_user_uid, admin_user.user_uid)
        if not deleted:
            raise NotFoundError(_USER_NOT_FOUND_DETAIL)
        logger.warning(
            "admin deleted user",
            extra={"admin_email": admin_user.email, "target_user_uid": str(target_user_uid)},
        )

    async def reset_password(
        self, target_user_uid: UUID, admin_user: User
    ) -> AdminResetPasswordResponse:
        target = await self.user_repo.find_by_user_uid(target_user_uid)
        if target is None:
            raise NotFoundError(_USER_NOT_FOUND_DETAIL)
        credential = await self.user_repo.find_credential_by_user_uid(target_user_uid)
        if credential is None:
            raise NotFoundError(_USER_NOT_FOUND_DETAIL)
        temporary_password = secrets.token_urlsafe(_TEMP_PASSWORD_BYTES)
        password_hash = await hash_password_async(temporary_password)
        await self.user_repo.update_password(
            credential, password_hash, datetime.now(UTC), must_change_password=True
        )
        # 明文密碼不進 log（→ CORE-111/CORE-135），只記「發生過這件事」。
        logger.warning(
            "admin reset user password",
            extra={"admin_email": admin_user.email, "target_user_uid": str(target_user_uid)},
        )
        return AdminResetPasswordResponse(temporary_password=temporary_password)
