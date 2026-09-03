'use client'

import { useEffect, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { useGetMeQuery } from '@/lib/api/authApi'

interface AuthGuardProps {
  children: ReactNode
}

// 包住需登入的路由：未登入（GET /auth/me 失敗，→ FE-036 / FE-037）導回 /login。
// 授權仍由後端每個 API 驗證，本元件只做 UX 導向，禁自行解 JWT 判角色（→ FE-037）。
export function AuthGuard({ children }: AuthGuardProps): ReactNode {
  const router = useRouter()
  const { isLoading, isError } = useGetMeQuery()

  useEffect(() => {
    if (!isLoading && isError) {
      router.replace('/login')
    }
  }, [isLoading, isError, router])

  if (isLoading || isError) {
    return null
  }

  return children
}
