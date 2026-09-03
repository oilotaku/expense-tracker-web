#!/usr/bin/env node
// audit-gate.mjs — 依賴稽核硬 gate（scaffold-version: 2.1，Node ≥ 20，零依賴）
//
// CICD-028：CI 的 npm audit / pip-audit 不得 continue-on-error。有漏洞就擋 PR，
// 唯一的放行途徑是 security/audit-exceptions.json 內「具名、具到期日」的例外；
// 例外過期即 fail，不存在「永久忽略」。
//
// 用法（在 repo 根執行）：
//   node scripts/audit-gate.mjs npm frontend/npm-audit.json
//   node scripts/audit-gate.mjs pip backend/pip-audit.json
//
// 產生報告（讓 audit 指令本身不決定成敗，交給本 gate）：
//   cd frontend && npm audit --audit-level=high --json > npm-audit.json || true
//   cd backend  && uv run pip-audit -f json -o pip-audit.json || true

import fs from 'node:fs';
import path from 'node:path';

const BLOCKING_NPM_SEVERITY = new Set(['high', 'critical']);
const MAX_EXCEPTION_DAYS = 90;

function fail(msg) {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    fail(`無法讀取 / 解析 ${file}：${e.message}`);
  }
}

// npm audit --json（v2 schema）：vulnerabilities 是 { <pkg>: { severity, via: [...] } }
function parseNpm(report) {
  const found = [];
  for (const [pkg, v] of Object.entries(report.vulnerabilities ?? {})) {
    if (!BLOCKING_NPM_SEVERITY.has(v.severity)) continue;
    const advisories = (v.via ?? []).filter((x) => typeof x === 'object');
    if (advisories.length === 0) {
      found.push({ id: `npm:${pkg}`, package: pkg, severity: v.severity, title: '（傳遞性依賴）' });
      continue;
    }
    for (const a of advisories) {
      found.push({
        id: a.source ? String(a.url ?? a.source).split('/').pop() : `npm:${pkg}`,
        package: a.name ?? pkg,
        severity: a.severity ?? v.severity,
        title: a.title ?? '',
      });
    }
  }
  return found;
}

// pip-audit -f json：{ dependencies: [ { name, version, vulns: [ { id, fix_versions, description } ] } ] }
function parsePip(report) {
  const found = [];
  for (const dep of report.dependencies ?? []) {
    for (const v of dep.vulns ?? []) {
      found.push({
        id: v.id,
        package: dep.name,
        severity: 'unknown',
        title: (v.description ?? '').split('\n')[0].slice(0, 120),
        fix: (v.fix_versions ?? []).join(', '),
      });
    }
  }
  return found;
}

function loadExceptions(kind) {
  const file = path.join('security', 'audit-exceptions.json');
  if (!fs.existsSync(file)) return [];
  const doc = readJson(file);
  const list = doc[kind] ?? [];
  const today = new Date().toISOString().slice(0, 10);
  const limit = new Date(Date.now() + MAX_EXCEPTION_DAYS * 86400000).toISOString().slice(0, 10);
  const problems = [];
  for (const ex of list) {
    for (const field of ['id', 'package', 'reason', 'owner', 'review_by']) {
      if (!ex[field]) problems.push(`例外缺少 ${field}：${JSON.stringify(ex)}`);
    }
    if (ex.review_by && ex.review_by < today) {
      problems.push(`例外已過期（review_by=${ex.review_by}）：${ex.id} / ${ex.package}`);
    }
    if (ex.review_by && ex.review_by > limit) {
      problems.push(`例外 review_by 超過 ${MAX_EXCEPTION_DAYS} 天上限：${ex.id} / ${ex.package}`);
    }
  }
  if (problems.length) {
    console.error('security/audit-exceptions.json 不合規：');
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  return list;
}

function main() {
  const [kind, file] = process.argv.slice(2);
  if (!['npm', 'pip'].includes(kind) || !file) {
    fail('用法：node scripts/audit-gate.mjs <npm|pip> <report.json>');
  }
  const report = readJson(file);
  const found = kind === 'npm' ? parseNpm(report) : parsePip(report);
  const exceptions = loadExceptions(kind);
  const accepted = new Set(exceptions.map((e) => e.id));

  const blocking = found.filter((f) => !accepted.has(f.id));
  const waived = found.filter((f) => accepted.has(f.id));

  for (const w of waived) {
    const ex = exceptions.find((e) => e.id === w.id);
    console.log(`⚠ 已接受風險 ${w.id}（${w.package}）— ${ex.owner}，複審期限 ${ex.review_by}`);
  }
  const stale = exceptions.filter((e) => !found.some((f) => f.id === e.id));
  for (const s of stale) {
    console.log(`ℹ 例外 ${s.id}（${s.package}）已不再命中，請從 audit-exceptions.json 移除`);
  }

  if (blocking.length) {
    console.error(`\n✗ ${kind} 稽核未通過：${blocking.length} 個未被接受的漏洞`);
    for (const b of blocking) {
      console.error(`  - ${b.id}  ${b.package}  [${b.severity}]  ${b.title}${b.fix ? `  → 修補版：${b.fix}` : ''}`);
    }
    console.error(
      '\n  處理方式：升級到修補版（升版走 harness rules/00-core/01-versions.md，由中央版本表發動），\n' +
        '  或在 security/audit-exceptions.json 具名登記並填 review_by（上限 ' +
        MAX_EXCEPTION_DAYS +
        ' 天）。',
    );
    process.exit(1);
  }
  console.log(`✓ ${kind} 稽核通過（${waived.length} 個已登記例外）`);
}

main();
