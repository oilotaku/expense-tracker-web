from fastapi import APIRouter

from . import accounts, auth, categories, financial_assets, health, liabilities, transactions

router = APIRouter()
router.include_router(health.router, tags=["health"])
router.include_router(auth.router, tags=["auth"])
router.include_router(accounts.router, tags=["accounts"])
router.include_router(categories.router, tags=["categories"])
router.include_router(liabilities.router, tags=["liabilities"])
router.include_router(transactions.router, tags=["transactions"])
router.include_router(financial_assets.router, tags=["financial-assets"])
