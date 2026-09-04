---
id: task-002
title: PIN 登入後端支援
status: done
parallel: true
depends_on: []
affected_files:
  - backend/app/models/user.py
  - backend/alembic/versions/{rev}_add_pin_to_user_credentials.py
  - backend/app/schemas/auth.py
  - backend/app/api/v1/auth.py
  - backend/app/services/auth_service.py
  - backend/app/repositories/user_repository.py
  - backend/tests/api/test_auth_pin.py
estimated_hours: 6
rules: [rules/20-backend/02-auth.md, rules/30-database/03-passwords-and-pii.md, rules/30-database/07-alembic.md, rules/00-core/04-api-docs.md]
---
## 目標

`design-spec.md` §12.2：`UserCredential` 新增 `pin_hash`（bcrypt，沿用 `app.core.security.pwd_context`）、`pin_updated_at`、`pin_failed_attempts`、`pin_locked_until` 四欄；新增 4 個 `/auth` endpoint：`POST /auth/pin`（首次設定，需密碼重驗證，已設定回 409）、`PATCH /auth/pin`（變更，需舊 PIN）、`DELETE /auth/pin`（停用，需密碼重驗證）、`POST /auth/login/pin`（`{user_uid, pin}` 快速登入，成功比照 `/auth/login` 回傳 `UserResponse` + 設定既有 httpOnly cookie）。鎖定機制：連續失敗 5 次鎖定 15 分鐘（`→ A15`），鎖定期間一律回 429 且不比對 PIN；成功時歸零。`user_uid` 不存在或該使用者未設定 PIN 時，`POST /auth/login/pin` 回與「PIN 錯誤」**同一句**通用 401 訊息，避免帳號列舉（比照 `AuthService.login()` 現有 `_LOGIN_FAILED_DETAIL` 慣例，`→ tasks-v1.1.0.md` 頂部盲點掃描備註）。

## Acceptance

- [ ] `docker compose exec backend uv run pytest tests/api/test_auth_pin.py` 全綠，含：首次設定成功、已設定再設定回 409、變更 PIN 需驗證舊 PIN、停用需驗證密碼、`POST /auth/login/pin` 成功設 cookie、連續 5 次失敗後第 6 次回 429、鎖定期間正確 PIN 也回 429、成功登入後 `pin_failed_attempts` 歸零、`user_uid` 不存在與「未設定 PIN」回傳**同一句** 401 訊息
- [ ] alembic `upgrade head` / `downgrade -1` round-trip OK（新欄位皆 nullable 或有 default，既有列不受影響）
- [ ] 未帶 JWT 呼叫 `POST/PATCH/DELETE /auth/pin` 回 401；`POST /auth/login/pin` 不需 JWT
- [ ] `docker compose exec backend uv run mypy app` 全綠

## 必讀檔（Just-in-time）

- rules/20-backend/02-auth.md
- rules/30-database/03-passwords-and-pii.md
- rules/30-database/07-alembic.md
- rules/00-core/04-api-docs.md
