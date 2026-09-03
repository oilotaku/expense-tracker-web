---
id: task-012
title: 貴金屬報價來源 spike
status: done
parallel: true
depends_on: []
affected_files:
  - docs/Arch/adr/0002-metal-price-source.md
estimated_hours: 2
rules: [docs/Arch/README.md, rules/20-backend/06-clients.md]
---
## 目標

調查黃金 / 白銀等貴金屬牌價來源（如銀行牌價網站、台灣銀行黃金存摺牌價）是否有穩定可用的 API；若無正式 API，評估爬蟲的可行性、網站條款風險與更新頻率。純調查，不寫程式碼；結論供 task-013 / task-014 實作依據。

## Acceptance

- [ ] `docs/Arch/adr/0002-metal-price-source.md` 存在，格式符合 `docs/Arch/README.md` 的 ADR 範本
- [ ] ADR 含「決策」「速率限制或爬蟲風險（含網站條款是否允許）」「回傳格式或頁面結構範例」三段
- [ ] 若選擇爬蟲，ADR 需明確標註更新頻率上限（避免高頻爬蟲對來源網站造成負擔）

## 必讀檔（Just-in-time）

- docs/Arch/README.md
- rules/20-backend/06-clients.md
