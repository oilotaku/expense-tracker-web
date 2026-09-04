'use client'

import { useCallback, useSyncExternalStore } from 'react'

export type ChartType = 'pie' | 'bar' | 'line'

const STORAGE_KEY = 'chart-type-preference'
const DEFAULT_CHART_TYPE: ChartType = 'pie'

function isChartType(value: string | null): value is ChartType {
  return value === 'pie' || value === 'bar' || value === 'line'
}

// localStorage 寫入失敗（如隱私模式）時的 in-memory 降級值，讓 setChartType 仍能反映在畫面上
// （同 useThemePreference 的既有模式）。
let memoryFallback: ChartType | null = null

const listeners = new Set<() => void>()

function notifyListeners(): void {
  listeners.forEach((listener) => listener())
}

function readChartType(): ChartType {
  if (memoryFallback !== null) return memoryFallback
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    return isChartType(stored) ? stored : DEFAULT_CHART_TYPE
  } catch {
    return DEFAULT_CHART_TYPE
  }
}

function writeChartType(next: ChartType): void {
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
  // 跨分頁：其他分頁改了 localStorage 時同步（同分頁內的變更改走 notifyListeners，見 writeChartType）
  const handleStorage = (event: StorageEvent): void => {
    if (event.key === STORAGE_KEY || event.key === null) onChange()
  }
  window.addEventListener('storage', handleStorage)
  return () => {
    listeners.delete(onChange)
    window.removeEventListener('storage', handleStorage)
  }
}

function getSnapshot(): ChartType {
  return readChartType()
}

function getServerSnapshot(): ChartType {
  return DEFAULT_CHART_TYPE
}

export interface UseChartPreferenceResult {
  chartType: ChartType
  setChartType: (chartType: ChartType) => void
}

/**
 * 讀寫圖表類型（圓餅/長條/折線）localStorage 偏好（→ design-spec.md §4 / A11）：Dashboard
 * 圖表類型 3 選 1，記住使用者選擇（同裝置，不跨裝置同步，不落地後端），預設圓餅圖。
 * 用 `useSyncExternalStore` 讀 localStorage 這個外部來源，SSR 安全（server snapshot 固定回
 * 'pie'），避免在 effect 內同步呼叫 setState（→ react-hooks/set-state-in-effect），與
 * `useThemePreference` 同一套既有模式。
 */
export function useChartPreference(): UseChartPreferenceResult {
  const chartType = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

  const setChartType = useCallback((next: ChartType): void => {
    writeChartType(next)
  }, [])

  return { chartType, setChartType }
}
