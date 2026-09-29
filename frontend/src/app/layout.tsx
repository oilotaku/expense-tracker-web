import type { Metadata, Viewport } from 'next'
import type { ReactNode } from 'react'
import { Manrope } from 'next/font/google'
import { ServiceWorkerRegister } from '@/components/pwa/ServiceWorkerRegister'
import { StoreProvider } from '@/store/provider'
import './globals.css'

const manrope = Manrope({
  subsets: ['latin'],
  variable: '--font-manrope',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'expense-tracker-web',
  applicationName: '記帳',
  // manifest 由 app/manifest.ts、apple-touch-icon 由 app/apple-icon.png 自動產生 <link>；
  // iOS 加入主畫面後的名稱與狀態列另外靠這組 meta
  appleWebApp: { capable: true, title: '記帳', statusBarStyle: 'default' },
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#faf8fc' },
    { media: '(prefers-color-scheme: dark)', color: '#1c1826' },
  ],
}

interface RootLayoutProps {
  children: ReactNode
}

// 三態主題偏好（light/dark/system）解析必須在 React hydrate 前同步跑完並寫入
// <html data-theme>，否則會先閃一次錯誤主題（FOUC）。system 時不寫入 data-theme，
// 交給 globals.css 的 @media (prefers-color-scheme: dark) 接管（→ design-spec.md §2.7）。
const THEME_INIT_SCRIPT = `(function(){try{var v=window.localStorage.getItem('theme-preference');if(v==='light'||v==='dark'){document.documentElement.setAttribute('data-theme',v)}}catch(e){}})();`

export default function RootLayout({ children }: RootLayoutProps): ReactNode {
  return (
    <html lang="zh-TW" className={manrope.variable} suppressHydrationWarning>
      <body>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <StoreProvider>{children}</StoreProvider>
        <ServiceWorkerRegister />
      </body>
    </html>
  )
}
