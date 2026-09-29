'use client'

import { useEffect } from 'react'

// 註冊 public/sw.js。Service Worker 只在安全環境（HTTPS 或 localhost）可用，
// 用 http://<區網 IP>:3000 開啟時瀏覽器本來就不給註冊，這裡直接略過。
export function ServiceWorkerRegister(): null {
  useEffect(() => {
    if (!window.isSecureContext || !('serviceWorker' in navigator)) return
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // 註冊失敗只代表不能安裝 / 沒有離線頁，網站照常可用，不打擾使用者
    })
  }, [])
  return null
}
