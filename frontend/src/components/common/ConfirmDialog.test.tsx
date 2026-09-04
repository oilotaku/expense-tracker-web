import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ConfirmDialog } from './ConfirmDialog'

// ConfirmDialog 內部走 <Dialog>，會呼叫 useReducedMotion()，jsdom 預設沒有 matchMedia，
// 需手動 stub（同 Dialog.test.tsx / useReducedMotion.test.ts 的作法）。
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

describe('ConfirmDialog', () => {
  beforeEach(() => {
    stubMatchMedia()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('confirm 觸發 onConfirm', () => {
    const onConfirm = vi.fn()
    render(<ConfirmDialog open title="刪除？" onConfirm={onConfirm} onCancel={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: '確認' }))
    expect(onConfirm).toHaveBeenCalledOnce()
  })

  it('cancel 觸發 onCancel', () => {
    const onCancel = vi.fn()
    render(<ConfirmDialog open title="刪除？" onConfirm={() => {}} onCancel={onCancel} />)
    fireEvent.click(screen.getByRole('button', { name: '取消' }))
    expect(onCancel).toHaveBeenCalledOnce()
  })

  it('按 ESC 視同取消，觸發 onCancel', () => {
    const onCancel = vi.fn()
    render(<ConfirmDialog open title="刪除？" onConfirm={() => {}} onCancel={onCancel} />)
    fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' })
    expect(onCancel).toHaveBeenCalledOnce()
  })

  it('open 為 false 時不渲染', () => {
    render(<ConfirmDialog open={false} title="刪除？" onConfirm={() => {}} onCancel={() => {}} />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('可自訂 confirmLabel / cancelLabel 與 destructive 樣式', () => {
    render(
      <ConfirmDialog
        open
        title="刪除帳戶"
        description="刪除後無法復原"
        confirmLabel="刪除"
        cancelLabel="返回"
        destructive
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    )
    const confirmButton = screen.getByRole('button', { name: '刪除' })
    expect(confirmButton).toBeInTheDocument()
    expect(confirmButton.className).toContain('bg-danger-500')
    expect(screen.getByRole('button', { name: '返回' })).toBeInTheDocument()
    expect(screen.getByText('刪除後無法復原')).toBeInTheDocument()
  })
})
