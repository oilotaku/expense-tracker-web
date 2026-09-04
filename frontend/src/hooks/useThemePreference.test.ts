import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useThemePreference } from './useThemePreference'

const STORAGE_KEY = 'theme-preference'

describe('useThemePreference', () => {
  beforeEach(() => {
    window.localStorage.clear()
    document.documentElement.removeAttribute('data-theme')
  })

  afterEach(() => {
    window.localStorage.clear()
    document.documentElement.removeAttribute('data-theme')
  })

  it('localStorage 無值時預設為 system，且不寫入 data-theme', () => {
    const { result } = renderHook(() => useThemePreference())
    expect(result.current.preference).toBe('system')
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false)
  })

  it('localStorage 已有合法值（light）時讀回並套用 data-theme', () => {
    window.localStorage.setItem(STORAGE_KEY, 'light')
    const { result } = renderHook(() => useThemePreference())
    expect(result.current.preference).toBe('light')
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
  })

  it('localStorage 已有合法值（dark）時讀回並套用 data-theme', () => {
    window.localStorage.setItem(STORAGE_KEY, 'dark')
    const { result } = renderHook(() => useThemePreference())
    expect(result.current.preference).toBe('dark')
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
  })

  it('localStorage 值不合法時解析降級為 system', () => {
    window.localStorage.setItem(STORAGE_KEY, 'sepia')
    const { result } = renderHook(() => useThemePreference())
    expect(result.current.preference).toBe('system')
  })

  it('setPreference("light") 寫入 localStorage 並套用 data-theme="light"', () => {
    const { result } = renderHook(() => useThemePreference())
    act(() => {
      result.current.setPreference('light')
    })
    expect(result.current.preference).toBe('light')
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('light')
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
  })

  it('setPreference("dark") 寫入 localStorage 並套用 data-theme="dark"', () => {
    const { result } = renderHook(() => useThemePreference())
    act(() => {
      result.current.setPreference('dark')
    })
    expect(result.current.preference).toBe('dark')
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('dark')
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
  })

  it('setPreference("system") 寫入 localStorage 並清除 data-theme 屬性', () => {
    window.localStorage.setItem(STORAGE_KEY, 'dark')
    const { result } = renderHook(() => useThemePreference())
    act(() => {
      result.current.setPreference('system')
    })
    expect(result.current.preference).toBe('system')
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('system')
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false)
  })
})
