'use client'

import { useRef, useState, type ReactNode } from 'react'
import { ColorSwatchPicker } from '@/components/common/ColorSwatchPicker'
import { IconPicker } from '@/components/common/IconPicker'
import type { CategoryResponse } from '@/lib/api/categoriesApi'

export interface CategoryChipProps {
  category: CategoryResponse
  onColorChange: (categoryUid: string, color: string) => void
  onIconChange: (categoryUid: string, icon: string) => void
  onRequestDelete: (category: CategoryResponse) => void
}

interface IconGlyphDefinition {
  label: string
  glyph: ReactNode
}

// design-spec §8/§12.4：分類的圖示選擇走 <IconPicker>（固定圖示集，唯一維護處）；本卡片只需要
// 依 icon key 畫出「單一」對應圖示（IconPicker 是整組選擇 grid，非單圖顯示元件）。task-019
// affected_files 未含 components/common/IconPicker.tsx，故此處複製同一份 glyph 定義而非新增
// export——drift 風險已知，未來 IconPicker.tsx 進入某 task scope 時應把 glyph map 抽成共用
// export 讓兩邊都改成 import（→ FE-050）。key 與 glyph 皆逐一比對 IconPicker.tsx 保持一致。
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

const LONG_PRESS_MS = 500

/**
 * 分類卡片（design-spec §8）：圖示 + 顏色徽章、名稱、刪除按鈕（桌機 hover 顯示 / 行動端長按顯示）。
 * 點擊卡片本體展開色票 / 圖示選擇器就地編輯（`→ PATCH /categories/{category_uid}` 即時呼叫，
 * 不需通過重新命名流程），實際 API 呼叫交由父層透過 onColorChange / onIconChange 處理
 * （本元件不自行呼叫 API，維持受控、方便測試）。
 */
export function CategoryChip({
  category,
  onColorChange,
  onIconChange,
  onRequestDelete,
}: CategoryChipProps): ReactNode {
  const [isEditing, setIsEditing] = useState(false)
  const [showDeleteOnTouch, setShowDeleteOnTouch] = useState(false)
  const pressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const icon = resolveIconGlyph(category.icon)

  function clearPressTimer(): void {
    if (pressTimerRef.current !== null) {
      clearTimeout(pressTimerRef.current)
      pressTimerRef.current = null
    }
  }

  function handleTouchStart(): void {
    clearPressTimer()
    pressTimerRef.current = setTimeout(() => {
      setShowDeleteOnTouch((current) => !current)
    }, LONG_PRESS_MS)
  }

  return (
    <div
      className="group relative flex flex-col gap-2 rounded-lg bg-surface p-3 shadow-card"
      onTouchStart={handleTouchStart}
      onTouchEnd={clearPressTimer}
      onTouchMove={clearPressTimer}
      onTouchCancel={clearPressTimer}
    >
      <button
        type="button"
        onClick={() => setIsEditing((current) => !current)}
        aria-expanded={isEditing}
        aria-label={`編輯 ${category.name}`}
        className="flex flex-col items-center gap-2 rounded-md py-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600"
      >
        <span
          className="flex h-11 w-11 items-center justify-center rounded-full"
          style={{ backgroundColor: category.color }}
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
        <span className="text-sm font-medium text-text-primary md:text-base">{category.name}</span>
      </button>
      <button
        type="button"
        onClick={() => onRequestDelete(category)}
        aria-label={`刪除 ${category.name}`}
        className={`absolute right-1 top-1 flex h-8 w-8 items-center justify-center rounded-full bg-danger-500 text-text-inverse transition-opacity md:h-6 md:w-6 md:opacity-0 md:group-hover:opacity-100 ${
          showDeleteOnTouch ? 'opacity-100' : 'opacity-0'
        }`}
      >
        <span aria-hidden="true">✕</span>
      </button>
      {isEditing && (
        <div className="flex flex-col gap-3 border-t border-border pt-3">
          <ColorSwatchPicker
            value={category.color}
            onChange={(color) => onColorChange(category.category_uid, color)}
          />
          <IconPicker value={category.icon} onChange={(nextIcon) => onIconChange(category.category_uid, nextIcon)} />
        </div>
      )}
    </div>
  )
}
