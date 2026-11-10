'use client'

import type { ReactNode } from 'react'
import { ACCENT_THEMES, useAccentPreference } from '@/hooks/useAccentPreference'

/** 主題色選擇（design-spec §2.7.1）：色塊 + 名稱並列，不單靠顏色識別。 */
export function AccentThemePicker(): ReactNode {
  const { accent, setAccent } = useAccentPreference()

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="group" aria-label="主題色">
      {ACCENT_THEMES.map((theme) => {
        const selected = theme.id === accent
        return (
          <button
            key={theme.id}
            type="button"
            aria-pressed={selected}
            onClick={() => setAccent(theme.id)}
            className={`flex min-h-11 items-center gap-2 rounded-md border-2 px-3 text-sm text-text-primary transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600 ${
              selected ? 'border-primary-600 bg-primary-100' : 'border-border bg-surface hover:bg-surface-sunken'
            }`}
          >
            <span aria-hidden className="h-4 w-4 shrink-0 rounded-full" style={{ backgroundColor: theme.swatch }} />
            {theme.label}
          </button>
        )
      })}
    </div>
  )
}
