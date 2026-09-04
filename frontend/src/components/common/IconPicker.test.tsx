import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { IconPicker } from './IconPicker'

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
