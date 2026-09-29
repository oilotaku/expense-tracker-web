import { describe, expect, it } from 'vitest'
import manifest from './manifest'

describe('manifest', () => {
  it('可安裝：standalone、起始頁在站內、有 192/512 與 maskable 圖示', () => {
    const m = manifest()
    expect(m.display).toBe('standalone')
    expect(m.start_url).toBe('/')
    expect(m.scope).toBe('/')
    const icons = m.icons ?? []
    expect(icons.map((i) => i.sizes)).toEqual(expect.arrayContaining(['192x192', '512x512']))
    expect(icons.some((i) => i.purpose === 'maskable')).toBe(true)
    for (const icon of icons) expect(icon.src.startsWith('/icons/')).toBe(true)
  })
})
