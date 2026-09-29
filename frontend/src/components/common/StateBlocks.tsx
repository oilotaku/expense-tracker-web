import type { ReactNode } from 'react'

/**
 * 清單 / 區塊的三態共用元件（`→ FE-048`）。2026-09-29 介面評估：各頁載入只是一行「載入中…」
 * （版面會跳）、錯誤沒有重試、空狀態沒有下一步提示，而且每頁各寫一套。這裡統一：
 * - `LoadingState`：骨架列，高度接近實際內容，減少載入完成時的版面跳動；保留 sr-only「載入中…」
 *   給輔助技術與既有測試。
 * - `ErrorState`：`role="alert"` + 可選「重試」（呼叫端傳 RTK Query 的 `refetch`）。
 * - `EmptyState`：標題 + 一句下一步提示。
 */

interface LoadingStateProps {
  /** 骨架列數，依內容量調整（清單 3、單一數字 1）。 */
  rows?: number
  className?: string
}

export function LoadingState({ rows = 3, className }: LoadingStateProps): ReactNode {
  return (
    <div role="status" className={`flex flex-col gap-3 ${className ?? ''}`}>
      <span className="sr-only">載入中…</span>
      {Array.from({ length: rows }, (_, index) => (
        <div
          key={index}
          aria-hidden="true"
          className="h-11 animate-pulse rounded-md bg-surface-sunken motion-reduce:animate-none"
          style={{ width: index % 3 === 2 ? '70%' : '100%' }}
        />
      ))}
    </div>
  )
}

interface ErrorStateProps {
  message: string
  onRetry?: () => void
  className?: string
}

export function ErrorState({ message, onRetry, className }: ErrorStateProps): ReactNode {
  return (
    <div
      role="alert"
      className={`flex flex-col gap-3 rounded-md border border-danger-500/40 bg-danger-500/5 p-4 text-sm text-danger-700 md:flex-row md:items-center md:justify-between ${className ?? ''}`}
    >
      <span>{message}</span>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="min-h-11 shrink-0 rounded-md border border-danger-500 px-4 font-medium text-danger-700 transition-colors hover:bg-danger-500/10 md:min-h-9"
        >
          重試
        </button>
      )}
    </div>
  )
}

interface EmptyStateProps {
  title: string
  /** 下一步提示，例如「用上方表單新增第一筆」。 */
  description?: string
  className?: string
}

export function EmptyState({ title, description, className }: EmptyStateProps): ReactNode {
  return (
    <div className={`rounded-md border border-dashed border-border px-4 py-6 text-center ${className ?? ''}`}>
      <p className="text-text-secondary">{title}</p>
      {description && <p className="mt-1 text-sm text-text-secondary/80">{description}</p>}
    </div>
  )
}
