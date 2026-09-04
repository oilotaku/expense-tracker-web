'use client'

import type { ReactNode } from 'react'
import { useId } from 'react'

export type RecurringIntervalUnit = 'week' | 'month' | 'year'

export interface RecurringFieldsetValue {
  intervalUnit: RecurringIntervalUnit
  intervalCount: number
  // 起算日（`anchor_date`），`<input type="date">` 的 'YYYY-MM-DD' 字串
  anchorDate: string
}

export interface RecurringFieldsetErrors {
  intervalCount?: string
  anchorDate?: string
}

export interface RecurringFieldsetProps {
  value: RecurringFieldsetValue
  onChange: (value: RecurringFieldsetValue) => void
  errors?: RecurringFieldsetErrors
  disabled?: boolean
}

const INTERVAL_UNIT_OPTIONS: { value: RecurringIntervalUnit; label: string }[] = [
  { value: 'week', label: '週' },
  { value: 'month', label: '月' },
  { value: 'year', label: '年' },
]

const INTERVAL_UNIT_NOUN: Record<RecurringIntervalUnit, string> = {
  week: '週',
  month: '月',
  year: '年',
}

const INTERVAL_COUNT_MIN = 1
const INTERVAL_COUNT_MAX = 99

function parseIntervalCount(raw: string): number {
  const parsed = Number(raw)
  return Number.isNaN(parsed) ? 0 : parsed
}

/**
 * 固定收支週期設定（`→ design-spec.md §7.2` / `→ A6` 週/月/年全面開放 / `→ A16` 間隔 1–99）：
 * 對應 task-003 後端已完成的 `interval_unit` / `interval_count` / `anchor_date` 欄位。純受控
 * 元件（`value` / `onChange`，同 `<NumericKeypad>` 慣例），不自行呼叫任何 API——實際送出時機
 * 與 `recurring_rules` API 串接由使用端（`<TransactionFormDialog>` 及其呼叫者）決定
 * （`→ A13`：固定收支只是既有 recurring_rules 建立 API 的另一個入口，非本元件職責）。
 *
 * 邊界驗證（`interval_count` 需 1–99）以使用端的 zod schema 為準、透過 `errors` prop 顯示；
 * 這裡的 `min` / `max` 屬性只是原生瀏覽器層再加一道保護，不是驗證的唯一來源。
 */
export function RecurringFieldset({
  value,
  onChange,
  errors,
  disabled = false,
}: RecurringFieldsetProps): ReactNode {
  const unitGroupLabelId = useId()
  const countId = useId()
  const anchorDateId = useId()

  function handleUnitChange(unit: RecurringIntervalUnit): void {
    if (disabled) return
    onChange({ ...value, intervalUnit: unit })
  }

  function handleCountChange(raw: string): void {
    if (disabled) return
    onChange({ ...value, intervalCount: parseIntervalCount(raw) })
  }

  function handleAnchorDateChange(raw: string): void {
    if (disabled) return
    onChange({ ...value, anchorDate: raw })
  }

  return (
    <fieldset
      disabled={disabled}
      className="flex flex-col gap-3 rounded-md border border-border p-4"
    >
      <legend className="px-1 text-sm font-medium text-text-primary">固定收支週期</legend>

      <div className="flex flex-col gap-1">
        <span id={unitGroupLabelId} className="text-sm text-text-secondary">
          週期單位
        </span>
        <div role="group" aria-labelledby={unitGroupLabelId} className="grid grid-cols-3 gap-2">
          {INTERVAL_UNIT_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={value.intervalUnit === option.value}
              disabled={disabled}
              onClick={() => handleUnitChange(option.value)}
              className={`min-h-[44px] rounded-md border px-3 text-sm font-medium transition-colors md:min-h-8 ${
                value.intervalUnit === option.value
                  ? 'border-primary-600 bg-primary-100 text-primary-700'
                  : 'border-border text-text-secondary'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <label htmlFor={countId} className="flex flex-col gap-1">
        <span className="text-sm text-text-secondary">
          每幾個{INTERVAL_UNIT_NOUN[value.intervalUnit]}執行一次（1–99）
        </span>
        <input
          id={countId}
          type="number"
          inputMode="numeric"
          min={INTERVAL_COUNT_MIN}
          max={INTERVAL_COUNT_MAX}
          step={1}
          value={value.intervalCount}
          disabled={disabled}
          onChange={(event) => handleCountChange(event.target.value)}
          aria-invalid={Boolean(errors?.intervalCount)}
          className="min-h-11 rounded-md border border-border bg-surface px-3 text-text-primary"
        />
        {errors?.intervalCount && (
          <span role="alert" className="text-sm text-danger-500">
            {errors.intervalCount}
          </span>
        )}
      </label>

      <label htmlFor={anchorDateId} className="flex flex-col gap-1">
        <span className="text-sm text-text-secondary">起算日</span>
        <input
          id={anchorDateId}
          type="date"
          value={value.anchorDate}
          disabled={disabled}
          onChange={(event) => handleAnchorDateChange(event.target.value)}
          aria-invalid={Boolean(errors?.anchorDate)}
          className="min-h-11 rounded-md border border-border bg-surface px-3 text-text-primary"
        />
        {errors?.anchorDate && (
          <span role="alert" className="text-sm text-danger-500">
            {errors.anchorDate}
          </span>
        )}
      </label>
    </fieldset>
  )
}
