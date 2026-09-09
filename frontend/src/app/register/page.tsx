'use client'

import { useState, type FormEvent, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { cva } from 'class-variance-authority'
import { CurvedCard } from '@/components/common/CurvedCard'
import { WaveDivider } from '@/components/common/WaveDivider'
import { getAuthErrorMessage, useRegisterMutation } from '@/lib/api/authApi'

// FE-052：條件樣式禁 inline 三元串接重複；同 AssetsPage/BudgetsPage 的 submitButtonClassName 寫法。
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

export default function RegisterPage(): ReactNode {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [register, { isLoading, error }] = useRegisterMutation()

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    try {
      // 註冊不會設定登入 cookie（只有 /auth/login 會，見 backend/app/api/v1/auth.py），
      // 成功後導去登入頁而非交易頁。`justRegistered` 由登入頁一路帶到總覽頁，作為「註冊後的
      // 首次登入」訊號，用來提醒設定 PIN 快速登入（只此一次，不打擾刻意不設 PIN 的既有使用者）。
      await register({ email, password }).unwrap()
      router.push('/login?justRegistered=1')
    } catch {
      // 錯誤已透過 useRegisterMutation() 的 error 狀態顯示，這裡只需擋掉 unwrap() 的 rejection
    }
  }

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center gap-6 overflow-hidden bg-bg p-6">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-28 md:h-36">
        <WaveDivider />
      </div>
      <CurvedCard padding="md" className="relative z-10 flex w-full max-w-sm flex-col gap-6">
        <h1 className="text-2xl font-bold text-text-primary">註冊</h1>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
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
              minLength={8}
              maxLength={72}
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className={inputClassName}
            />
          </label>
          <p className="text-xs text-text-muted">密碼至少 8 個字元</p>
          {error && (
            <p role="alert" className="text-sm text-danger-700">
              {getAuthErrorMessage(error)}
            </p>
          )}
          <button type="submit" disabled={isLoading} className={submitButtonClassName({ isLoading })}>
            {isLoading ? '註冊中…' : '註冊'}
          </button>
        </form>
        <Link href="/login" className="text-center text-sm text-primary-600 underline">
          已經有帳號？登入
        </Link>
      </CurvedCard>
    </main>
  )
}
