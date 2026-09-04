'use client'

import type { ReactNode } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import { useChartPreference, type ChartType } from '@/hooks/useChartPreference'

export type { ChartType }

export interface ChartTypeSwitcherProps {
  /** 受控覆寫目前選取的圖表類型；未提供時採用 `useChartPreference` 內部持久化的值（一般未受控用法）。 */
  value?: ChartType
  /** 使用者切換分頁時觸發，供呼叫端得知目前選取（內部一律仍會寫回 localStorage）。 */
  onChange?: (chartType: ChartType) => void
  /** 依目前圖表類型渲染實際圖表內容（`CategoryPieChart` / `CategoryBarChart` / `TrendLineChart`）。 */
  renderChart: (chartType: ChartType) => ReactNode
}

const TABS: ReadonlyArray<{ type: ChartType; label: string; icon: string }> = [
  { type: 'pie', label: '圓餅', icon: '🥧' },
  { type: 'bar', label: '長條', icon: '▤' },
  { type: 'line', label: '折線', icon: '📈' },
]

const SWITCH_TRANSITION = { duration: 0.18, ease: 'easeOut' } as const
const INSTANT_TRANSITION = { duration: 0 } as const

/**
 * 圖表類型切換 tab（design-spec §4/§6/A11）：圓餅/長條/折線 3 選 1，內部用 `useChartPreference`
 * 讀寫 localStorage 記住使用者選擇（同裝置，預設圓餅圖），不落地後端使用者偏好欄位。
 *
 * 切換時用 `AnimatePresence` 交叉淡入淡出 + 輕微 scale（0.98→1，150–200ms）；
 * `prefers-reduced-motion` 時（`→ useReducedMotion`）跳過動畫直接切到最終狀態 —
 * 與 `Dialog`/`Toaster` 既有模式一致：`initial=false`、`exit=undefined`，讓
 * `AnimatePresence` 同步移除舊節點，不停用功能本身，只降級成瞬時切換。
 */
export function ChartTypeSwitcher({ value, onChange, renderChart }: ChartTypeSwitcherProps): ReactNode {
  const { chartType, setChartType } = useChartPreference()
  const reducedMotion = useReducedMotion()
  const current = value ?? chartType

  function handleSelect(next: ChartType): void {
    setChartType(next)
    onChange?.(next)
  }

  return (
    <div>
      <div
        role="tablist"
        aria-label="圖表類型"
        className="flex justify-center gap-1 rounded-md bg-surface-sunken p-1"
      >
        {TABS.map((tab) => (
          <button
            key={tab.type}
            type="button"
            role="tab"
            aria-selected={current === tab.type}
            onClick={() => handleSelect(tab.type)}
            className={`min-h-[44px] flex-1 rounded-md px-3 text-sm font-medium transition-colors md:min-h-8 ${
              current === tab.type
                ? 'bg-primary-600 text-text-inverse'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            <span aria-hidden>{tab.icon} </span>
            {tab.label}
          </button>
        ))}
      </div>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={current}
          initial={reducedMotion ? false : { opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={reducedMotion ? undefined : { opacity: 0, scale: 0.98 }}
          transition={reducedMotion ? INSTANT_TRANSITION : SWITCH_TRANSITION}
        >
          {renderChart(current)}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}
