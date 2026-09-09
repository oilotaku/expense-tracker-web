'use client'

import { useState, type FormEvent, type ReactNode } from 'react'
import { cva } from 'class-variance-authority'
import type { FetchBaseQueryError } from '@reduxjs/toolkit/query/react'
import type { SerializedError } from '@reduxjs/toolkit'
import { AuthGuard } from '@/components/AuthGuard'
import { CurvedCard } from '@/components/common/CurvedCard'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import {
  useCreateFinancialAssetMutation,
  useCreateLiabilityMutation,
  useDeleteLiabilityMutation,
  useListFinancialAssetsQuery,
  useListLiabilitiesQuery,
  useUpdateFinancialAssetMutation,
  useUpdateLiabilityMutation,
  type AssetType,
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

// FE-052：條件樣式禁 inline 三元串接重複；按鈕改用新 cva variant（design-spec §9.5），同
// BudgetsPage 的 submitButtonClassName 寫法，三個表單（股票／貴金屬／負債）共用同一 variant。
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

function StockAssetForm(): ReactNode {
  const [createFinancialAsset, { isLoading, error }] = useCreateFinancialAssetMutation()

  const [name, setName] = useState('')
  const [quantity, setQuantity] = useState('')
  const [unit, setUnit] = useState<StockUnit>('張')
  const [principalAmount, setPrincipalAmount] = useState('')

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    try {
      await createFinancialAsset({
        asset_type: 'stock',
        name,
        input_quantity: quantity,
        input_unit: unit,
        principal_amount: principalAmount,
      }).unwrap()
      setName('')
      setQuantity('')
      setUnit('張')
      setPrincipalAmount('')
    } catch {
      // 錯誤已透過 createFinancialAsset() 的 error 狀態顯示，這裡只需擋掉 unwrap() 的 rejection
    }
  }

  return (
    <CurvedCard>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
        <h2 className="text-lg font-semibold text-text-primary">新增股票持股</h2>
        <label className="flex flex-col gap-1">
          <span className="text-sm text-text-secondary">股票代號 / 名稱</span>
          <input
            type="text"
            required
            maxLength={100}
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="min-h-11 rounded-md border border-border bg-surface px-3 text-text-primary"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm text-text-secondary">數量</span>
          <input
            type="number"
            required
            min="0.0001"
            step="0.0001"
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
            className="min-h-11 rounded-md border border-border bg-surface px-3 text-text-primary"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm text-text-secondary">單位</span>
          <select
            value={unit}
            onChange={(event) => setUnit(event.target.value as StockUnit)}
            className="min-h-11 rounded-md border border-border bg-surface px-3 text-text-primary"
          >
            <option value="張">張</option>
            <option value="股">股</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm text-text-secondary">本金</span>
          <input
            type="number"
            required
            min="0.01"
            step="0.01"
            value={principalAmount}
            onChange={(event) => setPrincipalAmount(event.target.value)}
            className="min-h-11 rounded-md border border-border bg-surface px-3 text-text-primary"
          />
        </label>
        {error && (
          <p role="alert" className="text-sm text-danger-700">
            {getErrorMessage(error)}
          </p>
        )}
        <button type="submit" disabled={isLoading} className={submitButtonClassName({ isLoading })}>
          {isLoading ? '送出中…' : '新增股票'}
        </button>
      </form>
    </CurvedCard>
  )
}

function MetalAssetForm(): ReactNode {
  const [createFinancialAsset, { isLoading, error }] = useCreateFinancialAssetMutation()

  const [name, setName] = useState('')
  const [quantity, setQuantity] = useState('')
  const [unit, setUnit] = useState<MetalUnit>('錢')
  const [principalAmount, setPrincipalAmount] = useState('')

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    try {
      await createFinancialAsset({
        asset_type: 'metal',
        name,
        input_quantity: quantity,
        input_unit: unit,
        principal_amount: principalAmount,
      }).unwrap()
      setName('')
      setQuantity('')
      setUnit('錢')
      setPrincipalAmount('')
    } catch {
      // 錯誤已透過 createFinancialAsset() 的 error 狀態顯示，這裡只需擋掉 unwrap() 的 rejection
    }
  }

  return (
    <CurvedCard>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
        <h2 className="text-lg font-semibold text-text-primary">新增貴金屬持有</h2>
        <label className="flex flex-col gap-1">
          <span className="text-sm text-text-secondary">品項（例：黃金）</span>
          <input
            type="text"
            required
            maxLength={100}
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="min-h-11 rounded-md border border-border bg-surface px-3 text-text-primary"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm text-text-secondary">數量</span>
          <input
            type="number"
            required
            min="0.0001"
            step="0.0001"
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
            className="min-h-11 rounded-md border border-border bg-surface px-3 text-text-primary"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm text-text-secondary">單位</span>
          <select
            value={unit}
            onChange={(event) => setUnit(event.target.value as MetalUnit)}
            className="min-h-11 rounded-md border border-border bg-surface px-3 text-text-primary"
          >
            <option value="兩">兩</option>
            <option value="錢">錢</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm text-text-secondary">本金</span>
          <input
            type="number"
            required
            min="0.01"
            step="0.01"
            value={principalAmount}
            onChange={(event) => setPrincipalAmount(event.target.value)}
            className="min-h-11 rounded-md border border-border bg-surface px-3 text-text-primary"
          />
        </label>
        {error && (
          <p role="alert" className="text-sm text-danger-700">
            {getErrorMessage(error)}
          </p>
        )}
        <button type="submit" disabled={isLoading} className={submitButtonClassName({ isLoading })}>
          {isLoading ? '送出中…' : '新增貴金屬'}
        </button>
      </form>
    </CurvedCard>
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
    <CurvedCard>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
        <h2 className="text-lg font-semibold text-text-primary">新增負債</h2>
        <label className="flex flex-col gap-1">
          <span className="text-sm text-text-secondary">名稱</span>
          <input
            type="text"
            required
            maxLength={255}
            value={name}
            onChange={(event) => setName(event.target.value)}
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
          <span className="text-sm text-text-secondary">利率（%，選填）</span>
          <input
            type="number"
            min="0"
            step="0.01"
            value={interestRate}
            onChange={(event) => setInterestRate(event.target.value)}
            className="min-h-11 rounded-md border border-border bg-surface px-3 text-text-primary"
          />
        </label>
        {error && (
          <p role="alert" className="text-sm text-danger-700">
            {getErrorMessage(error)}
          </p>
        )}
        <button type="submit" disabled={isLoading} className={submitButtonClassName({ isLoading })}>
          {isLoading ? '送出中…' : '新增負債'}
        </button>
      </form>
    </CurvedCard>
  )
}

function financialAssetTypeLabel(asset: FinancialAssetResponse): string {
  return asset.asset_type === 'stock' ? '股票' : '貴金屬'
}

// 單位選項依該筆資產固定的 asset_type 決定（backend/app/utils/unit_conversion.py），asset_type
// 本身不可編輯，故編輯表單不提供 asset_type 控制項。
function unitOptionsFor(assetType: AssetType): readonly (StockUnit | MetalUnit)[] {
  return assetType === 'stock' ? (['張', '股'] as const) : (['兩', '錢'] as const)
}

interface FinancialAssetRowProps {
  asset: FinancialAssetResponse
}

/**
 * 金融資產清單單列，就地編輯（mirror `AccountCard.tsx` 的編輯 UX，但改用 Save/Cancel 按鈕
 * 一次送出四個欄位，而非逐欄 blur 提交）：點擊「✎」展開名稱／數量／單位／本金輸入框，
 * 「儲存」呼叫 `updateFinancialAsset`（asset_type 不可變，不在送出的欄位內）。
 */
function FinancialAssetRow({ asset }: FinancialAssetRowProps): ReactNode {
  const [updateFinancialAsset, { isLoading, error }] = useUpdateFinancialAssetMutation()
  const [isEditing, setIsEditing] = useState(false)
  const [name, setName] = useState(asset.name)
  const [quantity, setQuantity] = useState(asset.input_quantity)
  const [unit, setUnit] = useState<StockUnit | MetalUnit>(asset.input_unit as StockUnit | MetalUnit)
  const [principalAmount, setPrincipalAmount] = useState(asset.principal_amount ?? '')

  function startEdit(): void {
    setName(asset.name)
    setQuantity(asset.input_quantity)
    setUnit(asset.input_unit as StockUnit | MetalUnit)
    setPrincipalAmount(asset.principal_amount ?? '')
    setIsEditing(true)
  }

  async function handleSave(): Promise<void> {
    try {
      await updateFinancialAsset({
        financial_asset_uid: asset.financial_asset_uid,
        name,
        input_quantity: quantity,
        input_unit: unit,
        principal_amount: principalAmount,
      }).unwrap()
      setIsEditing(false)
    } catch {
      // 錯誤已透過 error 狀態顯示，這裡只需擋掉 unwrap() 的 rejection
    }
  }

  if (!isEditing) {
    return (
      <tr className="border-t border-border">
        <td className="p-2 text-text-primary">{financialAssetTypeLabel(asset)}</td>
        <td className="p-2 text-text-primary">{asset.name}</td>
        <td className="p-2 text-text-primary">{asset.input_quantity}</td>
        <td className="p-2 text-text-primary">{asset.input_unit}</td>
        <td className="p-2 text-text-primary">{asset.principal_amount ?? '—'}</td>
        <td className="p-2">
          <button
            type="button"
            onClick={startEdit}
            aria-label={`編輯 ${asset.name}`}
            className="flex h-11 w-11 items-center justify-center text-text-secondary hover:text-text-primary md:h-8 md:w-8"
          >
            <span aria-hidden="true">✎</span>
          </button>
        </td>
      </tr>
    )
  }

  return (
    <tr className="border-t border-border">
      <td className="p-2 text-text-primary">{financialAssetTypeLabel(asset)}</td>
      <td className="p-2">
        <input
          type="text"
          required
          maxLength={100}
          aria-label={`${asset.name} 名稱`}
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="min-h-11 w-full rounded-md border border-border bg-surface px-2 text-text-primary"
        />
      </td>
      <td className="p-2">
        <input
          type="number"
          required
          min="0.0001"
          step="0.0001"
          aria-label={`${asset.name} 數量`}
          value={quantity}
          onChange={(event) => setQuantity(event.target.value)}
          className="min-h-11 w-24 rounded-md border border-border bg-surface px-2 text-text-primary"
        />
      </td>
      <td className="p-2">
        <select
          aria-label={`${asset.name} 單位`}
          value={unit}
          onChange={(event) => setUnit(event.target.value as StockUnit | MetalUnit)}
          className="min-h-11 rounded-md border border-border bg-surface px-2 text-text-primary"
        >
          {unitOptionsFor(asset.asset_type).map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </td>
      <td className="p-2">
        <input
          type="number"
          required
          min="0.01"
          step="0.01"
          aria-label={`${asset.name} 本金`}
          value={principalAmount}
          onChange={(event) => setPrincipalAmount(event.target.value)}
          className="min-h-11 w-24 rounded-md border border-border bg-surface px-2 text-text-primary"
        />
      </td>
      <td className="p-2">
        <div className="flex flex-col gap-1">
          <div className="flex gap-1">
            <button
              type="button"
              onClick={handleSave}
              disabled={isLoading}
              aria-label={`儲存 ${asset.name}`}
              className="min-h-11 rounded-md px-2 text-primary-600 hover:text-primary-700 disabled:pointer-events-none disabled:opacity-50 md:min-h-8"
            >
              {isLoading ? '儲存中…' : '儲存'}
            </button>
            <button
              type="button"
              onClick={() => setIsEditing(false)}
              aria-label={`取消編輯 ${asset.name}`}
              className="min-h-11 rounded-md px-2 text-text-secondary hover:text-text-primary md:min-h-8"
            >
              取消
            </button>
          </div>
          {error && (
            <p role="alert" className="text-sm text-danger-700">
              {getErrorMessage(error)}
            </p>
          )}
        </div>
      </td>
    </tr>
  )
}

function FinancialAssetList(): ReactNode {
  const { data, isLoading, error } = useListFinancialAssetsQuery()
  const items = data?.items ?? []

  return (
    <CurvedCard>
      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold text-text-primary">金融資產清單</h2>
        {isLoading && <p className="text-text-secondary">載入中…</p>}
        {error && (
          <p role="alert" className="text-sm text-danger-700">
            {getErrorMessage(error)}
          </p>
        )}
        {!isLoading && !error && items.length === 0 && (
          <p className="text-text-secondary">尚未新增任何金融資產</p>
        )}
        {!isLoading && !error && items.length > 0 && (
          <table className="w-full text-left text-sm">
            <thead>
              <tr>
                <th className="p-2 text-text-secondary">類型</th>
                <th className="p-2 text-text-secondary">名稱</th>
                <th className="p-2 text-text-secondary">輸入數量</th>
                <th className="p-2 text-text-secondary">單位</th>
                <th className="p-2 text-text-secondary">本金</th>
                <th className="p-2 text-text-secondary">操作</th>
              </tr>
            </thead>
            <tbody>
              {items.map((asset) => (
                <FinancialAssetRow key={asset.financial_asset_uid} asset={asset} />
              ))}
            </tbody>
          </table>
        )}
      </section>
    </CurvedCard>
  )
}

function interestRateLabel(liability: LiabilityResponse): string {
  return liability.interest_rate === null ? '—' : `${liability.interest_rate}%`
}

interface LiabilityRowProps {
  liability: LiabilityResponse
  onRequestDelete: (liability: LiabilityResponse) => void
}

/**
 * 負債清單單列：「還款」展開一列還款金額輸入，前端算出 `new_amount = amount - payment`
 * 後呼叫 `updateLiability`；後端 `amount` 欄位驗證 `gt=0`（→ backend/app/schemas/liability.py），
 * 還清會讓新金額落到 0 或以下，所以前端先擋（嚴格小於目前金額才可送出），並引導使用者改用
 * 「刪除」處理已還清的負債。「刪除」比照 accounts/page.tsx 走共用 `<ConfirmDialog>`（父層擁有
 * 對話框與 useDeleteLiabilityMutation，本列只負責觸發 onRequestDelete）。
 */
function LiabilityRow({ liability, onRequestDelete }: LiabilityRowProps): ReactNode {
  const [updateLiability, { isLoading, error }] = useUpdateLiabilityMutation()
  const [isRepaying, setIsRepaying] = useState(false)
  const [paymentAmount, setPaymentAmount] = useState('')

  const currentAmount = Number(liability.amount)
  const payment = Number(paymentAmount)
  const hasPaymentInput = paymentAmount.trim() !== ''
  const isPaymentValid =
    hasPaymentInput && Number.isFinite(payment) && payment > 0 && payment < currentAmount

  async function handleRepay(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    if (!isPaymentValid) return
    // amount 為字串線上傳輸（DB-038），此處是使用者輸入的一次性差額計算（非顯示用途），
    // 用 Number 相減後格式化回 2 位小數字串再送出屬本 repo 既有慣例可接受範圍。
    const newAmount = (currentAmount - payment).toFixed(2)
    try {
      await updateLiability({ liability_uid: liability.liability_uid, amount: newAmount }).unwrap()
      setPaymentAmount('')
      setIsRepaying(false)
    } catch {
      // 錯誤已透過 error 狀態顯示，這裡只需擋掉 unwrap() 的 rejection
    }
  }

  return (
    <>
      <tr className="border-t border-border">
        <td className="p-2 text-text-primary">{liability.name}</td>
        {/* design-spec §2.3：金額語意色，負債會減損淨資產，語意同「支出」用 expense-700 */}
        <td className="p-2 text-expense-700">{liability.amount}</td>
        <td className="p-2 text-text-primary">{interestRateLabel(liability)}</td>
        <td className="p-2">
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => setIsRepaying((current) => !current)}
              aria-expanded={isRepaying}
              aria-label={`還款 ${liability.name}`}
              className="min-h-11 rounded-md px-2 text-primary-600 hover:text-primary-700 md:min-h-8"
            >
              還款
            </button>
            <button
              type="button"
              onClick={() => onRequestDelete(liability)}
              aria-label={`刪除 ${liability.name}`}
              className="flex h-11 w-11 items-center justify-center text-danger-500 hover:text-danger-700 md:h-8 md:w-8"
            >
              <span aria-hidden="true">✕</span>
            </button>
          </div>
        </td>
      </tr>
      {isRepaying && (
        <tr className="border-t border-border">
          <td colSpan={4} className="p-2">
            <form onSubmit={handleRepay} className="flex flex-wrap items-end gap-2" noValidate>
              <label className="flex flex-col gap-1">
                <span className="text-sm text-text-secondary">還款金額</span>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  aria-label={`${liability.name} 還款金額`}
                  value={paymentAmount}
                  onChange={(event) => setPaymentAmount(event.target.value)}
                  className="min-h-11 rounded-md border border-border bg-surface px-3 text-text-primary"
                />
              </label>
              <button
                type="submit"
                disabled={!isPaymentValid || isLoading}
                className={submitButtonClassName({ isLoading })}
              >
                {isLoading ? '還款中…' : '確認還款'}
              </button>
              {hasPaymentInput && !isPaymentValid && (
                <p role="alert" className="text-sm text-danger-700">
                  還款金額須大於 0 且小於目前金額；全部還清請改用「刪除」
                </p>
              )}
              {error && (
                <p role="alert" className="text-sm text-danger-700">
                  {getErrorMessage(error)}
                </p>
              )}
            </form>
          </td>
        </tr>
      )}
    </>
  )
}

function LiabilityList(): ReactNode {
  const { data, isLoading, error } = useListLiabilitiesQuery()
  const items = data?.items ?? []
  const [pendingDelete, setPendingDelete] = useState<LiabilityResponse | null>(null)
  const [deleteLiability, { isLoading: isDeleting }] = useDeleteLiabilityMutation()

  async function handleConfirmDelete(): Promise<void> {
    if (pendingDelete === null) return
    try {
      await deleteLiability(pendingDelete.liability_uid).unwrap()
    } catch {
      // 刪除失敗維持既有清單顯示，錯誤不額外攔截（→ accounts/page.tsx 同慣例）
    }
    setPendingDelete(null)
  }

  return (
    <CurvedCard>
      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold text-text-primary">負債清單</h2>
        {isLoading && <p className="text-text-secondary">載入中…</p>}
        {error && (
          <p role="alert" className="text-sm text-danger-700">
            {getErrorMessage(error)}
          </p>
        )}
        {!isLoading && !error && items.length === 0 && (
          <p className="text-text-secondary">尚未新增任何負債</p>
        )}
        {!isLoading && !error && items.length > 0 && (
          <table className="w-full text-left text-sm">
            <thead>
              <tr>
                <th className="p-2 text-text-secondary">名稱</th>
                <th className="p-2 text-text-secondary">金額</th>
                <th className="p-2 text-text-secondary">利率</th>
                <th className="p-2 text-text-secondary">操作</th>
              </tr>
            </thead>
            <tbody>
              {items.map((liability) => (
                <LiabilityRow
                  key={liability.liability_uid}
                  liability={liability}
                  onRequestDelete={setPendingDelete}
                />
              ))}
            </tbody>
          </table>
        )}
      </section>
      <ConfirmDialog
        open={pendingDelete !== null}
        title={`刪除「${pendingDelete?.name ?? ''}」？`}
        description="刪除後將無法復原，如尚未還清請改用「還款」逐步扣減金額"
        confirmLabel={isDeleting ? '刪除中…' : '刪除'}
        destructive
        onConfirm={handleConfirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </CurvedCard>
  )
}

export default function AssetsPage(): ReactNode {
  return (
    <AuthGuard>
      <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-10 bg-bg p-6">
        <h1 className="text-2xl font-bold text-text-primary md:text-3xl">資產 / 負債</h1>
        <StockAssetForm />
        <MetalAssetForm />
        <LiabilityForm />
        <FinancialAssetList />
        <LiabilityList />
      </main>
    </AuthGuard>
  )
}
