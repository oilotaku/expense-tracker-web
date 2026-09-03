---
name: commit-all
description: 把當前分支所有變更（新增 / 修改 / 刪除）一次 commit，並直接 push 到遠端。先擋 `.env`（非 `.example`）進 git；commit message 自動產生 `(AI) <Add|Modify|Fix|Refactor|Docs>: <繁中描述>`。當使用者說「提交全部 / commit all / 一鍵提交 / 把變更 commit 推上去」時觸發。不適用：只想 commit 部分檔案（手動 `git add`）、要 rebase / amend / force push（本 skill 一律不做）、要合併分支（用 /merge-main）。
---

# commit-all

commit 與 push 全自動，不需確認（`.env` 檢查與 hook 為防線）。

## 執行步驟

### 1. 看狀態

`git status --porcelain --branch`。沒有任何變更 → 回報「沒有需要提交的變更」結束。記下當前分支。

### 2. 擋機密（add 之前）

```bash
git ls-files | grep -E '(^|/)\.env(\.[^.]+)?$' | grep -v '\.example$'          # 已被追蹤的 .env
git status --porcelain | awk '{print $2}' | grep -E '(^|/)\.env(\.[^.]+)?$' | grep -v '\.example$'   # 將被加入的 .env
```

任一有輸出 → **中止**，列出檔案並提示：加進 `.gitignore`；若已追蹤先 `git rm --cached <file>`；若曾 commit 過 → 金鑰全 rotate（見 `rules/00-core/02-secrets-and-env.md`）。**不**替使用者做這些動作。

也順手 grep 變更檔內容有無 `sk-` / `ghp_` / `AKIA` / `-----BEGIN .* PRIVATE KEY` 樣式；命中 → 警告並中止。

### 3. 了解變更

`git diff --stat`、`git diff --cached --stat`、`git log --oneline -5`（對齊近期風格）。

### 4. 產 commit message

格式（唯一寫處 `rules/00-core/20-git-and-review.md`）：

```
(AI) <Add|Modify|Fix|Refactor|Docs>: <繁體中文描述，一行>
```

類型判斷：新增檔為主 → `Add`；只改文件 → `Docs`；修 bug → `Fix`；純結構調整 → `Refactor`；其餘 → `Modify`。描述寫「改了什麼」不寫「為什麼」（why 放 fixed.md / PR）。

### 5. add + commit

```bash
git add -A
git diff --cached --name-only | grep -E '(^|/)\.env(\.[^.]+)?$' | grep -v '\.example$' && { echo "staged 含 .env，中止"; exit 1; }
git commit -m "(AI) <類型>: <描述>"
```

第二行是最後一道防線（`guard-bash` hook 也會擋，雙保險）。commit 失敗（hook 擋 / pre-commit 失敗）→ 貼原因，**禁** `--no-verify`。

### 6. push

`git push -u origin <branch>`。被拒（non-fast-forward）→ 提示先 `git pull --rebase origin <branch>` 由使用者決定；**禁** `--force` / `--force-with-lease`。

### 7. 回報

`git status --short --branch` + commit 摘要 + 是否已 push。

## 自我約束

- **禁** `--force` / `--force-with-lease` / `--no-verify` / `reset --hard` / `commit --amend`
- **禁**把 `.env`（非 `.example`）加進 git；命中即中止
- 不加 `Co-Authored-By`
- commit message 繁體中文、必帶 `(AI)` 前綴
