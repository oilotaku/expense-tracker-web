'use client'

import type { ReactNode } from 'react'
import type { FetchBaseQueryError } from '@reduxjs/toolkit/query/react'
import type { SerializedError } from '@reduxjs/toolkit'
import { AuthGuard } from '@/components/AuthGuard'
import { useGetNetWorthQuery } from '@/lib/api/assetsApi'

// 同 AssetsPage / BudgetsPage（FE-029）：錯誤處理必用型別收窄，禁 `error as any`。
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

// GET /api/v1/net-worth 在上游報價來源（TWSE MIS / gold-api）暫時不可用時回 424（非 5xx，
// → backend/app/services/net_worth_service.py NetWorthPricingUnavailableError）。這裡不視為
// 一般錯誤崩潰，而是顯示可重試的提示，讓使用者知道問題出在外部報價來源，而非本頁故障。
function isPricingUnavailable(error: FetchBaseQueryError | SerializedError | undefined): boolean {
  return error !== undefined && 'status' in error && error.status === 424
}

interface NetWorthCardProps {
  label: string
  value: string
}

function NetWorthCard({ label, value }: NetWorthCardProps): ReactNode {
  return (
    <div className="rounded border p-4">
      <p className="text-sm text-gray-600">{label}</p>
      <p className="text-2xl font-bold">{value}</p>
    </div>
  )
}

export default function DashboardPage(): ReactNode {
  const { data, isLoading, error, refetch } = useGetNetWorthQuery()

  return (
    <AuthGuard>
      <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 p-6">
        <h1 className="text-2xl font-bold">總覽</h1>
        {isLoading && <p>載入中…</p>}
        {error && isPricingUnavailable(error) && (
          <div role="alert" className="flex flex-col gap-2 rounded border border-red-600 bg-red-50 p-4">
            <p className="text-sm text-red-600">
              報價服務暫時無法使用，總資產 / 淨資產暫時無法計算，請稍後再試。
            </p>
            <button
              type="button"
              onClick={() => {
                void refetch()
              }}
              className="min-h-11 self-start rounded border px-4"
            >
              重試
            </button>
          </div>
        )}
        {error && !isPricingUnavailable(error) && (
          <p role="alert" className="text-sm text-red-600">
            {getErrorMessage(error)}
          </p>
        )}
        {!isLoading && !error && data && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <NetWorthCard label="總資產" value={data.total_assets} />
            <NetWorthCard label="總負債" value={data.total_liabilities} />
            <NetWorthCard label="淨資產" value={data.net_worth} />
          </div>
        )}
      </main>
    </AuthGuard>
  )
}
