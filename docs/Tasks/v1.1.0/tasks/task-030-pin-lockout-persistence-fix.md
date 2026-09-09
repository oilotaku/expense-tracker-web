---
id: task-030
title: 修正 PIN 鎖定計數器從未真正持久化（e2e 發現，安全性阻斷）
status: done
parallel: true
depends_on: []
affected_files:
  - backend/app/services/auth_service.py
  - backend/tests/api/test_auth_pin.py
estimated_hours: 2
rules: [BE-023]
---

> 來源：task-026 e2e 執行中發現（CORE-068，優先序最高——這是本版對外承諾的安全行為「連續失敗 5 次鎖定 15 分鐘」完全不生效，見 `fixed.md` 待補條目）。

## 目標

**根因**（e2e worker 已用 curl 直打 backend + psql 查表確認）：`AuthService._verify_pin_or_raise`（`backend/app/services/auth_service.py`）在 PIN 錯誤時呼叫 `self.repo.record_pin_failure(...)`（只 `flush()`，不 `commit()`），緊接著 `raise AppError(_PIN_FAILED_DETAIL, ...)`。這個例外往上拋到 `app/api/deps.py::get_db` 的 `except Exception: await session.rollback(); raise`，把剛才的 flush 一併回捲——`pin_failed_attempts`/`pin_locked_until` 從未真正寫進資料庫，導致連續輸入錯誤 PIN 任意次數都不會被鎖定，本版對外承諾的「PIN 連續 5 次鎖 15 分鐘」安全行為完全失效。

`backend/tests/api/test_auth_pin.py`（task-002 寫的）之所以顯示綠燈，是因為 `tests/conftest.py` 的 `_override_get_db`／`db` fixture 用外層 transaction + rollback 做測試隔離，**沒有複製正式 `get_db` 的「成功 commit / 失敗 rollback」生命週期**，test double 與正式路徑分歧，造成假綠燈（測試本身沒有真的驗證「跨 request 的 commit 是否生效」這件事，只驗證同一個 session 內的物件狀態變化）。

**修正方向**：在 `_verify_pin_or_raise` 呼叫 `record_pin_failure`/`reset_pin_failures` 之後、`raise AppError` 之前，明確 `await self.db.commit()`，讓失敗計數在拋出業務錯誤前就先落地，不受 `get_db` 的例外 rollback 影響。這是 PIN 這個新流程特有的「記錄側效應後刻意拋出業務錯誤」模式，全庫目前沒有其他地方需要這樣做（已確認），**不要**改動 `app/api/deps.py::get_db` 的通用例外處理邏輯（那是保護一般未預期例外不留下部分 commit 的正確設計，改了影響全站）。

## Acceptance

- [ ] 修正後，透過真實 HTTP 呼叫（`docker compose exec backend` 內用 `httpx`/`TestClient` 或等價方式，**不能**只驗 repository 層物件狀態，要驗完整一次 request 生命週期）：連續 5 次錯誤 PIN 後，第 6 次請求收到 `429`（`_PIN_LOCKED_DETAIL`），且直接查 DB（`psql` 或測試內查詢）確認 `pin_failed_attempts`/`pin_locked_until` 已真正持久化
- [ ] 成功登入後 `pin_failed_attempts` 歸零且已持久化
- [ ] `backend/tests/api/test_auth_pin.py` 新增至少一條測試，用**貼近正式 `get_db` 生命週期**的方式驗證跨 request 持久化（不能只依賴既有 `db` fixture 的 in-memory 物件比對；可考慮用兩個獨立的 `client` request 而非直接操作 repository/session）
- [ ] `docker compose exec backend uv run pytest tests/api/test_auth_pin.py -v` 全綠
- [ ] `docker compose exec backend uv run mypy app` 全綠
- [ ] `docker compose exec backend uv run ruff check . && docker compose exec backend uv run ruff format --check .` 全綠（跑在你自己改的檔案範圍內確認乾淨即可，全庫既有的其他問題不是你的責任）
- [ ] `git status --porcelain` 只多出本 task 的 2 個 `affected_files`

## 必讀檔（Just-in-time）

- `docs/Tasks/v1.1.0/design-spec.md` §12.2（PIN 鎖定機制完整規格）
- `backend/app/api/deps.py`（`get_db` 的 commit/rollback 生命週期，理解但不要改）
- `backend/tests/conftest.py`（既有 `db`/`client` fixture 與正式路徑的差異，這是本次假綠燈的根源）
