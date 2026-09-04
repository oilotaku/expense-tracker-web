import type { ReactNode } from 'react'
import { useState } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Dialog } from './Dialog'

// motion/react 的彈簧物理動畫在 jsdom 不易斷言時序，這裡把 motion.div 換成純 div、
// 用 data-motion-* 屬性回報收到的 initial/transition，讓測試專注在我們自己傳的參數
// 是否隨 prefers-reduced-motion 正確切換，而非重新驗證 framer-motion 本身。
vi.mock('motion/react', async () => {
  const React = await import('react')
  const MockMotionDiv = React.forwardRef<HTMLDivElement, Record<string, unknown>>((props, ref) => {
    const { initial, transition, animate, exit, ...rest } = props
    void animate
    void exit
    const transitionRecord = transition as { type?: string } | undefined
    return (
      <div
        ref={ref}
        data-motion-initial={initial === false ? 'skip' : 'animate'}
        data-motion-transition-type={transitionRecord?.type ?? 'tween'}
        {...rest}
      />
    )
  })
  MockMotionDiv.displayName = 'MockMotionDiv'
  return {
    AnimatePresence: ({ children }: { children: ReactNode }) => <>{children}</>,
    motion: { div: MockMotionDiv },
  }
})

interface MockMediaQueryList {
  matches: boolean
  media: string
  addEventListener: (type: 'change', listener: (event: MediaQueryListEvent) => void) => void
  removeEventListener: (type: 'change', listener: (event: MediaQueryListEvent) => void) => void
}

function stubReducedMotion(matches: boolean): void {
  const list: MockMediaQueryList = {
    matches,
    media: '(prefers-reduced-motion: reduce)',
    addEventListener: () => {},
    removeEventListener: () => {},
  }
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation(() => list),
  )
}

interface HarnessProps {
  onOpenChange: (open: boolean) => void
}

function Harness({ onOpenChange }: HarnessProps): ReactNode {
  const [open, setOpen] = useState(true)
  return (
    <>
      <button type="button">Outside</button>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next)
          onOpenChange(next)
        }}
        title="刪除交易"
        description="此操作無法復原"
      >
        <button type="button">A</button>
        <button type="button">B</button>
      </Dialog>
    </>
  )
}

describe('Dialog', () => {
  beforeEach(() => {
    stubReducedMotion(false)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('open 時渲染標題與內容', () => {
    render(<Dialog open onOpenChange={() => {}} title="標題文字">
      <p>內文</p>
    </Dialog>)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('標題文字')).toBeInTheDocument()
    expect(screen.getByText('內文')).toBeInTheDocument()
  })

  it('open 為 false 時不渲染 dialog', () => {
    render(<Dialog open={false} onOpenChange={() => {}} title="標題文字" />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('按 ESC 觸發 onOpenChange(false)', () => {
    const onOpenChange = vi.fn()
    render(<Dialog open onOpenChange={onOpenChange} title="標題文字" />)
    fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' })
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('開啟時 focus 進入 dialog 內，且 Tab 循環不跳到 dialog 外的元素', async () => {
    render(<Harness onOpenChange={() => {}} />)
    const dialog = screen.getByRole('dialog')

    await waitFor(() => {
      expect(dialog.contains(document.activeElement)).toBe(true)
    })

    for (let i = 0; i < 6; i += 1) {
      fireEvent.keyDown(document.activeElement ?? dialog, { key: 'Tab', code: 'Tab' })
    }
    expect(dialog.contains(document.activeElement)).toBe(true)
  })

  it('桌機置中 / 行動 BottomSheet 兩種 variant 用 CSS breakpoint 共存於同一個 class list', () => {
    render(<Dialog open onOpenChange={() => {}} title="標題文字" />)
    const panel = screen.getByRole('dialog')
    expect(panel.className).toContain('rounded-t-xl')
    expect(panel.className).toContain('md:rounded-xl')
    expect(panel.className).toContain('md:max-w-md')
  })

  it('prefers-reduced-motion 開啟時，面板與遮罩皆跳過進場動畫（initial=skip）', () => {
    stubReducedMotion(true)
    render(<Dialog open onOpenChange={() => {}} title="標題文字" />)
    const panel = screen.getByRole('dialog')
    expect(panel.getAttribute('data-motion-initial')).toBe('skip')
  })

  it('prefers-reduced-motion 關閉時，面板使用彈簧位移動畫（initial=animate, transition=spring）', () => {
    stubReducedMotion(false)
    render(<Dialog open onOpenChange={() => {}} title="標題文字" />)
    const panel = screen.getByRole('dialog')
    expect(panel.getAttribute('data-motion-initial')).toBe('animate')
    expect(panel.getAttribute('data-motion-transition-type')).toBe('spring')
  })
})
