'use strict';

/**
 * Stop-hook derived-queue block (slice 2 of 2) — the REAL Stop hook's exit codes
 * when the approved, fork-free queue is undrained continuation work and there is NO
 * explicit batch. Spawns the actual hook (mirrors tests/continuation.test.js) and
 * asserts on `.status` (exit code) and `.stderr`. Nothing mocked; fixtures only under
 * os.tmpdir().
 *
 * Exit-code protocol: 2 = BLOCK the stop, 0 = ALLOW the stop / fail-open.
 *
 * The derived path fires ONLY when `continuation.status(root) === null` (no explicit
 * batch): it never overrides an explicit fork / complete / exhausted decision.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const continuation = require('../src/lib/continuation');
const q = require('../src/lib/continuation-queue');
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

function planText(slug) {
  return `---
title: "${slug}"
type: implementation
files:
  - "src/lib/${slug}.js"
---

# ${slug}

The specification the human ruled on.
`;
}

/** Real approved todo plan (Gate-2 ledger entry, specification-bound). */
function approveTodoPlan(root, slug) {
  const content = planText(slug);
  const p = path.join(root, 'plans', 'todo', `${slug}.md`);
  fs.writeFileSync(p, content);
  ledger.writeEntry(
    ledger.slugFromPlanPath(p),
    { content, stage_from: 'implementation', stage_to: 'todo', approved_by: 'human' },
    root,
  );
  return p;
}

function runHook(cwd, env = {}) {
  return spawnSync(process.execPath, [HOOK], { cwd, encoding: 'utf8', env: { ...process.env, ...env } });
}

const cleanup = (dir) => fs.rmSync(dir, { recursive: true, force: true });

// ── the core derived-queue behavior ──────────────────────────────────────────

test('no explicit state + EMPTY approved queue -> exit 0 (allow the stop)', () => {
  const dir = mkProject();
  try {
    assert.equal(runHook(dir).status, 0);
  } finally { cleanup(dir); }
});

test('no explicit state + one approved fork-free todo plan -> exit 2, stderr names the count', () => {
  const dir = mkProject();
  try {
    approveTodoPlan(dir, 'alpha');
    const r = runHook(dir);
    assert.equal(r.status, 2, 'approved fork-free work must BLOCK the premature idle stop');
    assert.match(r.stderr, /1 approved plan\(s\) are waiting to be built/);
  } finally { cleanup(dir); }
});

test('no explicit state + an UNAPPROVED todo plan -> exit 0 (unapproved is not authorized work)', () => {
  const dir = mkProject();
  try {
    // A plan file with NO ledger entry — must not count as continuation work.
    fs.writeFileSync(path.join(dir, 'plans', 'todo', 'squat.md'), planText('squat'));
    assert.equal(runHook(dir).status, 0);
  } finally { cleanup(dir); }
});

// ── ESCAPABLE ─────────────────────────────────────────────────────────────────

test('ESCAPABLE: CTOC_SKIP_CONTINUATION=1 -> exit 0 even with a non-empty approved queue', () => {
  const dir = mkProject();
  try {
    approveTodoPlan(dir, 'alpha');
    assert.equal(runHook(dir, { CTOC_SKIP_CONTINUATION: '1' }).status, 0);
  } finally { cleanup(dir); }
});

// ── FORK-AWARE ────────────────────────────────────────────────────────────────

test('FORK-AWARE: a registered queue fork -> exit 0; resolving it -> exit 2 again', () => {
  const dir = mkProject();
  try {
    approveTodoPlan(dir, 'alpha');
    assert.equal(runHook(dir).status, 2, 'precondition: blocks with work waiting');

    q.registerQueueFork(dir, 'a real human decision');
    assert.equal(runHook(dir).status, 0, 'a pending queue fork must ALLOW the stop for the human');

    q.resolveQueueFork(dir);
    assert.equal(runHook(dir).status, 2, 'resolving the fork resumes blocking');
  } finally { cleanup(dir); }
});

// ── FAIL-OPEN ─────────────────────────────────────────────────────────────────

test('FAIL-OPEN: unwritable .ctoc/state (counter cannot persist) -> exit 0, never blocks on a frozen bound', () => {
  const dir = mkProject();
  try {
    approveTodoPlan(dir, 'alpha');
    // Put a FILE where the .ctoc/state directory must be, so recordQueueBlock can't persist.
    fs.writeFileSync(path.join(dir, '.ctoc', 'state'), 'not a directory');
    // Guard: a privileged environment might still write; only assert the wedge condition.
    const canPersist = q.recordQueueBlock(dir, 1);
    if (canPersist === false) {
      assert.equal(runHook(dir).status, 0, 'an un-persistable block cannot bound the loop -> allow the stop');
    }
  } finally { cleanup(dir); }
});

test('FAIL-OPEN: a project with no plans tree at all -> exit 0 (depth 0)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-cqhook-bare-'));
  try {
    fs.mkdirSync(path.join(dir, '.ctoc'), { recursive: true });
    assert.equal(runHook(dir).status, 0);
  } finally { cleanup(dir); }
});

// ── BOUNDARY: the explicit batch always wins; the derived path never stacks ────

test('BOUNDARY: an ACTIVE explicit batch blocks via the EXISTING path, not the derived one', () => {
  const dir = mkProject();
  try {
    continuation.startBatch(dir, { label: '5-round repair', total: 5 });
    const r = runHook(dir);
    assert.equal(r.status, 2, 'an explicit batch blocks via the shipped path');
    assert.match(r.stderr, /remaining/, 'the explicit-batch message, not the derived one');
    assert.doesNotMatch(r.stderr, /approved plan\(s\) are waiting/, 'the derived path must NOT run under an explicit batch');
  } finally { cleanup(dir); }
});

test('BOUNDARY: an explicit PENDING FORK -> exit 0, and the derived path does NOT fire even with approved work', () => {
  const dir = mkProject();
  try {
    approveTodoPlan(dir, 'alpha'); // a non-empty approved queue exists
    continuation.startBatch(dir, { label: 'x', total: 9 });
    continuation.registerFork(dir, 'an explicit human decision');
    const r = runHook(dir);
    assert.equal(r.status, 0, 'an explicit pending fork allows the stop; the derived path is gated off by status !== null');
    assert.doesNotMatch(r.stderr || '', /approved plan\(s\) are waiting/);
  } finally { cleanup(dir); }
});

// ── BOUNDED + CAN-ALWAYS-EVENTUALLY-STOP (the hook-level kill-test) ───────────

test('BOUNDED: an undrainable approved queue blocks at most MAX_QUEUE_BLOCKS times, then exits 0 and STAYS 0', () => {
  const dir = mkProject();
  try {
    approveTodoPlan(dir, 'undrainable'); // depth fixed at 1, never drains
    let blocks = 0;
    let status;
    for (let i = 0; i <= q.MAX_QUEUE_BLOCKS + 5; i++) {
      status = runHook(dir).status;
      if (status === 2) { blocks++; continue; }
      break; // first non-block (exit 0) — the loop has stood down
    }
    assert.equal(status, 0, 'the undrainable queue must eventually allow the stop');
    assert.equal(blocks, q.MAX_QUEUE_BLOCKS, `must block at most MAX_QUEUE_BLOCKS times, blocked ${blocks}`);
    // Stays exit 0 while the queue is unchanged (idempotent at the ceiling).
    assert.equal(runHook(dir).status, 0, 'stays allow-stop while the queue does not drain');
  } finally { cleanup(dir); }
});
