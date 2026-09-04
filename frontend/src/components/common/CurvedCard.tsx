'use client'

import type { KeyboardEvent, ReactNode } from 'react'

export interface CurvedCardProps {
  children: ReactNode
  padding?: 'none' | 'sm' | 'md'
  interactive?: boolean
  onClick?: () => void
  className?: string
}

const PADDING_CLASSES = { none: '', sm: 'p-4', md: 'p-5 md:p-6' } as const

// hover 抬升純用 Tailwind CSS（`transition` + `hover:` + `motion-reduce:`），不需要 JS 動畫庫：
// `motion-reduce:` 對應瀏覽器真實的 `@media (prefers-reduced-motion: reduce)`，天生比對每個
// 互動元件手動查 `useReducedMotion()` 再切換 inline transform 更省事，且與 FE-057「禁 JS 量測 /
// 條件做主版型」的 CSS-only 精神一致；退化態下位移歸零、陰影仍變化，滿足「不做位移只變色」。
const INTERACTIVE_CLASSES =
  'cursor-pointer transition-[transform,box-shadow] duration-150 ease-out hover:-translate-y-0.5 hover:shadow-float motion-reduce:hover:translate-y-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600'

/**
 * 基礎卡片（design-spec §4：`--radius-lg` + `--shadow-card`），其他卡片組件（`StatTile` /
 * `AccountCard` 等）的底座。`interactive` 時才附 hover 抬升與可選 `onClick`（含鍵盤 Enter/Space
 * 觸發，維持可存取性），非互動用途維持靜態卡片。
 */
export function CurvedCard({
  children,
  padding = 'md',
  interactive = false,
  onClick,
  className,
}: CurvedCardProps): ReactNode {
  const isActionable = interactive && onClick !== undefined

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (!isActionable) return
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    onClick?.()
  }

  return (
    <div
      className={`rounded-lg bg-surface shadow-card ${PADDING_CLASSES[padding]} ${
        interactive ? INTERACTIVE_CLASSES : ''
      } ${className ?? ''}`}
      onClick={isActionable ? onClick : undefined}
      onKeyDown={isActionable ? handleKeyDown : undefined}
      role={isActionable ? 'button' : undefined}
      tabIndex={isActionable ? 0 : undefined}
    >
      {children}
    </div>
  )
}
