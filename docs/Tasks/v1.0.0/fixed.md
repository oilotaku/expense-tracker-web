# fixed — v1.0.0（expense-tracker-web）

> 本版累積的違規 / bug 根因。每段一條，由 agent 在修正當下寫入；`guard-write` hook 機械驗每段格式。
> 格式唯一寫處：`HARNESS_HOME/rules/00-core/10-propose-tasks-fixed.md`（→ CORE-072）。
> 欄位名與冒號**逐字照抄下面的範本**：hook 驗的是 `## §N — ` 與半形冒號的 `- **rule**:`，換成全形冒號會被擋。

<!--
每段格式（§ 連號；時間 ISO 8601 帶 offset）：

## §1 — <一句話標題>

- **time**: {YYYY-MM-DD}T10:00:00+08:00
- **commit**: `<hash>` / PR `#<num>`（尚未 commit 寫 `pending`）
- **files**: `path/to/file.py:42`
- **問題**: <現象 / log；使用者或 agent 觀察到什麼>
- **根因**: <為什麼發生的系統性原因；禁只寫「typo」「忘了」「漏掉」>
- **修正**: <怎麼改；多步驟 1./2./3.>
- **rule**: <違反 / 推翻的規則 ID，如 CORE-029；無對應規則寫 `NONE`>
- **後續**: <是否 reflect 候選 / 補測試 / 棄用規則 / 見 tasks-v*.md §N>
-->
