# ADR-0005: 基金淨值資料來源

- **狀態**：Accepted
- **日期**：2026-10-15
- **決策者**：本次 session（Claude Code），待人類複核

## 背景（Context）

使用者要求金融資產新增「基金」類型（既有：台股 `stock`、美股 `us_stock`、貴金屬 `metal`）。
基金以「單位」計數、價格是每單位淨值（NAV），每個交易日更新一次；境內外基金的計價幣別不一，
需要換算成 TWD 才能進淨資產彙總。本 ADR 只處理「淨值資料源」：端點、代號格式、回應欄位、
查無資料時的行為、換算與快取。

## 決策（Decision）

採用 **鉅亨網基金 API（非官方、免 API key）** 的單檔淨值端點：

```
GET https://fund.api.cnyes.com/fund/api/v1/funds/{cnyesId}/nav
```

- 回應 `items` 為物件：`nav` 是**陣列**（最新淨值在 `[0]`）、`prevPrice`、`priceDate`（epoch）、
  `classCurrency`（ISO 幣別，如 `"TWD"`／`"EUR"`）、`classCurrencyName`、`displayNameLocal`
  （中文全名）、`cnyesId`、`fundYesId`、`isin`、`onshore`。
- 實測（2026-10-15，不帶 User-Agent 也 200）：
  - `A16003`（群益馬拉松基金）→ `nav[0] = 528.95`、`classCurrency = "TWD"`。
  - `B16,009`（景順全歐洲小型企業基金）→ `nav[0] = 41.48`、`classCurrency = "EUR"`。
- **代號格式不一致，必須與鉅亨網 `cnyesId` 完全相同**：境內基金無逗號（`A16003`；`A16,003`
  回 404），境外基金含逗號（`B16,009`；`B16009` 回 404），另有 `B280038`、`B4ZSO9t` 這類
  混大小寫 7 字元代號。全清單 9,417 檔、代號最長 7 字元。
- 查無此代號時端點回 **HTTP 404 且 body 是 text/html**（不是 JSON）；另曾觀察到
  `{"items": [], "statusCode": 404}` 這種 JSON 404。`app/clients/fund_nav_client.py` 把 404、
  非 JSON、`items` 非物件三種情況都對應成 `FundNavNotFoundError`（404）。
- 後端 `name` 欄位**原樣存 `cnyesId`**：不轉大寫、不正規化逗號，只用
  `^[A-Za-z0-9]{2,7}(,[A-Za-z0-9]{1,4})?$` 擋掉空白／中文等明顯不是代號的輸入。
- 台幣換算：`classCurrency != "TWD"` 時沿用既有 `ExchangeRateClient`（`open.er-api.com`，
  → ADR-0002）的 `PricingService.get_exchange_rate(currency, "TWD")`，共用同一份匯率快取；
  TWD 級別不查匯率。
- 快取：`FUND_NAV_TTL_SECONDS = 600`（淨值每日更新，10 分鐘足夠）；client 端 1 req/s 自限
  （同 ADR-0003 的 `_RateGate`）。

## 拒絕方案（Rejected）

- **鉅亨網搜尋端點** `v2/search/fund?keyword=`：實測不管關鍵字都回同一份清單，無法做名稱→代號
  的查詢，所以前端不提供搜尋，由使用者到 fund.cnyes.com 自查代號。
- **Yahoo 奇摩基金**：無穩定 JSON 端點，頁面結構易變。
- **投信投顧公會（SITCA）淨值資料**：只涵蓋境內基金，且為表單下載，不適合即時查詢。
- **付費基金資料 API**：本專案不付費。

## 後果（Consequences）

- 非官方端點，與 ADR-0001／0003 同一類風險：可能無預警改格式或停用；`_NavResponse` 用 pydantic
  驗證，格式異常對應成 502 `FUND_NAV_ERROR`，由淨資產彙總端決定呈現。
- 使用者必須照鉅亨網的代號輸入（含逗號、大小寫），輸入名稱會查不到淨值；前端表單已加說明與
  `pattern` 提示。
- 淨值每日更新，TTL 10 分鐘與 1 req/s 限速足夠；持有多檔基金時逐檔平行查詢（與美股／貴金屬
  同路徑，→ `net_worth_service.py`）。

## 參照

- BE-058／BE-064／BE-068（外部 client 錯誤家族、限速）。
- ADR-0001（TWSE MIS）、ADR-0002（貴金屬與匯率）、ADR-0003（美股）。
