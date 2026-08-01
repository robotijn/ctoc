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

/**
 * A plan sitting at a pre-build/review gate whose decision questions have NOT been
 * computed — exactly the shape `streaming-precompute.plansNeedingQuestions` reports.
 * A `review/` plan is used because review→done is never auto-crossed, so the plan
 * stays a pending decision with no fresh questions regardless of validation.
 */
function planNeedingQuestions(root, slug) {
  const p = path.join(root, 'plans', 'review', `${slug}.md`);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, planText(slug));
  return p;
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

// ── SLICE 4: continue-path ALSO re-injects the question-dispatch directive ────────
// When the gate BLOCKS a premature stop (exit 2) it already re-injects a keep-going
// message; it must ALSO re-inject the SAME "dispatch subagents to generate questions"
// directive whenever a plan still needs questions — closing the one-shot-at-open gap
// where mid-session gate crossings left child slices with no question generation until
// the next session open. The directive text is `SessionStart.questionDispatchDirective`,
// reused verbatim; its stable marker is "dispatch UP TO 5 CTOC subagents".
const DIRECTIVE_MARK = /dispatch UP TO 5 CTOC subagents/;

test('SLICE4 explicit-batch block + a plan needing questions -> stderr ALSO carries the question directive', () => {
  const dir = mkProject();
  try {
    continuation.startBatch(dir, { label: '5-round repair', total: 5 });
    planNeedingQuestions(dir, 'needs-qs');
    const r = runHook(dir);
    assert.equal(r.status, 2, 'the explicit batch still blocks — decision unchanged');
    assert.match(r.stderr, /remaining/, 'the keep-going message is still present');
    assert.match(r.stderr, DIRECTIVE_MARK, 'the question-dispatch directive must be appended on the continue path');
  } finally { cleanup(dir); }
});

test('SLICE4 derived-queue block + a plan needing questions -> stderr ALSO carries the question directive', () => {
  const dir = mkProject();
  try {
    approveTodoPlan(dir, 'alpha');       // makes the derived queue block (exit 2)
    planNeedingQuestions(dir, 'needs-qs'); // a review plan with no computed questions
    const r = runHook(dir);
    assert.equal(r.status, 2, 'the derived queue still blocks — decision unchanged');
    assert.match(r.stderr, /approved plan\(s\) are waiting to be built/, 'keep-going message intact');
    assert.match(r.stderr, DIRECTIVE_MARK, 'the question-dispatch directive must be appended on the continue path');
  } finally { cleanup(dir); }
});

test('SLICE4 block but NOTHING needs questions -> keep-going only, NO question directive appended', () => {
  const dir = mkProject();
  try {
    continuation.startBatch(dir, { label: 'x', total: 3 });
    const r = runHook(dir);
    assert.equal(r.status, 2);
    assert.match(r.stderr, /remaining/);
    assert.doesNotMatch(r.stderr, DIRECTIVE_MARK, 'no directive when no plan needs questions');
  } finally { cleanup(dir); }
});

test('SLICE4 FAIL-OPEN: a corrupt streaming-questions state still yields keep-going + exit 2', () => {
  const dir = mkProject();
  try {
    continuation.startBatch(dir, { label: 'y', total: 4 });
    planNeedingQuestions(dir, 'needs-qs');
    // Put a FILE where the streaming questions directory would live so any read of the
    // store errors; questionDispatchDirective is fail-soft (returns '') and the wrapper
    // in the hook must never let it change the block decision.
    fs.mkdirSync(path.join(dir, '.ctoc', 'streaming'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.ctoc', 'streaming', 'questions'), 'not a directory');
    const r = runHook(dir);
    assert.equal(r.status, 2, 'the block decision is unchanged even when the question directive cannot be computed');
    assert.match(r.stderr, /remaining/, 'the keep-going message still injects');
  } finally { cleanup(dir); }
});

test('SLICE4 allow-stop (exit 0) path is unchanged: no block, no injected directive', () => {
  const dir = mkProject();
  try {
    planNeedingQuestions(dir, 'needs-qs'); // questions pending, but no authorized work
    const r = runHook(dir);
    assert.equal(r.status, 0, 'no authorized batch/queue -> allow the stop');
    assert.doesNotMatch(r.stderr || '', DIRECTIVE_MARK, 'an allowed stop injects nothing');
  } finally { cleanup(dir); }
});

// ── SLICE 5: the derived-queue block NAMES the next plan to auto-build ─────────
// The auto-build directive must target the correct dependency-and-criticality-ordered
// next BUILDABLE plan, named by its HUMAN TITLE — additive to the existing keep-going
// + question-directive text; the exit code is unchanged.

/** An approved todo plan whose HUMAN TITLE differs from its filename slug. */
function approveTitledTodo(root, slug, title) {
  const content = `---
title: "${title}"
type: implementation
files:
  - "src/lib/${slug}.js"
---

# ${title}

The specification the human ruled on.
`;
  const p = path.join(root, 'plans', 'todo', `${slug}.md`);
  fs.writeFileSync(p, content);
  ledger.writeEntry(
    ledger.slugFromPlanPath(p),
    { content, stage_from: 'implementation', stage_to: 'todo', approved_by: 'human' },
    root,
  );
  return p;
}

test('SLICE5 (b): derived-queue block stderr NAMES the next plan by human title (exit 2 unchanged)', () => {
  const dir = mkProject();
  try {
    approveTitledTodo(dir, 'alpha-slug', 'Wire the auto-build driver');
    const r = runHook(dir);
    assert.equal(r.status, 2, 'the derived queue still blocks — decision unchanged');
    assert.match(r.stderr, /approved plan\(s\) are waiting to be built/, 'keep-going message intact');
    assert.match(r.stderr, /Wire the auto-build driver/, 'the injection must NAME the next plan to auto-build');
    assert.doesNotMatch(r.stderr, /alpha-slug/, 'named by human title, not the filename slug');
  } finally { cleanup(dir); }
});
