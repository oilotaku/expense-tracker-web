'use client'

import { useSyncExternalStore } from 'react'

// 只用 Tailwind v4 預設 breakpoints（→ FE-055），與 tailwindcss 內建 screens 值一致。
const BREAKPOINTS = { sm: 640, md: 768, lg: 1024, xl: 1280, '2xl': 1536 } as const

export type Breakpoint = keyof typeof BREAKPOINTS

function getServerSnapshot(): boolean {
  return false
}

/**
 * 唯一 JS breakpoint 偵測入口（`→ FE-065`）。一般 RWD 一律用 Tailwind `hidden md:block` /
 * `md:hidden`（`→ FE-063`），**禁**各頁自寫 `matchMedia` / `useState + innerWidth`；本 hook
 * 只在例外情境使用（如 task-018 登入頁決定預設顯示哪個子畫面），本任務（task-009）只建立
 * hook 本身，`<AppShell>` 內部切版不使用它。
 *
 * SSR 安全：server snapshot 固定回 `false`，首次 client render 才透過 `useSyncExternalStore`
 * 讀取 `window.matchMedia`（不在 render 期間直接呼叫 `setState`，避免 hydration mismatch）。
 */
export function useBreakpoint(breakpoint: Breakpoint): boolean {
  const query = `(min-width: ${BREAKPOINTS[breakpoint]}px)`

  return useSyncExternalStore(
    (onChange) => {
      const mediaQuery = window.matchMedia(query)
      mediaQuery.addEventListener('change', onChange)
      return () => mediaQuery.removeEventListener('change', onChange)
    },
    () => window.matchMedia(query).matches,
    getServerSnapshot,
  )
}
