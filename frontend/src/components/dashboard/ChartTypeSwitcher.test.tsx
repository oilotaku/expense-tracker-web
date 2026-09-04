import type { ReactNode } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ChartTypeSwitcher, type ChartType } from './ChartTypeSwitcher'
import { CategoryPieChart, type CategorySlice } from './CategoryPieChart'

const STORAGE_KEY = 'chart-type-preference'

// motion/react 的過場動畫在 jsdom 不易斷言時序，這裡把 motion.div 換成純 div、用
// data-motion-* 屬性回報收到的 initial/transition，讓測試專注在我們自己傳的參數是否隨
// prefers-reduced-motion 正確切換，而非重新驗證 framer-motion 本身（同 Dialog.test.tsx 作法）。
vi.mock('motion/react', async () => {
  const React = await import('react')
  const MockMotionDiv = React.forwardRef<HTMLDivElement, Record<string, unknown>>((props, ref) => {
    const { initial, transition, animate, exit, ...rest } = props
    void animate
    void exit
    const transitionRecord = transition as { duration?: number } | undefined
    return (
      <div
        ref={ref}
        data-motion-initial={initial === false ? 'skip' : 'animate'}
        data-motion-duration={transitionRecord?.duration ?? 'unset'}
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

function renderChart(chartType: ChartType): ReactNode {
  return <div data-testid={`chart-${chartType}`}>{chartType}</div>
}

describe('ChartTypeSwitcher', () => {
  beforeEach(() => {
    window.localStorage.clear()
    stubReducedMotion(false)
  })

  afterEach(() => {
    window.localStorage.clear()
    vi.unstubAllGlobals()
  })

  it('預設選取圓餅圖分頁並渲染對應圖表（→ A11 預設圓餅圖）', () => {
    render(<ChartTypeSwitcher renderChart={renderChart} />)
    expect(screen.getByRole('tab', { name: /圓餅/ })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByTestId('chart-pie')).toBeInTheDocument()
  })

  it('點擊「長條」分頁切換選取狀態、渲染對應圖表，並呼叫 onChange', () => {
    const onChange = vi.fn()
    render(<ChartTypeSwitcher renderChart={renderChart} onChange={onChange} />)
    fireEvent.click(screen.getByRole('tab', { name: /長條/ }))
    expect(screen.getByRole('tab', { name: /長條/ })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByTestId('chart-bar')).toBeInTheDocument()
    expect(onChange).toHaveBeenCalledWith('bar')
  })

  it('切換寫回 localStorage（→ A11）', () => {
    render(<ChartTypeSwitcher renderChart={renderChart} />)
    fireEvent.click(screen.getByRole('tab', { name: /折線/ }))
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('line')
  })

  it('下次載入（重新掛載）讀回上次選擇', () => {
    const { unmount } = render(<ChartTypeSwitcher renderChart={renderChart} />)
    fireEvent.click(screen.getByRole('tab', { name: /長條/ }))
    unmount()

    render(<ChartTypeSwitcher renderChart={renderChart} />)
    expect(screen.getByRole('tab', { name: /長條/ })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByTestId('chart-bar')).toBeInTheDocument()
  })

  it('超過 6 類分類自動併為「其他」（透過 renderChart 整合 CategoryPieChart，→ §2.3 折疊規則）', () => {
    const manyCategories: CategorySlice[] = Array.from({ length: 8 }, (_, index) => ({
      id: `cat-${index}`,
      label: `分類${index}`,
      amount: (8 - index) * 100,
    }))
    render(<ChartTypeSwitcher renderChart={() => <CategoryPieChart data={manyCategories} />} />)
    expect(screen.getAllByRole('listitem')).toHaveLength(7)
    expect(screen.getByText('其他')).toBeInTheDocument()
  })

  it('prefers-reduced-motion 開啟時，圖表切換容器跳過動畫（initial=skip, duration=0）', () => {
    stubReducedMotion(true)
    render(<ChartTypeSwitcher renderChart={renderChart} />)
    const chartWrapper = screen.getByTestId('chart-pie').parentElement
    expect(chartWrapper).toHaveAttribute('data-motion-initial', 'skip')
    expect(chartWrapper).toHaveAttribute('data-motion-duration', '0')
  })

  it('prefers-reduced-motion 關閉時，圖表切換容器使用 150–200ms 交叉淡入淡出', () => {
    stubReducedMotion(false)
    render(<ChartTypeSwitcher renderChart={renderChart} />)
    const chartWrapper = screen.getByTestId('chart-pie').parentElement
    expect(chartWrapper).toHaveAttribute('data-motion-initial', 'animate')
    expect(chartWrapper).toHaveAttribute('data-motion-duration', '0.18')
  })
})
