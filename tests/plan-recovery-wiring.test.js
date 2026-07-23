'use strict';

/**
 * THE MENU RENDER RECOVERS ORPHANED PLANS AND SAYS SO.
 *
 * Slice 00216 wired `plan-recovery.recoverOrphanedPlans` into the dashboard render
 * (`menu-screens.buildDashboardTable`), so recovery HAPPENS on every open — but its
 * return value was discarded, so a plan was re-queued SILENTLY and the human saw
 * nothing. "The measure is the human": a person opening the menu must SEE what was
 * recovered or surfaced, exactly as the task-orphan count is already surfaced.
 *
 * These cases drive the REAL human path: a real registry + real plan files on disk,
 * then `menuScreens.buildDashboardTable(root)`, then assertions on the TEXT a human
 * reads and on where the plan file physically ended up. The private render helper is
 * never called directly — a test that asserted a helper returns a populated string
 * would prove nothing about what reaches the screen, which is the whole point.
 *
 * ORDERING NOTE (load-bearing for the fixtures). `buildDashboardTable` runs the task
 * reconciler BEFORE recovery. The reconciler releases a staleness orphan once its
 * total age passes 2× the 120-min implement floor (240 min) — flipping it to
 * `presumed-dead`, which recovery would then MOVE. So the surfaced-case fixture uses a
 * YOUNG staleness orphan (100 min) that stays quarantined through the reconcile pass.
 *
 * Every fixture writes to os.tmpdir(); NOTHING touches the real repo root.
 */

const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const menuScreens = require('../src/lib/menu-screens.js');
const planRecovery = require('../src/lib/plan-recovery.js');
const taskRegistry = require('../src/lib/task-registry.js');

// ── the exact human-facing phrases the render must (or must not) carry ──────────
const RECOVERED_LINE = /re-queued for a clean rebuild and re-verification/;
const SURFACED_LINE = /the builder may still be running; not yet recovered/;
const THREW_LINE = /plan recovery could not run/;

// ── sandbox harness ────────────────────────────────────────────────────────────

const sandboxes = [];

function makeSandbox() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-recovery-wiring-'));
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

// A minimal in-progress plan body (NOT review-ready — that is irrelevant to recovery,
// which re-queues a released orphan regardless of review-readiness).
function writeInProgressPlan(sb, slug) {
  const content =
    '---\napproved_by: human\ngate_crossed: implementation → todo\n---\n\n' +
    `---\ntitle: "${slug}"\ntype: implementation\niron_loop: true\nfiles:\n  - "src/${slug}.js"\n---\n\n` +
    `# ${slug}\n\nHalf-built work; the builder died mid-implementation.\n`;
  const p = path.join(sb, 'plans', 'in-progress', `${slug}.md`);
  fs.writeFileSync(p, content);
  return p;
}

// Build an already-orphaned implement task literal. `orphanReason`:
//   undefined  → result = null   (confirmed-absent RELEASED orphan)
//   a string   → result = { ok:false, orphanReason }
function makeOrphanTask(id, opts = {}) {
  const { plan, orphanReason, startedMinutesAgo = 300 } = opts;
  const result = orphanReason === undefined ? null : { ok: false, orphanReason };
  const startedIso = new Date(Date.now() - startedMinutesAgo * 60_000).toISOString();
  return {
    id, kind: 'implement', label: '', plan, status: 'orphaned', agentTaskId: null,
    touches: [], gitOp: false, blockedBy: [], result,
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

// ── 1 · a released (presumed-dead) orphan is re-queued AND the screen says so ───

describe('1 — the dashboard render re-queues a dead-builder orphan and says so', () => {
  it('moves the plan out of in-progress and renders the re-queued line naming the count', () => {
    const sb = makeSandbox();
    writeInProgressPlan(sb, 'alpha');
    seedRegistry(sb, [makeOrphanTask('t1', { plan: 'alpha', orphanReason: 'presumed-dead' })]);

    const text = menuScreens.buildDashboardTable(sb);

    // The human-visible half — the whole point of this slice.
    assert.match(text, RECOVERED_LINE, 'the render must SAY the plan was re-queued for a rebuild');
    assert.match(text, /1 plan whose builder is no longer running/, 'the line names the right count');
    // The physical projection 00216 already performs, re-confirmed end to end.
    assert.ok(!inProgressExists(sb, 'alpha'), 'the phantom is gone from in-progress');
    assert.ok(todoExists(sb, 'alpha'), 'the plan is re-queued to todo for a clean rebuild');
  });
});

// ── 2 · a staleness orphan is SURFACED (not moved) and the screen says so ───────

describe('2 — a staleness orphan is surfaced, not moved, and the screen says so', () => {
  it('renders the "may still be running" surface line and leaves the plan in in-progress', () => {
    const sb = makeSandbox();
    writeInProgressPlan(sb, 'beta');
    // 100 min < the 240-min presumed-dead bound, so the reconcile pass leaves it
    // quarantined and recovery SURFACES it rather than moving it.
    seedRegistry(sb, [makeOrphanTask('t1', { plan: 'beta', orphanReason: 'staleness', startedMinutesAgo: 100 })]);

    const text = menuScreens.buildDashboardTable(sb);

    assert.match(text, SURFACED_LINE, 'the render must SURFACE the still-quarantined orphan honestly');
    assert.doesNotMatch(text, RECOVERED_LINE, 'a surfaced orphan must NOT read as recovered');
    assert.ok(inProgressExists(sb, 'beta'), 'a surfaced orphan STAYS in in-progress — its builder may still be editing');
    assert.ok(!todoExists(sb, 'beta'), 'a surfaced orphan is NOT moved');
  });
});

// ── 3 · a clean project renders NEITHER line (byte-identical-for-clean guard) ────

describe('3 — a clean project renders neither recovery line (no noise)', () => {
  it('shows no recovered and no surfaced line when there are no orphaned plans', () => {
    const sb = makeSandbox();
    seedRegistry(sb, []); // no tasks at all

    const text = menuScreens.buildDashboardTable(sb);

    assert.doesNotMatch(text, RECOVERED_LINE, 'a clean project must not render the re-queued line');
    assert.doesNotMatch(text, SURFACED_LINE, 'a clean project must not render the surfaced line');
    assert.doesNotMatch(text, THREW_LINE, 'a clean project must not render the recovery-error line');
  });
});

// ── 4 · recovery is ADDITIVE — the rest of the dashboard still renders ───────────

describe('4 — recovery is additive, never a replacement for the rest of the dashboard', () => {
  it('still renders the version banner and the inbox alongside a recovered plan', () => {
    const sb = makeSandbox();
    writeInProgressPlan(sb, 'gamma');
    seedRegistry(sb, [makeOrphanTask('t1', { plan: 'gamma', orphanReason: 'presumed-dead' })]);

    const text = menuScreens.buildDashboardTable(sb);

    assert.match(text, RECOVERED_LINE, 'precondition: the recovered line is present');
    assert.match(text, /CTOC v/, 'the version banner still renders');
    assert.match(text, /INBOX/, 'the inbox block still renders');
  });
});

// ── 5 · a recovery THROW is fail-open AND honest — rendered, never bricked ───────

describe('5 — a recovery failure is fail-open and honest, never a bricked dashboard', () => {
  it('still renders the dashboard and says recovery could not run when the module throws', () => {
    const sb = makeSandbox();
    writeInProgressPlan(sb, 'delta');
    seedRegistry(sb, [makeOrphanTask('t1', { plan: 'delta', orphanReason: 'presumed-dead' })]);

    // Inject a throw at the SAME cached module object menu-screens holds a reference to.
    const orig = planRecovery.recoverOrphanedPlans;
    planRecovery.recoverOrphanedPlans = () => { throw new Error('injected-recovery-fault'); };
    let text;
    try {
      assert.doesNotThrow(() => { text = menuScreens.buildDashboardTable(sb); },
        'a recovery throw must not brick the dashboard');
    } finally {
      planRecovery.recoverOrphanedPlans = orig;
    }

    assert.match(text, /CTOC v/, 'the dashboard still renders despite the recovery fault');
    assert.match(text, THREW_LINE, 'the failure is stated honestly, not swallowed');
    assert.match(text, /injected-recovery-fault/, 'the failure reason reaches the screen');
  });
});
