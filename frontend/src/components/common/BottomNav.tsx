'use client'

import { useState, type ReactNode } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Dialog } from './Dialog'
import { ThemeToggle } from './ThemeToggle'
import type { NavItem } from './Sidebar'

export interface BottomNavProps {
  /** 5 格中扣除中央 FAB 與「更多」後的 3 個路由項（首頁/交易/預算），依序渲染在 FAB 左 2 右 1。 */
  items: NavItem[]
  /** 「更多」`<Dialog>` 內列出的路由項（週期性/資產/分類/帳戶/設定）。 */
  moreItems: NavItem[]
  onAddClick: () => void
  onLogout: () => void
}

function PlusIcon(): ReactNode {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      className="h-6 w-6"
      aria-hidden="true"
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}

function MoreIcon(): ReactNode {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5" aria-hidden="true">
      <circle cx="5" cy="12" r="1.6" />
      <circle cx="12" cy="12" r="1.6" />
      <circle cx="19" cy="12" r="1.6" />
    </svg>
  )
}

interface TabLinkProps {
  item: NavItem
  active: boolean
}

function TabLink({ item, active }: TabLinkProps): ReactNode {
  return (
    <Link
      href={item.href}
      aria-current={active ? 'page' : undefined}
      className={`flex min-h-[44px] min-w-[44px] flex-1 flex-col items-center justify-center gap-0.5 text-xs ${
        active ? 'text-primary-700' : 'text-text-secondary'
      }`}
    >
      <span aria-hidden="true">{item.icon}</span>
      {item.label}
    </Link>
  )
}

/**
 * 行動端底部固定導覽（design-spec §3.1：5 格 `min-h-[64px]`，中間為突出 FAB，`md:hidden`
 * 只在 `< md` 顯示，`→ FE-063`）。「更多」不開新路由，改開 `<Dialog>` 列出次要導覽項 +
 * 外觀切換 + 登出，三處共用同一顆 `<ThemeToggle>`（`→ §2.7`）。
 */
export function BottomNav({ items, moreItems, onAddClick, onLogout }: BottomNavProps): ReactNode {
  const pathname = usePathname()
  const [moreOpen, setMoreOpen] = useState(false)
  const leftItems = items.slice(0, 2)
  const rightItems = items.slice(2)

  return (
    <>
      <nav
        className="fixed inset-x-0 bottom-0 z-30 flex h-16 items-stretch border-t border-border bg-surface md:hidden"
        aria-label="行動導覽"
      >
        {leftItems.map((item) => (
          <TabLink key={item.key} item={item} active={pathname === item.href} />
        ))}
        <div className="flex flex-1 items-center justify-center">
          <button
            type="button"
            onClick={onAddClick}
            aria-label="新增交易"
            className="flex h-12 w-12 -translate-y-3 items-center justify-center rounded-full bg-primary-600 text-text-inverse shadow-float"
          >
            <PlusIcon />
          </button>
        </div>
        {rightItems.map((item) => (
          <TabLink key={item.key} item={item} active={pathname === item.href} />
        ))}
        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          aria-label="更多"
          className="flex min-h-[44px] min-w-[44px] flex-1 flex-col items-center justify-center gap-0.5 text-xs text-text-secondary"
        >
          <MoreIcon />
          更多
        </button>
      </nav>
      <Dialog open={moreOpen} onOpenChange={setMoreOpen} title="更多">
        <div className="flex flex-col gap-1">
          {moreItems.map((item) => (
            <Link
              key={item.key}
              href={item.href}
              onClick={() => setMoreOpen(false)}
              className="flex min-h-[44px] items-center gap-3 rounded-md px-3 text-text-secondary transition-colors hover:bg-surface-sunken hover:text-text-primary"
            >
              <span aria-hidden="true">{item.icon}</span>
              {item.label}
            </Link>
          ))}
          <div className="flex items-center justify-between rounded-md px-3 py-2">
            <span className="text-text-secondary">外觀</span>
            <ThemeToggle />
          </div>
          <button
            type="button"
            onClick={() => {
              setMoreOpen(false)
              onLogout()
            }}
            className="flex min-h-[44px] items-center gap-3 rounded-md px-3 text-left text-text-secondary transition-colors hover:bg-surface-sunken hover:text-danger-700"
          >
            登出
          </button>
        </div>
      </Dialog>
    </>
  )
}
