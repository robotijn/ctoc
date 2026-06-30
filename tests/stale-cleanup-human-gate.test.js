'use strict';

// SP4 — human-gated grouped cleanup review & execution. The gate-safety suite.
//
// This is the highest-risk slice in the stale-plan chain: it stamps gate markers,
// moves plan files between gate stages, and can delete. Every load-bearing
// invariant from §6.5 is pinned here:
//   - stamp-BEFORE-rename ordering (M5)               → T1, T3, T11
//   - reconciliation never calls approvePlan (M2/M3)  → T1, T2, T7  (structural: not imported)
//   - render performs ZERO fs mutation (M4)           → T4
//   - DOA default is revert, never delete (M6)        → T5, T6, T9
//   - delete fail-closed (explicitlyRejected only)    → T6, primitive guard
//   - deps injection seam honored (M8)                → T7
//   - stage RE-DERIVED at exec from a stage-LESS string (F1/F2) → T1/T2/T5/T11
//   - slug absent from live scan ⇒ fail-closed no-op (F3 negative) → T10, T12
//
// Harness mirrors the SP3 sandbox harness (tests/stale-classifier.test.js):
// os.tmpdir() sandboxes torn down per test; a broadened fs spy with an ordered
// `calls` array over write/rename/unlink/rm; deps spies; namespace classify/verify
// spies on staleDetector (no require.cache surgery).

const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const cleanup = require('../src/lib/stale-cleanup.js');
const menuScreens = require('../src/lib/menu-screens.js');
const actions = require('../src/lib/actions.js'); // referenced for negative assertions only
const staleDetector = require('../src/lib/stale-detector.js');

// ---------------------------------------------------------------------------
// Sandbox harness
// ---------------------------------------------------------------------------

const sandboxes = [];

function makeSandbox() {
  const dir = path.join(
    os.tmpdir(),
    'ctoc-sp4-' + process.pid + '-' + Date.now() + '-' + Math.random().toString(36).slice(2)
  );
  fs.mkdirSync(dir, { recursive: true });
  sandboxes.push(dir);
  return dir;
}

// Write plans/<stage>/<slug>.md with a (possibly two-block) frontmatter.
function writePlan(sandbox, stage, slug, { files = [], approved = false, gateCrossed = null } = {}) {
  const stageDir = path.join(sandbox, 'plans', stage);
  fs.mkdirSync(stageDir, { recursive: true });
  let fm = '---\n' + `title: "${slug}"\n`;
  if (files.length) fm += 'files: [' + files.join(', ') + ']\n';
  if (approved) fm += 'approved_by: human\n';
  if (gateCrossed) fm += `gate_crossed: ${gateCrossed}\n`;
  fm += 'status: refined\n---\n\n' + `# ${slug}\n`;
  fs.writeFileSync(path.join(stageDir, slug + '.md'), fm);
  return path.join(stageDir, slug + '.md');
}

afterEach(() => {
  while (sandboxes.length) {
    const dir = sandboxes.pop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// Broadened fs spy: records an ORDERED `calls` array and passes through to the
// real fs so disk-state assertions (done/<slug>.md exists, etc.) hold.
function spyFs() {
  const calls = [];
  const orig = {
    writeFileSync: fs.writeFileSync,
    renameSync: fs.renameSync,
    unlinkSync: fs.unlinkSync,
    rmSync: fs.rmSync,
  };
  fs.writeFileSync = (p, data, ...rest) => {
    calls.push({ op: 'writeFileSync', path: String(p), content: typeof data === 'string' ? data : undefined });
    return orig.writeFileSync(p, data, ...rest);
  };
  fs.renameSync = (a, b, ...rest) => {
    calls.push({ op: 'renameSync', path: String(a), dest: String(b) });
    return orig.renameSync(a, b, ...rest);
  };
  fs.unlinkSync = (p, ...rest) => {
    calls.push({ op: 'unlinkSync', path: String(p) });
    return orig.unlinkSync(p, ...rest);
  };
  fs.rmSync = (p, ...rest) => {
    calls.push({ op: 'rmSync', path: String(p) });
    return orig.rmSync(p, ...rest);
  };
  return {
    calls,
    restore() {
      Object.assign(fs, orig);
    },
  };
}

// Tiny call-recording spy for deps.
function makeSpy(impl) {
  const calls = [];
  const fn = (...args) => {
    calls.push(args);
    return impl ? impl(...args) : undefined;
  };
  return { fn, calls };
}

// Mirrors EXACTLY how the executor maps a 'claude:cleanup-exec …' string to an
// executeCleanup proposal (the production contract under test). Stage is NEVER
// carried by the string — it is re-derived inside executeCleanup.
function parseCleanupExec(str) {
  const t = str.split(' ');
  if (t[1] === 'category') return { kind: 'category', category: t[2] };
  const slug = t[2];
  const action = t[3];
  if (action === 'delete') return { plan: slug, proposedAction: 'delete', explicitlyRejected: true };
  return { plan: slug, proposedAction: action };
}

// Does a recorded fs call mutate a plan file under plans/<stage>/<slug>.md?
const PLAN_FILE_RE = /[\\/]plans[\\/][^\\/]+[\\/][^\\/]+\.md$/;
function planMutations(calls) {
  return calls.filter(
    (c) =>
      ['writeFileSync', 'renameSync', 'unlinkSync', 'rmSync'].includes(c.op) &&
      (PLAN_FILE_RE.test(c.path) || (c.dest && PLAN_FILE_RE.test(c.dest)))
  );
}

const endsWithPlan = (p, stage, slug) => String(p).endsWith(path.join('plans', stage, slug + '.md'));

// Namespace spies: drive deterministic categories WITHOUT real git. Restored per test.
function stubClassify(category, { explicitlyRejected = false, proposedAction } = {}) {
  const origV = staleDetector.verifyStaleCandidate;
  const origC = staleDetector.classifyStaleCandidate;
  staleDetector.verifyStaleCandidate = () => ({
    gitAvailable: true,
    error: null,
    approvedBy: null,
    declaredFiles: [],
    allFilesExist: true,
    anyFileMissing: false,
    stageEntryEpoch: null,
    filesLastModifiedEpoch: null,
    filesModifiedAfterEntry: false,
    slugMatchCommits: [],
    slugMatchAfterEntry: false,
    explicitlyRejected,
  });
  const actionByCat = {
    'shipped-but-early': 'archive-to-done',
    'approved-but-stranded': 'advance-via-reconciliation',
    'dead-on-arrival': explicitlyRejected ? 'delete' : 'revert',
  };
  staleDetector.classifyStaleCandidate = (cand) => ({
    plan: cand.plan,
    category,
    proposedAction: proposedAction || actionByCat[category] || null,
    evidence: ['stub evidence'],
  });
  return () => {
    staleDetector.verifyStaleCandidate = origV;
    staleDetector.classifyStaleCandidate = origC;
  };
}

const ALL_ACTION_KEYS_NONDIGIT = (screen) => {
  for (const k of Object.keys(screen.actions)) {
    assert.ok(!/^\d+$/.test(k), 'no action key may be a bare digit: ' + k);
  }
  const opts = (screen.ask && screen.ask.questions && screen.ask.questions[0] && screen.ask.questions[0].options) || [];
  for (const o of opts) {
    assert.ok(!/^\d+$/.test(o.label), 'no option label may be a bare digit: ' + o.label);
  }
};

// ===========================================================================
// T1 (M2 + re-derivation) — shipped-but-early: re-derives stage, stamp-before-move, no approvePlan
// ===========================================================================

describe('T1 — shipped-but-early archive: re-derives stage, stamps before move, no approvePlan', () => {
  it('writes marker to plans/functional/foo.md BEFORE rename to done/, approvePlan never called', () => {
    const sb = makeSandbox();
    writePlan(sb, 'functional', 'foo', { files: ['src/missing-x.js'] }); // declared file ABSENT ⇒ candidate
    const spy = spyFs();
    const approveSpy = makeSpy();
    const moveSpy = makeSpy();
    try {
      const proposal = { plan: 'foo', proposedAction: 'archive-to-done' }; // NO stage field
      cleanup.executeCleanup(proposal, sb, { approvePlan: approveSpy.fn, movePlan: moveSpy.fn });
    } finally {
      spy.restore();
    }

    const writeIdx = spy.calls.findIndex(
      (c) => c.op === 'writeFileSync' && endsWithPlan(c.path, 'functional', 'foo') &&
        /approved_by:\s*human/.test(c.content || '') && /stale-reconciliation/.test(c.content || '')
    );
    const renameIdx = spy.calls.findIndex(
      (c) => c.op === 'renameSync' && endsWithPlan(c.path, 'functional', 'foo')
    );
    assert.ok(writeIdx >= 0, 'a stamped writeFileSync to plans/functional/foo.md must occur (stage re-derived to functional)');
    assert.ok(renameIdx >= 0, 'a renameSync of plans/functional/foo.md must occur');
    assert.ok(writeIdx < renameIdx, 'WRITE must precede RENAME (gate-hook window, M5)');

    const renamed = spy.calls.find((c) => c.op === 'renameSync' && endsWithPlan(c.path, 'functional', 'foo'));
    assert.ok(String(renamed.dest).endsWith(path.join('plans', 'done', 'foo.md')), 'rename target is plans/done/foo.md');

    const donePath = path.join(sb, 'plans', 'done', 'foo.md');
    assert.ok(fs.existsSync(donePath), 'final file lands in plans/done/foo.md');
    const content = fs.readFileSync(donePath, 'utf8');
    assert.match(content, /^---[\s\S]*approved_by:\s*human/, 'moved file carries approved_by: human in a leading block');
    assert.ok(content.includes('gate_crossed: stale-reconciliation'), 'gate_crossed marks a stale-reconciliation move');

    assert.equal(approveSpy.calls.length, 0, 'approvePlan must NOT be called (M2)');
  });
});

// ===========================================================================
// T2 (M3 + re-derivation) — approved-but-stranded: reconciliation, no approvePlan, no actions.movePlan
// ===========================================================================

describe('T2 — approved-but-stranded reconcile: re-derives stage, no approvePlan, no movePlan', () => {
  it('lands in done/ with stale-reconciliation markers; neither approvePlan nor movePlan called', () => {
    const sb = makeSandbox();
    writePlan(sb, 'review', 'bar', { files: ['src/missing-y.js'], approved: true });
    const spy = spyFs();
    const approveSpy = makeSpy();
    const moveSpy = makeSpy();
    try {
      const proposal = { plan: 'bar', proposedAction: 'advance-via-reconciliation' }; // NO stage
      cleanup.executeCleanup(proposal, sb, { approvePlan: approveSpy.fn, movePlan: moveSpy.fn });
    } finally {
      spy.restore();
    }

    const donePath = path.join(sb, 'plans', 'done', 'bar.md');
    assert.ok(fs.existsSync(donePath), 'stage re-derived to review ⇒ lands in done/bar.md');
    const content = fs.readFileSync(donePath, 'utf8');
    assert.ok(content.includes('gate_crossed: stale-reconciliation'), 'gate_crossed: stale-reconciliation present');
    assert.match(content, /approved_by:\s*human/, 'approved_by: human present');

    const writeIdx = spy.calls.findIndex((c) => c.op === 'writeFileSync' && endsWithPlan(c.path, 'review', 'bar'));
    const renameIdx = spy.calls.findIndex((c) => c.op === 'renameSync' && endsWithPlan(c.path, 'review', 'bar'));
    assert.ok(writeIdx >= 0 && renameIdx >= 0 && writeIdx < renameIdx, 'stamp-before-rename on plans/review/bar.md');

    assert.equal(approveSpy.calls.length, 0, 'approvePlan must NOT be called (M3)');
    assert.equal(moveSpy.calls.length, 0, 'movePlan must NOT be called directly for reconcile (M3)');
  });
});

// ===========================================================================
// T3 (M5) — marker-before-rename ordering, named stand-alone
// ===========================================================================

describe('T3 — stamp strictly before rename (named ordering invariant)', () => {
  it('the stamped source write precedes the source→done rename', () => {
    const sb = makeSandbox();
    const planPath = writePlan(sb, 'functional', 'ord', { files: ['src/missing-z.js'] });
    const spy = spyFs();
    try {
      cleanup.archivePlan(planPath, sb);
    } finally {
      spy.restore();
    }
    const writeIdx = spy.calls.findIndex(
      (c) => c.op === 'writeFileSync' && endsWithPlan(c.path, 'functional', 'ord') && /stale-reconciliation/.test(c.content || '')
    );
    const renameIdx = spy.calls.findIndex((c) => c.op === 'renameSync' && endsWithPlan(c.path, 'functional', 'ord'));
    assert.ok(writeIdx >= 0, 'stamped write recorded');
    assert.ok(renameIdx >= 0, 'rename recorded');
    assert.ok(writeIdx < renameIdx, 'write index must be < rename index');
  });
});

// ===========================================================================
// T4 (M4) — render performs ZERO fs mutation
// ===========================================================================

describe('T4 — cleanup screens are pure: render mutates no plan file', () => {
  it('routing every cleanup screen produces zero plan-file writes/renames/unlinks/rms', () => {
    const sb = makeSandbox();
    writePlan(sb, 'functional', 'foo', { files: ['src/missing.js'] });
    const restore = stubClassify('shipped-but-early');
    const spy = spyFs();
    try {
      const routes = [
        ['inbox', 'cleanup'],
        ['inbox', 'cleanup', 'category'],
        ['inbox', 'cleanup', 'confirm', 'shipped-but-early'],
        ['inbox', 'cleanup', 'plan'],
        ['inbox', 'cleanup', 'plan', 'foo'],
        ['inbox', 'cleanup', 'override', 'foo'],
      ];
      for (const r of routes) menuScreens.route(r, sb);
    } finally {
      spy.restore();
      restore();
    }
    assert.equal(planMutations(spy.calls).length, 0, 'no plan-file mutation during render');
  });
});

// ===========================================================================
// T5 (M6 + re-derivation) — DOA default is revert; re-derives stage; no unlink/rm
// ===========================================================================

describe('T5 — dead-on-arrival default revert: re-derives stage, never deletes', () => {
  it('revert moves implementation→functional via the injected mover; no unlink/rm', () => {
    const sb = makeSandbox();
    writePlan(sb, 'implementation', 'baz', { files: ['src/gone.js'] });
    const spy = spyFs();
    const moveSpy = makeSpy();
    try {
      cleanup.executeCleanup({ plan: 'baz', proposedAction: 'revert' }, sb, { movePlan: moveSpy.fn });
    } finally {
      spy.restore();
    }
    assert.equal(moveSpy.calls.length, 1, 'mover called exactly once');
    const [arg0, arg1, arg2] = moveSpy.calls[0];
    assert.ok(endsWithPlan(arg0, 'implementation', 'baz'), 'mover got plans/implementation/baz.md (stage re-derived)');
    assert.equal(arg1, 'functional', 'REVERT_MAP: implementation→functional');
    assert.equal(arg2, sb, 'mover got the root');
    assert.equal(spy.calls.filter((c) => c.op === 'unlinkSync').length, 0, 'revert never unlinks (M6)');
    assert.equal(spy.calls.filter((c) => c.op === 'rmSync').length, 0, 'revert never rms (M6)');
  });
});

// ===========================================================================
// T6 (M6/D4) — delete ONLY when explicitlyRejected === true (double guard)
// ===========================================================================

describe('T6 — delete fail-closed: dispatcher + primitive both guard explicitlyRejected', () => {
  it('(a) delete without explicitlyRejected THROWS; file remains; no unlink', () => {
    const sb = makeSandbox();
    writePlan(sb, 'implementation', 'del', { files: ['src/gone.js'] });
    const spy = spyFs();
    try {
      assert.throws(
        () => cleanup.executeCleanup({ plan: 'del', proposedAction: 'delete' }, sb),
        /explicitlyRejected/i,
        'dispatcher must refuse delete without explicitlyRejected'
      );
    } finally {
      spy.restore();
    }
    assert.ok(fs.existsSync(path.join(sb, 'plans', 'implementation', 'del.md')), 'file still on disk');
    assert.equal(spy.calls.filter((c) => c.op === 'unlinkSync').length, 0, 'no unlinkSync');
  });

  it('(b) delete WITH explicitlyRejected removes the file and logs stale-delete', () => {
    const sb = makeSandbox();
    writePlan(sb, 'implementation', 'del', { files: ['src/gone.js'] });
    const spy = spyFs();
    try {
      cleanup.executeCleanup({ plan: 'del', proposedAction: 'delete', explicitlyRejected: true }, sb);
    } finally {
      spy.restore();
    }
    assert.ok(!fs.existsSync(path.join(sb, 'plans', 'implementation', 'del.md')), 'file removed');
    const unlinks = spy.calls.filter((c) => c.op === 'unlinkSync' && endsWithPlan(c.path, 'implementation', 'del'));
    assert.equal(unlinks.length, 1, 'exactly one unlinkSync on the plan file');
    const log = JSON.parse(fs.readFileSync(path.join(sb, '.ctoc', 'logs', 'stale-cleanup.json'), 'utf8'));
    assert.ok(log.some((e) => e.reason === 'stale-delete'), 'log records reason stale-delete');
  });

  it('primitive deletePlan THROWS without explicitlyRejected (belt-and-suspenders)', () => {
    const sb = makeSandbox();
    const planPath = path.join(sb, 'plans', 'implementation', 'p.md');
    assert.throws(() => cleanup.deletePlan(planPath), /explicitlyRejected/i, 'no opts ⇒ throw');
    assert.throws(() => cleanup.deletePlan(planPath, { explicitlyRejected: false }), /explicitlyRejected/i, 'false ⇒ throw');
  });
});

// ===========================================================================
// T7 (M8) — executeCleanup deps injection honored (all three seams)
// ===========================================================================

describe('T7 — deps injection: listStaleCandidates + movePlan used; approvePlan never referenced', () => {
  it('injected listStaleCandidates drives stage re-derivation (no file on disk needed)', () => {
    const sb = makeSandbox();
    const moveSpy = makeSpy();
    const injScan = () => [{ plan: 'inj', stage: 'implementation' }];
    cleanup.executeCleanup(
      { plan: 'inj', proposedAction: 'revert' },
      sb,
      { listStaleCandidates: injScan, movePlan: moveSpy.fn }
    );
    assert.equal(moveSpy.calls.length, 1, 'mover called once');
    const [arg0, arg1, arg2] = moveSpy.calls[0];
    assert.equal(arg0, path.join(sb, 'plans', 'implementation', 'inj.md'), 'path built from INJECTED scan stage');
    assert.equal(arg1, 'functional');
    assert.equal(arg2, sb);
  });

  it('revert exercises the move seam (live half)', () => {
    const sb = makeSandbox();
    writePlan(sb, 'implementation', 'baz', { files: ['src/gone.js'] });
    const moveSpy = makeSpy();
    cleanup.executeCleanup({ plan: 'baz', proposedAction: 'revert' }, sb, { movePlan: moveSpy.fn });
    assert.equal(moveSpy.calls.length, 1, 'movePlan seam is live for revert');
  });

  it('archive bypasses the move seam and never references approvePlan', () => {
    const sb = makeSandbox();
    writePlan(sb, 'functional', 'foo', { files: ['src/missing.js'] });
    const moveSpy = makeSpy();
    const approveSpy = makeSpy();
    cleanup.executeCleanup(
      { plan: 'foo', proposedAction: 'archive-to-done' },
      sb,
      { movePlan: moveSpy.fn, approvePlan: approveSpy.fn }
    );
    assert.equal(moveSpy.calls.length, 0, 'archive does not use the mover');
    assert.equal(approveSpy.calls.length, 0, 'approvePlan never referenced (structural gate-safety)');
  });

  it('stale-cleanup module does NOT export/import approvePlan (structural)', () => {
    assert.equal(typeof cleanup.approvePlan, 'undefined', 'no approvePlan re-export');
    // actions.approvePlan exists but is structurally unreachable from stale-cleanup.
    assert.equal(typeof actions.approvePlan, 'function', 'sanity: actions still exports approvePlan');
  });
});

// ===========================================================================
// T8 (M1) — Clean up ▸ reachability; NO digit anywhere
// ===========================================================================

describe('T8 — menu reachability: Clean up ▸ → cleanup tree → claude:cleanup-exec; digit-free', () => {
  it('forward-actionable proposal surfaces Clean up ▸ and the full nav tree resolves', () => {
    const sb = makeSandbox();
    writePlan(sb, 'functional', 'foo', { files: ['src/missing.js'] });
    const restore = stubClassify('shipped-but-early');
    try {
      const verify = menuScreens.inboxVerifyProposals(sb);
      assert.equal(verify.actions['Clean up ▸'], 'inbox cleanup', 'forward-actionable ⇒ Clean up ▸ entry');
      ALL_ACTION_KEYS_NONDIGIT(verify);

      const s1 = menuScreens.route(['inbox', 'cleanup'], sb);
      assert.equal(s1.actions['Approve a category ▸'], 'inbox cleanup category');
      assert.equal(s1.actions['Review individually ▸'], 'inbox cleanup plan');
      assert.equal(s1.actions['◀ Back'], 'inbox verify');
      ALL_ACTION_KEYS_NONDIGIT(s1);

      const s2 = menuScreens.route(['inbox', 'cleanup', 'category'], sb);
      assert.ok(
        Object.values(s2.actions).includes('inbox cleanup confirm shipped-but-early'),
        'category pick offers a confirm route for shipped-but-early'
      );
      ALL_ACTION_KEYS_NONDIGIT(s2);

      const s3 = menuScreens.route(['inbox', 'cleanup', 'confirm', 'shipped-but-early'], sb);
      assert.ok(
        Object.entries(s3.actions).some(([k, v]) => /^Confirm:/.test(k) && v.startsWith('claude:cleanup-exec category ')),
        'confirm screen has a Confirm: … → claude:cleanup-exec category … action'
      );
      ALL_ACTION_KEYS_NONDIGIT(s3);

      const s4 = menuScreens.route(['inbox', 'cleanup', 'plan', 'foo'], sb);
      assert.ok(s4.actions['Approve'].startsWith('claude:cleanup-exec plan foo'), 'Approve → per-plan exec string');
      assert.equal(s4.actions['Override ▸'], 'inbox cleanup override foo');
      assert.ok(!String(s4.actions['Skip']).startsWith('claude:cleanup-exec'), 'Skip is navigation, not execution');
      assert.ok(!String(s4.actions['◀ Back']).startsWith('claude:cleanup-exec'), 'Back is navigation, not execution');
      ALL_ACTION_KEYS_NONDIGIT(s4);
    } finally {
      restore();
    }
  });
});

// ===========================================================================
// T9 (M7/M6) — override surfaces delete ONLY when explicitlyRejected
// ===========================================================================

describe('T9 — override action set: delete gated on explicitlyRejected', () => {
  it('DOA with explicitlyRejected:false ⇒ no Delete permanently; has Archive to done instead', () => {
    const sb = makeSandbox();
    writePlan(sb, 'implementation', 'baz', { files: ['src/gone.js'] });
    const restore = stubClassify('dead-on-arrival', { explicitlyRejected: false });
    let screen;
    try {
      screen = menuScreens.route(['inbox', 'cleanup', 'override', 'baz'], sb);
    } finally {
      restore();
    }
    assert.ok(!('Delete permanently' in screen.actions), 'no delete affordance without explicitlyRejected');
    assert.equal(screen.actions['Archive to done instead'], 'claude:cleanup-exec plan baz archive-to-done');
    ALL_ACTION_KEYS_NONDIGIT(screen);
  });

  it('DOA with explicitlyRejected:true ⇒ Delete permanently → claude:cleanup-exec plan baz delete', () => {
    const sb = makeSandbox();
    writePlan(sb, 'implementation', 'baz', { files: ['src/gone.js'] });
    const restore = stubClassify('dead-on-arrival', { explicitlyRejected: true });
    let screen;
    try {
      screen = menuScreens.route(['inbox', 'cleanup', 'override', 'baz'], sb);
    } finally {
      restore();
    }
    assert.equal(screen.actions['Delete permanently'], 'claude:cleanup-exec plan baz delete');
    ALL_ACTION_KEYS_NONDIGIT(screen);
  });

  it('shipped-but-early override offers Revert instead', () => {
    const sb = makeSandbox();
    writePlan(sb, 'functional', 'foo', { files: ['src/missing.js'] });
    const restore = stubClassify('shipped-but-early');
    let screen;
    try {
      screen = menuScreens.route(['inbox', 'cleanup', 'override', 'foo'], sb);
    } finally {
      restore();
    }
    assert.equal(screen.actions['Revert instead'], 'claude:cleanup-exec plan foo revert');
    ALL_ACTION_KEYS_NONDIGIT(screen);
  });
});

// ===========================================================================
// T10 (idempotency) — second executeCleanup on an already-moved plan is a no-op
// ===========================================================================

describe('T10 — idempotent: re-running on an already-cleaned plan is a fail-closed no-op', () => {
  it('after archive, re-run finds no candidate ⇒ noop, no throw, no plan mutation', () => {
    const sb = makeSandbox();
    writePlan(sb, 'functional', 'foo', { files: ['src/missing.js'] });
    cleanup.executeCleanup({ plan: 'foo', proposedAction: 'archive-to-done' }, sb); // first run (real)
    assert.ok(fs.existsSync(path.join(sb, 'plans', 'done', 'foo.md')), 'first run archived foo');

    const spy = spyFs();
    let r;
    try {
      r = cleanup.executeCleanup({ plan: 'foo', proposedAction: 'archive-to-done' }, sb);
    } finally {
      spy.restore();
    }
    assert.equal(r.action, 'noop');
    assert.equal(r.skipped, true);
    assert.equal(planMutations(spy.calls).length, 0, 'no second plan-file mutation');
  });
});

// ===========================================================================
// T11 (F3) — production exec path: string carries NO stage; executeCleanup re-derives it
// ===========================================================================

describe('T11 — claude:cleanup-exec string → re-derive → move (end-to-end)', () => {
  it('(a) archive string with no stage re-derives functional and lands in done/', () => {
    const sb = makeSandbox();
    writePlan(sb, 'functional', 'foo', { files: ['src/missing.js'] });
    const p = parseCleanupExec('claude:cleanup-exec plan foo archive-to-done');
    assert.equal(p.stage, undefined, 'the exec string carries no stage (contract pinned)');
    cleanup.executeCleanup(p, sb);
    assert.ok(fs.existsSync(path.join(sb, 'plans', 'done', 'foo.md')), 'archived to done/');
    const content = fs.readFileSync(path.join(sb, 'plans', 'done', 'foo.md'), 'utf8');
    assert.match(content, /approved_by:\s*human/);
    assert.ok(content.includes('gate_crossed: stale-reconciliation'));
    assert.ok(!fs.existsSync(path.join(sb, 'plans', 'functional', 'foo.md')), 'source removed');
  });

  it('(b) revert string with no stage re-derives implementation→functional', () => {
    const sb = makeSandbox();
    writePlan(sb, 'implementation', 'baz', { files: ['src/gone.js'] });
    const moveSpy = makeSpy();
    const p = parseCleanupExec('claude:cleanup-exec plan baz revert');
    cleanup.executeCleanup(p, sb, { movePlan: moveSpy.fn });
    assert.equal(moveSpy.calls.length, 1);
    assert.ok(endsWithPlan(moveSpy.calls[0][0], 'implementation', 'baz'));
    assert.equal(moveSpy.calls[0][1], 'functional');
  });
});

// ===========================================================================
// T12 (F3 negative) — slug not in the live scan ⇒ fail-closed no-op, no throw, no mutation
// ===========================================================================

describe('T12 — absent slug: fail-closed no-op, no throw, no fs mutation', () => {
  it('a cleanup-exec for a non-stale slug is a safe no-op', () => {
    const sb = makeSandbox();
    const p = parseCleanupExec('claude:cleanup-exec plan ghost archive-to-done'); // ghost NOT seeded
    const spy = spyFs();
    let r;
    try {
      assert.doesNotThrow(() => {
        r = cleanup.executeCleanup(p, sb);
      });
    } finally {
      spy.restore();
    }
    assert.equal(r.skipped, true);
    assert.equal(r.action, 'noop');
    assert.equal(planMutations(spy.calls).length, 0, 'no plan-file mutation for an absent slug');
    assert.ok(!fs.existsSync(path.join(sb, 'plans', 'done', 'ghost.md')), 'nothing created in done/');
  });
});

// ===========================================================================
// T13 — primitive error paths (throw loud, never silently no-op a move)
// ===========================================================================

describe('T13 — error paths throw descriptively', () => {
  it('archivePlan on a missing file throws with the path', () => {
    const sb = makeSandbox();
    const missing = path.join(sb, 'plans', 'functional', 'nope.md');
    assert.throws(() => cleanup.archivePlan(missing, sb), /plan not found/i);
  });

  it('revertPlan from a stage with no prior stage throws (no silent guess)', () => {
    const sb = makeSandbox();
    // plans/done/<slug>.md ⇒ stage 'done' is not in REVERT_MAP ⇒ must throw.
    const p = path.join(sb, 'plans', 'done', 'x.md');
    assert.throws(() => cleanup.revertPlan(p, sb), /cannot revert from stage/i);
  });

  it('executeCleanup with an unknown action is a safe no-op (skipped:true)', () => {
    const sb = makeSandbox();
    const injScan = () => [{ plan: 'q', stage: 'functional' }];
    const spy = spyFs();
    let r;
    try {
      r = cleanup.executeCleanup({ plan: 'q', proposedAction: 'bogus-action' }, sb, { listStaleCandidates: injScan });
    } finally {
      spy.restore();
    }
    assert.equal(r.action, 'none');
    assert.equal(r.skipped, true);
    assert.equal(planMutations(spy.calls).length, 0, 'unknown action mutates nothing');
  });
});

// ===========================================================================
// T14 (D9 broaden) — a PURE-DOA stale set surfaces 'Clean up ▸' AND the DOA plan
// is reachable + actionable through the cleanup tree (revert by default; delete
// only via the explicitlyRejected override). The reachability regression guard.
// ===========================================================================

describe('T14 (D9) — pure-DOA set surfaces Clean up ▸ and is fully reachable + actionable', () => {
  it('entry surfaces on a DOA-only set; plan reachable; revert default; delete only via explicit-reject override', () => {
    const sb = makeSandbox();
    writePlan(sb, 'implementation', 'baz', { files: ['src/gone.js'] }); // the ONLY candidate ⇒ pure-DOA set
    const restore = stubClassify('dead-on-arrival', { explicitlyRejected: false });
    try {
      // (1) the read-only verify screen surfaces 'Clean up ▸' even for a pure-DOA set (was the D9 bug: hidden).
      const verify = menuScreens.inboxVerifyProposals(sb);
      assert.equal(verify.actions['Clean up ▸'], 'inbox cleanup', 'pure-DOA set still surfaces Clean up ▸ (D9)');
      ALL_ACTION_KEYS_NONDIGIT(verify);

      // (2) the DOA plan is reachable through the cleanup nav tree.
      const review = menuScreens.route(['inbox', 'cleanup'], sb);
      assert.equal(review.actions['Review individually ▸'], 'inbox cleanup plan');
      const pick = menuScreens.route(['inbox', 'cleanup', 'plan'], sb);
      assert.equal(pick.actions['baz'], 'inbox cleanup plan baz', 'DOA plan listed for individual review');
      const plan = menuScreens.route(['inbox', 'cleanup', 'plan', 'baz'], sb);

      // (3) default action is the reversible revert — NEVER delete.
      assert.equal(plan.actions['Approve'], 'claude:cleanup-exec plan baz revert', 'DOA default = revert');
      ALL_ACTION_KEYS_NONDIGIT(plan);

      // (4) override WITHOUT explicitlyRejected offers NO delete affordance.
      const ov = menuScreens.route(['inbox', 'cleanup', 'override', 'baz'], sb);
      assert.ok(!('Delete permanently' in ov.actions), 'no delete affordance without explicitlyRejected');
      assert.equal(ov.actions['Archive to done instead'], 'claude:cleanup-exec plan baz archive-to-done');
      ALL_ACTION_KEYS_NONDIGIT(ov);
    } finally {
      restore();
    }

    // (5) delete is reachable ONLY via the explicitlyRejected override surface.
    const restore2 = stubClassify('dead-on-arrival', { explicitlyRejected: true });
    try {
      const ov2 = menuScreens.route(['inbox', 'cleanup', 'override', 'baz'], sb);
      assert.equal(ov2.actions['Delete permanently'], 'claude:cleanup-exec plan baz delete',
        'delete reachable only through the explicitlyRejected override');
      ALL_ACTION_KEYS_NONDIGIT(ov2);
    } finally {
      restore2();
    }

    // (6) executing the default action actually reverts (reversible) — not delete.
    const moveSpy = makeSpy();
    const r = cleanup.executeCleanup({ plan: 'baz', proposedAction: 'revert' }, sb, { movePlan: moveSpy.fn });
    assert.equal(r.to, 'functional', 'DOA revert lands implementation→functional');
    assert.equal(moveSpy.calls.length, 1, 'revert used the mover; no unlink/delete');
  });
});

// ===========================================================================
// T15 (F1) — archive refuses to overwrite an existing plans/done/<slug>.md
// ===========================================================================

describe('T15 (F1) — archive refuses to overwrite a real shipped done/<slug>.md', () => {
  it('done/foo.md already exists ⇒ archivePlan throws, source NOT moved, existing done file unchanged', () => {
    const sb = makeSandbox();
    const src = writePlan(sb, 'functional', 'foo', { files: ['src/missing.js'] });
    const srcBefore = fs.readFileSync(src, 'utf8');
    const doneDir = path.join(sb, 'plans', 'done');
    fs.mkdirSync(doneDir, { recursive: true });
    const donePath = path.join(doneDir, 'foo.md');
    const shipped = '---\napproved_by: human\n---\n# the REAL shipped foo\n';
    fs.writeFileSync(donePath, shipped);

    assert.throws(
      () => cleanup.archivePlan(src, sb),
      /already exists \(would overwrite shipped work\)/i,
      'must refuse to overwrite a real shipped plan'
    );
    assert.ok(fs.existsSync(src), 'source plan NOT moved');
    assert.equal(fs.readFileSync(src, 'utf8'), srcBefore, 'source plan NOT mutated (no stamp written)');
    assert.equal(fs.readFileSync(donePath, 'utf8'), shipped, 'existing shipped done file unchanged');
  });
});

// ===========================================================================
// T16 (F2) — a corrupt cleanup log is preserved aside, NEVER silently wiped
// ===========================================================================

describe('T16 (F2) — corrupt cleanup log preserved aside, not discarded', () => {
  it('append over a corrupt log renames it to .corrupt-<ts> and starts a fresh valid log', () => {
    const sb = makeSandbox();
    writePlan(sb, 'functional', 'foo', { files: ['src/missing.js'] });
    const logDir = path.join(sb, '.ctoc', 'logs');
    fs.mkdirSync(logDir, { recursive: true });
    const logPath = path.join(logDir, 'stale-cleanup.json');
    const corruptContent = '{ this is NOT valid json ';
    fs.writeFileSync(logPath, corruptContent);

    // a real archive triggers an append into the corrupt log.
    cleanup.executeCleanup({ plan: 'foo', proposedAction: 'archive-to-done' }, sb);

    const aside = fs.readdirSync(logDir).filter((f) => f.startsWith('stale-cleanup.json.corrupt-'));
    assert.equal(aside.length, 1, 'corrupt log preserved aside exactly once');
    assert.equal(
      fs.readFileSync(path.join(logDir, aside[0]), 'utf8'),
      corruptContent,
      'corrupt history preserved verbatim (not wiped)'
    );
    const fresh = JSON.parse(fs.readFileSync(logPath, 'utf8'));
    assert.ok(Array.isArray(fresh) && fresh.length >= 1, 'a fresh valid log was started with the new entry');
  });
});

// ===========================================================================
// T17 (security) — same slug stale in two stages ⇒ fail-closed ambiguous-skip
// ===========================================================================

describe('T17 (security) — slug collision across stages ⇒ executeCleanup fails closed', () => {
  it('two same-slug candidates in different stages ⇒ ambiguous-skip no-op, no fs mutation', () => {
    const sb = makeSandbox();
    writePlan(sb, 'functional', 'dup', { files: ['src/a.js'] });
    writePlan(sb, 'implementation', 'dup', { files: ['src/b.js'] });
    const injScan = () => [
      { plan: 'dup', stage: 'functional' },
      { plan: 'dup', stage: 'implementation' },
    ];
    const spy = spyFs();
    let r;
    try {
      r = cleanup.executeCleanup(
        { plan: 'dup', proposedAction: 'archive-to-done' },
        sb,
        { listStaleCandidates: injScan }
      );
    } finally {
      spy.restore();
    }
    assert.equal(r.action, 'ambiguous-skip');
    assert.equal(r.skipped, true);
    assert.equal(planMutations(spy.calls).length, 0, 'no plan-file mutation on an ambiguous slug');
    assert.ok(fs.existsSync(path.join(sb, 'plans', 'functional', 'dup.md')), 'functional copy untouched');
    assert.ok(fs.existsSync(path.join(sb, 'plans', 'implementation', 'dup.md')), 'implementation copy untouched');
  });
});

// ===========================================================================
// T18 (security) — archive re-asserts a regular-file source (symlink-swap window)
// ===========================================================================

describe('T18 (security) — archive refuses a non-regular-file source', () => {
  it('a directory at the plan path ⇒ archivePlan throws, no write-through', () => {
    const sb = makeSandbox();
    const stageDir = path.join(sb, 'plans', 'functional');
    fs.mkdirSync(path.join(stageDir, 'foo.md'), { recursive: true }); // a DIRECTORY where the plan file would be
    const planPath = path.join(stageDir, 'foo.md');
    const spy = spyFs();
    try {
      assert.throws(() => cleanup.archivePlan(planPath, sb), /not a regular file/i);
    } finally {
      spy.restore();
    }
    const writeThrough = spy.calls.filter(
      (c) => c.op === 'writeFileSync' && endsWithPlan(c.path, 'functional', 'foo')
    );
    assert.equal(writeThrough.length, 0, 'no write-through to a non-regular-file path');
  });
});
