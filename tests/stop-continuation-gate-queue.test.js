'use strict';

/**
 * The Stop hook blocks ONLY inside a batch a human explicitly started (plan "CTOC does
 * no unasked work at session start or stop", 2026-10-06 — the owner: "this is a big
 * problem fix it").
 *
 * The hook used to derive a batch from the approved build queue: with approved plans in
 * `plans/todo/` and NO batch started, it refused to let a turn end — up to 100 times in a
 * row — and each refusal repeated the session-start order to dispatch subagents over every
 * plan whose questions were missing. That derived regime is deleted. These cases spawn the
 * REAL hook (nothing mocked; fixtures under os.tmpdir()) and assert its exit code and its
 * standard error:
 *   - approved plans queued and no batch → exit 0, nothing printed;
 *   - inside an explicitly started batch → exit 2, the message names the batch and its
 *     remaining count, and names no plan and no subagent order.
 *
 * Exit-code protocol: 2 = BLOCK the stop, 0 = ALLOW the stop / fail-open.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const continuation = require('../src/lib/continuation');
const ledger = require('../src/lib/approval-ledger');

const HOOK = path.join(__dirname, '..', 'src', 'hooks', 'stop-continuation-gate.js');

function mkProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-cqhook-'));
  fs.mkdirSync(path.join(dir, '.ctoc'), { recursive: true });
  for (const s of ['todo', 'in-progress']) {
    fs.mkdirSync(path.join(dir, 'plans', s), { recursive: true });
  }
  return dir;
}

function planText(slug, title = slug) {
  return `---
title: "${title}"
type: implementation
files:
  - "src/lib/${slug}.js"
---

# ${title}

The specification the human ruled on.
`;
}

/**
 * A plan sitting at the built-and-waiting decision whose questions have NOT been
 * computed — the shape `streaming-precompute.plansNeedingQuestions` reports. A
 * `review/` plan is used because that decision is never crossed on sufficiency, so the
 * plan stays pending with no fresh questions regardless of validation.
 */
function planNeedingQuestions(root, slug, title) {
  const p = path.join(root, 'plans', 'review', `${slug}.md`);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, planText(slug, title));
  return `review/${slug}.md`;
}

/** Real approved todo plan (build-gate ledger entry, specification-bound). */
function approveTodoPlan(root, slug, title) {
  const content = planText(slug, title);
  const p = path.join(root, 'plans', 'todo', `${slug}.md`);
  fs.writeFileSync(p, content);
  ledger.writeEntry(
    ledger.slugFromPlanPath(p),
    { content, stage_from: 'implementation', stage_to: 'todo', approved_by: 'human' },
    root,
  );
  return `todo/${slug}.md`;
}

function runHook(cwd, env = {}) {
  const base = { ...process.env };
  delete base.CTOC_SKIP_CONTINUATION;
  return spawnSync(process.execPath, [HOOK], { cwd, encoding: 'utf8', env: { ...base, ...env } });
}

const cleanup = (dir) => fs.rmSync(dir, { recursive: true, force: true });

// ── an approved queue alone never blocks ──────────────────────────────────────

test('no batch + EMPTY approved queue -> exit 0 (allow the stop)', () => {
  const dir = mkProject();
  try {
    assert.equal(runHook(dir).status, 0);
  } finally { cleanup(dir); }
});

test('no batch + THREE approved plans queued -> exit 0 and nothing printed (the queue alone never blocks)', () => {
  const dir = mkProject();
  try {
    approveTodoPlan(dir, 'alpha');
    approveTodoPlan(dir, 'beta');
    approveTodoPlan(dir, 'gamma');
    const r = runHook(dir);
    assert.equal(r.status, 0, `approved plans with no batch must ALLOW the stop, got ${r.status}\n${r.stderr}`);
    assert.equal(r.stderr, '', 'an allowed stop prints nothing');
    assert.ok(!fs.existsSync(path.join(dir, '.ctoc', 'state', 'continuation-queue.json')),
      'no derived-queue counter file is written');
  } finally { cleanup(dir); }
});

test('no batch + an UNAPPROVED todo plan -> exit 0', () => {
  const dir = mkProject();
  try {
    fs.writeFileSync(path.join(dir, 'plans', 'todo', 'squat.md'), planText('squat'));
    assert.equal(runHook(dir).status, 0);
  } finally { cleanup(dir); }
});

test('FAIL-OPEN: a project with no plans tree at all -> exit 0', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-cqhook-bare-'));
  try {
    fs.mkdirSync(path.join(dir, '.ctoc'), { recursive: true });
    assert.equal(runHook(dir).status, 0);
  } finally { cleanup(dir); }
});

// ── the explicit batch still blocks, and its message names only the batch ─────

test('an explicitly started batch blocks: names the batch and its remaining count, and no plan and no subagent order', () => {
  const dir = mkProject();
  try {
    continuation.startBatch(dir, { label: 'repair round', total: 5 });
    const named = [
      approveTodoPlan(dir, 'alpha-approved', 'Alpha approved title'),
      approveTodoPlan(dir, 'beta-approved', 'Beta approved title'),
      approveTodoPlan(dir, 'gamma-approved', 'Gamma approved title'),
      planNeedingQuestions(dir, 'delta-needs-questions', 'Delta needs questions title'),
      planNeedingQuestions(dir, 'epsilon-needs-questions', 'Epsilon needs questions title'),
    ];
    const titles = ['Alpha approved title', 'Beta approved title', 'Gamma approved title',
      'Delta needs questions title', 'Epsilon needs questions title'];

    const r = runHook(dir);

    assert.equal(r.status, 2, 'the explicit batch blocks the stop');
    assert.match(r.stderr, /5 of 5 unit\(s\) remaining in "repair round"/, 'the batch and its count are named');
    for (const ref of named) assert.ok(!r.stderr.includes(ref), `the message lists the plan reference ${ref}`);
    for (const slug of named.map((ref) => ref.split('/')[1].replace(/\.md$/, ''))) {
      assert.ok(!r.stderr.includes(slug), `the message names the plan ${slug}`);
    }
    for (const t of titles) assert.ok(!r.stderr.includes(t), `the message names the plan title ${t}`);
    assert.doesNotMatch(r.stderr, /dispatch\s+up\s+to/i, 'no dispatch order');
    assert.doesNotMatch(r.stderr, /\bsubagents?\b/i, 'no subagent order');
  } finally { cleanup(dir); }
});

test('ESCAPABLE: CTOC_SKIP_CONTINUATION=1 -> exit 0 even inside an active batch', () => {
  const dir = mkProject();
  try {
    continuation.startBatch(dir, { label: 'escape check', total: 3 });
    assert.equal(runHook(dir).status, 2, 'precondition: the batch blocks without the escape');
    assert.equal(runHook(dir, { CTOC_SKIP_CONTINUATION: '1' }).status, 0);
  } finally { cleanup(dir); }
});

test('an explicit PENDING FORK -> exit 0, even with approved plans queued', () => {
  const dir = mkProject();
  try {
    approveTodoPlan(dir, 'alpha');
    continuation.startBatch(dir, { label: 'x', total: 9 });
    continuation.registerFork(dir, 'an explicit human decision');
    const r = runHook(dir);
    assert.equal(r.status, 0, 'a pending fork allows the stop for the human');
    assert.equal(r.stderr, '', 'an allowed stop prints nothing');
  } finally { cleanup(dir); }
});

test('a COMPLETE batch with approved plans still queued -> exit 0', () => {
  const dir = mkProject();
  try {
    approveTodoPlan(dir, 'alpha');
    continuation.startBatch(dir, { label: 'one unit', total: 1 });
    continuation.advance(dir);
    assert.equal(runHook(dir).status, 0, 'a finished batch allows the stop; the queue does not take over');
  } finally { cleanup(dir); }
});
