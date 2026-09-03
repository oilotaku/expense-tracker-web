---
id: task-011
title: 股票報價來源 spike
status: done
parallel: true
depends_on: []
affected_files:
  - docs/Arch/adr/0001-stock-price-source.md
estimated_hours: 2
rules: [docs/Arch/README.md, rules/20-backend/06-clients.md]
---
## 目標

調查台灣證交所公開資訊（openapi.twse.com.tw 或同等來源）取得個股即時 / 近即時價格的可行性：是否需要 API key、速率限制、回傳格式、免費額度、資料延遲程度。純調查，不寫程式碼；結論供 task-013 / task-014 實作依據。propose 已定案優先用證交所公開資訊，若證交所無法滿足需求（如個股覆蓋不全），需在 ADR 中列出備選方案並說明取捨。

## Acceptance

- [ ] `docs/Arch/adr/0001-stock-price-source.md` 存在，格式符合 `docs/Arch/README.md` 的 ADR 範本
- [ ] ADR 含「決策」「速率限制 / 延遲」「回傳格式範例（實際打過 API 或查過官方文件的範例 response）」三段
- [ ] 狀態標記為 `Accepted`（若調查後判定不可行，標 `Rejected` 並在拒絕方案段寫明原因，另開一份新 ADR 選替代方案）

## 必讀檔（Just-in-time）

- docs/Arch/README.md
- rules/20-backend/06-clients.md
