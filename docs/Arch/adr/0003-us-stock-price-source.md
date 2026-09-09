# ADR-0003: 美股市價資料來源

- **狀態**：Accepted
- **日期**：2026-09-09
- **決策者**：本次修復 session（Claude Code），待人類複核

## 背景（Context）

使用者要求金融資產（股票）新增美股支援。既有 ADR-0001 已用 TWSE MIS 端點解決台股報價，但
台股/美股不能共用：美股沒有台股「張」（1000 股）的整手概念，市場慣例直接以股為單位（本次已與
使用者確認，見對話紀錄，不另開 ADR 記錄此點——這是產品決策非資料源評估）。本 ADR 只處理「美股
市價資料源」這個技術決策：是否需要 API key、速率限制、回傳格式、查無資料時的行為。

## 決策（Decision）

採用 **Yahoo Finance 非官方 chart API**，免 API key、免申請：

```
GET https://query1.finance.yahoo.com/v8/finance/chart/{ticker}
```

- 市價欄位：`chart.result[0].meta.regularMarketPrice`（USD）。
- 已用 `WebFetch` 對 `AAPL` 實際請求驗證（2026-09-09）：200 JSON，`regularMarketPrice` 為
  `316.22`，`chart.error` 為 `null`。
- 查無此代號時（實測 `ZZZZINVALIDTICKER`）：端點直接回 **HTTP 404**（非 200 + 錯誤 JSON body），
  `app/clients/us_stock_price_client.py` 依此設計錯誤處理，不採用「解析 `chart.error` 欄位」
  的路徑（因為根本沒有回應 body 可解析）。
- 台幣換算：沿用既有 `app/clients/metal_price_client.py` 的 `ExchangeRateClient`
  （`open.er-api.com`，USD→TWD，已有獨立 Redis 快取，→ ADR-0002），不新增第二套匯率來源。

## 拒絕方案（Rejected Alternatives）

- **Stooq（`stooq.com/q/l/`）**：曾是常見的免金鑰報價來源，但 2026 年初起已改為**需要 API key**
  （經 CAPTCHA 取得）且有未公開的每日配額（超過回 "Exceeded the daily hits limit"）。已用
  `WebSearch` 查證（2026-09-09），不符合本專案「機密僅經 env var、scaffold 現場生成」但**優先
  不動用任何金鑰**的既有慣例（TWSE MIS / gold-api.com / open.er-api.com 皆免金鑰）。
- **付費 API（Alpha Vantage / Finnhub / Twelve Data / Financial Modeling Prep 等）**：皆需註冊
  取得 API key，多數有嚴格的免費額度（例：Marketstack 每月僅 100 次請求），對個人記帳網站規模
  過度複雜，且需要新增機密管理（`.env` 新增一組 API key），偏離現有「全免金鑰」架構一致性。
- **不知名小型免金鑰服務（如 stockprices.dev 等）**：搜尋結果顯示為個人/小型專案，無法驗證其
  穩定性、資料正確性與長期可用性，風險評估上不如 Yahoo Finance（有 `yfinance` 這類廣泛使用的
  開源套件長期依賴同一端點，屬於「多個公開專案共同驗證過」的類別，風險特徵與 ADR-0001 採用的
  TWSE MIS 端點一致）。

## 後果（Consequences）

- **正向**：免費、免 API key、免申請；與既有 TWSE MIS / gold-api / open.er-api.com 三個資料源
  同一套「免金鑰」架構原則一致；USD→TWD 換算直接複用既有 `ExchangeRateClient`，不新增匯率來源。
- **負向 / Trade-off**：
  - 非官方文件化端點，格式/路徑/行為可能無預警變動，無官方 SLA（同 ADR-0001 的既有風險接受
    立場：本專案僅供個人記帳試算用途）。
  - 無官方公告速率限制，但 Yahoo 對過度頻繁的請求會限流（一般認知，非本次實測確認的具體數字）；
    `app/clients/us_stock_price_client.py` 因此採用與 TWSE MIS 同精神的保守自我限速
    （`_RateGate`，1 req/s），並疊加既有 Redis 快取（`PricingService.get_us_stock_price`，
    TTL 沿用 `STOCK_QUOTE_TTL_SECONDS` 同一數值）進一步降低對外實際呼叫次數。
  - 未驗證盤前/盤後（extended hours）與非美股（如 ADR、部分 OTC）的欄位是否一致，本次僅驗證
    主板普通股（`AAPL`）；task 實作時若使用者回報特殊代號查價異常，需視情況另開任務調查。
- **後續可能觸發的 ADR**：若正式使用後發現此端點穩定性不足（頻繁改版 / 常態性阻擋），需開新
  ADR 評估改用付費第三方行情 API，屆時本 ADR 狀態改為 `Superseded by ADR-{NNNN}`。

## 參照

- 對應規則：`→ BE-058`（第三方串接位置）、`→ BE-064`（錯誤轉換）、`→ BE-068`（client 端限速）
- 對應既有 ADR：`docs/Arch/adr/0001-stock-price-source.md`（台股，同一類「非官方端點」風險接受
  先例）、`docs/Arch/adr/0002-metal-price-source.md`（`ExchangeRateClient` 複用來源）
- 實測記錄（本次 session，2026-09-09，`WebFetch` 實際請求）：
  - 成功：`GET https://query1.finance.yahoo.com/v8/finance/chart/AAPL` → `chart.result[0].meta.regularMarketPrice = 316.22`，`chart.error = null`
  - 查無資料：`GET https://query1.finance.yahoo.com/v8/finance/chart/ZZZZINVALIDTICKER` → HTTP 404（無 JSON body）
