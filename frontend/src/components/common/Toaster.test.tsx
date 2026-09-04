import type { ReactNode } from 'react'
import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Toaster } from './Toaster'
import { __resetToastStoreForTests, useToast } from '@/hooks/useToast'

// 真實的彈簧退場動畫在 jsdom 不會於同步測試內跑完，AnimatePresence 會讓節點延後卸載；
// 這裡把 motion.div 換成立即卸載的純 div，讓測試專注在 toast 佇列增刪本身。
vi.mock('motion/react', async () => {
  const React = await import('react')
  const MockMotionDiv = React.forwardRef<HTMLDivElement, Record<string, unknown>>((props, ref) => {
    const { initial, animate, exit, transition, ...rest } = props
    void initial
    void animate
    void exit
    void transition
    return <div ref={ref} {...rest} />
  })
  MockMotionDiv.displayName = 'MockMotionDiv'
  return {
    AnimatePresence: ({ children }: { children: ReactNode }) => <>{children}</>,
    motion: { div: MockMotionDiv },
  }
})

// Toaster 會呼叫 useReducedMotion()，jsdom 預設沒有 matchMedia，需手動 stub
// （同 Dialog.test.tsx / useReducedMotion.test.ts 的作法）。
function stubMatchMedia(): void {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((media: string) => ({
      matches: false,
      media,
      addEventListener: () => {},
      removeEventListener: () => {},
    })),
  )
}

describe('Toaster', () => {
  beforeEach(() => {
    __resetToastStoreForTests()
    stubMatchMedia()
  })

  afterEach(() => {
    // 先卸載元件再重置全域 store / 還原 matchMedia：resetToastStore 會同步通知訂閱者，
    // 若元件仍掛載，重新 render 時可能非同步讀到已被 unstubAllGlobals 移除的 matchMedia。
    cleanup()
    __resetToastStoreForTests()
    vi.unstubAllGlobals()
  })

  it('沒有 toast 時不渲染任何通知', () => {
    render(<Toaster />)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('useToast().success 推送後，Toaster 顯示訊息', () => {
    render(<Toaster />)
    const { result } = renderHook(() => useToast())
    act(() => {
      result.current.success('儲存成功')
    })
    expect(screen.getByRole('status')).toHaveTextContent('儲存成功')
  })

  it('點擊關閉按鈕移除該筆通知', () => {
    render(<Toaster />)
    const { result } = renderHook(() => useToast())
    act(() => {
      result.current.info('可關閉的通知')
    })
    expect(screen.getByRole('status')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '關閉通知' }))
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('可同時顯示多筆不同 variant 的通知', () => {
    render(<Toaster />)
    const { result } = renderHook(() => useToast())
    act(() => {
      result.current.success('成功訊息')
      result.current.error('錯誤訊息')
    })
    const statuses = screen.getAllByRole('status')
    expect(statuses).toHaveLength(2)
  })
})
