---
id: task-006
title: 前端新增依賴套件安裝與版本鎖定
status: done
parallel: true
depends_on: []
affected_files:
  - frontend/package.json
  - frontend/package-lock.json
estimated_hours: 2
rules: [rules/00-core/01-versions.md]
---
## 目標

`design-spec.md` §10：安裝 `recharts`、`d3-shape`、`react-hook-form`、`zod`、`@hookform/resolvers`、`class-variance-authority`、`@radix-ui/react-dialog`、`motion`（`framer-motion` 現行套件名）。所有版本一律精確 pin（`→ CORE-017` 禁 `^`/`~`/`*`/`latest`），取當下最新穩定版；`class-variance-authority` 是 FE-052 既有規則要求但目前未安裝的既有規則債，本任務一併補齊。

## Acceptance

- [x] `cd frontend && npm ci` 成功，`package-lock.json` 與 `package.json` 一致
- [x] `grep -E '"(recharts|d3-shape|react-hook-form|zod|@hookform/resolvers|class-variance-authority|@radix-ui/react-dialog|motion)":\s*"[\^~*]' frontend/package.json` 無輸出（確認無浮動版本符號）
- [x] `npm run typecheck` 全綠（新套件型別可解析）
- [x] `git status --porcelain -- frontend/package.json frontend/package-lock.json` 顯示變更，`git status --porcelain` 其餘路徑無變化

## 必讀檔（Just-in-time）

- rules/00-core/01-versions.md
