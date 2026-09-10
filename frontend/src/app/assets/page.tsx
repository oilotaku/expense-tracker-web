'use client'

import { useState, type FormEvent, type ReactNode } from 'react'
import { cva } from 'class-variance-authority'
import type { FetchBaseQueryError } from '@reduxjs/toolkit/query/react'
import type { SerializedError } from '@reduxjs/toolkit'
import { AuthGuard } from '@/components/AuthGuard'
import { AppShell } from '@/components/common/AppShell'
import { CurvedCard } from '@/components/common/CurvedCard'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { usePriceColorPreference } from '@/hooks/usePriceColorPreference'
import {
  useCreateFinancialAssetMutation,
  useCreateLiabilityMutation,
  useDeleteLiabilityMutation,
  useGetNetWorthQuery,
  useListFinancialAssetsQuery,
  useListLiabilitiesQuery,
  useUpdateFinancialAssetMutation,
  useUpdateLiabilityMutation,
  type AssetType,
  type FinancialAssetResponse,
  type LiabilityResponse,
  type MetalUnit,
  type StockUnit,
  type UsStockUnit,
} from '@/lib/api/assetsApi'
import {
  useCreateRecurringRuleMutation,
  useDeleteRecurringRuleMutation,
  useListRecurringRulesQuery,
} from '@/lib/api/recurringApi'
import { useListAccountOptionsQuery, useListCategoryOptionsQuery } from '@/lib/api/transactionsApi'
import {
  RecurringFieldset,
  type RecurringFieldsetErrors,
  type RecurringFieldsetValue,
} from '@/components/transactions/RecurringFieldset'

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
            placeholder="例：2330（不是公司名稱）"
            pattern="\d{4,6}"
            title="請輸入 4-6 位數字證券代號，例如 2330"
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="min-h-11 rounded-md border border-border bg-surface px-3 text-text-primary"
          />
        </label>
        <p className="-mt-2 text-xs text-text-secondary">
          用來查報價，須為證券代號（例：2330），輸入公司名稱會查不到報價
        </p>
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

function UsStockAssetForm(): ReactNode {
  const [createFinancialAsset, { isLoading, error }] = useCreateFinancialAssetMutation()

  const [name, setName] = useState('')
  const [quantity, setQuantity] = useState('')
  const [principalAmount, setPrincipalAmount] = useState('')

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    try {
      await createFinancialAsset({
        asset_type: 'us_stock',
        name: name.toUpperCase(),
        input_quantity: quantity,
        // 美股沒有「張」的整手概念，只有「股」一種單位（→ ADR-0003），不提供選單
        input_unit: '股',
        principal_amount: principalAmount,
      }).unwrap()
      setName('')
      setQuantity('')
      setPrincipalAmount('')
    } catch {
      // 錯誤已透過 createFinancialAsset() 的 error 狀態顯示，這裡只需擋掉 unwrap() 的 rejection
    }
  }

  return (
    <CurvedCard>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
        <h2 className="text-lg font-semibold text-text-primary">新增美股持股</h2>
        <label className="flex flex-col gap-1">
          <span className="text-sm text-text-secondary">美股代號</span>
          <input
            type="text"
            required
            maxLength={100}
            placeholder="例：AAPL"
            pattern="[A-Za-z]{1,5}(\.[A-Za-z])?"
            title="請輸入 1-5 位英文字母代號，例如 AAPL"
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="min-h-11 rounded-md border border-border bg-surface px-3 text-text-primary"
          />
        </label>
        <p className="-mt-2 text-xs text-text-secondary">
          用來查報價，須為證券代號（例：AAPL），輸入公司名稱會查不到報價
        </p>
        <label className="flex flex-col gap-1">
          <span className="text-sm text-text-secondary">數量（股）</span>
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
          <span className="text-sm text-text-secondary">本金（新台幣）</span>
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
          {isLoading ? '送出中…' : '新增美股'}
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

const ASSET_TYPE_LABEL: Record<AssetType, string> = {
  stock: '台股',
  us_stock: '美股',
  metal: '貴金屬',
}

function financialAssetTypeLabel(asset: FinancialAssetResponse): string {
  return ASSET_TYPE_LABEL[asset.asset_type]
}

// 單位選項依該筆資產固定的 asset_type 決定（backend/app/utils/unit_conversion.py），asset_type
// 本身不可編輯，故編輯表單不提供 asset_type 控制項。美股沒有「張」的整手概念，只有「股」
// （使用者確認，本次 session；→ ADR-0003）。
function unitOptionsFor(assetType: AssetType): readonly (StockUnit | UsStockUnit | MetalUnit)[] {
  if (assetType === 'stock') return ['張', '股'] as const
  if (assetType === 'us_stock') return ['股'] as const
  return ['兩', '錢'] as const
}

interface FinancialAssetRowProps {
  asset: FinancialAssetResponse
  /** 對比本金的漲跌幅（→ useGetNetWorthQuery，同一筆 uid 比對）；報價服務暫時不可用或本金
   * 為 null 時是 undefined/null，不顯示漲跌幅徽章，不當成 0%。 */
  gainPercent?: string | null
}

/**
 * 金融資產清單單項：讀模式一張卡；就地編輯（mirror `AccountCard.tsx` 的編輯 UX，但改用
 * Save/Cancel 按鈕一次送出四個欄位，而非逐欄 blur 提交）：點擊「✎」展開名稱／數量／單位／本金
 * 輸入框，「儲存」呼叫 `updateFinancialAsset`（asset_type 不可變，不在送出的欄位內）。
 *
 * 不用 `<table>`：編輯模式 4 個輸入框 + 下拉 + 按鈕在窄螢幕的 `<td>` 裡塞不下，`overflow-x-auto`
 * 包在 flex 版面（`AssetsPage` 的 `<main>` 是 `flex-col`）裡因 flex item 預設
 * `min-width: auto` 不會真的觸發，表格照樣把整頁撐寬；改用卡片（比照 `accounts/page.tsx` 的
 * `AccountCard` 網格）在所有螢幕寬度都用同一份垂直堆疊版面，天生不會有這個問題。
 */
function FinancialAssetRow({ asset, gainPercent }: FinancialAssetRowProps): ReactNode {
  const { colorForGain } = usePriceColorPreference()
  const [updateFinancialAsset, { isLoading, error }] = useUpdateFinancialAssetMutation()
  const [isEditing, setIsEditing] = useState(false)
  const [name, setName] = useState(asset.name)
  const [quantity, setQuantity] = useState(asset.input_quantity)
  const [unit, setUnit] = useState<StockUnit | UsStockUnit | MetalUnit>(
    asset.input_unit as StockUnit | UsStockUnit | MetalUnit,
  )
  const [principalAmount, setPrincipalAmount] = useState(asset.principal_amount ?? '')

  function startEdit(): void {
    setName(asset.name)
    setQuantity(asset.input_quantity)
    setUnit(asset.input_unit as StockUnit | UsStockUnit | MetalUnit)
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
      <div className="flex items-center justify-between gap-3 rounded-md border border-border p-3">
        <div className="flex flex-col gap-0.5">
          <span className="text-xs text-text-secondary">{financialAssetTypeLabel(asset)}</span>
          <span className="font-medium text-text-primary">{asset.name}</span>
          <div className="flex flex-wrap gap-2 text-sm text-text-secondary">
            <span>
              {asset.input_quantity} {asset.input_unit}
            </span>
            <span>本金</span>
            <span>{asset.principal_amount ?? '—'}</span>
            {gainPercent != null && (
              <span className={`tabular-nums ${colorForGain(Number(gainPercent) >= 0)}`}>
                {Number(gainPercent) >= 0 ? '+' : ''}
                {gainPercent}%
              </span>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={startEdit}
          aria-label={`編輯 ${asset.name}`}
          className="flex h-11 w-11 shrink-0 items-center justify-center text-text-secondary hover:text-text-primary md:h-8 md:w-8"
        >
          <span aria-hidden="true">✎</span>
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3 rounded-md border border-border p-3">
      <span className="text-xs text-text-secondary">{financialAssetTypeLabel(asset)}</span>
      <label className="flex flex-col gap-1">
        <span className="text-sm text-text-secondary">名稱</span>
        <input
          type="text"
          required
          maxLength={100}
          aria-label={`${asset.name} 名稱`}
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="min-h-11 w-full rounded-md border border-border bg-surface px-2 text-text-primary"
        />
      </label>
      <div className="flex gap-2">
        <label className="flex flex-1 flex-col gap-1">
          <span className="text-sm text-text-secondary">數量</span>
          <input
            type="number"
            required
            min="0.0001"
            step="0.0001"
            aria-label={`${asset.name} 數量`}
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
            className="min-h-11 w-full rounded-md border border-border bg-surface px-2 text-text-primary"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm text-text-secondary">單位</span>
          <select
            aria-label={`${asset.name} 單位`}
            value={unit}
            onChange={(event) => setUnit(event.target.value as StockUnit | UsStockUnit | MetalUnit)}
            className="min-h-11 rounded-md border border-border bg-surface px-2 text-text-primary"
          >
            {unitOptionsFor(asset.asset_type).map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="flex flex-col gap-1">
        <span className="text-sm text-text-secondary">本金</span>
        <input
          type="number"
          required
          min="0.01"
          step="0.01"
          aria-label={`${asset.name} 本金`}
          value={principalAmount}
          onChange={(event) => setPrincipalAmount(event.target.value)}
          className="min-h-11 w-full rounded-md border border-border bg-surface px-2 text-text-primary"
        />
      </label>
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
  )
}

function FinancialAssetList(): ReactNode {
  const { data, isLoading, error } = useListFinancialAssetsQuery()
  const items = data?.items ?? []
  // 漲跌幅是另一支彙總 API（會打外部報價來源，可能 424），跟資產 CRUD 分開查、失敗互不影響：
  // 報價暫時不可用時只是不顯示漲跌幅徽章，不影響資產清單本身正常顯示（→ task-014/016 既有分工）。
  const { data: netWorth } = useGetNetWorthQuery()
  const gainPercentByUid = new Map(
    (netWorth?.assets ?? []).map((item) => [item.financial_asset_uid, item.gain_percent]),
  )

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
          <div className="flex flex-col gap-2">
            {items.map((asset) => (
              <FinancialAssetRow
                key={asset.financial_asset_uid}
                asset={asset}
                gainPercent={gainPercentByUid.get(asset.financial_asset_uid)}
              />
            ))}
          </div>
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
// 定期還款設定表單的週期欄位範圍同 recurring/page.tsx（backend Field(ge=1, le=99)）。
const RECURRING_INTERVAL_COUNT_MIN = 1
const RECURRING_INTERVAL_COUNT_MAX = 99

function validateRecurringFieldset(value: RecurringFieldsetValue): RecurringFieldsetErrors {
  const errors: RecurringFieldsetErrors = {}
  if (
    !Number.isInteger(value.intervalCount) ||
    value.intervalCount < RECURRING_INTERVAL_COUNT_MIN ||
    value.intervalCount > RECURRING_INTERVAL_COUNT_MAX
  ) {
    errors.intervalCount = `間隔數必須介於 ${RECURRING_INTERVAL_COUNT_MIN} 到 ${RECURRING_INTERVAL_COUNT_MAX} 之間`
  }
  if (value.anchorDate.trim() === '') {
    errors.anchorDate = '請選擇起算日'
  }
  return errors
}

/**
 * 負債列的「設定定期還款」：建立一筆 `liability_uid` 指向本負債的 `recurring_rules`（transaction_type
 * 固定 expense），到期由後端 `RecurringService` 自動產生支出交易並扣減負債餘額（→ backend
 * task「負債定期還款」）。與下方手動「還款」互為獨立入口，互不影響。
 */
function LiabilityRecurringSection({ liability }: { liability: LiabilityResponse }): ReactNode {
  const { data: accounts } = useListAccountOptionsQuery()
  const { data: categories } = useListCategoryOptionsQuery()
  const { data: recurringRules } = useListRecurringRulesQuery()
  const [createRecurringRule, { isLoading: isCreating, error: createError }] =
    useCreateRecurringRuleMutation()
  const [deleteRecurringRule, { isLoading: isCanceling }] = useDeleteRecurringRuleMutation()

  const [isSettingUp, setIsSettingUp] = useState(false)
  const [accountUid, setAccountUid] = useState('')
  const [categoryUid, setCategoryUid] = useState('')
  const [amount, setAmount] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('')
  const [fieldset, setFieldset] = useState<RecurringFieldsetValue>({
    intervalUnit: 'month',
    intervalCount: 1,
    anchorDate: '',
  })
  const [fieldsetErrors, setFieldsetErrors] = useState<RecurringFieldsetErrors>({})

  const activeRule = (recurringRules?.items ?? []).find(
    (rule) => rule.liability_uid === liability.liability_uid,
  )
  const activeAccountName =
    activeRule && (accounts ?? []).find((a) => a.account_uid === activeRule.account_uid)?.name

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    const errors = validateRecurringFieldset(fieldset)
    setFieldsetErrors(errors)
    if (Object.keys(errors).length > 0) return
    try {
      await createRecurringRule({
        account_uid: accountUid,
        category_uid: categoryUid,
        description: `${liability.name} 定期還款`,
        amount,
        transaction_type: 'expense',
        payment_method: paymentMethod,
        interval_unit: fieldset.intervalUnit,
        interval_count: fieldset.intervalCount,
        anchor_date: fieldset.anchorDate,
        liability_uid: liability.liability_uid,
      }).unwrap()
      setIsSettingUp(false)
      setAmount('')
      setPaymentMethod('')
    } catch {
      // 錯誤已透過 createRecurringRule() 的 error 狀態顯示，這裡只需擋掉 unwrap() 的 rejection
    }
  }

  async function handleCancel(): Promise<void> {
    if (!activeRule) return
    try {
      await deleteRecurringRule(activeRule.recurring_rule_uid).unwrap()
    } catch {
      // 取消失敗維持既有顯示，同 LiabilityList 刪除的既有慣例，不額外攔截
    }
  }

  if (activeRule) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-surface p-2 text-sm">
        <span className="text-text-secondary">
          定期還款中：{activeRule.amount} · {activeAccountName ?? '—'} ·{' '}
          {activeRule.interval_count === 1 ? '每' : `每 ${activeRule.interval_count} `}
          {INTERVAL_UNIT_NOUN[activeRule.interval_unit]}
        </span>
        <button
          type="button"
          onClick={handleCancel}
          disabled={isCanceling}
          className="min-h-11 rounded-md px-2 text-danger-500 hover:text-danger-700 md:min-h-8"
        >
          {isCanceling ? '取消中…' : '取消定期還款'}
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={() => setIsSettingUp((current) => !current)}
        aria-expanded={isSettingUp}
        className="self-start text-sm text-primary-600 hover:text-primary-700"
      >
        設定定期還款
      </button>
      {isSettingUp && (
        <form onSubmit={handleSubmit} className="flex flex-col gap-3 rounded-md border border-border p-3" noValidate>
          <label className="flex flex-col gap-1">
            <span className="text-sm text-text-secondary">扣款帳戶</span>
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
            <span className="text-sm text-text-secondary">每期還款金額</span>
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
              placeholder="轉帳 / 信用卡…"
              value={paymentMethod}
              onChange={(event) => setPaymentMethod(event.target.value)}
              className="min-h-11 rounded-md border border-border bg-surface px-3 text-text-primary"
            />
          </label>
          <RecurringFieldset value={fieldset} onChange={setFieldset} errors={fieldsetErrors} />
          {createError && (
            <p role="alert" className="text-sm text-danger-700">
              {getErrorMessage(createError)}
            </p>
          )}
          <button
            type="submit"
            disabled={isCreating}
            className={submitButtonClassName({ isLoading: isCreating })}
          >
            {isCreating ? '設定中…' : '確認設定'}
          </button>
        </form>
      )}
    </div>
  )
}

const INTERVAL_UNIT_NOUN: Record<RecurringFieldsetValue['intervalUnit'], string> = {
  week: '週',
  month: '月',
  year: '年',
}

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
    <div className="flex flex-col gap-2 rounded-md border border-border p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <span className="font-medium text-text-primary">{liability.name}</span>
          <div className="flex gap-2 text-sm">
            {/* design-spec §2.3：金額語意色，負債會減損淨資產，語意同「支出」用 expense-700 */}
            <span className="text-expense-700">{liability.amount}</span>
            <span className="text-text-primary">{interestRateLabel(liability)}</span>
          </div>
        </div>
        <div className="flex shrink-0 gap-1">
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
      </div>
      {isRepaying && (
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
      )}
      <LiabilityRecurringSection liability={liability} />
    </div>
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
          <div className="flex flex-col gap-2">
            {items.map((liability) => (
              <LiabilityRow
                key={liability.liability_uid}
                liability={liability}
                onRequestDelete={setPendingDelete}
              />
            ))}
          </div>
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
      <AppShell>
        <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-10 bg-bg p-6">
          <h1 className="text-2xl font-bold text-text-primary md:text-3xl">資產 / 負債</h1>
          <StockAssetForm />
          <UsStockAssetForm />
          <MetalAssetForm />
          <LiabilityForm />
          <FinancialAssetList />
          <LiabilityList />
        </main>
      </AppShell>
    </AuthGuard>
  )
}
