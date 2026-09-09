import type { ReactNode } from 'react'
import { redirect } from 'next/navigation'

// 根路由不是獨立畫面，一律導向 Dashboard（→ design-spec.md §3 IA：Dashboard 為根節點）；
// 未登入的情況由 /dashboard 內的 <AuthGuard> 接手導回 /login，本頁不重複判斷登入態。
export default function Home(): ReactNode {
  redirect('/dashboard')
}
