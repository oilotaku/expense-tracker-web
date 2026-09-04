---
id: task-009
title: AppShell 導覽元件（Sidebar / BottomNav / CurvedCard / WaveDivider / ThemeToggle）
status: done
parallel: true
depends_on: [task-006, task-007]
affected_files:
  - frontend/src/components/common/AppShell.tsx
  - frontend/src/components/common/AppShell.test.tsx
  - frontend/src/components/common/Sidebar.tsx
  - frontend/src/components/common/BottomNav.tsx
  - frontend/src/components/common/CurvedCard.tsx
  - frontend/src/components/common/WaveDivider.tsx
  - frontend/src/components/common/ThemeToggle.tsx
  - frontend/src/hooks/useBreakpoint.ts
  - frontend/src/hooks/useBreakpoint.test.ts
estimated_hours: 6
rules: [rules/10-frontend/05-components.md, rules/10-frontend/06-rwd.md]
---
## 目標

`design-spec.md` §3.1/§4：`<AppShell>` 包 `<Sidebar>`（桌機，`md:` 顯示）+ `<BottomNav>`（行動端，含中央 FAB）+ Header，桌機/行動切換一律用 Tailwind `hidden md:block`/`md:hidden`（`→ FE-063`），**不**用 JS breakpoint 判斷（`useBreakpoint` 保留為唯一 JS 偵測入口，供 task-018 登入頁「預設顯示哪個子畫面」情境使用，本任務只建立 hook 本身，不在 AppShell 內使用）。Sidebar/BottomNav 各自的巡覽項含 `<ThemeToggle>`（三態切換，`→ §2.7`）入口。`<CurvedCard>` 為基礎卡片（`--radius-lg` + `--shadow-card`，hover 用 `motion` 抬升 `translateY(-2px)`）。`<WaveDivider>` 用 `d3-shape` 產生裝飾波浪，`aria-hidden="true"`。每個頁面各自在其 `page.tsx` 內用 `<AppShell>` 包裹內容（**不**動 `layout.tsx`，本任務不建立全站 layout wrapper）。

## Acceptance

- [x] `npm run test -- --run` 全綠，含：`Sidebar`/`BottomNav` 各導覽項可點擊、`ThemeToggle` 三態循環、`CurvedCard` hover 在 `prefers-reduced-motion` 時不做位移只變色、`useBreakpoint` 正確回報目前 breakpoint
- [x] `npm run typecheck` 全綠
- [x] `npm run lint` 全綠
- [x] `npm run build` 成功

## 必讀檔（Just-in-time）

- rules/10-frontend/05-components.md
- rules/10-frontend/06-rwd.md
