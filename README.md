# Expense Tracker Web

個人記帳網站：收支記錄、多帳戶（含外幣）、分類統計、預算追蹤、固定收支、資產淨值總覽。

## 技術棧

- **前端**：Next.js 16（App Router）+ React 19 + TypeScript（strict）+ Redux Toolkit / RTK Query + Tailwind CSS v4
- **後端**：Python 3.14 + FastAPI + SQLAlchemy 2（async）+ Pydantic 2 + Alembic + uv
- **資料庫**：PostgreSQL 18（asyncpg）
- **快取**：Redis 8（報價/匯率快取、既有 session 相關用途）
- **執行環境**：Docker Compose（開發與正式環境共用同一份 compose，差異只在 env）

## 主要功能

- **多帳戶管理**：現金、銀行等帳戶，支援 10 種常見幣別（TWD/USD/JPY/EUR/CNY/HKD/GBP/AUD/KRW/THB），
  建立後幣別不可變更
- **收支記錄**：新增/編輯/刪除交易，分類管理，支援固定週期收支（週/月/年）自動產生交易
- **帳戶互轉**：雙分錄記帳，轉帳不計入當月收支；跨幣別轉帳自動以即時匯率換算轉入金額
- **預算追蹤**：依分類設定月度預算上限，即時顯示剩餘額度（跨幣別支出自動換算成 TWD 計算）
- **資產總覽**：股票、貴金屬等浮動資產報價（TWSE、Yahoo Finance、gold-api），外幣帳戶餘額即時
  換算成 TWD 計入總資產/淨資產
- **統計分析**：分類圓餅圖/長條圖、收支趨勢線圖、日/週/月/年區間彙總
- **帳號安全**：Email + 密碼登入，支援 PIN 快速登入

## 本地開發

需求：Docker + Docker Compose（宿主機不需另裝 Python / Node，前後端都在容器內執行）。

```bash
# 複製環境變數範本並依需求調整（機密值請自行填寫，勿沿用範例值）
cp .env.development.example .env

# 啟動（背景執行，含資料庫 migration）
docker compose up -d --build
docker compose exec backend alembic upgrade head

# 開發時持續監看檔案變更並自動重建
docker compose watch
```

啟動後：前端 http://localhost:3000，後端 API http://localhost:8000/api/v1（Swagger 文件在
`/api/docs`）。

### 常用指令

```bash
# 停止服務
docker compose stop

# 後端 lint / type check / 測試
docker compose exec backend sh -c "uv run ruff check . && uv run ruff format --check . && uv run mypy app && uv run pytest"

# 前端 lint / type check / 測試 / build
docker compose exec frontend sh -c "npm run lint && npm run typecheck && npm run test -- --run && npm run build"

# 新增 Alembic migration
docker compose exec backend alembic revision -m "描述"
```

## 專案結構

```
.
├── backend/            # FastAPI 應用（app/、alembic/、tests/）
├── frontend/            # Next.js 應用（src/app/、src/components/、src/lib/）
├── docs/
│   ├── Arch/           # 架構決策紀錄（ADR）與長期方向
│   ├── Rules/          # 專案級開發規則（只能比 harness 規則更嚴）
│   └── Tasks/          # 各版本規劃（propose）與實作進度（tasks / fixed）
├── docker-compose.yml
└── AGENTS.md / CLAUDE.md   # AI 協作開發規範
```

## 文件導航

- [架構決策](./docs/Arch/README.md)
- [開發規則](./docs/Rules/README.md)
- [版本任務與進度](./docs/Tasks/README.md)

## 授權

個人專案，尚未附加開源授權條款。
