'use client'

import type { ReactNode } from 'react'
import { BottomNav } from './BottomNav'
import { Sidebar, type NavItem } from './Sidebar'

export interface AppShellProps {
  children: ReactNode
  /** FAB／「＋新增交易」觸發（task-015 `<TransactionFormDialog>` 由呼叫端頁面提供），未傳入時為 no-op。 */
  onAddClick?: () => void
  /** 登出動作（呼叫端頁面提供實際 API 呼叫），未傳入時為 no-op。 */
  onLogout?: () => void
}

function noop(): void {}

function GlyphIcon({ children }: { children: ReactNode }): ReactNode {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

function DashboardIcon(): ReactNode {
  return (
    <GlyphIcon>
      <rect x="3" y="3" width="8" height="8" rx="1.5" />
      <rect x="13" y="3" width="8" height="5" rx="1.5" />
      <rect x="13" y="10" width="8" height="11" rx="1.5" />
      <rect x="3" y="13" width="8" height="8" rx="1.5" />
    </GlyphIcon>
  )
}

function TransactionsIcon(): ReactNode {
  return (
    <GlyphIcon>
      <path d="M4 7h13l-3-3" />
      <path d="M20 17H7l3 3" />
    </GlyphIcon>
  )
}

function RecurringIcon(): ReactNode {
  return (
    <GlyphIcon>
      <path d="M4 4v5h5" />
      <path d="M20 20v-5h-5" />
      <path d="M4.6 15A8 8 0 0 0 19 9" />
      <path d="M19.4 9A8 8 0 0 0 5 15" />
    </GlyphIcon>
  )
}

function BudgetsIcon(): ReactNode {
  return (
    <GlyphIcon>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3v9l6 3" />
    </GlyphIcon>
  )
}

function AssetsIcon(): ReactNode {
  return (
    <GlyphIcon>
      <path d="M4 19h16" />
      <path d="M7 19v-6" />
      <path d="M12 19V7" />
      <path d="M17 19v-10" />
    </GlyphIcon>
  )
}

function CategoriesIcon(): ReactNode {
  return (
    <GlyphIcon>
      <path d="M12 3l8 8-8 8-8-8 8-8z" />
      <circle cx="12" cy="11" r="1.4" />
    </GlyphIcon>
  )
}

function AccountsIcon(): ReactNode {
  return (
    <GlyphIcon>
      <rect x="3" y="6" width="18" height="12" rx="1.5" />
      <path d="M3 10h18" />
    </GlyphIcon>
  )
}

function SettingsIcon(): ReactNode {
  return (
    <GlyphIcon>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" />
    </GlyphIcon>
  )
}

// 一級導覽（design-spec §3.1：Dashboard/交易/週期性/預算/資產）— 桌機 Sidebar 用。
const PRIMARY_ITEMS: NavItem[] = [
  { key: 'dashboard', label: 'Dashboard', href: '/dashboard', icon: <DashboardIcon /> },
  { key: 'transactions', label: '交易', href: '/transactions', icon: <TransactionsIcon /> },
  { key: 'recurring', label: '週期性', href: '/recurring', icon: <RecurringIcon /> },
  { key: 'budgets', label: '預算', href: '/budgets', icon: <BudgetsIcon /> },
  { key: 'assets', label: '資產', href: '/assets', icon: <AssetsIcon /> },
]

// 二級導覽（分類/帳戶）— 桌機 Sidebar 用。
const SECONDARY_ITEMS: NavItem[] = [
  { key: 'categories', label: '分類', href: '/categories', icon: <CategoriesIcon /> },
  { key: 'accounts', label: '帳戶', href: '/accounts', icon: <AccountsIcon /> },
]

const SETTINGS_ITEM: NavItem = { key: 'settings', label: '設定', href: '/settings', icon: <SettingsIcon /> }

// 行動端 Bottom Nav 主要 3 格（首頁/交易/預算，FAB 固定插在交易與預算之間）。
const BOTTOM_NAV_ITEMS: NavItem[] = [
  { key: 'dashboard', label: '首頁', href: '/dashboard', icon: <DashboardIcon /> },
  { key: 'transactions', label: '交易', href: '/transactions', icon: <TransactionsIcon /> },
  { key: 'budgets', label: '預算', href: '/budgets', icon: <BudgetsIcon /> },
]

// 行動端「更多」選單內容（週期性/資產/分類/帳戶/設定，外觀切換與登出由 BottomNav 另外附加）。
const BOTTOM_NAV_MORE_ITEMS: NavItem[] = [
  { key: 'recurring', label: '週期性', href: '/recurring', icon: <RecurringIcon /> },
  { key: 'assets', label: '資產', href: '/assets', icon: <AssetsIcon /> },
  { key: 'categories', label: '分類', href: '/categories', icon: <CategoriesIcon /> },
  { key: 'accounts', label: '帳戶', href: '/accounts', icon: <AccountsIcon /> },
  SETTINGS_ITEM,
]

/**
 * 全站導覽外殼（design-spec §3.1/§3.2/§4）：包 `<Sidebar>`（桌機）+ `<BottomNav>`（行動端，
 * 含中央 FAB）；桌機/行動切換一律 CSS-only（`hidden md:flex` / `md:hidden`，`→ FE-063`），
 * **不**用 `useBreakpoint` 判斷（該 hook 保留給 task-018 等例外情境使用）。
 *
 * 頁面標題（`h1`）與各頁專屬控制項（如 Dashboard 期間選擇器）屬於 §3.2 RWD 對應表中「同一
 * `layout.tsx`」以外的頁面內容，由各頁面自行在 `children` 內渲染，本元件只負責持久導覽外殼
 * 與內容區域版面，不預設 Header 插槽（`→` design-spec §4 `<AppShell>` 唯一 prop 即
 * `children: ReactNode`）。
 */
export function AppShell({ children, onAddClick = noop, onLogout = noop }: AppShellProps): ReactNode {
  return (
    <div className="min-h-dvh bg-bg md:flex">
      <Sidebar
        primaryItems={PRIMARY_ITEMS}
        secondaryItems={SECONDARY_ITEMS}
        settingsItem={SETTINGS_ITEM}
        onLogout={onLogout}
      />
      <main className="min-h-dvh flex-1 pb-16 md:pb-0">{children}</main>
      <BottomNav
        items={BOTTOM_NAV_ITEMS}
        moreItems={BOTTOM_NAV_MORE_ITEMS}
        onAddClick={onAddClick}
        onLogout={onLogout}
      />
    </div>
  )
}
