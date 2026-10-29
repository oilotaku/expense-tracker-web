'use client'

import { useState, type ReactNode } from 'react'
import { CurvedCard } from '@/components/common/CurvedCard'
import { ColorSwatchPicker } from '@/components/common/ColorSwatchPicker'
import { EntityIcon } from '@/components/common/EntityIcon'
import { IconPicker } from '@/components/common/IconPicker'
import type { AccountResponse } from '@/lib/api/accountsApi'

export interface AccountCardProps {
  account: AccountResponse
  /** 只剩最後一個帳戶時刪除保護生效（`→ A4`），停用刪除按鈕並顯示提示文字。 */
  isOnlyAccount: boolean
  /** 改名/改色/改圖示的 API 呼叫還在進行中（父層依 accountUid 精準對到「這張卡片」，
   * 不是「全部卡片」，→ app/accounts/page.tsx savingAccountUid）。用來即時停用/淡化
   * 名稱輸入框與色票/圖示選擇器，避免使用者誤以為點擊沒有反應而重複點擊。 */
  isSaving?: boolean
  onNameChange: (accountUid: string, name: string) => void
  onBalanceChange: (accountUid: string, balance: string) => void
  onColorChange: (accountUid: string, color: string) => void
  onIconChange: (accountUid: string, icon: string) => void
  onRequestDelete: (account: AccountResponse) => void
}

// 同 TransactionFormDialog.tsx 的 AMOUNT_PATTERN，但帳戶餘額允許負數（例如信用卡循環未繳）：
// 建立帳戶時後端 AccountCreateRequest.balance 本來就沒有 >0 限制，這裡直接編輯不應該比建立更嚴。
const BALANCE_PATTERN = /^-?\d+(\.\d*)?$/

/**
 * 帳戶卡片（design-spec §9.6）：色票色塊/圖示 + 帳戶名 + 餘額 + 改名/改色/改圖示/刪除。
 * 桌機橫向 grid、行動端直向堆疊由父層（`app/accounts/page.tsx`）的 grid class 控制，本卡片
 * 本身只負責單張卡片內容（`→ FE-064` 容器寬度由父決定）。點擊「編輯」展開名稱輸入框 +
 * 色票 / 圖示選擇器就地編輯，實際 API 呼叫交由父層透過 onNameChange / onColorChange /
 * onIconChange 處理（本元件不自行呼叫 API，維持受控、方便測試）。
 */
export function AccountCard({
  account,
  isOnlyAccount,
  isSaving = false,
  onNameChange,
  onBalanceChange,
  onColorChange,
  onIconChange,
  onRequestDelete,
}: AccountCardProps): ReactNode {
  const [isEditing, setIsEditing] = useState(false)
  const [draftName, setDraftName] = useState(account.name)
  const [draftBalance, setDraftBalance] = useState(account.balance)

  function commitName(): void {
    const trimmed = draftName.trim()
    if (trimmed.length > 0 && trimmed !== account.name) {
      onNameChange(account.account_uid, trimmed)
    } else {
      setDraftName(account.name)
    }
  }

  // 帳戶餘額原本只能在建立帳戶時設定，建立後沒有地方能手動對帳／修正誤差，只能靠交易間接
  // 調整（使用者反映此為缺口）。這裡比照 commitName 的 draft + blur/Enter 送出慣例，但允許
  // 負數（信用卡循環未繳等情境）且不要求「跟現值不同才送」以外的其他限制。
  function commitBalance(): void {
    const trimmed = draftBalance.trim()
    if (BALANCE_PATTERN.test(trimmed) && trimmed !== account.balance) {
      onBalanceChange(account.account_uid, trimmed)
    } else {
      setDraftBalance(account.balance)
    }
  }

  function toggleEditing(): void {
    setDraftName(account.name)
    setDraftBalance(account.balance)
    setIsEditing((current) => !current)
  }

  return (
    <CurvedCard>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <EntityIcon icon={account.icon} color={account.color} />
          <div className="flex flex-col">
            <span className="text-base font-medium text-text-primary">{account.name}</span>
            <span className="text-sm text-text-secondary">
              {account.balance} {account.currency}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={toggleEditing}
            aria-expanded={isEditing}
            aria-label={`編輯 ${account.name}`}
            className="flex h-11 w-11 items-center justify-center rounded-md text-text-secondary hover:text-text-primary md:h-8 md:w-8 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600"
          >
            <span aria-hidden="true">✎</span>
          </button>
          <button
            type="button"
            disabled={isOnlyAccount}
            title={isOnlyAccount ? '至少需保留一個帳戶' : undefined}
            onClick={() => onRequestDelete(account)}
            aria-label={`刪除 ${account.name}`}
            className="flex h-11 w-11 items-center justify-center rounded-md text-danger-500 hover:text-danger-700 disabled:pointer-events-none disabled:opacity-40 md:h-8 md:w-8 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600"
          >
            <span aria-hidden="true">✕</span>
          </button>
        </div>
      </div>
      {isOnlyAccount && (
        <p className="mt-2 text-sm text-text-secondary">至少需保留一個帳戶</p>
      )}
      {isEditing && (
        <div className="mt-3 flex flex-col gap-3 border-t border-border pt-3">
          {/* 獨立於 <label> 之外（不當它的子節點）：放進 <label> 內會被瀏覽器算進 input 的
              accessible name，讓 getByLabelText('名稱') 在儲存中途多比對到「名稱 儲存中…」
              而找不到元素（→ 本次會話稍早修過同一種 bug，assets/page.tsx 表單提示文字同理）。 */}
          {isSaving && <p className="text-xs text-text-muted">儲存中…</p>}
          <label className="flex flex-col gap-1">
            <span className="text-sm text-text-secondary">名稱</span>
            <input
              type="text"
              maxLength={100}
              disabled={isSaving}
              value={draftName}
              onChange={(event) => setDraftName(event.target.value)}
              onBlur={commitName}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  commitName()
                }
              }}
              className="min-h-11 rounded-md border border-border bg-surface px-3 text-text-primary disabled:opacity-50"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm text-text-secondary">餘額</span>
            <input
              type="text"
              inputMode="decimal"
              autoComplete="off"
              disabled={isSaving}
              value={draftBalance}
              onChange={(event) => setDraftBalance(event.target.value)}
              onBlur={commitBalance}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  commitBalance()
                }
              }}
              className="min-h-11 rounded-md border border-border bg-surface px-3 text-text-primary disabled:opacity-50"
            />
          </label>
          <div className="flex flex-col gap-2">
            <span className="text-sm text-text-secondary">顏色</span>
            <ColorSwatchPicker
              value={account.color}
              disabled={isSaving}
              onChange={(color) => onColorChange(account.account_uid, color)}
            />
          </div>
          <div className="flex flex-col gap-2">
            <span className="text-sm text-text-secondary">圖示</span>
            <IconPicker
              value={account.icon}
              disabled={isSaving}
              onChange={(nextIcon) => onIconChange(account.account_uid, nextIcon)}
            />
          </div>
        </div>
      )}
    </CurvedCard>
  )
}
