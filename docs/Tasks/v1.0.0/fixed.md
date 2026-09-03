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

## §2 — task-001 遺漏 GET /auth/me，前端 AuthGuard 永遠判定未登入

- **time**: 2026-09-03T21:40:00+08:00
- **commit**: `95b8fc3`
- **files**: `backend/app/api/v1/auth.py`
- **問題**: task-005（認證前端）完成後回報：`AuthGuard` 依 `rules/10-frontend`（httpOnly cookie 前端讀不到）的規範，只能靠打 `GET /api/v1/auth/me` 判斷登入狀態，但這個 endpoint 從未出現在任何 task 的 `affected_files`。
- **根因**: 與 §1 同一類根因——task-001 只涵蓋「登入簽發 JWT」，沒涵蓋「前端如何得知自己已登入」這個下游必然需求；`/propose-to-tasks` 拆解時同樣沒抓到這個隱含依賴。
- **修正**: orchestrator 直接在 `backend/app/api/v1/auth.py` 加 `GET /auth/me`（`Depends(get_current_user)` → 回傳 `UserResponse`），複用 §1 剛補上的 `get_current_user`；`ruff` / `mypy` / `pytest` 全綠後 commit。
- **rule**: BE-023
- **後續**: 與 §1 同一根因類別，一併計入「共用基礎設施拆解检查」的 reflect 候選。

## §3 — task-002 / task-015 平行 migration 造成 alembic 多 head，且容器未重建導致誤判為循環依賴

- **time**: 2026-09-03T22:05:00+08:00
- **commit**: `157209d`
- **files**: `backend/alembic/versions/2026_09_03_2201-merge_accounts_and_liabilities.py`
- **問題**: task-003 的 worker 檢查 alembic 狀態時，先後兩次讀到不一致的結果——一次是乾淨的雙分支（accounts、liabilities 皆從 add_users 分支），一次是兩檔互指對方為 `down_revision` 的循環，判斷為「migration graph 已損毀」而停手回報。orchestrator 直接檢查兩份 migration 檔案內容，發現兩者其實都正確指向共同 parent `1046b568e121`，沒有循環——但 `docker compose exec backend alembic heads` 卻直接丟出 `CycleDetected`。
- **根因**: 兩層問題疊加。(1) backend 的 Docker image 是 `COPY`-based（非 bind mount），`docker compose exec` 看到的是**上次 `--build` 當下**的快照，不會反映之後的 host 檔案變動；task-003 的 worker 在沒有重建 image 的情況下連續跑 `alembic heads`，很可能在某次 rebuild 之間，image 內剛好卡到 task-002／task-015 兩個 worker 都還在 edit 過程中的中間狀態（兩人都嘗試把自己的 migration 接到對方後面做線性化，短暫互相指向），因而讀到循環——這是舊 image 的殘留快照，不是 host 上最終檔案的真實狀態。(2) 更根本的問題：task-002（帳戶）與 task-015（負債）兩個 `parallel: true` 的 task 都各自從同一個 parent（`add_users`）建自己的 migration，這是 alembic 多 head 的標準情境（`rules/30-database/07-alembic.md` DB-049 允許的分支狀態），但**沒有任何 task 負責事後合併**——拆解時只想到「檔案不重疊即可並行」，沒想到「兩個平行 migration 即使檔案不同，仍會在 alembic revision graph 這個邏輯層面衝突」。
- **修正**: 1. `docker compose up -d --build backend` 重建 image，確認 host 上的兩份 migration 檔案其實乾淨（各自 `down_revision = "1046b568e121"`，非循環）。2. 用 `alembic merge -m merge_accounts_and_liabilities <accounts_rev> <liabilities_rev>` 產生合併 revision，整理成專案慣用格式後放回 `backend/alembic/versions/`。3. 驗證 `alembic upgrade head` 成功、單一 head；`alembic downgrade -1` 在合併點會報 `Ambiguous walk`（alembic 已知行為——合併點無法用相對 `-1` 判斷要走哪條分支），改用明確 revision（`alembic downgrade <accounts_rev>`）驗證 round-trip 正常。
- **rule**: DB-049
- **後續**: (a) 任何要跑 `docker compose exec backend ...` 驗證 migration / 程式碼行為的 worker，**必須先 `docker compose up -d --build backend` 重建**，否則看到的是舊快照，可能誤判成假的嚴重錯誤；這條應該補進 `AGENTS.md` 或至少每個 task 檔的必讀提醒。(b) 未來若有多個 `parallel: true` task 各自新增 migration 且共享同一個 parent revision，`/propose-to-tasks` 拆解時應該預先安排一個「合併」收尾 task（或由 orchestrator 在多個平行 migration task 完成後自動跑 `alembic merge`），不要假設「檔案不重疊」就等於「這些 task 可以真正平行完成而不需要協調」。(c) 往後任何 task 的 Acceptance 若寫「`alembic downgrade -1` round-trip」，遇到 head 是合併 revision 時要改用明確 revision id，`-1` 在合併點是已知的 ambiguous 案例，不是 bug。

## §4 — `tests/test_health.py::test_health_ok` 在跑完整測試套件時偶發 teardown flake（既存，非當版邏輯錯誤）

- **time**: 2026-09-04T06:15:00+08:00
- **commit**: `pending`
- **files**: `backend/tests/test_health.py`、`backend/tests/conftest.py`（推測，尚未深查）
- **問題**: `docker compose exec backend uv run pytest -q`（跑全部測試檔）偶爾在 `test_health.py::test_health_ok` 報 `RuntimeError: Event loop is closed`（asyncpg connection pool 在 event loop 已關閉後才嘗試 cancel 連線）；單獨跑 `pytest tests/test_health.py` 100% 通過，task-002 與 task-003 的 worker 各自獨立複測過，排除掉自己的改動後依然重現，判斷是既存的 pytest-asyncio + asyncpg fixture 生命週期問題，不是任何一個 task 引入的邏輯錯誤。
- **根因**: 尚未深入定位；初步推測是多個測試檔共用的 DB session / event loop fixture 在跨檔案執行時的作用域（scope）與 asyncpg pool 的非同步清理時機沒對齊，導致某個連線的 cancel 協程在 event loop 關閉後才被排程。scaffold 產的 `conftest.py` 的 fixture scope 設定可能需要檢視。
- **修正**: 尚未修正（本次不影響任何 task 的 Acceptance——各 task 都是各自檔案跑綠，全套件跑動只是這一個既存 flake）。暫時因應：CI / 驗收時若遇到這個特定錯誤且只有這一個測試失敗，視為已知 flake，重跑一次確認是否為間歇性，不代表功能壞掉。
- **rule**: NONE
- **後續**: 待後續某個 task 需要動 `conftest.py`（例如新增測試 fixture）時一併排查修正；若持續影響 CI 穩定性，應獨立開一個小 task 處理（`estimated_hours: 2` 等級），而非放著不管。
