---
name: merge-main
description: 把當前功能分支合併進 main：先確認工作樹乾淨 → `checkout main` + `pull` → `merge <branch>` → `push origin main` → 切回原分支。有未提交變更會提醒先跑 /commit-all 並中止；衝突列出檔案並中止。當使用者說「合併到 main / merge main / 把這個分支併進主線 / 上主線」時觸發。不適用：要 rebase / squash / force push（一律不做）、要開 PR（用 `gh pr create`）、目前已在 main。
---

# merge-main

單人開發的本地 fast-path 合併。**push 前問一次**；任何衝突或髒工作樹即中止。

## 執行步驟

### 1. 前置檢查

- `git status --porcelain` 必為空；否則提示「先跑 `/commit-all`」並**中止**（含 untracked）
- `git branch --show-current` 記為 `<src>`；已是 `main` → 回報「已在 main」結束
- `git remote get-url origin` 存在；`git fetch origin` exit 0

### 2. 更新 main

```bash
git checkout main
git pull --ff-only origin main
```

`--ff-only` 失敗（本地 main 分岔）→ 切回 `<src>`，提示使用者手動處理本地 main；**禁** `reset --hard`。

### 3. 合併

```bash
git merge --no-ff <src> -m "(AI) Modify: 合併 <src> 進 main"
```

衝突 → `git diff --name-only --diff-filter=U` 列出衝突檔 → `git merge --abort` → `git checkout <src>` → **中止**，提示使用者在 `<src>` 上先 `git merge main` 解衝突。

### 4. push 與切回

```bash
git push origin main
git checkout <src>
```

push 被拒 → 不重試、**禁** `--force`；切回 `<src>` 並回報原因。

### 5. 回報

`<src> → main`、合併 commit 數、是否已 push、當前分支已切回 `<src>`。

## 自我約束

- **禁** `--force` / `--force-with-lease` / `reset --hard` / `--no-verify` / rebase / squash
- **禁**在工作樹不乾淨時執行任何 checkout / merge
- **禁**自動解衝突
- 結束時必定回到 `<src>` 分支（中止路徑也一樣）
