# Propose v1.1.0 — expense-tracker-web

> 草稿：由 agent 依使用者口頭需求代筆，待使用者確認後才可執行 `/propose-to-tasks`（比照 v1.0.0 先例）。

- **日期**：2026-09-04
- **狀態**：Draft

## 版本目標

v1.0.0 只做出功能，完全沒做視覺設計；這版要幫記帳網站補上一套現代極簡、柔和粉嫩、大量曲線元素的完整視覺設計系統（含 Light + Dark 兩套主題）與資訊架構，並讓行動端的登入與記帳流程更順手（PIN 快速登入、精簡必填欄位），取代目前的裸版樣式。使用者對初版設計稿提出的 6 項開放問題已全數回覆「都做」，故本版同時納入 Dashboard 期間彙總 API、PIN 登入後端支援、週期性交易週/月/年間隔擴充、預設分類新增「訂閱」、分類/帳戶顏色與圖示欄位、Dark Mode 六項追加範圍，皆已在 `design-spec.md` 補齊足以拆 task 的細節。

## In Scope

- 全站視覺設計系統：色彩 tokens（含收入/支出/警示等語意色，**Light + Dark 兩套完整 tokens**，語意對應一致）、圓角、陰影、字級（對齊既有 FE-059/060 下限）、間距、字體；Dark Mode 三態切換（淺色/深色/跟隨系統）入口與儲存機制（`design-spec.md` §2.7）
- 資訊架構重新梳理：完整 sitemap，新增「帳戶管理」「分類管理」「設定」三個前端頁面（後端 CRUD API 已存在，v1.0.0 沒做對應前端頁）
- 桌面版 + 行動版頁面版面規劃（同一路由、Tailwind `md:` breakpoint 切換，非分開路由）
- 密碼或 PIN 對應特定帳戶登入；行動端點擊密碼/PIN 輸入框彈出客製化數字鍵盤，PIN 輸入框**支援瀏覽器/系統密碼管理員 autofill**（改為可見、非 `readOnly`，`autoComplete` 依登入/設定情境區分，代價是部分 Android/iOS 仍可能同時彈出原生鍵盤，已知 trade-off，見 `design-spec.md` §5.1–§5.4），金額鍵盤不受影響仍完全抑制原生鍵盤；**PIN 登入後端最小新增**（`user_credentials` 新增 PIN hash 欄位與登入/設定/變更/停用 API，含失敗鎖定機制，見 `design-spec.md` §12.2）
- 新使用者預設建立「現金」「銀行」兩個帳戶；銀行帳戶可刪改名，帳戶功能採漸進揭露（非強迫每人都管理多帳戶）
- Dashboard：月收入／月支出／結餘／預算結餘（期間可切月／年／自訂範圍）、帳戶資產總覽、圖表（圓餅/長條/折線）可切換且記住使用者選擇（預設圓餅）；**新增 `GET /dashboard/summary` 彙總 API** 支撐期間彙總查詢（見 `design-spec.md` §12.1）
- 交易清單：可編輯/刪除既有交易
- 新增收支：自動帶入當日日期可改；只有「收支類型／日期／金額」三個必填，其餘（分類/明細/帳戶/支付方式）選填；預設記錄帳戶＝現金，可修改並記住新預設；可勾選「固定收支」並設定週期，**週期單位（週/月/年）與間隔數字（每幾週/月/年一次）全面開放**（`recurring_rules` 新增 `interval_unit`/`interval_count`/`anchor_date` 欄位，見 `design-spec.md` §12.3）
- 收支分類另開頁面管理，含系統預設分類清單（**新增「訂閱」**，見 `design-spec.md` §8），使用者可自行增刪
- **分類 / 帳戶新增顏色與圖示欄位**，使用者可在新增/編輯表單自訂顏色（色票 + 自訂 hex）與圖示，取代前端雜湊配色方案，跨裝置同步（見 `design-spec.md` §12.4）
- 流暢曲線動畫（波浪圖表、卡片互動、頁面轉場），遵守 `prefers-reduced-motion`

## Out of Scope

- 既有帳戶／分類／交易／週期性交易／預算／金融資產 API 的**既有**商業邏輯不重做（新增欄位/新增彙總端點不算「重做」，見上方 In Scope 與風險段落）
- 記帳以外的理財建議、銀行帳戶自動同步、帳本共享、原生 App、多幣別（沿用 v1.0.0 既有排除範圍，本版未變更）
- 分類/帳戶自訂圖示與顏色的**選擇範圍**：本版圖示為前端維護的固定圖示集（非使用者上傳自訂圖片），顏色為色票 8 色 + 自訂 hex（非色彩選取器的完整色域介面）
- 週期性交易的間隔仍有實務上限：`interval_count` 上限 99（`→ design-spec.md A16`），不支援「每 N 天」（僅週/月/年三種單位）
- 「欄位選填時以其他分類/空字串代表未填」的資料誠實性妥協**已決議維持現狀**，不做後端 `NULL` migration（`design-spec.md` §1 `[A5]`），本版不動 `category_uid`/`description`/`payment_method` 的 nullable 屬性
- 不寫任何 `frontend/` / `backend/` 程式碼；本版產出只有設計文件與視覺 mockup

## 對外承諾

- 完整設計規格見 `docs/Tasks/v1.1.0/design-spec.md`：資訊架構、桌面/行動版逐頁 wireframe、RWD 對應表、視覺設計系統（色彩 Light+Dark/圓角/陰影/字級/間距）、元件清單、客製化數字鍵盤規格、動畫規範、新增收支流程規格、分類管理頁規格、建議套件清單、**後端最小新增 API 規格**（Dashboard 彙總、PIN 登入、recurring_rules 週期擴充、分類/帳戶顏色圖示，§12）
- 視覺 mockup（登入含 PIN 鍵盤、Dashboard 桌機/行動版**（各含 Dark Mode 切換 tweak）**、新增收支表單、分類管理頁）以 Artifact 形式提供，供使用者確認方向後再進 `/propose-to-tasks`
- 所有 mobile 互動元件（含數字鍵盤按鍵）維持 `→ FE-058` 的 44×44px 觸控下限；字級不低於 `→ FE-059/060` 現有規範
- 新增交易表單的必填欄位範圍（收支類型/日期/金額）與預設值邏輯（日期=今天、帳戶=現金）是本版對外可驗證的行為承諾
- Dashboard 期間彙總（月/年/自訂範圍的收入/支出/結餘/預算結餘）**改吃新增的 `GET /dashboard/summary` API**，非前端分頁全抓加總，是本版對外可驗證的效能與正確性承諾
- PIN 快速登入連續輸入錯誤 **5** 次會鎖定 **15 分鐘**，鎖定期間一律拒絕驗證並提示改用密碼登入，是本版對外可驗證的安全行為承諾

## 風險與相依

- **`design-spec.md` §13 全部 7 個開放問題已於 2026-09-04 決議完畢**：Q1（欄位選填的資料誠實性妥協）**已決議：維持現狀，不做後端 `NULL` migration**（`→ A5`）；Q2（PIN 與瀏覽器密碼管理員 autofill）**已決議：要支援**——PIN 輸入框改為可見、非 `readOnly`，依登入（`autoComplete="current-password"`）/設定（`autoComplete="new-password"`）情境區分，並明確接受「與完全抑制原生鍵盤互斥」的已知 trade-off（部分 Android/iOS 仍可能彈出系統數字鍵盤，見 `design-spec.md` §5.1–§5.4 / §12.2）；Q2/Q3/Q4/Q6/Q7（週期性週/年、分類帳戶顏色圖示、Dark mode、訂閱分類、Dashboard 彙總 API，首輪決議編號）**已決議：都做**。已無待決議項目，不再是風險項，已全數轉為 §1/§2.7/§5/§8/§12 的正式規格，拆 task 時直接依規格拆分即可
- PIN 登入涉及新的認證流程與「裝置記住帳號」機制（設計上採 `localStorage` 存非機密顯示資訊 + `user_uid`、PIN 本身仍每次即時打後端驗證），已決議新增 `backend/app/api/v1/auth.py` 下 4 個最小 API（`design-spec.md` §12.2），實作時需與既有 httpOnly cookie 認證機制（`→ FE-035`）相容，不得繞過；PIN 鎖定機制（5 次/15 分鐘）需與既有密碼登入的錯誤處理慣例（`AppError` 401/409/429）對齊
- `recurring_rules` 新增 `interval_unit`/`interval_count`/`anchor_date` 三欄位並將既有 `day_of_month` 改為 nullable（`design-spec.md` §12.3），屬**資料模型變更**而非純新增表，需要既有規則的資料回填 migration，拆 task 時需包含回填腳本與 round-trip（upgrade/downgrade）驗證（`→ DB-050`）
- `categories` / `accounts` 新增 `color`/`icon` 欄位（`design-spec.md` §12.4）需要對既有列做資料回填（複製前端雜湊配色邏輯避免既有使用者視覺跳動），拆 task 時需包含回填腳本
- 圖表函式庫（建議 `recharts`）、表單函式庫（`react-hook-form` + `zod`）、動畫函式庫（`framer-motion`）、`class-variance-authority`（FE-052 既有規則要求但目前未安裝）皆為新增依賴，需在拆 task 時鎖定版本（`→ CORE-022`）並評估 bundle size 對 `npm run build` 的影響
- Dark mode 色彩 tokens（`design-spec.md` §2.2.1/§2.3.1）的對比值為設計階段估算，實作時需重跑對比/色票驗證工具做最終確認，非阻塞本版設計核可但列為拆 task 的驗收條件之一

## 驗收標準

- [ ] `docs/Tasks/v1.1.0/design-spec.md` 涵蓋資訊架構、桌面版與行動版逐頁版面規劃、RWD 對應表、視覺設計系統（色彩含 hex，Light+Dark/圓角/陰影/字級/間距）、元件清單、數字鍵盤規格、動畫規範、新增收支流程規格、分類管理頁規格、建議套件清單、後端最小新增 API 規格（§12），且每一項合理假設都有 `[A-n]` 標記
- [ ] 視覺 mockup 至少涵蓋：登入（PIN + 數字鍵盤，行動版）、Dashboard 桌機版（含 Dark Mode 切換）、Dashboard 行動版（含 Dark Mode 切換）、新增收支表單（行動版 bottom sheet）、分類管理頁，並已發佈為可存取的 Artifact 連結
- [x] 使用者已對 `design-spec.md` §13 全部開放問題（含最後的 Q1 欄位選填誠實性、Q2 PIN autofill）逐項回覆決議（2026-09-04），無殘留待決議項目，可執行 `/propose-to-tasks` 進入拆分任務階段
- [ ] 本版產出**不**包含任何 `frontend/` 或 `backend/` 程式碼變更（`git status --porcelain` 只應顯示 `docs/Tasks/v1.1.0/` 下的新檔案）

## 參照

- `docs/Tasks/v1.1.0/design-spec.md`（完整設計規格，含 §12 後端最小新增 API 規格）
- `docs/Tasks/v1.0.0/propose-v1.0.0.md` / `tasks-v1.0.0.md`（既有功能範圍）
- 參考素材：專案根目錄「記帳表單.nmbtemplate」（交易明細欄位設計，沿用同一份）
