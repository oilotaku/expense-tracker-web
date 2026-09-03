'use client'

import { useState, type FormEvent, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { getAuthErrorMessage, useRegisterMutation } from '@/lib/api/authApi'

export default function RegisterPage(): ReactNode {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [register, { isLoading, error }] = useRegisterMutation()

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    try {
      // 註冊不會設定登入 cookie（只有 /auth/login 會，見 backend/app/api/v1/auth.py），
      // 成功後導去登入頁而非交易頁
      await register({ email, password }).unwrap()
      router.push('/login')
    } catch {
      // 錯誤已透過 useRegisterMutation() 的 error 狀態顯示，這裡只需擋掉 unwrap() 的 rejection
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-6">
      <h1 className="text-2xl font-bold">註冊</h1>
      <form onSubmit={handleSubmit} className="flex w-full max-w-sm flex-col gap-4" noValidate>
        <label className="flex flex-col gap-1">
          <span className="text-sm">Email</span>
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="min-h-11 rounded border px-3"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm">密碼</span>
          <input
            type="password"
            required
            minLength={8}
            maxLength={72}
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="min-h-11 rounded border px-3"
          />
        </label>
        <p className="text-xs text-gray-500">密碼至少 8 個字元</p>
        {error && (
          <p role="alert" className="text-sm text-red-600">
            {getAuthErrorMessage(error)}
          </p>
        )}
        <button
          type="submit"
          disabled={isLoading}
          className="min-h-11 rounded border px-4 disabled:opacity-50"
        >
          {isLoading ? '註冊中…' : '註冊'}
        </button>
      </form>
      <Link href="/login" className="text-sm underline">
        已經有帳號？登入
      </Link>
    </main>
  )
}
