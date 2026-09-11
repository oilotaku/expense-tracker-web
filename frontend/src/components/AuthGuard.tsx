'use client'

import { useEffect, type ReactNode } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useGetMeQuery } from '@/lib/api/authApi'

interface AuthGuardProps {
  children: ReactNode
}

const CHANGE_PASSWORD_PATH = '/change-password'

// 包住需登入的路由：未登入（GET /auth/me 失敗，→ FE-036 / FE-037）導回 /login；
// must_change_password=true（後台管理員重設密碼後）強制導去 /change-password，改完才放行
// 離開——該頁本身也包在 <AuthGuard> 底下，故用 pathname 排除自己，避免無限導向迴圈。
// 授權仍由後端每個 API 驗證，本元件只做 UX 導向，禁自行解 JWT 判角色（→ FE-037）。
export function AuthGuard({ children }: AuthGuardProps): ReactNode {
  const router = useRouter()
  const pathname = usePathname()
  const { data, isLoading, isError } = useGetMeQuery()
  const mustChangePassword = data?.must_change_password === true && pathname !== CHANGE_PASSWORD_PATH

  useEffect(() => {
    if (isLoading) return
    if (isError) {
      router.replace('/login')
      return
    }
    if (mustChangePassword) {
      router.replace(CHANGE_PASSWORD_PATH)
    }
  }, [isLoading, isError, mustChangePassword, router])

  if (isLoading || isError || mustChangePassword) {
    return null
  }

  return children
}
