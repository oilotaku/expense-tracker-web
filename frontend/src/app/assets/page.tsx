'use client'

import { useState, type FormEvent, type ReactNode } from 'react'
import type { FetchBaseQueryError } from '@reduxjs/toolkit/query/react'
import type { SerializedError } from '@reduxjs/toolkit'
import { AuthGuard } from '@/components/AuthGuard'
import {
  useCreateFinancialAssetMutation,
  useCreateLiabilityMutation,
  useListFinancialAssetsQuery,
  useListLiabilitiesQuery,
  type FinancialAssetResponse,
  type LiabilityResponse,
  type MetalUnit,
  type StockUnit,
} from '@/lib/api/assetsApi'

// 同 BudgetsPage / RecurringRulesPage（FE-029）：錯誤處理必用型別收窄，禁 `error as any`。
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

function StockAssetForm(): ReactNode {
  const [createFinancialAsset, { isLoading, error }] = useCreateFinancialAssetMutation()

  const [name, setName] = useState('')
  const [quantity, setQuantity] = useState('')
  const [unit, setUnit] = useState<StockUnit>('張')

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    try {
      await createFinancialAsset({
        asset_type: 'stock',
        name,
        input_quantity: quantity,
        input_unit: unit,
      }).unwrap()
      setName('')
      setQuantity('')
      setUnit('張')
    } catch {
      // 錯誤已透過 createFinancialAsset() 的 error 狀態顯示，這裡只需擋掉 unwrap() 的 rejection
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      <h2 className="text-lg font-semibold">新增股票持股</h2>
      <label className="flex flex-col gap-1">
        <span className="text-sm">股票代號 / 名稱</span>
        <input
          type="text"
          required
          maxLength={100}
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="min-h-11 rounded border px-3"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-sm">數量</span>
        <input
          type="number"
          required
          min="0.0001"
          step="0.0001"
          value={quantity}
          onChange={(event) => setQuantity(event.target.value)}
          className="min-h-11 rounded border px-3"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-sm">單位</span>
        <select
          value={unit}
          onChange={(event) => setUnit(event.target.value as StockUnit)}
          className="min-h-11 rounded border px-3"
        >
          <option value="張">張</option>
          <option value="股">股</option>
        </select>
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
        {isLoading ? '送出中…' : '新增股票'}
      </button>
    </form>
  )
}

function MetalAssetForm(): ReactNode {
  const [createFinancialAsset, { isLoading, error }] = useCreateFinancialAssetMutation()

  const [name, setName] = useState('')
  const [quantity, setQuantity] = useState('')
  const [unit, setUnit] = useState<MetalUnit>('錢')

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    try {
      await createFinancialAsset({
        asset_type: 'metal',
        name,
        input_quantity: quantity,
        input_unit: unit,
      }).unwrap()
      setName('')
      setQuantity('')
      setUnit('錢')
    } catch {
      // 錯誤已透過 createFinancialAsset() 的 error 狀態顯示，這裡只需擋掉 unwrap() 的 rejection
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      <h2 className="text-lg font-semibold">新增貴金屬持有</h2>
      <label className="flex flex-col gap-1">
        <span className="text-sm">品項（例：黃金）</span>
        <input
          type="text"
          required
          maxLength={100}
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="min-h-11 rounded border px-3"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-sm">數量</span>
        <input
          type="number"
          required
          min="0.0001"
          step="0.0001"
          value={quantity}
          onChange={(event) => setQuantity(event.target.value)}
          className="min-h-11 rounded border px-3"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-sm">單位</span>
        <select
          value={unit}
          onChange={(event) => setUnit(event.target.value as MetalUnit)}
          className="min-h-11 rounded border px-3"
        >
          <option value="兩">兩</option>
          <option value="錢">錢</option>
        </select>
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
        {isLoading ? '送出中…' : '新增貴金屬'}
      </button>
    </form>
  )
}

function LiabilityForm(): ReactNode {
  const [createLiability, { isLoading, error }] = useCreateLiabilityMutation()

  const [name, setName] = useState('')
  const [amount, setAmount] = useState('')
  const [interestRate, setInterestRate] = useState('')

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    try {
      await createLiability({
        name,
        amount,
        interest_rate: interestRate.trim() === '' ? null : interestRate,
      }).unwrap()
      setName('')
      setAmount('')
      setInterestRate('')
    } catch {
      // 錯誤已透過 createLiability() 的 error 狀態顯示，這裡只需擋掉 unwrap() 的 rejection
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      <h2 className="text-lg font-semibold">新增負債</h2>
      <label className="flex flex-col gap-1">
        <span className="text-sm">名稱</span>
        <input
          type="text"
          required
          maxLength={255}
          value={name}
          onChange={(event) => setName(event.target.value)}
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
        <span className="text-sm">利率（%，選填）</span>
        <input
          type="number"
          min="0"
          step="0.01"
          value={interestRate}
          onChange={(event) => setInterestRate(event.target.value)}
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
        {isLoading ? '送出中…' : '新增負債'}
      </button>
    </form>
  )
}

function financialAssetTypeLabel(asset: FinancialAssetResponse): string {
  return asset.asset_type === 'stock' ? '股票' : '貴金屬'
}

function FinancialAssetList(): ReactNode {
  const { data, isLoading, error } = useListFinancialAssetsQuery()
  const items = data?.items ?? []

  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">金融資產清單</h2>
      {isLoading && <p>載入中…</p>}
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {getErrorMessage(error)}
        </p>
      )}
      {!isLoading && !error && items.length === 0 && <p>尚未新增任何金融資產</p>}
      {!isLoading && !error && items.length > 0 && (
        <table className="w-full text-left text-sm">
          <thead>
            <tr>
              <th className="p-2">類型</th>
              <th className="p-2">名稱</th>
              <th className="p-2">輸入數量</th>
              <th className="p-2">單位</th>
            </tr>
          </thead>
          <tbody>
            {items.map((asset) => (
              <tr key={asset.financial_asset_uid} className="border-t">
                <td className="p-2">{financialAssetTypeLabel(asset)}</td>
                <td className="p-2">{asset.name}</td>
                <td className="p-2">{asset.input_quantity}</td>
                <td className="p-2">{asset.input_unit}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}

function LiabilityList(): ReactNode {
  const { data, isLoading, error } = useListLiabilitiesQuery()
  const items = data?.items ?? []

  function interestRateLabel(liability: LiabilityResponse): string {
    return liability.interest_rate === null ? '—' : `${liability.interest_rate}%`
  }

  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">負債清單</h2>
      {isLoading && <p>載入中…</p>}
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {getErrorMessage(error)}
        </p>
      )}
      {!isLoading && !error && items.length === 0 && <p>尚未新增任何負債</p>}
      {!isLoading && !error && items.length > 0 && (
        <table className="w-full text-left text-sm">
          <thead>
            <tr>
              <th className="p-2">名稱</th>
              <th className="p-2">金額</th>
              <th className="p-2">利率</th>
            </tr>
          </thead>
          <tbody>
            {items.map((liability) => (
              <tr key={liability.liability_uid} className="border-t">
                <td className="p-2">{liability.name}</td>
                <td className="p-2">{liability.amount}</td>
                <td className="p-2">{interestRateLabel(liability)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}

export default function AssetsPage(): ReactNode {
  return (
    <AuthGuard>
      <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-10 p-6">
        <h1 className="text-2xl font-bold">資產 / 負債</h1>
        <StockAssetForm />
        <MetalAssetForm />
        <LiabilityForm />
        <FinancialAssetList />
        <LiabilityList />
      </main>
    </AuthGuard>
  )
}
