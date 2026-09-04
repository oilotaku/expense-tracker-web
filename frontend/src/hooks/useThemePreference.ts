'use client'

import { useCallback, useEffect, useSyncExternalStore } from 'react'

export type ThemePreference = 'light' | 'dark' | 'system'

const STORAGE_KEY = 'theme-preference'

function isThemePreference(value: string | null): value is ThemePreference {
  return value === 'light' || value === 'dark' || value === 'system'
}

// localStorage 寫入失敗（如隱私模式）時的 in-memory 降級值，讓 setPreference 仍能反映在畫面上
let memoryFallback: ThemePreference | null = null

const listeners = new Set<() => void>()

function notifyListeners(): void {
  listeners.forEach((listener) => listener())
}

function readPreference(): ThemePreference {
  if (memoryFallback !== null) return memoryFallback
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    return isThemePreference(stored) ? stored : 'system'
  } catch {
    return 'system'
  }
}

function writePreference(next: ThemePreference): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, next)
    memoryFallback = null
  } catch {
    memoryFallback = next
  }
  notifyListeners()
}

function applyDataTheme(preference: ThemePreference): void {
  const root = document.documentElement
  if (preference === 'system') {
    // system 時不寫入 data-theme，交給 CSS @media (prefers-color-scheme: dark) 接管（→ §2.7）
    root.removeAttribute('data-theme')
  } else {
    root.setAttribute('data-theme', preference)
  }
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange)
  // 跨分頁：其他分頁改了 localStorage 時同步（同分頁內的變更改走 notifyListeners，見 writePreference）
  const handleStorage = (event: StorageEvent): void => {
    if (event.key === STORAGE_KEY || event.key === null) onChange()
  }
  window.addEventListener('storage', handleStorage)
  return () => {
    listeners.delete(onChange)
    window.removeEventListener('storage', handleStorage)
  }
}

function getSnapshot(): ThemePreference {
  return readPreference()
}

function getServerSnapshot(): ThemePreference {
  return 'system'
}

export interface UseThemePreferenceResult {
  preference: ThemePreference
  setPreference: (preference: ThemePreference) => void
}

/**
 * 三態主題偏好（light / dark / system）讀寫 localStorage，並同步套用 <html data-theme>
 * （→ design-spec.md §2.7）。首次載入避免 FOUC 的套用由 `app/layout.tsx` 的 inline script
 * 負責；本 hook 負責掛載後讀回目前值，以及切換入口（Sidebar / 更多選單 / 設定頁）互動時的讀寫同步。
 * 用 `useSyncExternalStore` 讀 localStorage 這個外部來源，SSR 安全（server snapshot 固定回
 * 'system'），避免在 effect 內同步呼叫 setState（→ react-hooks/set-state-in-effect）。
 */
export function useThemePreference(): UseThemePreferenceResult {
  const preference = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

  // 把目前偏好同步到 <html data-theme>：這是「把 React 狀態同步到外部 DOM」的合法 effect 用途
  // （非呼叫 setState），不受 react-hooks/set-state-in-effect 規則限制。
  useEffect(() => {
    applyDataTheme(preference)
  }, [preference])

  const setPreference = useCallback((next: ThemePreference): void => {
    writePreference(next)
  }, [])

  return { preference, setPreference }
}
