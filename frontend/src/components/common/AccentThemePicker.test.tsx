import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { ACCENT_THEMES } from '@/hooks/useAccentPreference'
import { AccentThemePicker } from './AccentThemePicker'

describe('AccentThemePicker', () => {
  beforeEach(() => {
    window.localStorage.clear()
    document.documentElement.removeAttribute('data-accent')
  })

  it('列出全部主題，預設選中薰衣草紫且不寫 data-accent', () => {
    render(<AccentThemePicker />)
    expect(screen.getAllByRole('button')).toHaveLength(ACCENT_THEMES.length)
    expect(screen.getByRole('button', { name: '薰衣草紫' })).toHaveAttribute('aria-pressed', 'true')
    expect(document.documentElement).not.toHaveAttribute('data-accent')
  })

  it('選擇主題寫入 localStorage 與 data-accent，選回預設則移除', () => {
    render(<AccentThemePicker />)
    fireEvent.click(screen.getByRole('button', { name: '海洋藍' }))
    expect(window.localStorage.getItem('accent-theme-preference')).toBe('ocean')
    expect(document.documentElement).toHaveAttribute('data-accent', 'ocean')
    expect(screen.getByRole('button', { name: '海洋藍' })).toHaveAttribute('aria-pressed', 'true')

    fireEvent.click(screen.getByRole('button', { name: '薰衣草紫' }))
    expect(document.documentElement).not.toHaveAttribute('data-accent')
  })

  it('localStorage 內不認得的值退回預設', () => {
    window.localStorage.setItem('accent-theme-preference', 'bogus')
    render(<AccentThemePicker />)
    expect(screen.getByRole('button', { name: '薰衣草紫' })).toHaveAttribute('aria-pressed', 'true')
  })
})
