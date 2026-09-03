'use client'

import { useState, type FormEvent, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { getAuthErrorMessage, useLoginMutation } from '@/lib/api/authApi'

export default function LoginPage(): ReactNode {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [login, { isLoading, error }] = useLoginMutation()

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    try {
      // 登入成功後 cookie 已由後端設定（httponly，→ FE-035），前端只負責導向
      await login({ email, password }).unwrap()
      router.push('/transactions')
    } catch {
      // 錯誤已透過 useLoginMutation() 的 error 狀態顯示，這裡只需擋掉 unwrap() 的 rejection
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-6">
      <h1 className="text-2xl font-bold">登入</h1>
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
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="min-h-11 rounded border px-3"
          />
        </label>
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
          {isLoading ? '登入中…' : '登入'}
        </button>
      </form>
      <Link href="/register" className="text-sm underline">
        還沒有帳號？註冊
      </Link>
    </main>
  )
}
