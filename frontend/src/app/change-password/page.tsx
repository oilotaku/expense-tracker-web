'use client'

import { useState, type FormEvent, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { cva } from 'class-variance-authority'
import { AuthGuard } from '@/components/AuthGuard'
import { CurvedCard } from '@/components/common/CurvedCard'
import { WaveDivider } from '@/components/common/WaveDivider'
import { getAuthErrorMessage, useChangePasswordMutation } from '@/lib/api/authApi'

// 同 register/page.tsx 的 submitButtonClassName/inputClassName 寫法（→ FE-052）。
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

function ChangePasswordPageContent(): ReactNode {
  const router = useRouter()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [changePassword, { isLoading, error }] = useChangePasswordMutation()

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    try {
      await changePassword({
        current_password: currentPassword,
        new_password: newPassword,
      }).unwrap()
      // 成功後 invalidatesTags 讓 <AuthGuard> 重新讀到 must_change_password=false 才會放行，
      // 這裡先手動導向總覽頁，避免使用者卡在原地等重新 fetch。
      router.replace('/dashboard')
    } catch {
      // 錯誤已透過 useChangePasswordMutation() 的 error 狀態顯示
    }
  }

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center gap-6 overflow-hidden bg-bg p-6">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-28 md:h-36">
        <WaveDivider />
      </div>
      <CurvedCard padding="md" className="relative z-10 flex w-full max-w-sm flex-col gap-6">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-bold text-text-primary">請設定新密碼</h1>
          <p className="text-sm text-text-secondary">
            管理員已重設你的密碼，請先設定一組新密碼才能繼續使用。
          </p>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
          <label className="flex flex-col gap-1">
            <span className="text-sm text-text-secondary">目前密碼（臨時密碼）</span>
            <input
              type="password"
              required
              maxLength={72}
              autoComplete="current-password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              className={inputClassName}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm text-text-secondary">新密碼</span>
            <input
              type="password"
              required
              minLength={8}
              maxLength={72}
              autoComplete="new-password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              className={inputClassName}
            />
          </label>
          <p className="text-xs text-text-muted">新密碼至少 8 個字元</p>
          {error && (
            <p role="alert" className="text-sm text-danger-700">
              {getAuthErrorMessage(error)}
            </p>
          )}
          <button type="submit" disabled={isLoading} className={submitButtonClassName({ isLoading })}>
            {isLoading ? '送出中…' : '設定新密碼'}
          </button>
        </form>
      </CurvedCard>
    </main>
  )
}

export default function ChangePasswordPage(): ReactNode {
  return (
    <AuthGuard>
      <ChangePasswordPageContent />
    </AuthGuard>
  )
}
