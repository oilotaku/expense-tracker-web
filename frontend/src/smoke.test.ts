import { describe, expect, it } from 'vitest'
import { formatDate } from '@/utils/datetime'

describe('smoke', () => {
  it('runs vitest', () => {
    expect(1 + 1).toBe(2)
  })

  it('formats dates in Asia/Taipei', () => {
    expect(formatDate('2026-08-25T00:00:00+08:00')).toBe('2026/08/25')
  })
})
