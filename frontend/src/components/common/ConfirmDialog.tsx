'use client'

import type { ReactNode } from 'react'
import { Dialog } from './Dialog'

export interface ConfirmDialogProps {
  open: boolean
  title: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
  onConfirm: () => void
  onCancel: () => void
}

/**
 * 共用確認對話框（`→ FE-048`），沿用 `<Dialog>` 的 overlay / ESC / focus trap；
 * 取代原生 `confirm()`（`→ FE-049` 禁用）。ESC / 遮罩點擊 / Close 按鈕皆視同取消。
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = '確認',
  cancelLabel = '取消',
  destructive = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps): ReactNode {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onCancel()
      }}
      title={title}
      description={description}
    >
      <div className="flex justify-end gap-2 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="min-h-[44px] min-w-[44px] rounded-md border border-border px-4 text-text-secondary md:min-h-8"
        >
          {cancelLabel}
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className={`min-h-[44px] min-w-[44px] rounded-md px-4 text-text-inverse md:min-h-8 ${
            destructive ? 'bg-danger-500' : 'bg-primary-600'
          }`}
        >
          {confirmLabel}
        </button>
      </div>
    </Dialog>
  )
}
