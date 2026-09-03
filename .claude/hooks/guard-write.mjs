#!/usr/bin/env node
// guard-write.mjs — Claude Code PreToolUse hook（matcher: Write|Edit|MultiEdit）
// 協議：stdin 收 JSON { tool_name, tool_input: { file_path, content | new_string | edits[] }, cwd }
//       允許 → exit 0 無輸出；阻擋 → stderr 印中文原因 + exit 2
// 零依賴、Node >= 20、ESM、Windows / macOS / Linux 皆可。
// 規則 ID 對應 rules/00-core（CORE-072 fixed 格式 / CORE-011 規則 ID 全庫唯一）。

import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const RULES = {
  FIXED_SECTION_HEADER: { rule: "CORE-072", desc: "fixed.md 每段標題須為「## §N — 標題」" },
  FIXED_RULE_FIELD: { rule: "CORE-072", desc: "fixed.md 每段須帶「- **rule**: <ID>」欄位" },
  RULE_ID_DUPLICATE: { rule: "CORE-011", desc: "規則 ID 全庫唯一：定義只能出現在一個檔" },
  RULE_ID_DUPLICATE_IN_FILE: { rule: "CORE-011", desc: "同一檔內規則 ID 重複定義" },
};

export const FIXED_PATH_RE = /docs\/Tasks\/[^/]+\/fixed\.md$/;
export const RULES_PATH_RE = /(^|\/)rules\/.+\.md$/;
export const SECTION_HEADER_RE = /^## §\d+ — .+/;
export const RULE_FIELD_RE = /^\s*- \*\*rule\*\*:\s*\S+/;
export const RULE_DEF_RE = /^- \*\*([A-Z]+-\d{3})\*\*/;

export function toPosix(p) {
  return String(p ?? "").replace(/\\/g, "/");
}

// ---------------------------------------------------------------------------
// 取本次要寫入的文字：Write.content / Edit.new_string / MultiEdit.edits[].new_string
// ---------------------------------------------------------------------------
export function newContentOf(toolName, input) {
  if (toolName === "Write") return typeof input.content === "string" ? input.content : "";
  if (toolName === "Edit") return typeof input.new_string === "string" ? input.new_string : "";
  if (toolName === "MultiEdit" && Array.isArray(input.edits)) {
    return input.edits.map((e) => (typeof e?.new_string === "string" ? e.new_string : "")).join("\n");
  }
  return "";
}

// ---------------------------------------------------------------------------
// fixed.md 格式：所有 `## ` 標題必為 `## §N — 標題`；每個 § 段必含 `- **rule**:`
// 片段（Edit）若不含任何 `## ` 標題 → 不驗（可能只是改一行）
// ---------------------------------------------------------------------------
export function checkFixed(content) {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const headers = [];
  lines.forEach((l, i) => {
    if (/^## /.test(l)) headers.push({ line: i, text: l });
  });
  if (!headers.length) return null;
  for (const h of headers) {
    if (!SECTION_HEADER_RE.test(h.text)) return { key: "FIXED_SECTION_HEADER", detail: `第 ${h.line + 1} 行：${h.text}` };
  }
  for (let k = 0; k < headers.length; k += 1) {
    const start = headers[k].line + 1;
    const end = k + 1 < headers.length ? headers[k + 1].line : lines.length;
    const body = lines.slice(start, end);
    if (!body.some((l) => RULE_FIELD_RE.test(l))) {
      return { key: "FIXED_RULE_FIELD", detail: `段落「${headers[k].text}」缺 - **rule**: 欄` };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// 規則 ID 唯一：從 file_path 向上找含 rules/ 與 AGENTS.md 的目錄為 repo 根
// ---------------------------------------------------------------------------
export function findRepoRoot(filePath) {
  let dir = path.dirname(path.resolve(filePath));
  for (let i = 0; i < 40; i += 1) {
    if (existsSync(path.join(dir, "AGENTS.md")) && existsSync(path.join(dir, "rules")) && statSync(path.join(dir, "rules")).isDirectory()) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

export function listMarkdown(dir) {
  const out = [];
  const walk = (d) => {
    for (const ent of readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, ent.name);
      if (ent.isDirectory()) walk(full);
      else if (ent.isFile() && ent.name.toLowerCase().endsWith(".md")) out.push(full);
    }
  };
  walk(dir);
  return out;
}

export function collectDefinitions(text) {
  const ids = [];
  for (const raw of text.replace(/\r\n/g, "\n").split("\n")) {
    const m = RULE_DEF_RE.exec(raw);
    if (m) ids.push(m[1]);
  }
  return ids;
}

export function checkRuleIds(filePath, content) {
  const ids = collectDefinitions(content);
  if (!ids.length) return null;

  const seen = new Set();
  for (const id of ids) {
    if (seen.has(id)) return { key: "RULE_ID_DUPLICATE_IN_FILE", detail: `${id} 在本次內容出現多次` };
    seen.add(id);
  }

  const root = findRepoRoot(filePath);
  if (!root) return null; // 找不到 repo 根 → 跳過全庫比對

  const target = path.resolve(filePath);
  const existing = new Map(); // id -> file
  for (const f of listMarkdown(path.join(root, "rules"))) {
    if (path.resolve(f) === target) continue;
    let text;
    try {
      text = readFileSync(f, "utf8");
    } catch {
      continue;
    }
    for (const id of collectDefinitions(text)) if (!existing.has(id)) existing.set(id, f);
  }
  for (const id of ids) {
    if (existing.has(id)) {
      return { key: "RULE_ID_DUPLICATE", detail: `${id} 已定義於 ${toPosix(path.relative(root, existing.get(id)))}` };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
export function evaluateWrite(toolName, input) {
  if (!["Write", "Edit", "MultiEdit"].includes(toolName)) return null;
  const filePath = input?.file_path;
  if (typeof filePath !== "string" || !filePath) return null;
  const posix = toPosix(filePath);
  const content = newContentOf(toolName, input);

  if (FIXED_PATH_RE.test(posix)) {
    const hit = checkFixed(content);
    if (hit) return { ...hit, where: posix };
  }
  if (RULES_PATH_RE.test(posix)) {
    const hit = checkRuleIds(filePath, content);
    if (hit) return { ...hit, where: posix };
  }
  return null;
}

export function formatBlock(hit) {
  const r = RULES[hit.key];
  return [
    `[guard-write] 阻擋：${r.desc}`,
    `  規則：${r.rule}（${hit.key}）`,
    `  檔案：${hit.where}`,
    hit.detail ? `  細節：${hit.detail}` : null,
    "  處置：修正內容後重試。",
  ]
    .filter(Boolean)
    .join("\n");
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString("utf8");
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text; // Windows PowerShell 管線會帶 BOM
}

async function main() {
  let payload;
  try {
    payload = JSON.parse(await readStdin());
  } catch {
    return 0;
  }
  const hit = evaluateWrite(payload?.tool_name, payload?.tool_input ?? {});
  if (!hit) return 0;
  process.stderr.write(formatBlock(hit) + "\n");
  return 2;
}

const isEntry = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isEntry) {
  main().then((code) => process.exit(code));
}
