import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppShell } from './AppShell'
import { Sidebar, type NavItem } from './Sidebar'
import { BottomNav } from './BottomNav'
import { ThemeToggle } from './ThemeToggle'
import { CurvedCard } from './CurvedCard'
import { WaveDivider } from './WaveDivider'

// task-009 的 affected_files 只列出這一個測試檔（AppShell.test.tsx），Sidebar / BottomNav /
// ThemeToggle / CurvedCard / WaveDivider 各自沒有獨立的 *.test.tsx 條目，故依 FE-053「共用元件
// 必附測試」把這幾個元件的測試合併在此檔，用各自的 describe block 區隔（而非只靠 AppShell
// 整合測試間接覆蓋，例如 CurvedCard 本身並未被 AppShell 組合進去）。

let pathname = '/dashboard'
vi.mock('next/navigation', () => ({
  usePathname: () => pathname,
}))

function stubMatchMedia(matches = false): void {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((media: string) => ({
      matches,
      media,
      addEventListener: () => {},
      removeEventListener: () => {},
    })),
  )
}

beforeEach(() => {
  pathname = '/dashboard'
  window.localStorage.clear()
  document.documentElement.removeAttribute('data-theme')
  stubMatchMedia(false)
})

afterEach(() => {
  vi.unstubAllGlobals()
  window.localStorage.clear()
  document.documentElement.removeAttribute('data-theme')
})

describe('AppShell', () => {
  it('render children，且同時渲染桌機 Sidebar 與行動端 BottomNav', () => {
    render(
      <AppShell>
        <p>頁面內容</p>
      </AppShell>,
    )
    expect(screen.getByText('頁面內容')).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: '主導覽' })).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: '行動導覽' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '新增交易' })).toBeInTheDocument()
  })

  it('點擊 FAB 觸發 onAddClick', () => {
    const onAddClick = vi.fn()
    render(<AppShell onAddClick={onAddClick}>內容</AppShell>)
    fireEvent.click(screen.getByRole('button', { name: '新增交易' }))
    expect(onAddClick).toHaveBeenCalledOnce()
  })

  it('點擊 Sidebar 登出觸發 onLogout', () => {
    const onLogout = vi.fn()
    render(<AppShell onLogout={onLogout}>內容</AppShell>)
    fireEvent.click(screen.getAllByRole('button', { name: '登出' })[0] as HTMLElement)
    expect(onLogout).toHaveBeenCalledOnce()
  })

  it('未傳入 onAddClick / onLogout 時仍可正常點擊（no-op，不拋錯）', () => {
    render(<AppShell>內容</AppShell>)
    expect(() => fireEvent.click(screen.getByRole('button', { name: '新增交易' }))).not.toThrow()
  })
})

describe('Sidebar', () => {
  const primaryItems: NavItem[] = [{ key: 'dashboard', label: 'Dashboard', href: '/dashboard', icon: <span>D</span> }]
  const secondaryItems: NavItem[] = [{ key: 'categories', label: '分類', href: '/categories', icon: <span>C</span> }]
  const settingsItem: NavItem = { key: 'settings', label: '設定', href: '/settings', icon: <span>S</span> }

  it('各導覽項可點擊（render 為可點擊連結，含當前頁面 aria-current）', () => {
    pathname = '/dashboard'
    render(
      <Sidebar
        primaryItems={primaryItems}
        secondaryItems={secondaryItems}
        settingsItem={settingsItem}
        onLogout={() => {}}
      />,
    )
    const dashboardLink = screen.getByRole('link', { name: /Dashboard/ })
    expect(dashboardLink).toHaveAttribute('href', '/dashboard')
    expect(dashboardLink).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: /分類/ })).toHaveAttribute('href', '/categories')
    expect(screen.getByRole('link', { name: /設定/ })).toHaveAttribute('href', '/settings')
  })

  it('非當前頁面的導覽項不帶 aria-current', () => {
    pathname = '/categories'
    render(
      <Sidebar
        primaryItems={primaryItems}
        secondaryItems={secondaryItems}
        settingsItem={settingsItem}
        onLogout={() => {}}
      />,
    )
    expect(screen.getByRole('link', { name: /Dashboard/ })).not.toHaveAttribute('aria-current')
    expect(screen.getByRole('link', { name: /分類/ })).toHaveAttribute('aria-current', 'page')
  })

  it('點擊登出按鈕觸發 onLogout', () => {
    const onLogout = vi.fn()
    render(
      <Sidebar
        primaryItems={primaryItems}
        secondaryItems={secondaryItems}
        settingsItem={settingsItem}
        onLogout={onLogout}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: '登出' }))
    expect(onLogout).toHaveBeenCalledOnce()
  })
})

describe('BottomNav', () => {
  const items: NavItem[] = [
    { key: 'dashboard', label: '首頁', href: '/dashboard', icon: <span>D</span> },
    { key: 'transactions', label: '交易', href: '/transactions', icon: <span>T</span> },
    { key: 'budgets', label: '預算', href: '/budgets', icon: <span>B</span> },
  ]
  const moreItems: NavItem[] = [{ key: 'recurring', label: '週期性', href: '/recurring', icon: <span>R</span> }]

  it('各導覽項可點擊，FAB 觸發 onAddClick', () => {
    pathname = '/dashboard'
    const onAddClick = vi.fn()
    render(<BottomNav items={items} moreItems={moreItems} onAddClick={onAddClick} onLogout={() => {}} />)
    expect(screen.getByRole('link', { name: /首頁/ })).toHaveAttribute('href', '/dashboard')
    expect(screen.getByRole('link', { name: /交易/ })).toHaveAttribute('href', '/transactions')
    expect(screen.getByRole('link', { name: /預算/ })).toHaveAttribute('href', '/budgets')
    fireEvent.click(screen.getByRole('button', { name: '新增交易' }))
    expect(onAddClick).toHaveBeenCalledOnce()
  })

  it('點擊「更多」開啟選單，列出 moreItems，並可點擊其中導覽項與登出', () => {
    const onLogout = vi.fn()
    render(<BottomNav items={items} moreItems={moreItems} onAddClick={() => {}} onLogout={onLogout} />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '更多' }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByRole('link', { name: /週期性/ })).toHaveAttribute('href', '/recurring')

    fireEvent.click(within(dialog).getByRole('button', { name: '登出' }))
    expect(onLogout).toHaveBeenCalledOnce()
  })

  it('「更多」選單內含 ThemeToggle（外觀切換入口）', () => {
    render(<BottomNav items={items} moreItems={moreItems} onAddClick={() => {}} onLogout={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: '更多' }))
    expect(screen.getByRole('button', { name: /外觀：/ })).toBeInTheDocument()
  })
})

describe('ThemeToggle', () => {
  it('預設（無 localStorage 值）顯示跟隨系統，三態依序循環', () => {
    render(<ThemeToggle />)
    const button = screen.getByRole('button', { name: /外觀：跟隨系統/ })

    fireEvent.click(button)
    expect(screen.getByRole('button', { name: /外觀：淺色模式/ })).toBeInTheDocument()
    expect(window.localStorage.getItem('theme-preference')).toBe('light')

    fireEvent.click(screen.getByRole('button', { name: /外觀：淺色模式/ }))
    expect(screen.getByRole('button', { name: /外觀：深色模式/ })).toBeInTheDocument()
    expect(window.localStorage.getItem('theme-preference')).toBe('dark')

    fireEvent.click(screen.getByRole('button', { name: /外觀：深色模式/ }))
    expect(screen.getByRole('button', { name: /外觀：跟隨系統/ })).toBeInTheDocument()
    expect(window.localStorage.getItem('theme-preference')).toBe('system')
  })

  it('已有 localStorage 值時從該值開始顯示', () => {
    window.localStorage.setItem('theme-preference', 'dark')
    render(<ThemeToggle />)
    expect(screen.getByRole('button', { name: /外觀：深色模式/ })).toBeInTheDocument()
  })
})

describe('CurvedCard', () => {
  it('預設 render：套用 --radius-lg / --shadow-card 對應的 utility class', () => {
    render(<CurvedCard>內容</CurvedCard>)
    const card = screen.getByText('內容')
    expect(card.className).toContain('rounded-lg')
    expect(card.className).toContain('shadow-card')
    expect(card.className).toContain('p-5')
  })

  it('interactive 且有 onClick 時可點擊，且鍵盤 Enter 也能觸發（互動 + a11y）', () => {
    const onClick = vi.fn()
    render(
      <CurvedCard interactive onClick={onClick}>
        卡片
      </CurvedCard>,
    )
    const card = screen.getByRole('button', { name: '卡片' })
    fireEvent.click(card)
    expect(onClick).toHaveBeenCalledTimes(1)
    fireEvent.keyDown(card, { key: 'Enter' })
    expect(onClick).toHaveBeenCalledTimes(2)
  })

  it('hover 抬升在 prefers-reduced-motion 時不做位移只變色：class 同時具備位移與 reduced-motion 歸零', () => {
    render(
      <CurvedCard interactive onClick={() => {}}>
        卡片
      </CurvedCard>,
    )
    const card = screen.getByRole('button', { name: '卡片' })
    expect(card.className).toContain('hover:-translate-y-0.5')
    expect(card.className).toContain('motion-reduce:hover:translate-y-0')
    expect(card.className).toContain('hover:shadow-float')
  })

  it('padding="none" 且非 interactive 時：無 padding class、無 role="button"', () => {
    render(<CurvedCard padding="none">簡單卡片</CurvedCard>)
    const card = screen.getByText('簡單卡片')
    expect(card.className).not.toContain('p-5')
    expect(card).not.toHaveAttribute('role', 'button')
    expect(card).not.toHaveAttribute('tabindex')
  })
})

describe('WaveDivider', () => {
  it('render 為 aria-hidden 的裝飾用 svg，且套用預設顏色', () => {
    const { container } = render(<WaveDivider />)
    const svg = container.querySelector('svg')
    expect(svg).toHaveAttribute('aria-hidden', 'true')
    const path = container.querySelector('path')
    expect(path).toHaveAttribute('fill', 'var(--color-primary-100)')
    expect(path?.getAttribute('d')?.length).toBeGreaterThan(0)
  })

  it('可自訂顏色', () => {
    const { container } = render(<WaveDivider color="#ff0000" />)
    expect(container.querySelector('path')).toHaveAttribute('fill', '#ff0000')
  })
})
