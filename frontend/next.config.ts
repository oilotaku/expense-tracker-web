import type { NextConfig } from 'next'
import { apiOriginFromUrl, securityHeaders } from './src/lib/security/csp'

// NODE_ENV 在這個專案永遠是 'production'（dev / prod 都跑 `next build`，見 AGENTS.md），
// 不能拿來判斷「是不是本機/內網開發環境」；要看的是實際部署環境 APP_ENV。
const isDev = process.env.APP_ENV !== 'production'
const apiOrigin = apiOriginFromUrl(process.env.NEXT_PUBLIC_API_URL)

// 瀏覽器端 API 走同源 `/api/v1`（NEXT_PUBLIC_API_URL=/api/v1），由 Next 轉給 compose 內網的 backend。
// 同源才能讓頁面改走 HTTPS（tailscale serve）時不被混合內容擋下，也是 PWA 的前提。
// rewrites 在 build 時寫進 routes-manifest，所以內網位址要在 build 階段就確定。
const apiProxyTarget = process.env.API_PROXY_TARGET ?? 'http://backend:8000/api/v1'

const nextConfig: NextConfig = {
  // docker/frontend/Dockerfile 用 standalone 輸出
  output: 'standalone',
  poweredByHeader: false,
  async rewrites() {
    return [{ source: '/api/v1/:path*', destination: `${apiProxyTarget}/:path*` }]
  },
  // 安全 header 基線（含 CSP）；內容與測試都在 src/lib/security/csp.ts
  async headers() {
    return [
      { source: '/:path*', headers: securityHeaders({ isDev, apiOrigin }) },
      // Service Worker 腳本不能被 HTTP 快取，否則更新版要等快取過期才生效
      { source: '/sw.js', headers: [{ key: 'Cache-Control', value: 'no-cache' }] },
    ]
  },
}

export default nextConfig
