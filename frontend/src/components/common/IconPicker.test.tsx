import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { IconPicker } from './IconPicker'

// IconPicker 內含「我的圖示」區（ADR-0006），本檔不測自訂圖示，mock 掉其 API hook
vi.mock('@/lib/api/iconsApi', () => import('@/test/iconsApiMock'))

describe('IconPicker', () => {
  it('點擊圖示觸發 onChange', () => {
    const onChange = vi.fn()
    render(<IconPicker value="food" onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: '交通' }))
    expect(onChange).toHaveBeenCalledExactlyOnceWith('transport')
  })

  it('目前選中的圖示 aria-pressed 為 true，其餘為 false', () => {
    render(<IconPicker value="home" onChange={() => {}} />)
    expect(screen.getByRole('button', { name: '居住' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: '餐飲' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('value 為空字串時無圖示被選中', () => {
    render(<IconPicker value="" onChange={() => {}} />)
    const pressedButtons = screen
      .getAllByRole('button')
      .filter((button) => button.getAttribute('aria-pressed') === 'true')
    expect(pressedButtons).toHaveLength(0)
  })

  it('disabled 時圖示按鈕皆 disabled', () => {
    render(<IconPicker value="" onChange={() => {}} disabled />)
    expect(screen.getByRole('button', { name: '其他' })).toBeDisabled()
  })
})

describe('IconPicker 我的圖示', () => {
  it('列出自訂圖示，點擊回傳 custom: key', async () => {
    const { useListIconsQuery } = await import('@/test/iconsApiMock')
    useListIconsQuery.mockReturnValueOnce({
      data: {
        items: [
          {
            user_icon_uid: 'u-1',
            icon_key: 'custom:u-1',
            url: '/api/v1/icons/u-1',
            content_sha256: 'x',
            byte_size: 1,
            usage_count: 0,
            created_at: '2026-10-29T00:00:00+08:00',
          },
        ],
        quota: { used: 1, limit: 50 },
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as never)
    const onChange = vi.fn()
    render(<IconPicker value="custom:u-1" onChange={onChange} />)
    const button = screen.getByRole('button', { name: '自訂圖示 1' })
    expect(button).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(button)
    expect(onChange).toHaveBeenCalledExactlyOnceWith('custom:u-1')
    expect(screen.getByRole('button', { name: '＋ 上傳新圖示' })).toBeEnabled()
  })

  it('allowCustom=false 時不顯示我的圖示區', () => {
    render(<IconPicker value="food" onChange={() => {}} allowCustom={false} />)
    expect(screen.queryByRole('group', { name: '我的圖示' })).toBeNull()
  })
})
