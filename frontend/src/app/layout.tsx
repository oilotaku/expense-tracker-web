import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { StoreProvider } from '@/store/provider'
import './globals.css'

export const metadata: Metadata = {
  title: 'expense-tracker-web',
}

interface RootLayoutProps {
  children: ReactNode
}

export default function RootLayout({ children }: RootLayoutProps): ReactNode {
  return (
    <html lang="zh-TW">
      <body>
        <StoreProvider>{children}</StoreProvider>
      </body>
    </html>
  )
}
