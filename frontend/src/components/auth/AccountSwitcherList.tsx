'use client'

import type { ReactNode } from 'react'
import type { DeviceAccount } from '@/hooks/useDeviceAccounts'

export interface AccountSwitcherListProps {
  accounts: DeviceAccount[]
  onSelectAccount: (account: DeviceAccount) => void
  onUseOtherAccount: () => void
  className?: string
}

const ACCOUNT_BUTTON_CLASS =
  'flex min-h-[44px] w-full items-center gap-3 rounded-md border border-border bg-surface px-4 py-3 text-left ' +
  'transition-colors hover:bg-primary-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600'

function avatarInitial(displayName: string): string {
  return (displayName.charAt(0) || '?').toUpperCase()
}

/**
 * 裝置記住的帳號清單（`→ design-spec.md §9.1` / `[A3]`），純展示元件——資料由呼叫端（`/login`）
 * 透過 `useDeviceAccounts` 讀取後傳入，本元件不直接碰 `localStorage`。點選帳號交給呼叫端決定下一步
 * （切到 `<PinLoginPad>`）；「+ 使用其他帳號登入」切到 Email+密碼表單。
 */
export function AccountSwitcherList({
  accounts,
  onSelectAccount,
  onUseOtherAccount,
  className,
}: AccountSwitcherListProps): ReactNode {
  return (
    <div className={`flex flex-col gap-3 ${className ?? ''}`}>
      <ul className="flex flex-col gap-2">
        {accounts.map((account) => (
          <li key={account.user_uid}>
            <button
              type="button"
              className={ACCOUNT_BUTTON_CLASS}
              onClick={() => onSelectAccount(account)}
            >
              <span
                aria-hidden="true"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-text-inverse"
                style={{ backgroundColor: account.avatarColor }}
              >
                {avatarInitial(account.displayName)}
              </span>
              <span className="text-base text-text-primary">{account.maskedEmail}</span>
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={onUseOtherAccount}
        className="min-h-[44px] w-full rounded-md border border-dashed border-border px-4 py-3 text-base text-text-secondary transition-colors hover:bg-primary-100"
      >
        + 使用其他帳號登入
      </button>
    </div>
  )
}
