'use client'

import { useCallback, useSyncExternalStore } from 'react'

// 'red-up'：漲紅跌綠（台股慣例）；'green-up'：漲綠跌紅（歐美慣例，也是本 app 收支配色）。
// 兩種市場都有使用者，不能替使用者決定，故做成可切換偏好，非寫死常數。
export type PriceColorScheme = 'red-up' | 'green-up'

const STORAGE_KEY = 'price-color-scheme-preference'
const DEFAULT_SCHEME: PriceColorScheme = 'red-up'

function isPriceColorScheme(value: string | null): value is PriceColorScheme {
  return value === 'red-up' || value === 'green-up'
}

// localStorage 寫入失敗（如隱私模式）時的 in-memory 降級值（同 useChartPreference / useThemePreference 既有模式）。
let memoryFallback: PriceColorScheme | null = null

const listeners = new Set<() => void>()

function notifyListeners(): void {
  listeners.forEach((listener) => listener())
}

function readScheme(): PriceColorScheme {
  if (memoryFallback !== null) return memoryFallback
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    return isPriceColorScheme(stored) ? stored : DEFAULT_SCHEME
  } catch {
    return DEFAULT_SCHEME
  }
}

function writeScheme(next: PriceColorScheme): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, next)
    memoryFallback = null
  } catch {
    memoryFallback = next
  }
  notifyListeners()
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

function getSnapshot(): PriceColorScheme {
  return readScheme()
}

function getServerSnapshot(): PriceColorScheme {
  return DEFAULT_SCHEME
}

export interface UsePriceColorPreferenceResult {
  scheme: PriceColorScheme
  setScheme: (scheme: PriceColorScheme) => void
  /** 依目前偏好把「漲跌」映射成語意色 class（income-600 綠 / expense-600 紅）。 */
  colorForGain: (isGain: boolean) => 'text-income-600' | 'text-expense-600'
}

/**
 * 資產漲跌配色偏好（紅漲綠跌／綠漲紅跌）localStorage 偏好，同裝置記住、不跨裝置、不落地後端
 * （→ useChartPreference 同一套既有模式）。台股慣例紅漲綠跌，預設 'red-up'；使用者可在設定頁
 * 切換成綠漲紅跌（本 app 收支配色 / 歐美市場慣例）。
 */
export function usePriceColorPreference(): UsePriceColorPreferenceResult {
  const scheme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

  const setScheme = useCallback((next: PriceColorScheme): void => {
    writeScheme(next)
  }, [])

  const colorForGain = useCallback(
    (isGain: boolean): 'text-income-600' | 'text-expense-600' => {
      const upIsGreen = scheme === 'green-up'
      if (isGain) return upIsGreen ? 'text-income-600' : 'text-expense-600'
      return upIsGreen ? 'text-expense-600' : 'text-income-600'
    },
    [scheme],
  )

  return { scheme, setScheme, colorForGain }
}
