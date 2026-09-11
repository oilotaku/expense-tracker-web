---
id: task-034
title: 補上 POST /auth/logout，httpOnly cookie 可主動撤銷
status: done
parallel: true
depends_on: []
affected_files:
  - backend/app/api/v1/auth.py
  - backend/tests/api/test_auth.py
  - frontend/src/lib/api/authApi.ts
  - frontend/src/app/settings/page.tsx
  - frontend/src/app/settings/page.test.tsx
estimated_hours: 2
rules: []
---

> 來源：使用者請求的專案改善優化建議掃描（非 task-021 執行中發現，CORE-068 拆補洞 task，新編號不覆寫既有 task）。解除 `fixed.md` §4 記錄的既存缺口（既存自 v1.0.0，task-021 首次暴露）：`backend/app/api/v1/auth.py` 一直沒有 `POST /auth/logout`，前端登出只能清 RTK Query 快取，httpOnly cookie 只能等 TTL（8 小時）自然過期，裝置遺失時無法立即撤銷登入態。

## 目標

1. **後端**：`backend/app/api/v1/auth.py` 新增 `POST /auth/logout`，呼叫既有但從未被使用的 `app/core/cookies.py::clear_jwt_cookie()` 清除 `access_token` cookie；不要求登入態（未帶 cookie 呼叫也應成功，冪等）。
2. **前端**：`frontend/src/lib/api/authApi.ts` 新增 `useLogoutMutation`（`POST auth/logout`，成功回應 `ApiResponse[None]`，同 `setPin` 不經 `unwrapData`）。`frontend/src/app/settings/page.tsx` 的 `handleLogout` 改為呼叫該 mutation（失敗也不擋登出流程，仍清 RTK Query 快取並導回 `/login`），移除原本說明「後端缺口」的註解。

## Acceptance

- [x] `POST /auth/logout` 回應 `Set-Cookie: access_token=""; Max-Age=0; ...`（cookie 立即失效），登入中呼叫後再打 `GET /auth/me` 回 401
- [x] 未帶 cookie 直接呼叫 `POST /auth/logout` 仍回 200（冪等，不因未登入而報錯）
- [x] `docker run ... uv run pytest tests/api/test_auth.py -v` 全綠，含新增的 `test_logout_clears_cookie_and_revokes_session`、`test_logout_without_cookie_still_succeeds`
- [x] `uv run mypy app` 全綠；`uv run ruff check . && uv run ruff format --check .` 全綠
- [x] 前端 `npm run lint && npm run typecheck && npm run test -- --run && npm run build` 全綠，含更新後的 `settings/page.test.tsx`（mock `useLogoutMutation`，驗證登出成功與登出 API 失敗兩種情境都會清快取並導回 `/login`）
- [x] `git status --porcelain` 只多出本 task 的 5 個 `affected_files`

## 必讀檔（Just-in-time）

- `docs/Tasks/v1.1.0/fixed.md` §4（本 task 要解除的既存缺口記錄）
- `backend/app/core/cookies.py`（`clear_jwt_cookie` 既有但未被呼叫的既有實作）
