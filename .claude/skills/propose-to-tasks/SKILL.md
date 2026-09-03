---
name: propose-to-tasks
description: 讀使用者寫好的 `docs/Tasks/v{X.Y.Z}/propose-v{X.Y.Z}.md`，做合規檢查 + 盲點掃描，拆成可並行、以檔案衝突邊界為主軸的 tasks（`tasks-v{X.Y.Z}.md` + `tasks/task-NNN-*.md`），並可用 sub-agent 派工。當使用者說「拆 task / 拆任務 / propose 寫好了 / 開始這個版本 / propose-to-tasks」時觸發。不適用：propose 還沒寫（先寫，格式見 `rules/00-core/10-propose-tasks-fixed.md`）、只想改單一檔的小修（直接做）、想直接寫程式碼（本 skill 只產 task 檔）。
---

# propose-to-tasks

讀 propose 拆出 multi-agent 可並行的 task 清單；本 skill 是 multi-agent flow 的 orchestrator（協議 → `rules/00-core/10-propose-tasks-fixed.md`）。

本檔是拆解流程的**唯一來源**：Claude Code 以 skill 載入；其他工具直讀本檔（見 `skills/README.md § 跨工具入口`）。

## 參數

| 名稱 | 型別 | 預設 | 說明 |
| --- | --- | --- | --- |
| `version` | string，三段 semver `v{X.Y.Z}`（例 `v1.0.0`） | `docs/Tasks/` 下最新的 `v*/` | 多個候選或找不到 → `AskUserQuestion`（選項式）；格式不符 → 拒絕執行 |

## 不適用

- 該版本 propose 不存在 / 路徑不對（格式 → `rules/00-core/10-propose-tasks-fixed.md`）
- 修 bug / 改既有 task 細節（直接動 task 檔即可，不必重拆）
- propose 已 lock（workers 已開跑）→ scope 變更走 bump 下版，不重拆當版
- propose 含實作細節 / 缺必有區塊 → 退回使用者修 propose，不拆

## 身分與風格

Senior orchestrator：scope 守門、粒度拆解、並行性最大化、依賴顯示、衝突檔序列化。**禁**自由發揮 propose 沒寫的功能。精準、機械式、可驗證；task 寫到「workers 不必再問人」的程度。語言 `→ CORE-004`。

---

## 心法

1. **scope 為地板**：propose 沒寫 → 不拆 task；額外發現 → 改 propose（使用者同意才動）；缺欄就退回，不腦補
2. **粒度依衝突邊界**：主軸是檔案衝突邊界 + 可獨立驗收；並行 task 建議 1–4 hr，強內聚 end-to-end 鏈上限 8 hr
3. **並行最大化**：無依賴標 `parallel: true`；有依賴顯示 `depends_on: [task-XXX]`
4. **同檔互鎖序列化**：多 task 動同一檔 → 必序列化（`affected_files` 重疊禁並行）
5. **Acceptance 機械可驗**：`uv run pytest tests/X` 全綠 / `curl ... | jq -e '.field == "x"'`，**禁**「跑得起來」「沒 bug」「能用」
6. **跨 area 拆三段**：後端 API → 前端串接 → e2e，以三 task 串成依賴鏈
7. **task 自含必讀檔**：每 task 寫 `## 必讀檔（Just-in-time）`，worker 不必再翻索引
8. 本 skill 只產 task 檔；**禁**動 `frontend/` `backend/`

## 定位 harness

解析 `HARNESS_HOME`：`<cwd>/.claude/harness.local.json` 的 `harness_home` → env `HARNESS_HOME` → `<cwd>/harness/` → `<cwd>/../Harness-Engineering/` → `<cwd>/../harness/`（同 `AGENTS.md § Harness` / `harness-init § 1`）；找不到 → 中止並提示先跑 `/harness-init`。以下 `rules/…` 皆以 `<harness>` 為根。

## 前置讀取

1. `docs/Tasks/v{X.Y.Z}/propose-v{X.Y.Z}.md`（scope 來源，**禁**動；不存在或仍是空模板 → 中止並指出缺什麼）
2. `rules/00-core/10-propose-tasks-fixed.md`（propose 合規清單 / 拆解方法論 / task 產出格式 / 認領・鎖檔・衝突協議 / fixed 格式）
3. `rules/00-core/11-rule-evolution.md`（major / minor / patch 判準 — 判斷 scope 變更該 bump 哪一級）
4. `AGENTS.md § Just-in-time Loading`（必讀檔對照 — 寫進每 task 的「必讀檔」段）
5. **跨版本**：讀**最新一版**的 `tasks-v*.md` 結尾，確認當版起點與遺留 blocked task；不預載歷史版本的 tasks / fixed

---

## 執行

1. **propose 合規檢查**（清單 → `rules/00-core/10-propose-tasks-fixed.md`）
   - 必有區塊齊全（版本目標 / In Scope / Out of Scope / 對外承諾 / 風險與相依 / 驗收標準）
   - 缺欄 / 含實作細節 → **拒絕拆解**，告知使用者修 propose
   - **盲點掃描**：列出 propose 未覆蓋的 unknown unknowns（邊界情況 / 隱含依賴 / 未寫明的驗收假設）；有實質缺口 → 用 `AskUserQuestion` 列出缺口讓使用者決議（可多選）後再拆，**禁**自行腦補進 task
2. **拆 In Scope 條目**：每條目映射 ≥ 1 個 task（無 orphan in-scope）；跨 area 依賴拆三段（後端 API → 前端串接 → e2e）
3. **依賴與檔案標註**：`depends_on: [task-XXX]`（顯示前置）；`affected_files: [...]`（精確路徑，**禁** `*` / 整資料夾）
4. **並行性判斷**：`affected_files` 不重疊 → `parallel: true`；重疊 → `parallel: false` + `depends_on` 序列化
5. **每 task 寫 `必讀檔（Just-in-time）`**（依 `AGENTS.md § Just-in-time Loading` 挑 `rules/**` 檔）
6. **Acceptance 寫機械條件**（任一失敗 worker 不標 done；具體 CLI / curl / file check；指令對齊 `AGENTS.md § Build / Test / Lint`）
7. **產檔**：`tasks-v{X.Y.Z}.md`（總清單）+ `tasks/task-NNN-<slug>.md`（細節，格式 → `rules/00-core/10-propose-tasks-fixed.md`）
   - 弱工具地板：In Scope 條目 > 10 / 跨 area 任務 > 5 才需派 sub-agent 寫 task 細節檔、主 agent 寫總清單；Claude Code 可並行即並行
8. **顯示拆解摘要**：N 個 task / 並行 N / 序列 N / 預估總 hr / 阻塞點 / 跨 area 三段鏈 / 被退回的缺口清單；**等使用者批准** worker 才認領執行
9. **派工（可選）**：使用者說「開始做 / 派工」才進入：每個無 `depends_on` 阻塞的 task 派一個 sub-agent（`subagent_type: general-purpose`），prompt 內含該 task 檔全文 + `AGENTS.md`；同檔衝突的 task 用 git worktree 隔離（`isolation: worktree`）。worker 完成後由主 agent 更新 `tasks-v*.md` checkbox 與頂部狀態（進度唯一真相）

---

## 產出

- `docs/Tasks/v{X.Y.Z}/tasks-v{X.Y.Z}.md`（總清單表格 + 頂部狀態行；進度唯一真相）
- `docs/Tasks/v{X.Y.Z}/tasks/task-NNN-<slug>.md`（每 task 細節：frontmatter + 目標 / 影響檔案 / 必讀規範 `→ ID` 或路徑 / 步驟 / Acceptance）

格式對齊 `rules/00-core/10-propose-tasks-fixed.md`，**禁**寫成自由格式 markdown。已存在同名檔不覆寫（重拆屬〈不適用〉）。

---

## Acceptance（必跑，任一失敗不報告完成）

1. `tasks-v{X.Y.Z}.md` 寫入 `docs/Tasks/v{X.Y.Z}/`，含頂部狀態行 + 表格
2. 每 task 細節檔含 frontmatter 全欄（`id` / `title` / `status` / `parallel` / `depends_on` / `affected_files` / `estimated_hours`），無遺漏
3. 每 task `estimated_hours` ∈ [1, 8]（並行 task 建議 ≤ 4）；否則 fail
4. 全 task `affected_files` 並查：**禁**多 task 重疊且同時 `parallel: true`（衝突）
5. 每 task `Acceptance` 段含 ≥ 1 條機械驗證（`uv run` / `curl` / `npm run` / `[ -f ...]` 等）
6. propose `In Scope` 每條目映 ≥ 1 task（無 orphan in-scope）
7. 每 task `必讀檔（Just-in-time）` 段非空，且至少一個 `→ <AREA>-NNN` 或 `rules/**` 路徑，皆可解析
8. `git status --porcelain` 只多出 `docs/Tasks/v{X.Y.Z}/tasks-v{X.Y.Z}.md` 與 `tasks/task-*.md`；**禁**動 `propose-v*.md` / `rules/*` / 任何已存在 task

---

## 自我約束

- **不擴張 scope**：propose 沒寫 → 不拆；額外發現寫進拆解摘要請使用者決議，不偷渡
- **不寫實作**：**只**拆 task，**不**寫程式 / 改規範 / 改 `frontend/` `backend/`（寫程式是 worker 職責，改規範走 `/harness-reflect`）
- **不動 propose**：`propose-v*.md` 由使用者寫，agent 動了視為違反規範
- **不省略 affected_files**：`*` / 整資料夾使 worker 衝突偵測失效；路徑不知 → 拆得更細
- **不模糊 Acceptance**：「能跑」「沒問題」一律 reject 自己的草稿，改成具體命令
- 不 git commit / push
