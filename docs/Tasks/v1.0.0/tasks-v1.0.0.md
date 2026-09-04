# Tasks v1.0.0 — expense-tracker-web

> 狀態：進行中（已完成 16/18）　盲點掃描：propose 拆解前已用 AskUserQuestion 解決三個缺口（負債輸入方式、分類/標籤結構、週期性交易月底夾日規則），已回寫 `propose-v1.0.0.md`。報價資料源仍未定案 → task-011 / task-012 為調查 spike，其結論會影響 task-013 / task-014 的實作細節（非阻塞拆解，可先拆）。
> 格式定義：`HARNESS_HOME/rules/00-core/10-propose-tasks-fixed.md`。

- **狀態**：進行中（16 / 18）
- **來源**：`propose-v1.0.0.md`
- **更新**：2026-09-03

## 任務清單

| # | 標題 | 狀態 | 並行 | 依賴 | 影響檔案 | worker |
| --- | --- | --- | --- | --- | --- | --- |
| 001 | 使用者認證（後端） | done | ✓ | — | `backend/app/models/user.py`、`backend/app/schemas/auth.py`、`backend/app/api/v1/auth.py`、`backend/app/repositories/user_repository.py`、`backend/app/services/auth_service.py`、`backend/alembic/versions/{rev}_add_users.py`、`backend/tests/api/test_auth.py` | sub-agent |
| 002 | 帳戶 Account（後端） | done | ✓ | task-001 | `backend/app/models/account.py`、`backend/app/schemas/account.py`、`backend/app/api/v1/accounts.py`、`backend/app/repositories/account_repository.py`、`backend/alembic/versions/{rev}_add_accounts.py`、`backend/tests/api/test_accounts.py` | sub-agent |
| 003 | 分類 Category（後端，含系統預設種子） | done | ✓ | task-001 | `backend/app/models/category.py`、`backend/app/schemas/category.py`、`backend/app/api/v1/categories.py`、`backend/app/repositories/category_repository.py`、`backend/alembic/versions/{rev}_add_categories.py`、`backend/tests/api/test_categories.py` | sub-agent |
| 004 | 交易 Transaction + 標籤 Tag（後端） | done |  | task-001, task-002, task-003 | `backend/app/models/transaction.py`、`backend/app/models/tag.py`、`backend/app/schemas/transaction.py`、`backend/app/api/v1/transactions.py`、`backend/app/repositories/transaction_repository.py`、`backend/alembic/versions/{rev}_add_transactions_and_tags.py`、`backend/tests/api/test_transactions.py` | sub-agent |
| 005 | 認證前端頁面 | done | ✓ | task-001 | `frontend/src/lib/api/authApi.ts`、`frontend/src/app/login/page.tsx`、`frontend/src/app/register/page.tsx`、`frontend/src/components/AuthGuard.tsx` | sub-agent |
| 006 | 交易輸入 / 清單前端頁 | done |  | task-004 | `frontend/src/lib/api/transactionsApi.ts`、`frontend/src/app/transactions/page.tsx`、`frontend/src/components/TransactionForm.tsx`、`frontend/src/components/TransactionList.tsx` | sub-agent |
| 007 | 週期性交易（後端，含月底夾日） | done |  | task-004 | `backend/app/models/recurring_rule.py`、`backend/app/schemas/recurring_rule.py`、`backend/app/api/v1/recurring_rules.py`、`backend/app/services/recurring_service.py`、`backend/alembic/versions/{rev}_add_recurring_rules.py`、`backend/tests/services/test_recurring_service.py` | sub-agent |
| 008 | 週期性交易前端設定頁 | done |  | task-007 | `frontend/src/lib/api/recurringApi.ts`、`frontend/src/app/recurring/page.tsx` | sub-agent |
| 009 | 預算 Budget（後端） | done |  | task-003, task-004 | `backend/app/models/budget.py`、`backend/app/schemas/budget.py`、`backend/app/api/v1/budgets.py`、`backend/app/services/budget_service.py`、`backend/alembic/versions/{rev}_add_budgets.py`、`backend/tests/api/test_budgets.py` | sub-agent |
| 010 | 預算前端頁（設定 + 進度顯示） | done |  | task-009 | `frontend/src/lib/api/budgetsApi.ts`、`frontend/src/app/budgets/page.tsx` | sub-agent |
| 011 | 股票報價來源 spike | done | ✓ | — | `docs/Arch/adr/0001-stock-price-source.md` | sub-agent |
| 012 | 貴金屬報價來源 spike | done | ✓ | — | `docs/Arch/adr/0002-metal-price-source.md` | sub-agent |
| 013 | 金融資產 FinancialAsset（後端，張/股、兩/錢換算） | done |  | task-001, task-011, task-012 | `backend/app/models/financial_asset.py`、`backend/app/schemas/financial_asset.py`、`backend/app/api/v1/financial_assets.py`、`backend/app/utils/unit_conversion.py`、`backend/alembic/versions/{rev}_add_financial_assets.py`、`backend/tests/utils/test_unit_conversion.py` | sub-agent |
| 014 | 報價 client + Redis 快取層 | done |  | task-011, task-012, task-013 | `backend/app/clients/stock_price_client.py`、`backend/app/clients/metal_price_client.py`、`backend/app/core/cache.py`、`backend/app/services/pricing_service.py`、`docker-compose.yml`、`.env`、`backend/pyproject.toml`、`backend/tests/services/test_pricing_service.py` | sub-agent |
| 015 | 負債 Liability（後端） | done | ✓ | task-001 | `backend/app/models/liability.py`、`backend/app/schemas/liability.py`、`backend/app/api/v1/liabilities.py`、`backend/alembic/versions/{rev}_add_liabilities.py`、`backend/tests/api/test_liabilities.py` | sub-agent |
| 016 | 總資產 / 總負債彙總 API | done |  | task-002, task-013, task-014, task-015 | `backend/app/services/net_worth_service.py`、`backend/app/api/v1/net_worth.py`、`backend/app/schemas/net_worth.py`、`backend/tests/api/test_net_worth.py` | sub-agent |
| 017 | 資產 / 負債前端頁（含總覽 dashboard） | in_progress |  | task-016 | `frontend/src/lib/api/assetsApi.ts`、`frontend/src/app/assets/page.tsx`、`frontend/src/app/dashboard/page.tsx` | sub-agent |
| 018 | e2e：資產反映市值 + 雙帳號隔離 | pending |  | task-005, task-006, task-017 | `frontend/e2e/net-worth.spec.ts`、`frontend/e2e/multi-user-isolation.spec.ts`、`.github/workflows/e2e.yml` | — |
