// 記帳 PWA 的 Service Worker：只做「可安裝」與「沒網路時顯示離線頁」，不做離線記帳。
//
// 策略刻意保守，避免把帳務資料或登入狀態留在快取裡：
//   - /api/ 一律不經手（不攔截、不快取），資料永遠即時向後端要
//   - 頁面導覽：網路優先，失敗才回離線頁
//   - /_next/static/：檔名含雜湊、內容不變，快取優先（離線頁本身不依賴它們）
// 改快取內容時把 VERSION 加一，activate 會清掉舊版快取。
const VERSION = 'v1'
const CACHE = `expense-shell-${VERSION}`
const OFFLINE_URL = '/offline.html'
const PRECACHE = [OFFLINE_URL, '/icons/icon-192.png']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k.startsWith('expense-shell-') && k !== CACHE).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return

  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match(OFFLINE_URL)))
    return
  }

  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone()
              caches.open(CACHE).then((cache) => cache.put(request, copy))
            }
            return response
          }),
      ),
    )
  }
})
