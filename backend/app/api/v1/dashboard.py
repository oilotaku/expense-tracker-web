from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import PricingServiceDep, get_current_user, get_db
from app.core.response import success
from app.models.user import User
from app.schemas.dashboard import DashboardSummaryFilter, DashboardSummaryResponse
from app.schemas.response import ApiResponse
from app.services.dashboard_service import DashboardService

router = APIRouter(prefix="/dashboard")

DbSession = Annotated[AsyncSession, Depends(get_db)]
CurrentUser = Annotated[User, Depends(get_current_user)]


@router.get(
    "/summary",
    response_model=ApiResponse[DashboardSummaryResponse],
    summary="Dashboard 期間彙總（收入 / 支出 / 結餘 / 預算結餘）",
)
async def get_dashboard_summary(
    filters: Annotated[DashboardSummaryFilter, Query()],
    db: DbSession,
    current_user: CurrentUser,
    pricing_service: PricingServiceDep,
) -> ApiResponse[DashboardSummaryResponse]:
    result = await DashboardService(db, pricing_service).get_summary(
        current_user.user_uid, filters.period, filters.date_from, filters.date_to
    )
    return success(result)
