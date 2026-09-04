'use client'

import { useState, type FormEvent, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { cva } from 'class-variance-authority'
import { CurvedCard } from '@/components/common/CurvedCard'
import { WaveDivider } from '@/components/common/WaveDivider'
import { AccountSwitcherList } from '@/components/auth/AccountSwitcherList'
import { PinLoginPad } from '@/components/auth/PinLoginPad'
import { useBreakpoint } from '@/hooks/useBreakpoint'
import { useDeviceAccounts, type DeviceAccount } from '@/hooks/useDeviceAccounts'
import { getAuthErrorMessage, useLoginMutation } from '@/lib/api/authApi'

// FE-052：條件樣式禁 inline 三元串接重複；同 register/page.tsx 慣例。
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

const inputClassName =
  'min-h-11 rounded-md border border-border bg-surface px-3 text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600'

type ManualView = 'accounts' | 'password'

/**
 * 同一 `<LoginView>`（design-spec.md §9.1）：`useBreakpoint('md')` 只決定**預設顯示哪個子畫面**
 * （行動端有記住帳號時預設帳號選擇器 + PIN、桌機預設 Email+密碼表單），非另建路由（`→ FE-063` 例外，
 * §9.1「對應表」已註記此處屬允許的 `useBreakpoint` JS 判斷情境）。使用者可透過畫面內連結手動切換
 * （`manualView` 覆蓋預設值），選定帳號後進入 PIN 畫面（`selectedAccount` 非 null）。
 */
export default function LoginPage(): ReactNode {
  const router = useRouter()
  const isDesktop = useBreakpoint('md')
  const { accounts } = useDeviceAccounts()
  const hasAccounts = accounts.length > 0

  const [manualView, setManualView] = useState<ManualView | null>(null)
  const [selectedAccount, setSelectedAccount] = useState<DeviceAccount | null>(null)

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [login, { isLoading, error }] = useLoginMutation()

  const defaultView: ManualView = !isDesktop && hasAccounts ? 'accounts' : 'password'
  const view: ManualView | 'pin' = selectedAccount ? 'pin' : (manualView ?? defaultView)

  function handleSelectAccount(account: DeviceAccount): void {
    setSelectedAccount(account)
  }

  function handleUseOtherAccount(): void {
    setSelectedAccount(null)
    setManualView('password')
  }

  function handleSwitchToPin(): void {
    setSelectedAccount(null)
    setManualView('accounts')
  }

  function handlePinSuccess(): void {
    // 登入成功後 cookie 已由後端設定（httponly，→ FE-035），前端只負責導向；
    // PinLoginPad 的 onSuccess 會帶入 AuthUser，這裡用不到，函式簽章刻意省略該參數
    router.push('/dashboard')
  }

  function handleSwitchToPassword(): void {
    setSelectedAccount(null)
    setManualView('password')
  }

  async function handlePasswordSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    try {
      await login({ email, password }).unwrap()
      router.push('/dashboard')
    } catch {
      // 錯誤已透過 useLoginMutation() 的 error 狀態顯示，這裡只需擋掉 unwrap() 的 rejection
    }
  }

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center gap-6 overflow-hidden bg-bg p-6">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-28 md:h-36">
        <WaveDivider />
      </div>
      <CurvedCard padding="md" className="relative z-10 flex w-full max-w-sm flex-col gap-6">
        {view === 'accounts' && (
          <>
            <h1 className="text-2xl font-bold text-text-primary">選擇帳號</h1>
            <AccountSwitcherList
              accounts={accounts}
              onSelectAccount={handleSelectAccount}
              onUseOtherAccount={handleUseOtherAccount}
            />
          </>
        )}
        {view === 'pin' && selectedAccount && (
          <PinLoginPad
            account={selectedAccount}
            onSuccess={handlePinSuccess}
            onSwitchToPassword={handleSwitchToPassword}
          />
        )}
        {view === 'password' && (
          <>
            <h1 className="text-2xl font-bold text-text-primary">登入</h1>
            <form onSubmit={handlePasswordSubmit} className="flex flex-col gap-4" noValidate>
              <label className="flex flex-col gap-1">
                <span className="text-sm text-text-secondary">Email</span>
                <input
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className={inputClassName}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-sm text-text-secondary">密碼</span>
                <input
                  type="password"
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className={inputClassName}
                />
              </label>
              {error && (
                <p role="alert" className="text-sm text-danger-700">
                  {getAuthErrorMessage(error)}
                </p>
              )}
              <button type="submit" disabled={isLoading} className={submitButtonClassName({ isLoading })}>
                {isLoading ? '登入中…' : '登入'}
              </button>
            </form>
            {hasAccounts && (
              <button
                type="button"
                onClick={handleSwitchToPin}
                className="min-h-[44px] text-center text-sm text-primary-600 underline"
              >
                改用 PIN 快速登入
              </button>
            )}
            <Link href="/register" className="text-center text-sm text-primary-600 underline">
              還沒有帳號？註冊
            </Link>
          </>
        )}
      </CurvedCard>
    </main>
  )
}
