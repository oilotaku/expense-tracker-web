from typing import Annotated

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.core.response import success
from app.schemas.response import ApiResponse

router = APIRouter()

DbSession = Annotated[AsyncSession, Depends(get_db)]


@router.get(
    "/health",
    response_model=ApiResponse[dict[str, str]],
    summary="健康檢查（db）",
)
async def health(response: Response, db: DbSession) -> ApiResponse[dict[str, str]]:
    checks: dict[str, str] = {}
    try:
        await db.execute(text("SELECT 1"))
        checks["db"] = "ok"
    except Exception:
        checks["db"] = "fail"
    if any(v != "ok" for v in checks.values()):
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    return success(data=checks)
