'use client'

import { useState, type FormEvent, type ReactNode } from 'react'
import { cva } from 'class-variance-authority'
import type { FetchBaseQueryError } from '@reduxjs/toolkit/query/react'
import type { SerializedError } from '@reduxjs/toolkit'
import { AuthGuard } from '@/components/AuthGuard'
import { AppShell } from '@/components/common/AppShell'
import { CurvedCard } from '@/components/common/CurvedCard'
import {
  useCreateRecurringRuleMutation,
  useListRecurringRulesQuery,
  type RecurringIntervalUnit,
  type RecurringRuleResponse,
} from '@/lib/api/recurringApi'
import {
  useListAccountOptionsQuery,
  useListCategoryOptionsQuery,
  type TransactionType,
} from '@/lib/api/transactionsApi'

const MIN_INTERVAL_COUNT = 1
const MAX_INTERVAL_COUNT = 99

// 同 budgets/page.tsx（task-023）／原 TransactionForm.tsx（FE-029）：錯誤處理必用型別收窄，
// 禁 `error as any`。本 task（task-022）affected_files 只列 app/recurring/page.tsx /
// page.test.tsx / lib/api/recurringApi.ts，依 design-spec §9.5 只做視覺重新套用（沿用既有資料 /
// 互動邏輯），未含共用 utils 檔，依既有慣例在頁面內各自實作。
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

// 後端 interval_count 為 Field(ge=1, le=99)（backend/app/schemas/recurring_rule.py：task-003）；
// 這裡在送出前先做同範圍檢查並用中文訊息提示，避免無效值打到 API 才被 422 擋下。
function validateIntervalCount(value: string): string | null {
  if (value.trim() === '') return '請輸入間隔數'
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < MIN_INTERVAL_COUNT || parsed > MAX_INTERVAL_COUNT) {
    return `間隔數必須介於 ${MIN_INTERVAL_COUNT} 到 ${MAX_INTERVAL_COUNT} 之間`
  }
  return null
}

function validateAnchorDate(value: string): string | null {
  if (value.trim() === '') return '請選擇起算日'
  return null
}

const INTERVAL_UNIT_LABEL: Record<RecurringIntervalUnit, string> = {
  week: '週',
  month: '月',
  year: '年',
}

const INTERVAL_UNIT_OPTIONS: RecurringIntervalUnit[] = ['week', 'month', 'year']

// design-spec §7.2：週期描述文字由 interval_unit + interval_count 組合（例「每 2 週」「每年」）；
// interval_unit=month 且 interval_count=1 時額外附上 anchor_date 的日部分，維持升級前
// 「每月第 N 天」的語意（task-022 Acceptance）。anchor_date 為 `YYYY-MM-DD`（date input 原生格式，
// 對齊後端 `date` 型別），直接切字串取日部分，不解析成 Date 物件以避免時區位移。
function anchorDayOfMonth(anchorDate: string): string {
  return anchorDate.slice(8, 10).replace(/^0/, '')
}

function intervalDescription(rule: RecurringRuleResponse): string {
  const unitLabel = INTERVAL_UNIT_LABEL[rule.interval_unit]
  const base = rule.interval_count === 1 ? `每${unitLabel}` : `每 ${rule.interval_count} ${unitLabel}`
  if (rule.interval_unit === 'month') {
    return `${base}第 ${anchorDayOfMonth(rule.anchor_date)} 天`
  }
  return base
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

// design-spec §2.3：金額語意色（收入 income-700 / 支出 expense-700），badge 底色用 100 階。
const TRANSACTION_TYPE_LABEL: Record<TransactionType, string> = { income: '收入', expense: '支出' }
const TRANSACTION_TYPE_BADGE_CLASSNAME: Record<TransactionType, string> = {
  income: 'bg-income-100 text-income-700',
  expense: 'bg-expense-100 text-expense-700',
}
const TRANSACTION_TYPE_AMOUNT_CLASSNAME: Record<TransactionType, string> = {
  income: 'text-income-700',
  expense: 'text-expense-700',
}

function RecurringRuleForm(): ReactNode {
  const { data: accounts } = useListAccountOptionsQuery()
  const { data: categories } = useListCategoryOptionsQuery()
  const [createRecurringRule, { isLoading, error }] = useCreateRecurringRuleMutation()

  const [accountUid, setAccountUid] = useState('')
  const [categoryUid, setCategoryUid] = useState('')
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [transactionType, setTransactionType] = useState<TransactionType>('expense')
  const [paymentMethod, setPaymentMethod] = useState('')
  const [intervalUnit, setIntervalUnit] = useState<RecurringIntervalUnit>('month')
  const [intervalCount, setIntervalCount] = useState('1')
  const [anchorDate, setAnchorDate] = useState('')
  const [validationError, setValidationError] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    const intervalCountError = validateIntervalCount(intervalCount)
    if (intervalCountError) {
      setValidationError(intervalCountError)
      return
    }
    const anchorDateError = validateAnchorDate(anchorDate)
    if (anchorDateError) {
      setValidationError(anchorDateError)
      return
    }
    setValidationError(null)
    try {
      await createRecurringRule({
        account_uid: accountUid,
        category_uid: categoryUid,
        description,
        amount,
        transaction_type: transactionType,
        payment_method: paymentMethod,
        interval_unit: intervalUnit,
        interval_count: Number(intervalCount),
        anchor_date: anchorDate,
      }).unwrap()
      setDescription('')
      setAmount('')
      setPaymentMethod('')
      setIntervalUnit('month')
      setIntervalCount('1')
      setAnchorDate('')
    } catch {
      // 錯誤已透過 createRecurringRule() 的 error 狀態顯示，這裡只需擋掉 unwrap() 的 rejection
    }
  }

  const displayedError = validationError ?? getErrorMessage(error)

  return (
    <CurvedCard>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
        <h2 className="text-lg font-semibold text-text-primary">新增週期性交易規則</h2>
        <label className="flex flex-col gap-1">
          <span className="text-sm text-text-secondary">收支類型</span>
          <select
            value={transactionType}
            onChange={(event) => setTransactionType(event.target.value as TransactionType)}
            className="min-h-11 rounded-md border border-border bg-surface px-3 text-text-primary"
          >
            <option value="expense">支出</option>
            <option value="income">收入</option>
          </select>
        </label>
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
          <span className="text-sm text-text-secondary">帳戶</span>
          <select
            required
            value={accountUid}
            onChange={(event) => setAccountUid(event.target.value)}
            className="min-h-11 rounded-md border border-border bg-surface px-3 text-text-primary"
          >
            <option value="">請選擇帳戶</option>
            {(accounts ?? []).map((account) => (
              <option key={account.account_uid} value={account.account_uid}>
                {account.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm text-text-secondary">說明</span>
          <input
            type="text"
            required
            maxLength={255}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            className="min-h-11 rounded-md border border-border bg-surface px-3 text-text-primary"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm text-text-secondary">金額</span>
          <input
            type="number"
            required
            min="0.01"
            step="0.01"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            className="min-h-11 rounded-md border border-border bg-surface px-3 text-text-primary"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm text-text-secondary">支付方式</span>
          <input
            type="text"
            required
            maxLength={50}
            placeholder="現金 / 信用卡 / 轉帳…"
            value={paymentMethod}
            onChange={(event) => setPaymentMethod(event.target.value)}
            className="min-h-11 rounded-md border border-border bg-surface px-3 text-text-primary"
          />
        </label>
        {/* design-spec §7.2：週期單位（週/月/年）全面開放，取代 v1.0.0 只能選「每月第 N 天」 */}
        <label className="flex flex-col gap-1">
          <span className="text-sm text-text-secondary">週期單位</span>
          <select
            value={intervalUnit}
            onChange={(event) => setIntervalUnit(event.target.value as RecurringIntervalUnit)}
            className="min-h-11 rounded-md border border-border bg-surface px-3 text-text-primary"
          >
            {INTERVAL_UNIT_OPTIONS.map((unit) => (
              <option key={unit} value={unit}>
                {INTERVAL_UNIT_LABEL[unit]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm text-text-secondary">
            每幾個{INTERVAL_UNIT_LABEL[intervalUnit]}執行一次（1–99）
          </span>
          <input
            type="number"
            required
            min={MIN_INTERVAL_COUNT}
            max={MAX_INTERVAL_COUNT}
            step={1}
            value={intervalCount}
            onChange={(event) => setIntervalCount(event.target.value)}
            className="min-h-11 rounded-md border border-border bg-surface px-3 text-text-primary"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm text-text-secondary">起算日</span>
          <input
            type="date"
            required
            value={anchorDate}
            onChange={(event) => setAnchorDate(event.target.value)}
            className="min-h-11 rounded-md border border-border bg-surface px-3 text-text-primary"
          />
        </label>
        {displayedError && (
          <p role="alert" className="text-sm text-danger-700">
            {displayedError}
          </p>
        )}
        <button type="submit" disabled={isLoading} className={submitButtonClassName({ isLoading })}>
          {isLoading ? '送出中…' : '新增規則'}
        </button>
      </form>
    </CurvedCard>
  )
}

interface RecurringRuleCardProps {
  rule: RecurringRuleResponse
  accountName: string
  categoryName: string
}

function RecurringRuleCard({ rule, accountName, categoryName }: RecurringRuleCardProps): ReactNode {
  return (
    <CurvedCard>
      <div className="flex items-center justify-between">
        <span className="font-medium text-text-primary">{rule.description}</span>
        <span
          className={`rounded-full px-2 py-0.5 text-xs ${TRANSACTION_TYPE_BADGE_CLASSNAME[rule.transaction_type]}`}
        >
          {TRANSACTION_TYPE_LABEL[rule.transaction_type]}
        </span>
      </div>
      <p className="mt-2 text-sm text-text-secondary">
        {categoryName} · {accountName} · {rule.payment_method}
      </p>
      <div className="mt-2 flex items-center justify-between">
        <span className="text-sm text-text-secondary">{intervalDescription(rule)}</span>
        <span className={`font-semibold ${TRANSACTION_TYPE_AMOUNT_CLASSNAME[rule.transaction_type]}`}>
          {rule.amount}
        </span>
      </div>
    </CurvedCard>
  )
}

function RecurringRuleList(): ReactNode {
  const { data: accounts } = useListAccountOptionsQuery()
  const { data: categories } = useListCategoryOptionsQuery()
  const { data, isLoading, error } = useListRecurringRulesQuery()

  const items = data?.items ?? []
  const accountNameByUid = new Map((accounts ?? []).map((a) => [a.account_uid, a.name]))
  const categoryNameByUid = new Map((categories ?? []).map((c) => [c.category_uid, c.name]))

  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold text-text-primary">週期性交易規則清單</h2>
      {isLoading && <p className="text-text-secondary">載入中…</p>}
      {error && (
        <p role="alert" className="text-sm text-danger-700">
          {getErrorMessage(error)}
        </p>
      )}
      {!isLoading && !error && items.length === 0 && (
        <p className="text-text-secondary">尚未設定任何週期性交易規則</p>
      )}
      {!isLoading && !error && items.length > 0 && (
        <ul className="flex flex-col gap-3">
          {items.map((rule) => (
            <li key={rule.recurring_rule_uid}>
              <RecurringRuleCard
                rule={rule}
                accountName={accountNameByUid.get(rule.account_uid) ?? '—'}
                categoryName={categoryNameByUid.get(rule.category_uid) ?? '—'}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

export default function RecurringRulesPage(): ReactNode {
  return (
    <AuthGuard>
      <AppShell>
        <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-10 bg-bg p-6">
          <h1 className="text-2xl font-bold text-text-primary md:text-3xl">週期性交易</h1>
          <RecurringRuleForm />
          <RecurringRuleList />
        </main>
      </AppShell>
    </AuthGuard>
  )
}
