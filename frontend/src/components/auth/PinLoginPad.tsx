'use client'

import { useState, type ReactNode } from 'react'
import type { FetchBaseQueryError } from '@reduxjs/toolkit/query/react'
import type { SerializedError } from '@reduxjs/toolkit'
import { NumericKeypad } from '@/components/common/NumericKeypad'
import type { DeviceAccount } from '@/hooks/useDeviceAccounts'
import { getAuthErrorMessage, useLoginWithPinMutation, type AuthUser } from '@/lib/api/authApi'

export interface PinLoginPadProps {
  account: DeviceAccount
  onSuccess: (user: AuthUser) => void
  onSwitchToPassword: () => void
  className?: string
}

const LOCKED_MESSAGE_FALLBACK = 'PIN 已鎖定，請改用密碼登入或稍後再試'

// FE-029：錯誤處理必用型別收窄，禁 `error as any`（同 authApi.ts getAuthErrorMessage 慣例）。catch
// 區塊的變數型別固定是 unknown，先窄化成 getAuthErrorMessage 吃的型別再往下判斷。
function toAuthError(error: unknown): FetchBaseQueryError | SerializedError | undefined {
  if (typeof error !== 'object' || error === null) return undefined
  if ('status' in error || 'message' in error) return error as FetchBaseQueryError | SerializedError
  return undefined
}

function isLockedError(error: FetchBaseQueryError | SerializedError | undefined): boolean {
  return error !== undefined && 'status' in error && error.status === 429
}

function avatarInitial(displayName: string): string {
  return (displayName.charAt(0) || '?').toUpperCase()
}

/**
 * 帳號選擇後的 PIN 輸入畫面（`→ design-spec.md §9.1`）：顯示已選帳號（遮罩 email + 頭像色）+
 * `<NumericKeypad mode="pin">`，滿 6 碼自動呼叫 `POST /auth/login/pin`（`useLoginWithPinMutation`，
 * task-014）。PIN 錯誤（401）顯示訊息並清空重來；鎖定（429，`→ A15`）顯示改用密碼登入提示。
 */
export function PinLoginPad({ account, onSuccess, onSwitchToPassword, className }: PinLoginPadProps): ReactNode {
  const [pin, setPin] = useState('')
  const [loginWithPin, { isLoading }] = useLoginWithPinMutation()
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isLocked, setIsLocked] = useState(false)

  async function handleComplete(value: string): Promise<void> {
    setErrorMessage(null)
    try {
      const user = await loginWithPin({ user_uid: account.user_uid, pin: value }).unwrap()
      setIsLocked(false)
      onSuccess(user)
    } catch (caught) {
      setPin('')
      const authError = toAuthError(caught)
      if (isLockedError(authError)) {
        setIsLocked(true)
        setErrorMessage(getAuthErrorMessage(authError) || LOCKED_MESSAGE_FALLBACK)
        return
      }
      setIsLocked(false)
      setErrorMessage(getAuthErrorMessage(authError) || 'PIN 錯誤')
    }
  }

  return (
    <div className={`flex flex-col gap-4 ${className ?? ''}`}>
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-text-inverse"
          style={{ backgroundColor: account.avatarColor }}
        >
          {avatarInitial(account.displayName)}
        </span>
        <span className="text-base text-text-primary">{account.maskedEmail}</span>
      </div>
      <NumericKeypad
        mode="pin"
        autoComplete="current-password"
        value={pin}
        onChange={setPin}
        onComplete={handleComplete}
        disabled={isLoading || isLocked}
        error={errorMessage !== null}
      />
      {errorMessage && (
        <p role="alert" className="text-center text-sm text-danger-700">
          {errorMessage}
        </p>
      )}
      <button
        type="button"
        onClick={onSwitchToPassword}
        className="min-h-[44px] text-center text-sm text-primary-600 underline"
      >
        改用密碼登入
      </button>
    </div>
  )
}
