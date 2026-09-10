"""內部排程觸發：production 由 host 端 cron / systemd timer 呼叫（不經 CI，→ CICD-086 排程慣例），
不是給前端呼叫的一般 API，因此不走 `get_current_user`（使用者 JWT），改用獨立 secret 驗證。
"""

import secrets
from typing import Annotated

from fastapi import APIRouter, Depends, Header
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.core.config import get_settings
from app.core.exceptions import AppError
from app.core.response import success
from app.schemas.response import ApiResponse
from app.services.recurring_service import RecurringService

router = APIRouter(prefix="/internal")

DbSession = Annotated[AsyncSession, Depends(get_db)]

_UNAUTHORIZED_DETAIL = "內部觸發密鑰無效"


def verify_internal_secret(x_internal_secret: Annotated[str | None, Header()] = None) -> None:
    settings = get_settings()
    if x_internal_secret is None or not secrets.compare_digest(
        x_internal_secret, settings.INTERNAL_TRIGGER_SECRET
    ):
        raise AppError(_UNAUTHORIZED_DETAIL, response_code=401, status_code=401)


@router.post(
    "/recurring/run",
    response_model=ApiResponse[dict[str, int]],
    summary="觸發到期的週期性交易產生（含負債定期還款）",
    dependencies=[Depends(verify_internal_secret)],
)
async def run_recurring(db: DbSession) -> ApiResponse[dict[str, int]]:
    # get_db() 在 endpoint 正常回傳後自動 commit（見 app/api/deps.py），這裡不重複 commit
    generated = await RecurringService(db).generate_due_transactions()
    return success(data={"generated": len(generated)})
