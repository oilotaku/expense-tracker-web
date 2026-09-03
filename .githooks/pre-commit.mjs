#!/usr/bin/env node
// .githooks/pre-commit — 跨工具 staged 機密檔攔截（→ CORE-091）
// staged 含 .env（非 .example）/ credentials* / *.key / *.pem → stderr 原因 + exit 1
// 零依賴、Node >= 20。Claude Code 另有 guard-bash 的 COMMIT_ENV_STAGED；本檔給其他工具 / 人工 commit 用。
import { execFileSync } from "node:child_process";
import path from "node:path";

let staged = [];
try {
  staged = execFileSync("git", ["diff", "--cached", "--name-only"], { encoding: "utf8", windowsHide: true })
    .split(/\r?\n/)
    .filter(Boolean);
} catch {
  process.exit(0); // 非 git repo / git 不存在 → 不擋
}
const ENV_RE = /^\.env(\.[^.]+)?$/;
const bad = staged.filter((f) => {
  const base = path.posix.basename(f.replace(/\\/g, "/"));
  if (ENV_RE.test(base)) return true;
  if (/^credentials/i.test(base)) return true;
  if (/\.(key|pem)$/i.test(base)) return true;
  return false;
});
if (bad.length) {
  process.stderr.write(
    `[pre-commit] 阻擋：staged 含機密檔\n  規則：CORE-091（COMMIT_ENV_STAGED）\n  檔案：${bad.join("、")}\n  處置：git restore --staged <檔>；只有 .env.<env>.example 可進版控。\n`
  );
  process.exit(1);
}
