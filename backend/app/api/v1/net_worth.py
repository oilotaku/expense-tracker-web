from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import PricingServiceDep, get_current_user, get_db
from app.core.response import success
from app.models.user import User
from app.schemas.net_worth import NetWorthResponse
from app.schemas.response import ApiResponse
from app.services.net_worth_service import NetWorthService

router = APIRouter(prefix="/net-worth")

DbSession = Annotated[AsyncSession, Depends(get_db)]
CurrentUser = Annotated[User, Depends(get_current_user)]


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
