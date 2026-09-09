import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NetWorthCard } from './NetWorthCard'
import type { AccountResponse } from '@/lib/api/accountsApi'
import type { NetWorthAssetItem } from '@/lib/api/assetsApi'

const CASH_ACCOUNT: AccountResponse = {
  account_uid: 'a-cash',
  name: '現金',
  balance: '12000.00',
  currency: 'TWD',
  color: '#8B6ED6',
  icon: 'wallet',
}

const BANK_ACCOUNT: AccountResponse = {
  account_uid: 'a-bank',
  name: '銀行',
  balance: '61000.00',
  currency: 'TWD',
  color: '#3E8FD0',
  icon: 'bank',
}

const ACCOUNTS: AccountResponse[] = [CASH_ACCOUNT, BANK_ACCOUNT]

const NET_WORTH = {
  total_assets: '150000.00',
  total_liabilities: '50000.00',
  net_worth: '100000.00',
  assets: [] as NetWorthAssetItem[],
}

const STOCK_ASSET: NetWorthAssetItem = {
  financial_asset_uid: 'fa-1',
  asset_type: 'stock',
  name: '2330',
  market_value: '1200000.00',
  principal_amount: '60000.00',
  gain_percent: '1900.00',
}

const METAL_ASSET: NetWorthAssetItem = {
  financial_asset_uid: 'fa-2',
  asset_type: 'metal',
  name: '黃金',
  market_value: '20000.00',
  principal_amount: '30000.00',
  gain_percent: '-33.33',
}

describe('NetWorthCard', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('列出帳戶餘額與淨資產彙總', () => {
    render(
      <NetWorthCard accounts={ACCOUNTS} netWorth={NET_WORTH} isLoading={false} onRetry={vi.fn()} />,
    )

    expect(screen.getByText('現金')).toBeInTheDocument()
    expect(screen.getByText('NT$12,000')).toBeInTheDocument()
    expect(screen.getByText('銀行')).toBeInTheDocument()
    expect(screen.getByText('NT$61,000')).toBeInTheDocument()

    expect(screen.getByText('總資產')).toBeInTheDocument()
    expect(screen.getByText('NT$150,000')).toBeInTheDocument()
    expect(screen.getByText('總負債')).toBeInTheDocument()
    expect(screen.getByText('NT$50,000')).toBeInTheDocument()
    expect(screen.getByText('淨資產')).toBeInTheDocument()
    expect(screen.getByText('NT$100,000')).toBeInTheDocument()

    expect(screen.getByRole('link', { name: '查看全部 / 管理帳戶 →' })).toHaveAttribute('href', '/accounts')
  })

  it('超過 4 個帳戶時只列前 4 個並提示其餘數量（漸進揭露，→ A4）', () => {
    const many: AccountResponse[] = Array.from({ length: 6 }, (_, index) => ({
      ...CASH_ACCOUNT,
      account_uid: `a-${index}`,
      name: `帳戶${index}`,
    }))
    render(<NetWorthCard accounts={many} netWorth={NET_WORTH} isLoading={false} onRetry={vi.fn()} />)

    expect(screen.getByText('帳戶3')).toBeInTheDocument()
    expect(screen.queryByText('帳戶4')).not.toBeInTheDocument()
    expect(screen.getByText('另有 2 個帳戶未顯示')).toBeInTheDocument()
  })

  it('沒有帳戶時顯示空狀態', () => {
    render(<NetWorthCard accounts={[]} netWorth={NET_WORTH} isLoading={false} onRetry={vi.fn()} />)
    expect(screen.getByText('尚未建立任何帳戶')).toBeInTheDocument()
  })

  it('列出浮動資產市值與對比本金的漲跌幅（預設紅漲綠跌，→ usePriceColorPreference）', () => {
    render(
      <NetWorthCard
        accounts={ACCOUNTS}
        netWorth={{ ...NET_WORTH, assets: [STOCK_ASSET, METAL_ASSET] }}
        isLoading={false}
        onRetry={vi.fn()}
      />,
    )

    expect(screen.getByText('浮動資產')).toBeInTheDocument()
    expect(screen.getByText('2330')).toBeInTheDocument()
    expect(screen.getByText('NT$1,200,000')).toBeInTheDocument()
    expect(screen.getByText('+1900.00%')).toHaveClass('text-expense-600')

    expect(screen.getByText('黃金')).toBeInTheDocument()
    expect(screen.getByText('NT$20,000')).toBeInTheDocument()
    expect(screen.getByText('-33.33%')).toHaveClass('text-income-600')
  })

  it('沒有浮動資產時不顯示浮動資產區塊', () => {
    render(<NetWorthCard accounts={ACCOUNTS} netWorth={NET_WORTH} isLoading={false} onRetry={vi.fn()} />)
    expect(screen.queryByText('浮動資產')).not.toBeInTheDocument()
  })

  it('載入中顯示提示，不顯示淨資產數字', () => {
    render(<NetWorthCard accounts={ACCOUNTS} isLoading onRetry={vi.fn()} />)

    expect(screen.getByText('載入中…')).toBeInTheDocument()
    expect(screen.queryByText('總資產')).not.toBeInTheDocument()
  })

  it('報價服務回 424 時顯示可重試提示，不當一般錯誤處理', () => {
    const onRetry = vi.fn()
    render(
      <NetWorthCard
        accounts={ACCOUNTS}
        isLoading={false}
        error={{ status: 424, data: { detail: '報價服務暫時無法使用，請稍後再試' } }}
        onRetry={onRetry}
      />,
    )

    expect(screen.getByRole('alert')).toHaveTextContent(
      '報價服務暫時無法使用，總資產 / 淨資產暫時無法計算，請稍後再試。',
    )
    fireEvent.click(screen.getByRole('button', { name: '重試' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('一般錯誤（非 424）顯示錯誤訊息且無重試按鈕', () => {
    render(
      <NetWorthCard
        accounts={ACCOUNTS}
        isLoading={false}
        error={{ status: 500, data: { detail: '伺服器錯誤' } }}
        onRetry={vi.fn()}
      />,
    )

    expect(screen.getByRole('alert')).toHaveTextContent('伺服器錯誤')
    expect(screen.queryByRole('button', { name: '重試' })).not.toBeInTheDocument()
  })
})
