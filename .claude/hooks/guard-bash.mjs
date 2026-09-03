#!/usr/bin/env node
// guard-bash.mjs — Claude Code PreToolUse hook（matcher: Bash）
// 協議：stdin 收 JSON { tool_name, tool_input: { command }, cwd }
//       允許 → exit 0 無輸出；阻擋 → stderr 印中文原因 + exit 2
// 零依賴、Node >= 20、ESM、Windows / macOS / Linux 皆可。
// 規則 ID 對應 rules/00-core（CORE-139 毀滅性操作總則 / CORE-090 git / CORE-091 staged .env / CORE-087 commit 格式）。

import { execFileSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// ---------------------------------------------------------------------------
// 規則表（供 README / 測試對照；key 為內部識別，rule 為規範 ID）
// ---------------------------------------------------------------------------
export const RULES = {
  RM_RF: { rule: "CORE-139", desc: "rm 同時帶遞迴 (-r/-R/--recursive) 與強制 (-f/--force)" },
  GIT_PUSH_FORCE: { rule: "CORE-090", desc: "git push 帶 --force / -f / --force-with-lease / --force-if-includes" },
  GIT_RESET_HARD: { rule: "CORE-090", desc: "git reset --hard" },
  GIT_NO_VERIFY: { rule: "CORE-090", desc: "git commit / push 帶 --no-verify（跳過 hook）" },
  COMPOSE_DOWN_VOLUMES: { rule: "CORE-139", desc: "docker compose down / docker-compose down 帶 -v / --volumes" },
  REDIS_FLUSH: { rule: "CORE-139", desc: "FLUSHALL / FLUSHDB（含 redis-cli 與任何 token）" },
  SQL_DROP: { rule: "CORE-139", desc: "SQL DROP TABLE / SCHEMA / DATABASE / COLUMN（不分大小寫，含 psql -c / heredoc / $(...)）" },
  COMMIT_ENV_STAGED: { rule: "CORE-091", desc: "git commit 時 staged 含非 .example 的 .env 檔" },
  COMMIT_MESSAGE_FORMAT: { rule: "CORE-087", desc: "commit message 不符 ^(\\(AI\\) )?(Add|Modify|Fix|Refactor|Docs): .+" },
};

export const COMMIT_MESSAGE_RE = /^(\(AI\) )?(Add|Modify|Fix|Refactor|Docs): .+/;
export const ENV_FILE_RE = /(^|\/)\.env(\.[^./]+)?$/;
export const SQL_DROP_RE = /\bDROP\s+(TABLE|SCHEMA|DATABASE|COLUMN)\b/i;

// ---------------------------------------------------------------------------
// 1. Heredoc 抽離：把 <<EOF ... EOF 的本文取出另掃，剩餘字串交給 tokenizer
// ---------------------------------------------------------------------------
const HEREDOC_RE = /<<-?\s*(?:'([^']+)'|"([^"]+)"|\\?([A-Za-z_][\w-]*))/g;

export function extractHeredocs(src) {
  const lines = src.replace(/\r\n/g, "\n").split("\n");
  const kept = [];
  const bodies = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const delims = [];
    for (const m of line.matchAll(HEREDOC_RE)) {
      delims.push({ word: m[1] ?? m[2] ?? m[3], strip: line.slice(m.index, m.index + 3) === "<<-" });
    }
    kept.push(line);
    i += 1;
    for (const d of delims) {
      const body = [];
      while (i < lines.length) {
        const cur = d.strip ? lines[i].replace(/^\t+/, "") : lines[i];
        i += 1;
        if (cur === d.word) break;
        body.push(cur);
      }
      bodies.push(body.join("\n"));
    }
  }
  return { rest: kept.join("\n"), bodies };
}

// ---------------------------------------------------------------------------
// 2. Shell tokenizer：輸出 segments（每段 = 一個簡單命令的 token 陣列）
//    token = { text, quoted }；quoted 表示整個 token 由引號包住（字串常值）
//    分段符：&& || ; | & 換行 ( ) { }；$(...) / `...` 內容遞迴切段
// ---------------------------------------------------------------------------
export function tokenize(src) {
  const segments = [];
  let seg = [];
  let buf = "";
  let hasToken = false;
  let quotedAll = true; // 目前 token 是否完全來自引號
  let sawUnquoted = false;

  const flushToken = () => {
    if (hasToken) {
      seg.push({ text: buf, quoted: quotedAll && !sawUnquoted });
    }
    buf = "";
    hasToken = false;
    quotedAll = true;
    sawUnquoted = false;
  };
  const flushSeg = () => {
    flushToken();
    if (seg.length) segments.push(seg);
    seg = [];
  };
  const pushChar = (c, quoted) => {
    buf += c;
    hasToken = true;
    if (!quoted) sawUnquoted = true;
  };

  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];

    // 命令替換 $( ... ) / ` ... `：內容遞迴，結果併入 segments；外層視為一個佔位 token
    if (c === "$" && src[i + 1] === "(") {
      let depth = 1;
      let j = i + 2;
      while (j < n && depth > 0) {
        if (src[j] === "(") depth += 1;
        else if (src[j] === ")") depth -= 1;
        j += 1;
      }
      const inner = src.slice(i + 2, j - 1);
      for (const s of tokenize(inner)) segments.push(s);
      pushChar("$(...)", false);
      i = j;
      continue;
    }
    if (c === "`") {
      const j = src.indexOf("`", i + 1);
      const end = j === -1 ? n : j;
      for (const s of tokenize(src.slice(i + 1, end))) segments.push(s);
      pushChar("`...`", false);
      i = end + 1;
      continue;
    }

    if (c === "'") {
      let j = i + 1;
      while (j < n && src[j] !== "'") j += 1;
      const content = src.slice(i + 1, j);
      buf += content;
      hasToken = true; // 允許空字串 ''
      i = j + 1;
      continue;
    }
    if (c === '"') {
      let j = i + 1;
      let content = "";
      while (j < n && src[j] !== '"') {
        if (src[j] === "\\" && j + 1 < n && '"\\$`\n'.includes(src[j + 1])) {
          content += src[j + 1];
          j += 2;
        } else {
          content += src[j];
          j += 1;
        }
      }
      buf += content;
      hasToken = true;
      i = j + 1;
      continue;
    }
    if (c === "\\") {
      if (i + 1 < n) {
        if (src[i + 1] === "\n") {
          i += 2; // 行續接
          continue;
        }
        pushChar(src[i + 1], false);
        i += 2;
      } else i += 1;
      continue;
    }

    // 分段符
    if (c === "&" && src[i + 1] === "&") { flushSeg(); i += 2; continue; }
    if (c === "|" && src[i + 1] === "|") { flushSeg(); i += 2; continue; }
    if (c === ";" || c === "|" || c === "&" || c === "\n" || c === "(" || c === ")" || c === "{" || c === "}") {
      flushSeg();
      i += 1;
      continue;
    }
    // 重導向符號：視為分隔（其目標不當作命令）
    if (c === "<" || c === ">") {
      flushToken();
      let j = i;
      while (j < n && (src[j] === "<" || src[j] === ">" || src[j] === "&")) j += 1;
      i = j;
      continue;
    }
    if (c === " " || c === "\t") {
      flushToken();
      i += 1;
      continue;
    }
    // 註解
    if (c === "#" && !hasToken) {
      while (i < n && src[i] !== "\n") i += 1;
      continue;
    }
    pushChar(c, false);
    i += 1;
  }
  flushSeg();
  return segments;
}

// ---------------------------------------------------------------------------
// 3. 命令正規化：剝 sudo / env / 時間 / 路徑前綴，取得 argv
// ---------------------------------------------------------------------------
const WRAPPERS = new Set(["sudo", "env", "time", "nice", "nohup", "command", "exec", "builtin", "xargs"]);

export function normalizeArgv(seg) {
  let toks = seg.map((t) => t);
  while (toks.length) {
    const head = toks[0].text;
    if (WRAPPERS.has(head)) {
      toks = toks.slice(1);
      while (toks.length && (toks[0].text.startsWith("-") || /^[A-Za-z_][\w]*=/.test(toks[0].text))) toks = toks.slice(1);
      continue;
    }
    if (/^[A-Za-z_][\w]*=/.test(head)) { toks = toks.slice(1); continue; }
    break;
  }
  if (!toks.length) return { cmd: "", args: [] };
  const cmd = path.posix.basename(toks[0].text.replace(/\\/g, "/")).toLowerCase();
  return { cmd, args: toks.slice(1) };
}

// git 全域選項（-C dir / -c k=v / --git-dir=... 等）跳過後取子命令
function gitSubcommand(args) {
  let i = 0;
  while (i < args.length) {
    const t = args[i].text;
    if (t === "-C" || t === "-c" || t === "--git-dir" || t === "--work-tree" || t === "--namespace") { i += 2; continue; }
    if (t.startsWith("-")) { i += 1; continue; }
    return { sub: t, rest: args.slice(i + 1) };
  }
  return { sub: "", rest: [] };
}

// ---------------------------------------------------------------------------
// 4. 規則判定
// ---------------------------------------------------------------------------
function unquotedFlags(args) {
  return args.filter((a) => !a.quoted && a.text.startsWith("-")).map((a) => a.text);
}

function checkRm(args) {
  let recursive = false;
  let force = false;
  for (const f of unquotedFlags(args)) {
    if (f === "--") break;
    if (f === "--recursive") recursive = true;
    else if (f === "--force") force = true;
    else if (/^-[A-Za-z]+$/.test(f)) {
      if (/[rR]/.test(f)) recursive = true;
      if (/f/.test(f)) force = true;
    }
  }
  return recursive && force ? "RM_RF" : null;
}

function checkGit(args, cwd) {
  const { sub, rest } = gitSubcommand(args);
  const flags = unquotedFlags(rest);
  if (sub === "push") {
    if (flags.some((f) => f === "--force" || f === "--force-with-lease" || f.startsWith("--force-with-lease=") || f === "--force-if-includes" || (/^-[A-Za-z]+$/.test(f) && f.includes("f")))) {
      return { key: "GIT_PUSH_FORCE" };
    }
    if (flags.includes("--no-verify")) return { key: "GIT_NO_VERIFY" };
    return null;
  }
  if (sub === "reset") {
    if (flags.includes("--hard")) return { key: "GIT_RESET_HARD" };
    return null;
  }
  if (sub === "commit") {
    if (flags.includes("--no-verify") || flags.some((f) => /^-[A-Za-z]*n[A-Za-z]*$/.test(f))) return { key: "GIT_NO_VERIFY" };
    const msg = extractCommitMessage(rest, cwd);
    if (msg !== null && !COMMIT_MESSAGE_RE.test(msg)) {
      return { key: "COMMIT_MESSAGE_FORMAT", detail: `message="${msg}"` };
    }
    const staged = stagedEnvFiles(cwd);
    if (staged.length) return { key: "COMMIT_ENV_STAGED", detail: `staged=${staged.join(", ")}` };
    return null;
  }
  return null;
}

// 取第一個 -m / --message；-F / --file 讀檔首行；皆無 → null（開編輯器，不驗）
export function extractCommitMessage(rest, cwd) {
  for (let i = 0; i < rest.length; i += 1) {
    const t = rest[i];
    if (t.quoted) continue;
    const s = t.text;
    if (s === "-m" || s === "--message") return rest[i + 1]?.text ?? "";
    if (s.startsWith("--message=")) return s.slice("--message=".length);
    if (/^-m./.test(s)) return s.slice(2);
    let file = null;
    if (s === "-F" || s === "--file") file = rest[i + 1]?.text ?? null;
    else if (s.startsWith("--file=")) file = s.slice("--file=".length);
    else if (/^-F./.test(s)) file = s.slice(2);
    if (file !== null) {
      const abs = path.isAbsolute(file) ? file : path.join(cwd || process.cwd(), file);
      if (!existsSync(abs)) return null;
      const first = readFileSync(abs, "utf8").replace(/\r\n/g, "\n").split("\n").find((l) => l.trim() !== "") ?? "";
      return first;
    }
  }
  return null;
}

export function stagedEnvFiles(cwd) {
  try {
    const out = execFileSync("git", ["diff", "--cached", "--name-only"], {
      cwd: cwd || process.cwd(),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      windowsHide: true,
    });
    return out
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && ENV_FILE_RE.test(l) && !/\.example$/.test(l));
  } catch {
    return []; // 非 git repo / git 不存在 → 跳過
  }
}

function checkDocker(cmd, args) {
  let rest = args;
  if (cmd === "docker") {
    const i = rest.findIndex((a) => a.text === "compose");
    if (i === -1) return null;
    rest = rest.slice(i + 1);
  }
  // compose 全域選項（-f file / -p name / --profile x）跳過後找 down
  const di = rest.findIndex((a) => !a.quoted && a.text === "down");
  if (di === -1) return null;
  const flags = unquotedFlags(rest.slice(di + 1));
  if (flags.some((f) => f === "--volumes" || (/^-[A-Za-z]+$/.test(f) && f.includes("v")))) return "COMPOSE_DOWN_VOLUMES";
  return null;
}

const SQL_TEXT_EXEMPT = new Set(["echo", "printf", "grep", "rg", "git", "cat", "sed", "awk", "head", "tail", "less", "more", "find"]);

export function evaluateCommand(command, cwd) {
  const { rest, bodies } = extractHeredocs(command);

  for (const body of bodies) {
    if (SQL_DROP_RE.test(body)) return { key: "SQL_DROP", where: "heredoc" };
  }

  const segments = tokenize(rest);
  for (const seg of segments) {
    const { cmd, args } = normalizeArgv(seg);
    if (!cmd) continue;
    const view = seg.map((t) => t.text).join(" ");

    // FLUSHALL / FLUSHDB：任何 token（含引號內，如 redis-cli "FLUSHALL"）
    for (const t of seg) {
      if (/^flush(all|db)$/i.test(t.text.trim())) return { key: "REDIS_FLUSH", where: view };
    }

    // SQL DROP：非純文字命令的所有 token（含引號內，如 psql -c "DROP TABLE x"）
    if (!SQL_TEXT_EXEMPT.has(cmd)) {
      const joined = seg.map((t) => t.text).join(" ");
      if (SQL_DROP_RE.test(joined)) return { key: "SQL_DROP", where: view };
    }

    let hit = null;
    if (cmd === "rm") hit = checkRm(args);
    else if (cmd === "git") {
      const r = checkGit(args, cwd);
      if (r) return { key: r.key, where: view, detail: r.detail };
    } else if (cmd === "docker" || cmd === "docker-compose") hit = checkDocker(cmd, args);
    if (hit) return { key: hit, where: view };
  }
  return null;
}

// ---------------------------------------------------------------------------
// 5. 入口
// ---------------------------------------------------------------------------
async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString("utf8");
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text; // Windows PowerShell 管線會帶 BOM
}

export function formatBlock(hit) {
  const r = RULES[hit.key];
  const lines = [
    `[guard-bash] 阻擋：${r.desc}`,
    `  規則：${r.rule}（${hit.key}）`,
    `  命令段：${hit.where}`,
  ];
  if (hit.detail) lines.push(`  細節：${hit.detail}`);
  lines.push("  處置：改用安全方案，或由人手動確認並備份後執行。");
  return lines.join("\n");
}

async function main() {
  let payload;
  try {
    payload = JSON.parse(await readStdin());
  } catch {
    return 0; // 非 JSON → 不干涉
  }
  if (payload?.tool_name && payload.tool_name !== "Bash") return 0;
  const command = payload?.tool_input?.command;
  if (typeof command !== "string" || !command.trim()) return 0;
  const hit = evaluateCommand(command, payload.cwd);
  if (!hit) return 0;
  process.stderr.write(formatBlock(hit) + "\n");
  return 2;
}

const isEntry = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isEntry) {
  main().then((code) => process.exit(code));
}
