'use strict';

/**
 * Derived-queue continuation (slice 1 of 2) — the decision logic that answers
 * "is the approved, fork-free queue undrained continuation work?", plus the
 * session-start banner that shows the human how much approved work waits.
 *
 * Real temp-dir state, real ledger entries via approval-ledger.writeEntry —
 * NOTHING mocked (mirrors tests/continuation.test.js). No fixture writes to the
 * real repo root.
 *
 * Decision contract (shouldContinueQueue), a safety READ that fails OPEN:
 *   fork pending                          -> continue:false, fork:true
 *   approved queue empty (depth 0)        -> continue:false, reason:'approved queue empty'
 *   no-progress blocks >= MAX_QUEUE_BLOCKS-> continue:false, exhausted:true
 *   else                                  -> continue:true, depth, refs
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const q = require('../src/lib/continuation-queue');
const ledger = require('../src/lib/approval-ledger');
const precompute = require('../src/lib/streaming-precompute');

// ── fixtures ────────────────────────────────────────────────────────────────

function mkProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-cq-'));
  fs.mkdirSync(path.join(dir, '.ctoc'), { recursive: true });
  for (const s of ['todo', 'in-progress', 'review', 'done']) {
    fs.mkdirSync(path.join(dir, 'plans', s), { recursive: true });
  }
  return dir;
}

function planText(title, body = 'The specification the human ruled on.') {
  return `---
title: "${title}"
type: implementation
files:
  - "src/lib/${title}.js"
---

# ${title}

${body}
`;
}

/** Create a plan file in a stage and, when approve=true, mint a REAL Gate-2
 *  ledger entry for it (content-bound, hash_scope:'specification'). */
function makePlan(root, stage, slug, { approve = true, body } = {}) {
  const content = planText(slug, body);
  const p = path.join(root, 'plans', stage, `${slug}.md`);
  fs.writeFileSync(p, content);
  if (approve) {
    ledger.writeEntry(
      ledger.slugFromPlanPath(p),
      { content, stage_from: 'implementation', stage_to: 'todo', approved_by: 'human' },
      root,
    );
  }
  return p;
}

const cleanup = (dir) => fs.rmSync(dir, { recursive: true, force: true });

// ── approvedFreeQueue: only approved plans count ────────────────────────────

test('approvedFreeQueue counts ONLY approved plans; unapproved and tampered are excluded', () => {
  const dir = mkProject();
  try {
    makePlan(dir, 'todo', 'alpha-approved', { approve: true });
    makePlan(dir, 'todo', 'beta-noledger', { approve: false }); // no ledger entry -> OUT
    // tampered: approve, then change a SPEC line so the spec hash no longer matches.
    const gamma = makePlan(dir, 'todo', 'gamma-tampered', { approve: true });
    fs.writeFileSync(gamma, planText('gamma-tampered', 'DIFFERENT specification after approval.'));

    const { refs, depth } = q.approvedFreeQueue(dir);
    assert.equal(depth, 1, `only the untouched approved plan counts, got ${JSON.stringify(refs)}`);
    assert.deepEqual(refs, ['todo/alpha-approved.md']);
  } finally { cleanup(dir); }
});

test('approvedFreeQueue: an approved in-progress plan counts (recoverable via the todo edge)', () => {
  const dir = mkProject();
  try {
    makePlan(dir, 'in-progress', 'building-approved', { approve: true });
    makePlan(dir, 'in-progress', 'squatted-noledger', { approve: false }); // OUT
    const { refs, depth } = q.approvedFreeQueue(dir);
    assert.equal(depth, 1);
    assert.deepEqual(refs, ['in-progress/building-approved.md']);
  } finally { cleanup(dir); }
});

test('approvedFreeQueue: todo + in-progress approved plans both count', () => {
  const dir = mkProject();
  try {
    makePlan(dir, 'todo', 'one', { approve: true });
    makePlan(dir, 'in-progress', 'two', { approve: true });
    assert.equal(q.approvedFreeQueue(dir).depth, 2);
  } finally { cleanup(dir); }
});

// ── FAIL-OPEN enumeration ────────────────────────────────────────────────────

test('approvedFreeQueue fails open: bad root and absent stage dirs yield depth 0, never throws', () => {
  assert.doesNotThrow(() => q.approvedFreeQueue(null));
  assert.equal(q.approvedFreeQueue(null).depth, 0);
  assert.equal(q.approvedFreeQueue('').depth, 0);
  // A root with no plans/ tree at all.
  const bare = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-cq-bare-'));
  try {
    assert.doesNotThrow(() => q.approvedFreeQueue(bare));
    assert.equal(q.approvedFreeQueue(bare).depth, 0);
  } finally { cleanup(bare); }
});

// ── shouldContinueQueue ──────────────────────────────────────────────────────

test('shouldContinueQueue: empty approved queue -> continue:false, reason names emptiness', () => {
  const dir = mkProject();
  try {
    const d = q.shouldContinueQueue(dir);
    assert.equal(d.continue, false);
    assert.equal(d.reason, 'approved queue empty');
    assert.equal(d.depth, 0);
  } finally { cleanup(dir); }
});

test('shouldContinueQueue: one approved plan -> continue:true, depth 1, message names the count', () => {
  const dir = mkProject();
  try {
    makePlan(dir, 'todo', 'only', { approve: true });
    const d = q.shouldContinueQueue(dir);
    assert.equal(d.continue, true);
    assert.equal(d.depth, 1);
    assert.match(d.reason, /1 approved plan\(s\)/);
  } finally { cleanup(dir); }
});

// ── FORK-AWARE (acceptance criterion) ────────────────────────────────────────

test('FORK-AWARE: a registered queue fork allows the stop even with a non-empty queue; resolve resumes', () => {
  const dir = mkProject();
  try {
    makePlan(dir, 'todo', 'p1', { approve: true });
    assert.equal(q.shouldContinueQueue(dir).continue, true);

    q.registerQueueFork(dir, 'a real human decision');
    const forked = q.shouldContinueQueue(dir);
    assert.equal(forked.continue, false, 'a pending fork must ALLOW the stop for the human');
    assert.equal(forked.fork, true);
    assert.match(forked.reason, /fork/i);

    q.resolveQueueFork(dir);
    assert.equal(q.shouldContinueQueue(dir).continue, true, 'resolving the fork resumes the queue');
  } finally { cleanup(dir); }
});

// ── BOUNDED + CAN-ALWAYS-EVENTUALLY-STOP (the kill-test) ─────────────────────

test('BOUNDED: a CONSTANT undrainable queue flips to exhausted within MAX_QUEUE_BLOCKS and STAYS allow-stop', () => {
  const dir = mkProject();
  try {
    makePlan(dir, 'todo', 'undrainable', { approve: true }); // depth fixed at 1, never drains
    let i = 0;
    for (; i <= q.MAX_QUEUE_BLOCKS + 5; i++) {
      const d = q.shouldContinueQueue(dir);
      if (!d.continue) break;
      assert.equal(q.recordQueueBlock(dir, d.depth), true, 'each block persists on a writable file');
    }
    assert.equal(i, q.MAX_QUEUE_BLOCKS, `must stand down in exactly MAX_QUEUE_BLOCKS blocks, took ${i}`);
    const done = q.shouldContinueQueue(dir);
    assert.equal(done.continue, false);
    assert.equal(done.exhausted, true);
    // STAYS allow-stop while depth is constant (idempotent at the ceiling).
    q.recordQueueBlock(dir, done.depth);
    assert.equal(q.shouldContinueQueue(dir).exhausted, true, 'stays exhausted while the queue does not drain');
  } finally { cleanup(dir); }
});

// ── SELF-HEAL (acceptance criterion) ─────────────────────────────────────────

test('SELF-HEAL: observed drain resets the budget — an exhausted queue resumes when depth drops', () => {
  const dir = mkProject();
  try {
    makePlan(dir, 'todo', 'stuck-a', { approve: true });
    const drainable = makePlan(dir, 'todo', 'stuck-b', { approve: true }); // depth 2
    // Exhaust at constant depth 2.
    for (let i = 0; i < q.MAX_QUEUE_BLOCKS; i++) {
      const d = q.shouldContinueQueue(dir);
      if (!d.continue) break;
      q.recordQueueBlock(dir, d.depth);
    }
    assert.equal(q.shouldContinueQueue(dir).exhausted, true, 'preconditon: exhausted at depth 2');
    // Drain one plan -> depth drops 2 -> 1 -> progress resets the budget.
    fs.rmSync(drainable);
    ledger.removeEntry(ledger.slugFromPlanPath(drainable), dir);
    const healed = q.shouldContinueQueue(dir);
    assert.equal(healed.continue, true, 'a strictly smaller depth resets the no-progress budget');
    assert.equal(healed.depth, 1);
  } finally { cleanup(dir); }
});

// ── FAIL-OPEN persist (acceptance criterion) ─────────────────────────────────

test('FAIL-OPEN persist: recordQueueBlock returns false when the state cannot be written, never throws', () => {
  const dir = mkProject();
  try {
    // Put a FILE where the .ctoc/state directory must be, so mkdir/write cannot land.
    fs.mkdirSync(path.join(dir, '.ctoc'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.ctoc', 'state'), 'not a directory');
    let persisted;
    assert.doesNotThrow(() => { persisted = q.recordQueueBlock(dir, 1); });
    assert.equal(persisted, false, 'a failed persist must be reported false, never a truthy lie');
  } finally { cleanup(dir); }
});

test('FAIL-OPEN read: a corrupt state file resolves without throwing', () => {
  const dir = mkProject();
  try {
    makePlan(dir, 'todo', 'p', { approve: true });
    fs.mkdirSync(path.join(dir, '.ctoc', 'state'), { recursive: true });
    fs.writeFileSync(q.queueStatePath(dir), '{ not valid json');
    assert.doesNotThrow(() => q.shouldContinueQueue(dir));
    // A corrupt (unreadable) state coerces toward ALLOW-continue on a non-empty queue.
    assert.equal(q.shouldContinueQueue(dir).continue, true);
  } finally { cleanup(dir); }
});

// ── approvedQueueBannerLine (the live consumer) ──────────────────────────────

test('approvedQueueBannerLine: names N for a non-empty queue, is silent otherwise, never throws', () => {
  const dir = mkProject();
  try {
    assert.equal(q.approvedQueueBannerLine(dir), '', 'depth 0 -> silent banner');
    assert.equal(q.approvedQueueBannerLine(null), '', 'bad root -> silent banner');
    makePlan(dir, 'todo', 'x', { approve: true });
    makePlan(dir, 'todo', 'y', { approve: true });
    const line = q.approvedQueueBannerLine(dir);
    assert.match(line, /^\nApproved queue: 2 plan\(s\) ready to build$/);
  } finally { cleanup(dir); }
});

// ── SLICE 5: name the correct next buildable plan; stop on a real fork ─────────
//
// The driver's continue path must NAME the dependency-and-criticality-ordered next
// BUILDABLE plan by its HUMAN TITLE (so an auto-build directive targets the right
// one, never a blocked one), and — before building — must STOP for the human when
// that plan carries a real unanswered blocking fork.

/** A plan with a distinct human title (title !== slug), optional deps/priority. */
function planWith(title, { deps = 'none', priority } = {}) {
  const depBlock = Array.isArray(deps)
    ? `depends_on:\n${deps.map((d) => `  - "${d}"`).join('\n')}\n`
    : `depends_on: "${deps}"\n`;
  const prio = priority ? `priority: ${priority}\n` : '';
  return `---
title: "${title}"
type: implementation
${prio}${depBlock}files:
  - "src/lib/x.js"
---

# ${title}

The specification the human ruled on.
`;
}

/** Write an approved plan whose HUMAN TITLE differs from its filename slug. */
function makeTitled(root, stage, slug, title, opts = {}) {
  const content = planWith(title, opts);
  const p = path.join(root, 'plans', stage, `${slug}.md`);
  fs.writeFileSync(p, content);
  ledger.writeEntry(
    ledger.slugFromPlanPath(p),
    { content, stage_from: 'implementation', stage_to: 'todo', approved_by: 'human' },
    root,
  );
  return p;
}

test('SLICE5 (a): names the correct next BUILDABLE plan by human title, NEVER the blocked one', () => {
  const dir = mkProject();
  try {
    // A: buildable (no deps). B: depends on unbuilt A -> BLOCKED. C: buildable (no deps).
    makeTitled(dir, 'todo', 'a-foundation', 'Build the shared queue reader');
    makeTitled(dir, 'todo', 'b-consumer', 'Render the next plan name', { deps: 'a-foundation' });
    makeTitled(dir, 'todo', 'c-free', 'Name the fork in plain words');

    const d = q.shouldContinueQueue(dir);
    assert.equal(d.continue, true);
    assert.ok(d.nextName, 'the decision must NAME the next buildable plan');
    assert.notEqual(d.nextName, 'Render the next plan name', 'must NEVER name the blocked plan');
    assert.ok(
      ['Build the shared queue reader', 'Name the fork in plain words'].includes(d.nextName),
      `named-next must be a BUILDABLE plan's human title, got ${JSON.stringify(d.nextName)}`,
    );
    // Named by TITLE, not filename slug.
    assert.doesNotMatch(d.nextName, /a-foundation|c-free/);
  } finally { cleanup(dir); }
});

test('SLICE5 (d): no fork -> continues, names the plan, decision fields unchanged', () => {
  const dir = mkProject();
  try {
    makeTitled(dir, 'todo', 'only-one', 'Wire the auto-build driver');
    const d = q.shouldContinueQueue(dir);
    assert.equal(d.continue, true);
    assert.equal(d.depth, 1);
    assert.deepEqual(d.refs, ['todo/only-one.md'], 'refs unchanged');
    assert.ok(d.buildOrder && Array.isArray(d.buildOrder.buildable), 'buildOrder unchanged');
    assert.equal(d.nextName, 'Wire the auto-build driver');
  } finally { cleanup(dir); }
});

test('SLICE5 (e): the named string carries no gate number and no raw stage word', () => {
  const dir = mkProject();
  try {
    makeTitled(dir, 'todo', 'only-one', 'Wire the auto-build driver');
    const d = q.shouldContinueQueue(dir);
    assert.doesNotMatch(d.nextName, /gate\s*[0-3]/i, 'no gate number');
    assert.doesNotMatch(d.nextName, /\b(todo|in-progress|review|done|implementation)\b/i, 'no raw stage word');
  } finally { cleanup(dir); }
});

test('SLICE5 (c): next buildable plan with an unanswered blocking fork -> registerQueueFork; the next decision stops for the human', () => {
  const dir = mkProject();
  try {
    const p = makeTitled(dir, 'todo', 'forky', 'Settle the storage location');
    const ref = 'todo/forky.md';
    const mtime = fs.statSync(p).mtimeMs;
    const res = precompute.writePlanQuestions(dir, ref, [{
      id: 'q1',
      prompt: 'Where should it live?',
      critical: true,   // a fork -> blocking
      important: true,
      options: [{ key: 'a', label: 'Global' }, { key: 'b', label: 'Per-project' }],
    }], mtime);
    assert.equal(res.ok, true, `questions fixture must write: ${JSON.stringify(res.errors)}`);

    const first = q.shouldContinueQueue(dir);
    assert.equal(first.continue, false, 'a real unanswered blocking fork stops BEFORE auto-building');
    assert.equal(first.fork, true);

    // registerQueueFork was called -> the persisted fork makes the NEXT decision stop too.
    assert.equal(q.readQueueState(dir).forkPending, true, 'the fork is persisted for the human');
    const next = q.shouldContinueQueue(dir);
    assert.equal(next.continue, false);
    assert.equal(next.fork, true);
  } finally { cleanup(dir); }
});

test('SLICE5 (c-neg): an approved plan whose questions were never computed is NOT a fork -> keeps building', () => {
  const dir = mkProject();
  try {
    makeTitled(dir, 'todo', 'plain', 'Ship the plain plan'); // no questions file at all
    const d = q.shouldContinueQueue(dir);
    assert.equal(d.continue, true, 'not-computed questions are normal for an approved plan, never a fork');
    assert.equal(d.nextName, 'Ship the plain plan');
  } finally { cleanup(dir); }
});

test('SLICE5 (f): fork detection fails OPEN — a fault reading questions never fabricates a fork', () => {
  const dir = mkProject();
  try {
    const p = makeTitled(dir, 'todo', 'robust', 'Keep building through a read fault');
    const ref = 'todo/robust.md';
    // Put a FILE where the streaming questions directory would live so any read errors.
    fs.mkdirSync(path.join(dir, '.ctoc', 'streaming'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.ctoc', 'streaming', 'questions'), 'not a directory');
    assert.doesNotThrow(() => q.shouldContinueQueue(dir));
    const d = q.shouldContinueQueue(dir);
    assert.equal(d.continue, true, 'a questions read fault is not evidence of a fork -> keep building');
    assert.equal(d.nextName, 'Keep building through a read fault');
    void p; void ref;
  } finally { cleanup(dir); }
});

// ── effectiveBlocks: the single progress rule ────────────────────────────────

test('effectiveBlocks: drain resets to 0, no-progress carries the count, non-finite coerces to 0', () => {
  assert.equal(q.effectiveBlocks({ blocks: 7, lastQueueDepth: 5 }, 3), 0, 'depth 3 < last 5 -> reset');
  assert.equal(q.effectiveBlocks({ blocks: 7, lastQueueDepth: 5 }, 5), 7, 'no progress -> carry');
  assert.equal(q.effectiveBlocks({ blocks: 7, lastQueueDepth: 5 }, 9), 7, 'depth grew -> no reset');
  assert.equal(q.effectiveBlocks({}, 4), 0, 'no prior depth -> carry blocks (0)');
  assert.equal(q.effectiveBlocks({ blocks: 'x', lastQueueDepth: 9 }, 9), 0, 'non-finite blocks -> 0');
});
