---
id: task-018
title: e2e：資產反映市值 + 雙帳號隔離
status: done
parallel: false
depends_on: [task-005, task-006, task-017]
affected_files:
  - frontend/e2e/net-worth.spec.ts
  - frontend/e2e/multi-user-isolation.spec.ts
  - .github/workflows/e2e.yml
estimated_hours: 4
rules: [rules/50-ci-cd/01-frontend-jobs.md, AGENTS.md § Testing]
---
## 目標

Playwright e2e 驗證 propose 驗收標準中的兩個手測項目：(1) 新增一筆股票資產後，dashboard 總資產反映當前抓到的市價；(2) 兩個不同帳號登入，看不到彼此的交易紀錄。

## Acceptance

- [ ] `npx playwright test frontend/e2e/net-worth.spec.ts` 通過
- [ ] `npx playwright test frontend/e2e/multi-user-isolation.spec.ts` 通過
- [ ] `.github/workflows/e2e.yml` 的既有 job 能跑到這兩個 spec（不需新增 job，接進既有 pipeline）

## 必讀檔（Just-in-time）

- rules/50-ci-cd/01-frontend-jobs.md
- AGENTS.md § Testing
