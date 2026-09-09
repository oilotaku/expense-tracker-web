# Expense Tracker Web

個人記帳網站，追蹤日常收支與分類統計

## 概述

Expense Tracker Web 是一個全棧 Web 應用程式，用於記錄、管理和分析個人日常開支。

- 🎯 **核心功能**：記錄收支、分類統計、視覺化分析
- 🏗️ **架構**：Python 後端 + TypeScript/JavaScript 前端
- 📊 **技術棧**：
  - **後端**：Python (60.1%)
  - **前端**：TypeScript (31.3%) + JavaScript (7.7%)
  - **部署**：Docker (0.7%)

## 快速開始

### 前置需求

- Python 3.x
- Node.js & npm
- Docker (可選)

### 本地開發

```bash
# 後端
cd backend
pip install -r requirements.txt
python app.py

# 前端
cd frontend
npm install
npm start
```

### Docker 部署

```bash
docker build -t expense-tracker-web .
docker run -p 5000:5000 expense-tracker-web
```

## 文件結構

```
.
├── docs/
│   ├── Arch/          # 長期架構決策與設計
│   ├── Rules/         # 專案級開發規則
│   └── Tasks/         # 版本實作任務與進度
├── backend/           # Python 後端應用
├── frontend/          # TypeScript/JavaScript 前端
└── README.md          # 本檔
```

## 文檔導航

- **[架構決策](./docs/Arch/README.md)** - 系統架構、ADR 與長期方向
- **[開發規則](./docs/Rules/README.md)** - 專案級開發規範與約束
- **[任務管理](./docs/Tasks/README.md)** - 版本計劃與實作進度

## 主要功能

### 收支記錄
- 新增/編輯/刪除交易記錄
- 分類管理（收入、支出、轉帳等）
- 日期、金額、備註等詳細資訊

### 統計分析
- 按分類統計
- 時期對比（日/週/月/年）
- 視覺化圖表（長條圖、圓餅圖等）

### 預算管理
- 設置預算上限
- 支出提醒
- 預算執行情況分析

## 貢獻指南

1. Fork 本專案
2. 建立特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交變更 (`git commit -m 'Add AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 開啟 Pull Request

請遵守 [開發規則](./docs/Rules/README.md) 與 [架構決策](./docs/Arch/README.md)。

## 執行狀態

- **當前版本**：參見 [Tasks](./docs/Tasks/README.md)
- **已修復問題**：參見各版本 `fixed.md`
- **架構報告**：參見 [Reflect Reports](./docs/Tasks/reflect/)

## 授權

請查看 LICENSE 文件。

## 聯絡

有問題或建議？提交 Issue 或 PR。
