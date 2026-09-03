# ADR-0001: 股票市價資料來源

- **狀態**：Accepted
- **日期**：2026-09-03
- **決策者**：task-011 spike（Claude Code），待人類複核

## 背景（Context）

`propose-v1.0.0.md` 的金融資產模組需支援「輸入股號 + 張數/股數，抓取即時市價」；同文件已定案「股票報價可接受數分鐘延遲（非即時盤中），需快取以避免超過外部資料源速率限制」，並要求優先用台灣證交所（TWSE）公開資訊。task-011 的目標是在 task-013/014 實作前，確認：是否需要 API key、速率限制、回傳格式、免費額度、資料延遲，以及個股覆蓋範圍（上市 / 上櫃）是否完整。

本 spike 於 2026-09-03 對候選端點做了實際 `curl` 測試（非僅查文件），以下回應範例皆為當次即時擷取的真實輸出。

## 決策（Decision）

採用**兩個官方 TWSE 端點分工**，皆**免 API key、免申請**：

1. **主要來源（近即時個股市價）**：TWSE MIS 看盤中心端點
   ```
   GET https://mis.twse.com.tw/stock/api/getStockInfo.jsp?ex_ch={tse|otc}_{股號}.tw&json=1&delay=0
   ```
   - `ex_ch` 前綴 `tse_` = 上市，`otc_` = 上櫃；同一端點兩種市場都能查（已用上市股 `2330`／台積電，與上櫃股 `3105`／穩懋 實測驗證），用錯前綴會回傳空殼物件（`{"tv":"-","s":"-","c":"","z":"-"}`）而非錯誤碼，需以此判斷「查無資料」。
   - 這是 TWSE 官網自家看盤頁面背後呼叫的介面，**非** `openapi.twse.com.tw` 正式文件化的 OpenAPI 之一，屬於公開可存取但**未正式文件化**的端點（業界慣例做法，多個公開專案與教學文章皆依賴此端點）。
   - 用途：取得「目前市價」（成交價 `z` / 最新揭示買賣價 `b`/`a`），對應資產總覽計算所需。

2. **輔助來源（官方文件化日成交資訊，僅上市，日頻）**：TWSE OpenAPI
   ```
   GET https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL
   ```
   - 有正式 Swagger 文件（`https://openapi.twse.com.tw/v1/swagger.json`），回傳**當日全部上市證券**（含個股與 ETF）的收盤資訊，一天更新一次（收盤後），需自行用 `Code` 欄位過濾出目標股號。
   - 用途：作為每日收盤價的官方文件化備援 / 核對來源，**不能**取代近即時報價需求（延遲以天計，且不含上櫃）。

task-013/014 實作時：先呼叫 MIS 端點取近即時價；若失敗（逾時 / 空殼回應 / 端點異常），退化為使用當日 `STOCK_DAY_ALL` 收盤價並標示「資料為前一收盤價，非即時」。股號所屬市場（上市/上櫃）判斷：先試 `tse_`，空殼則再試 `otc_`（或於使用者新增資產時要求選擇市場別，避免每次都打兩次）。

## 拒絕方案（Rejected Alternatives）

- **純爬蟲第三方看盤網站（如 Yahoo 奇摩股市、鉅亨網）**：非官方資料源，條款風險與頁面結構隨時可能變動，維護成本高，且與 propose.md「優先用證交所公開資訊」的定案衝突。
- **券商 / 第三方付費即時行情 API（如永豐 Shioaji、富邦新一代 API、Fugle）**：需要券商開戶、簽署 API 使用合約、部分需付費或有更嚴格額度限制，對個人記帳網站的規模明顯過度複雜；且 propose.md 已定案優先用證交所公開資訊，非有實測證據顯示 TWSE 不可行，不應貿然改用其他廠商。
- **只用 `openapi.twse.com.tw` 官方文件化端點、不用 MIS**：`openapi.twse.com.tw` 目前沒有任何「查詢單一個股即時/當日盤中價」的端點（143 條路徑檢視結果僅有日頻的 `STOCK_DAY_ALL` / `STOCK_DAY_AVG_ALL` / `BWIBBU_ALL` 等全市場批次資料），無法滿足「近即時市價」需求，且完全不含上櫃（TPEx）股票，故不能單獨作為主要來源。

## 後果（Consequences）

- **正向**：
  - 完全免費、免 API key、免申請流程，符合個人專案規模。
  - MIS 端點同時涵蓋上市（`tse_`）與上櫃（`otc_`），已用兩種市場的股號實測成功，覆蓋面符合「金融資產—股票」需求。
  - 回應延遲（`userDelay:5000`，約 5 秒）遠優於 propose.md 容忍的「數分鐘延遲」，快取空間充足。

- **負向 / Trade-off**：
  - MIS 端點**非**官方文件化 API（`openapi.twse.com.tw` 的 Swagger 未收錄），格式、路徑、行為隨時可能無預警變動或下線；無官方 SLA，出問題無正式管道回報。task-013/014 **必**把它包成 `app/clients/twse_mis/`（→ BE-058），把非預期回應（含空殼物件、逾時、HTML 非預期內容）都轉成明確錯誤（→ BE-064），並準備上述 `STOCK_DAY_ALL` 退化路徑。
  - 速率限制**非官方公告值**：查無 TWSE 正式文件標示速率限制，但社群普遍觀察與實作慣例是「約 3 次 / 5 秒」超過會被暫時阻擋（見參照）。本 spike 連續 5 次快速請求（約 0.06–0.08 秒/次）皆回 200，未觸發封鎖，但**不代表可長期用此頻率**——這是社群觀察值非官方保證，task-013/014 應保守設定 client 端 token bucket（→ BE-068，速率設在觀察上限的 80% 以下，例如每 IP ≤ 1 req/2s），並疊加 Redis 快取（TTL 建議 60–120 秒，propose.md 允許數分鐘延遲，快取可大幅降低對外實際呼叫次數）。
  - Content-Type 回傳為 `text/html;charset=UTF-8`（即使內容是 JSON），不可依賴 content-type 自動解析，需手動 `json.loads` / `response.json(content_type=None)`。
  - 端點會設定 `JSESSIONID` cookie；本次未經任何「暖身」請求即直接查詢成功，但坊間教學普遍建議先呼叫看盤首頁建立 session 再查詢以求穩定。此行為未完全排除間歇性失敗的可能，**task-013 實作時需額外做多次重試 / 冷啟動測試**，確認是否真的需要暖身請求。
  - 使用條款：`openapi.twse.com.tw` 首頁引用證交所[使用條款](https://www.twse.com.tw/zh/page/terms/use.html)；MIS 端點無對應揭露頁面（因非正式 OpenAPI 的一部分）。本專案僅供個人記帳試算用途、不對外轉售資料，風險評估上可接受，但**不得**把抓到的報價包裝成商業轉售的即時行情服務。
  - 上市/上櫃前綴需要額外資料（股號所屬市場別）才能組出正確 query，這是額外的實作複雜度（需要一張股號↔市場別對照表，或在使用者輸入時要求選擇）。

- **後續可能觸發的 ADR**：若正式導入後發現 MIS 端點穩定性不足（頻繁改版 / 常態性阻擋 / 長期無法穩定取得資料），需開新 ADR 評估改用付費第三方行情 API（如 Fugle Open API），屆時本 ADR 狀態改為 `Superseded by ADR-{NNNN}`。

## 參照

- 對應規則：`→ BE-058`（第三方串接位置）、`→ BE-060`（httpx AsyncClient）、`→ BE-064`（錯誤轉換）、`→ BE-065`（retry 限冪等操作）、`→ BE-068`（client 端限速 token bucket）、`→ CACHE-022`（多副本限速狀態放 Redis，若 task-013/014 決定啟用 Redis 快取）
- 對應 task：`docs/Tasks/v1.0.0/tasks/task-011-stock-price-spike.md`（本 spike）；後續實作 → task-013 / task-014
- 官方文件：TWSE OpenAPI Swagger — `https://openapi.twse.com.tw/v1/swagger.json`；使用條款 — `https://www.twse.com.tw/zh/page/terms/use.html`
- 實測記錄（本 spike，2026-09-03，皆為當次真實 `curl` 輸出）：

  **MIS 近即時個股報價**（上市股 2330／台積電）：
  ```
  GET https://mis.twse.com.tw/stock/api/getStockInfo.jsp?ex_ch=tse_2330.tw&json=1&delay=0

  {"msgArray":[{"@":"2330.tw","tv":"2965","ps":"2960","pid":"9.tse.tw|16368",
  "pz":"2400.0000","bp":"0","fv":"22","oa":"2395.0000","ob":"2390.0000",
  "m%":"000000","^":"20260903","key":"tse_2330.tw_20260903",
  "a":"2395.0000_2400.0000_2405.0000_2410.0000_2415.0000_",
  "b":"2390.0000_2385.0000_2380.0000_2375.0000_2370.0000_",
  "c":"2330","d":"20260903","%":"14:30:00","ch":"2330.tw",
  "n":"台積電","o":"2385.0000","ex":"tse","h":"2400.0000",
  "l":"2380.0000","oz":"2395.0000","nf":"台灣積體電路製造股份有限公司",
  "y":"2385.0000","z":"2390.0000"}],
  "referer":"","userDelay":5000,"rtcode":"0000","rtmessage":"OK",
  "queryTime":{"sysDate":"20260903","sysTime":"20:17:15", ...}}
  ```
  欄位說明（常用）：`n`=股票簡稱、`z`=最近成交價、`y`=昨收、`o`=開盤、`h`=最高、`l`=最低、`a`/`b`=五檔委賣/委買價、`d`=交易日期、`t`=撮合時間、`userDelay`=延遲毫秒數（此處 5000ms ≈ 5 秒延遲）。

  **MIS 近即時個股報價**（上櫃股 3105／穩懋，驗證上櫃覆蓋）：
  ```
  GET https://mis.twse.com.tw/stock/api/getStockInfo.jsp?ex_ch=otc_3105.tw&json=1&delay=0

  {"msgArray":[{"@":"3105.tw","z":"446.5000","n":"穩懋","ex":"otc", ...}],
  "rtcode":"0000","rtmessage":"OK", ...}
  ```

  **市場別用錯前綴時的空殼回應**（用 `tse_` 查一支實際是上櫃的股號）：
  ```
  {"msgArray":[{"tv":"-","s":"-","c":"","z":"-"}],"rtcode":"0000","rtmessage":"OK", ...}
  ```

  **`openapi.twse.com.tw` 官方日成交資訊**（`STOCK_DAY_ALL`，節錄）：
  ```
  GET https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL

  [{"Date":"1150902","Code":"00400A","Name":"主動國泰動能高息",
    "TradeVolume":"31680837","TradeValue":"482857600",
    "OpeningPrice":"15.31","HighestPrice":"15.34","LowestPrice":"15.15",
    "ClosingPrice":"15.17","Change":"-0.2000","Transaction":"10579"}, ...]
  ```
  （`Date` 為民國年格式；此端點回傳全市場所有上市證券，需用 `Code` 過濾。）
