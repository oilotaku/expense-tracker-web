from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import PricingServiceDep, get_current_user, get_db
from app.core.response import success
from app.models.user import User
from app.schemas.dashboard import (
    CategoryBreakdownResponse,
    CurrencyRatesResponse,
    DashboardDateRangeFilter,
    DashboardSummaryFilter,
    DashboardSummaryResponse,
    DashboardTrendResponse,
)
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


@router.get(
    "/category-breakdown",
    response_model=ApiResponse[CategoryBreakdownResponse],
    summary="Dashboard 分類支出彙總（分類圓餅圖/長條圖）",
)
async def get_dashboard_category_breakdown(
    filters: Annotated[DashboardDateRangeFilter, Query()],
    db: DbSession,
    current_user: CurrentUser,
    pricing_service: PricingServiceDep,
) -> ApiResponse[CategoryBreakdownResponse]:
    result = await DashboardService(db, pricing_service).get_category_breakdown(
        current_user.user_uid, filters.date_from, filters.date_to
    )
    return success(result)


@router.get(
    "/trend",
    response_model=ApiResponse[DashboardTrendResponse],
    summary="Dashboard 收支趨勢彙總（趨勢線圖）",
)
async def get_dashboard_trend(
    filters: Annotated[DashboardDateRangeFilter, Query()],
    db: DbSession,
    current_user: CurrentUser,
    pricing_service: PricingServiceDep,
) -> ApiResponse[DashboardTrendResponse]:
    result = await DashboardService(db, pricing_service).get_trend(
        current_user.user_uid, filters.date_from, filters.date_to
    )
    return success(result)


@router.get(
    "/exchange-rates",
    response_model=ApiResponse[CurrencyRatesResponse],
    summary="取得固定 10 種支援幣別對 TWD 的即時匯率（供前端圖表換算外幣交易用）",
)
async def get_dashboard_exchange_rates(
    db: DbSession,
    current_user: CurrentUser,
    pricing_service: PricingServiceDep,
) -> ApiResponse[CurrencyRatesResponse]:
    rates = await DashboardService(db, pricing_service).get_currency_rates()
    return success(CurrencyRatesResponse(rates=rates))
