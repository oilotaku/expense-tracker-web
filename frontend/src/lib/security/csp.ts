// 前端安全 header 基線（CORE-128）。next.config.ts 的 headers() 直接用這裡的輸出，
// 測試（csp.test.ts）也直接驗這裡，避免「規範寫了但沒人套」。
//
// 為什麼 script-src 需要 'unsafe-inline'：App Router 會在 HTML 內嵌 bootstrap script 與
// RSC payload。要拿掉它必須改用 middleware 逐請求發 nonce 並把 nonce 傳進 <Script>；
// 本基線先確保「有 CSP 且 frame-ancestors / object-src / base-uri 已鎖死」，
// 專案要再收緊時走 nonce 版本（見 harness rules/10-frontend/03-env-and-auth.md）。

export interface CspOptions {
  /** development（next dev）需要放行 eval 與 ws，production 一律不放 */
  isDev: boolean
  /** 後端 API 的 origin（`https://api.example.com`）；同源或未設時傳 null */
  apiOrigin: string | null
}

export interface SecurityHeader {
  key: string
  value: string
}

/** 從完整 API URL 取出 origin；取不到（未設 / 相對路徑）回 null。 */
export function apiOriginFromUrl(raw: string | undefined): string | null {
  if (!raw) return null
  try {
    return new URL(raw).origin
  } catch {
    return null
  }
}

export function buildCsp({ isDev, apiOrigin }: CspOptions): string {
  const connect = ["'self'", apiOrigin, isDev ? 'ws:' : null].filter(
    (v): v is string => v !== null,
  )
  const directives: string[][] = [
    ['default-src', "'self'"],
    ['base-uri', "'self'"],
    ['form-action', "'self'"],
    ['frame-ancestors', "'none'"],
    ['object-src', "'none'"],
    ['img-src', "'self'", 'data:', 'blob:'],
    ['font-src', "'self'", 'data:'],
    ['style-src', "'self'", "'unsafe-inline'"],
    ['script-src', "'self'", "'unsafe-inline'", ...(isDev ? ["'unsafe-eval'"] : [])],
    ['connect-src', ...connect],
  ]
  if (!isDev) directives.push(['upgrade-insecure-requests'])
  return directives.map((parts) => parts.join(' ')).join('; ')
}

export function securityHeaders(options: CspOptions): SecurityHeader[] {
  const headers: SecurityHeader[] = [
    { key: 'Content-Security-Policy', value: buildCsp(options) },
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'X-Frame-Options', value: 'DENY' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
    { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  ]
  if (!options.isDev) {
    headers.push({
      key: 'Strict-Transport-Security',
      value: 'max-age=31536000; includeSubDomains',
    })
  }
  return headers
}
