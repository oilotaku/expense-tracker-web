from fastapi import APIRouter

from . import accounts, auth, categories, health, liabilities

router = APIRouter()
router.include_router(health.router, tags=["health"])
router.include_router(auth.router, tags=["auth"])
router.include_router(accounts.router, tags=["accounts"])
router.include_router(categories.router, tags=["categories"])
router.include_router(liabilities.router, tags=["liabilities"])
