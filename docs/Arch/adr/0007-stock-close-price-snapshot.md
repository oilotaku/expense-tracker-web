# ADR-0007: 台股收盤價快照

- **狀態**：Accepted（後端已實作）
- **日期**：2026-11-10
- **決策者**：本次 session（Claude Code）依使用者需求「收盤後把股價存在後端調用」，待人類複核

## 背景（Context）

台股報價只有 TWSE MIS 即時查詢 + Redis 90 秒快取（ADR-0001、CACHE-013）。收盤後到隔天開盤前價格不會變，
但每次開淨資產頁仍要打外部 API；MIS 在夜間 / 開盤前試撮時段可能回空值或試撮價，失敗時整張淨資產卡片 424。
ADR-0001 規劃過「MIS 失敗退回收盤價」，一直沒做。

## 決策（Decision）

- 新表 `stock_close_prices`（ticker, trade_date, close_price, name, fetched_at），`(ticker, trade_date)` 部分唯一索引。
  不歸屬使用者，股價是公開資料。存 PostgreSQL 不存 Redis：要撐過 Redis 清空，且 TTL 會超過 CACHE-013 純加速快取上限。
- 寫入：host 端 systemd timer 每個平日 14:40（台北）呼叫 `POST /api/v1/internal/stock-close/run`（同
  `/internal/recurring/run` 的 secret 驗證），抓所有使用者持有的股號一次批次查詢後 upsert。`trade_date` 用 MIS 的 `d`
  欄位，休市日觸發只會覆寫前一交易日那列，不需要假日行事曆。批次中有查無資料的股號時改逐檔查並略過。
- 讀取（`NetWorthService`）：
  - 非盤中（平日 09:00–13:35 以外）且快照 `fetched_at` 不早於最近一個平日 13:35 → 直接用快照，不打 MIS。
  - 否則打即時報價（照舊經 Redis 90 秒快取）；即時失敗時退回每檔最近一筆快照（不論新舊），湊不齊才 424。
- 盤中判斷用固定 `Asia/Taipei`（交易所時區），不是 `Settings.API_TZ`。

## 拒絕方案（Rejected Alternatives）

- **收盤後把 Redis TTL 拉長到隔天開盤**：違反 CACHE-013（純加速快取 60–600s），Redis 清空就沒了，也做不到失敗退回。
- **讀取時順便寫快照**：13:30–13:35 與開盤前試撮時段的價格不可靠，寫入時機難界定；只由排程寫，行為單純。
- **用 `STOCK_DAY_ALL`（ADR-0001 輔助來源）**：不含上櫃股，MIS 收盤後的 `z` 就是收盤價，同一個來源即可。

## 後果（Consequences）

- 晚上 / 週末開淨資產頁不打外部 API；MIS 故障時改顯示最近收盤價，不再整張 424。
- 回應沒有標示「此為收盤價」；需要時另加欄位。
- 排程失敗（Pi 關機等）由 timer `Persistent=true` 補跑；補跑前非盤中時段會退回即時查詢，行為同改版前。
- 美股、基金、貴金屬不在範圍內。
- iOS App 預設在手機端直接抓報價（`Core/QuoteService.swift`），不經過這個快照；設定頁切回伺服器才會用到。
