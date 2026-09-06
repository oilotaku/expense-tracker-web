'use client'

import { useState, type ReactNode } from 'react'
import { CurvedCard } from '@/components/common/CurvedCard'
import { ColorSwatchPicker } from '@/components/common/ColorSwatchPicker'
import { IconPicker } from '@/components/common/IconPicker'
import type { AccountResponse } from '@/lib/api/accountsApi'

export interface AccountCardProps {
  account: AccountResponse
  /** 只剩最後一個帳戶時刪除保護生效（`→ A4`），停用刪除按鈕並顯示提示文字。 */
  isOnlyAccount: boolean
  onNameChange: (accountUid: string, name: string) => void
  onColorChange: (accountUid: string, color: string) => void
  onIconChange: (accountUid: string, icon: string) => void
  onRequestDelete: (account: AccountResponse) => void
}

interface IconGlyphDefinition {
  label: string
  glyph: ReactNode
}

// design-spec §9.6/§12.4：帳戶圖示選擇走 <IconPicker>（固定圖示集，唯一維護處）；本卡片只需要
// 依 icon key 畫出「單一」對應圖示。task-020 affected_files 未含 components/common/IconPicker.tsx，
// 故此處複製同一份 glyph 定義而非新增 export（→ components/categories/CategoryChip.tsx 同註解、
// 同一份 drift 風險已知）；key 與 glyph 皆逐一比對 IconPicker.tsx 保持一致。
const ICON_GLYPHS: Record<string, IconGlyphDefinition> = {
  food: {
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
  transport: {
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
  entertainment: {
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
  shopping: {
    label: '購物',
    glyph: (
      <>
        <path d="M6 8h12l-1 12H7L6 8z" />
        <path d="M9 8V6a3 3 0 0 1 6 0v2" />
      </>
    ),
  },
  medical: {
    label: '醫療',
    glyph: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 8v8" />
        <path d="M8 12h8" />
      </>
    ),
  },
  home: {
    label: '居住',
    glyph: (
      <>
        <path d="M4 11l8-7 8 7" />
        <path d="M6 10v9h12v-9" />
      </>
    ),
  },
  subscription: {
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
  salary: {
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
  other: {
    label: '其他',
    glyph: (
      <>
        <path d="M4 4h7l9 9-7 7-9-9V4z" />
        <circle cx="8" cy="8" r="1.2" />
      </>
    ),
  },
  bank: {
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
  wallet: {
    label: '現金',
    glyph: (
      <>
        <path d="M4 7a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v1h1a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7z" />
        <path d="M16 12h3" />
      </>
    ),
  },
  creditCard: {
    label: '信用卡',
    glyph: (
      <>
        <rect x="3" y="6" width="18" height="12" rx="1.5" />
        <path d="M3 10h18" />
        <path d="M6 15h4" />
      </>
    ),
  },
  savings: {
    label: '儲蓄',
    glyph: (
      <>
        <path d="M5 12a6 6 0 0 1 6-6h3a5 5 0 0 1 5 5v1l2 1-2 1v1a2 2 0 0 1-2 2h-1v2H13v-2H9a4 4 0 0 1-4-4z" />
        <path d="M9 10v.01" />
      </>
    ),
  },
}

// 後端 icon 欄位不做 enum 檢查（→ A9），理論上可能收到不在固定集合內的舊資料或手動塞值；
// fallback 到通用圓點圖示，避免整卡片因找不到 glyph 而壞掉。
const FALLBACK_ICON: IconGlyphDefinition = {
  label: '未知圖示',
  glyph: <circle cx="12" cy="12" r="3" />,
}

function resolveIconGlyph(icon: string): IconGlyphDefinition {
  return ICON_GLYPHS[icon] ?? FALLBACK_ICON
}

/**
 * 帳戶卡片（design-spec §9.6）：色票色塊/圖示 + 帳戶名 + 餘額 + 改名/改色/改圖示/刪除。
 * 桌機橫向 grid、行動端直向堆疊由父層（`app/accounts/page.tsx`）的 grid class 控制，本卡片
 * 本身只負責單張卡片內容（`→ FE-064` 容器寬度由父決定）。點擊「編輯」展開名稱輸入框 +
 * 色票 / 圖示選擇器就地編輯，實際 API 呼叫交由父層透過 onNameChange / onColorChange /
 * onIconChange 處理（本元件不自行呼叫 API，維持受控、方便測試）。
 */
export function AccountCard({
  account,
  isOnlyAccount,
  onNameChange,
  onColorChange,
  onIconChange,
  onRequestDelete,
}: AccountCardProps): ReactNode {
  const [isEditing, setIsEditing] = useState(false)
  const [draftName, setDraftName] = useState(account.name)
  const icon = resolveIconGlyph(account.icon)

  function commitName(): void {
    const trimmed = draftName.trim()
    if (trimmed.length > 0 && trimmed !== account.name) {
      onNameChange(account.account_uid, trimmed)
    } else {
      setDraftName(account.name)
    }
  }

  function toggleEditing(): void {
    setDraftName(account.name)
    setIsEditing((current) => !current)
  }

  return (
    <CurvedCard>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
            style={{ backgroundColor: account.color }}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.8}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-5 w-5 text-text-inverse"
              aria-hidden="true"
            >
              {icon.glyph}
            </svg>
          </span>
          <div className="flex flex-col">
            <span className="text-base font-medium text-text-primary">{account.name}</span>
            <span className="text-sm text-text-secondary">
              {account.balance} {account.currency}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={toggleEditing}
            aria-expanded={isEditing}
            aria-label={`編輯 ${account.name}`}
            className="flex h-11 w-11 items-center justify-center rounded-md text-text-secondary hover:text-text-primary md:h-8 md:w-8 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600"
          >
            <span aria-hidden="true">✎</span>
          </button>
          <button
            type="button"
            disabled={isOnlyAccount}
            title={isOnlyAccount ? '至少需保留一個帳戶' : undefined}
            onClick={() => onRequestDelete(account)}
            aria-label={`刪除 ${account.name}`}
            className="flex h-11 w-11 items-center justify-center rounded-md text-danger-500 hover:text-danger-700 disabled:pointer-events-none disabled:opacity-40 md:h-8 md:w-8 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600"
          >
            <span aria-hidden="true">✕</span>
          </button>
        </div>
      </div>
      {isOnlyAccount && (
        <p className="mt-2 text-sm text-text-secondary">至少需保留一個帳戶</p>
      )}
      {isEditing && (
        <div className="mt-3 flex flex-col gap-3 border-t border-border pt-3">
          <label className="flex flex-col gap-1">
            <span className="text-sm text-text-secondary">名稱</span>
            <input
              type="text"
              maxLength={100}
              value={draftName}
              onChange={(event) => setDraftName(event.target.value)}
              onBlur={commitName}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  commitName()
                }
              }}
              className="min-h-11 rounded-md border border-border bg-surface px-3 text-text-primary"
            />
          </label>
          <div className="flex flex-col gap-2">
            <span className="text-sm text-text-secondary">顏色</span>
            <ColorSwatchPicker
              value={account.color}
              onChange={(color) => onColorChange(account.account_uid, color)}
            />
          </div>
          <div className="flex flex-col gap-2">
            <span className="text-sm text-text-secondary">圖示</span>
            <IconPicker
              value={account.icon}
              onChange={(nextIcon) => onIconChange(account.account_uid, nextIcon)}
            />
          </div>
        </div>
      )}
    </CurvedCard>
  )
}
