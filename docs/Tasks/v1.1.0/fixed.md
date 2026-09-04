# Fixed v1.1.0

## §1 — `msw` 從未成為前端真實依賴，task-013 無法依 FE-012 寫 HTTP mock 測試（既存自 v1.0.0）

- **time**: 2026-09-04T22:04:37+08:00
- **commit**: pending
- **files**: `frontend/package.json`、`frontend/package-lock.json`
- **問題**: task-013（Dashboard 彙總 API 前端串接）要求 `dashboardApi.test.ts` 用 msw mock `GET /api/v1/dashboard/summary` 的成功/422/401 三種回應（`→ FE-012` 禁 mock `fetch` / RTK hook 本身）。實際檢查 `frontend/package.json` 的 `dependencies` / `devDependencies` 皆無 `msw`；`package-lock.json` 內唯一出現的 `msw` 是 `@vitest/mocker` 的 **optional peerDependency**（`peerDependenciesMeta.msw.optional: true`），`npm ci` 不會安裝。`node_modules/msw` 實際不存在。追溯 `git log --all -- frontend/package.json`：初始 scaffold（commit `57c8b1d`）就只在 `allowScripts` 註解列了 `"msw": true`（CORE-145 的 install-script 核可清單），從未把 `msw` 加進 `dependencies`/`devDependencies`；task-006（commit `902c67b`，「安裝 v1.1.0 前端新增依賴」）也只裝了 recharts/react-hook-form/zod/cva/radix-dialog/framer-motion，未補 `msw`。既有測試（`budgets/page.test.tsx`、`TransactionForm.test.tsx`、`AuthGuard.test.tsx` 等）皆繞過此洞，直接 mock RTK Query hook 的回傳值（檔內註解自陳「msw 尚未成為 devDependency」），因為那些測試測的是「頁面元件如何呈現 hook 的回傳值」，不需要真的發 HTTP request；但 task-013 要測的是 `dashboardApi.ts` **這個 RTK Query endpoint 本身**（`transformResponse` / query string 組裝 / 422 / 401 對應行為），沒有 msw 就無法在不違反 FE-012（禁 mock fetch）的前提下驗證。
- **根因**: scaffold 階段（`/harness-init` 產出的模板）把 `msw` 登記進了 `allowScripts` 核可清單（預期未來會用到），但初始化流程漏了把它實際加進 `package.json` 的 `devDependencies` 並跑鎖檔；`rules/00-core/01-versions.md` 已把 `msw 2.15.0` 列為版本唯一真相（供 FE-012 使用），但落地的 scaffold 產物與版本表脫節，且此落差直到 v1.0.0 全期都沒有被踩到——因為 v1.0.0 所有測試都選擇「mock hook」而非「mock HTTP」的路徑，從未真正需要 import `msw`。task-013 是本專案第一個明確要求 msw-based endpoint 測試的 task，才第一次暴露這個從 scaffold 就存在的落差。
- **修正**: 未修正（worker 判斷屬 CORE-140「發現需改動 affected_files 以外的檔才能過」→ 停手，不擅自把 `msw` 加進 `frontend/package.json`/`package-lock.json`，因為這兩個檔不在 task-013 的 `affected_files` 清單內，且多個並行 worker 共用同一份工作目錄、無 git worktree 隔離，貿然 `npm install` 改動鎖檔有撞到其他 worker 的風險）。建議：另拆一個獨立、優先序高於 task-013/019/020 的小 task（例如 task-013b「補齊前端 msw devDependency」），`affected_files` 明確列 `frontend/package.json`、`frontend/package-lock.json`，鎖版 `msw@2.15.0`（`→ rules/00-core/01-versions.md`）；完成後 task-013（本 task）、task-019（categoriesApi）、task-020（accountsApi）三個要求 `*Api.test.ts` 的 task 才能真正滿足 FE-012。
- **rule**: FE-012
- **後續**: task-013 本次標記 `blocked`（見 `docs/Tasks/v1.1.0/tasks/task-013-dashboard-api-integration.md` frontmatter）；`frontend/src/lib/api/dashboardApi.ts` 本體實作已完成並通過 `npm run typecheck` 全綠、`npx eslint src/lib/api/dashboardApi.ts --max-warnings=0` 全綠（隔離驗證，因全專案 `npm run lint` 另受 §2 環境污染影響），可供後續 worker 直接補測試檔沿用，不需重新實作。reflect 候選：`/harness-init` scaffold 模板應同步修正，把 `msw` 從 `allowScripts` 註解升級為真實 `devDependency`，避免同類落差在其他專案重演。

## §2 — 工作目錄殘留未追蹤的 `frontend/playwright-report/`，導致全專案 `npm run lint` 誤掃產出檔（既存，環境污染）

- **time**: 2026-09-04T22:04:37+08:00
- **commit**: pending
- **files**: `frontend/playwright-report/`（gitignored，非版控檔，本條僅記錄現象，不列入 task-013 `affected_files`）
- **問題**: 依 AGENTS.md Build/Test/Lint 執行 `docker run ... node:24-alpine sh -c "npm run lint"`（全專案指令）時，`eslint .` 對 `frontend/playwright-report/trace/assets/*.js`（Playwright trace viewer 產出的第三方 bundle）掃出大量 `@typescript-eslint/no-unused-expressions` warning，超過 `--max-warnings=0` 門檻導致 lint 指令整體失敗；此目錄已列在 `.gitignore:43`（`playwright-report/`），未被 git 追蹤，也不是本次 task-013 改動造成，應是先前某次本機 `npm run e2e` 執行後留下的產出物，未清除。
- **根因**: `frontend/eslint.config.mjs` 的 `globalIgnores` 只排除 `.next/**`、`out/**`、`coverage/**`、`next-env.d.ts`、`src/lib/api/schema.d.ts`，未包含 `playwright-report/**`；`.gitignore` 排除版控追蹤，但 `eslint .` 是對「磁碟上的檔案」掃描，不看 `.gitignore`，兩者規則集不同步，導致「不進版控」≠「不進 lint 掃描範圍」。
- **修正**: 未修正（`frontend/eslint.config.mjs` 不在 task-013 `affected_files` 內，且刪除該目錄需要遞迴刪除，屬本專案「毀滅性操作禁止」政策下應避免自行執行的操作；本 worker 改以 `npx eslint src/lib/api/dashboardApi.ts --max-warnings=0` 針對新增檔案單獨驗證，確認 `dashboardApi.ts` 本身無 lint 錯誤）。建議：`frontend/eslint.config.mjs` 的 `globalIgnores` 補上 `playwright-report/**`（與 `.gitignore` 對齊），並由人工或下一個有權限的 task 清除本機殘留的 `frontend/playwright-report/`。
- **rule**: NONE
- **後續**: 非 reflect 候選（單純 eslint config 遺漏 + 本機殘留檔案），建議併入下一個觸碰 `frontend/eslint.config.mjs` 的 task 一併修正。
