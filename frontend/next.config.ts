import type { NextConfig } from 'next'
import { apiOriginFromUrl, securityHeaders } from './src/lib/security/csp'

const isDev = process.env.NODE_ENV !== 'production'
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
