from fastapi import APIRouter

from . import (
    accounts,
    auth,
    budgets,
    categories,
    dashboard,
    financial_assets,
    health,
    internal,
    liabilities,
    net_worth,
    recurring_rules,
    transactions,
)

router = APIRouter()
router.include_router(health.router, tags=["health"])
router.include_router(auth.router, tags=["auth"])
router.include_router(accounts.router, tags=["accounts"])
router.include_router(categories.router, tags=["categories"])
router.include_router(liabilities.router, tags=["liabilities"])
router.include_router(transactions.router, tags=["transactions"])
router.include_router(financial_assets.router, tags=["financial-assets"])
router.include_router(recurring_rules.router, tags=["recurring-rules"])
router.include_router(budgets.router, tags=["budgets"])
router.include_router(net_worth.router, tags=["net-worth"])
router.include_router(dashboard.router, tags=["dashboard"])
router.include_router(internal.router, tags=["internal"])
