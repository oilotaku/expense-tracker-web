import type { NextConfig } from 'next'
import { apiOriginFromUrl, securityHeaders } from './src/lib/security/csp'

// NODE_ENV 在這個專案永遠是 'production'（dev / prod 都跑 `next build`，見 AGENTS.md），
// 不能拿來判斷「是不是本機/內網開發環境」；要看的是實際部署環境 APP_ENV。
const isDev = process.env.APP_ENV !== 'production'
const apiOrigin = apiOriginFromUrl(process.env.NEXT_PUBLIC_API_URL)

const nextConfig: NextConfig = {
  // docker/frontend/Dockerfile 用 standalone 輸出
  output: 'standalone',
  poweredByHeader: false,
  // 安全 header 基線（含 CSP）；內容與測試都在 src/lib/security/csp.ts
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders({ isDev, apiOrigin }) }]
  },
}

export default nextConfig
