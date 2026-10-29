'use client'

import { useState, type ReactNode } from 'react'
import { customIconUid, resolveBuiltinIcon, FALLBACK_ICON } from '@/components/common/iconCatalog'
import { iconImageUrl } from '@/lib/api/iconsApi'

export interface EntityIconProps {
  /** 內建 key（`food`）或自訂圖示 `custom:<uid>` */
  icon: string
  /** 內建圖示的圓底色；自訂圖示不套底色（彩色插圖疊彩色底會很雜，→ ADR-0006 §7） */
  color: string
  /** 外框尺寸，預設 `md`（44px，帳戶卡片 / 分類標籤用） */
  size?: 'md' | 'lg'
  className?: string
}

const BOX: Record<NonNullable<EntityIconProps['size']>, string> = {
  md: 'h-11 w-11',
  lg: 'h-24 w-24',
}
const GLYPH: Record<NonNullable<EntityIconProps['size']>, string> = {
  md: 'h-5 w-5',
  lg: 'h-10 w-10',
}

function Glyph({ glyph, size }: { glyph: ReactNode; size: 'md' | 'lg' }): ReactNode {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`${GLYPH[size]} text-text-inverse`}
      aria-hidden="true"
    >
      {glyph}
    </svg>
  )
}

/**
 * 帳戶 / 分類圖示的唯一繪製元件（原本 AccountCard、CategoryChip 各自複製一份 glyph 表）。
 * 自訂圖示載入失敗（圖示已刪、離線沒快取）退回預設圓點，不讓卡片破圖。
 */
export function EntityIcon({ icon, color, size = 'md', className = '' }: EntityIconProps): ReactNode {
  const uid = customIconUid(icon)
  const [failedUid, setFailedUid] = useState<string | null>(null)

  if (uid !== null && failedUid !== uid) {
    return (
      <span className={`flex ${BOX[size]} shrink-0 items-center justify-center ${className}`}>
        {/* next/image 會經 Next 伺服器代抓圖片而不帶使用者 cookie，自訂圖示必須由瀏覽器直接載入 */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={iconImageUrl(uid)}
          alt=""
          loading="lazy"
          className="h-full w-full object-contain"
          onError={() => setFailedUid(uid)}
        />
      </span>
    )
  }

  const definition = uid !== null ? FALLBACK_ICON : resolveBuiltinIcon(icon)
  return (
    <span
      className={`flex ${BOX[size]} shrink-0 items-center justify-center rounded-full ${className}`}
      style={{ backgroundColor: color }}
    >
      <Glyph glyph={definition.glyph} size={size} />
    </span>
  )
}
