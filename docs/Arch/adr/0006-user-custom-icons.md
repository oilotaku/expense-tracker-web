# ADR-0006: 使用者自訂圖示（上傳圖片）

- **狀態**：Proposed
- **日期**：2026-10-29
- **決策者**：本次 session（Claude Code）依使用者需求整理，待人類複核

## 背景（Context）

帳戶與分類的圖示目前是固定清單：`accounts.icon` / `categories.icon` 存圖示 key（`String(50)`，
後端只驗非空與長度，→ design-spec §12.4）。網頁端以 inline SVG 線條圖示繪製，對照表重複寫在
`IconPicker`、`AccountCard`、`CategoryChip` 三處；iOS 端以 SF Symbols 繪製（`IconCatalog`）。
兩端遇到不認得的 key 都退回預設圖示（網頁 `FALLBACK_ICON`、iOS `circle.fill`）。

使用者希望能自己上傳圖片當帳戶 / 分類圖示（起因：專案根目錄放了四張白底、非正方形的插圖 JPG：
鈔票、銀行、湯匙、叉子）。目前系統沒有任何檔案上傳與檔案儲存機制。

## 決策摘要

| 項目 | 決定 |
| --- | --- |
| 儲存 | PostgreSQL 新表 `user_icons`，`BYTEA` 只存處理後的 PNG，不存原檔 |
| 引用 | 沿用 `icon` 欄位，寫 `custom:<user_icon_uid>`；`accounts` / `categories` 不改 schema |
| 處理 | 用戶端先縮到長邊 1024；後端 Pillow 重新編碼成 256×256 透明 PNG |
| 預覽 | 後端產生預覽、不存檔；使用者按「使用這張」才儲存，結果與預覽位元組相同 |
| 入口 | 「更多 → 我的圖示」頁：上方上傳區、下方已上傳圖示；帳戶 / 分類的圖示挑選器可選用與上傳 |
| 刪除 | 軟刪除；仍在使用它的帳戶 / 分類自動改回預設圖示 `other` |
| 上限 | 原檔 10 MB / 5,000 萬像素（對齊 Next.js 轉發上限）；每人 50 張 |

## 使用者流程

1. 從「更多 → 我的圖示」（或帳戶 / 分類編輯畫面的「上傳新圖示」）選一張圖片。
2. 用戶端把圖縮到長邊 1024 並轉 PNG（iPhone HEIC 在這一步轉掉）。
3. 送後端預覽，畫面顯示最終圖示在帳戶卡片、分類標籤、淺 / 深色底上的樣子；可切換「去除白色背景」。
4. 按「使用這張」→ 同一份檔案與選項正式上傳 → 新圖示出現在清單最前面；按「重新選擇」或關閉則不存。
5. 在帳戶 / 分類的圖示挑選器「我的圖示」區選用。
6. 在「我的圖示」頁點圖示可看使用情況並刪除；使用中的帳戶 / 分類改回預設圖示。

## 決策（Decision）

### 1. 資料模型

新表 `user_icons`（業務表，帶 DB-002 全部標準欄位）：

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `uid` | `BIGINT` PK | DB 內部用（→ DB-013） |
| `user_icon_uid` | `UUID` unique + index | 對外識別碼（→ DB-015） |
| `user_uid` | `UUID` FK `users.user_uid` + index | 擁有者 |
| `image_png` | `BYTEA` | 處理後的 PNG，**不存原檔** |
| `content_sha256` | `CHAR(64)` | ETag 與同使用者去重 |
| `byte_size` | `INTEGER` | 處理後大小 |
| `is_deleted` 等 | DB-002 | 軟刪除（→ DB-012） |

- 圖片內容建立後**不可變**：換圖 = 新增一張新 uid，因此可用長快取。
- **去重**：同一使用者上傳處理後雜湊相同的圖，直接回既有那張（200），不新增、不佔配額。
- **配額**：每人有效圖示上限 50 張，處理後每張上限 64 KB（256×256 PNG 實際約 5~30 KB）。
- **備份**：現有每週 `pg_dump -Fc` 自動涵蓋，不需新增備份路徑。

**引用方式**：`icon` 欄位寫 `custom:<user_icon_uid>`（43 字元，`String(50)` 放得下）。後端建立 /
更新帳戶與分類時，`custom:` 開頭的值必須是本人、未刪除的圖示，否則 422；內建 key 維持只驗非空
（不改 §12.4 的既有約定）。舊版前端 / 舊版 iOS App 看到 `custom:` 會走既有退回邏輯顯示預設圖示。

### 2. API

| 方法 | 路徑 | 行為 |
| --- | --- | --- |
| `POST` | `/api/v1/icons/preview` | multipart `file` + 選填 `remove_white_background: bool`；跑完整處理管線但**不存檔**，回 `image/png`（`Cache-Control: no-store`） |
| `POST` | `/api/v1/icons` | 同上欄位；儲存並回 `{user_icon_uid, icon_key, url, content_sha256}`，新增 201、去重命中 200 |
| `GET` | `/api/v1/icons` | 本人有效圖示（不含圖片內容），每張附 `usage_count`、`created_at`，另回 `quota: {used, limit}` |
| `GET` | `/api/v1/icons/{user_icon_uid}` | 回 `image/png` |
| `GET` | `/api/v1/icons/{user_icon_uid}/usages` | 使用這張圖示的帳戶 / 分類：`{accounts: [{account_uid, name}], categories: [{category_uid, name}]}` |
| `DELETE` | `/api/v1/icons/{user_icon_uid}` | 軟刪除，引用者改回預設圖示，回 `{reset_accounts, reset_categories}` |

- **權限**：全部要登入（既有 JWT cookie，`get_current_user`）。非本人的圖示一律回 **404**（不回 403，
  避免探測 uid 是否存在）。
- **圖片回應標頭**：`Cache-Control: private, max-age=31536000, immutable`、`ETag`（sha256）、
  `X-Content-Type-Options: nosniff`、`Content-Security-Policy: default-src 'none'`、
  `Content-Disposition: inline`。
- **刪除**：同一個 DB 交易內先把本人 `icon = 'custom:<uid>'` 的帳戶與分類改成 `other`（與欄位
  `server_default` 相同），再把圖示 `is_deleted = TRUE`；兩步一起成功或一起回滾，不會留下指向已刪除
  圖示的引用。
- **錯誤碼**：

  | 情況 | 狀態碼 | 訊息 |
  | --- | --- | --- |
  | 原檔超過 10 MB | 413 | 圖片超過 10 MB，請先縮小 |
  | 超過 5,000 萬像素 | 422 | 圖片超過 5,000 萬像素 |
  | 格式不支援或無法解碼 | 422 | 只接受 PNG、JPEG、WebP、GIF |
  | 配額已滿 | 409 | 已達 50 張上限，請先刪除不用的圖示 |
  | 超過限流 | 429 | 上傳太頻繁，請稍後再試 |

  前端直接顯示訊息原文。
- **限流**（Redis，→ CACHE 規則）：正式上傳每使用者每小時 20 次；預覽另計每小時 60 次（切換選項會
  重新預覽）。
- 新 endpoint 依 API docs 規則補 OpenAPI 說明與錯誤碼。

### 3. 後端處理管線（Pillow）

預覽與正式上傳共用同一個函式：

1. 讀取原檔，上限 10 MB（先看 `Content-Length`，讀取時再以累計位元組數截斷），超過回 413。
2. 只以 Pillow 實際解碼判斷格式，接受 PNG / JPEG / WebP / GIF（取第一幀）；**不信任副檔名與
   `Content-Type`，不收 SVG**。HEIC 不在後端解（不加 `pillow-heif`），由用戶端轉掉。
3. 防解壓縮炸彈：`Image.MAX_IMAGE_PIXELS = 50_000_000`（涵蓋 48MP 手機原圖），超過回 422。
   JPEG 先 `Image.draft("RGB", (1024, 1024))` 讓解碼器直接以 1/2~1/8 比例解碼（24MP 照片解碼記憶體
   從約 100 MB 降到數 MB）；其他格式解碼後立刻 `thumbnail((1024, 1024))`。
4. `ImageOps.exif_transpose` 轉正後丟棄全部 metadata（含 EXIF GPS）。
5. 轉 RGBA；`remove_white_background=true` 時從四角做容差 flood fill，把與邊緣相連的近白色改透明
   （圖中間的白色保留）。
6. 裁掉透明邊，等比縮放後置中貼到 256×256 透明畫布（細長圖如湯匙不會被拉伸）。
7. 編碼 PNG（`optimize=True`）；超過 64 KB（照片類 256×256 RGBA 常見 100 KB 以上）先
   `quantize(256)` 轉調色盤 PNG（保留透明，約小 3 倍），仍超過再降為 192 / 128 邊長。128 邊長調色盤
   PNG 理論上限約 17 KB，實務上不會因處理後太大而失敗。
8. 以 `run_in_threadpool` 執行避免卡住事件迴圈，並以全域 `asyncio.Semaphore(1)` 限制同時只處理一張
   （Pi 記憶體有限）。

**對外永遠只提供重新編碼後的 PNG**，原檔不落地、不寫 log。管線是確定性的（同版本 Pillow、同輸入、
同參數 → 位元組相同的輸出），這是「預覽即實際結果」的前提。

### 4. 用戶端縮圖與 10 MB 上限

- **用戶端先縮圖再上傳（主要防線）**：網頁以 `createImageBitmap` + `<canvas>` 把長邊縮到 1024 後
  輸出 PNG；iOS 以 `UIImage` 縮到 1024 後輸出 PNG。瀏覽器 / iOS 自己會解 HEIC，iPhone 照片在這一步
  就轉成 PNG。縮完通常 < 1 MB。
- **後端上限只是防守**：用戶端縮圖失敗（舊瀏覽器、直接打 API）時才會碰到 10 MB / 5,000 萬像素上限。
- **為什麼是 10 MB**：網頁與 iOS 的請求都經 Next.js rewrites（`/api/v1/*` → backend）轉發。Next 16
  的 `experimental.proxyClientMaxBodySize` 預設 10 MB（10485760），超過時只轉前 10 MB 並在 log 警告，
  後端會收到被截斷的檔案而解碼失敗，使用者只看到難懂的格式錯誤。後端上限對齊這個值，讓超過的請求
  得到明確的 413。要放寬必須兩邊一起改（`next.config.ts` 的 `proxyClientMaxBodySize` + 後端上限），
  但用戶端縮圖後實際上傳 < 1 MB，沒有放寬的需要。

### 5. 確認前預覽

1. 選圖並縮圖後送 `POST /api/v1/icons/preview`，畫面顯示後端回來的處理結果。
2. 切換「去除白色背景」時重新預覽（防抖 300 ms），取消舊請求。
3. 按「使用這張」時把**同一份縮圖後的檔案與同一組選項**送 `POST /api/v1/icons`；回應的
   `content_sha256` 可與預覽圖雜湊比對確認一致。按「重新選擇」或關閉則什麼都不存。

預覽對話框呈現：
- 原圖縮圖與處理後圖示並排；
- 處理後圖示放進實際使用的樣式：帳戶卡片尺寸、分類標籤尺寸，淺色與深色底各一份（白底沒去乾淨、
  透明邊太大，在這裡就看得出來）；
- 「去除白色背景」開關、「使用這張」、「重新選擇」；失敗時顯示錯誤訊息原文。

### 6. 「我的圖示」頁

上傳與管理的主要入口，從「更多」進入：

| 平台 | 入口 | 實作 |
| --- | --- | --- |
| 網頁手機寬度 | 底部導覽「更多」選單（`BOTTOM_NAV_MORE_ITEMS`），插在「帳戶」與「設定」之間 | 路由 `/icons` |
| 網頁桌機 | 桌機沒有「更多」，加進側邊欄二級導覽（`SECONDARY_ITEMS`，「分類」、「帳戶」之後），否則桌機進不去 | 同上 |
| iOS | 「更多」分頁第一個 Section，「分類管理」之後，`Label("我的圖示", systemImage: "photo.on.rectangle")` | `IconsView` |

頁面版面（由上而下）：

1. **上傳區**：桌機為可拖放的虛線框（拖檔或點擊選檔），手機為「選擇圖片」按鈕（開相簿 / 檔案）。
   下方小字「支援 PNG、JPEG、WebP、GIF，會自動縮成 256×256」與配額「已使用 12 / 50」。選檔後進
   預覽對話框（§5），確認後新圖示出現在下方清單最前面。配額用完時上傳區停用並說明原因。
2. **已上傳圖示**：格狀排列，新的在前，每格顯示圖示與使用次數（「3 個使用中」/「未使用」）。
   空狀態顯示「還沒有上傳圖示」。
3. **點任一圖示 → 詳細**：大圖（淺 / 深色底）、上傳日期、使用中的帳戶 / 分類名稱（`/usages`）、
   「刪除」按鈕。刪除確認文字依使用情況：「有 2 個帳戶、1 個分類會改回預設圖示，確定刪除？」或
   「確定刪除？」。刪除後依回應的重設筆數刷新帳戶 / 分類資料。

**與圖示挑選器的分工**：各帳戶 / 分類編輯畫面的 `IconPicker` 新增「我的圖示」區負責**選用**，並保留
「上傳新圖示」（共用同一個上傳 + 預覽元件，不離開目前表單，避免填到一半的資料遺失）。**刪除只在
「我的圖示」頁**，挑選器裡不放刪除，避免選圖時誤刪。

### 7. 網頁端實作

- 三份重複的圖示對照表合併為單一元件 `EntityIcon({icon, color, size})`：內建 key 照舊畫 SVG + 彩色底；
  `custom:` 畫 `<img src="/api/v1/icons/<uid>" loading="lazy" alt="">`，**不加彩色底**（彩色插圖疊
  彩色圓底會很雜），載入失敗退回預設圖示。
- 上傳 + 預覽抽成共用元件 `IconUploadFlow`，「我的圖示」頁與 `IconPicker` 共用。
- RTK Query：`icons` tag，上傳 / 刪除後 invalidate；刪除另外 invalidate `accounts`、`categories`。
- 圖片走同源 `/api/v1`（Next rewrites 轉後端），cookie 自然帶上，不需 CORS。
- Service Worker 維持「`/api/` 不攔截不快取」；離線時靠瀏覽器 HTTP 快取（immutable 長快取），
  沒快取到的顯示預設圖示。

### 8. iOS App（第二階段）

- `IconBadge` 遇到 `custom:` 改用自訂載入器：沿用 `APIClient` 的 `URLSession`（共用
  `HTTPCookieStorage.shared` 的登入 cookie），結果存 `Caches/` 以 uid 為檔名；內容不可變，永不重新
  驗證；失敗退回 `circle.fill`。
- 「更多」加「我的圖示」`IconsView`：上方 `PhotosPicker` 上傳、下方 `LazyVGrid` 已上傳圖示、點進
  詳細可刪除（版面同 §6）。
- 帳戶 / 分類的 `IconPicker` 加「我的圖示」選用區與 `PhotosPicker` 上傳。
- 預覽 sheet 用同一支 preview API、同樣的淺 / 深色實際尺寸呈現。
- iOS 離線功能目前在 `ios-app` 分支（未併 main），iOS 這一期應在該分支合併後再做，避免兩邊衝突。
- 依現有流程：push → GitHub Actions 編譯 → `ios-sideload sign` → 裝進 LiveContainer。

### 9. 新增相依

- 後端加 `Pillow`（arm64 / x86_64 皆有 wheel），版本鎖到 patch 並登錄版本表（→ CORE-022）。

## 威脅與對策

| 威脅 | 對策 |
| --- | --- |
| 上傳偽裝成圖片的 HTML / 腳本（polyglot、XSS） | 只回重新編碼的 PNG、`nosniff`、`default-src 'none'`、不收 SVG |
| 解壓縮炸彈、超大檔 | 用戶端先縮圖；後端 10 MB / 5,000 萬像素上限、JPEG draft 解碼、單張序列處理 |
| 讀取他人圖示（IDOR） | 擁有者檢查，非本人一律 404 |
| 灌爆儲存空間或 CPU | 每人 50 張；上傳每小時 20 次、預覽每小時 60 次 |
| 照片 EXIF 洩漏位置 | 重新編碼時丟棄全部 metadata |
| Pillow 解碼器漏洞 | 版本鎖定、納入既有 `pip-audit`；處理有大小上限 |

## 拒絕方案（Rejected）

- **存檔案系統（compose volume）**：要新增 volume、權限與備份路徑（現有備份只涵蓋 DB dump），
  兩人規模下換來的效能沒有意義。
- **物件儲存（MinIO / S3）**：多一個服務與憑證，規模完全不需要。
- **把圖片 base64 塞進 `icon` 欄位或 JSON 回應**：超過 50 字元上限，且每次列帳戶 / 分類 / 交易都
  夾帶圖片，讀取路徑變肥（→ ADR-0004）。
- **接受 SVG 上傳**：SVG 可夾帶腳本，消毒成本與風險都高。
- **直接提供原檔**：無法保證內容安全，也會帶出 EXIF。
- **刪除時若仍被引用就拒絕（409）**：使用者得先逐一改掉帳戶 / 分類的圖示才能刪，操作繁瑣；改回
  預設圖示更直接（使用者決定）。
- **前端用 canvas 模擬預覽**：去白底與調色盤量化難以與 Pillow 一致，預覽會跟實際存下的不同。
- **預覽結果暫存 Redis、確認時只送 token**：省一次上傳，但多了暫存狀態與過期處理；檔案已縮到
  < 1 MB，重送比較單純。
- **只靠前端裁切處理**：仍須後端重新編碼才能信任，前端處理只能當體驗加分，不能取代後端管線。
- **只在圖示挑選器裡上傳與管理**：要管理圖示得先打開某個帳戶 / 分類的編輯畫面；改為「更多 → 我的
  圖示」集中管理（使用者決定），挑選器只保留選用與上傳。

## 後果（Consequences）

- `accounts` / `categories` schema 與既有 API 回應格式不變；新增 `user_icons` 表、一支 migration、
  一個頁面與兩個導覽入口。
- 資料庫容量增加可忽略（50 張 × 2 人 × 約 20 KB ≈ 2 MB）。
- 前端三份圖示對照表合併為一處，之後新增內建圖示只改一個地方。
- 刪除自訂圖示會直接改掉使用者的帳戶 / 分類圖示（改回 `other`），不可自動還原；靠刪除前的提示讓
  使用者知情。
- 自訂圖示不吃使用者選的顏色；design-spec §12.4 需補「自訂圖示不套底色」。
- iOS 更新前，自訂圖示在 App 顯示預設圖示，功能不中斷。

## 可調參數

以下數值是本 ADR 的初始值，調整不影響架構：每人 50 張、處理後 256×256 / 64 KB、用戶端縮圖長邊
1024、上傳每小時 20 次、預覽每小時 60 次、去白底容差。10 MB 上限例外，要放寬須同時改 Next.js 設定。

## 實作分期

1. **後端**（約 1~1.5 天）：model + migration、Pillow 管線（單元測試：各格式、EXIF、解壓縮炸彈、
   去白底、比例、配額、去重、「同輸入兩次輸出位元組相同」）、六支 endpoint、`custom:` 引用驗證、
   刪除時重設引用、限流、OpenAPI。
2. **網頁**（約 1.5~2 天）：`EntityIcon` 合併、「我的圖示」頁 `/icons` 與兩個導覽入口、
   `IconUploadFlow` 與預覽對話框、`IconPicker` 選用區、RTK Query、vitest + msw 測試。
3. **iOS**（約 1~1.5 天，`ios-app` 合併後）：自訂載入器與快取、「更多 → 我的圖示」、挑選器選用與上傳、
   預覽 sheet；含一輪 Actions 編譯與實機驗證。

## 參照

- design-spec §12.4（圖示清單由前端維護、後端只驗非空）
- ADR-0004（讀取路徑容量規劃）
- DB-002、DB-012、DB-013、DB-015、CORE-022
