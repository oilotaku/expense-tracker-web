'use client'

import { useMemo, useState, type FormEvent, type ReactNode } from 'react'
import type { FetchBaseQueryError } from '@reduxjs/toolkit/query/react'
import type { SerializedError } from '@reduxjs/toolkit'
import { AuthGuard } from '@/components/AuthGuard'
import { Dialog } from '@/components/common/Dialog'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { CHART_SWATCH_COLORS, ColorSwatchPicker } from '@/components/common/ColorSwatchPicker'
import { IconPicker } from '@/components/common/IconPicker'
import { AccountCard } from '@/components/accounts/AccountCard'
import {
  useCreateAccountMutation,
  useDeleteAccountMutation,
  useListAccountsQuery,
  useUpdateAccountMutation,
  type AccountResponse,
} from '@/lib/api/accountsApi'

// 同 CategoriesPage / BudgetsPage（FE-029）：錯誤處理必用型別收窄，禁 `error as any`。本 task
// affected_files 未含共用 utils 檔，依既有慣例在頁面內各自實作（→ categories/page.tsx 同註解）。
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

// 對齊後端 Account model 的 icon server_default（backend/app/models/account.py）
const DEFAULT_ICON = 'other'

// design-spec §9.6：新增帳戶時若未手動選色，前端預帶下一個尚未被目前帳戶清單使用的色票，
// 避免同一使用者的帳戶卡片撞色（非強制規則，使用者仍可自行改選）；全部色票皆已使用時回落第一個。
function pickUnusedColor(existingColors: readonly string[]): string {
  const used = new Set(existingColors.map((color) => color.toLowerCase()))
  return CHART_SWATCH_COLORS.find((color) => !used.has(color.toLowerCase())) ?? CHART_SWATCH_COLORS[0] ?? '#8B6ED6'
}

interface AccountCreateDialogProps {
  open: boolean
  defaultColor: string
  onOpenChange: (open: boolean) => void
}

/**
 * design-spec §9.6（`→ A8`，欄位設計見 §12.4）：新增帳戶表單，走共用 `<Dialog>`（`→ FE-048`）。
 * 名稱 + 起始餘額（後端 `AccountCreateRequest.balance` 必填，非 optional）+ 色票選擇器 +
 * 圖示選擇器；色票預設值由父層 `pickUnusedColor` 算出，於每次開啟時重置整個表單狀態。
 */
function AccountCreateDialog({ open, defaultColor, onOpenChange }: AccountCreateDialogProps): ReactNode {
  const [name, setName] = useState('')
  const [balance, setBalance] = useState('0')
  const [color, setColor] = useState(defaultColor)
  const [icon, setIcon] = useState(DEFAULT_ICON)
  const [createAccount, { isLoading, error }] = useCreateAccountMutation()

  // 依 React 文件建議的「render 期間依 prop 變化調整 state」寫法（非 useEffect，
  // → ColorSwatchPicker.tsx 同寫法）：每次對話框從關到開，用當下算出的 defaultColor 重置表單。
  const [syncedOpen, setSyncedOpen] = useState(open)
  if (open !== syncedOpen) {
    setSyncedOpen(open)
    if (open) {
      setName('')
      setBalance('0')
      setColor(defaultColor)
      setIcon(DEFAULT_ICON)
    }
  }

  const trimmedName = name.trim()
  const canSubmit = trimmedName.length > 0

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    if (!canSubmit) return
    try {
      await createAccount({ name: trimmedName, balance, color, icon }).unwrap()
      onOpenChange(false)
    } catch {
      // 錯誤已透過 createAccount() 的 error 狀態顯示，這裡只需擋掉 unwrap() 的 rejection
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="新增帳戶">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
        <label className="flex flex-col gap-1">
          <span className="text-sm text-text-secondary">名稱</span>
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
          <span className="text-sm text-text-secondary">起始餘額</span>
          <input
            type="number"
            required
            step="0.01"
            value={balance}
            onChange={(event) => setBalance(event.target.value)}
            className="min-h-11 rounded-md border border-border bg-surface px-3 text-text-primary"
          />
        </label>
        <div className="flex flex-col gap-2">
          <span className="text-sm text-text-secondary">顏色</span>
          <ColorSwatchPicker value={color} onChange={setColor} />
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-sm text-text-secondary">圖示</span>
          <IconPicker value={icon} onChange={setIcon} />
        </div>
        {error && (
          <p role="alert" className="text-sm text-danger-700">
            {getErrorMessage(error)}
          </p>
        )}
        <button
          type="submit"
          disabled={isLoading || !canSubmit}
          className="min-h-11 rounded-md bg-primary-600 px-4 font-medium text-text-inverse transition-colors hover:bg-primary-700 disabled:pointer-events-none disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600"
        >
          {isLoading ? '新增中…' : '建立帳戶'}
        </button>
      </form>
    </Dialog>
  )
}

export default function AccountsPage(): ReactNode {
  const { data, isLoading, error } = useListAccountsQuery()
  const accounts = useMemo(() => data?.items ?? [], [data])
  // design-spec §1 [A4]：現金/銀行帳戶通用，系統至少保留 1 個帳戶；只剩最後一個時刪除保護生效。
  const isOnlyAccount = accounts.length <= 1
  const defaultColor = useMemo(() => pickUnusedColor(accounts.map((account) => account.color)), [accounts])

  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<AccountResponse | null>(null)

  const [updateAccount] = useUpdateAccountMutation()
  const [deleteAccount, { isLoading: isDeleting }] = useDeleteAccountMutation()

  function handleNameChange(accountUid: string, name: string): void {
    void updateAccount({ accountUid, name })
  }

  function handleColorChange(accountUid: string, color: string): void {
    void updateAccount({ accountUid, color })
  }

  function handleIconChange(accountUid: string, icon: string): void {
    void updateAccount({ accountUid, icon })
  }

  async function handleConfirmDelete(): Promise<void> {
    if (pendingDelete === null) return
    try {
      await deleteAccount(pendingDelete.account_uid).unwrap()
    } catch {
      // 刪除失敗（如後端有其他保護邏輯）維持既有清單顯示，錯誤不額外攔截
    }
    setPendingDelete(null)
  }

  return (
    <AuthGuard>
      <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-6 bg-bg p-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-text-primary md:text-3xl">帳戶管理</h1>
          <button
            type="button"
            onClick={() => setIsCreateOpen(true)}
            className="hidden min-h-11 items-center rounded-md bg-primary-600 px-4 font-medium text-text-inverse transition-colors hover:bg-primary-700 md:inline-flex md:min-h-8 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600"
          >
            ＋ 新增帳戶
          </button>
        </div>

        {isLoading && <p className="text-text-secondary">載入中…</p>}
        {error && (
          <p role="alert" className="text-sm text-danger-700">
            {getErrorMessage(error)}
          </p>
        )}
        {!isLoading && !error && accounts.length === 0 && (
          <p className="text-text-secondary">尚未建立任何帳戶</p>
        )}
        {!isLoading && !error && accounts.length > 0 && (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
            {accounts.map((account) => (
              <AccountCard
                key={account.account_uid}
                account={account}
                isOnlyAccount={isOnlyAccount}
                onNameChange={handleNameChange}
                onColorChange={handleColorChange}
                onIconChange={handleIconChange}
                onRequestDelete={setPendingDelete}
              />
            ))}
          </div>
        )}

        {/* design-spec §9.6：行動端底部常駐「＋新增帳戶」全寬按鈕，跟隨頁面內容捲動
            （非 fixed，→ FE-057 主版型禁 fixed，overlay 由 <Dialog> 本身負責定位） */}
        <button
          type="button"
          onClick={() => setIsCreateOpen(true)}
          className="min-h-11 w-full rounded-md bg-primary-600 px-4 font-medium text-text-inverse transition-colors hover:bg-primary-700 md:hidden focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600"
        >
          ＋ 新增帳戶
        </button>

        <AccountCreateDialog open={isCreateOpen} defaultColor={defaultColor} onOpenChange={setIsCreateOpen} />

        <ConfirmDialog
          open={pendingDelete !== null}
          title={`刪除「${pendingDelete?.name ?? ''}」？`}
          description="此帳戶若有交易紀錄，需先轉移或保留歷史紀錄後再刪除，實際轉移邏輯由後端規則決定"
          confirmLabel={isDeleting ? '刪除中…' : '刪除'}
          destructive
          onConfirm={handleConfirmDelete}
          onCancel={() => setPendingDelete(null)}
        />
      </main>
    </AuthGuard>
  )
}
