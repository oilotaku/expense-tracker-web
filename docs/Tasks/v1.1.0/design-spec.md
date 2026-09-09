# Design Spec v1.1.0 — expense-tracker-web

> 文件性質：**設計規劃**，非實作程式碼。作者角色：資深 UI/UX 設計師 + 前端工程師（agent 代筆）。
> 依據：使用者口頭需求（見 `propose-v1.1.0.md` In Scope）+ `AGENTS.md` / `rules/10-frontend/*`（FE-001..065）+ v1.0.0 既有後端 schema（本文件已逐一核對，見 §12 後端最小新增 API 規格 / §13 開放問題）。
> 本版**不動 `frontend/` / `backend/` 原始碼**，只交付文件與視覺稿；不執行 `/propose-to-tasks`。

---

## 0. 範圍摘要

v1.1.0 = 補視覺設計系統（含 Light + Dark 兩套色彩 tokens，v1.0.0 只做了功能，`globals.css` 只有 `@import "tailwindcss"`，無色彩/元件庫/圖表庫）+ IA 重新梳理 + PIN 登入與客製化數字鍵盤 + Dashboard 期間彙總（含新增彙總 API）/圖表切換體驗 + 新增交易最小必填流程 + 週期性交易週/月/年間隔擴充 + 分類/帳戶顏色與圖示自訂。既有後端商業邏輯（帳戶/分類/交易/週期性/預算/資產 API）原則沿用，本版**追加**的最小後端 API 面已在 §12 完整規格化（Dashboard 彙總、PIN 登入、recurring_rules 週期擴充、分類/帳戶顏色圖示）。全部開放問題已於 2026-09-04 由使用者決議完畢（§13 保留歷史紀錄），本文件可直接供 `/propose-to-tasks` 拆分任務。

---

## 1. 假設清單（Assumptions）

設計中所有「使用者未明講、由設計師合理推斷」之處，集中列於此，逐項在後文以 `[A-n]` 引用：

- **[A1]** PIN 登入是**既有 email/password 帳號**的「本裝置快速登入」捷徑，不是獨立的帳號體系。使用者需先用 email/password 登入過一次、在「設定」頁主動設定 PIN，之後同一裝置才會出現 PIN 快速登入選項。
- **[A2]** PIN 長度固定 **6 碼**（比對主流銀行 App 慣例；4 碼安全性偏低、8 碼行動裝置輸入負擔重）。待使用者確認，若定案 4 碼只需調整 `<NumericKeypad mode="pin">` 的 `length` prop。
- **[A3]** 裝置「記住的帳號」清單（顯示用的 email 遮罩 + 顯示名稱 + 頭像色）存於 **`localStorage`**，屬非機密展示用資料，不是 session token；PIN 驗證仍是每次即時打後端 API，成功後由後端照舊發 httpOnly cookie（`→ FE-035` 不變）。
- **[A4]** 現金帳戶預設**不可刪除到 0 個帳戶**：使用者可改名任何帳戶（含現金），但系統**至少保留 1 個帳戶**；刪除操作在只剩最後一個帳戶時停用並顯示原因。銀行帳戶無此限制，可自由刪除（刪除前若有交易掛在該帳戶，比照一般刪除警告：走 `<ConfirmDialog>` 並提示需先轉移或保留歷史交易，實際轉移邏輯由後端規則決定，非本版範圍）。
- **[A5]** 新增交易表單「分類 / 明細 / 支付方式」留白時，前端送出：分類 = 系統預設「其他」分類、明細 = 空字串、支付方式 = 空字串（皆為目前後端 NOT NULL 欄位可接受的合法值，**不需要後端 schema migration**）。這是為了不牽動後端而做的**設計妥協**：「其他」分類與「使用者真的手動選其他」會混在一起、統計上有一定失真。**已決議（2026-09-04）：維持此方案，不做後端 `NULL` migration**——`category_uid` / `description` / `payment_method` 三欄位不改為可為 `NULL`，本版對此妥協的接受度已由使用者確認，不再是開放問題。
- **[A6]（已決議：週/月/年間隔全面開放）** 「固定收支」週期單位（週/月/年 + 間隔 N）**UI 與後端一併全量開放**，不再是「即將開放」的停用態。現有 `recurring_rules` 後端 model 需擴充（新增 `interval_unit` / `interval_count` / `anchor_date` 欄位）才能支援，完整資料模型調整方向與既有月資料相容策略見 §12.3；UI 規格見 §7.2（已更新為正式可用版本）。
- **[A7]** Dashboard「預算結餘」卡片只在期間 = **月** 時完整可用（對齊 `Budget.period_type = monthly`）；期間切到「年」或「自訂範圍」時，該卡片顯示簡化狀態（見 §9.2），不做不精確的估算數字。此行為同時對應 §12.1 Dashboard 彙總 API 回應中 `budget_remaining` 欄位「period ≠ month 時一律為 `null`」的約定。
- **[A8]（已決議：後端加 icon / color 欄位）** 分類 / 帳戶新增 `color`（hex）與 `icon`（固定圖示 key）欄位，使用者可在新增/編輯表單自訂並跨裝置同步；不再使用前端依名稱雜湊配色的方案。完整欄位設計、驗證規則與既有資料回填策略見 §12.4；表單呈現（色票選擇器 + 圖示選擇器）見 §9.6 / §8。
- **[A9]** 支付方式沿用後端 `payment_method: String(50)` 自由字串（無 enum），前端提供常用選項的 combobox（現金／信用卡／金融卡／行動支付／銀行轉帳／其他）+ 允許輸入自訂字串，非後端強制枚舉。
- **[A10]（已決議：本版納入 Dark Mode）** 本版**同時交付 Light + Dark 兩套完整色彩 tokens**，語意對應一致（收入/支出/警示色系不變，僅明度/彩度依深色背景重新校正，見 §2.2.1 / §2.3.1）；套用機制（切換入口、儲存方式、無 FOUC 作法）見 §2.7。視覺 mockup 已在 Dashboard 桌機版與行動版兩個 artboard 加上 Dark Mode 切換 tweak，供對照瀏覽。
- **[A14]** Dashboard 期間彙總 API（§12.1）的 `date_from` / `date_to` 沿用既有 `TransactionListFilter.date_from/date_to`（`datetime`）的邊界慣例：前端負責把使用者選擇的當地日期範圍轉換成 `Settings.API_TZ` 對應的 UTC 邊界再送出，不引入新的日期序列化慣例（`→ CORE-041`）。
- **[A15]** PIN 登入失敗鎖定門檻採**連續失敗 5 次鎖定 15 分鐘**（比照主流銀行 App 慣例的中間值；比對主流方案在 3–10 次 / 5–30 分鐘區間，5 次 15 分鐘在「防暴力破解」與「使用者誤觸不易被鎖」間取平衡）。完整流程見 §12.2。
- **[A16]** `recurring_rules.interval_count` 上限訂為 **99**（`CheckConstraint(interval_count BETWEEN 1 AND 99)`），避免無意義的超大間隔值；下限 1（即「每週/月/年一次」）。
- **[A17]** 新增系統預設分類「訂閱」，插入順序考量：現有清單前段（餐飲/交通/娛樂/購物/醫療/居住）為典型支出分類、「薪資」為唯一收入分類、「其他」為保底分類；「訂閱」性質貼近支出分類，插入在支出分類之後、「薪資」之前，最終順序為**餐飲、交通、娛樂、購物、醫療、居住、訂閱、薪資、其他**（分類目前無 income/expense 分流欄位，此順序純粹是種子清單的呈現順序，見 §8）。
- **[A11]** 圖表 3 選 1（圓餅/長條/折線）與「預設圓餅圖記住使用者選擇」皆採 **`localStorage` 記住**（同裝置），不落地到後端使用者偏好欄位，避免新增後端欄位；跨裝置不同步，列為已知限制。
- **[A12]** 「新增收支」不開新路由（`/transactions/new` 不存在），而是 `<Dialog>`（桌機）/ `<BottomSheet>`（行動端，同一顆 `<Dialog>` 元件依 breakpoint 切外觀）由 Dashboard 與交易清單頁共用的 FAB／按鈕觸發，避免違反 FE-063「禁用 JS 條件 render 做一般 RWD」與 FE-002 的路由目錄限制。
- **[A13]** `/recurring` 頁維持作為「既有週期規則的檢視/編輯/停用」清單頁（沿用 v1.0.0 既有頁面與 API），新增交易表單內的「固定收支」勾選只是**呼叫既有 recurring_rules 建立 API 的另一個入口**，非重複實作。

---

## 2. 視覺設計系統

### 2.1 設計語言

現代極簡 + 柔和 pastel + 大量曲線（圓角卡片、波浪折線）。核心原則：資訊density 低、留白多、色彩語意一致（收入=綠系、支出=珊瑚系、警示=琥珀系）、互動回饋以曲線/彈性動畫呈現而非生硬切換。

### 2.2 色彩 Tokens

以 CSS variable 定義於 `app/globals.css`（`--color-*`），Tailwind v4 用 `@theme` 對映。皆為 Light 模式（`→ A10`）。

**中性色（背景 / 文字 / 邊框）**

| Token | Hex | 用途 |
| --- | --- | --- |
| `--color-bg` | `#FAF8FC` | 頁面底色（極淺薰衣草白） |
| `--color-surface` | `#FFFFFF` | 卡片 / Dialog / Sheet 底色 |
| `--color-surface-sunken` | `#F2EFFA` | Bottom nav / 次要區塊底色 |
| `--color-border` | `#E7E2F3` | 卡片邊框、分隔線 |
| `--color-text-primary` | `#2B2740` | 主要文字（對比 `--color-bg` ≈ 12:1） |
| `--color-text-secondary` | `#6B6480` | 次要文字（標籤、說明） |
| `--color-text-muted` | `#9C96AF` | 佔位符、caption |
| `--color-text-inverse` | `#FFFFFF` | 深色/實心底上的文字 |

**品牌主色（薰衣草紫）**

| Token | Hex | 用途 |
| --- | --- | --- |
| `--color-primary-100` | `#EDE6FB` | 淡底（badge / 選中態底色） |
| `--color-primary-300` | `#C3AAF2` | 裝飾、圖表輔助 |
| `--color-primary-500` | `#9B72E8` | 中性強調（icon、次要按鈕邊框） |
| `--color-primary-600` | `#8257D6` | **主按鈕底色**（對白字對比 ≈ 4.6:1，符合 AA） |
| `--color-primary-700` | `#6A42B3` | 主按鈕 hover / active |

**次要色（薄荷綠，裝飾/次要強調用，非收入語意）**

| Token | Hex |
| --- | --- |
| `--color-secondary-100` | `#DFF7EF` |
| `--color-secondary-500` | `#5FC9A4` |
| `--color-secondary-700` | `#2E9575` |

**語意色**

| Token | Hex | 用途 |
| --- | --- | --- |
| `--color-income-100` | `#E1F7E6` | 收入金額底色 / badge |
| `--color-income-500` | `#4FAE6D` | 收入 icon / 圖示 |
| `--color-income-700` | `#2F7D49` | 收入金額文字（對白 ≈ 5.1:1） |
| `--color-expense-100` | `#FDE7E7` | 支出金額底色 / badge |
| `--color-expense-500` | `#E8746B` | 支出 icon / 圖示 |
| `--color-expense-700` | `#C14B42` | 支出金額文字（對白 ≈ 4.7:1） |
| `--color-warning-100` | `#FFF3DC` | 預算接近上限底色 |
| `--color-warning-600` | `#C97A1E` | 預算接近上限文字/圖示（對白 ≈ 4.5:1） |
| `--color-danger-500` | `#E24C4C` | 破壞性操作（刪除按鈕） |
| `--color-danger-700` | `#B23636` | 破壞性操作 hover、超支狀態文字 |

> 語意色使用規則：**文字/圖示一律用 700 階，底色一律用 100 階**，避免 500 階直接當文字（對比不足）。

### 2.2.1 Dark Mode Tokens（`→ A10`，已決議納入本版）

**設計方法**：token **名稱**（角色）在 Light / Dark 間完全不變（`--color-income-700` 永遠代表「收入語意的強調文字/icon 色」），元件程式碼**不需要**寫任何 dark 專屬條件邏輯，只有 CSS variable 的**值**依主題不同 — 這也是為什麼 §2.2/§2.3 從一開始就選擇 CSS variable 而非 Tailwind 內建色的設計原因。

**衍生規則**（非機械式反轉每個 hex，而是依「角色在深色背景上是否還讀得出來」重新指定明度）：
- `100` 系列（Light 中是「淡底」，如 badge/選中態底色）→ Dark 中改為**深色調的同色系底**（貼近 `--color-surface-sunken`，而非近白的淡色調，否則會刺眼）。
- `500` 系列（中強調，icon/裝飾）→ Dark 中維持相近明度或略提升飽和度，確保在深底上仍可辨識。
- `700` 系列（Light 中是「強調文字/icon」，深色調）→ Dark 中改為**淺色調**（文字规則「一律用 700 階」在 Dark 模式下仍成立，只是 700 階本身的 hex 變淺）。
- `--color-text-inverse` 是唯一**不隨主題翻轉**的 token（恆為 `#FFFFFF`，因為它專門用在「實心品牌色按鈕/badge 上的文字」，contrast 對象是按鈕自身底色而非頁面背景）。

**中性色（背景 / 文字 / 邊框，Dark）**

| Token | Dark Hex | 對應 Light | 用途 |
| --- | --- | --- | --- |
| `--color-bg` | `#1C1826` | `#FAF8FC` | 頁面底色 |
| `--color-surface` | `#241F30` | `#FFFFFF` | 卡片 / Dialog / Sheet 底色 |
| `--color-surface-sunken` | `#2C2638` | `#F2EFFA` | Bottom nav / 次要區塊底色、清單分隔用底色 |
| `--color-border` | `#3A3448` | `#E7E2F3` | 卡片邊框、分隔線 |
| `--color-text-primary` | `#F0EDF7` | `#2B2740` | 主要文字（對比 `--color-bg` ≈ 14.8:1） |
| `--color-text-secondary` | `#B4ACC9` | `#6B6480` | 次要文字 |
| `--color-text-muted` | `#8B84A0` | `#9C96AF` | 佔位符、caption |
| `--color-text-inverse` | `#FFFFFF`（不隨主題變） | `#FFFFFF` | 實心品牌色底上的文字 |

**品牌主色（薰衣草紫，Dark）**

| Token | Dark Hex | 對應 Light | 用途 |
| --- | --- | --- | --- |
| `--color-primary-100` | `#332950` | `#EDE6FB` | 淡底（badge / 選中態底色，Dark 中改為深底） |
| `--color-primary-300` | `#9F87E3` | `#C3AAF2` | 裝飾、圖表輔助 |
| `--color-primary-500` | `#A98CF0` | `#9B72E8` | 中性強調 |
| `--color-primary-600` | `#8B6ED6` | `#8257D6` | 主按鈕底色（對白字對比 ≈ 4.6:1，維持 AA） |
| `--color-primary-700` | `#C3B2F5` | `#6A42B3` | 強調文字/icon（Dark 改為淺色調，對 `--color-bg` 對比 ≈ 8.9:1） |

**次要色（薄荷綠，Dark）**

| Token | Dark Hex | 對應 Light |
| --- | --- | --- |
| `--color-secondary-100` | `#1E3A30` | `#DFF7EF` |
| `--color-secondary-500` | `#5FC9A4` | `#5FC9A4`（維持不變，中飽和度綠在深底仍清晰） |
| `--color-secondary-700` | `#7EDDBB` | `#2E9575` |

**語意色（Dark）**

| Token | Dark Hex | 對應 Light | 用途 |
| --- | --- | --- | --- |
| `--color-income-100` | `#1D3324` | `#E1F7E6` | 收入金額底色 / badge |
| `--color-income-500` | `#5FC17F` | `#4FAE6D` | 收入 icon |
| `--color-income-700` | `#7BDE9B` | `#2F7D49` | 收入金額文字（對 `--color-bg` 對比 ≈ 10.1:1） |
| `--color-expense-100` | `#3B2224` | `#FDE7E7` | 支出金額底色 / badge |
| `--color-expense-500` | `#E8897F` | `#E8746B` | 支出 icon |
| `--color-expense-700` | `#F2A79D` | `#C14B42` | 支出金額文字（對 `--color-bg` 對比 ≈ 9.4:1） |
| `--color-warning-100` | `#3D2E14` | `#FFF3DC` | 預算接近上限底色 |
| `--color-warning-600` | `#EAC066` | `#C97A1E` | 預算接近上限文字/icon |
| `--color-danger-500` | `#E2645F` | `#E24C4C` | 破壞性操作 |
| `--color-danger-700` | `#F0958F` | `#B23636` | 破壞性操作 hover、超支狀態文字 |

**陰影（Dark，陰影用純黑提高透明度以在深色底維持「浮起」層次感，比照淺色版本結構、只調整 alpha）**

| Token | Dark 值 | 對應 Light 值 |
| --- | --- | --- |
| `--shadow-sm` | `0 1px 2px rgba(0,0,0,0.4)` | `0 1px 2px rgba(43,39,64,0.04)` |
| `--shadow-card` | `0 4px 16px rgba(0,0,0,0.45)` | `0 4px 16px rgba(139,110,214,0.12)` |
| `--shadow-float` | `0 8px 28px rgba(0,0,0,0.55)` | `0 8px 28px rgba(139,110,214,0.18)` |

上列 hex 對比值為設計階段估算（依 WCAG 相對亮度公式手算），**實作時應比照 Light 模式當初的作法，重跑對比驗證工具做最終確認**（`dataviz` skill 的驗證方法同樣適用於 Dark 色票），非阻塞本版設計核可，但列為實作階段的必要檢查項（納入 `/propose-to-tasks` 拆出的驗收條件）。

### 2.3 圖表色彩（categorical，已用 `dataviz` skill 驗證器跑過六項檢查）

分類/長條圖用固定順序 8 色（第 9 類以上一律折入「其他」，用中性灰，不再生新色）：

| Slot | 語意 | Hex |
| --- | --- | --- |
| 1 | 紫羅蘭（對應品牌主色家族） | `#8B6ED6` |
| 2 | 珊瑚橘 | `#E8834B` |
| 3 | 蒂芬妮綠 | `#2FA98A` |
| 4 | 金黃 | `#D9A428` |
| 5 | 天空藍 | `#3E8FD0` |
| 6 | 桃紅 | `#D65FA0` |
| 7 | 橄欖綠 | `#8AAE3C` |
| 8 | 靛紫 | `#5A4FA0` |
| 其他 | 中性灰（固定，非生成色） | `#9C96AF` |

驗證結果（`node scripts/validate_palette.js`，light 模式、surface `#FFFFFF`）：Lightness band / Chroma floor / CVD separation（worst adjacent ΔE 8.1）/ Normal-vision floor（ΔE 20.2）**全數 PASS**；Contrast vs surface 為 **WARN**（4 個色階 < 3:1）→ 依規則**必須**搭配 relief channel：圖例（legend）恆常顯示 + 直接數值標籤，**文字一律走 `--color-text-*` token，禁止用圖表色當文字色**。

**Pie/Bar 折疊規則**：超過 6 類時，取金額前 6 大分類 + 其餘全部併為「其他」（灰），最多 7 段，符合 series-count ladder 的 5–6 軟上限。

**折線圖（收入/支出趨勢）**：最多 2 series（收入=`--color-income-700` 線 / 支出=`--color-expense-700` 線），落在「1–3 色安全」區間，面積填色用系列色 **10% 透明度**（wash，不可實色）。

### 2.3.1 圖表色彩（Dark，`→ A10`）

Dark 底色下整體調亮/略提升飽和度以維持在深色卡片背景（`--color-surface` `#241F30`）上的辨識度與 CVD 可分性，順序與語意角色不變：

| Slot | 語意 | Light Hex | Dark Hex |
| --- | --- | --- | --- |
| 1 | 紫羅蘭 | `#8B6ED6` | `#A78BEA` |
| 2 | 珊瑚橘 | `#E8834B` | `#F0985F` |
| 3 | 蒂芬妮綠 | `#2FA98A` | `#45C6A5` |
| 4 | 金黃 | `#D9A428` | `#E8BB4A` |
| 5 | 天空藍 | `#3E8FD0` | `#5CA8E8` |
| 6 | 桃紅 | `#D65FA0` | `#E687BA` |
| 7 | 橄欖綠 | `#8AAE3C` | `#A3C65C` |
| 8 | 靛紫 | `#5A4FA0` | `#7A6FC0` |
| 其他 | 中性灰（固定） | `#9C96AF` | `#6E667F` |

折疊規則（超過 6 類併入「其他」）、Pie/Bar 折疊上限、折線圖 series 上限與面積 wash 透明度規則皆與 Light 模式相同，不因主題重新定義。同上，實作階段需重跑 `dataviz` skill 驗證器對 Dark 色票做 Lightness band / Chroma floor / CVD separation 複驗。

**狀態色（budget 進度）獨立於圖表色**，永遠 icon + 文字並存，不單靠顏色：
- 正常（<80%）：`--color-primary-600` 系
- 接近上限（80–99%）：`--color-warning-600` + ⚠ icon + 文字「已使用 85%」
- 超支（≥100%）：`--color-danger-700` + 🔴 icon + 文字「已超支 NT$1,200」

### 2.4 圓角 / 陰影

| Token | 值 | 用途 |
| --- | --- | --- |
| `--radius-sm` | 8px | Chip、Badge、輸入框內控制項 |
| `--radius-md` | 16px | 按鈕、輸入框、數字鍵盤按鍵 |
| `--radius-lg` | 24px | 卡片（Card / StatTile） |
| `--radius-xl` | 32px | Dialog、BottomSheet 上緣、Hero 區塊 |
| `--radius-full` | 9999px | 頭像、Pill 按鈕、圓形數字鍵、FAB |
| `--shadow-sm` | `0 1px 2px rgba(43,39,64,0.04)` | 一般卡片靜態陰影 |
| `--shadow-card` | `0 4px 16px rgba(139,110,214,0.12)` | 卡片預設（品牌紫調陰影，非純黑） |
| `--shadow-float` | `0 8px 28px rgba(139,110,214,0.18)` | FAB / hover 抬升 / BottomSheet |

### 2.5 字級（對齊 FE-059 / FE-060 下限，不得更小）

| 用途 | Mobile | Desktop（`md+`） |
| --- | --- | --- |
| Body / 表單 / nav | `text-sm`（14px） | `text-base`（16px） |
| 密集列表（交易清單次要欄） | `text-sm`（14px，非承載必讀金額） | `text-base` |
| `h1` | — | `text-2xl md:text-3xl` |
| `h2` | — | `text-xl md:text-2xl` |
| `h3` | — | `text-lg md:text-xl` |
| Dashboard Hero 數字（結餘等） | `text-3xl`（≥48px 視覺權重用 `font-semibold` + 大 line-height 達成，非另開字級表） | `text-4xl` |
| Caption / hint | `text-xs`（僅限提示文字，不承載必讀資訊，符合 FE-059 例外） | `text-xs` |

字體：`Manrope`（Google Fonts，經 `next/font/google` 自架，非 runtime CDN）作為全站主要字體 — 幾何圓潤字形呼應「曲線」語言，數字（金額）易讀；不用襯線 / 裝飾字體。金額類大數字用 proportional figures（預設），交易清單金額欄對齊用 `tabular-nums`。

### 2.6 間距系統

沿用 Tailwind v4 預設 4px scale，不自訂新 scale。語意化用法：
- 卡片內距：`p-5 md:p-6`（20px / 24px）
- 卡片間距（grid gap）：`gap-4 md:gap-6`
- Section 間距：`gap-6 md:gap-8`
- Container：沿用 `→ FE-056`：`mx-auto max-w-7xl px-4 md:px-6 lg:px-8`

### 2.7 Dark Mode 套用機制（`→ A10`）

- **三態切換**：淺色 / 深色 / 跟隨系統（預設值 = 跟隨系統，即不主動覆寫使用者 OS 偏好）。切換入口：桌機在 Sidebar 底部（設定項上方）放一顆小型三態圖示按鈕（太陽/月亮/一個系統圖示循環切換）；行動端放在「更多」選單（`→ §3.1`）與 `/settings` 頁內，三處共用同一個 `useThemePreference` hook + 同一組 UI，不重複實作。
- **儲存**：使用者選擇寫入 `localStorage`（key 例如 `theme-preference`，值 `light` / `dark` / `system`），比照既有 `→ A11` 圖表偏好、`→ A3` 記住帳號清單同樣走 localStorage 的既有模式，不新增後端使用者偏好欄位、不跨裝置同步（純前端行為）。
- **套用方式**：`<html>` 根元素依解析結果加上 `data-theme="light"` / `data-theme="dark"` 屬性（`system` 時**不**寫入 `data-theme`，改由 CSS `@media (prefers-color-scheme: dark)` 接管，與 Artifact/Design 常見的三層 CSS 寫法一致：`:root` 定義 Light 預設值 → `@media (prefers-color-scheme: dark)` 內用 `:root:not([data-theme="light"])` 覆寫 → `:root[data-theme="dark"]` 再覆寫一次確保手動切換永遠優先）。
- **無 FOUC**：解析 `localStorage` 並寫入 `data-theme` 的邏輯需在 React hydrate **之前**同步執行（`app/layout.tsx` 內一段 inline `<script>`，在 `<body>` 渲染前跑），避免先閃一次錯誤主題再切換的畫面閃爍；這是 Next.js App Router 專案常見的既定作法，非本版新發明的機制。
- **元件無感知**：如 §2.2.1 所述，元件一律讀 `var(--color-*)`，不寫 `dark:` 前綴的條件 class（除非個別元素有 Tailwind 語意色以外的例外需求，屬實作細節，交由 `/propose-to-tasks` 拆出的 task 決定）。
- **mockup 對照**：本版 Artifact mockup 的 Dashboard 桌機版與行動版兩個 artboard 各自加了 `dark`（boolean）tweak，勾選即可即時對照 Light/Dark 兩版視覺，供使用者在决議設計方向時直接比對（不等同最終 Next.js 實作，僅供色彩與版面驗證）。

---

## 3. 資訊架構（IA / Sitemap）

```
/ (根)
├── /login                      公開；PIN 帳號選擇器 ⇄ Email+密碼表單（見 §9.1）
├── /register                   公開；沿用 v1.0.0 表單，套新視覺
│
├── /dashboard                  首頁（登入後預設導向；middleware 保護）
│     ├─ 期間選擇器（月 / 年 / 自訂範圍）
│     ├─ 收入／支出／結餘／預算結餘 卡片列
│     ├─ 帳戶資產總覽卡片 → 連到 /accounts
│     ├─ 圖表切換器（圓餅／長條／折線，記住選擇）
│     ├─ 最近交易摘要（5 筆）→ 連到 /transactions
│     └─ FAB「+」→ 開新增交易 Dialog/Sheet（非路由，見 A12）
│
├── /transactions                交易清單（篩選：期間/分類/帳戶/收支類型）
│     └─ 列表項可編輯（開同一顆表單 Dialog/Sheet，預帶值）/ 刪除（ConfirmDialog）
│
├── /recurring                   既有週期規則清單（檢視/暫停/刪除既有規則，沿用 v1.0.0 API）
├── /budgets                     預算設定 + 進度（沿用 v1.0.0，套新視覺）
├── /assets                      金融資產 / 負債明細（股票/貴金屬/負債，沿用 v1.0.0）
├── /accounts                    【新】帳戶管理：現金/銀行 + 自訂帳戶，漸進揭露
├── /categories                  【新】分類管理：預設分類 + 新增/刪除
└── /settings                    【新】個人資料、PIN 設定/變更、預設記帳帳戶、登出
```

**導覽層級**：Dashboard 為根節點；`/transactions`、`/budgets`、`/assets` 為一級功能（主導覽直達）；`/recurring`、`/accounts`、`/categories`、`/settings` 為二級（桌機側欄仍列出、行動端收在「更多」）。新增交易是**跨頁動作**（浮動按鈕），不是獨立節點。

### 3.1 導覽結構

**桌機（`md+`）**：左側固定 Sidebar（icon + label），寬 `240px`：Logo/App 名 → Dashboard / 交易 / 週期性 / 預算 / 資產 → 分隔線 → 分類 / 帳戶 → 分隔線 → 外觀切換（`→ §2.7`）/ 設定 / 登出。頂部 Header：頁面標題（`h1`）+ 該頁專屬控制項（Dashboard 的期間選擇器）+ 右上角使用者頭像選單。

**行動端（`< md`）**：底部固定 Bottom Nav（5 格，`min-h-[56px]`，icon + 極簡 label，中間為突出的 FAB「+」）：首頁 / 交易 / **(+)** / 預算 / 更多。「更多」開 `<Dialog>` 型選單（非新路由）列出：週期性、資產、分類、帳戶、外觀切換（`→ §2.7`）、設定、登出。頂部 Header 精簡：頁面標題 + 必要時的期間選擇器（Dashboard）。

### 3.2 RWD 對應表（同一路由，`md:` 切版）

| 頁面 | 共同邏輯 | `< md`（行動） | `≥ md`（桌機） |
| --- | --- | --- | --- |
| 全站 Shell | 同一 `layout.tsx` | `hidden md:block` 藏 Sidebar；顯示 Bottom Nav | `md:hidden` 藏 Bottom Nav；顯示 Sidebar |
| `/login` | 同一 `<LoginView>` | 預設顯示帳號選擇器＋PIN 鍵盤（若有記住帳號） | 預設顯示 Email+密碼表單，PIN 僅為次要連結 |
| `/dashboard` | 同一資料 hook | 卡片單欄堆疊、圖表全寬、期間選擇器收進 Header 下拉 | 卡片 `grid-cols-4`、圖表與帳戶總覽並排兩欄 |
| `/transactions` | 同一列表資料 | 卡片式列表（一筆一卡） | 表格式列表（欄位橫列） |
| 新增/編輯交易 | 同一 `<TransactionFormDialog>` | 由下往上 `<BottomSheet>`，必填在頂部、選填可展開 | 置中 `<Dialog>`，單欄表單，選填預設展開（桌機空間足夠） |
| `/categories` | 同一 grid 資料 | 兩欄卡片 grid | 四欄卡片 grid + hover 顯示刪除 icon |
| `/accounts` | 同一 list 資料 | 卡片堆疊 + 底部「新增帳戶」全寬按鈕 | 卡片橫向 grid + 右上角「新增帳戶」按鈕 |

所有切版**只用 Tailwind `hidden md:block` / `md:hidden` 或版面 class 差異**，**不**建立 `/mobile/*` 路由（`→ FE-054/055/063`）。

---

## 4. 元件清單

| 元件 | 位置 | 用途 / Props 概念 |
| --- | --- | --- |
| `<AppShell>` | `components/common/AppShell.tsx` | 包 Sidebar（桌機）+ BottomNav（行動）+ Header；`children: ReactNode` |
| `<Sidebar>` | `components/common/Sidebar.tsx` | 桌機導覽；`items: NavItem[]` |
| `<BottomNav>` | `components/common/BottomNav.tsx` | 行動導覽 + 中央 FAB；`items`, `onAddClick` |
| `<PeriodSelector>` | `components/dashboard/PeriodSelector.tsx` | 月/年/自訂範圍切換；`value`, `onChange`, 自訂範圍用 `<Dialog>` 內嵌日期輸入 |
| `<ChartTypeSwitcher>` | `components/dashboard/ChartTypeSwitcher.tsx` | 圓餅/長條/折線切換 tab；`value`, `onChange`；內部負責寫入/讀取 `localStorage`（`→ A11`） |
| `<CategoryPieChart>` / `<CategoryBarChart>` / `<TrendLineChart>` | `components/dashboard/` | Recharts 封裝，統一吃 `data: CategorySlice[] \| TrendPoint[]`、統一套用 §2.3 色票 |
| `<CurvedCard>` | `components/common/CurvedCard.tsx` | 基礎卡片（`--radius-lg` + `--shadow-card`），其他卡片組件的底座；`padding?`, `interactive?: boolean` |
| `<StatTile>` | `components/dashboard/StatTile.tsx` | 收入/支出/結餘/預算結餘卡片；`label`, `value`, `tone: 'income'\|'expense'\|'neutral'\|'warning'`, `delta?` |
| `<NetWorthCard>` | `components/dashboard/NetWorthCard.tsx`（沿用既有邏輯改視覺） | 帳戶資產總覽 |
| `<AccountCard>` | `components/accounts/AccountCard.tsx` | 帳戶卡（名稱、餘額、使用者自訂 `color`/`icon`，`→ A8`）；`onRename`, `onDelete`, `onColorIconChange` |
| `<CategoryChip>` | `components/categories/CategoryChip.tsx` | 分類 chip（使用者自訂 `color`/`icon`，`→ A8`）；`name`, `color`, `icon`, `onDelete?` |
| `<ColorSwatchPicker>` | `components/common/ColorSwatchPicker.tsx` | 色票選擇器（§2.3 圖表 8 色 + 自訂 hex 輸入），供分類/帳戶表單共用；`value`, `onChange` |
| `<IconPicker>` | `components/common/IconPicker.tsx` | 固定圖示集選擇器，供分類/帳戶表單共用；`value`, `onChange` |
| `<TransactionFormDialog>` | `components/transactions/TransactionFormDialog.tsx` | 新增/編輯交易主表單，`mode: 'create'\|'edit'`, react-hook-form + zod |
| `<RecurringFieldset>` | `components/transactions/RecurringFieldset.tsx` | 表單內「固定收支」勾選 + 週期設定（週/年停用態，`→ A6`） |
| `<NumericKeypad>` | `components/common/NumericKeypad.tsx` | 客製化數字鍵盤，`mode: 'pin'\|'amount'`（詳見 §5） |
| `<PinLoginPad>` | `components/auth/PinLoginPad.tsx` | 帳號選擇 + PIN 輸入組合，內用 `<NumericKeypad mode="pin">` |
| `<AccountSwitcherList>` | `components/auth/AccountSwitcherList.tsx` | 裝置記住的帳號清單；讀寫 `localStorage`（`→ A3`） |
| `<Dialog>` | `components/common/Dialog.tsx` | 共用 overlay/ESC/portal/focus trap（`→ FE-048`），桌機置中 / 行動端可切 BottomSheet 樣式（同一元件不同 variant，非兩個元件） |
| `<ConfirmDialog>` | `components/common/ConfirmDialog.tsx` | 沿用 FE-048，用於刪除帳戶/分類/交易 |
| `<Toaster>` / `useToast` | `components/common/Toaster.tsx` / `hooks/useToast.ts` | 沿用 FE-048 |
| `<WaveDivider>` | `components/common/WaveDivider.tsx` | 純裝飾用 SVG 波浪（`aria-hidden`），用於 Login/Dashboard hero 背景 |
| `useBreakpoint` | `hooks/useBreakpoint.ts` | 沿用 FE-065，唯一 JS breakpoint 偵測入口 |
| `useReducedMotion` | `hooks/useReducedMotion.ts` | 封裝 `prefers-reduced-motion` 偵測，供動畫元件共用 |
| `useDeviceAccounts` | `hooks/useDeviceAccounts.ts` | 讀寫「本裝置記住的帳號」localStorage（`→ A3`） |
| `useChartPreference` | `hooks/useChartPreference.ts` | 讀寫圖表類型 localStorage（`→ A11`） |

---

## 5. 客製化數字鍵盤規格（`<NumericKeypad>`）

### 5.1 觸發時機

- **PIN 輸入**（`/login` 行動端帳號選擇後、`/settings` 設定/變更 PIN）：`<NumericKeypad mode="pin">` 底層改為**真實可見、非 `readOnly`** 的原生 `<input type="password">`（`→ §5.2`/`§5.3`，已決議支援瀏覽器/系統密碼管理員 autofill，2026-09-04），聚焦即在畫面下方彈出自訂鍵盤 inline 呈現；`inputMode="none"` 仍設定以**嘗試**抑制系統鍵盤，但**不保證**在所有 Android/iOS 版本都成功抑制（`→ §5.4` 已知 trade-off）。
- **金額輸入**（新增/編輯交易表單「金額」欄）：`<NumericKeypad mode="amount">` **不受 PIN autofill 決議影響**，維持原設計：欄位 `readOnly` + `inputMode="none"`，避免 iOS/Android 彈出原生數字鍵盤與 spinner（金額欄位無 autofill 需求，不存在同樣的張力）。

### 5.2 佈局

```
mode="pin"（固定 6 碼，→ A2）：
┌─────────────────────────┐
│   ● ● ● ○ ○ ○            │  ← 原生 <input> 本身（見下方說明），非另一層裝飾 div
├───────┬───────┬───────┤
│   1   │   2   │   3   │
├───────┼───────┼───────┤
│   4   │   5   │   6   │
├───────┼───────┼───────┤
│   7   │   8   │   9   │
├───────┼───────┼───────┤
│       │   0   │   ⌫   │
└───────┴───────┴───────┘
```
**圓點列即為原生 `<input type="password">` 本身的視覺呈現**（`→ §5.3` 已決議支援瀏覽器密碼管理員 autofill，2026-09-04）：input 用 `-webkit-text-security: disc` 讓瀏覽器原生把每個字元畫成圓點、搭配大 `letter-spacing` 對齊六個格位，**不再**疊一層完全隱藏 input 的裝飾用圓點 `<div>`（原本的做法會讓瀏覽器判定該欄位「不可見」而拒絕提供 autofill 建議）。自訂鍵盤按鈕點擊時，用原生 setter（`Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set`）寫入 input 的 `.value` 後 `dispatchEvent(new Event('input', { bubbles: true }))`，確保無論輸入來源是「點擊自訂鍵盤」或「密碼管理員自動填入」，React state 都能同步。輸入滿 6 碼**自動送出**（不需「完成」鍵）；錯誤時圓點區塊做 shake 動畫（`prefers-reduced-motion` 時改為文字提示「PIN 錯誤」，不做位移動畫）+ 清空重來。長按 `⌫` 清空全部。

```
mode="amount"（變動長度，含小數點）：
┌───────┬───────┬───────┐
│   1   │   2   │   3   │
├───────┼───────┼───────┤
│   4   │   5   │   6   │
├───────┼───────┼───────┤
│   7   │   8   │   9   │
├───────┼───────┼───────┤
│   .   │   0   │   ⌫   │
├───────┴───────┴───────┤
│         完成           │  ← 全寬確認鍵，收合鍵盤
└─────────────────────────┘
```

### 5.3 尺寸與無障礙

- 每鍵 `min-h-[44px] min-w-[44px]`（`→ FE-058`），鍵與鍵 `gap-2` 以上，圓角 `--radius-md`（16px，數字圓形鍵可用 `--radius-full`，設計採方圓角折衷：`--radius-md` 圓角矩形）。
- 每鍵為真正的 `<button type="button">`，`aria-label="數字 5"` / `aria-label="刪除"` / `aria-label="完成"`。
- PIN 模式：容器 `role="group"` `aria-label="PIN 輸入"`，進度用 `aria-live="polite"` 宣告「已輸入 3 位，共 6 位」，**不**朗讀實際數字。
- 原生 `<input>` 皆保留供表單驗證，但**可見性依 mode 不同**（`→ §5.2` 已決議，2026-09-04）：
  - `mode="pin"` 用於 `POST /auth/login/pin`（PIN **登入**，`/login` 帳號選擇後）：`type="password"`、**真實可見、非 `readOnly`**、`inputMode="numeric"` + `pattern="\d*"` + `maxLength={6}`、`autoComplete="current-password"`（提示瀏覽器帶入既有憑證），以支援瀏覽器/系統密碼管理員 autofill。
  - `mode="pin"` 用於 `POST /auth/pin` / `PATCH /auth/pin`（PIN **設定/變更**，`/settings`）：同樣可見、非 `readOnly`，但 `autoComplete="new-password"`（語意是「建立新憑證」而非「帶入舊憑證」，避免瀏覽器誤填舊 PIN 或誤存成密碼）。
  - `mode="amount"`：維持 `type="text"`、`readOnly`、`autoComplete="off"`，不受本決議影響（`→ §5.1`）。

### 5.4 iOS Safari / Android Chrome 相容性

- **`mode="amount"` 不變**：**禁止**用 `<input type="number">`（觸發原生數字鍵盤 + spinner 且無法完全抑制）；一律 `type="text"` + `readOnly` + `inputMode="none"`。iOS 對 `inputMode="none"` 的抑制在部分版本不穩定，**必須**同時設 `readOnly`（唯讀 input 從根本不會喚起系統鍵盤）作為保險，鍵盤內容完全由 React state 驅動、透過 `onClick` 寫回。
- **`mode="pin"` 的已知 trade-off**（`→ §5.1`/`§5.3` 已決議支援 autofill，2026-09-04）：「可見 + 非 `readOnly`」是瀏覽器提供密碼管理員 autofill 建議的**必要條件**，這與「完全抑制原生鍵盤彈出」是**互斥的兩個目標**——`readOnly`/不可見的 input 雖然能保證 100% 由自訂鍵盤控制且不彈出系統鍵盤，但瀏覽器會判定該欄位不可互動而**不會**觸發 autofill。本版**選擇支援 autofill**：`mode="pin"` 的 input 保留 `inputMode="numeric"` 嘗試抑制，但**明確承認**部分 Android/iOS 版本仍可能彈出原生數字鍵盤（使用者可直接用原生鍵盤輸入，行為仍正確，只是與自訂鍵盤的視覺一致性在該情境下打折——這是拿到 autofill 的必要代價，非 bug，不需要在實作階段回頭「修掉」）。
- 所有觸發鍵盤的輸入框字級 **≥16px**（呼應 FE-059 mobile 下限，同時避免 iOS Safari 對 <16px 輸入框自動放大頁面的已知問題）。
- viewport meta **禁止** `user-scalable=no` / `maximum-scale=1`（不可為了防誤觸犧牲可及性縮放）。
- 鍵盤容器 padding 使用 `env(safe-area-inset-bottom)`，避免被 iPhone Home Indicator 或 Android 手勢列遮擋；高度計算用 `100dvh` 而非 `100vh`（Android Chrome 動態網址列/工具列會讓 `100vh` 誤算）。
- 按鍵按下回饋：`:active` 態 `scale(0.96)` + 底色加深，`prefers-reduced-motion: reduce` 時只變色不縮放。

---

## 6. 動畫 / 互動規範

- **全域守則**：任何非必要動畫（位移/縮放/曲線路徑）都**必須**包在 `useReducedMotion()` 判斷內，`reduce` 時降級為瞬時切換或純色彩回饋，不停用功能本身。
- **波浪裝飾**（`<WaveDivider>`）：用 `d3-shape` 的 `curveNatural` / `curveBasis` 產生平滑 path，CSS `stroke-dashoffset` keyframe 緩慢循環（6–8s ease-in-out infinite），純裝飾、`aria-hidden="true"`，不承載資料。
- **趨勢折線圖曲線**：Recharts `<Line type="monotone">`（等同 `curveMonotoneX`，平滑且不失真、不會像 `curveBasis` 偏離實際資料點），面積 wash 10% 透明度（`→ §2.3`）。
- **卡片互動**：桌機 hover 抬升（`--shadow-card` → `--shadow-float`，`translateY(-2px)`，150ms ease-out）；行動端 tap 用 `framer-motion` `whileTap={{ scale: 0.98 }}`。
- **圖表類型切換**：`AnimatePresence` 交叉淡入淡出 + 輕微 scale（0.98→1），150–200ms，不做硬切換。
- **BottomSheet（行動端新增交易）**：由下滑入，`type: spring, damping: 30, stiffness: 300`，backdrop 同步淡入；桌機 `<Dialog>` 對應為 `scale 0.96→1 + fade`，200ms。
- **頁面內容轉場**：範圍限縮為單一共用 layout wrapper 的內容 fade（150ms），**不**採用實驗性 View Transitions API（瀏覽器支援度尚不足以覆蓋 iOS Safari，留待後續版本評估）。
- **PIN 錯誤回饋**：見 §5.2。

---

## 7. 新增收支流程規格

### 7.1 必填 / 選填

| 欄位 | 必填？ | 預設值 | 說明 |
| --- | --- | --- | --- |
| 收支類型 | ✅ 必填 | 無（需使用者選；表單初始不預選以避免誤送） | Segmented control：收入 / 支出 |
| 日期 | ✅ 必填 | 當日（`Settings.API_TZ` 當地日期） | 可改，桌機用日期選單、行動端用原生 `<input type="date">`（非數字鍵盤情境，日期選擇非本規格範圍） |
| 金額 | ✅ 必填 | 空 | `<NumericKeypad mode="amount">`，> 0 驗證 |
| 分類 | 選填 | 留白送出時前端補「其他」（`→ A5`） | Select / combobox，列出 `/categories` 現有清單 |
| 明細 | 選填 | 留白送出空字串（`→ A5`） | 單行文字 |
| 帳戶 | 選填（有預設，非真正「可留白」） | 「現金」，可改並記住新預設（`→ A11` 同機制，localStorage） | Select，列出 `/accounts` |
| 支付方式 | 選填 | 留白送出空字串（`→ A5`） | Combobox（`→ A9`） |
| 是否為固定收支 | 選填（勾選框） | 不勾選 | 勾選展開 `<RecurringFieldset>` |

表單初始只顯示「收支類型／日期／金額」三個必填 + 「更多欄位」展開連結（行動端摺疊、桌機預設展開，`→ §3.2` RWD 對應表），呼應「漸進揭露」原則（同 A4 帳戶功能的漸進揭露精神）。

### 7.2 固定收支週期設定 UI（`→ A6`，已決議：週/月/年全面開放）

勾選「固定收支」後展開：

```
週期單位：[ 週 ] [●月] [ 年 ]
每 [ 1 ▾] 月 執行一次（N 可調 1–99，→ A16）
起算日：[ 2026-09-15 ▾]（日期選擇器，錨點日期 anchor_date，決定「星期幾 / 月中第幾天 / 月份+日」）
```

「週」「年」選項與「每 N 週/月/年」的間隔輸入**正式開放**，不再是停用態。三個單位共用同一個「起算日」欄位（`anchor_date`，單一日期選擇器）取代原本只適用於「月」的「執行日」下拉：
- `interval_unit = week` 時，下一次執行日 = 起算日開始每 N 週後的同一星期幾。
- `interval_unit = month` 時，下一次執行日 = 起算日開始每 N 個月後的同一天（月中第幾天）；沿用既有「超過當月天數自動夾到月底」規則。
- `interval_unit = year` 時，下一次執行日 = 起算日開始每 N 年後的同月同日。

完整資料模型調整方向（新增欄位、既有月規則相容/回填策略）見 §12.3；欄位驗證上限（`interval_count` 1–99）見 `→ A16`。

---

## 8. 分類管理頁規格（`/categories`，新頁）

- **（已決議）系統預設種子分類新增「訂閱」**：原清單（已核對 `backend/alembic/versions/2026_09_04_0900-add_categories.py`）為餐飲、交通、娛樂、購物、醫療、居住、薪資、其他；新版種子清單改為**餐飲、交通、娛樂、購物、醫療、居住、訂閱、薪資、其他**（插入位置理由見 `→ A17`）。後端做法：新增一支**獨立**的 alembic migration（不回頭改既有 `2026_09_04_0900-add_categories.py`），比照同一 pattern：`CREATE OR REPLACE FUNCTION seed_default_categories()` 納入「訂閱」、對既有使用者做 backfill INSERT，backfill 需加 `WHERE NOT EXISTS`（比對 `user_uid + name`）避免對已手動建立同名「訂閱」分類的使用者觸發 unique constraint 衝突。
- 版面：Grid 卡片（`<CategoryChip>`），每卡：使用者自訂的圖示 + 顏色（`→ A8`，欄位設計見 §12.4）、名稱、刪除 icon（hover 顯示，桌機）/ 長按顯示（行動端）。
- 新增：頂部/底部常駐輸入列「+ 新增分類」，除名稱文字輸入外，同時展開色票選擇器（§2.3 圖表 8 色 + 自訂 hex）與圖示選擇器（固定圖示集，見 §12.4），Enter 或按鈕送出；即時前端驗證不可與現有分類重名（比對已載入清單，最終仍以後端 409 為準）。
- 編輯：既有分類可隨時修改顏色/圖示（不影響名稱重名檢查邏輯），改色/改圖示為前端即時呼叫 `PATCH /categories/{category_uid}`，不需通過重新命名流程。
- 刪除：`<ConfirmDialog>`，若該分類仍有交易掛載，訊息提示「刪除後不影響既有交易紀錄，但無法用此分類建立新交易」（實際刪除行為以後端既有邏輯為準，本版不改刪除邏輯）。
- 因後端無 income/expense 分流欄位，本頁**不**做「收入分類 / 支出分類」分頁 tab，維持單一扁平清單，與資料模型一致（此點不受本版新增 color/icon 欄位影響）。

---

## 9. 逐頁設計

### 9.1 登入 `/login`

**行動版（預設，若裝置有記住的帳號）**

```
┌─────────────────────────┐
│      〜 波浪裝飾 〜        │
│                          │
│   選擇帳號                │
│  ┌────────────────────┐ │
│  │ 🟣 j***8@gmail.com │ │  ← <AccountSwitcherList>
│  └────────────────────┘ │
│  ┌────────────────────┐ │
│  │ + 使用其他帳號登入   │ │  ← 切到 Email+密碼表單
│  └────────────────────┘ │
└─────────────────────────┘

點選帳號後 →
┌─────────────────────────┐
│  🟣 j***8@gmail.com      │
│      ● ● ● ○ ○ ○         │
│  ┌──┬──┬──┐              │
│  │1 │2 │3 │  <NumericKeypad mode="pin">
│  ├──┼──┼──┤
│  │4 │5 │6 │
│  ├──┼──┼──┤
│  │7 │8 │9 │
│  ├──┼──┼──┤
│  │  │0 │⌫ │
│  └──┴──┴──┘
│  改用密碼登入              │
└─────────────────────────┘
```

**桌機版（預設）**：置中卡片（`max-w-sm`），Email + 密碼欄位（沿用既有欄位，套新視覺：`--radius-md` 輸入框、`--color-primary-600` 主按鈕），下方小字連結「改用 PIN 快速登入」（若本機有記住帳號才顯示，展開 `<AccountSwitcherList>` + `<NumericKeypad mode="pin">` 於同一卡片內，非跳轉頁面）。

**對應表**：同一 `<LoginView>` 元件，`useBreakpoint('md')` 只決定**預設顯示哪個子畫面**（帳號選擇器 vs 密碼表單），兩種畫面本身都是同一元件庫，符合 FE-063 精神（此處因涉及「預設顯示哪一個」而非單純樣式，屬 FE-063 例外允許的 `useBreakpoint` JS 判斷情境，而非另建路由）。

### 9.2 Dashboard `/dashboard`

**桌機版 wireframe**

```
┌─ Sidebar ─┬───────────────────────────────────────────────┐
│  Logo     │ 總覽                    [月▾ 2026-09] [＋新增]  │
│  首頁      ├───────────────────────────────────────────────┤
│  交易      │ ┌──月收入──┐┌──月支出──┐┌──結餘──┐┌預算結餘┐│
│  週期性    │ │ NT$45,000││NT$28,000 ││+17,000 ││ 3,200  ││
│  預算      │ └──────────┘└──────────┘└────────┘└────────┘│
│  資產      ├───────────────────────────┬───────────────────┤
│  ──────   │ 支出分類         [🥧|▤|📈] │ 帳戶總覽            │
│  分類      │  ╭─────────╮              │ 🟣現金  NT$12,000  │
│  帳戶      │  │  🥧 圓餅  │              │ 🔵銀行  NT$61,000  │
│  ──────   │  ╰─────────╯              │  → 查看全部/管理    │
│  設定      │  圖例：餐飲/交通/娛樂…       │                    │
│  登出      ├───────────────────────────┴───────────────────┤
│           │ 最近交易                            [查看全部→] │
│           │  09/03 餐飲  -NT$120  現金                       │
│           │  09/02 薪資  +NT$45,000 銀行                     │
└───────────┴───────────────────────────────────────────────┘
```

**行動版 wireframe**

```
┌─────────────────────────┐
│ 總覽        [月 2026-09▾]│
├─────────────────────────┤
│ ┌───────────────────┐   │
│ │ 結餘   +NT$17,000  │   │ ← Hero StatTile（單卡，最大字級）
│ └───────────────────┘   │
│ ┌─────────┐┌─────────┐  │
│ │月收入    ││月支出    │  │
│ │45,000   ││28,000   │  │
│ └─────────┘└─────────┘  │
│ ┌───────────────────┐   │
│ │ 預算結餘 3,200      │   │
│ └───────────────────┘   │
│ [🥧 圓餅|▤ 長條|📈 折線]  │ ← ChartTypeSwitcher
│ ╭─────────────────╮     │
│ │      🥧            │     │
│ ╰─────────────────╯     │
│ 帳戶總覽 →                │
│ 最近交易 →                │
├─────────────────────────┤
│ 首頁 交易 (+) 預算 更多    │ ← BottomNav
└─────────────────────────┘
```

**RWD 對應**：卡片區塊桌機 `grid-cols-4`、行動端垂直堆疊且「結餘」單獨拉大成 Hero（行動端螢幕窄，四卡並排會過度壓縮字級，改用資訊優先序：結餘 > 收入/支出 > 預算結餘）；圖表與帳戶總覽桌機並排兩欄、行動端上下堆疊。期間選擇器桌機常駐於 Header、行動端收進標題列右側下拉。**預算結餘卡片**在期間 = 年 / 自訂範圍時（`→ A7`）改顯示灰階卡 + 文字「預算僅支援月度檢視」，不強行估算數字。

**資料源（已決議，`→ A14`）**：月收入／月支出／結餘／預算結餘四張卡片與期間切換（月/年/自訂範圍）**改吃新增的 `GET /dashboard/summary` 彙總 API**（完整規格見 §12.1），取代前端逐頁分頁抓交易再加總的方案；帳戶總覽卡片沿用既有帳戶清單 API，最近交易摘要沿用既有 `GET /transactions?limit=5` 分頁清單。

### 9.3 交易清單 `/transactions`

- 桌機：表格式（日期／分類／明細／金額／收支類型／帳戶／操作），列 hover 顯示編輯/刪除 icon，頂部篩選列（期間/分類/帳戶/類型，橫向排列）。
- 行動端：卡片堆疊，一筆一卡（日期+分類在上、金額右側大字依收支類型上色、明細/帳戶小字在下），篩選收進「篩選」按鈕開 `<Dialog>`（BottomSheet 樣式）。
- 兩者共用 `<TransactionFormDialog>` 做編輯（點列開表單，預填既有值）、`<ConfirmDialog>` 做刪除。

### 9.4 新增/編輯交易（`<TransactionFormDialog>`）

行動端 BottomSheet（詳細欄位見 §7）：

```
┌─────────────────────────┐
│ ───（拖曳把手）───         │
│ 新增交易              ✕  │
├─────────────────────────┤
│ [●支出 ○收入]            │
│ 日期：2026-09-04         │
│ 金額：NT$ ____            │
│  → 點擊喚起 <NumericKeypad mode="amount"> │
│ ▾ 更多欄位（分類/明細/帳戶/支付方式）│
│ ☐ 固定收支                │
│ ┌───────────────────┐   │
│ │      儲存            │   │
│ └───────────────────┘   │
└─────────────────────────┘
```

桌機 Dialog：同欄位單欄排列、置中卡（`max-w-md`），「更多欄位」預設展開（桌機空間充足，不強迫多一次點擊）。

### 9.5 週期性交易 `/recurring`、預算 `/budgets`、資產 `/assets`

沿用 v1.0.0 既有資料與互動邏輯，本版只做「視覺重新套用」：卡片改用 `<CurvedCard>`、按鈕改用新 `cva` variant、金額語意色套用 §2.3、預算進度條改用 §2.3 定義的 meter 樣式（track = 該狀態色的淡階、fill = 該狀態色，icon+文字並行，不單靠顏色）。不重新設計版面結構，因 v1.0.0 既有 IA 在這三頁已符合需求，不需要動。

### 9.6 帳戶管理 `/accounts`（新頁，漸進揭露入口）

Dashboard「帳戶總覽」卡片預設只顯示現金/銀行加總與「管理帳戶 →」連結（不強迫每個使用者都進到管理頁，呼應需求 4「非強迫」）。進入 `/accounts` 才看到完整清單 + 新增/改名/刪除：

```
桌機：卡片橫向 grid（每卡：色票色塊/圖示 + 帳戶名 + 餘額 + 改名/改色改圖示/刪除）+ 右上「＋新增帳戶」
行動：卡片直向堆疊 + 底部常駐「＋新增帳戶」全寬按鈕
```

新增/編輯帳戶表單（`→ A8`，欄位設計見 §12.4）：名稱文字輸入 + 色票選擇器（§2.3 圖表 8 色 + 自訂 hex）+ 圖示選擇器（固定圖示集）；新增帳戶時若未手動選色，前端預帶下一個尚未被目前帳戶清單使用的色票（避免同一使用者的帳戶卡片撞色，非強制規則，使用者仍可自行改選）。

刪除保護：只剩 1 個帳戶時刪除按鈕 disabled，顯示 tooltip/文字「至少需保留一個帳戶」（`→ A4`）。

### 9.7 設定 `/settings`（新頁）

- 個人資料（email，唯讀顯示）
- PIN 設定／變更：未設定時顯示「設定 PIN」按鈕 → 輸入目前密碼重新驗證身份後，開 `<NumericKeypad mode="pin">` 兩次輸入確認（呼叫 `POST /auth/pin`）；已設定時顯示「變更 PIN」（需先驗證舊 PIN，呼叫 `PATCH /auth/pin`）與「停用 PIN 快速登入」（需輸入目前密碼重新驗證，呼叫 `DELETE /auth/pin`）。完整 API 規格、鎖定策略見 §12.2。
- 外觀：淺色／深色／跟隨系統 三態切換（`→ §2.7`），與 Sidebar/更多選單的切換入口同步同一個偏好值。
- 預設記帳帳戶：Select，寫入 localStorage（`→ A11` 同機制）
- 登出

---

## 10. 建議新增套件清單

| 套件 | 用途 | 理由 |
| --- | --- | --- |
| `recharts` | 圓餅/長條/折線圖切換器 | React 原生元件組合、SVG（可用 CSS variable 套色票，深/淺色與 pastel 主題容易對齊）、bundle 適中（~90KB gzip 含相依）、`type="monotone"` 內建平滑曲線滿足「波浪折線」需求，社群成熟、與 Next.js/RTK 生態相容性佳。曾比較 `Chart.js`（canvas-based，難以用 CSS var 做漸層/主題切換，a11y 較弱）與 `ECharts`（功能強但 ~300KB+，對僅 3 種簡單圖表過重）與 `visx`（d3 原生、彈性最高但需自行組出 pie/bar/line + a11y，開發成本高）——recharts 是「三選一切換器」這種標準需求的最佳成本/彈性平衡。 |
| `d3-shape` | 純裝飾波浪（`<WaveDivider>`）曲線生成 | 只取用 curve interpolator（`curveNatural`/`curveBasis`），~5KB，不需整個 d3；recharts 本身依賴它，不算重複引入。 |
| `react-hook-form` | 新增/編輯交易表單狀態管理 | 未受控輸入效能佳（適合行動端 + 自訂數字鍵盤這種需要精準控制 focus/value 的場景），`Controller` 可包住 `<NumericKeypad>` 這類非原生 input 互動元件。 |
| `zod` + `@hookform/resolvers` | 表單驗證 schema | 與 FE-048「表單驗證走 `<Form>` + zod schema，schema 與 API 型別同源」規則直接對齊；金額 > 0、必填三欄位等規則集中定義。 |
| `class-variance-authority`（cva） | 按鈕/badge/chip variant | **FE-052 已強制要求**，但目前 `package.json` 尚未安裝，本版必須補上（不論是否做視覺升級都該補，屬既有規則債）。 |
| `@radix-ui/react-dialog` | `<Dialog>` 基礎（focus trap / ESC / portal） | 滿足 FE-048「Dialog/Modal 一律走共用元件」的可及性要求，桌機置中 Dialog 與行動端 BottomSheet 共用同一組 primitive、只差外觀 class，避免重造 focus-trap 邏輯。 |
| `framer-motion`（`motion` package） | 卡片互動、BottomSheet 滑入、圖表切換過場 | 彈簧物理曲線動畫（呼應「流暢曲線動畫」需求）用 CSS transition 手刻成本高且不易保持一致彈性感；提供 `useReducedMotion` 整合點。取捨：多一個依賴（~50KB gzip），已用 `useReducedMotion` hook 統一節流影響範圍。 |

> 上列套件屬於「建議」，實際安裝與版本鎖定（`→ CORE-022` / `rules/00-core/01-versions.md`）留待 `/propose-to-tasks` 拆解時定案。

---

## 11. 與 v1.0.0 既有頁面的關係

| v1.0.0 既有 | v1.1.0 處理方式 |
| --- | --- |
| `/login`, `/register` | 保留路由與 API，**重做視覺** + `/login` 加 PIN 分支（`→ A1`） |
| `/transactions`, `TransactionForm`, `TransactionList` | 保留 API，**重做視覺 + 表單改為 Dialog/Sheet + 必填欄位精簡**（`→ §7`） |
| `/recurring` | 保留頁面與 API，**重做視覺**，新增交易表單成為第二個建立入口（`→ A13`） |
| `/budgets` | 保留 API，**重做視覺**（進度條套 §2.3 meter 樣式） |
| `/assets`, `/dashboard`（現有 `useGetNetWorthQuery`） | `/assets` 保留 API 重做視覺；`/dashboard` **版面重新設計**（現有版本只有淨資產三卡，本版擴充為期間/圖表/帳戶總覽/最近交易，資料源沿用既有帳戶/交易清單 API + 新增 `GET /dashboard/summary` 彙總 API，見 §12.1） |
| （無）`/accounts`、`/categories`、`/settings` | **新增前端頁面**，沿用既有 Account/Category CRUD API（皆已存在，只是 v1.0.0 沒有獨立前端頁） |

---

## 12. 後端最小新增 API 規格（v1.1.0）

> 本節四個子項（Dashboard 彙總、PIN 登入、recurring_rules 週期擴充、分類/帳戶顏色圖示）原本是上一版草稿的開放問題 Q2/Q3/Q4/Q7（訂閱分類 Q6 已併入 §8），使用者已全數決議「都做」，故本版 In Scope 正式包含這些後端最小新增（`→ propose-v1.1.0.md` In Scope / 對外承諾）。每小節皆已核對現有 backend 程式碼（router 命名慣例、model 欄位、錯誤處理模式），細節足以直接供 `/propose-to-tasks` 拆分後端 task；實際型別/命名/測試以拆 task 時的後端工程判斷為準。

### 12.1 Dashboard 期間彙總 API（`→ A7` `→ A14`）

**路由與命名**：比照現有 `net-worth`（`backend/app/api/v1/net_worth.py`）——一個「純彙總、無 CRUD」的獨立頂層資源，新增 `backend/app/api/v1/dashboard.py`：

```
router = APIRouter(prefix="/dashboard")
GET /api/v1/dashboard/summary
```

不掛在 `/transactions` 下：`/transactions` 是集合 CRUD 資源，語意上不適合承載「使用者全體交易的期間彙總」；也不比照 `budgets` 的 `/{budget_uid}/summary`（那是單筆資源的彙總，非全體）。在 `backend/app/api/v1/__init__.py` 的 `router.include_router(...)` 清單中加入 `dashboard.router`（`tags=["dashboard"]`），比照既有 9 個 router 的登記方式。

**Request（query）**：`DashboardSummaryFilter(ApiInput)`
| 參數 | 型別 | 必填 | 說明 |
| --- | --- | --- | --- |
| `period` | `Literal["month","year","custom"]` | ✅ | 供後端判斷 `budget_remaining` 是否計算，**不**用來反推日期範圍 |
| `date_from` | `datetime` | ✅ | 沿用 `TransactionListFilter.date_from` 既有慣例（`→ A14`），前端已轉換為 API_TZ 對應 UTC 邊界 |
| `date_to` | `datetime` | ✅ | 同上；`field_validator` 驗證 `date_to >= date_from`，否則走既有 `RequestValidationError` 全域 handler 回 422 |

**Response**：`ApiResponse[DashboardSummaryResponse]`
| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `period` | `str` | 原樣回傳請求的 `period` |
| `date_from` / `date_to` | `datetime` | 原樣回傳，供前端對帳 |
| `income` | `Decimal` | 期間內 `transaction_type=income` 加總 |
| `expense` | `Decimal` | 期間內 `transaction_type=expense` 加總 |
| `balance` | `Decimal` | `income - expense` |
| `budget_remaining` | `Decimal \| None` | `period != "month"` 時一律 `null`（`→ A7`，對齊 `Budget.period_type=monthly` 的限制）；`period == "month"` 時 = Σ(該使用者所有 `period_type=monthly` 預算的 `limit_amount - 該分類同期間已花費`)；使用者未設定任何月度預算時回傳 `0.00`（**非** `null`，用 `null`/`0` 區分「不適用」與「有查、目前是 0」） |

**實作方向**（供拆 task 參考，非最終程式碼）：新增 `DashboardService`（建構子吃 `TransactionRepository` + `BudgetRepository`），`income`/`expense` 用一次 SQL `GROUP BY transaction_type` 加總（避免抓全部交易到 app 層再加總，效能優於前端方案）；`budget_remaining` 沿用 `BudgetService.get_summary`（`backend/app/services/budget_service.py`）已有的「同分類同期間花費」計算邏輯，對使用者所有月度預算做迴圈加總。認證比照既有 router 一律 `Depends(get_current_user)`（`→ BE-023`）。

### 12.2 PIN 登入後端支援（`→ A1` `→ A2` `→ A3` `→ A15`）

**Model 變更**：`UserCredential`（`backend/app/models/user.py`）新增 4 欄：

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `pin_hash` | `str \| None`（`String(255)`, nullable） | bcrypt hash（`→ 沿用 app.core.security.pwd_context`，與密碼同一套 `CryptContext(schemes=["bcrypt"])`，不另建 hash 機制），`None` = 未設定 PIN |
| `pin_updated_at` | `datetime \| None`（`DateTime(timezone=True)`, nullable） | 比照 `password_updated_at` 慣例 |
| `pin_failed_attempts` | `int`（not null, `server_default="0"`） | 連續失敗次數，成功登入時歸零 |
| `pin_locked_until` | `datetime \| None`（`DateTime(timezone=True)`, nullable） | 鎖定解除時間，`None` = 未鎖定 |

新增 alembic migration（如 `add_pin_to_user_credentials.py`），單純 `ALTER TABLE user_credentials ADD COLUMN ...`，不影響既有列（新欄位皆 nullable 或有 default）。

**PIN 格式**：6 碼數字（`→ A2`），後端驗證 `^\d{6}$`（正則失敗回既有 422 驗證錯誤）。

**Endpoints**（掛在既有 `backend/app/api/v1/auth.py` 的 `router = APIRouter(prefix="/auth")` 下，比照 `/auth/register` `/auth/login` `/auth/me` 既有命名風格）：

| Method + Path | 認證 | Request | 說明 |
| --- | --- | --- | --- |
| `POST /auth/pin` | 需登入 | `{ pin: str, password: str }` | 首次設定 PIN；用目前密碼重新驗證身份（避免已登入裝置被盜用時任意加開 PIN 後門）。已設定過 PIN 則回 `409 ConflictError`「PIN 已設定，請使用變更 PIN」 |
| `PATCH /auth/pin` | 需登入 | `{ current_pin: str, new_pin: str }` | 變更 PIN；`current_pin` 錯誤回 `401` 並計入下方鎖定機制 |
| `DELETE /auth/pin` | 需登入 | `{ password: str }` | 停用 PIN 快速登入；密碼重新驗證後 `pin_hash=None` |
| `POST /auth/login/pin` | 不需登入 | `{ user_uid: UUID, pin: str }` | PIN 快速登入；成功比照 `/auth/login` 回傳 `UserResponse` + 設定既有 httpOnly cookie（`→ FE-035` 不變） |

**鎖定機制**（`→ A15`，僅套用於 `POST /auth/login/pin` 與 `PATCH /auth/pin` 的 `current_pin` 驗證）：連續失敗 **5** 次鎖定 **15 分鐘**（`pin_locked_until = now + 15min`）；鎖定期間內請求一律回 `429`「PIN 已鎖定，請改用密碼登入或稍後再試」，**不**再比對 PIN 本身；成功驗證時 `pin_failed_attempts=0`、`pin_locked_until=None`。PIN 錯誤（非鎖定狀態）回 `401`「PIN 錯誤」並遞增 `pin_failed_attempts`。

**前端 autofill 對應**（`→ §5.2`/`§5.3` 已決議支援瀏覽器密碼管理員 autofill，2026-09-04）：呼叫 `POST /auth/login/pin` 的表單，底層 `<input>` 用 `autoComplete="current-password"`；呼叫 `POST /auth/pin` / `PATCH /auth/pin` 的表單用 `autoComplete="new-password"`。後端 API 本身**不**因此改變（autofill 純屬前端 input 屬性層級的行為，不影響 request/response 格式或驗證邏輯）。

**前端配合**：`useDeviceAccounts` / `<AccountSwitcherList>`（`→ A3`）記住的清單需新增 `user_uid` 欄位（原設計只存遮罩 email + 顯示名稱 + 頭像色，現需補上 `user_uid` 供 `POST /auth/login/pin` 使用；仍不存 PIN 或密碼本身，非機密展示資料的結論不變）；`DELETE /auth/pin` 成功後前端同步清除本機該帳號的「快速登入」旗標。

### 12.3 recurring_rules 週期擴充（`→ A6` `→ A16`）

**現況**（已核對 `backend/app/models/recurring_rule.py`）：`RecurringRule` 只有 `day_of_month: int`（`CheckConstraint(day_of_month BETWEEN 1 AND 31)`），服務層（`recurring_service`）依此比對「每月第 N 天」，超過當月天數夾到月底。

**新增欄位**：
| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `interval_unit` | `Enum(week/month/year)`（StrEnum，比照 `BudgetPeriodType`/`TransactionType` 既有 `native_enum=False` + `values_callable` 寫法） | not null，新規則預設 `month` |
| `interval_count` | `int` | not null，`CheckConstraint(interval_count BETWEEN 1 AND 99)`（`→ A16`），預設 1 |
| `anchor_date` | `Date` | not null，取代「星期幾 / 月中第幾天 / 月份+日」三種語意各自建欄位的作法：下一次執行日由服務層依 `anchor_date` 起，每 `interval_count` 個 `interval_unit` 累加一次算出（`→ §7.2` 已列計算規則）|

**既有欄位相容策略（不做破壞性刪除）**：`day_of_month` **欄位保留**，型別由 not null 放寬為 **nullable**（只放寬約束、不刪欄位，維持與 DB-033「禁 DROP COLUMN」的保守精神一致，即使技術上這不是被禁止的操作）。Migration 執行順序：
1. `ADD COLUMN interval_unit ... NOT NULL DEFAULT 'month'`
2. `ADD COLUMN interval_count ... NOT NULL DEFAULT 1`
3. `ADD COLUMN anchor_date DATE`（先允許 NULL 供回填）
4. **資料回填**：對既有規則，`anchor_date` = 由該規則 `created_at` 所在月份 + `day_of_month` 反推出的實際日期（若當月該日已過，往下個月推一天）；`interval_unit='month'`、`interval_count=1` 維持既有行為 100% 不變
5. `ALTER COLUMN anchor_date SET NOT NULL`
6. `ALTER COLUMN day_of_month DROP NOT NULL`

服務層（`recurring_service`）改用 `anchor_date` + `interval_unit` + `interval_count` 計算下一次執行日（`interval_unit=month` 且該月天數不足時，沿用「夾到月底」既有規則，只是「日」的值改由 `anchor_date` 的日部分提供，不再讀 `day_of_month`）。UI 對應規格見 §7.2。

### 12.4 分類 / 帳戶顏色與圖示欄位（`→ A8`）

**Model 變更**：`Category`（`backend/app/models/category.py`）與 `Account`（`backend/app/models/account.py`）**各自**新增：

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `color` | `String(7)`，not null | hex 色碼（含 `#`），後端驗證 `^#[0-9A-Fa-f]{6}$` |
| `icon` | `String(50)`，not null | 圖示 key；後端只驗證非空、長度上限，**不**做 enum 檢查（比照 `payment_method` 自由字串的既有先例 `→ A9`），實際合法圖示清單由前端圖示選擇器維護的固定集合負責，避免前後端各自維護一份清單造成不同步 |

**Migration**：`ALTER TABLE categories/accounts ADD COLUMN color ... NOT NULL DEFAULT '...'` + `ADD COLUMN icon ... NOT NULL DEFAULT '...'`，並對既有列做資料回填（migration 內的資料腳本複製「依名稱做確定性雜湊挑色」的既有前端邏輯，讓既有分類/帳戶第一次看到新版視覺時顏色不會無預警跳動；使用者之後可隨時自行改色/改圖示）。

**Schema 變更**：`CategoryCreateRequest` / `CategoryUpdateRequest`（`backend/app/schemas/category.py`）與 `AccountCreateRequest` / `AccountUpdateRequest`（`backend/app/schemas/account.py`）新增 `color: str` / `icon: str` 欄位（`CategoryUpdateRequest`/`AccountUpdateRequest` 皆為 optional，比照現有 `name`/`balance` 的 partial-update 寫法）；對應 `CategoryResponse` / `AccountResponse` 新增回傳這兩個欄位。前端表單呈現（色票選擇器 + 圖示選擇器）見 §8（分類）/ §9.6（帳戶）。

---

## 13. 開放問題（待使用者決議）

**本版所有開放問題皆已決議。**（Q2/Q3/Q4/Q6/Q7 於首輪決議「都做」，內容併入 §12 後端 API / §2.7 Dark mode / §8 訂閱分類；Q1/Q2 於 2026-09-04 決議，內容併入 §1 `[A5]`（維持空字串/預設分類方案，不做後端 `NULL` migration）與 §5.1–§5.4 / §12.2（PIN 改為可見輸入框以支援瀏覽器密碼管理員 autofill，`autoComplete` 依登入/設定情境分別用 `current-password`/`new-password`）。本節保留為歷史紀錄，不再有待決議項目，`/propose-to-tasks` 可直接依 §1–§12 規格拆分任務。

---

## 14. 參照

- `docs/Tasks/v1.0.0/propose-v1.0.0.md` / `tasks-v1.0.0.md`（v1.0.0 範圍與已完成項目）
- `HARNESS_HOME/rules/10-frontend/00-overview.md` / `05-components.md` / `06-rwd.md` / `03-env-and-auth.md`
- `backend/app/models/{category,account,transaction,recurring_rule,budget,user}.py`（本文件所有「後端現況」陳述的核對來源）
- `backend/app/api/v1/{auth,transactions,budgets,net_worth}.py`（§12 API 路由命名慣例、認證/錯誤處理模式的核對來源）
- `backend/app/core/security.py`（PIN hash 沿用的既有 `pwd_context` / bcrypt 設定）
- `backend/alembic/versions/2026_09_04_0900-add_categories.py`（種子分類 trigger 既有 pattern，§8「訂閱」分類 migration 沿用同一寫法）
- `dataviz` skill（`references/color-formula.md` / `palette.md` / `marks-and-anatomy.md`）— 圖表色彩驗證方法（Light 已用；Dark 色票見 §2.3.1，實作階段複驗）
