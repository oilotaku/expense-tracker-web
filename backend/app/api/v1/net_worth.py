from typing import Annotated

from fastapi import APIRouter, Depends
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_db
from app.core.cache import get_redis
from app.core.response import success
from app.models.user import User
from app.schemas.net_worth import NetWorthResponse
from app.schemas.response import ApiResponse
from app.services.net_worth_service import NetWorthService
from app.services.pricing_service import PricingService

router = APIRouter(prefix="/net-worth")

DbSession = Annotated[AsyncSession, Depends(get_db)]
CurrentUser = Annotated[User, Depends(get_current_user)]


def get_pricing_service(redis: Annotated[Redis | None, Depends(get_redis)]) -> PricingService:
    """獨立成一個 dependency（而非在 endpoint 內直接 `PricingService(redis)`），供測試以
    `app.dependency_overrides` 換成假報價服務，避免整合測試依賴真實外部 API
    （→ AGENTS.md § Testing）。
    """
    return PricingService(redis=redis)


PricingServiceDep = Annotated[PricingService, Depends(get_pricing_service)]


@router.get(
    "",
    response_model=ApiResponse[NetWorthResponse],
    summary="淨資產彙總（總資產 / 總負債 / 淨資產）",
)
async def get_net_worth(
    db: DbSession, current_user: CurrentUser, pricing_service: PricingServiceDep
) -> ApiResponse[NetWorthResponse]:
    result = await NetWorthService(db, pricing_service).compute(current_user.user_uid)
    return success(data=result)
