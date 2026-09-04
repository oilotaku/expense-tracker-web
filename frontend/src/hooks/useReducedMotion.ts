'use client'

import { useSyncExternalStore } from 'react'

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'

function subscribe(onChange: () => void): () => void {
  const mediaQuery = window.matchMedia(REDUCED_MOTION_QUERY)
  mediaQuery.addEventListener('change', onChange)
  return () => mediaQuery.removeEventListener('change', onChange)
}

function getSnapshot(): boolean {
  return window.matchMedia(REDUCED_MOTION_QUERY).matches
}

function getServerSnapshot(): boolean {
  return false
}

/**
 * 封裝 `prefers-reduced-motion` 偵測，供動畫元件共用（→ design-spec.md §6 全域守則）。
 * 用 `useSyncExternalStore` 讀取瀏覽器 media query 這個外部來源：SSR 安全（server snapshot
 * 固定回 false），且不需要在 effect 內同步呼叫 setState（→ react-hooks/set-state-in-effect）。
 */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
