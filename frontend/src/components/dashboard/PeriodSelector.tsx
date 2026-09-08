'use client'

import type { ChangeEvent, ReactNode } from 'react'
import type { DashboardPeriod } from '@/lib/api/dashboardApi'

// 邊界時區固定 Asia/Taipei（`Settings.API_TZ`，→ CORE-041 / A14）：使用者選的是「當地日期」，
// 送出前在此一處轉成帶 offset 的 ISO 8601 字串，後端再轉 UTC 查詢，前端不做二次轉換。
// FE-043 要求的 `utils/datetime.ts` 尚未落地、且不在 task-016 的 affected_files 內，故沿用
// TransactionFormDialog.tsx 既有慣例在元件檔內就地實作。
const API_TZ_OFFSET = '+08:00'
const DAY_START = 'T00:00:00'
const DAY_END = 'T23:59:59'

export interface PeriodSelection {
  period: DashboardPeriod
  /** `period === 'month'` 時使用的 `YYYY-MM`。 */
  month: string
  /** `period === 'year'` 時使用的 `YYYY`。 */
  year: string
  /** `period === 'custom'` 時使用的起訖日（`YYYY-MM-DD`）。 */
  customFrom: string
  customTo: string
}

export interface PeriodRange {
  dateFrom: string
  dateTo: string
}

function apiTzTodayParts(): { year: string; month: string; day: string } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())
  const lookup = Object.fromEntries(parts.map(({ type, value }) => [type, value]))
  return { year: lookup.year ?? '1970', month: lookup.month ?? '01', day: lookup.day ?? '01' }
}

/** 預設期間 = 當月（design-spec §9.2 桌機 wireframe 的 `[月▾ 2026-09]`）。 */
export function defaultPeriodSelection(): PeriodSelection {
  const { year, month, day } = apiTzTodayParts()
  return {
    period: 'month',
    month: `${year}-${month}`,
    year,
    customFrom: `${year}-${month}-01`,
    customTo: `${year}-${month}-${day}`,
  }
}

// Date.UTC(y, m, 0) = 第 m 個月（1-based）的最後一天；用 UTC 建構避免宿主機時區影響天數。
function lastDayOfMonth(year: number, month: number): string {
  return String(new Date(Date.UTC(year, month, 0)).getUTCDate()).padStart(2, '0')
}

/** 把使用者選的當地期間換算成 `GET /dashboard/summary` 的 `date_from` / `date_to`（`→ A14`）。 */
export function toPeriodRange(selection: PeriodSelection): PeriodRange {
  if (selection.period === 'year') {
    return {
      dateFrom: `${selection.year}-01-01${DAY_START}${API_TZ_OFFSET}`,
      dateTo: `${selection.year}-12-31${DAY_END}${API_TZ_OFFSET}`,
    }
  }
  if (selection.period === 'custom') {
    return {
      dateFrom: `${selection.customFrom}${DAY_START}${API_TZ_OFFSET}`,
      dateTo: `${selection.customTo}${DAY_END}${API_TZ_OFFSET}`,
    }
  }
  const [year, month] = selection.month.split('-')
  const lastDay = lastDayOfMonth(Number(year), Number(month))
  return {
    dateFrom: `${selection.month}-01${DAY_START}${API_TZ_OFFSET}`,
    dateTo: `${selection.month}-${lastDay}${DAY_END}${API_TZ_OFFSET}`,
  }
}

const CONTROL_CLASS =
  'min-h-11 rounded-md border border-border bg-surface px-3 text-sm text-text-primary md:min-h-9 md:text-base focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600'

export interface PeriodSelectorProps {
  value: PeriodSelection
  onChange: (next: PeriodSelection) => void
}

/**
 * Dashboard 期間選擇器（design-spec §9.2）：月 / 年 / 自訂範圍三選一，桌機常駐於 Header、行動端
 * 即為標題列右側的原生下拉（同一顆控制項，不做 JS 條件 render 的 RWD，`→ FE-063`）。
 *
 * 本元件為受控元件（`value` / `onChange`），期間狀態與資料查詢由 `dashboard/page.tsx` 持有，
 * 元件本身不呼叫任何 API（`→ FE-046`）。
 */
export function PeriodSelector({ value, onChange }: PeriodSelectorProps): ReactNode {
  function handlePeriodChange(event: ChangeEvent<HTMLSelectElement>): void {
    onChange({ ...value, period: event.target.value as DashboardPeriod })
  }

  function handleMonthChange(event: ChangeEvent<HTMLInputElement>): void {
    onChange({ ...value, month: event.target.value })
  }

  function handleYearChange(event: ChangeEvent<HTMLInputElement>): void {
    onChange({ ...value, year: event.target.value })
  }

  function handleCustomFromChange(event: ChangeEvent<HTMLInputElement>): void {
    onChange({ ...value, customFrom: event.target.value })
  }

  function handleCustomToChange(event: ChangeEvent<HTMLInputElement>): void {
    onChange({ ...value, customTo: event.target.value })
  }

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <label className="flex items-center gap-2">
        <span className="text-sm text-text-secondary md:text-base">期間</span>
        <select value={value.period} onChange={handlePeriodChange} className={CONTROL_CLASS}>
          <option value="month">月</option>
          <option value="year">年</option>
          <option value="custom">自訂範圍</option>
        </select>
      </label>

      {value.period === 'month' && (
        <label className="flex items-center gap-2">
          <span className="sr-only">月份</span>
          <input type="month" value={value.month} onChange={handleMonthChange} className={CONTROL_CLASS} />
        </label>
      )}

      {value.period === 'year' && (
        <label className="flex items-center gap-2">
          <span className="sr-only">年份</span>
          <input
            type="number"
            min={1970}
            max={9999}
            value={value.year}
            onChange={handleYearChange}
            className={`${CONTROL_CLASS} w-28`}
          />
        </label>
      )}

      {value.period === 'custom' && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <label className="flex items-center gap-2">
            <span className="sr-only">起始日期</span>
            <input type="date" value={value.customFrom} onChange={handleCustomFromChange} className={CONTROL_CLASS} />
          </label>
          <span aria-hidden className="hidden text-text-secondary sm:inline">
            –
          </span>
          <label className="flex items-center gap-2">
            <span className="sr-only">結束日期</span>
            <input type="date" value={value.customTo} onChange={handleCustomToChange} className={CONTROL_CLASS} />
          </label>
        </div>
      )}
    </div>
  )
}
