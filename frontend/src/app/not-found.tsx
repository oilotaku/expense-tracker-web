// 找不到資源用 notFound() 觸發本頁，HTTP 狀態碼才會是 404（FE-018）
import Link from 'next/link'
import type { ReactNode } from 'react'

export default function NotFound(): ReactNode {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-6">
      <h1 className="text-2xl font-bold">找不到頁面</h1>
      <Link href="/" className="inline-flex min-h-11 items-center underline">
        回首頁
      </Link>
    </main>
  )
}
