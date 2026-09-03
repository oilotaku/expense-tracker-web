'use client'

// root layout 已失效、樣式未載入：允許 inline style 與硬編碼文字（FE-015）
import type { CSSProperties, ReactNode } from 'react'

interface GlobalErrorProps {
  error: Error & { digest?: string }
  reset: () => void
}

const BODY_STYLE: CSSProperties = { fontFamily: 'sans-serif', padding: 24, color: '#1f2937' }
const DIGEST_STYLE: CSSProperties = { color: '#6b7280' }
const BUTTON_STYLE: CSSProperties = { minHeight: 44, padding: '0 16px' }

export default function GlobalError({ error, reset }: GlobalErrorProps): ReactNode {
  return (
    <html lang="zh-TW">
      <body style={BODY_STYLE}>
        <h1>發生錯誤</h1>
        {error.digest && <p style={DIGEST_STYLE}>代碼：{error.digest}</p>}
        <button type="button" onClick={reset} style={BUTTON_STYLE}>
          重試
        </button>
      </body>
    </html>
  )
}
