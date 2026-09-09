---
id: task-027
title: 補齊前端 msw devDependency 並修正 eslint 掃描範圍
status: done
parallel: true
depends_on: [task-006]
affected_files:
  - frontend/package.json
  - frontend/package-lock.json
  - frontend/eslint.config.mjs
estimated_hours: 1
rules: [FE-012, CORE-022]
---

> 來源：`docs/Tasks/v1.1.0/fixed.md` §1/§2（task-013 執行中發現，CORE-068 拆補洞 task，新編號不覆寫 task-006/task-013）。

## 目標

1. `msw` 從未成為 `frontend/package.json` 的真實 `devDependency`（`package-lock.json` 內僅是 `@vitest/mocker` 的 optional peerDependency，`npm ci` 不會安裝，`node_modules/msw` 實際不存在）。補上 `msw@2.15.0`（`→ rules/00-core/01-versions.md` 版本唯一真相）為真實 `devDependency` 並鎖版。
2. `frontend/eslint.config.mjs` 的 `globalIgnores` 補上 `playwright-report/**`（與 `.gitignore:43` 對齊，避免 `eslint .` 掃到本機殘留的 Playwright trace viewer 產出 bundle）。
3. 清除本機殘留、未追蹤的 `frontend/playwright-report/` 目錄（`.gitignore` 已排除、非版控檔，可安全刪除；用一般刪除，不涉及本專案禁止的遞迴強刪政策例外情境判斷——這是清自己專案內的已知殘留產出物，非任意路徑）。

裝完後**必須** `docker compose up -d --build frontend` 重建 image。

## Acceptance

- [ ] `frontend/package.json` `devDependencies` 含 `"msw": "2.15.0"`（精確鎖版）
- [ ] `docker run --rm -v "$PWD/frontend:/app" -w /app -e npm_config_cache=/tmp/npm-cache node:24-alpine sh -c "npm ci"` 成功後，容器內 `node_modules/msw` 實際存在（`[ -d node_modules/msw ]` 為真）
- [ ] `frontend/eslint.config.mjs` 的 `globalIgnores` 陣列含 `playwright-report/**`
- [ ] 本機 `frontend/playwright-report/` 目錄不存在（`[ ! -d frontend/playwright-report ]` 為真）
- [ ] `docker run --rm -v "$PWD/frontend:/app" -w /app -e npm_config_cache=/tmp/npm-cache node:24-alpine sh -c "npm ci && npm run lint"` 全專案 lint 通過（0 error / 0 warning）
- [ ] `git status --porcelain` 只多出本 task 的 3 個 `affected_files`（`playwright-report/` 因未受版控，刪除不會出現在 `git status`）

## 必讀檔（Just-in-time）

- `rules/00-core/01-versions.md`（msw 版本鎖定）
- `rules/10-frontend/00-overview.md` FE-012（測試工具：msw 攔截 HTTP，禁 mock fetch/RTK hooks）
- `docs/Tasks/v1.1.0/fixed.md` §1、§2（完整根因脈絡）
