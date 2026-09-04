'use client'

import { useState, type FormEvent, type ReactNode } from 'react'
import type { FetchBaseQueryError } from '@reduxjs/toolkit/query/react'
import type { SerializedError } from '@reduxjs/toolkit'
import { AuthGuard } from '@/components/AuthGuard'
import { useListCategoryOptionsQuery } from '@/lib/api/transactionsApi'
import {
  useCreateBudgetMutation,
  useGetBudgetSummaryQuery,
  useListBudgetsQuery,
  type BudgetPeriodType,
  type BudgetResponse,
} from '@/lib/api/budgetsApi'

// 同 TransactionForm.tsx / TransactionList.tsx（FE-029）：錯誤處理必用型別收窄，禁 `error as any`。
// 本 task（task-010）affected_files 只列 budgetsApi.ts / app/budgets/page.tsx，未含共用 utils 檔，
// 依既有慣例（見 transactionsApi.ts 頂部同一備註）在頁面內各自實作，不擴大 scope 新增共用檔。
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

// FE-052：條件樣式禁 inline 三元串接重複；集中抽成純函式管理超支警示樣式。
function progressContainerClassName(isOverBudget: boolean): string {
  return isOverBudget ? 'rounded border border-red-600 bg-red-50 p-4' : 'rounded border p-4'
}

function progressBarClassName(isOverBudget: boolean): string {
  return isOverBudget ? 'h-2 rounded bg-red-600' : 'h-2 rounded bg-blue-600'
}

function remainingClassName(isOverBudget: boolean): string {
  return isOverBudget ? 'mt-1 text-sm font-semibold text-red-600' : 'mt-1 text-sm text-gray-600'
}

function remainingLabel(isOverBudget: boolean): string {
  return isOverBudget ? '已超支' : '剩餘'
}

// 僅供進度條寬度視覺呈現，非金額計算；金額顯示一律用後端原始字串（→ DB-038），不因此改用
// number 型別承載金額本身。
function progressPercent(spentAmount: string, limitAmount: string): number {
  const limit = Number(limitAmount)
  if (!Number.isFinite(limit) || limit <= 0) return 0
  const spent = Number(spentAmount)
  if (!Number.isFinite(spent)) return 0
  return Math.min(100, Math.max(0, (spent / limit) * 100))
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
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      <h2 className="text-lg font-semibold">新增預算</h2>
      <label className="flex flex-col gap-1">
        <span className="text-sm">分類</span>
        <select
          required
          value={categoryUid}
          onChange={(event) => setCategoryUid(event.target.value)}
          className="min-h-11 rounded border px-3"
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
        <span className="text-sm">期間</span>
        <select
          value={periodType}
          onChange={(event) => setPeriodType(event.target.value as BudgetPeriodType)}
          className="min-h-11 rounded border px-3"
        >
          <option value="monthly">每月</option>
          <option value="daily">每日</option>
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-sm">上限金額</span>
        <input
          type="number"
          required
          min="0.01"
          step="0.01"
          value={limitAmount}
          onChange={(event) => setLimitAmount(event.target.value)}
          className="min-h-11 rounded border px-3"
        />
      </label>
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {getErrorMessage(error)}
        </p>
      )}
      <button
        type="submit"
        disabled={isLoading}
        className="min-h-11 rounded border px-4 disabled:opacity-50"
      >
        {isLoading ? '送出中…' : '新增預算'}
      </button>
    </form>
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
  const isOverBudget = summary?.is_over_budget ?? false

  return (
    <li className={progressContainerClassName(isOverBudget)}>
      <div className="flex items-center justify-between">
        <span className="font-medium">{categoryName}</span>
        <span className="text-sm">{periodTypeLabel(budget.period_type)}</span>
      </div>
      {isLoading && <p className="text-sm">載入中…</p>}
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {getErrorMessage(error)}
        </p>
      )}
      {summary && (
        <>
          <div className="mt-2 h-2 w-full rounded bg-gray-200">
            <div
              data-testid="budget-progress-bar"
              className={progressBarClassName(isOverBudget)}
              style={{ width: `${progressPercent(summary.spent_amount, summary.limit_amount)}%` }}
            />
          </div>
          <p className="mt-1 text-sm">
            已花費 {summary.spent_amount} / 上限 {summary.limit_amount}
          </p>
          <p role={isOverBudget ? 'alert' : undefined} className={remainingClassName(isOverBudget)}>
            {remainingLabel(isOverBudget)} {summary.remaining_amount}
          </p>
        </>
      )}
    </li>
  )
}

function BudgetProgressList(): ReactNode {
  const { data: categories } = useListCategoryOptionsQuery()
  const { data, isLoading, error } = useListBudgetsQuery()

  const categoryNameByUid = new Map((categories ?? []).map((c) => [c.category_uid, c.name]))
  const items = data?.items ?? []

  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">預算進度</h2>
      {isLoading && <p>載入中…</p>}
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {getErrorMessage(error)}
        </p>
      )}
      {!isLoading && !error && items.length === 0 && <p>尚未設定預算</p>}
      {!isLoading && !error && items.length > 0 && (
        <ul className="flex flex-col gap-3">
          {items.map((budget) => (
            <BudgetProgressCard
              key={budget.budget_uid}
              budget={budget}
              categoryName={categoryNameByUid.get(budget.category_uid) ?? '未知分類'}
            />
          ))}
        </ul>
      )}
    </section>
  )
}

export default function BudgetsPage(): ReactNode {
  return (
    <AuthGuard>
      <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-10 p-6">
        <h1 className="text-2xl font-bold">預算</h1>
        <BudgetForm />
        <BudgetProgressList />
      </main>
    </AuthGuard>
  )
}
