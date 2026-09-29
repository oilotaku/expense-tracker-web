import type { MetadataRoute } from 'next'

// Web App Manifest：讓網站能「加入主畫面」並以獨立視窗開啟（需 HTTPS，見 CLAUDE.md 的 tailscale serve）。
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: '個人記帳',
    short_name: '記帳',
    description: '追蹤日常收支與分類統計',
    lang: 'zh-TW',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#faf8fc',
    theme_color: '#8257d6',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
