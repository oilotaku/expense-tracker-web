---
id: task-008
title: 共用 Overlay 元件（Dialog / ConfirmDialog / Toaster）
status: done
parallel: true
depends_on: [task-006]
affected_files:
  - frontend/src/components/common/Dialog.tsx
  - frontend/src/components/common/Dialog.test.tsx
  - frontend/src/components/common/ConfirmDialog.tsx
  - frontend/src/components/common/ConfirmDialog.test.tsx
  - frontend/src/components/common/Toaster.tsx
  - frontend/src/components/common/Toaster.test.tsx
  - frontend/src/hooks/useToast.ts
  - frontend/src/hooks/useToast.test.ts
estimated_hours: 5
rules: [rules/10-frontend/05-components.md, rules/10-frontend/06-rwd.md]
---
## 目標

`design-spec.md` §4/§10：`<Dialog>` 基於 `@radix-ui/react-dialog`（focus trap / ESC / portal，`→ FE-048`），桌機置中 / 行動端 BottomSheet 兩種 variant 共用同一元件，切換用 CSS breakpoint（非 JS）；BottomSheet 滑入用 `motion`（`type: spring, damping: 30, stiffness: 300`），桌機為 `scale 0.96→1 + fade`，皆需 `useReducedMotion()` 降級為瞬時切換。`<ConfirmDialog>` 沿用 `<Dialog>`。`<Toaster>`/`useToast` 提供全域通知。

## Acceptance

- [x] `npm run test -- --run` 全綠，含：`Dialog` ESC 關閉、focus trap、桌機/行動 variant 切換、`prefers-reduced-motion` 時無位移動畫；`ConfirmDialog` 確認/取消回呼；`useToast` 推送與自動消失
- [x] `npm run typecheck` 全綠
- [x] `npm run lint` 全綠
- [x] `npm run build` 成功

## 必讀檔（Just-in-time）

- rules/10-frontend/05-components.md
- rules/10-frontend/06-rwd.md
