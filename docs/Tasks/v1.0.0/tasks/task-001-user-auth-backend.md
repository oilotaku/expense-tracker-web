---
id: task-001
title: 使用者認證（後端）
status: done
parallel: true
depends_on: []
affected_files:
  - backend/app/models/user.py
  - backend/app/schemas/auth.py
  - backend/app/api/v1/auth.py
  - backend/app/repositories/user_repository.py
  - backend/app/services/auth_service.py
  - backend/alembic/versions/{rev}_add_users.py
  - backend/tests/api/test_auth.py
estimated_hours: 5
rules: [rules/20-backend/02-auth.md, rules/30-database/03-passwords-and-pii.md, rules/30-database/07-alembic.md, rules/30-database/01-identifiers.md]
---
## 目標

提供註冊 / 登入 API，密碼雜湊儲存，簽發 JWT。之後所有 task 的資料表都以 `user_id` 外鍵掛在這個使用者底下，帳本各自獨立（不共享，見 propose Out of Scope）。

## Acceptance

- [ ] `docker compose exec backend uv run pytest tests/api/test_auth.py` 全綠
- [ ] `docker compose exec backend uv run alembic upgrade head && docker compose exec backend uv run alembic downgrade -1` round-trip 皆 exit 0
- [ ] 密碼欄位儲存的是雜湊值，不是明文（test 斷言 DB 內容 != 原始密碼）
- [ ] 註冊同一 email 兩次回 4xx，不是 500

## 必讀檔（Just-in-time）

- rules/20-backend/02-auth.md
- rules/30-database/03-passwords-and-pii.md
- rules/30-database/07-alembic.md
- rules/30-database/01-identifiers.md
