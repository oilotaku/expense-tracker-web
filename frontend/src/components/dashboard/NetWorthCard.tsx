'use client'

import type { ReactNode } from 'react'
import Link from 'next/link'
import type { FetchBaseQueryError } from '@reduxjs/toolkit/query/react'
import type { SerializedError } from '@reduxjs/toolkit'
import { CurvedCard } from '@/components/common/CurvedCard'
import { formatAmount } from '@/components/dashboard/StatTile'
import { usePriceColorPreference } from '@/hooks/usePriceColorPreference'
import type { AccountResponse } from '@/lib/api/accountsApi'
import type { NetWorthAssetItem, NetWorthResponse } from '@/lib/api/assetsApi'

// 同 dashboard/page.tsx 等既有頁面（FE-029）：錯誤處理必用型別收窄，禁 `error as any`。
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
// （v1.0.0 內嵌於 dashboard/page.tsx 的同一段邏輯，task-016 原樣搬入本元件，只改視覺。）
function isPricingUnavailable(error: FetchBaseQueryError | SerializedError | undefined): boolean {
  return error !== undefined && 'status' in error && error.status === 424
}

// 漸進揭露（`→ A4`）：卡片只列前幾個帳戶，其餘導向 /accounts 管理頁，不在 Dashboard 展開全部。
const VISIBLE_ACCOUNTS = 4

interface NetWorthRowProps {
  label: string
  value: string
}

function NetWorthRow({ label, value }: NetWorthRowProps): ReactNode {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-sm text-text-secondary md:text-base">{label}</span>
      <span className="text-base font-semibold tabular-nums text-text-primary md:text-lg">{value}</span>
    </div>
  )
}

interface FloatingAssetRowProps {
  asset: NetWorthAssetItem
}

// gain_percent 為 null 代表無本金可比對（→ assetsApi.ts NetWorthAssetItem 註解），不是 0%，
// 不顯示漲跌幅徽章；漲跌配色（紅漲綠跌／綠漲紅跌）是可調偏好，→ usePriceColorPreference。
function FloatingAssetRow({ asset }: FloatingAssetRowProps): ReactNode {
  const { colorForGain } = usePriceColorPreference()
  const gainPercent = asset.gain_percent === null ? null : Number(asset.gain_percent)
  const gainColor = gainPercent === null ? '' : colorForGain(gainPercent >= 0)

  return (
    <li className="flex items-center justify-between gap-3">
      <span className="truncate text-sm text-text-primary md:text-base">{asset.name}</span>
      <span className="flex shrink-0 items-baseline gap-2">
        <span className="text-sm tabular-nums text-text-primary md:text-base">
          {formatAmount(asset.market_value)}
        </span>
        {gainPercent !== null && (
          <span className={`text-xs tabular-nums md:text-sm ${gainColor}`}>
            {gainPercent >= 0 ? '+' : ''}
            {asset.gain_percent}%
          </span>
        )}
      </span>
    </li>
  )
}

export interface NetWorthCardProps {
  accounts: readonly AccountResponse[]
  netWorth?: NetWorthResponse
  isLoading: boolean
  error?: FetchBaseQueryError | SerializedError
  onRetry: () => void
}

/**
 * 帳戶資產總覽卡（design-spec §9.2 右欄「帳戶總覽」）：上半部列出帳戶與餘額（沿用既有帳戶清單
 * API，資料由父層以 props 傳入，`→ FE-046`），下半部沿用 v1.0.0 `useGetNetWorthQuery` 的總資產 /
 * 總負債 / 淨資產與 424 可重試提示邏輯，只換成新視覺。
 */
export function NetWorthCard({ accounts, netWorth, isLoading, error, onRetry }: NetWorthCardProps): ReactNode {
  const visibleAccounts = accounts.slice(0, VISIBLE_ACCOUNTS)
  const hiddenCount = accounts.length - visibleAccounts.length

  return (
    <CurvedCard className="flex flex-col gap-4">
      <h2 className="text-xl font-semibold text-text-primary md:text-2xl">帳戶總覽</h2>

      {accounts.length === 0 ? (
        <p className="text-sm text-text-secondary md:text-base">尚未建立任何帳戶</p>
      ) : (
        <ul className="flex flex-col gap-2" role="list">
          {visibleAccounts.map((account) => (
            <li key={account.account_uid} className="flex items-center justify-between gap-3">
              <span className="flex min-w-0 items-center gap-2">
                <span
                  aria-hidden
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: account.color }}
                />
                <span className="truncate text-sm text-text-primary md:text-base">{account.name}</span>
              </span>
              {/* 外幣帳戶功能：帳戶餘額用原生幣別顯示（→ AccountCard.tsx 同慣例），不能套
                  formatAmount（固定 NT$ 前綴）——那是假設所有帳戶都是 TWD 的既有 bug。 */}
              <span className="shrink-0 text-sm tabular-nums text-text-primary md:text-base">
                {account.balance} {account.currency}
              </span>
            </li>
          ))}
        </ul>
      )}

      {hiddenCount > 0 && <p className="text-xs text-text-muted">另有 {hiddenCount} 個帳戶未顯示</p>}

      {!isLoading && !error && netWorth && netWorth.assets.length > 0 && (
        <div className="flex flex-col gap-2 border-t border-border pt-4">
          <h3 className="text-sm font-semibold text-text-secondary md:text-base">浮動資產</h3>
          <ul className="flex flex-col gap-2" role="list">
            {netWorth.assets.map((asset) => (
              <FloatingAssetRow key={asset.financial_asset_uid} asset={asset} />
            ))}
          </ul>
        </div>
      )}

      <Link
        href="/accounts"
        className="self-start text-sm font-medium text-primary-600 hover:text-primary-700 md:text-base focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600"
      >
        查看全部 / 管理帳戶 →
      </Link>

      <div className="flex flex-col gap-2 border-t border-border pt-4">
        {isLoading && <p className="text-sm text-text-secondary md:text-base">載入中…</p>}

        {error && isPricingUnavailable(error) && (
          <div role="alert" className="flex flex-col gap-2 rounded-md border border-danger-500 bg-expense-100 p-3">
            <p className="text-sm text-danger-700">
              報價服務暫時無法使用，總資產 / 淨資產暫時無法計算，請稍後再試。
            </p>
            <button
              type="button"
              onClick={onRetry}
              className="min-h-11 self-start rounded-md border border-border bg-surface px-4 text-sm font-medium text-text-primary md:min-h-9 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600"
            >
              重試
            </button>
          </div>
        )}

        {error && !isPricingUnavailable(error) && (
          <p role="alert" className="text-sm text-danger-700">
            {getErrorMessage(error)}
          </p>
        )}

        {!isLoading && !error && netWorth && (
          <>
            <NetWorthRow label="總資產" value={formatAmount(netWorth.total_assets)} />
            <NetWorthRow label="總負債" value={formatAmount(netWorth.total_liabilities)} />
            <NetWorthRow label="淨資產" value={formatAmount(netWorth.net_worth)} />
          </>
        )}
      </div>
    </CurvedCard>
  )
}
