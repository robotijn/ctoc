'use strict';

// Plan recovery — an orphaned in-progress plan whose BUILDER IS GONE is re-queued
// to todo for a clean rebuild. The reconciler (task-reconcile.js) already decides
// "the builder is dead" and records that verdict DURABLY on the task
// (result.orphanReason). This module is a PURE PROJECTION over that verdict onto the
// PLAN file — it never re-derives liveness/staleness and never edits the reconciler.
//
// THE HUMAN'S RESOLVED STANCE (2026-07-22) — REBUILD, not forward-to-review:
//   • A RELEASED orphan (orphanReason null / 'confirmed-dead' / 'presumed-dead' —
//     the reconciler freed its files) is RE-QUEUED in-progress → todo REGARDLESS of
//     whether its partial work is structurally review-ready. validateForReview
//     checks STRUCTURE, not that Step 14 VERIFY actually ran before the builder
//     died, so a structurally-complete orphan may be functionally half-built;
//     letting it flow forward risks rubber-stamping unverified work. So the module
//     NEVER calls validateForReview and has NO reviewReady predicate.
//   • A STALENESS orphan (orphanReason 'staleness' — files still QUARANTINED, the
//     builder MAY STILL BE ALIVE) is only SURFACED, never moved. Re-queuing it would
//     start a second agent on files the first may still be editing — the exact
//     two-agents-on-one-file hazard the quarantine exists to prevent.
//   • A plan a fresh agent has RE-CLAIMED (a non-terminal implement task names it) is
//     NEVER touched — the liveness veto (taskRegistry.findActivePlanTask).
//
// FAIL-OPEN + HONEST: a bad root, a garbage registry, an absent in-progress dir, a
// per-plan move collision, and a broken cleanup log each degrade to a recorded
// skip/surface or an empty result — never a throw.
//
// Every fixture writes to os.tmpdir(); NOTHING touches the real repo root.

const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const planRecovery = require('../src/lib/plan-recovery.js');
const taskRegistry = require('../src/lib/task-registry.js');
const { validateForReview } = require('../src/lib/plan-validator.js');

// ── sandbox harness ──────────────────────────────────────────────────────────

const sandboxes = [];

function makeSandbox() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-plan-recovery-'));
  fs.mkdirSync(path.join(dir, 'plans', 'in-progress'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'plans', 'todo'), { recursive: true });
  fs.mkdirSync(path.join(dir, '.ctoc', 'state'), { recursive: true });
  sandboxes.push(dir);
  return dir;
}

afterEach(() => {
  while (sandboxes.length) {
    const dir = sandboxes.pop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// A minimal in-progress plan body (NOT review-ready — no Step 8–16 checklist).
function writeInProgressPlan(sb, slug) {
  const content =
    '---\napproved_by: human\ngate_crossed: implementation → todo\n---\n\n' +
    `---\ntitle: "${slug}"\ntype: implementation\niron_loop: true\nfiles:\n  - "src/${slug}.js"\n---\n\n` +
    `# ${slug}\n\nHalf-built work; the builder died mid-implementation.\n`;
  const p = path.join(sb, 'plans', 'in-progress', `${slug}.md`);
  fs.writeFileSync(p, content);
  return p;
}

// A GENUINELY review-ready in-progress plan: the full Step 8–16 checklist that
// makes validateForReview pass (mirrors tests/w10-live-agent-reconcile.test.js).
function writeReviewReadyInProgressPlan(sb, slug) {
  const stepBlock = ['8: TEST', '9: PREPARE', '10: IMPLEMENT', '11: REVIEW', '12: OPTIMIZE',
    '13: SECURE', '14: VERIFY', '15: DOCUMENT', '16: FINAL-REVIEW']
    .map((s) => `### Step ${s}\n- [x] done\n`).join('\n');
  const content =
    '---\napproved_by: human\ngate_crossed: implementation → todo\n---\n\n' +
    `---\ntitle: "${slug}"\ntype: implementation\niron_loop: true\nfiles:\n  - "src/${slug}.js"\n---\n\n` +
    `# ${slug}\n\n## Execution Plan (Steps 8-16)\n\n${stepBlock}\n`;
  const p = path.join(sb, 'plans', 'in-progress', `${slug}.md`);
  fs.writeFileSync(p, content);
  return p;
}

// Build a task literal. `orphanReason`:
//   undefined  → result = null   (confirmed-absent RELEASED orphan)
//   a string   → result = { ok:false, orphanReason }
function makeTask(id, opts = {}) {
  const {
    kind = 'implement', plan, status = 'orphaned',
    orphanReason, agentTaskId = null, touches = [], startedMinutesAgo = 300,
  } = opts;
  const result = orphanReason === undefined ? null : { ok: false, orphanReason };
  const startedIso = new Date(Date.now() - startedMinutesAgo * 60_000).toISOString();
  return {
    id, kind, label: '', plan, status, agentTaskId,
    touches, gitOp: false, blockedBy: [], result,
    ts: { created: startedIso, started: startedIso, cancelRequested: null, done: startedIso },
  };
}

function seedRegistry(sb, tasks) {
  const reg = taskRegistry.emptyRegistry();
  reg.tasks = tasks;
  reg.seq = tasks.length;
  taskRegistry.save(sb, reg);
}

const inProgressExists = (sb, slug) => fs.existsSync(path.join(sb, 'plans', 'in-progress', `${slug}.md`));
const todoExists = (sb, slug) => fs.existsSync(path.join(sb, 'plans', 'todo', `${slug}.md`));
const readCleanupLog = (sb) => {
  const p = path.join(sb, '.ctoc', 'logs', 'cleanup.json');
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null;
};

// ── 1 · released 'presumed-dead' → re-queued to todo ─────────────────────────

describe('1 — a released (presumed-dead) orphan is re-queued in-progress → todo', () => {
  it('moves the plan to todo, reports it recovered, and records a cleanup entry', () => {
    const sb = makeSandbox();
    writeInProgressPlan(sb, 'alpha');
    seedRegistry(sb, [makeTask('t1', { plan: 'alpha', orphanReason: 'presumed-dead' })]);

    const r = planRecovery.recoverOrphanedPlans(sb);

    assert.ok(!inProgressExists(sb, 'alpha'), 'plan left in-progress/');
    assert.ok(todoExists(sb, 'alpha'), 'plan now resident in todo/');
    assert.equal(r.recovered.length, 1, 'exactly one recovered');
    assert.equal(r.recovered[0].plan, 'alpha');
    assert.equal(r.recovered[0].taskId, 't1');
    const log = readCleanupLog(sb);
    assert.ok(Array.isArray(log) && log.some(
      (e) => e.plan === 'alpha' && e.from === 'in-progress' && e.to === 'todo' && e.action === 'recovered'),
      'cleanup.json records a recovered in-progress→todo entry');
  });
});

// ── 2 · staleness orphan → SURFACED only (the two-agents safety tier) ─────────

describe('2 — a staleness orphan (files still quarantined) is SURFACED, never moved', () => {
  it('leaves the plan in in-progress and reports it surfaced, not recovered', () => {
    const sb = makeSandbox();
    writeInProgressPlan(sb, 'beta');
    seedRegistry(sb, [makeTask('t1', { plan: 'beta', orphanReason: 'staleness' })]);

    const r = planRecovery.recoverOrphanedPlans(sb);

    assert.ok(inProgressExists(sb, 'beta'), 'plan STAYS in in-progress/ — its builder may still be editing');
    assert.ok(!todoExists(sb, 'beta'), 'plan NOT moved to todo/');
    assert.equal(r.recovered.length, 0, 'nothing recovered');
    assert.equal(r.surfaced.length, 1, 'exactly one surfaced');
    assert.equal(r.surfaced[0].plan, 'beta');
    assert.match(r.surfaced[0].reason, /staleness|still be running/i, 'reason names the still-alive risk');
    assert.equal(readCleanupLog(sb), null, 'no cleanup entry for a surfaced-only plan');
  });
});

// ── 3 · confirmed-absent (result null) is RELEASED → recovered ───────────────

describe('3 — a confirmed-absent orphan (result null) is released and recovered', () => {
  it('treats a null result as released (reason !== staleness) and re-queues it', () => {
    const sb = makeSandbox();
    writeInProgressPlan(sb, 'gamma');
    seedRegistry(sb, [makeTask('t1', { plan: 'gamma' })]); // orphanReason undefined ⇒ result null

    const r = planRecovery.recoverOrphanedPlans(sb);

    assert.ok(todoExists(sb, 'gamma'), 'null-result orphan re-queued to todo');
    assert.equal(r.recovered.length, 1);
    assert.equal(r.recovered[0].plan, 'gamma');
  });
});

// ── 4 · liveness veto — a fresh agent re-claimed the plan ────────────────────

describe('4 — a plan a fresh agent re-claimed is NEVER moved (liveness veto)', () => {
  it('skips the plan when a non-terminal implement task names it', () => {
    const sb = makeSandbox();
    writeInProgressPlan(sb, 'delta');
    seedRegistry(sb, [
      makeTask('t1', { plan: 'delta', orphanReason: 'presumed-dead' }),
      makeTask('t2', { plan: 'delta', status: 'running', agentTaskId: 'a9' }), // the fresh re-claim
    ]);

    const r = planRecovery.recoverOrphanedPlans(sb);

    assert.ok(inProgressExists(sb, 'delta'), 'plan stays — a live agent owns it');
    assert.ok(!todoExists(sb, 'delta'), 'not moved');
    assert.equal(r.recovered.length, 0, 'nothing recovered');
    assert.equal(r.skipped.length, 1, 'exactly one skipped');
    assert.equal(r.skipped[0].plan, 'delta');
    assert.match(r.skipped[0].reason, /live|fresh agent|owns/i, 'reason names the live re-claim');
  });
});

// ── 5 · THE REBUILD-STANCE PROOF — a review-ready RELEASED orphan STILL re-queues

describe('5 — a review-ready released orphan is re-queued anyway (rebuild stance)', () => {
  it('re-queues a plan that genuinely passes validateForReview — no forward-to-review skip', () => {
    const sb = makeSandbox();
    const planPath = writeReviewReadyInProgressPlan(sb, 'epsilon');
    // PROVE the plan is genuinely review-ready — otherwise this test proves nothing.
    assert.equal(validateForReview(planPath, sb).valid, true,
      'fixture must actually pass validateForReview for the rebuild-stance proof to bite');
    seedRegistry(sb, [makeTask('t1', { plan: 'epsilon', orphanReason: 'confirmed-dead' })]);

    const r = planRecovery.recoverOrphanedPlans(sb);

    assert.ok(todoExists(sb, 'epsilon'), 'a REVIEW-READY released orphan is STILL re-queued to todo');
    assert.ok(!inProgressExists(sb, 'epsilon'), 'not left in in-progress for the forward-to-review path');
    assert.equal(r.recovered.length, 1, 'recovered regardless of review-readiness');
    assert.equal(r.skipped.length, 0, 'no review-ready-left-for-forward-path skip exists in this design');
  });
});

// ── 6 · confirmed-dead is the third released reason → recovered ──────────────

describe('6 — a confirmed-dead orphan is released and recovered', () => {
  it('re-queues an orphan the harness confirmed gone', () => {
    const sb = makeSandbox();
    writeInProgressPlan(sb, 'zeta');
    seedRegistry(sb, [makeTask('t1', { plan: 'zeta', orphanReason: 'confirmed-dead' })]);

    const r = planRecovery.recoverOrphanedPlans(sb);

    assert.ok(todoExists(sb, 'zeta'), 'confirmed-dead orphan re-queued');
    assert.equal(r.recovered.length, 1);
  });
});

// ── 7 · unreadable registry → fail-open empty ────────────────────────────────

describe('7 — a garbage registry degrades to an empty result, never a throw', () => {
  it('returns empties when tasks.json is not valid JSON', () => {
    const sb = makeSandbox();
    writeInProgressPlan(sb, 'eta');
    fs.writeFileSync(path.join(sb, '.ctoc', 'state', 'tasks.json'), '{ not valid json ');

    let r;
    assert.doesNotThrow(() => { r = planRecovery.recoverOrphanedPlans(sb); });
    assert.deepEqual([r.recovered, r.surfaced, r.skipped], [[], [], []], 'all empty');
    assert.ok(inProgressExists(sb, 'eta'), 'plan untouched');
  });
});

// ── 8 · absent in-progress dir → fail-open empty ─────────────────────────────

describe('8 — an absent plans/in-progress/ degrades to an empty result', () => {
  it('returns empties when the in-progress directory does not exist', () => {
    const sb = makeSandbox();
    fs.rmSync(path.join(sb, 'plans', 'in-progress'), { recursive: true, force: true });
    seedRegistry(sb, [makeTask('t1', { plan: 'theta', orphanReason: 'presumed-dead' })]);

    let r;
    assert.doesNotThrow(() => { r = planRecovery.recoverOrphanedPlans(sb); });
    assert.deepEqual([r.recovered, r.surfaced, r.skipped], [[], [], []], 'all empty — no resident plan to act on');
  });
});

// ── 9 · idempotent — a second pass recovers nothing ──────────────────────────

describe('9 — recovery is idempotent: a second pass re-queues nothing', () => {
  it('the plan is gone from in-progress after the first pass, so the second is empty', () => {
    const sb = makeSandbox();
    writeInProgressPlan(sb, 'iota');
    seedRegistry(sb, [makeTask('t1', { plan: 'iota', orphanReason: 'presumed-dead' })]);

    const first = planRecovery.recoverOrphanedPlans(sb);
    assert.equal(first.recovered.length, 1, 'first pass recovers');

    const second = planRecovery.recoverOrphanedPlans(sb);
    assert.equal(second.recovered.length, 0, 'second pass recovers nothing (plan no longer in in-progress)');
  });
});

// ── 10 · two orphaned tasks for the SAME plan → recovered exactly once ────────

describe('10 — duplicate orphaned tasks for one plan recover it exactly once', () => {
  it('de-duplicates per plan; one move, one cleanup entry', () => {
    const sb = makeSandbox();
    writeInProgressPlan(sb, 'kappa');
    seedRegistry(sb, [
      makeTask('t1', { plan: 'kappa', orphanReason: 'presumed-dead' }),
      makeTask('t2', { plan: 'kappa', orphanReason: 'confirmed-dead' }),
    ]);

    const r = planRecovery.recoverOrphanedPlans(sb);

    assert.equal(r.recovered.length, 1, 'recovered exactly once despite two orphaned tasks');
    // The dedup `seen` guard is load-bearing: without it the second orphaned task would
    // re-process the (now-moved) plan and record a SPURIOUS "move failed" skip.
    assert.equal(r.skipped.length, 0, 'no spurious skip from the duplicate task (dedup guard)');
    assert.equal(r.surfaced.length, 0, 'no spurious surface from the duplicate task');
    const log = readCleanupLog(sb);
    assert.equal(log.filter((e) => e.plan === 'kappa').length, 1, 'exactly one cleanup entry');
  });
});

// ── 11 · a per-plan move failure is a recorded skip; the batch continues ──────

describe('11 — a move collision skips that plan but does not abort the batch', () => {
  it('first plan (todo collision) skipped; a second eligible plan still recovered', () => {
    const sb = makeSandbox();
    writeInProgressPlan(sb, 'lambda');
    writeInProgressPlan(sb, 'mu');
    // Pre-place a DIFFERENT same-basename plan in todo/ so movePlan's collision guard throws.
    fs.writeFileSync(path.join(sb, 'plans', 'todo', 'lambda.md'), '---\ntitle: "other"\n---\n# other\n');
    seedRegistry(sb, [
      makeTask('t1', { plan: 'lambda', orphanReason: 'presumed-dead' }),
      makeTask('t2', { plan: 'mu', orphanReason: 'presumed-dead' }),
    ]);

    const r = planRecovery.recoverOrphanedPlans(sb);

    assert.equal(r.skipped.length, 1, 'the colliding plan is skipped');
    assert.equal(r.skipped[0].plan, 'lambda');
    assert.match(r.skipped[0].reason, /move failed/i, 'reason names the move failure');
    assert.ok(inProgressExists(sb, 'lambda'), 'colliding plan left in in-progress');
    assert.equal(r.recovered.length, 1, 'the second plan is still recovered (batch not aborted)');
    assert.equal(r.recovered[0].plan, 'mu');
    assert.ok(todoExists(sb, 'mu'), 'second plan moved');
  });
});

// ── 12 · a non-implement orphaned task is ignored (implement-only) ────────────

describe('12 — an orphaned NON-implement task is ignored (recovery is implement-only)', () => {
  it('a review-kind orphaned task naming an in-progress plan is not acted on', () => {
    const sb = makeSandbox();
    writeInProgressPlan(sb, 'nu');
    seedRegistry(sb, [makeTask('t1', { kind: 'review', plan: 'nu', orphanReason: 'presumed-dead' })]);

    const r = planRecovery.recoverOrphanedPlans(sb);

    assert.deepEqual([r.recovered, r.surfaced, r.skipped], [[], [], []], 'a non-implement orphan is not a stalled build');
    assert.ok(inProgressExists(sb, 'nu'), 'plan untouched');
  });
});

// ── 13 · the recorded reason + timestamp explain the re-queue to the human ────

describe('13 — the re-queue carries a rebuild reason and a deterministic timestamp', () => {
  it('recovered reason names the clean rebuild; cleanup entry carries the injected now', () => {
    const sb = makeSandbox();
    writeInProgressPlan(sb, 'xi');
    seedRegistry(sb, [makeTask('t1', { plan: 'xi', orphanReason: 'presumed-dead' })]);
    const now = Date.parse('2026-07-22T09:00:00.000Z');

    const r = planRecovery.recoverOrphanedPlans(sb, { now });

    assert.match(r.recovered[0].reason, /rebuild|re-?verif|no longer running/i,
      'reason explains WHY the plan reappeared in the queue');
    const entry = readCleanupLog(sb).find((e) => e.plan === 'xi');
    assert.equal(entry.at, new Date(now).toISOString(), 'cleanup timestamp uses the injected now');
  });
});

// ── 14 · a non-string root never throws (fail-open on a bad root) ─────────────

describe('14 — a bad (non-string) root degrades to empty, never throws', () => {
  it('returns empties for a numeric root instead of crashing the menu render', () => {
    let r;
    assert.doesNotThrow(() => { r = planRecovery.recoverOrphanedPlans(/** @type {any} */ (12345)); });
    assert.deepEqual([r.recovered, r.surfaced, r.skipped], [[], [], []], 'all empty on a bad root');
  });
});

// ── 15 · a corrupt cleanup log never breaks recovery ─────────────────────────

describe('15 — a corrupt cleanup.json does not break recovery; a fresh log is written', () => {
  it('recovers the plan and leaves a valid array cleanup log', () => {
    const sb = makeSandbox();
    writeInProgressPlan(sb, 'omicron');
    fs.mkdirSync(path.join(sb, '.ctoc', 'logs'), { recursive: true });
    fs.writeFileSync(path.join(sb, '.ctoc', 'logs', 'cleanup.json'), 'not json at all');
    seedRegistry(sb, [makeTask('t1', { plan: 'omicron', orphanReason: 'presumed-dead' })]);

    const r = planRecovery.recoverOrphanedPlans(sb);

    assert.equal(r.recovered.length, 1, 'recovery proceeds despite the corrupt log');
    assert.ok(todoExists(sb, 'omicron'), 'plan moved');
    const log = readCleanupLog(sb);
    assert.ok(Array.isArray(log) && log.some((e) => e.plan === 'omicron'), 'a fresh valid log was written');
  });
});

// ── 17 · a cleanup-log WRITE failure never turns a real recovery into a skip ──

describe('17 — a failed cleanup-log write does not undo or mis-report the recovery', () => {
  it('recovers the plan even when the log directory cannot be created; records to stderr', () => {
    const sb = makeSandbox();
    writeInProgressPlan(sb, 'pi');
    // Put a FILE where .ctoc/logs must be a directory, so mkdirSync throws during the log append.
    fs.writeFileSync(path.join(sb, '.ctoc', 'logs'), 'not a directory');
    seedRegistry(sb, [makeTask('t1', { plan: 'pi', orphanReason: 'presumed-dead' })]);

    const origWrite = process.stderr.write;
    let captured = '';
    process.stderr.write = (chunk) => { captured += String(chunk); return true; };
    let r;
    try {
      r = planRecovery.recoverOrphanedPlans(sb);
    } finally {
      process.stderr.write = origWrite;
    }

    assert.equal(r.recovered.length, 1, 'the move succeeded, so the plan is recovered despite the log failure');
    assert.equal(r.skipped.length, 0, 'a log-write failure is NOT a move failure — it must not become a skip');
    assert.ok(todoExists(sb, 'pi'), 'plan physically moved to todo/');
    assert.match(captured, /cleanup-log write failed for pi/, 'the log failure is recorded, not silently swallowed');
  });
});

// ── 16 · structural — the module never consults review-readiness ─────────────

describe('16 — the module has NO review-readiness gate (rebuild stance is structural)', () => {
  it('plan-recovery.js neither requires nor CALLS the validator, and has no reviewReady predicate', () => {
    // The invariant is BEHAVIORAL: the module must not consult review-readiness. A prose
    // mention in the JSDoc explaining WHY it does not is correct documentation, not a
    // violation — so this checks the require edge and the call site, not a bare substring.
    const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'lib', 'plan-recovery.js'), 'utf8');
    assert.ok(!/require\(\s*['"][^'"]*plan-validator['"]\s*\)/.test(src),
      'the module must not require plan-validator — a released orphan re-queues regardless of review-readiness');
    assert.ok(!/validateForReview\s*\(/.test(src),
      'the module must not CALL validateForReview');
    assert.ok(!/reviewReady/.test(src),
      'the reviewReady predicate was removed by the human\'s rebuild decision');
  });
});
