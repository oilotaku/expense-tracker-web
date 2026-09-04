'use client'

import type { ReactNode } from 'react'

export interface IconPickerProps {
  value: string
  onChange: (icon: string) => void
  disabled?: boolean
}

interface IconDefinition {
  key: string
  label: string
  glyph: ReactNode
}

/**
 * 固定圖示集（design-spec §12.4：合法圖示清單由本檔唯一維護，後端只驗證非空字串，
 * **不**做 enum 檢查）。全部為 inline SVG line-icon，非 emoji（`→` 設計原則）。
 * 涵蓋分類管理頁（§8）預設種子分類與帳戶管理頁（§9.6）常見帳戶類型。
 */
const ICON_DEFINITIONS: readonly IconDefinition[] = [
  {
    key: 'food',
    label: '餐飲',
    glyph: (
      <>
        <path d="M6 3v7a2 2 0 0 0 4 0V3" />
        <path d="M8 10v11" />
        <path d="M17 3v18" />
        <path d="M14 3v7a3 3 0 0 0 3 3" />
      </>
    ),
  },
  {
    key: 'transport',
    label: '交通',
    glyph: (
      <>
        <path d="M4 16l1.5-5A2 2 0 0 1 7.4 9.5h9.2A2 2 0 0 1 18.5 11l1.5 5" />
        <path d="M3 16h18v3a1 1 0 0 1-1 1h-1a1 1 0 0 1-1-1v-1H6v1a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-3z" />
        <circle cx="7" cy="19" r="1.3" />
        <circle cx="17" cy="19" r="1.3" />
      </>
    ),
  },
  {
    key: 'entertainment',
    label: '娛樂',
    glyph: (
      <>
        <rect x="4" y="8" width="16" height="10" rx="3" />
        <circle cx="9" cy="13" r="1.4" />
        <circle cx="15" cy="13" r="1.4" />
        <path d="M9 5.5h6" />
      </>
    ),
  },
  {
    key: 'shopping',
    label: '購物',
    glyph: (
      <>
        <path d="M6 8h12l-1 12H7L6 8z" />
        <path d="M9 8V6a3 3 0 0 1 6 0v2" />
      </>
    ),
  },
  {
    key: 'medical',
    label: '醫療',
    glyph: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 8v8" />
        <path d="M8 12h8" />
      </>
    ),
  },
  {
    key: 'home',
    label: '居住',
    glyph: (
      <>
        <path d="M4 11l8-7 8 7" />
        <path d="M6 10v9h12v-9" />
      </>
    ),
  },
  {
    key: 'subscription',
    label: '訂閱',
    glyph: (
      <>
        <path d="M4 4v5h5" />
        <path d="M20 20v-5h-5" />
        <path d="M4.6 15A8 8 0 0 0 19 9" />
        <path d="M19.4 9A8 8 0 0 0 5 15" />
      </>
    ),
  },
  {
    key: 'salary',
    label: '薪資',
    glyph: (
      <>
        <rect x="3" y="7" width="18" height="10" rx="1.5" />
        <circle cx="12" cy="12" r="2.4" />
        <path d="M6 9v.01" />
        <path d="M18 15v.01" />
      </>
    ),
  },
  {
    key: 'other',
    label: '其他',
    glyph: (
      <>
        <path d="M4 4h7l9 9-7 7-9-9V4z" />
        <circle cx="8" cy="8" r="1.2" />
      </>
    ),
  },
  {
    key: 'bank',
    label: '銀行',
    glyph: (
      <>
        <path d="M3 10l9-6 9 6" />
        <path d="M4 21h16" />
        <path d="M5 21V10" />
        <path d="M19 21V10" />
        <path d="M9 21v-7" />
        <path d="M15 21v-7" />
      </>
    ),
  },
  {
    key: 'wallet',
    label: '現金',
    glyph: (
      <>
        <path d="M4 7a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v1h1a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7z" />
        <path d="M16 12h3" />
      </>
    ),
  },
  {
    key: 'creditCard',
    label: '信用卡',
    glyph: (
      <>
        <rect x="3" y="6" width="18" height="12" rx="1.5" />
        <path d="M3 10h18" />
        <path d="M6 15h4" />
      </>
    ),
  },
  {
    key: 'savings',
    label: '儲蓄',
    glyph: (
      <>
        <path d="M5 12a6 6 0 0 1 6-6h3a5 5 0 0 1 5 5v1l2 1-2 1v1a2 2 0 0 1-2 2h-1v2H13v-2H9a4 4 0 0 1-4-4z" />
        <path d="M9 10v.01" />
      </>
    ),
  },
]

export const ICON_KEYS: readonly string[] = ICON_DEFINITIONS.map((icon) => icon.key)

/**
 * 圖示選擇器（`→ FE-048` 共用元件）：固定圖示集（inline SVG，非 emoji），供分類（§8）/
 * 帳戶（§9.6）表單共用。受控元件（`value`/`onChange`），不自行呼叫 API。
 */
export function IconPicker({ value, onChange, disabled = false }: IconPickerProps): ReactNode {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="固定圖示集">
      {ICON_DEFINITIONS.map((icon) => (
        <button
          key={icon.key}
          type="button"
          disabled={disabled}
          aria-label={icon.label}
          aria-pressed={value === icon.key}
          onClick={() => onChange(icon.key)}
          className={`flex h-11 w-11 items-center justify-center rounded-md border transition-colors disabled:opacity-50 ${
            value === icon.key ? 'border-primary-600 bg-primary-100' : 'border-border bg-surface'
          }`}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-5 w-5 text-text-primary"
            aria-hidden="true"
          >
            {icon.glyph}
          </svg>
        </button>
      ))}
    </div>
  )
}
