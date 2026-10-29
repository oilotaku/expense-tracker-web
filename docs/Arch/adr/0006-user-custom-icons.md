# ADR-0006: 使用者自訂圖示（上傳圖片）

- **狀態**：Proposed
- **日期**：2026-10-29
- **決策者**：本次 session（Claude Code），待人類複核

## 背景（Context）

帳戶與分類的圖示目前是固定清單：`accounts.icon` / `categories.icon` 存圖示 key（`String(50)`，
後端只驗非空與長度，→ design-spec §12.4），網頁端以 inline SVG 線條圖示繪製（對照表重複寫在
`IconPicker`、`AccountCard`、`CategoryChip` 三處），iOS 端以 SF Symbols 繪製（`IconCatalog`）。
兩端遇到不認得的 key 都退回預設圖示（網頁 `FALLBACK_ICON`、iOS `circle.fill`）。

使用者希望能自己上傳圖片當帳戶 / 分類圖示（起因：專案根目錄放了四張插圖 JPG：鈔票、銀行、
湯匙、叉子，白底、非正方形）。目前系統沒有任何檔案上傳與檔案儲存機制。

## 決策（Decision）

### 1. 儲存：PostgreSQL `BYTEA`，只存處理後的 PNG

新表 `user_icons`（業務表，帶 DB-002 全部標準欄位）：

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `uid` | `BIGINT` PK | DB 內部用（→ DB-013） |
| `user_icon_uid` | `UUID` unique + index | 對外識別碼（→ DB-015） |
| `user_uid` | `UUID` FK `users.user_uid` + index | 擁有者 |
| `image_png` | `BYTEA` | 處理後的 PNG，**不存原檔** |
| `content_sha256` | `CHAR(64)` | ETag 與同使用者去重 |
| `byte_size` | `INTEGER` | 配額統計 |
| `is_deleted` 等 | DB-002 | 軟刪除（→ DB-012） |

- 每張處理後上限 64 KB（256×256 PNG 實際約 5~30 KB）；每位使用者有效圖示上限 50 張。
- 圖片內容建立後**不可變**：換圖 = 新增一張新 uid，所以可以用長快取。
- 備份：現有每週 `pg_dump -Fc` 自動涵蓋，不需新增備份路徑。

### 2. 引用：沿用 `icon` 欄位，格式 `custom:<user_icon_uid>`

- `custom:` + UUID = 43 字元，`String(50)` 放得下，**`accounts` / `categories` 不改 schema**。
- 內建 key 不變。後端在建立 / 更新帳戶與分類時，若 `icon` 以 `custom:` 開頭，必須是本人、未刪除
  的圖示，否則 422。內建 key 維持只驗非空（不改 §12.4 的既有約定）。
- 舊版前端 / 舊版 iOS App 看到 `custom:` 會走既有退回邏輯顯示預設圖示，不會壞。

### 3. API

| 方法 | 路徑 | 行為 |
| --- | --- | --- |
| `POST` | `/api/v1/icons` | multipart 欄位 `file`，選填 `remove_white_background: bool`；回 `{user_icon_uid, icon_key, url}`，201 |
| `GET` | `/api/v1/icons` | 列出本人有效圖示（不含圖片內容），每張附 `usage_count` |
| `GET` | `/api/v1/icons/{user_icon_uid}` | 回 `image/png` |
| `DELETE` | `/api/v1/icons/{user_icon_uid}` | 軟刪除；仍在使用它的帳戶 / 分類改回預設圖示 `other`，回 `{reset_accounts, reset_categories}` |

- 全部要登入（既有 JWT cookie，`get_current_user`）。非本人的圖示一律回 **404**（不回 403，避免
  探測 uid 是否存在）。
- `GET` 圖片回應標頭：`Cache-Control: private, max-age=31536000, immutable`、`ETag`（sha256）、
  `X-Content-Type-Options: nosniff`、`Content-Security-Policy: default-src 'none'`、
  `Content-Disposition: inline`。
- 刪除時的引用處理：同一個 DB 交易內先把本人 `icon = 'custom:<uid>'` 的帳戶與分類改成 `other`
  （與欄位 `server_default` 相同），再把圖示 `is_deleted = TRUE`；兩步一起成功或一起回滾，不會留下
  指向已刪除圖示的引用。前端刪除前先提示「有 N 個帳戶 / 分類會改回預設圖示」（數字由
  `GET /api/v1/icons` 每張附帶的 `usage_count` 提供），回應的重設筆數用來刷新帳戶 / 分類快取。
- 上傳限流：Redis 每使用者每小時 20 次（→ CACHE 規則）。
- 新 endpoint 依 → BE / API docs 規則補 OpenAPI 說明與錯誤碼。

### 4. 上傳處理管線（後端，Pillow）

1. 原始大小上限 10 MB（先看 `Content-Length`，讀取時再以累計位元組數截斷），超過回 **413**。
2. 只以 Pillow 實際解碼判斷格式，接受 PNG / JPEG / WebP / GIF（取第一幀）；**不信任副檔名與
   `Content-Type`，不收 SVG**。HEIC 不在後端解（不加 `pillow-heif`），由用戶端縮圖時轉掉（見下方
   「尺寸過大」）。
3. 防解壓縮炸彈：設 `Image.MAX_IMAGE_PIXELS = 50_000_000`（涵蓋 48MP 手機原圖），超過回 422。
   JPEG 先 `Image.draft("RGB", (1024, 1024))` 讓解碼器直接以 1/2~1/8 比例解碼，24MP 照片解碼記憶體
   從約 100 MB 降到數 MB；其他格式解碼後立刻 `thumbnail((1024, 1024))` 再往下處理。
4. `ImageOps.exif_transpose` 轉正後丟棄全部 metadata（含 EXIF GPS）。
5. 轉 RGBA；`remove_white_background=true` 時從四角做容差 flood fill，把相連的近白色改透明
   （只動與邊緣相連的白色，圖中間的白色保留）。
6. 裁掉透明邊，等比縮放後置中貼到 256×256 透明畫布（細長圖如湯匙不會被拉伸）。
7. 重新編碼 PNG（`optimize=True`）；超過 64 KB（照片類 256×256 RGBA 常見 100 KB 以上）先
   `quantize(256)` 轉調色盤 PNG（保留透明，約小 3 倍），仍超過再降為 192 / 128 邊長；128 邊長調色盤
   PNG 理論上限約 17 KB，所以實務上不會因「處理後太大」而失敗。
8. 影像處理是 CPU 工作：以 `run_in_threadpool` 執行避免卡住事件迴圈，並以全域
   `asyncio.Semaphore(1)` 限制同時只處理一張（Pi 記憶體有限）。

#### 尺寸過大

- **用戶端先縮圖再上傳（主要防線）**：網頁以 `createImageBitmap` + `<canvas>` 把長邊縮到 1024 後
  輸出 PNG 上傳；iOS 以 `UIImage` 縮到 1024 後輸出 PNG。瀏覽器 / iOS 自己會解 HEIC，所以 iPhone
  照片在這一步就轉成 PNG，後端不必支援 HEIC。縮完通常 < 1 MB。
- **後端上限只是防守**：用戶端縮圖失敗（舊瀏覽器、直接打 API）時才會碰到 10 MB / 5,000 萬像素上限。
- **錯誤訊息要可行動**：413 回「圖片超過 10 MB，請先縮小」；像素超限回「圖片超過 5,000 萬像素」；
  格式不支援回「只接受 PNG、JPEG、WebP、GIF」。前端顯示訊息原文。

**對外永遠只提供重新編碼後的 PNG**，原檔不落地、不寫 log。

### 5. 網頁端

- 合併三份重複的圖示對照表為單一元件 `EntityIcon({icon, color, size})`：內建 key 照舊畫
  SVG + 彩色底；`custom:` 畫 `<img src="/api/v1/icons/<uid>" loading="lazy" alt="">`，
  **不加彩色底**（彩色插圖疊彩色圓底會很雜），載入失敗退回預設圖示。
- `IconPicker` 新增「我的圖示」區：上傳按鈕（含「去除白色背景」勾選與預覽）、已上傳清單、刪除。
- RTK Query：`icons` tag，上傳 / 刪除後 invalidate；刪除另外 invalidate `accounts`、`categories`（圖示可能被改回預設）。
- 圖片走同源 `/api/v1`（Next rewrites 轉後端），cookie 自然帶上，不需 CORS。
- Service Worker 維持「`/api/` 不攔截不快取」；離線時靠瀏覽器 HTTP 快取（immutable 長快取），
  沒快取到的顯示預設圖示。

### 6. iOS App（第二階段）

- `IconBadge` 遇到 `custom:` 改用自訂載入器：沿用 `APIClient` 的 `URLSession`（共用
  `HTTPCookieStorage.shared` 的登入 cookie），結果存 `Caches/` 以 uid 為檔名，因內容不可變永不
  重新驗證；失敗退回 `circle.fill`。
- 挑選器加 `PhotosPicker` → multipart 上傳。
- 依現有流程：push `ios-app` → GitHub Actions 編譯 → `ios-sideload sign` → 裝進 LiveContainer。

### 7. 新增相依

- 後端加 `Pillow`（arm64 / x86_64 皆有 wheel），版本鎖到 patch 並登錄版本表（→ CORE-022）。

## 威脅與對策

| 威脅 | 對策 |
| --- | --- |
| 上傳偽裝成圖片的 HTML / 腳本（polyglot、XSS） | 只回重新編碼的 PNG、`nosniff`、`default-src 'none'`、不收 SVG |
| 解壓縮炸彈、超大檔 | 用戶端先縮圖；後端 10 MB / 5,000 萬像素上限、JPEG draft 解碼、單張序列處理 |
| 讀取他人圖示（IDOR） | 擁有者檢查，非本人一律 404 |
| 灌爆儲存空間 | 每人 50 張 + 每小時 20 次上傳 |
| 照片 EXIF 洩漏位置 | 重新編碼時丟棄全部 metadata |
| Pillow 解碼器漏洞 | 版本鎖定、納入既有 `pip-audit`；處理在 request 內完成且有大小上限 |

## 拒絕方案（Rejected）

- **存檔案系統（compose volume）**：要新增 volume、權限與備份路徑（現有備份只涵蓋 DB dump），
  兩人規模下換來的效能沒有意義。
- **物件儲存（MinIO / S3）**：多一個服務與憑證，規模完全不需要。
- **把圖片 base64 塞進 `icon` 欄位或 JSON 回應**：超過 50 字元上限，且每次列帳戶 / 分類 / 交易都
  夾帶圖片，讀取路徑變肥（→ ADR-0004）。
- **接受 SVG 上傳**：SVG 可夾帶腳本，消毒成本與風險都高。
- **直接提供原檔**：無法保證內容安全，也會帶出 EXIF。
- **刪除時若仍被引用就拒絕（409）**：使用者得先逐一改掉帳戶 / 分類的圖示才能刪，操作繁瑣；改回預設圖示更直接（使用者決定）。
- **前端裁切後只送處理好的圖**：仍須後端重新編碼才能信任，前端裁切只能當使用者體驗加分，不能
  取代後端管線。

## 後果（Consequences）

- `accounts` / `categories` schema 與既有 API 回應格式不變；只新增 `user_icons` 表與一支 migration。
- 資料庫容量增加可忽略（50 張 × 2 人 × 約 20 KB ≈ 2 MB）。
- 前端三份圖示對照表合併為一處，之後新增內建圖示只改一個地方。
- 刪除自訂圖示會直接改掉使用者的帳戶 / 分類圖示（改回 `other`），不可自動還原；靠刪除前的提示讓使用者知情。
- 自訂圖示不吃使用者選的顏色；設計規範 §12.4 需補一句「自訂圖示不套底色」。
- iOS 未更新前，自訂圖示在 App 顯示預設圖示（功能不中斷）。

## 實作分期

1. **後端**：model + migration、Pillow 管線（含單元測試：各格式、EXIF、炸彈、透明化、比例）、
   四支 endpoint、`custom:` 引用驗證、限流、OpenAPI。
2. **網頁**：`EntityIcon` 合併、`IconPicker` 上傳區、RTK Query、vitest + msw 測試。
3. **iOS**：自訂載入器與快取、`PhotosPicker` 上傳。

前兩期合計估 2~3 天，第三期約 1 天（含一輪 Actions 編譯與實機驗證）。

## 參照

- design-spec §12.4（圖示清單由前端維護、後端只驗非空）
- ADR-0004（讀取路徑容量規劃）
- DB-002、DB-012、DB-013、DB-015、CORE-022
