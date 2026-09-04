'use client'

import { useState, type FormEvent, type ReactNode } from 'react'
import type { FetchBaseQueryError } from '@reduxjs/toolkit/query/react'
import type { SerializedError } from '@reduxjs/toolkit'
import { AuthGuard } from '@/components/AuthGuard'
import {
  useCreateRecurringRuleMutation,
  useListRecurringRulesQuery,
} from '@/lib/api/recurringApi'
import {
  useListAccountOptionsQuery,
  useListCategoryOptionsQuery,
  type TransactionType,
} from '@/lib/api/transactionsApi'

const MIN_DAY_OF_MONTH = 1
const MAX_DAY_OF_MONTH = 31

// FE-029：錯誤處理必用型別收窄（'status' in error 判 FetchBaseQueryError），禁 `error as any`。
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

// 後端 day_of_month 為 Field(ge=1, le=31)（backend/app/schemas/recurring_rule.py）；這裡在送出前
// 先做同範圍檢查並用中文訊息提示，避免無效值打到 API 才被 422 擋下。
function validateDayOfMonth(value: string): string | null {
  if (value.trim() === '') return '請輸入每月第幾天'
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < MIN_DAY_OF_MONTH || parsed > MAX_DAY_OF_MONTH) {
    return `每月第幾天必須介於 ${MIN_DAY_OF_MONTH} 到 ${MAX_DAY_OF_MONTH} 之間`
  }
  return null
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
  const [dayOfMonth, setDayOfMonth] = useState('')
  const [validationError, setValidationError] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    const dayOfMonthError = validateDayOfMonth(dayOfMonth)
    if (dayOfMonthError) {
      setValidationError(dayOfMonthError)
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
        day_of_month: Number(dayOfMonth),
      }).unwrap()
      setDescription('')
      setAmount('')
      setPaymentMethod('')
      setDayOfMonth('')
    } catch {
      // 錯誤已透過 createRecurringRule() 的 error 狀態顯示，這裡只需擋掉 unwrap() 的 rejection
    }
  }

  const displayedError = validationError ?? getErrorMessage(error)

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      <h2 className="text-lg font-semibold">新增週期性交易規則</h2>
      <label className="flex flex-col gap-1">
        <span className="text-sm">收支類型</span>
        <select
          value={transactionType}
          onChange={(event) => setTransactionType(event.target.value as TransactionType)}
          className="min-h-11 rounded border px-3"
        >
          <option value="expense">支出</option>
          <option value="income">收入</option>
        </select>
      </label>
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
        <span className="text-sm">帳戶</span>
        <select
          required
          value={accountUid}
          onChange={(event) => setAccountUid(event.target.value)}
          className="min-h-11 rounded border px-3"
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
        <span className="text-sm">說明</span>
        <input
          type="text"
          required
          maxLength={255}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          className="min-h-11 rounded border px-3"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-sm">金額</span>
        <input
          type="number"
          required
          min="0.01"
          step="0.01"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          className="min-h-11 rounded border px-3"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-sm">支付方式</span>
        <input
          type="text"
          required
          maxLength={50}
          placeholder="現金 / 信用卡 / 轉帳…"
          value={paymentMethod}
          onChange={(event) => setPaymentMethod(event.target.value)}
          className="min-h-11 rounded border px-3"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-sm">每月第幾天（1–31）</span>
        <input
          type="number"
          required
          min={MIN_DAY_OF_MONTH}
          max={MAX_DAY_OF_MONTH}
          step={1}
          value={dayOfMonth}
          onChange={(event) => setDayOfMonth(event.target.value)}
          className="min-h-11 rounded border px-3"
        />
      </label>
      {displayedError && (
        <p role="alert" className="text-sm text-red-600">
          {displayedError}
        </p>
      )}
      <button
        type="submit"
        disabled={isLoading}
        className="min-h-11 rounded border px-4 disabled:opacity-50"
      >
        {isLoading ? '送出中…' : '新增規則'}
      </button>
    </form>
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
      <h2 className="text-lg font-semibold">週期性交易規則清單</h2>
      {isLoading && <p>載入中…</p>}
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {getErrorMessage(error)}
        </p>
      )}
      {!isLoading && !error && items.length === 0 && <p>尚未設定任何週期性交易規則</p>}
      {!isLoading && !error && items.length > 0 && (
        <table className="w-full text-left text-sm">
          <thead>
            <tr>
              <th className="p-2">每月第幾天</th>
              <th className="p-2">類型</th>
              <th className="p-2">分類</th>
              <th className="p-2">帳戶</th>
              <th className="p-2">說明</th>
              <th className="p-2">金額</th>
              <th className="p-2">支付方式</th>
            </tr>
          </thead>
          <tbody>
            {items.map((rule) => (
              <tr key={rule.recurring_rule_uid} className="border-t">
                <td className="p-2">{rule.day_of_month}</td>
                <td className="p-2">{rule.transaction_type === 'income' ? '收入' : '支出'}</td>
                <td className="p-2">{categoryNameByUid.get(rule.category_uid) ?? '—'}</td>
                <td className="p-2">{accountNameByUid.get(rule.account_uid) ?? '—'}</td>
                <td className="p-2">{rule.description}</td>
                <td className="p-2">{rule.amount}</td>
                <td className="p-2">{rule.payment_method}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}

export default function RecurringRulesPage(): ReactNode {
  return (
    <AuthGuard>
      <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-10 p-6">
        <h1 className="text-2xl font-bold">週期性交易</h1>
        <RecurringRuleForm />
        <RecurringRuleList />
      </main>
    </AuthGuard>
  )
}
