'use client'

import { useId, useState, type ReactNode } from 'react'

export interface ColorSwatchPickerProps {
  value: string
  onChange: (color: string) => void
  disabled?: boolean
}

const HEX_COLOR_PATTERN = /^#[0-9A-Fa-f]{6}$/

/** design-spec §2.3 圖表 categorical 固定順序 8 色（不含「其他」灰，該色為系統保留，不開放使用者選用）。 */
export const CHART_SWATCH_COLORS: readonly string[] = [
  '#8B6ED6',
  '#E8834B',
  '#2FA98A',
  '#D9A428',
  '#3E8FD0',
  '#D65FA0',
  '#8AAE3C',
  '#5A4FA0',
]

function isSameColor(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase()
}

/**
 * 色票選擇器（`→ FE-048` 共用元件）：design-spec §2.3 圖表 8 色固定色票 + 自訂 hex 輸入，
 * 供分類（§8）/ 帳戶（§9.6）表單共用。受控元件（`value`/`onChange`），不自行呼叫 API；
 * 自訂 hex 格式錯誤（非 `^#[0-9A-Fa-f]{6}$`）時送出按鈕 disabled，**禁**觸發 onChange。
 */
export function ColorSwatchPicker({ value, onChange, disabled = false }: ColorSwatchPickerProps): ReactNode {
  // 依 React 文件建議的「render 期間依 prop 變化調整 state」寫法（非 useEffect），
  // 讓自訂 hex 欄位在外部（如點色票）改變 value 時同步顯示，同時滿足 React Compiler
  // 對 effect 內同步 setState 的限制（→ FE-006/FE-007）。
  const [syncedValue, setSyncedValue] = useState(value)
  const [customHex, setCustomHex] = useState(value)
  if (value !== syncedValue) {
    setSyncedValue(value)
    setCustomHex(value)
  }
  const inputId = useId()

  const isCustomHexValid = HEX_COLOR_PATTERN.test(customHex)

  function handleApplyCustomHex(): void {
    if (!isCustomHexValid) return
    onChange(customHex)
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2" role="group" aria-label="固定色票">
        {CHART_SWATCH_COLORS.map((hex) => (
          <button
            key={hex}
            type="button"
            disabled={disabled}
            aria-label={`選擇顏色 ${hex}`}
            aria-pressed={isSameColor(value, hex)}
            onClick={() => onChange(hex)}
            className={`h-8 w-8 rounded-full border-2 transition-shadow disabled:opacity-50 ${
              isSameColor(value, hex) ? 'border-primary-600 shadow-float' : 'border-transparent'
            }`}
            style={{ backgroundColor: hex }}
          />
        ))}
      </div>
      <div className="flex items-center gap-2">
        <label htmlFor={inputId} className="text-sm text-text-secondary">
          自訂 hex
        </label>
        <input
          id={inputId}
          type="text"
          value={customHex}
          disabled={disabled}
          placeholder="#8B6ED6"
          onChange={(event) => setCustomHex(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              handleApplyCustomHex()
            }
          }}
          className="min-h-[44px] w-32 rounded-md border border-border px-2 text-text-primary md:min-h-8"
        />
        <button
          type="button"
          disabled={disabled || !isCustomHexValid}
          onClick={handleApplyCustomHex}
          className="min-h-[44px] rounded-md bg-primary-600 px-3 text-text-inverse disabled:opacity-50 md:min-h-8"
        >
          套用
        </button>
      </div>
      {customHex.length > 0 && !isCustomHexValid && (
        <p className="text-sm text-danger-500">格式需為 #RRGGBB（例如 #8B6ED6）</p>
      )}
    </div>
  )
}
