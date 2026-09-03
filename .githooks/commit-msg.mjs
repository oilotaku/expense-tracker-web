#!/usr/bin/env node
// .githooks/commit-msg — 跨工具 commit message 格式驗證（→ CORE-087）
// 用法：node commit-msg.mjs <msg-file>；不符 → stderr 原因 + exit 1
// 零依賴、Node >= 20。Claude Code 另有 PreToolUse guard-bash 擋同一件事；本檔給 Codex / Cursor / Aider / 人工 commit 用。
import { readFileSync } from "node:fs";

const FORMAT = /^(\(AI\) )?(Add|Modify|Fix|Refactor|Docs): .+/;
const file = process.argv[2];
if (!file) {
  process.stderr.write("[commit-msg] 缺 message 檔路徑參數\n");
  process.exit(1);
}
const text = readFileSync(file, "utf8").replace(/\r\n/g, "\n");
const first = text.split("\n").find((l) => l.trim() !== "" && !l.startsWith("#")) ?? "";
if (!FORMAT.test(first)) {
  process.stderr.write(
    `[commit-msg] 阻擋：commit message 不符格式\n  規則：CORE-087（COMMIT_MESSAGE_FORMAT）\n  首行：${first}\n  需為：(AI) <Add|Modify|Fix|Refactor|Docs>: <描述>（人工 commit 不加 (AI)）\n`
  );
  process.exit(1);
}
