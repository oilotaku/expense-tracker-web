# fixed — v1.0.0（expense-tracker-web）

> 本版累積的違規 / bug 根因。每段一條，由 agent 在修正當下寫入；`guard-write` hook 機械驗每段格式。
> 格式唯一寫處：`HARNESS_HOME/rules/00-core/10-propose-tasks-fixed.md`（→ CORE-072）。
> 欄位名與冒號**逐字照抄下面的範本**：hook 驗的是 `## §N — ` 與半形冒號的 `- **rule**:`，換成全形冒號會被擋。

<!--
每段格式（§ 連號；時間 ISO 8601 帶 offset）：

## §1 — <一句話標題>

- **time**: {YYYY-MM-DD}T10:00:00+08:00
- **commit**: `<hash>` / PR `#<num>`（尚未 commit 寫 `pending`）
- **files**: `path/to/file.py:42`
- **問題**: <現象 / log；使用者或 agent 觀察到什麼>
- **根因**: <為什麼發生的系統性原因；禁只寫「typo」「忘了」「漏掉」>
- **修正**: <怎麼改；多步驟 1./2./3.>
- **rule**: <違反 / 推翻的規則 ID，如 CORE-029；無對應規則寫 `NONE`>
- **後續**: <是否 reflect 候選 / 補測試 / 棄用規則 / 見 tasks-v*.md §N>
-->

## §1 — task-001 遺漏 BE-023 要求的共用認證依賴，阻塞三個下游 task

- **time**: 2026-09-03T21:10:00+08:00
- **commit**: `f86c8c4`
- **files**: `backend/app/api/deps.py`
- **問題**: task-002（帳戶）、task-003（分類）、task-015（負債）三個 worker 各自獨立實作時，都在「未帶 JWT 應回 401 / 資料需依使用者隔離」這條 Acceptance 上卡住並主動停手回報，理由相同：`app/api/deps.py` 只有 `get_db`，沒有 `get_current_user`。
- **根因**: task-001 的 `affected_files` 只涵蓋註冊 / 登入（簽發 JWT），沒有涵蓋「驗證 JWT 並取得當前使用者」——這是 BE-023 明訂**必須**集中在 `app/api/deps.py` 的共用依賴，且是任何「受保護 endpoint」task 的隱含前提。task-001 自己的完成報告已經預見到這個缺口（「deliberately left out of scope: get_current_user」），但拆解階段（`/propose-to-tasks`）沒有把它獨立列成 task 或併入 task-001 的 affected_files，導致三個平行 worker 各自撞牆才發現，屬於拆解粒度遺漏。
- **修正**: 由 orchestrator（非個別 worker，避免三個 worker 同時搶改同一檔）直接在 `app/api/deps.py` 補上 `get_current_user`（讀 cookie → `decode_access_token` → `UserRepository.find_by_user_uid` → 找不到或已軟刪除回 401），實作對齊 `rules/20-backend/02-auth.md` BE-023 的參考實作；`ruff check` / `ruff format` / `mypy` / `pytest`（12 項既有測試）全綠後 commit，再通知 task-002 / task-003 的 worker resume。
- **rule**: BE-023
- **後續**: task-015 尚未 resume（該 worker 尚未回報阻塞，但同樣需要這個依賴，已隨此次修正一併解除）；後續類似「認證/授權基礎設施」的共用依賴，`/propose-to-tasks` 拆解時應在 In Scope 逐條映射之外，額外檢查是否有隱含的跨 task 共用基礎設施，必要時獨立成一個所有下游 task 都 `depends_on` 的基礎 task，避免多個 worker 平行撞同一道牆。
