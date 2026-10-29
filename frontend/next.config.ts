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
  experimental: {
    // rewrites 轉發的請求 body 預設只留前 10 MB，超過會「截斷後照轉」，後端收到殘缺的 multipart 只能回
    // 難懂的格式錯誤。調到比後端圖示上傳上限（10 MB + 64 KB multipart 額外位元組）略高，讓超過的請求
    // 一律由後端邊讀邊計數擋下並回 413（→ ADR-0006 §4，實測紀錄見該 ADR）。
    proxyClientMaxBodySize: 11 * 1024 * 1024,
  },
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
