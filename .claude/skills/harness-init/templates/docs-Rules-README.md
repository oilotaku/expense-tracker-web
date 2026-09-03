# docs/Rules — 專案級規則

只屬於本專案的開發規則。harness 的 `rules/` 是模板、不能改；這裡的規則**只能比模板更嚴**，不能放寬。優先序：`harness rules > docs/Rules > docs/Arch > AGENTS.md > docs/Tasks`。

## 新增一條規則

1. 複製 `_template.md` 為 `NN-<主題>.md`（例 `01-orders.md`；`_` 開頭檔不被載入），填 frontmatter：

```markdown
---
area: PROJ
file: 01-orders
title: 訂單模組
load_on: [orders, checkout]
rules: [PROJ-001, PROJ-002]
---

# 訂單模組

- **PROJ-001** 訂單金額一律用 `Numeric(18,2)`，禁 float。
- **PROJ-002** 取消訂單只能軟刪除並記 `cancelled_at`。
```

2. 在專案 `AGENTS.md § Project Rules` 的表加一列：`訂單 / 結帳 → docs/Rules/01-orders.md`。
3. ID `PROJ-NNN` 連號、全專案唯一；引用寫 `→ PROJ-001`。
4. 驗：`node <harness>/scripts/check-rules.mjs --project .`（唯一、連號、frontmatter 與正文一致、引用的 harness ID 存在）。
5. 違反時記進 `docs/Tasks/v*/fixed.md`，`rule: PROJ-001`。

`/harness-init --refresh` 不會動本資料夾與 `AGENTS.md § Project Rules`。
