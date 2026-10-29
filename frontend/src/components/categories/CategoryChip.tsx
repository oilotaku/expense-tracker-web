'use client'

import { useRef, useState, type ReactNode } from 'react'
import { ColorSwatchPicker } from '@/components/common/ColorSwatchPicker'
import { EntityIcon } from '@/components/common/EntityIcon'
import { IconPicker } from '@/components/common/IconPicker'
import type { CategoryResponse } from '@/lib/api/categoriesApi'

export interface CategoryChipProps {
  category: CategoryResponse
  /** 改色/改圖示的 API 呼叫還在進行中（父層依 categoryUid 精準對到「這一顆」，
   * 不是「全部」，→ app/categories/page.tsx savingCategoryUid）。用來即時停用/淡化
   * 色票/圖示選擇器，避免使用者誤以為點擊沒有反應而重複點擊。 */
  isSaving?: boolean
  onColorChange: (categoryUid: string, color: string) => void
  onIconChange: (categoryUid: string, icon: string) => void
  onRequestDelete: (category: CategoryResponse) => void
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
  isSaving = false,
  onColorChange,
  onIconChange,
  onRequestDelete,
}: CategoryChipProps): ReactNode {
  const [isEditing, setIsEditing] = useState(false)
  const [showDeleteOnTouch, setShowDeleteOnTouch] = useState(false)
  const pressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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
        <EntityIcon icon={category.icon} color={category.color} />
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
          {isSaving && <span className="text-xs text-text-muted">儲存中…</span>}
          <ColorSwatchPicker
            value={category.color}
            disabled={isSaving}
            onChange={(color) => onColorChange(category.category_uid, color)}
          />
          <IconPicker
            value={category.icon}
            disabled={isSaving}
            onChange={(nextIcon) => onIconChange(category.category_uid, nextIcon)}
          />
        </div>
      )}
    </div>
  )
}
