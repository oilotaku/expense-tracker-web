import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { EmptyState, ErrorState, LoadingState } from './StateBlocks'

describe('StateBlocks', () => {
  it('LoadingState 以 role=status 呈現骨架列，並保留 sr-only「載入中…」給輔助技術', () => {
    render(<LoadingState rows={2} />)
    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(screen.getByText('載入中…')).toHaveClass('sr-only')
  })

  it('ErrorState 有 onRetry 時顯示「重試」並在點擊時呼叫', () => {
    const onRetry = vi.fn()
    render(<ErrorState message="伺服器錯誤" onRetry={onRetry} />)
    expect(screen.getByRole('alert')).toHaveTextContent('伺服器錯誤')
    fireEvent.click(screen.getByRole('button', { name: '重試' }))
    expect(onRetry).toHaveBeenCalledOnce()
  })

  it('ErrorState 沒有 onRetry 時不顯示按鈕', () => {
    render(<ErrorState message="伺服器錯誤" />)
    expect(screen.queryByRole('button', { name: '重試' })).not.toBeInTheDocument()
  })

  it('EmptyState 顯示標題與下一步提示', () => {
    render(<EmptyState title="尚未設定預算" description="用上方表單新增" />)
    expect(screen.getByText('尚未設定預算')).toBeInTheDocument()
    expect(screen.getByText('用上方表單新增')).toBeInTheDocument()
  })
})
