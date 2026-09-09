---
id: task-007
title: 視覺設計系統 tokens + Dark Mode 基礎機制
status: done
parallel: true
depends_on: []
affected_files:
  - frontend/src/app/globals.css
  - frontend/src/app/layout.tsx
  - frontend/src/hooks/useReducedMotion.ts
  - frontend/src/hooks/useReducedMotion.test.ts
  - frontend/src/hooks/useThemePreference.ts
  - frontend/src/hooks/useThemePreference.test.ts
estimated_hours: 4
rules: [rules/10-frontend/00-overview.md, rules/10-frontend/05-components.md]
---
## 目標

`design-spec.md` §2 全節：`globals.css` 用 `--color-*`/`--radius-*`/`--shadow-*` CSS variable 定義 Light（§2.2/§2.3/§2.4）與 Dark（§2.2.1/§2.3.1）兩套 tokens，Tailwind v4 `@theme` 對映；Dark 套用機制（§2.7）：`useThemePreference` hook 讀寫 `localStorage`（key `theme-preference`，值 `light`/`dark`/`system`），`<html>` 依解析結果加 `data-theme` 屬性；`layout.tsx` 加入 hydrate 前同步執行的 inline `<script>` 避免 FOUC，並用 `next/font/google` 載入 Manrope。`useReducedMotion` 封裝 `prefers-reduced-motion` 偵測。

## Acceptance

- [ ] `npm run test -- --run` 全綠，含 `useThemePreference` 三態（light/dark/system）讀寫 `localStorage` 與解析邏輯、`useReducedMotion` 偵測邏輯
- [ ] `npm run typecheck` 全綠
- [ ] `npm run lint` 全綠
- [ ] `npm run build` 成功
- [ ] `grep -c '\-\-color-' frontend/src/app/globals.css` 回傳 > 0（tokens 已定義）

## 必讀檔（Just-in-time）

- rules/10-frontend/00-overview.md
- rules/10-frontend/05-components.md
