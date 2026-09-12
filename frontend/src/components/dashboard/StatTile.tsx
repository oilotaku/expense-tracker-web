'use client'

import type { ReactNode } from 'react'
import { cva } from 'class-variance-authority'
import { CurvedCard } from '@/components/common/CurvedCard'

export type StatTileTone = 'income' | 'expense' | 'neutral' | 'warning'

/**
 * 金額顯示格式化（design-spec §9.2 wireframe 的 `NT$45,000` / `+NT$17,000` 寫法）。
 *
 * 後端 Decimal 一律以字串傳遞（DB-038），這裡的 `Number()` **只**用於顯示層的千分位與正負號，
 * 不回寫任何請求；無法解析時原樣輸出，避免出現 `NaN`。
 *
 * FE-044（≥2 處使用即抽共用檔）在此已成立（`StatTile` / `NetWorthCard` / `dashboard/page.tsx`
 * 三處共用），但 `utils/` 不在 task-016 的 affected_files 內、不可新增檔案，故暫置於本檔並具名
 * export（同 TransactionFormDialog.tsx 就地實作 datetime 轉換的既有慣例）；`utils/format.ts`
 * 落地後應整批搬過去。
 */
export function formatAmount(value: string, signed = false): string {
  const amount = Number(value)
  if (!Number.isFinite(amount)) return value
  const absolute = Math.abs(amount).toLocaleString('zh-Hant-TW', { maximumFractionDigits: 0 })
  const sign = amount < 0 ? '-' : signed && amount > 0 ? '+' : ''
  return `${sign}NT$${absolute}`
}

// FE-052：條件樣式禁 inline 三元串接。tone 的 `muted` 是 `unavailable` 專用的內部值（→ A7 的
// 灰階狀態），不對外開放為 `StatTileTone`，避免呼叫端拿它當一般語意色用。
// whitespace-nowrap：瀏覽器預設會把 ASCII 連字號（負號）視為可斷行點，窄卡片下「-NT$48,213」
// 可能斷成「-」單獨一行、「NT$48,213」另一行（結餘卡負值 + hero 大字級最容易踩到）。
const statValueClassName = cva('font-semibold tabular-nums whitespace-nowrap', {
  variants: {
    tone: {
      income: 'text-income-700',
      expense: 'text-expense-700',
      neutral: 'text-text-primary',
      warning: 'text-warning-600',
      muted: 'text-text-muted',
    },
    hero: {
      // design-spec §2.5：Dashboard Hero 數字 mobile `text-3xl` / desktop `text-4xl`。
      // 放大綁 `lg` 而非 `md`：`md`–`lg` 之間（平板直向）<Sidebar> 已佔 240px，
      // 卡片寬度不足以容納放大後的金額，會被截斷（→ dashboard/page.tsx 期間彙總同一組修正）。
      true: 'text-3xl lg:text-4xl',
      false: 'text-2xl lg:text-3xl',
    },
  },
  defaultVariants: { tone: 'neutral', hero: false },
})

const statCardClassName = cva('flex flex-col justify-center gap-1', {
  variants: {
    unavailable: { true: 'bg-surface-sunken', false: '' },
  },
  defaultVariants: { unavailable: false },
})

export interface StatTileProps {
  label: string
  /** 後端 Decimal 字串（如 `"45000.00"`）；`unavailable` 時不需提供。 */
  value?: string
  tone?: StatTileTone
  /** 正值加正號（結餘卡），負值一律顯示負號。 */
  signed?: boolean
  /** Hero 卡（行動端結餘）：字級拉大（design-spec §9.2 RWD 對應 / §2.5）。 */
  hero?: boolean
  /**
   * 灰階不可用狀態：期間 = 年 / 自訂範圍時的「預算結餘」卡（`→ A7`），只顯示 `hint` 文字、
   * 不做不精確的估算數字。
   */
  unavailable?: boolean
  hint?: string
  /** 由父層 grid 決定卡片跨欄與排序（`→ FE-064` 容器寬度由父決定）。 */
  className?: string
}

/**
 * Dashboard 期間彙總卡片（design-spec §9.2）：收入 / 支出 / 結餘 / 預算結餘共用同一顆元件，
 * 語意色由 `tone` 決定。底座走既有 `<CurvedCard>`（task-009），本元件只管內容與字級。
 */
export function StatTile({
  label,
  value,
  tone = 'neutral',
  signed = false,
  hero = false,
  unavailable = false,
  hint,
  className,
}: StatTileProps): ReactNode {
  return (
    <CurvedCard padding="sm" className={`${statCardClassName({ unavailable })} ${className ?? ''}`}>
      <p className="text-sm text-text-secondary md:text-base">{label}</p>
      {unavailable ? (
        <p className={statValueClassName({ tone: 'muted', hero: false })}>—</p>
      ) : (
        <p className={statValueClassName({ tone, hero })}>{formatAmount(value ?? '0', signed)}</p>
      )}
      {hint !== undefined && hint.length > 0 && <p className="text-xs text-text-muted">{hint}</p>}
    </CurvedCard>
  )
}
