'use client'

import { useState, type FormEvent, type ReactNode } from 'react'
import { cva } from 'class-variance-authority'
import type { FetchBaseQueryError } from '@reduxjs/toolkit/query/react'
import type { SerializedError } from '@reduxjs/toolkit'
import { AuthGuard } from '@/components/AuthGuard'
import { AppShell } from '@/components/common/AppShell'
import { CurvedCard } from '@/components/common/CurvedCard'
import { useListCategoryOptionsQuery } from '@/lib/api/transactionsApi'
import {
  useCreateBudgetMutation,
  useGetBudgetSummaryQuery,
  useListBudgetsQuery,
  type BudgetPeriodType,
  type BudgetResponse,
} from '@/lib/api/budgetsApi'

// 同 TransactionForm.tsx / TransactionList.tsx（FE-029）：錯誤處理必用型別收窄，禁 `error as any`。
// 本 task（task-023）affected_files 只列 app/budgets/page.tsx / page.test.tsx，依 design-spec §9.5
// 只做視覺重新套用（沿用既有資料邏輯 / API 呼叫），未含共用 utils 檔，依既有慣例在頁面內各自實作。
function getErrorMessage(error: FetchBaseQueryError | SerializedError | undefined): string {
  if (!error) return ''
  if ('status' in error) {
    const data = error.data
    if (
      data !== null &&
      typeof data === 'object' &&
      'detail' in data &&
      typeof data.detail === 'string'
    ) {
      return data.detail
    }
    return '發生錯誤，請稍後再試'
  }
  return error.message ?? '發生錯誤，請稍後再試'
}

function periodTypeLabel(periodType: BudgetPeriodType): string {
  return periodType === 'monthly' ? '每月' : '每日'
}

// FE-052：條件樣式禁 inline 三元串接重複；按鈕改用新 cva variant（design-spec §9.5）。
const submitButtonClassName = cva(
  'min-h-11 rounded-md bg-primary-600 px-4 font-medium text-text-inverse transition-colors hover:bg-primary-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600',
  {
    variants: {
      isLoading: {
        true: 'opacity-50 pointer-events-none',
        false: '',
      },
    },
    defaultVariants: { isLoading: false },
  },
)

type BudgetMeterState = 'normal' | 'warning' | 'danger'

// design-spec §2.3 狀態色門檻：<80% 正常／80–99% 接近上限／≥100% 超支。「超支」沿用既有後端
// `is_over_budget` 判斷（不改資料邏輯），「接近上限」門檻另用花費比例計算，兩者皆不影響 API 呼叫。
function budgetMeterState(percent: number, isOverBudget: boolean): BudgetMeterState {
  if (isOverBudget) return 'danger'
  if (percent >= 80) return 'warning'
  return 'normal'
}

// design-spec §2.3 meter 樣式：track = 該狀態色淡階、fill = 該狀態色。danger 無獨立「淡階」
// token（僅 `--color-danger-500`/`700`），改用 danger-700 的低透明度作為淡階替代，避免在
// affected_files 未含 globals.css 的前提下新增 CSS token。
const METER_TRACK_CLASSNAME: Record<BudgetMeterState, string> = {
  normal: 'bg-primary-100',
  warning: 'bg-warning-100',
  danger: 'bg-danger-700/10',
}

const METER_FILL_CLASSNAME: Record<BudgetMeterState, string> = {
  normal: 'bg-primary-600',
  warning: 'bg-warning-600',
  danger: 'bg-danger-700',
}

const METER_TEXT_CLASSNAME: Record<BudgetMeterState, string> = {
  normal: 'text-text-secondary',
  warning: 'text-warning-600',
  danger: 'text-danger-700',
}

// design-spec §2.3：狀態「永遠 icon + 文字並存，不單靠顏色」；接近上限／超支的 icon 由規格指定
// （⚠／🔴），正常狀態規格未另給符號，取同語彙的 ✓ 維持三態一致的視覺語言。
const METER_ICON: Record<BudgetMeterState, string> = {
  normal: '✓',
  warning: '⚠',
  danger: '🔴',
}

// 僅供 meter 視覺呈現（寬度／狀態門檻判斷），非金額計算；金額顯示一律用後端原始字串
// （→ DB-038），不因此改用 number 型別承載金額本身。
function spentPercent(spentAmount: string, limitAmount: string): number {
  const limit = Number(limitAmount)
  if (!Number.isFinite(limit) || limit <= 0) return 0
  const spent = Number(spentAmount)
  if (!Number.isFinite(spent)) return 0
  return (spent / limit) * 100
}

function meterFillWidthPercent(percent: number): number {
  return Math.min(100, Math.max(0, percent))
}

// 超支金額文案（design-spec §2.3：「已超支 NT$1,200」）：remaining_amount 超支時為負值字串，
// 僅去除負號組字，金額本身仍是後端原始字串，不解析成 number（→ DB-038）。
function overspentAmountLabel(remainingAmount: string): string {
  const trimmed = remainingAmount.trim()
  return trimmed.startsWith('-') ? trimmed.slice(1) : trimmed
}

function meterText(state: BudgetMeterState, percent: number, remainingAmount: string): string {
  if (state === 'danger') return `已超支 NT$${overspentAmountLabel(remainingAmount)}`
  return `已使用 ${Math.round(percent)}%`
}

function BudgetForm(): ReactNode {
  const { data: categories } = useListCategoryOptionsQuery()
  const [createBudget, { isLoading, error }] = useCreateBudgetMutation()

  const [categoryUid, setCategoryUid] = useState('')
  const [periodType, setPeriodType] = useState<BudgetPeriodType>('monthly')
  const [limitAmount, setLimitAmount] = useState('')

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    try {
      await createBudget({
        category_uid: categoryUid,
        period_type: periodType,
        limit_amount: limitAmount,
      }).unwrap()
      setCategoryUid('')
      setPeriodType('monthly')
      setLimitAmount('')
    } catch {
      // 錯誤已透過 createBudget() 的 error 狀態顯示，這裡只需擋掉 unwrap() 的 rejection
    }
  }

  return (
    <CurvedCard>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
        <h2 className="text-lg font-semibold text-text-primary">新增預算</h2>
        <label className="flex flex-col gap-1">
          <span className="text-sm text-text-secondary">分類</span>
          <select
            required
            value={categoryUid}
            onChange={(event) => setCategoryUid(event.target.value)}
            className="min-h-11 rounded-md border border-border bg-surface px-3 text-text-primary"
          >
            <option value="">請選擇分類</option>
            {(categories ?? []).map((category) => (
              <option key={category.category_uid} value={category.category_uid}>
                {category.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm text-text-secondary">期間</span>
          <select
            value={periodType}
            onChange={(event) => setPeriodType(event.target.value as BudgetPeriodType)}
            className="min-h-11 rounded-md border border-border bg-surface px-3 text-text-primary"
          >
            <option value="monthly">每月</option>
            <option value="daily">每日</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm text-text-secondary">上限金額</span>
          <input
            type="number"
            required
            min="0.01"
            step="0.01"
            value={limitAmount}
            onChange={(event) => setLimitAmount(event.target.value)}
            className="min-h-11 rounded-md border border-border bg-surface px-3 text-text-primary"
          />
        </label>
        {error && (
          <p role="alert" className="text-sm text-danger-700">
            {getErrorMessage(error)}
          </p>
        )}
        <button type="submit" disabled={isLoading} className={submitButtonClassName({ isLoading })}>
          {isLoading ? '送出中…' : '新增預算'}
        </button>
      </form>
    </CurvedCard>
  )
}

interface BudgetProgressCardProps {
  budget: BudgetResponse
  categoryName: string
}

// 各分類進度顯示：依 budget_uid 個別呼叫花費彙總 API。清單筆數動態，無法在迴圈外一次呼叫
// hook，故抽成獨立元件（一元件一次 hook 呼叫，符合 React hooks 規則，→ rules of hooks）。
function BudgetProgressCard({ budget, categoryName }: BudgetProgressCardProps): ReactNode {
  const { data: summary, isLoading, error } = useGetBudgetSummaryQuery(budget.budget_uid)
  const percent = summary ? spentPercent(summary.spent_amount, summary.limit_amount) : 0
  const state = summary ? budgetMeterState(percent, summary.is_over_budget) : 'normal'

  return (
    <CurvedCard>
      <div className="flex items-center justify-between">
        <span className="font-medium text-text-primary">{categoryName}</span>
        <span className="rounded-full bg-primary-100 px-2 py-0.5 text-xs text-primary-700">
          {periodTypeLabel(budget.period_type)}
        </span>
      </div>
      {isLoading && <p className="text-sm text-text-secondary">載入中…</p>}
      {error && (
        <p role="alert" className="text-sm text-danger-700">
          {getErrorMessage(error)}
        </p>
      )}
      {summary && (
        <>
          <p className="mt-2 text-sm text-text-secondary">
            已花費 <span className="text-expense-700">{summary.spent_amount}</span> / 上限{' '}
            {summary.limit_amount}
          </p>
          {/* design-spec §2.3 meter 樣式：track = 該狀態色淡階、fill = 該狀態色 */}
          <div
            className={`mt-2 h-2 w-full overflow-hidden rounded-full ${METER_TRACK_CLASSNAME[state]}`}
          >
            <div
              data-testid="budget-progress-bar"
              className={`h-2 rounded-full ${METER_FILL_CLASSNAME[state]}`}
              style={{ width: `${meterFillWidthPercent(percent)}%` }}
            />
          </div>
          {/* icon + 文字並行，不單靠顏色（design-spec §2.3） */}
          <p
            role={state === 'danger' ? 'alert' : undefined}
            className={`mt-1 flex items-center gap-1 text-sm font-medium ${METER_TEXT_CLASSNAME[state]}`}
          >
            <span aria-hidden="true">{METER_ICON[state]}</span>
            {meterText(state, percent, summary.remaining_amount)}
          </p>
        </>
      )}
    </CurvedCard>
  )
}

function BudgetProgressList(): ReactNode {
  const { data: categories } = useListCategoryOptionsQuery()
  const { data, isLoading, error } = useListBudgetsQuery()

  const categoryNameByUid = new Map((categories ?? []).map((c) => [c.category_uid, c.name]))
  const items = data?.items ?? []

  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold text-text-primary">預算進度</h2>
      {isLoading && <p className="text-text-secondary">載入中…</p>}
      {error && (
        <p role="alert" className="text-sm text-danger-700">
          {getErrorMessage(error)}
        </p>
      )}
      {!isLoading && !error && items.length === 0 && (
        <p className="text-text-secondary">尚未設定預算</p>
      )}
      {!isLoading && !error && items.length > 0 && (
        <ul className="flex flex-col gap-3">
          {items.map((budget) => (
            <li key={budget.budget_uid}>
              <BudgetProgressCard
                budget={budget}
                categoryName={categoryNameByUid.get(budget.category_uid) ?? '未知分類'}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

export default function BudgetsPage(): ReactNode {
  return (
    <AuthGuard>
      <AppShell>
        <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-10 bg-bg p-6">
          <h1 className="text-2xl font-bold text-text-primary md:text-3xl">預算</h1>
          <BudgetForm />
          <BudgetProgressList />
        </main>
      </AppShell>
    </AuthGuard>
  )
}
