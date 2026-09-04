import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useBreakpoint } from './useBreakpoint'

interface MockMediaQueryList {
  matches: boolean
  media: string
  addEventListener: (type: 'change', listener: (event: MediaQueryListEvent) => void) => void
  removeEventListener: (type: 'change', listener: (event: MediaQueryListEvent) => void) => void
  dispatch: (matches: boolean) => void
}

function createMockMediaQueryList(media: string, initialMatches: boolean): MockMediaQueryList {
  let listener: ((event: MediaQueryListEvent) => void) | null = null
  return {
    matches: initialMatches,
    media,
    addEventListener: (_type, changeListener) => {
      listener = changeListener
    },
    removeEventListener: (_type, changeListener) => {
      if (listener === changeListener) listener = null
    },
    dispatch(matches: boolean) {
      this.matches = matches
      listener?.({ matches } as unknown as MediaQueryListEvent)
    },
  }
}

describe('useBreakpoint', () => {
  let registry: Map<string, MockMediaQueryList>

  beforeEach(() => {
    registry = new Map()
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockImplementation((media: string) => {
        const existing = registry.get(media)
        if (existing) return existing
        const created = createMockMediaQueryList(media, false)
        registry.set(media, created)
        return created
      }),
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('未達 breakpoint 時回傳 false', () => {
    const { result } = renderHook(() => useBreakpoint('md'))
    expect(result.current).toBe(false)
  })

  it('已達 breakpoint 時回傳 true', () => {
    registry.set('(min-width: 768px)', createMockMediaQueryList('(min-width: 768px)', true))
    const { result } = renderHook(() => useBreakpoint('md'))
    expect(result.current).toBe(true)
  })

  it('viewport 寬度透過 change 事件變更時同步更新', () => {
    const { result } = renderHook(() => useBreakpoint('md'))
    expect(result.current).toBe(false)

    act(() => {
      registry.get('(min-width: 768px)')?.dispatch(true)
    })
    expect(result.current).toBe(true)
  })

  it('不同 breakpoint 各自查詢對應的 min-width（例如 lg 對應 1024px）', () => {
    renderHook(() => useBreakpoint('lg'))
    expect(registry.has('(min-width: 1024px)')).toBe(true)
  })
})
