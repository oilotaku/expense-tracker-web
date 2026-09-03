'use client'

import { useState, type ChangeEvent, type ReactNode } from 'react'
import type { FetchBaseQueryError } from '@reduxjs/toolkit/query/react'
import type { SerializedError } from '@reduxjs/toolkit'
import { useListCategoryOptionsQuery, useListTransactionsQuery } from '@/lib/api/transactionsApi'
import { formatDateTime } from '@/utils/datetime'

// 顯示時區固定 Asia/Taipei、全年 +08:00 無 DST（→ CORE-041）；篩選用的 <input type="date">
// 只給純日期（無 offset），送出前轉成該日的起 / 迄時刻 ISO 字串（FE-039），與 TransactionForm.tsx
// 的 localInputToIso 為同一轉換邏輯的日期特化版本。
function dateFromStartOfDayIso(date: string): string {
  return `${date}T00:00:00+08:00`
}

function dateToEndOfDayIso(date: string): string {
  return `${date}T23:59:59+08:00`
}

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

export function TransactionList(): ReactNode {
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [categoryUid, setCategoryUid] = useState('')

  const { data: categories } = useListCategoryOptionsQuery()
  const {
    data,
    isLoading,
    error: listError,
  } = useListTransactionsQuery({
    category_uid: categoryUid || undefined,
    date_from: dateFrom ? dateFromStartOfDayIso(dateFrom) : undefined,
    date_to: dateTo ? dateToEndOfDayIso(dateTo) : undefined,
  })

  function handleDateFromChange(event: ChangeEvent<HTMLInputElement>): void {
    setDateFrom(event.target.value)
  }

  function handleDateToChange(event: ChangeEvent<HTMLInputElement>): void {
    setDateTo(event.target.value)
  }

  function handleCategoryChange(event: ChangeEvent<HTMLSelectElement>): void {
    setCategoryUid(event.target.value)
  }

  const items = data?.items ?? []

  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">交易清單</h2>
      <div className="flex flex-wrap gap-4">
        <label className="flex flex-col gap-1">
          <span className="text-sm">起始日期</span>
          <input
            type="date"
            value={dateFrom}
            onChange={handleDateFromChange}
            className="min-h-11 rounded border px-3"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm">結束日期</span>
          <input
            type="date"
            value={dateTo}
            onChange={handleDateToChange}
            className="min-h-11 rounded border px-3"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm">分類</span>
          <select
            value={categoryUid}
            onChange={handleCategoryChange}
            className="min-h-11 rounded border px-3"
          >
            <option value="">全部分類</option>
            {(categories ?? []).map((category) => (
              <option key={category.category_uid} value={category.category_uid}>
                {category.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {isLoading && <p>載入中…</p>}
      {listError && (
        <p role="alert" className="text-sm text-red-600">
          {getErrorMessage(listError)}
        </p>
      )}
      {!isLoading && !listError && items.length === 0 && <p>沒有符合條件的交易</p>}
      {!isLoading && !listError && items.length > 0 && (
        <table className="w-full text-left text-sm">
          <thead>
            <tr>
              <th className="p-2">日期時間</th>
              <th className="p-2">類型</th>
              <th className="p-2">說明</th>
              <th className="p-2">金額</th>
              <th className="p-2">支付方式</th>
              <th className="p-2">標籤</th>
            </tr>
          </thead>
          <tbody>
            {items.map((transaction) => (
              <tr key={transaction.transaction_uid} className="border-t">
                <td className="p-2">{formatDateTime(transaction.transaction_date)}</td>
                <td className="p-2">{transaction.transaction_type === 'income' ? '收入' : '支出'}</td>
                <td className="p-2">{transaction.description}</td>
                <td className="p-2">{transaction.amount}</td>
                <td className="p-2">{transaction.payment_method}</td>
                <td className="p-2">{transaction.tags.map((tag) => tag.name).join(', ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}
