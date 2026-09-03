'use client'

import { useState, type FormEvent, type ReactNode } from 'react'
import type { FetchBaseQueryError } from '@reduxjs/toolkit/query/react'
import type { SerializedError } from '@reduxjs/toolkit'
import {
  useCreateTransactionMutation,
  useListAccountOptionsQuery,
  useListCategoryOptionsQuery,
  type TransactionType,
} from '@/lib/api/transactionsApi'

// 顯示時區固定 Asia/Taipei、全年 +08:00 無 DST（→ CORE-041，同 utils/datetime.ts 的 TZ）。
// FE-043 要求的 utils/datetime.ts `toLocalInput` / `fromLocalInput` 尚未落地，該檔不在
// task-006 affected_files 內、不可新增匯出，故在此元件內部實作等價轉換，僅供本表單使用。
const API_TZ_OFFSET = '+08:00'

function nowAsLocalInputValue(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date())
  const p = Object.fromEntries(parts.map(({ type, value }) => [type, value]))
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`
}

// value 是 <input type="datetime-local"> 的無 offset 牆鐘字串（FE-043），視為 Asia/Taipei 時刻
function localInputToIso(value: string): string {
  return `${value}:00${API_TZ_OFFSET}`
}

function parseTagsInput(value: string): string[] {
  const seen = new Set<string>()
  for (const raw of value.split(',')) {
    const trimmed = raw.trim()
    if (trimmed) seen.add(trimmed)
  }
  return [...seen]
}

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

export function TransactionForm(): ReactNode {
  const { data: accounts } = useListAccountOptionsQuery()
  const { data: categories } = useListCategoryOptionsQuery()
  const [createTransaction, { isLoading, error }] = useCreateTransactionMutation()

  const [transactionDate, setTransactionDate] = useState(() => nowAsLocalInputValue())
  const [accountUid, setAccountUid] = useState('')
  const [categoryUid, setCategoryUid] = useState('')
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [transactionType, setTransactionType] = useState<TransactionType>('expense')
  const [paymentMethod, setPaymentMethod] = useState('')
  const [tagsInput, setTagsInput] = useState('')

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    try {
      await createTransaction({
        account_uid: accountUid,
        category_uid: categoryUid,
        transaction_date: localInputToIso(transactionDate),
        description,
        amount,
        transaction_type: transactionType,
        payment_method: paymentMethod,
        tags: parseTagsInput(tagsInput),
      }).unwrap()
      setDescription('')
      setAmount('')
      setPaymentMethod('')
      setTagsInput('')
      setTransactionDate(nowAsLocalInputValue())
    } catch {
      // 錯誤已透過 createTransaction() 的 error 狀態顯示，這裡只需擋掉 unwrap() 的 rejection
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      <h2 className="text-lg font-semibold">新增交易</h2>
      <label className="flex flex-col gap-1">
        <span className="text-sm">日期時間</span>
        <input
          type="datetime-local"
          required
          value={transactionDate}
          onChange={(event) => setTransactionDate(event.target.value)}
          className="min-h-11 rounded border px-3"
        />
      </label>
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
        <span className="text-sm">標籤（以逗號分隔，可留空）</span>
        <input
          type="text"
          placeholder="早餐, 聚餐"
          value={tagsInput}
          onChange={(event) => setTagsInput(event.target.value)}
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
        {isLoading ? '送出中…' : '新增交易'}
      </button>
    </form>
  )
}
