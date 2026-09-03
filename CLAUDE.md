# CLAUDE.md

@AGENTS.md

Claude Code 特有能力見 `HARNESS_HOME/CLAUDE.md`（hooks 硬擋 / sub-agent / 週期任務 / 收參 / 獨立評分）；本檔不重述。`HARNESS_HOME` 解析順序見 `AGENTS.md § Harness`。

## Hooks（本專案已安裝）

`.claude/hooks/guard-bash.mjs` 與 `.claude/hooks/guard-write.mjs` 由 `/harness-init` 從 `HARNESS_HOME/hooks/` 複製，`.claude/settings.json` 來源 `HARNESS_HOME/hooks/settings.template.json`。擋什麼見 `HARNESS_HOME/CLAUDE.md § 1`。
