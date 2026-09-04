import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CategoryChip } from './CategoryChip'

const SUBSCRIPTION_CATEGORY = {
  category_uid: 'c-subscription',
  name: '訂閱',
  color: '#3E8FD0',
  icon: 'subscription',
}

describe('CategoryChip', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('render 分類名稱與依 color 上色的圖示徽章', () => {
    render(
      <CategoryChip
        category={SUBSCRIPTION_CATEGORY}
        onColorChange={vi.fn()}
        onIconChange={vi.fn()}
        onRequestDelete={vi.fn()}
      />,
    )
    expect(screen.getByText('訂閱')).toBeInTheDocument()
    const badge = screen.getByLabelText('編輯 訂閱').querySelector('span')
    expect(badge).toHaveStyle({ backgroundColor: '#3E8FD0' })
  })

  it('未知 icon key（後端不做 enum 檢查）時退化為通用圖示，不整卡壞掉', () => {
    render(
      <CategoryChip
        category={{ ...SUBSCRIPTION_CATEGORY, icon: 'not-a-real-icon' }}
        onColorChange={vi.fn()}
        onIconChange={vi.fn()}
        onRequestDelete={vi.fn()}
      />,
    )
    expect(screen.getByText('訂閱')).toBeInTheDocument()
  })

  it('點擊卡片展開色票 / 圖示選擇器，選色即時呼叫 onColorChange', () => {
    const onColorChange = vi.fn()
    render(
      <CategoryChip
        category={SUBSCRIPTION_CATEGORY}
        onColorChange={onColorChange}
        onIconChange={vi.fn()}
        onRequestDelete={vi.fn()}
      />,
    )

    expect(screen.queryByRole('group', { name: '固定色票' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('編輯 訂閱'))
    expect(screen.getByRole('group', { name: '固定色票' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '選擇顏色 #E8834B' }))
    expect(onColorChange).toHaveBeenCalledExactlyOnceWith('c-subscription', '#E8834B')
  })

  it('展開後選圖示即時呼叫 onIconChange', () => {
    const onIconChange = vi.fn()
    render(
      <CategoryChip
        category={SUBSCRIPTION_CATEGORY}
        onColorChange={vi.fn()}
        onIconChange={onIconChange}
        onRequestDelete={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByLabelText('編輯 訂閱'))
    fireEvent.click(screen.getByRole('button', { name: '餐飲' }))
    expect(onIconChange).toHaveBeenCalledExactlyOnceWith('c-subscription', 'food')
  })

  it('點擊刪除按鈕呼叫 onRequestDelete 並帶完整分類資料', () => {
    const onRequestDelete = vi.fn()
    render(
      <CategoryChip
        category={SUBSCRIPTION_CATEGORY}
        onColorChange={vi.fn()}
        onIconChange={vi.fn()}
        onRequestDelete={onRequestDelete}
      />,
    )
    fireEvent.click(screen.getByLabelText('刪除 訂閱'))
    expect(onRequestDelete).toHaveBeenCalledExactlyOnceWith(SUBSCRIPTION_CATEGORY)
  })

  it('行動端短按（touchstart 未滿 500ms 即 touchend）不顯示刪除按鈕', () => {
    render(
      <CategoryChip
        category={SUBSCRIPTION_CATEGORY}
        onColorChange={vi.fn()}
        onIconChange={vi.fn()}
        onRequestDelete={vi.fn()}
      />,
    )
    const card = screen.getByLabelText('刪除 訂閱').closest('div')
    if (card === null) throw new Error('card not found')

    fireEvent.touchStart(card)
    fireEvent.touchEnd(card)
    act(() => {
      vi.advanceTimersByTime(500)
    })
    expect(screen.getByLabelText('刪除 訂閱')).toHaveClass('opacity-0')
  })

  it('行動端長按（touchstart 滿 500ms 才放開）才顯示刪除按鈕', () => {
    render(
      <CategoryChip
        category={SUBSCRIPTION_CATEGORY}
        onColorChange={vi.fn()}
        onIconChange={vi.fn()}
        onRequestDelete={vi.fn()}
      />,
    )
    const card = screen.getByLabelText('刪除 訂閱').closest('div')
    if (card === null) throw new Error('card not found')

    fireEvent.touchStart(card)
    // 計時器 callback 內的 setState 需包在 act() 才會同步 flush（fake timers 下不會自動 batch）
    act(() => {
      vi.advanceTimersByTime(500)
    })
    expect(screen.getByLabelText('刪除 訂閱')).toHaveClass('opacity-100')
  })
})
