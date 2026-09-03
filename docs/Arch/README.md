# Arch — 長期架構方向（expense-tracker-web）

> **本資料夾用途**：跨版本的**長期架構決策**與設計取捨（ADR）。**不**寫實作規範（那在 harness `rules/`），**不**寫單版本任務（那在 `docs/Tasks/`）。
>
> **規則優先序**：`rules/* > docs/Rules/* > docs/Arch/* > AGENTS.md / CLAUDE.md > docs/Tasks/*`（唯一寫處 `HARNESS_HOME/rules/00-core/00-overview.md`）

---

## 什麼進來、什麼不該進來

### 進來

- **架構決策紀錄（ADR）**：重大選型 / 取捨 / 被拒方案的脈絡（例：為什麼選 RTK Query 而非 SWR）
- **跨服務圖**：系統 context、資料流、認證流程、部署拓撲（高層次）
- **長期演進方向**：下 6–12 個月要往哪走
- **跨版本不變的契約**：對外 API 設計哲學、核心資料模型關係

### 不該進來

- 程式碼風格 / 命名 / 型別規則 → harness `rules/<area>/00-overview.md`
- 單版本要做什麼 → `docs/Tasks/v{X.Y.Z}/propose-v{X.Y.Z}.md`
- bug 根因 → `docs/Tasks/v{X.Y.Z}/fixed.md`
- 套件版本 → harness `rules/00-core/01-versions.md`

---

## 結構

```
docs/Arch/
├── README.md              # 本檔
├── overview.md            # 系統 context 圖 + 資料流（可選）
├── adr/
│   ├── 0001-<kebab-title>.md
│   └── ...
├── backup-restore-log.md  # 還原演練紀錄（→ CICD-087）
└── roadmap.md             # 長期方向（可選）
```

`adr/` 為主軸；其餘依需要建立，**禁**為了看起來完整湊檔。

---

## ADR 格式

Michael Nygard ADR 簡化版。檔名 `{NNNN}-{kebab-title}.md`（4 位連號）：

```markdown
# ADR-{NNNN}: <一句話標題>

- **狀態**：Proposed | Accepted | Deprecated | Superseded by ADR-{MMMM}
- **日期**：{YYYY-MM-DD}
- **決策者**：<人 / 角色>

## 背景（Context）
<為什麼要做這個決定；當時的 constraints>

## 決策（Decision）
<選了什麼；一句話 + 必要細節>

## 拒絕方案（Rejected Alternatives）
- **<方案 A>**：<為什麼不選>

## 後果（Consequences）
- **正向**：
- **負向 / Trade-off**：<清楚寫出代價>
- **後續可能觸發的 ADR**：

## 參照
- 對應規則（若有）：`→ <AREA>-NNN`
- 對應 task / fixed（若有）：`docs/Tasks/v{X.Y.Z}/...`
```

## ADR 規則

- **不可變更**：Accepted 後禁直接改；改決策 → 開新 ADR，舊 ADR 狀態改 `Superseded by ADR-{NNNN}`
- **棄用 ≠ 刪除**：改 `Deprecated`，留檔
- **連號**：跳號要寫明原因
- 一個 ADR = 一個決策

## 何時寫 ADR

- 影響**多版本 / 多模組**的決策
- 偏離業界預設的選擇
- 以**取捨**為核心（好處 X 代價 Y）
- 反之：小範圍 / 一次性實作選擇 → 寫進 PR description 或 task 即可

## 與其他資料夾的差異

| | harness `rules/` | Arch（本檔） | Tasks |
| --- | --- | --- | --- |
| 內容 | 實作規範（do / don't，帶 ID） | 長期方向 + ADR | 版本目標 + 執行單元 + fixed |
| 變動頻率 | 低（`/harness-reflect` 升規） | 低（ADR 不可變） | 高（每版本） |
| 優先序 | 最高 | 中 | 最低 |
