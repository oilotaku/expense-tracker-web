# ADR-0004: 讀取路徑時間/空間複雜度與 1000 人×3 年容量規劃

- **狀態**：Accepted
- **日期**：2026-09-17
- **決策者**：Jason

## 背景（Context）

一次對話從「後端資料存放方式／資料結構」的盤點開始，逐步展開成完整的讀取路徑效能分析：

1. **資料結構盤點**：`backend/app/models/` 下每張業務表繼承 `BaseModel`（內部自增 `uid` + 對外 `<table>_uid` UUID + 軟刪 `is_deleted` + 稽核欄位），核心表為 `users` / `user_credentials` / `accounts` / `categories` / `tags` / `transactions`（+`transaction_tags` 多對多）/ `budgets` / `recurring_rules` / `financial_assets` / `liabilities`。
2. **逐一分析讀取路徑的時間/空間複雜度**（`n`=表總列數、`m`=單一使用者符合篩選條件列數、`k`=分頁大小）：
   - 單筆查詢（`find_by_*_uid`）：`O(log n)` 時間、`O(1)` 空間，靠 unique index。
   - 交易分頁列表（`TransactionRepository.list_by_user_uid`）：`O(log n + m)`，但因 `transactions` 目前只有單欄索引（`user_uid`、`category_uid`、`transaction_date` 各自獨立，見 `backend/alembic/versions/2026_09_04_0630-add_transactions_and_tags.py:96-111`），排序/`COUNT` 可能退化成 `O(m log m)`。
   - 批次標籤查詢（`list_tags_by_transaction_uids`）：刻意設計成單次 `IN` 查詢，`O(k log n)`，避免 N+1。
   - 預算花費彙總、Dashboard summary/breakdown：SQL 端 `GROUP BY` 一次做完，`O(m)` 時間、`O(g)` 空間（`g`=群組數，遠小於 `m`）。
   - Dashboard 趨勢圖（`DashboardService.get_trend`）：因本地日曆日分桶沒有 SQL 層時區轉換前例，把區間內原始交易列整批撈進 Python 分桶，是唯一一個 `O(m)` **空間**的讀取路徑。
   - 淨資產彙總（`NetWorthService.compute`）：DB 端 `O(a+f+l)`（帳戶/資產/負債數，皆為使用者自維護清單，量級小），但對每筆非 TWD 帳戶、每筆金融資產序列 `await` 外部報價服務。
3. **套用「開放後供給約 1000 人及 3 年資料量」估算**：
   - `transactions`：每人每天 3–8 筆估算，3 年約 3,000–9,000 筆/人 × 1000 人 ≈ **300 萬～900 萬列**。
   - `transaction_tags`：量級與 `transactions` 相當或更高（可能是全庫最大表）。
   - `accounts`/`categories`/`tags`/`budgets`/`recurring_rules`/`financial_assets`/`liabilities`：與時間無關、跟著使用者操作次數成長，總量級是數千到數萬列，相對 `transactions` 是雜訊等級。
   - 整個 DB（含索引）粗估落在**個位數 GB**，之後每年再長 1–3 GB；本機是資源有限的 Raspberry Pi（4 核/8GB，→ 既有記憶 `project_pi_resource_constraints`），這個量級的資料本身不是瓶頸，但排序/彙總的 CPU 成本會因 1000 人**同時**觸發而被放大。
   - 檢查 `PricingService`（`backend/app/services/pricing_service.py`）確認快取 key 是依標的物/幣別對（`_stock_quote_key` 等），**不是**依使用者，所以 1000 人若持有重疊標的（同一支股票、同一種貴金屬），實際外部 API 呼叫次數只跟「系統內相異標的物數」成正比，不隨使用者數線性增加——這個設計已經對多使用者規模友善，不需改動。
4. **對照既有紀錄發現的落差**：`task-001`（`docs/Tasks/v1.1.0/tasks/task-001-dashboard-summary-api.md`）當時的 propose 備註寫「`(user_uid, transaction_date)` 查詢效能沿用既有索引慣例，若既有索引不足由 worker 於 task-001 一併補」，但實際檢查 migration 後確認**只建了單欄索引，沒有補上複合索引**——這個備註當時沒有被完整落實。

## 決策（Decision）

在「~1000 人、3 年資料量」這個具體規模下評估後決定：

- **現有架構設計維持不變**：per-user 資料隔離（每張業務表 `user_uid` scoped）、Dashboard/預算的 SQL 端 `GROUP BY` 彙總、`PricingService` 依標的物 keyed 的 Redis 快取，這幾個既有設計在此規模下都足夠，**不需要**架構層級的重大改動。
- **已知落差記錄於下方 Consequences，暫不另開版本任務**：這些項目何時、由誰處理留待之後決定，本 ADR 先把分析脈絡與結論定案存查。

## 拒絕方案（Rejected Alternatives）

- **現在就導入資料表 partitioning（依年份）**：容量估算顯示 3 年內 `transactions` 含索引僅個位數 GB，partitioning 的維運複雜度在這個規模不划算，屬過早最佳化。
- **立刻把 `get_trend` 改寫成 SQL 端時區分桶**（`AT TIME ZONE` / `date_trunc`）：repo 目前沒有這類寫法前例，且單一使用者 `m` 在 1000 人×3 年估算下仍是千筆等級，Python 端分桶尚未構成效能問題，留待真的觀察到瓶頸再處理。
- **立刻把 `NetWorthService` 的序列外部報價呼叫改成 `asyncio.gather` 平行化**：Redis 快取已把重複外部呼叫壓到最低，序列 await 在此規模下的延遲影響可忽略，現在做屬於過度工程。

## 後果（Consequences）

- **正向**：
  - 確認 1000 人×3 年這個具體數字下，資料量本身與大部分熱路徑都不構成重大瓶頸；先前泛用的效能疑慮，套上實際數字後多數是「理論上存在、但這個規模還不足以觸發」。
  - 確認 `PricingService` 的快取設計已經是為多使用者共用場景設計的，驗證了既有架構決策（ADR-0001/0002/0003）在更大規模下依然成立，不需重新檢討。

- **負向 / Trade-off（已知落差，待後續處理，不掛版本任務）**：
  - `transactions` 缺 `(user_uid, transaction_date DESC, uid DESC)` 複合索引：`task-001` 當時預留的但書未落實，分頁列表在使用者交易數成長後可能出現排序/`COUNT` 退化（`O(m log m)`），建議在正式對外開放前補上（`CREATE INDEX CONCURRENTLY` 可不鎖表施工）。
  - `DashboardService.get_trend` 是唯一整批交易列進 app 層的讀取路徑（`O(m)` 記憶體）：單一請求在此規模下無虞，但需留意高併發時的記憶體疊加，且目前對 `date_from`/`date_to` 沒有區間長度上限檢查。
  - asyncpg connection pool 大小尚未針對「Pi 4 核心硬體 × 1000 人併發」重新檢視是否合理。
  - 尚未做過對應這個資料量級的備份/還原演練（`docs/Arch/backup-restore-log.md`），容量成長後實際 RTO 未知。

- **後續可能觸發的 ADR**：若實際使用者規模或資料量遠超本次估算（例如 >1 萬使用者、或年資料量突破千萬列），需要重新評估是否導入 table partitioning、SQL 端時區分桶、或報價呼叫平行化——屆時應另開新 ADR，不修改本 ADR。

## 參照

- 對應規則：`rules/30-database/08-indexes-and-perf.md`（DB-055/056/057/058/059/060/061）
- 對應 task：`docs/Tasks/v1.1.0/tasks/task-001-dashboard-summary-api.md`
- 對應程式碼：
  - `backend/app/models/transaction.py`
  - `backend/app/repositories/transaction_repository.py`
  - `backend/app/repositories/budget_repository.py`
  - `backend/app/services/dashboard_service.py`
  - `backend/app/services/net_worth_service.py`
  - `backend/app/services/pricing_service.py`
- 對應 migration：`backend/alembic/versions/2026_09_04_0630-add_transactions_and_tags.py`
