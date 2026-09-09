'use client'

import type { ReactNode } from 'react'
import { motion } from 'motion/react'
import { useReducedMotion } from '@/hooks/useReducedMotion'

const PAGE_TRANSITION = { duration: 0.22, ease: 'easeOut' } as const
const INSTANT_TRANSITION = { duration: 0 } as const

export interface TemplateProps {
  children: ReactNode
}

/**
 * App Router 的 `template.tsx`：每次路由切換都會重新掛載一個新的實例（不像 `layout.tsx`
 * 在同一份 layout 底下切換時維持掛載），天生適合掛一次性的進場動畫，讓「頁面切換」有淡入 +
 * 輕微上移的過場，取代目前的生硬切換（→ design-spec.md §6「互動回饋以曲線/彈性動畫呈現而非
 * 生硬切換」）。`prefers-reduced-motion` 時（`→ useReducedMotion`，同 Dialog.tsx 慣例）直接
 * 跳到最終狀態，不做位移/透明度動畫。
 */
export default function Template({ children }: TemplateProps): ReactNode {
  const reducedMotion = useReducedMotion()

  return (
    <motion.div
      initial={reducedMotion ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={reducedMotion ? INSTANT_TRANSITION : PAGE_TRANSITION}
    >
      {children}
    </motion.div>
  )
}
