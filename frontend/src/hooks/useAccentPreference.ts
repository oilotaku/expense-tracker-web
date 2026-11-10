'use client'

import { useCallback, useEffect, useSyncExternalStore } from 'react'

export type AccentTheme = 'lavender' | 'ocean' | 'teal' | 'forest' | 'amber' | 'rose' | 'graphite'

export interface AccentThemeOption {
  id: AccentTheme
  label: string
  swatch: string
}

/** design-spec §2.7.1：色票顯示各主題 Light 的 primary-600，實際色值在 globals.css。 */
export const ACCENT_THEMES: readonly AccentThemeOption[] = [
  { id: 'lavender', label: '薰衣草紫', swatch: '#8257d6' },
  { id: 'ocean', label: '海洋藍', swatch: '#0975b7' },
  { id: 'teal', label: '青碧', swatch: '#047c7c' },
  { id: 'forest', label: '森林綠', swatch: '#0a803b' },
  { id: 'amber', label: '琥珀橘', swatch: '#a65d0b' },
  { id: 'rose', label: '玫瑰紅', swatch: '#cb355d' },
  { id: 'graphite', label: '石墨灰', swatch: '#657189' },
]

const STORAGE_KEY = 'accent-theme-preference'
const DEFAULT_ACCENT: AccentTheme = 'lavender'

function isAccentTheme(value: string | null): value is AccentTheme {
  return ACCENT_THEMES.some((theme) => theme.id === value)
}

// localStorage 寫入失敗（如隱私模式）時的 in-memory 降級值（同 useThemePreference 既有模式）。
let memoryFallback: AccentTheme | null = null

const listeners = new Set<() => void>()

function notifyListeners(): void {
  listeners.forEach((listener) => listener())
}

function readAccent(): AccentTheme {
  if (memoryFallback !== null) return memoryFallback
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    return isAccentTheme(stored) ? stored : DEFAULT_ACCENT
  } catch {
    return DEFAULT_ACCENT
  }
}

function writeAccent(next: AccentTheme): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, next)
    memoryFallback = null
  } catch {
    memoryFallback = next
  }
  notifyListeners()
}

function applyDataAccent(accent: AccentTheme): void {
  const root = document.documentElement
  if (accent === DEFAULT_ACCENT) {
    root.removeAttribute('data-accent')
  } else {
    root.setAttribute('data-accent', accent)
  }
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange)
  const handleStorage = (event: StorageEvent): void => {
    if (event.key === STORAGE_KEY || event.key === null) onChange()
  }
  window.addEventListener('storage', handleStorage)
  return () => {
    listeners.delete(onChange)
    window.removeEventListener('storage', handleStorage)
  }
}

function getSnapshot(): AccentTheme {
  return readAccent()
}

function getServerSnapshot(): AccentTheme {
  return DEFAULT_ACCENT
}

export interface UseAccentPreferenceResult {
  accent: AccentTheme
  setAccent: (accent: AccentTheme) => void
}

/**
 * 主題色偏好，與明暗偏好（useThemePreference）互相獨立，存 localStorage、同步到 <html data-accent>。
 * 同裝置記住、不跨裝置、不落地後端；首次載入避免閃色由 `app/layout.tsx` 的 inline script 負責。
 */
export function useAccentPreference(): UseAccentPreferenceResult {
  const accent = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

  useEffect(() => {
    applyDataAccent(accent)
  }, [accent])

  const setAccent = useCallback((next: AccentTheme): void => {
    writeAccent(next)
  }, [])

  return { accent, setAccent }
}
