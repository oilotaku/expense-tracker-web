'use client'

import type { ReactNode } from 'react'
import { useThemePreference, type ThemePreference } from '@/hooks/useThemePreference'

export interface ThemeToggleProps {
  className?: string
}

const CYCLE: readonly ThemePreference[] = ['light', 'dark', 'system']

const LABELS: Record<ThemePreference, string> = {
  light: '淺色模式',
  dark: '深色模式',
  system: '跟隨系統',
}

function nextPreference(current: ThemePreference): ThemePreference {
  const index = CYCLE.indexOf(current)
  return CYCLE[(index + 1) % CYCLE.length] ?? 'system'
}

function ThemeIcon({ preference }: { preference: ThemePreference }): ReactNode {
  const shared = {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    className: 'h-5 w-5',
    'aria-hidden': true as const,
  }

  if (preference === 'light') {
    return (
      <svg {...shared}>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M2 12h2M20 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4" />
      </svg>
    )
  }
  if (preference === 'dark') {
    return (
      <svg {...shared}>
        <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />
      </svg>
    )
  }
  return (
    <svg {...shared}>
      <rect x="3" y="4" width="18" height="12" rx="1.5" />
      <path d="M8 20h8M12 16v4" />
    </svg>
  )
}

/**
 * 三態外觀切換（淺色/深色/跟隨系統，`→ design-spec.md §2.7`）：桌機 Sidebar 底部、行動端
 * 「更多」選單、`/settings` 頁三處共用同一顆元件（內用 `useThemePreference`，不重複實作切換
 * 邏輯），每次點擊依固定順序（light → dark → system → light）循環。
 */
export function ThemeToggle({ className }: ThemeToggleProps): ReactNode {
  const { preference, setPreference } = useThemePreference()

  return (
    <button
      type="button"
      onClick={() => setPreference(nextPreference(preference))}
      aria-label={`外觀：${LABELS[preference]}，點擊切換下一個外觀`}
      title={LABELS[preference]}
      className={`flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-surface-sunken hover:text-text-primary md:min-h-8 md:min-w-8 ${
        className ?? ''
      }`}
    >
      <ThemeIcon preference={preference} />
    </button>
  )
}
