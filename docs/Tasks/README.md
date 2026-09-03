# Tasks — 版本實作真相（expense-tracker-web）

> **本資料夾用途**：每個版本的**實作真相**（propose / tasks / fixed）與累積報告（reflect / scan）。**不**寫規範（在 harness `rules/`），**不**寫長期架構（在 `docs/Arch/`）。
>
> **規則優先序**：`rules/* > docs/Arch/* > AGENTS.md / CLAUDE.md > docs/Tasks/*`（本資料夾最低）
>
> **格式來源**：`HARNESS_HOME/rules/00-core/10-propose-tasks-fixed.md`（propose / tasks / fixed 三種格式的唯一寫處）。本檔只是目錄索引。

---

## 結構

```
docs/Tasks/
├── README.md
├── v1.0.0/
│   ├── propose-v1.0.0.md        # User 寫：版本目標
│   ├── tasks-v1.0.0.md          # Agent 拆：執行單元清單（進度唯一真相）
│   ├── tasks/                   # 細分子任務（可選，multi-agent 用）
│   └── fixed.md                 # 違規 / bug 根因（本版累積，每條帶 rule: ID）
├── reflect/
│   └── reflect-report-{YYMMDDHHMMSS}.md     # /harness-reflect 產
└── scan-project/
    └── scan-{YYMMDDHHMMSS}.md               # /harness-scan 產
```

## 各檔對應

| 檔 | 由誰寫 | 格式 |
| --- | --- | --- |
| `propose-v{X.Y.Z}.md` | User | `rules/00-core/10-propose-tasks-fixed.md` |
| `tasks-v{X.Y.Z}.md` + `tasks/task-NNN-*.md` | Agent（`/propose-to-tasks`） | 同上 |
| `fixed.md` | Agent（違規當下） | 同上（`## §{N} — 標題` + `rule:` 欄；`guard-write` hook 機械驗） |
| `reflect/*.md` | `/harness-reflect` | `HARNESS_HOME/skills/harness-reflect/SKILL.md` |
| `scan-project/*.md` | `/harness-scan` | `HARNESS_HOME/skills/harness-scan/SKILL.md` |

## 何時讀

| 任務 | 讀哪 |
| --- | --- |
| 啟動新版本 | 開 `v{X.Y.Z}/` + 寫 `propose-v{X.Y.Z}.md` |
| 拆 task | 只讀**當版** propose，不預載歷史版本 |
| Worker 認領 | 當版 `tasks-v*.md`，依該 task 的必讀檔載入 harness `rules/` |
| 寫 fixed | 當版 `fixed.md` |
| `/harness-reflect` | **全版本** `v*/fixed.md`（例外：跨版本分析） |
| `/harness-scan` | 最新一份 `scan-project/*.md` 做差異基準 |

## 禁預載

歷史版本 `tasks-v*.md` / `fixed.md`、`reflect/*`、`scan-project/*` 不預載到一般任務。

## 版本命名

3-digit semver `v{MAJOR}.{MINOR}.{PATCH}`；patch 不開資料夾，fix 寫進該 minor 的 `fixed.md`。判準見 `rules/00-core/11-rule-evolution.md`。

## 累積不刪

`reflect/` `scan-project/` 累積式，**禁**刪舊報告；棄用條目加 `> 後續：已棄用，見 v{X.Y.Z} §M`，不移除。
