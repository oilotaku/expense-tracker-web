'use client'

// 路由級錯誤邊界（FE-014）；接 Sentry 時依 FE-020 在 useEffect 內 captureException
import type { ReactNode } from 'react'

interface RouteErrorProps {
  error: Error & { digest?: string }
  reset: () => void
}

export default function RouteError({ error, reset }: RouteErrorProps): ReactNode {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-6">
      <h1 className="text-2xl font-bold">發生錯誤</h1>
      {error.digest && <p className="text-sm text-gray-500">代碼：{error.digest}</p>}
      <button type="button" onClick={reset} className="min-h-11 rounded border px-4">
        重試
      </button>
    </main>
  )
}
