---
id: task-014
title: 報價 client + Redis 快取層
status: pending
parallel: false
depends_on: [task-011, task-012, task-013]
affected_files:
  - backend/app/clients/stock_price_client.py
  - backend/app/clients/metal_price_client.py
  - backend/app/core/cache.py
  - backend/app/services/pricing_service.py
  - docker-compose.yml
  - .env
  - backend/pyproject.toml
  - backend/tests/services/test_pricing_service.py
estimated_hours: 5
rules: [rules/40-cache/00-overview.md, rules/40-cache/01-keys-and-ttl.md, rules/40-cache/02-patterns.md, rules/20-backend/06-clients.md]
---
## 目標

依 task-011 / task-012 的 ADR 結論，實作股票與貴金屬報價 client；因報價需要快取以避免超過外部來源速率限制（propose 對外承諾），此 task 需把 `docker-compose.yml` 與 `.env` 的 `use_redis` 從 false 改為 true（新增 `redis` service、`backend` 加 `redis[hiredis]` 依賴，`app/core/cache.py` 為 scaffold 產的樣板需補實作），TTL 依 ADR 記載的速率限制設定。

## Acceptance

- [ ] `docker compose exec backend uv run pytest tests/services/test_pricing_service.py` 全綠，用 `respx` 或 `httpx.MockTransport` mock 外部 API，**禁**在測試中真打外部網路
- [ ] 測試斷言：連續兩次呼叫同一標的在 TTL 內只呼叫外部 API 一次（mock call count）
- [ ] `docker compose up -d --build` 後 `docker compose ps` 顯示 `redis` service healthy
- [ ] `docker compose exec backend python -c "..."` 呼叫 health endpoint 含 `"redis": "ok"`

## 必讀檔（Just-in-time）

- rules/40-cache/00-overview.md
- rules/40-cache/01-keys-and-ttl.md
- rules/40-cache/02-patterns.md
- rules/20-backend/06-clients.md
