'use strict';

/**
 * SP5 — Cross-slice regression suite for the stale-detection contract.
 *
 * INVARIANT GUARDED: the whole value of stale-detection rests on two directions
 * never breaking —
 *   (1) NEGATIVE: a healthy source-stage plan carrying a prior-gate marker with
 *       all declared files present must NOT be flagged (false-positive prevention);
 *   (2) POSITIVE: a genuinely stranded review/ plan must ALWAYS be flagged
 *       (false-negative prevention).
 * This suite wires cheap detection → classification → gated cleanup end-to-end in
 * an os.tmpdir() sandbox (hermetic, cross-platform, no live plans/ tree, no real
 * git). It is the CI safety net for SP1/SP3/SP4 together; the per-slice unit tests
 * remain their own concern (stale-detector-cheap, stale-classifier,
 * stale-cleanup-human-gate).
 *
 * READ-FRESH DISCREPANCIES (code wins — see the plan's Implementation Details):
 *   - There is NO `marker-in-source-stage` signal. scanCheapCandidates emits ONLY
 *     `missing-files` (actionable) and `advisory:age` (advisory-only); the human
 *     approval marker is deliberately NOT read at cheap-scan time (F1). The
 *     positive invariant is therefore driven by a REMOVED declared file
 *     (`missing-files`), and the negative invariant asserts `count === 0` (no
 *     signals at all for the healthy plan) — never the mythical marker signal.
 *   - The age threshold is 14 days (AGE_THRESHOLD_MS), not 15. Age scenarios inject
 *     `nowMs = fixture.mtimeMs + AGE_THRESHOLD_MS + 1` — exact against the real
 *     constant, no fs.utimesSync anywhere.
 *   - `deps.movePlan` is consumed ONLY on the `revert` path (reconciliation uses
 *     raw renameSync). Seam-liveness is proven by a revert-path positive control
 *     (T6) plus a move-side-effect assertion on reconciliation (T5).
 *
 * Every fixture is validated at setup with the DETECTOR'S OWN parsers
 * (extractFrontmatterRegion / parseFilesField) so a mis-shaped fixture fails
 * LOUDLY at setup, not silently mid-assertion.
 */

const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  scanCheapCandidates,
  classifyStaleCandidate,
  extractFrontmatterRegion,
  parseFilesField,
  AGE_THRESHOLD_MS,
} = require('../src/lib/stale-detector.js');
const { executeCleanup } = require('../src/lib/stale-cleanup.js');

// ---------------------------------------------------------------------------
// Hermetic sandbox harness (cross-platform, fail-loud, no shell)
// ---------------------------------------------------------------------------

const STAGES = ['functional', 'implementation', 'review', 'done'];
const sandboxes = [];
let sandboxCounter = 0;

function makeSandbox() {
  const root = path.join(
    os.tmpdir(),
    'ctoc-sp5-' + process.pid + '-' + Date.now() + '-' + sandboxCounter++
  );
  for (const stage of STAGES) {
    fs.mkdirSync(path.join(root, 'plans', stage), { recursive: true });
  }
  sandboxes.push(root);
  return root;
}

function teardown(root) {
  fs.rmSync(root, { recursive: true, force: true });
}

afterEach(() => {
  while (sandboxes.length) {
    teardown(sandboxes.pop());
  }
});

/**
 * Write plans/<stage>/<slug>.md with a real frontmatter block, then validate the
 * fixture with the detector's OWN parsers (mis-shaped fixture ⇒ loud setup fail).
 *
 * @param {string} root
 * @param {string} stage
 * @param {string} slug
 * @param {{ approved?: boolean, files?: string[], createFiles?: boolean }} opts
 *        - approved:    prepend a Gate-marker-shaped `approved_by: human` block.
 *        - files:       declared `files:` paths (POSIX-authored).
 *        - createFiles: when true (default), create each declared file under root;
 *                       when false, leave them absent to fire `missing-files`.
 * @returns {string} absolute plan path
 */
function writePlan(root, stage, slug, { approved = false, files = [], createFiles = true } = {}) {
  const planPath = path.join(root, 'plans', stage, slug + '.md');

  // Metadata block carries the declared files (second block on an approved plan,
  // exactly as extractFrontmatterRegion is built to handle).
  let meta = '---\n' + `title: "${slug}"\n`;
  if (files.length) meta += 'files: [' + files.join(', ') + ']\n';
  meta += 'status: refined\n---\n\n';

  let content = meta + `# ${slug}\n\nBody.\n`;
  if (approved) {
    // The Gate marker is a SEPARATE leading block prepended before the metadata
    // block — the same two-block shape actions.addApprovalMarker writes.
    content =
      '---\napproved_by: human\napproved_at: 2026-01-01T00:00:00.000Z\ngate_crossed: functional → implementation\n---\n\n' +
      content;
  }

  fs.writeFileSync(planPath, content);

  if (createFiles) {
    for (const rel of files) {
      const parts = rel.split(/[\\/]+/).filter((p) => p.length > 0 && p !== '.' && p !== '..');
      const abs = path.join(root, ...parts);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, '// ' + rel + '\n');
    }
  }

  // Fixture-parse validation (SP5 risk #3): the detector's OWN parsers must see
  // exactly the files we declared. If not, the fixture is mis-shaped — fail here.
  const region = extractFrontmatterRegion(fs.readFileSync(planPath, 'utf8'));
  assert.deepStrictEqual(
    parseFilesField(region),
    files,
    `fixture ${stage}/${slug} mis-shaped: parseFilesField disagrees with declared files`
  );

  return planPath;
}

/** Deterministic nowMs that forces `advisory:age` — no fs.utimesSync. */
function ageInject(planPath) {
  return fs.statSync(planPath).mtimeMs + AGE_THRESHOLD_MS + 1;
}

/** Full StaleEvidence-shaped object with safe defaults; git STUBBED by literal. */
function evidence(overrides = {}) {
  return {
    gitAvailable: true,
    error: null,
    approvedBy: null,
    declaredFiles: [],
    allFilesExist: true,
    anyFileMissing: false,
    explicitlyRejected: false,
    filesModifiedAfterEntry: false,
    slugMatchCommits: [],
    slugMatchAfterEntry: false,
    stageEntryEpoch: null,
    filesLastModifiedEpoch: null,
    ...overrides,
  };
}

/** Minimal spy: records { called, callCount, calledWith }, returns returnValue. */
function mkSpy(returnValue) {
  const spy = function (...args) {
    spy.called = true;
    spy.callCount += 1;
    spy.calledWith.push(args);
    return typeof returnValue === 'function' ? returnValue(...args) : returnValue;
  };
  spy.called = false;
  spy.callCount = 0;
  spy.calledWith = [];
  return spy;
}

// ---------------------------------------------------------------------------
// Regression cases
// ---------------------------------------------------------------------------

describe('SP5 — stale-detection regression', () => {
  // T1 — NEGATIVE invariant (M2)
  it('T1 negative invariant: healthy implementation/ plan with Gate-1 marker + all files present ⇒ 0 actionable candidates', () => {
    const root = makeSandbox();
    writePlan(root, 'implementation', 'healthy-impl-plan', {
      approved: true,
      files: ['src/lib/present.js'],
      createFiles: true,
    });

    const r = scanCheapCandidates(root);

    assert.equal(r.count, 0, 'healthy source-stage plan with prior marker must not be flagged');
    assert.ok(
      r.candidates.every((c) => c.plan !== 'healthy-impl-plan'),
      'healthy plan must never appear as a candidate'
    );
    // Anti-tautology note: this is not vacuous — the SAME fixture with a removed
    // file WOULD produce a `missing-files` candidate (proven by T2/T3b). count===0
    // here regresses to non-zero if the cheap scan starts flagging present-file
    // marked plans.
  });

  // T2 — POSITIVE invariant (M3)
  it('T2 positive invariant: stranded review/ plan is actionable via missing-files and classifies approved-but-stranded → advance-via-reconciliation', () => {
    const root = makeSandbox();
    writePlan(root, 'review', 'stranded-plan', {
      approved: true,
      files: ['src/lib/gone.js'],
      createFiles: false, // removed ⇒ missing-files fires
    });

    const r = scanCheapCandidates(root);
    const cand = r.candidates.find((c) => c.plan === 'stranded-plan');
    assert.ok(cand, 'stranded review/ plan MUST be flagged (false-negative prevention)');
    assert.equal(r.count, 1, 'exactly one candidate');
    assert.ok(cand.signals.includes('missing-files'), 'actionable signal is missing-files, not a marker signal');
    assert.equal(cand.actionable, true);

    const proposal = classifyStaleCandidate(
      cand,
      evidence({
        approvedBy: 'human',
        anyFileMissing: true,
        allFilesExist: false,
        filesModifiedAfterEntry: true,
        slugMatchCommits: [{ shortHash: 'abc1234', dateISO: '2026-06-20', subject: 'ship stranded-plan' }],
        slugMatchAfterEntry: true,
      })
    );
    assert.equal(proposal.category, 'approved-but-stranded');
    assert.equal(proposal.proposedAction, 'advance-via-reconciliation');
  });

  // T3a — shipped-and-stranded functional/, files PRESENT (M4)
  it('T3a shipped-and-stranded functional/ with files present ⇒ advisory:age only, not actionable', () => {
    const root = makeSandbox();
    const planPath = writePlan(root, 'functional', 'shipped-stranded', {
      files: ['src/lib/shipped.js'],
      createFiles: true,
    });

    const r = scanCheapCandidates(root, { nowMs: ageInject(planPath) });
    const cand = r.candidates.find((c) => c.plan === 'shipped-stranded');
    assert.ok(cand, 'aged plan surfaces as an advisory candidate');
    assert.deepStrictEqual(cand.signals, ['advisory:age'], 'files present ⇒ ONLY advisory:age');
    assert.equal(cand.actionable, false, 'advisory:age alone is never actionable');
  });

  // T3b — shipped-and-stranded functional/, files REMOVED (M4)
  it('T3b shipped-and-stranded functional/ with files removed ⇒ missing-files actionable; classifier not-started ⇒ inconclusive/null', () => {
    const root = makeSandbox();
    writePlan(root, 'functional', 'shipped-stranded', {
      files: ['src/lib/shipped.js'],
      createFiles: false, // removed
    });

    const r = scanCheapCandidates(root);
    const cand = r.candidates.find((c) => c.plan === 'shipped-stranded');
    assert.ok(cand, 'removed declared file ⇒ candidate');
    assert.ok(cand.signals.includes('missing-files'));
    assert.equal(cand.actionable, true, 'cheap scan is actionable for a missing file at any gate-source stage');
    assert.equal(cand.stage, 'functional');

    // Classifier polarity: functional ∈ NOT_STARTED_STAGES ⇒ not-started gate ⇒
    // benign inconclusive (cheap-actionable but classifier-benign).
    const proposal = classifyStaleCandidate(cand, evidence({ anyFileMissing: true, allFilesExist: false }));
    assert.equal(proposal.category, 'inconclusive', 'functional not-started ⇒ inconclusive, not DOA');
    assert.equal(proposal.proposedAction, null);
  });

  // T4 — age-only advisory via nowMs (M5)
  it('T4 age-only advisory via nowMs is never actionable and classifies inconclusive/null', () => {
    const root = makeSandbox();
    const planPath = writePlan(root, 'implementation', 'age-only', {
      approved: false,
      files: ['src/lib/exists.js'],
      createFiles: true,
    });

    const r = scanCheapCandidates(root, { nowMs: ageInject(planPath) });
    const cand = r.candidates.find((c) => c.plan === 'age-only');
    assert.ok(cand, 'aged plan surfaces');
    assert.deepStrictEqual(cand.signals, ['advisory:age']);
    assert.equal(cand.actionable, false);

    // Empty/default evidence (gitAvailable:true, nothing missing) ⇒ classifier
    // catch-all step 5 ⇒ inconclusive/null.
    const proposal = classifyStaleCandidate(cand, evidence());
    assert.equal(proposal.category, 'inconclusive');
    assert.equal(proposal.proposedAction, null);
  });

  // T5 — gate-safety M6: reconciliation does NOT call approvePlan; move happens
  it('T5 gate-safety M6: advance-via-reconciliation does NOT call approvePlan or movePlan; the reconciliation move actually happens', () => {
    const root = makeSandbox();
    writePlan(root, 'review', 'recon-plan', {
      approved: true,
      files: ['src/lib/recon.js'],
      createFiles: true, // present so _stampAndArchive's existence check passes cleanly
    });

    const approveSpy = mkSpy();
    const moveSpy = mkSpy();

    const result = executeCleanup(
      { plan: 'recon-plan', proposedAction: 'advance-via-reconciliation' },
      root,
      {
        approvePlan: approveSpy,
        movePlan: moveSpy,
        listStaleCandidates: () => [
          { plan: 'recon-plan', stage: 'review', signals: ['missing-files'], actionable: true },
        ],
      }
    );

    // Never-fired spies…
    assert.equal(approveSpy.called, false, 'approvePlan MUST NOT be called on the reconciliation path (structural gate-safety)');
    assert.equal(moveSpy.called, false, 'movePlan MUST NOT be called on the reconciliation path (uses renameSync)');

    // …made meaningful by the observable side effect: the plan actually moved.
    assert.ok(!fs.existsSync(path.join(root, 'plans', 'review', 'recon-plan.md')), 'plan left review/');
    const donePath = path.join(root, 'plans', 'done', 'recon-plan.md');
    assert.ok(fs.existsSync(donePath), 'plan landed in done/ via reconciliation');
    const moved = fs.readFileSync(donePath, 'utf8');
    assert.match(moved, /^---\napproved_by: human\n/, 'moved file carries the approval marker in its first block');
    assert.match(moved, /gate_crossed: stale-reconciliation/, 'reconciliation gate marker is unambiguous in audit');
    assert.equal(result.to, 'done');
  });

  // T6 — seam-liveness positive control: deps.movePlan IS consumed on revert
  it('T6 seam-liveness positive control: deps.movePlan IS consumed on the revert path (proves the deps seam is live)', () => {
    const root = makeSandbox();
    writePlan(root, 'implementation', 'doa-plan', {
      files: ['src/lib/gone2.js'],
      createFiles: false,
    });

    const revertedPath = path.join(root, 'plans', 'functional', 'doa-plan.md');
    const moveSpy = mkSpy(() => revertedPath);

    executeCleanup(
      { plan: 'doa-plan', proposedAction: 'revert' },
      root,
      {
        movePlan: moveSpy,
        listStaleCandidates: () => [
          { plan: 'doa-plan', stage: 'implementation', signals: ['missing-files'], actionable: true },
        ],
      }
    );

    assert.equal(moveSpy.called, true, 'deps.movePlan MUST be consumed on the revert path (seam is live)');
    assert.equal(moveSpy.callCount, 1);
    const args = moveSpy.calledWith[0];
    assert.equal(args[0], path.join(root, 'plans', 'implementation', 'doa-plan.md'), 'moved the correct source path');
    assert.equal(args[1], 'functional', 'reverted one stage back (implementation → functional)');
    assert.equal(args[2], root, 'root threaded through');
  });

  // T7 — gate-safety M7: movePlan not called directly on reconciliation
  it('T7 gate-safety M7: movePlan is NOT called directly on the reconciliation path', () => {
    const root = makeSandbox();
    writePlan(root, 'review', 'recon-plan-2', {
      approved: true,
      files: ['src/lib/recon2.js'],
      createFiles: true,
    });

    const moveSpy = mkSpy();
    executeCleanup(
      { plan: 'recon-plan-2', proposedAction: 'advance-via-reconciliation' },
      root,
      {
        movePlan: moveSpy,
        listStaleCandidates: () => [
          { plan: 'recon-plan-2', stage: 'review', signals: ['missing-files'], actionable: true },
        ],
      }
    );

    // M7 exact encoding: on advance-via-reconciliation, deps.movePlan.called === false.
    // (Reconciliation uses renameSync; this pins so a refactor routing it through
    // movePlan+approvePlan would break the test.)
    assert.equal(moveSpy.called, false, 'reconciliation uses renameSync, never deps.movePlan');
    // Confirm the move still happened via the reconciliation primitive.
    assert.ok(fs.existsSync(path.join(root, 'plans', 'done', 'recon-plan-2.md')), 'reconciliation move happened');
  });

  // T8 — no action without explicit approve
  it('T8 no action without explicit approve: null/unknown action moves/stamps/deletes nothing; proposals remain', () => {
    const root = makeSandbox();
    const p1 = writePlan(root, 'review', 'p1', { approved: true, files: ['src/lib/a.js'], createFiles: false });
    const p2 = writePlan(root, 'implementation', 'p2', { files: ['src/lib/b.js'], createFiles: false });

    const before1 = fs.readFileSync(p1, 'utf8');
    const before2 = fs.readFileSync(p2, 'utf8');

    const r1 = executeCleanup(
      { plan: 'p1', proposedAction: null },
      root,
      { listStaleCandidates: () => [{ plan: 'p1', stage: 'review', signals: ['missing-files'], actionable: true }] }
    );
    const r2 = executeCleanup(
      { plan: 'p2', proposedAction: null },
      root,
      { listStaleCandidates: () => [{ plan: 'p2', stage: 'implementation', signals: ['missing-files'], actionable: true }] }
    );

    // Dispatcher default branch: nothing executes.
    assert.equal(r1.action, 'none');
    assert.equal(r1.skipped, true);
    assert.equal(r2.action, 'none');
    assert.equal(r2.skipped, true);

    // Both fixtures still present at their original stage, byte-for-byte unchanged.
    assert.ok(fs.existsSync(p1), 'p1 not moved');
    assert.ok(fs.existsSync(p2), 'p2 not moved');
    assert.equal(fs.readFileSync(p1, 'utf8'), before1, 'p1 not stamped/mutated');
    assert.equal(fs.readFileSync(p2, 'utf8'), before2, 'p2 not stamped/mutated');
    // Neither reached done/.
    assert.ok(!fs.existsSync(path.join(root, 'plans', 'done', 'p1.md')), 'p1 not archived');
    assert.ok(!fs.existsSync(path.join(root, 'plans', 'done', 'p2.md')), 'p2 not archived');
  });

  // T9 — cross-platform hermetic
  it('T9 cross-platform hermetic: sandbox build under os.tmpdir + path.join, teardown removes it, age via nowMs not utimes', () => {
    const root = makeSandbox();
    // Sandbox root lives under os.tmpdir(), built with path.join (no hardcoded sep).
    assert.ok(root.startsWith(os.tmpdir()), 'sandbox is under os.tmpdir()');
    for (const stage of STAGES) {
      assert.ok(fs.existsSync(path.join(root, 'plans', stage)), 'stage dir ' + stage + ' created');
    }

    // Age via nowMs injection (no fs.utimesSync anywhere in this module) — prove it
    // drives a real advisory:age signal, cross-platform.
    const planPath = writePlan(root, 'implementation', 'xplat', { files: ['src/lib/x.js'], createFiles: true });
    const r = scanCheapCandidates(root, { nowMs: ageInject(planPath) });
    assert.ok(r.candidates.some((c) => c.plan === 'xplat' && c.signals.includes('advisory:age')));

    // Teardown removes the sandbox with no path error.
    const idx = sandboxes.indexOf(root);
    if (idx !== -1) sandboxes.splice(idx, 1);
    assert.doesNotThrow(() => teardown(root));
    assert.ok(!fs.existsSync(root), 'sandbox fully removed on teardown');
  });

  // Self-check: this module uses NO filesystem clock manipulation (age is
  // nowMs-injected only). Build the forbidden token at runtime so this assertion
  // cannot match its own source text (which would self-trigger).
  it('T9b self-check: the regression suite never manipulates the filesystem clock (age via nowMs only)', () => {
    const src = fs.readFileSync(__filename, 'utf8');
    const forbidden = new RegExp('fs\\.' + 'utimes' + 'Sync' + '\\s*\\(');
    assert.ok(!forbidden.test(src), 'no filesystem-clock call site permitted (use nowMs injection)');
  });
});
