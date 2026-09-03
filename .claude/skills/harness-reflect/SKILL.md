---
name: harness-reflect
description: 讀全版本 `docs/Tasks/v*/fixed.md`，依 `rule:` 欄機械統計 + pattern 分析，產候選升規報告 `docs/Tasks/reflect/reflect-report-{YYMMDDHHMMSS}.md`（強化 / 新增 / 修正 / 棄用）。只產候選，不改規則；可用 schedule 月度觸發，無實質候選時輸出以 `[SILENT]` 開頭。當使用者說「reflect / 反思 / 升規 / 找 pattern / 月度檢視 / 這些 bug 該不該變規則」時觸發。不適用：沒有任何 fixed.md、想直接改 `rules/`（走 PR）、想掃描程式碼（用 /harness-scan）。
---

# harness-reflect

從全版本 `fixed.md` 找 pattern，**產候選清單**（不直接改規則）。只跑三段式的**反思段**；升級段由使用者在 PR 上決議（流程 → `rules/00-core/11-rule-evolution.md`）。

本檔是 reflect 流程的**唯一來源**：Claude Code 以 skill 載入；其他工具直讀本檔（見 `skills/README.md § 跨工具入口`）。

## 參數

| 名稱 | 型別 | 預設 | 說明 |
| --- | --- | --- | --- |
| `trigger` | `monthly \| version-end \| manual` | `manual` | `monthly` 且無候選 → 報告首行與回覆首行 `[SILENT]` |

## 不適用

- 沒任何 `fixed.md`（沒素材可分析）
- 距上次 reflect-report < 1 個月 + 沒新版本結束（噪音 > 訊號）
- 修現有規則 / 棄用規則 → 直接開 PR 決議，不必再過 reflect
- 想直接改 `rules/*` → 那是升級段，本 skill 只跑反思段

## 身分與風格

Reflective rule analyst。讀過去違規 / bug → 機械統計 + 系統性 pattern → 產候選升規 → 使用者在 PR 上逐條決議。**禁**直接動 `rules/*`。證據為本、寧空勿湊、可追溯：每候選必鏈到 ≥ 1 條 fixed.md；**禁**無據憑空提案 / 個人偏好 / 框架等效寫法。語言 `→ CORE-004`。

---

## 心法

1. **只反思、不升規**：只產候選；升級段 = 使用者批准後開 task → PR
2. **先機械、後判斷**：先用 `rule:` 欄數次數（客觀），再做根因 pattern 分析（主觀）；兩者分開呈現
3. **pattern ≠ 個案**：單一條目不算 pattern；判準見〈pattern 偵測〉
4. **寧空勿湊**：沒 pattern 就回報「無候選」+ 列已巡視之判準，**禁**為交差硬湊
5. **落腳檔具體**：每候選明寫對應 `rules/<area>/<file>.md § <段>` 與建議的規則 ID（新增 → 該 area 下一個連號；強化 / 修正 → 既有 ID），路徑須真實存在（新檔須註明「新增」）
6. **不破壞 backward-compat**：新規則只規範**該 commit 之後**的 code（→ `rules/00-core/11-rule-evolution.md`）
7. **新增規則優先合進既有檔**：獨立主題才獨立檔；< 10 行的檔不准存在
8. **禁**動 `rules/*` / `propose-*.md` / `fixed.md`

## 定位 harness

解析 `HARNESS_HOME`：`<cwd>/.claude/harness.local.json` 的 `harness_home` → env `HARNESS_HOME` → `<cwd>/harness/` → `<cwd>/../Harness-Engineering/` → `<cwd>/../harness/`（同 `AGENTS.md § Harness` / `harness-init § 1`）；找不到 → 中止並提示先跑 `/harness-init`。以下 `rules/…` 皆以 `<harness>` 為根。

## 前置讀取

1. `docs/Tasks/v*/fixed.md`（**全版本** — 素材；條目格式 `## §{N} — 標題` + `- **rule**: <ID>` 欄 → `rules/00-core/10-propose-tasks-fixed.md`）
2. `docs/Tasks/reflect/reflect-report-*.md`（歷史報告 — 找已決議候選，避免重複；只讀最新兩份，不預載全部）
3. `rules/00-core/10-propose-tasks-fixed.md`（fixed 欄位定義）與 `11-rule-evolution.md`（三段式定義 / reflect-report 格式 / 升級規則 / 變更紀錄行格式）
4. `AGENTS.md § Just-in-time Loading` + 各 area `rules/*/00-overview.md` 的 `rules:` frontmatter（規範地圖 — 候選落腳檔與 ID 連號從這裡查）

素材為空（無任何 fixed.md 或全部只有模板註解）→ 直接進〈執行〉步驟 5 輸出 `[SILENT]`。

---

## pattern 偵測

### 第一層：機械統計（`rule:` 欄）

對全版本 `fixed.md` 每段 `## §N` 抓 `- **rule**:` 值，輸出表：

| rule ID | 次數 | 出現版本 | 條目（`vX.Y.Z §N`） |
| --- | --- | --- | --- |

- 同一 `rule:` **≥ 3 次** → 自動列為「強化」候選（規則太弱 / 太抽象 / 沒 lint 或 hook 強制）
- `rule:` 為 `NONE` / `N/A` / 空 → 進第二層找「新增」候選
- `rule:` 指向不存在的 ID（`rules/` 中無 `- **ID**` 定義）→ 列「規範自身問題」，不算候選

### 第二層：pattern 分析（`根因` / `問題` 欄）

| 判準 | 候選類型 | 觸發條件 |
| --- | --- | --- |
| 同一 rule 違反 ≥ 3 次（第一層） | **強化** | 規則太弱 / 太抽象 / 未被 hook / lint / CI 機械強制 |
| 同類根因跨 ≥ 2 版本 + `rule:` 無對應 | **新增** | 沒對應規則 |
| fixed.md 標「規範矛盾」或同一事兩檔說法不同 | **修正** | 跨檔規則衝突 / 重複定義 |
| 規則 ≥ 6 個月無違反且已被 lint / hook / CI 吃掉 | **棄用** | 多餘（保留 ID 不重用，檔內標 deprecated） |

每候選**必鏈**到 fixed.md 條目（`vX.Y.Z §N`，列全），pattern 來源透明可追溯。

去噪規則：

- typo / 空白格式 / 個別失誤 → 不算 pattern
- 已決議候選（歷史報告 ✅ / ❌）**不重列**；🕐 暫緩條目重評

---

## 執行

1. **機械統計**：掃全版本 `fixed.md`，依 `rule:` 欄產第一層表（含次數 / 版本 / 條目）
2. **pattern 分析**：依 `根因` 欄分組找系統性原因；依 `時間` 欄（ISO 8601）判最近 6 個月無違反的規則
   - **sub-agent（可選）**：`fixed.md` 條目 > 50 或跨版本 > 5 → 按 area（core / fe / be / db / cache / cicd）派唯讀 `Explore` sub-agent 各自分組（同規則計數 / 同類根因 / ≥ 6 個月無違反），回傳「pattern 候選 + 來源條目清單」，主 agent 彙整；sub-agent prompt 必含〈pattern 偵測〉表原文、去噪規則、回傳格式，明示唯讀。否則主 agent 直掃；Claude Code 可並行即並行
3. **套判準**（上表四條）產候選草稿；比對歷史報告：已決議不重列、🕐 重評
4. **每候選找落腳檔 + ID**（從各 area `00-overview.md` frontmatter `rules:` 與 `AGENTS.md § Just-in-time Loading` 挑；新增 → 優先合進既有檔，ID 取該 area 下一個連號）並寫**影響評估**：既有 code 是否合規（grandfather）/ 是否破壞 backward / 需補哪些檔 / 是否應加 hook / lint / CI 機械強制 / 同步改哪 checklist（`rules/00-core/21-checklists.md`）。單人專案 `driver` 欄填 `owner`
5. **寫報告 / `[SILENT]`**（格式見〈產出〉）：
   - 有候選 → 寫報告
   - 無候選 → **仍寫報告**（「無候選」+ 已巡視之四條判準與素材範圍），且對話回覆與 schedule 輸出**第一行**為 `[SILENT] 無升規候選（素材：N 條 fixed 條目 / M 版本）`
   - 素材為空 → 不寫報告，只回 `[SILENT] 無 fixed.md 素材`
6. **回報**：`N 個候選（強化 a / 新增 b / 修正 c / 棄用 d）`、報告路徑、下一步：在 PR 逐條 ✅ 採納開 task / ❌ 拒絕記原因 / 🕐 暫緩

## 排程

月度：`/schedule` 建立 cron（例：每月 1 日 09:00 Asia/Taipei）執行 `/harness-reflect`，`trigger=monthly`。版本結束時手動 `trigger=version-end`。距上次報告 < 1 個月且無新版本結束 → 直接 `[SILENT]`（噪音 > 訊號）。

---

## 產出

`docs/Tasks/reflect/reflect-report-{YYMMDDHHMMSS}.md`（12 位：年末兩碼 + 月日時分秒，`Asia/Taipei`，由 Node / PowerShell 取時間不手算；每次新檔不覆寫）。

報告章節順序：

0. **標題行**：`trigger: monthly` 且無候選 → 檔案第一行與回應摘要皆以 `[SILENT]` 開頭
1. **統計表**（第一層機械統計，全 rule 列出，含 0 候選也要列）
2. **候選**（每候選格式如下）
3. **規範自身問題**（`rule:` 指向不存在 ID / 重複定義 / 矛盾）
4. **已巡視判準**（無候選時必列，證明跑過）

```markdown
## 候選 N — <規則名 / 主題>

- **類型**：強化 / 新增 / 修正 / 棄用
- **來源**：fixed.md `vX.Y.Z §N`、`vM.K.L §L`…（列全）
- **pattern**：<為什麼成 pattern；次數 / 跨版本 / 同類根因>
- **建議**：<具體規則文字 + 落腳檔 `rules/<area>/<file>.md § <段>` + 規則 ID（既有 / 新連號）>
- **影響**：<既有 code 是否合規 / 是否破壞 backward / 需補哪些檔 / 是否加 hook / lint / CI / 同步改哪 checklist>
- **driver**：<單人專案填「owner」；決議在 PR 上進行>
```

### 升規流程（單人專案）

1. 依候選開 PR 改 `rules/<area>/<file>.md`；PR gate = CI 必綠 + `/harness-scan` 獨立評分 + self-approve
2. 該規範檔頭（frontmatter 之後、H1 之前）加一行變更紀錄：`> 變更 {YYYY-MM-DD}：<ID> <強化/新增/修正/棄用>，來源 reflect-report-{YYMMDDHHMMSS} 候選 N`
3. 決議記回本報告：候選標 ✅ 採納（附 PR）/ ❌ 拒絕（附原因）/ 🕐 暫緩（下次重評）

---

## Acceptance（必跑，任一失敗不報告完成）

1. 報告檔寫入 `docs/Tasks/reflect/reflect-report-{YYMMDDHHMMSS}.md`（12 位 `Asia/Taipei` 時戳）
2. 報告含第一層統計表，且表中每個 rule ID 的次數 = 全版本 `fixed.md` 中該 `rule:` 出現次數（可用 `grep -c` 覆核）
3. 每候選含全 6 欄（類型 / 來源 / pattern / 建議 / 影響 / driver），**禁**遺漏
4. 每候選 `來源` 鏈到 ≥ 1 條 fixed.md（`vX.Y.Z §N` 格式），**禁**空 / 模糊「過去常發生」
5. 每候選 `建議` 含**具體落腳檔 + 段落 + 規則 ID**；路徑須真實存在（新檔須註明「新增 `rules/<area>/<file>.md`」且理由不是純轉指）
6. 已決議候選（歷史報告 ✅ / ❌）**不重列**；🕐 暫緩條目重評
7. `trigger: monthly` 且無候選 → 檔案首行以 `[SILENT]` 開頭；無候選時報告仍存在且回覆首行為 `[SILENT]`（素材為空除外）
8. **禁**：動 `rules/*` / `propose-v*.md` / `fixed.md` / 任何 git 操作；`git status --porcelain` 只多出這一個檔；`git -C <harness> status --porcelain` 為空
9. 無候選 → 報告寫「無候選」+ 列已巡視之判準

---

## 自我約束

- **不直接升規**：只產候選報告；改 `rules/*` 走 PR
- **不無據提案**：每候選必鏈 fixed.md；沒素材就回「無候選」
- **不擴張範圍**：候選**僅**從 fixed.md 反推；個人偏好 / 框架等效寫法 / 重構建議**不列**
- **不破壞 backward-compat**：新規則建議必含「既有 code 處理方式」（grandfather / 補洞 task）
- **不省略影響評估**：每候選必寫「需補哪些檔 / 是否加機械強制 / 同步改哪 checklist」
- 只寫一個報告檔；**禁**改其他檔；**禁** git 寫入操作；排程觸發無候選時回應以 `[SILENT]` 開頭
