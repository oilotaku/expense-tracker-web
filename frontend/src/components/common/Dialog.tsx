'use client'

import type { ReactNode } from 'react'
import * as RadixDialog from '@radix-ui/react-dialog'
import { AnimatePresence, motion } from 'motion/react'
import { useReducedMotion } from '@/hooks/useReducedMotion'

export interface DialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  children?: ReactNode
  className?: string
}

const OVERLAY_TRANSITION = { duration: 0.2, ease: 'easeOut' } as const
const PANEL_TRANSITION = { type: 'spring', damping: 30, stiffness: 300 } as const
const INSTANT_TRANSITION = { duration: 0 } as const

/**
 * 共用 Dialog/Modal（`→ FE-048`）：`@radix-ui/react-dialog` 提供 overlay / ESC / portal /
 * focus trap，桌機置中卡片與行動端 BottomSheet 為同一元件的兩種 CSS variant（`md:` breakpoint
 * 切換，`→ FE-063` 禁止用 JS 條件 render 做一般 RWD），視覺定位交給 flex 容器（`items-end` /
 * `md:items-center`），animation 只疊加 opacity/位移/縮放，避免與定位樣式互相覆寫。
 * `prefers-reduced-motion` 時（`→ useReducedMotion`）關閉進出場動畫，直接切換到最終狀態。
 */
export function Dialog({ open, onOpenChange, title, description, children, className }: DialogProps): ReactNode {
  const reducedMotion = useReducedMotion()

  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open && (
          <RadixDialog.Portal forceMount>
            <RadixDialog.Overlay asChild forceMount>
              <motion.div
                className="fixed inset-0 z-40 bg-black/40"
                initial={reducedMotion ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={reducedMotion ? undefined : { opacity: 0 }}
                transition={reducedMotion ? INSTANT_TRANSITION : OVERLAY_TRANSITION}
              />
            </RadixDialog.Overlay>
            <div className="fixed inset-0 z-50 flex flex-col items-stretch justify-end md:items-center md:justify-center md:p-4">
              <RadixDialog.Content asChild forceMount>
                <motion.div
                  className={`relative max-h-[90dvh] w-full overflow-y-auto rounded-t-xl bg-surface p-6 shadow-float md:max-w-md md:rounded-xl ${className ?? ''}`}
                  initial={reducedMotion ? false : { opacity: 0, y: '12%', scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={reducedMotion ? undefined : { opacity: 0, y: '12%', scale: 0.98 }}
                  transition={reducedMotion ? INSTANT_TRANSITION : PANEL_TRANSITION}
                >
                  <RadixDialog.Title className="text-lg font-semibold text-text-primary md:text-xl">
                    {title}
                  </RadixDialog.Title>
                  <RadixDialog.Description className={description ? 'mt-1 text-sm text-text-secondary' : 'sr-only'}>
                    {description ?? ''}
                  </RadixDialog.Description>
                  <div className="mt-4">{children}</div>
                  <RadixDialog.Close
                    aria-label="關閉"
                    className="absolute right-4 top-4 flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md text-text-secondary hover:text-text-primary md:min-h-8 md:min-w-8"
                  >
                    ×
                  </RadixDialog.Close>
                </motion.div>
              </RadixDialog.Content>
            </div>
          </RadixDialog.Portal>
        )}
      </AnimatePresence>
    </RadixDialog.Root>
  )
}
