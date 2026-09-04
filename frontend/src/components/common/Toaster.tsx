'use client'

import type { ReactNode } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import { useToast, type ToastVariant } from '@/hooks/useToast'

const VARIANT_CLASSNAME: Record<ToastVariant, string> = {
  success: 'bg-income-500 text-text-inverse',
  error: 'bg-danger-500 text-text-inverse',
  info: 'border border-border bg-surface text-text-primary',
}

const TOAST_TRANSITION = { type: 'spring', damping: 30, stiffness: 300 } as const
const INSTANT_TRANSITION = { duration: 0 } as const

/**
 * 全域通知容器（`→ FE-048`），掛在 root layout 一次即可，任何元件透過 `useToast()` 推送訊息。
 * mobile 置底、桌機（`md:`）改右上角，純 CSS breakpoint 切換（`→ FE-063`）。
 */
export function Toaster(): ReactNode {
  const { toasts, dismiss } = useToast()
  const reducedMotion = useReducedMotion()

  return (
    <div
      aria-live="polite"
      aria-atomic="false"
      className="pointer-events-none fixed inset-x-0 bottom-4 z-[100] flex flex-col items-center gap-2 px-4 md:inset-x-auto md:bottom-auto md:left-auto md:right-4 md:top-4 md:items-end"
    >
      <AnimatePresence initial={false}>
        {toasts.map((toast) => (
          <motion.div
            key={toast.id}
            role="status"
            className={`pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-md px-4 py-3 text-sm shadow-float md:text-base ${VARIANT_CLASSNAME[toast.variant]}`}
            initial={reducedMotion ? false : { opacity: 0, y: 16, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reducedMotion ? undefined : { opacity: 0, scale: 0.95 }}
            transition={reducedMotion ? INSTANT_TRANSITION : TOAST_TRANSITION}
          >
            <span className="flex-1">{toast.message}</span>
            <button
              type="button"
              aria-label="關閉通知"
              onClick={() => dismiss(toast.id)}
              className="flex min-h-[44px] min-w-[44px] items-center justify-center md:min-h-8 md:min-w-8"
            >
              ×
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}
