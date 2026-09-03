# CLAUDE.md

@AGENTS.md

跨工具規則**唯一來源是 `AGENTS.md`**，本檔不重述。以下只放 Claude Code 特有能力的強化路徑：工具更強只可加強遵守，不可降低。

## 1. 毀滅性操作：文字禁令 → harness 硬擋

`/harness-init` 把 `hooks/*.mjs` 複製到專案 `.claude/hooks/`，並寫入 `.claude/settings.json`（來源 `hooks/settings.template.json`）：

```json
{
  "permissions": {
    "deny": [
      "Bash(rm -rf:*)", "Bash(git push --force:*)", "Bash(git push -f:*)",
      "Bash(git reset --hard:*)", "Bash(docker compose down -v:*)", "Bash(docker-compose down -v:*)"
    ]
  },
  "hooks": {
    "PreToolUse": [
      { "matcher": "Bash",       "hooks": [{ "type": "command", "command": "node .claude/hooks/guard-bash.mjs" }] },
      { "matcher": "Write|Edit|MultiEdit", "hooks": [{ "type": "command", "command": "node .claude/hooks/guard-write.mjs" }] }
    ]
  }
}
```

| hook | 擋什麼 |
| --- | --- |
| `guard-bash.mjs` | token 解析（非字串比對）：`DROP TABLE/SCHEMA/DATABASE/COLUMN`、`rm -rf` 變體、`down -v`、`FLUSHALL/FLUSHDB`、`--no-verify`；`git commit` 時 staged 含非 `.example` 的 `.env` → 擋；commit message 不符 `(AI)? <類型>: ` → 擋 |
| `guard-write.mjs` | 寫 `docs/Tasks/*/fixed.md` 驗格式（`## §N — 標題` + `- **rule**:`）；寫 `rules/**.md` 驗規則 ID 全庫唯一（含 MultiEdit 的每段 `new_string`） |

deny 擋明文、hook 擋變體；hook 不得放行已被 deny 的動作。跨工具的 git 原生 hook（`hooks/git/` → 專案 `.githooks/`）見 `AGENTS.md § Git Workflow`，兩層並存。離線測試：`node hooks/test/run.mjs`。

## 2. Multi-agent

- `/propose-to-tasks` 拆完後 worker 用 sub-agent 派發；同檔衝突用 git worktree 隔離；`tasks-v*.md` 是進度唯一真相
- `/harness-scan` 依 area（env / fe / be / db / cache / sec）派**唯讀** sub-agent 並行，只回結論與路徑，不回全文
- sub-agent 繼承 permission mode 與 deny / hook；context 隔離 ≠ 權限隔離

## 3. 週期任務

`/harness-reflect` 月度用 schedule 觸發；產出是候選報告，升規在 PR 自行決議。無實質更新以 `[SILENT]` 開頭。

## 4. 收參

- `/harness-init` 只問 `project_name` / 是否啟用 Redis / port / 是否附範例切片，一律 `AskUserQuestion` 選項式；高破壞性選項**禁**標 Recommended
- 機密值**不**經 AskUserQuestion（會留在 transcript）；scaffold 現場生成或使用者手填 `.env`

## 5. 獨立評分

PR 前 `/harness-scan` 按規則 ID 出報告作為 reviewer；worker 自評不算驗證。
