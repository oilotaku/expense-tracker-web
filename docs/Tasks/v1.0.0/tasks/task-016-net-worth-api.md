---
id: task-016
title: 總資產 / 總負債彙總 API
status: done
parallel: false
depends_on: [task-002, task-013, task-014, task-015]
affected_files:
  - backend/app/services/net_worth_service.py
  - backend/app/api/v1/net_worth.py
  - backend/app/schemas/net_worth.py
  - backend/tests/api/test_net_worth.py
estimated_hours: 4
rules: [rules/20-backend/08-performance.md, rules/30-database/05-precision.md, rules/20-backend/05-exceptions-and-logging.md]
---
## 目標

彙總：現金帳戶（task-002）餘額加總 + 金融資產（task-013）以 task-014 的快取報價換算市值 − 負債（task-015），回傳總資產、總負債、淨資產三個數字。

## Acceptance

- [ ] `docker compose exec backend uv run pytest tests/api/test_net_worth.py` 全綠，含帳戶 + 股票資產 + 貴金屬資產 + 負債混合的案例，驗證淨資產 = 總資產 − 總負債
- [ ] 外部報價來源逾時 / 失敗時單一測試案例回傳 5xx 以外的明確錯誤（非整個服務崩潰），具體處理方式由 worker 依 `rules/20-backend/05-exceptions-and-logging.md` 決定

## 必讀檔（Just-in-time）

- rules/20-backend/08-performance.md
- rules/30-database/05-precision.md
- rules/20-backend/05-exceptions-and-logging.md
