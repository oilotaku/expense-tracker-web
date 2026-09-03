---
name: stop-dev
description: 停止 harness 專案的開發環境：先結束 `/start-dev` 留在背景的 `docker compose watch`，再 `docker compose stop`（容器與 named volume 保留，資料不丟）。當使用者說「停止專案 / 關掉 / 停 dev / stop dev / 關閉開發環境」時觸發。不適用：要清資料（`down -v` 一律禁止；要重建資料先備份、由人手動刪 volume）、要 kill 其他不相干的 process。
---

# stop-dev

配對 `/start-dev`。只做兩件事：停 watch、停容器。

## 心法

1. **只停不刪**：`stop` 保留容器與 volume，下次 `/start-dev` 直接接上
2. **冪等**：沒東西在跑就回報「未在跑」

## 執行步驟

### 1. cwd 健全性檢查

`docker-compose.yml` 存在；否則中止：「請 `cd` 到專案根目錄再跑 `/stop-dev`」。

### 2. 停 watch

若本次對話有 `/start-dev` 開的背景工作（`docker compose watch --no-up`）→ 用 TaskStop 結束它。沒有則略過。

### 3. 停容器

```bash
docker compose stop
```

`docker compose ps --format json` 為空或全部 `exited` 即完成。本來就沒在跑 → 回報「未在跑」。

### 4. 回報

列出被停止的 service；附一句：「容器與資料 volume 已保留；要清資料**不要** `down -v`，先備份再由人手動刪 volume（`→ CICD-052`）。」

## 自我約束

- **禁**改任何檔
- **禁** `docker compose down`（任何旗標）
- **禁** kill 任何宿主機 process（本 harness 沒有本機 dev server）
