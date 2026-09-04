'use client'

import type { ReactNode } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ThemeToggle } from './ThemeToggle'

export interface NavItem {
  key: string
  label: string
  href: string
  icon: ReactNode
}

export interface SidebarProps {
  primaryItems: NavItem[]
  secondaryItems: NavItem[]
  settingsItem: NavItem
  onLogout: () => void
}

interface NavLinkProps {
  item: NavItem
  active: boolean
}

function NavLink({ item, active }: NavLinkProps): ReactNode {
  return (
    <Link
      href={item.href}
      aria-current={active ? 'page' : undefined}
      className={`flex min-h-[44px] items-center gap-3 rounded-md px-3 text-sm transition-colors md:min-h-8 md:text-base ${
        active
          ? 'bg-primary-100 text-primary-700'
          : 'text-text-secondary hover:bg-surface-sunken hover:text-text-primary'
      }`}
    >
      <span aria-hidden="true">{item.icon}</span>
      {item.label}
    </Link>
  )
}

/**
 * 桌機固定 Sidebar（design-spec §3.1：寬 240px，`hidden md:flex` 只在 `md+` 顯示，
 * `→ FE-063` 全站切版一律 CSS-only，禁 JS 條件 render）。順序：Logo → 一級導覽（Dashboard/
 * 交易/週期性/預算/資產）→ 分隔線 → 二級導覽（分類/帳戶）→ 分隔線 → 外觀切換/設定/登出。
 */
export function Sidebar({ primaryItems, secondaryItems, settingsItem, onLogout }: SidebarProps): ReactNode {
  const pathname = usePathname()

  return (
    <aside className="hidden shrink-0 flex-col border-r border-border bg-surface md:flex md:w-60">
      <div className="px-4 py-5">
        <span className="text-lg font-semibold text-text-primary">記帳本</span>
      </div>
      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-3" aria-label="主導覽">
        {primaryItems.map((item) => (
          <NavLink key={item.key} item={item} active={pathname === item.href} />
        ))}
        <hr className="my-2 border-border" />
        {secondaryItems.map((item) => (
          <NavLink key={item.key} item={item} active={pathname === item.href} />
        ))}
      </nav>
      <div className="flex flex-col gap-1 border-t border-border px-3 py-3">
        <div className="flex items-center justify-between px-3 py-1">
          <span className="text-sm text-text-secondary">外觀</span>
          <ThemeToggle />
        </div>
        <NavLink item={settingsItem} active={pathname === settingsItem.href} />
        <button
          type="button"
          onClick={onLogout}
          className="flex min-h-[44px] items-center gap-3 rounded-md px-3 text-left text-sm text-text-secondary transition-colors hover:bg-surface-sunken hover:text-danger-700 md:min-h-8 md:text-base"
        >
          登出
        </button>
      </div>
    </aside>
  )
}
