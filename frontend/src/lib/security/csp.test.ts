import { describe, expect, it } from 'vitest'
import { apiOriginFromUrl, buildCsp, securityHeaders } from '@/lib/security/csp'

describe('csp', () => {
  it('locks down framing, base-uri and plugins in every environment', () => {
    for (const isDev of [true, false]) {
      const csp = buildCsp({ isDev, apiOrigin: null })
      expect(csp).toContain("frame-ancestors 'none'")
      expect(csp).toContain("object-src 'none'")
      expect(csp).toContain("base-uri 'self'")
    }
  })

  it('never allows eval or ws in production', () => {
    const csp = buildCsp({ isDev: false, apiOrigin: null })
    expect(csp).not.toContain('unsafe-eval')
    expect(csp).not.toContain('ws:')
    expect(csp).toContain('upgrade-insecure-requests')
  })

  it('allows the API origin in connect-src', () => {
    const csp = buildCsp({ isDev: false, apiOrigin: 'https://api.example.com' })
    expect(csp).toContain("connect-src 'self' https://api.example.com")
  })

  it('extracts the origin from a full API url', () => {
    expect(apiOriginFromUrl('http://localhost:8000/api/v1')).toBe(
      'http://localhost:8000',
    )
    expect(apiOriginFromUrl(undefined)).toBeNull()
    expect(apiOriginFromUrl('/api/v1')).toBeNull()
  })

  it('ships HSTS only outside development', () => {
    const keys = (isDev: boolean): string[] =>
      securityHeaders({ isDev, apiOrigin: null }).map((h) => h.key)
    expect(keys(false)).toContain('Strict-Transport-Security')
    expect(keys(true)).not.toContain('Strict-Transport-Security')
    expect(keys(true)).toContain('Content-Security-Policy')
  })
})
