# ADR-0002: 貴金屬（金／銀）牌價來源與台制兩錢換算

- **狀態**：Accepted
- **日期**：2026-09-03
- **決策者**：Jason（spike 執行：task-012）

> 編號說明：`docs/Arch/adr/` 目前尚無 `0001-*.md`（本專案第一份正式 ADR）。依 `docs/Arch/README.md` 之「跳號要寫明原因」：`0001` 保留給日後回補的更早期架構決策（若確定不需要，屆時直接由 0002 起算，不強行補號）；本檔採用 task-012 spec 中 `affected_files` 指定的檔名 `0002-metal-price-source.md`，故由 0002 起編。

## 背景（Context）

`propose-v1.0.0.md` 的「金融資產輸入」要求：使用者可輸入貴金屬品項 + 重量（兩／錢換算），系統需抓取即時金價／銀價；报价可接受數分鐘延遲，但需快取以避免超過外部資料源速率限制。台灣一般消費者慣用「兩／錢」（台制：1 兩 = 37.5 g，1 錢 = 1/10 兩 = 3.75 g）而非國際慣用的「金衡制盎司（troy ounce，1 ozt = 31.1034768 g）」，兩者換算比例固定、可在後端一次寫死。

task-012 的任務是純調查：貴金屬牌價是否有穩定可用的 API；若無，評估爬蟲可行性、網站條款風險與更新頻率。本 spike 實際對候選來源發出即時請求（有網路存取，非僅憑文件推測），結果如下。

### 已測試來源與結果

| 來源 | 方式 | 實測結果（2026-09-03） |
| --- | --- | --- |
| 台灣銀行黃金存摺牌價 `rate.bot.com.tw/gold` | 直接 `curl` 抓頁面 | **被攔截**。回傳 HTTP 200 但 body 是 bot-management 的 `Challenge Validation` 頁（JS proof-of-work challenge，含 `sec-cpt-if` / `crypto` provider 欄位），非真實牌價內容；連 `rate.bot.com.tw/robots.txt` 都回 `Access Denied`（見下方「回傳格式範例」）。加上瀏覽器 `User-Agent` 仍相同結果。判斷為商用 bot 防護（Akamai 類），伺服器端（datacenter IP）抓取不可行，且無法排除是否違反其服務條款（頁面本身即拒絕非瀏覽器流量，等同明確不歡迎程式化存取）。 |
| `metals-api.com` | 查文件頁 | 需註冊取得 API key 才能呼叫實際牌價 endpoint；免費層依官方文件為有限額度（本次僅能確認需要 key，未實測額度數字——**此為推測需在 task-013 實作前用實際 key 覆核**）。 |
| `goldapi.io` | 查首頁 | 為 SPA（需 JS 執行），未能直接以 `curl` 取得文件內容；同樣需註冊 key。 |
| `gold-api.com`（`api.gold-api.com`） | 直接呼叫 `GET /price/XAU`、`GET /price/XAG`、`GET /symbols` | **成功**，無需 API key、無需註冊，即時回傳 JSON（見下方範例）。官方文件明確聲明 `/price` 即時報價 endpoint「No authentication required - Free endpoint with no rate limits」，且 CORS 全開。付費層只鎖「歷史價 / OHLC」endpoint（免費層 10 req/hr），與本專案需求（僅即時價）無關。 |
| `open.er-api.com`（USD/TWD 匯率，供換算用） | 直接呼叫 `GET /v6/latest/USD` | 成功，免 key，回傳含 `TWD` 匯率，每日更新一次（`time_next_update_utc`）。 |

## 決策（Decision）

**採用 `gold-api.com` 的 `GET https://api.gold-api.com/price/{symbol}`（`XAU`=金、`XAG`=銀，未來若要支援鉑/鈀可加 `XPT`/`XPD`）作為貴金屬即時報價主要來源**，回傳為「每金衡盎司（troy oz）美元價」；後端自行換算為台制「每兩」「每錢」新台幣價，公式：

```
USD/g   = price_usd_per_ozt / 31.1034768
TWD/g   = USD/g * USD_TWD_rate
TWD/兩  = TWD/g * 37.5      # 1 台兩 = 37.5 g
TWD/錢  = TWD/兩 / 10        # 1 錢 = 1/10 兩 = 3.75 g
```

USD/TWD 匯率另以 `open.er-api.com`（`GET /v6/latest/USD`，取 `rates.TWD`）取得——免 key、免費、每日更新一次，符合 propose 中「可接受數分鐘～更長延遲」的容忍度，不需要即時匯率。若之後 `open.er-api.com` 不穩定，可換其他免費 daily-rate FX 來源，不影響本 ADR 的金屬報價決策本體（匯率來源非本 ADR 主決策，屬可替換的次要相依）。

實作上依 `rules/20-backend/06-clients.md`：金屬價與匯率各自成獨立 client（`app/clients/gold_api/`、`app/clients/exchange_rate/`），皆走 `httpx.AsyncClient` + 明確 timeout（BE-061）；換算邏輯放 `services/`，client 只回傳原始（symbol, price_usd, updated_at）與（base, TWD rate），不在 client 內做單位換算。

### 速率限制／爬蟲風險

- **不採用爬蟲**：`rate.bot.com.tw` 有主動 bot 防護，抓取不可行也有條款疑慮，故不進入「若只能爬蟲」的分支，**本 ADR 不需要、也不設定爬蟲更新頻率上限**。
- `gold-api.com` 官方聲明即時價 endpoint 無速率限制，但其 ToS 第 4 條明文禁止「一秒內多次請求」等濫用行為，違者可被封 IP；即便官方未強制限速，**專案端仍自訂保守上限**：
  - **後端對 `gold-api.com` 的實際輪詢頻率上限：每來源（XAU/XAG）最多每 5 分鐘 1 次**（單一後端伺服器對外呼叫，非依使用者數量倍增），以 Redis 快取結果（cache key 含 symbol，TTL 5 分鐘），使用者請求一律先讀快取；快取未命中或過期才觸發背景刷新，**禁**在使用者請求路徑上同步等待外部 API。
  - 若失敗（timeout / 5xx / 5 分鐘內無法取得新值），回退顯示「最後一次成功取得的價格 + 其時間戳記」，並記錄失敗（→ BE-064 錯誤轉換），不得讓總資產計算因單次外部失敗而整頁報錯。
  - `open.er-api.com` 每日才更新一次，快取 TTL 可設 12–24 小時，同樣的「取不到就用上次快取值」原則。
- **待實作前務必覆核**（本 spike 未做的部分）：
  1. 用實際流量測試 `gold-api.com` 是否真的完全不因 5 分鐘一次的輪詢觸發任何限制或警告（本次僅驗證單次呼叫成功，未做長時間壓測）。
  2. 若 `gold-api.com`（小型第三方服務、非知名機構、無 SLA）之後停止服務或改政策，需要備援來源；建議 task-013 實作時把 client 介面設計成可替換（BE-058 已要求 client 內聚在 `app/clients/<service>/`，介面對 `services/` 一致），以利未來 fallback 到 `metals-api.com` / `goldapi.io`（皆需 key）而不動到呼叫端。

## 回傳格式／頁面結構範例

**`gold-api.com`（採用來源，2026-09-03 實測）**：

```
GET https://api.gold-api.com/price/XAU

HTTP/1.1 200 OK
Content-Type: application/json
Cache-Control: public, max-age=20
Access-Control-Allow-Origin: *

{"currency":"USD","currencySymbol":"$","exchangeRate":1.0,"name":"Gold",
 "price":4443.0,"symbol":"XAU",
 "updatedAt":"2026-09-03T12:17:54Z","updatedAtReadable":"a few seconds ago"}
```

```
GET https://api.gold-api.com/price/XAG
{"currency":"USD","currencySymbol":"$","exchangeRate":1.0,"name":"Silver",
 "price":65.781998,"symbol":"XAG",
 "updatedAt":"2026-09-03T12:18:24Z","updatedAtReadable":"a few seconds ago"}
```

換算範例（沿用上面實測數字，USD/TWD = 31.757562，`open.er-api.com` 同日）：

```
金：4443.0 USD/ozt → 142.85 USD/g → 4,536.43 TWD/g → 170,116 TWD/兩 → 17,012 TWD/錢
銀：65.78 USD/ozt → 251.9 TWD/錢
```

**`rate.bot.com.tw/gold`（拒絕方案，實測回傳非牌價內容，作為爬蟲不可行的證據）**：

```
GET https://rate.bot.com.tw/gold?Lang=zh-TW
HTTP/1.1 200 OK
<title>Challenge Validation</title>
... <iframe id="sec-cpt-if" ... challenge="eyJ0b2tlbiI6..." ...> ...
```

（`robots.txt` 同網域回傳 `Access Denied`，顯示整站掛了 bot 防護，非單一頁面偶發問題。）

## 拒絕方案（Rejected Alternatives）

- **爬 `rate.bot.com.tw` 黃金存摺牌價頁**：實測被 bot-management 攔截、拿不到真實資料；即使日後想繞過，其防護本身即隱含「不歡迎程式化存取」的立場，風險與維護成本（對抗持續變動的反爬機制）都不划算。
- **`metals-api.com`**：需註冊帳號 + API key（多一組機密要管理，→ CORE-024），免費額度需另外驗證；功能比需求（僅需即時單一價格）更重（含歷史價、換算、多幣別等），非必要。保留為 `gold-api.com` 失效時的備援候選。
- **`goldapi.io`**：文件站為 SPA、不易直接以伺服器端 `curl`/`httpx` 驗證，且同樣需要 key；未見明顯優於 `gold-api.com` 之處，故不選為主要來源，僅列備援候選。
- **自建定期人工輸入牌價（不接外部來源）**：不符合 propose-v1.0.0 明確要求的「抓取即時金價/銀價」，排除。

## 後果（Consequences）

- **正向**：
  - 免 key、免註冊、免費，開發與維運成本最低；task-013/014 可直接串接，不需先申請/管理第三方密鑰。
  - 回傳為單純 JSON、單位固定（USD/troy oz），換算邏輯簡單、無外部相依的複雜 schema。
  - 有明確的「即時報價無限制、歷史報價才限流」文件依據，行為可預期。
- **負向 / Trade-off**：
  - `gold-api.com` 是小型第三方服務，非公認金融資料機構，無 SLA、無歷史穩定性紀錄；其 ToS 明白聲明「不保證資料準確性、使用者需自行驗證後才可用於財務決策」——本專案僅用於「總資產總覽」的近似值展示，需在 UI 上避免誤導使用者以為是精確牌價（例如標示「參考市價，非銀行實際成交價」）。
  - 多一層 USD→TWD 匯率換算相依（`open.er-api.com`），任一環（金屬價或匯率）失效都會影響最終台制兩錢價格，需要各自獨立的快取與失敗回退（見上）。
  - 未涵蓋台灣銀行黃金存摺的「牌告買入/賣出價差」（銀行報價通常有 buy/sell spread，貼近本地實際交易價），改用國際即時金衡盎司價換算後的數字會與 BOT 牌價存在合理但非零的落差；若使用者對「跟銀行對得起來」有強需求，需在後續 task 另外評估是否要疊加一個經驗性價差調整或改標示為「國際現貨換算價」。
  - **後續可能觸發的 ADR**：若 `gold-api.com` 停止服務或開始限流，需要新 ADR 決定備援來源切換（`metals-api.com` / `goldapi.io` 二擇一並補上金鑰管理方案）。

## 參照

- 對應規則：`→ BE-058`（client 目錄結構）、`→ BE-060`／`BE-061`（`httpx.AsyncClient` + timeout）、`→ BE-064`（第三方錯誤轉換）、`→ BE-068`（rate limit 端限速，本案為額外保守自限而非硬性配額換算）、`→ CACHE-022`（多副本共享限速/快取狀態放 Redis，若後端多副本部署時適用）
- 對應 task：`docs/Tasks/v1.0.0/tasks/task-012-metal-price-spike.md`（本 spike）；供 `task-013` / `task-014`（貴金屬報價實作）依據
