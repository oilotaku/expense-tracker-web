'use client'

import type { ReactNode } from 'react'
import { ICON_DEFINITIONS } from '@/components/common/iconCatalog'
import { IconUploadFlow } from '@/components/icons/IconUploadFlow'
import { iconImageUrl, useListIconsQuery } from '@/lib/api/iconsApi'

export { ICON_KEYS } from '@/components/common/iconCatalog'

export interface IconPickerProps {
  value: string
  onChange: (icon: string) => void
  disabled?: boolean
  /** 顯示「我的圖示」區（自訂圖示選用 + 上傳），預設開；需要在 Redux Provider 底下 */
  allowCustom?: boolean
}

function optionClass(selected: boolean): string {
  return `flex h-11 w-11 items-center justify-center rounded-md border transition-colors disabled:opacity-50 ${
    selected ? 'border-primary-600 bg-primary-100' : 'border-border bg-surface'
  }`
}

/**
 * 自訂圖示只在這裡「選用」與上傳；刪除只在「我的圖示」頁做，避免選圖時誤刪（ADR-0006 §6）。
 */
function CustomIconSection({ value, onChange, disabled = false }: Omit<IconPickerProps, 'allowCustom'>): ReactNode {
  const { data, isLoading, isError } = useListIconsQuery()
  const quotaFull = data ? data.quota.used >= data.quota.limit : false

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm text-text-secondary">我的圖示</span>
      <div className="flex flex-wrap gap-2" role="group" aria-label="我的圖示">
        {isLoading ? <span className="text-sm text-text-secondary">載入中…</span> : null}
        {isError ? <span className="text-sm text-text-secondary">我的圖示載入失敗</span> : null}
        {data?.items.map((icon, index) => (
          <button
            key={icon.user_icon_uid}
            type="button"
            disabled={disabled}
            aria-label={`自訂圖示 ${index + 1}`}
            aria-pressed={value === icon.icon_key}
            onClick={() => onChange(icon.icon_key)}
            className={optionClass(value === icon.icon_key)}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- 需帶 cookie，由瀏覽器直接載入 */}
            <img src={iconImageUrl(icon.user_icon_uid)} alt="" loading="lazy" className="h-8 w-8 object-contain" />
          </button>
        ))}
        <IconUploadFlow
          variant="button"
          disabled={disabled || quotaFull}
          disabledReason={quotaFull ? `已達 ${data?.quota.limit ?? 0} 張上限，請到「我的圖示」刪除不用的圖示` : undefined}
          onUploaded={(icon) => onChange(icon.icon_key)}
        />
      </div>
    </div>
  )
}

/**
 * 圖示選擇器（`→ FE-048` 共用元件）：內建圖示集（inline SVG，非 emoji，清單在 iconCatalog）
 * + 使用者自訂圖示，供分類（§8）/ 帳戶（§9.6）表單共用。受控元件（`value`/`onChange`）。
 */
export function IconPicker({ value, onChange, disabled = false, allowCustom = true }: IconPickerProps): ReactNode {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2" role="group" aria-label="固定圖示集">
        {ICON_DEFINITIONS.map((icon) => (
          <button
            key={icon.key}
            type="button"
            disabled={disabled}
            aria-label={icon.label}
            aria-pressed={value === icon.key}
            onClick={() => onChange(icon.key)}
            className={optionClass(value === icon.key)}
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
      {allowCustom ? <CustomIconSection value={value} onChange={onChange} disabled={disabled} /> : null}
    </div>
  )
}
