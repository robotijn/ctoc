'use strict';

/**
 * tests/stale-scan-says-when-it-could-not-look.test.js
 *
 * THE SUBJECT: `scanCheapCandidates` drops a plan from the scan at four points,
 * each a bare `continue`. Because `CheapScanResult` was `{ candidates, count }`
 * with `count === candidates.length`, a scan that read NOTHING returned
 * `{ candidates: [], count: 0 }` — byte-identical to a scan that read every plan
 * and found the backlog clean. `inbox.js` hands `.candidates` straight to the
 * dashboard nag count, so an unreadable `plans/review/` rendered as "no stale
 * plans". A check that reports a verdict on input it never received is the
 * false-green defect this repository fences; this file is the fence for it.
 *
 * SECOND SUBJECT: `GATE_SOURCE_STAGES` scans `implementation`, a stage that sits
 * BEFORE Gate 2 and has therefore never been executed — its declared files are
 * SUPPOSED to be missing. `NOT_STARTED_STAGES` did not contain it, so every
 * unbuilt implementation plan was classified as abandoned work.
 *
 * PERMISSION-DEPENDENT CASES SKIP LOUDLY OR NOT AT ALL. Revoking read is not
 * available on Windows and is a no-op for root. A permissions test that silently
 * no-ops would itself be a check reporting a verdict it never earned — the exact
 * defect under test. Every skip prints its reason.
 */

const { describe, it, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  scanCheapCandidates,
  classifyStaleCandidate,
  NOT_STARTED_STAGES,
  GATE_SOURCE_STAGES,
  MAX_PLAN_BYTES,
} = require('../src/lib/stale-detector.js');

// ── Permission-revocation availability ───────────────────────────────────────
// On Windows, mode bits do not revoke read. As root, they are bypassed entirely.
// Either way the fault cannot be induced, so the case must announce that it did
// not run rather than pass vacuously.
const CAN_REVOKE_READ =
  process.platform !== 'win32' &&
  typeof process.getuid === 'function' &&
  process.getuid() !== 0;

const NO_REVOKE_REASON =
  process.platform === 'win32'
    ? 'SKIPPED (stated reason): this platform is win32, where mode bits do not revoke read access, so the IO fault under test cannot be induced.'
    : 'SKIPPED (stated reason): running as uid 0 (root), which bypasses permission bits, so the IO fault under test cannot be induced.';

/** Announce a skip on stdout so a non-run is visible in the output, never silent. */
function announceSkip(caseName) {
  console.log(`[stale-scan-says-when-it-could-not-look] ${caseName} — ${NO_REVOKE_REASON}`);
}

// ── Sandbox helpers (write ONLY under os.tmpdir(); never touch the real repo) ─
/** @type {string[]} */
const sandboxes = [];
/** @type {Array<{p: string, mode: number}>} */
const restoreModes = [];

function makeSandbox() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-stale-unread-'));
  for (const stage of GATE_SOURCE_STAGES) {
    fs.mkdirSync(path.join(root, 'plans', stage), { recursive: true });
  }
  sandboxes.push(root);
  return root;
}

/**
 * Write a plan whose frontmatter declares `files:`. `createFiles: false` leaves
 * the declared path absent, which is what raises `missing-files`.
 */
function writePlan(root, stage, slug, { files = [], createFiles = false } = {}) {
  const body =
    '---\n' +
    'title: "' + slug + '"\n' +
    'files:\n' +
    files.map((f) => '  - "' + f + '"\n').join('') +
    '---\n\n# ' + slug + '\n';
  const p = path.join(root, 'plans', stage, slug + '.md');
  fs.writeFileSync(p, body);
  if (createFiles) {
    for (const f of files) {
      const target = path.join(root, f);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, '// present\n');
    }
  }
  return p;
}

/** chmod with a restore registered, so a revoked path never survives the run. */
function revoke(p, mode) {
  const current = fs.lstatSync(p).mode & 0o777;
  restoreModes.push({ p, mode: current });
  fs.chmodSync(p, mode);
}

/** Evidence shaped as `verifyStaleCandidate` returns it for a missing-files plan. */
function evidence(over = {}) {
  return {
    gitAvailable: true,
    slugMatchCommits: [],
    slugMatchAfterEntry: false,
    filesModifiedAfterEntry: false,
    anyFileMissing: true,
    allFilesExist: false,
    approvedBy: null,
    explicitlyRejected: false,
    ...over,
  };
}

const REASONS = new Set(['stage-unreadable', 'stat-failed', 'oversized', 'read-failed']);

after(() => {
  for (const { p, mode } of restoreModes.reverse()) {
    try { fs.chmodSync(p, mode); } catch { /* already gone — nothing to restore */ }
  }
  for (const root of sandboxes) {
    try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* best effort */ }
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// PART ONE — the scan must be able to say it could not look.
// ═════════════════════════════════════════════════════════════════════════════

describe('scanCheapCandidates — the scan reports what it could not read', () => {
  it('case 1: an unreadable STAGE DIRECTORY is reported, not silently dropped', () => {
    if (!CAN_REVOKE_READ) { announceSkip('case 1 (unreadable stage directory)'); return; }
    const root = makeSandbox();
    writePlan(root, 'review', 'r-one', { files: ['src/gone.js'] });
    revoke(path.join(root, 'plans', 'review'), 0o000);

    const res = scanCheapCandidates(root);

    assert.ok(res.unreadCount >= 1,
      'an unreadable stage directory must raise unreadCount — today this returns a confident zero');
    const entry = res.unread.find((u) => u.reason === 'stage-unreadable');
    assert.ok(entry, 'the whole-stage skip must carry reason "stage-unreadable"');
    assert.equal(entry.stage, 'review');
    assert.equal(entry.path, path.posix.join('plans', 'review'),
      'a stage-unreadable entry points at the stage DIRECTORY, standing for every plan in it');
  });

  it('case 2: a backlog that could NOT be read is distinguishable from a CLEAN backlog', () => {
    if (!CAN_REVOKE_READ) { announceSkip('case 2 (partial vs clean)'); return; }

    // A genuinely clean backlog: every stage readable, no plan raises a signal.
    const clean = makeSandbox();
    writePlan(clean, 'review', 'healthy', { files: ['src/present.js'], createFiles: true });
    const cleanRes = scanCheapCandidates(clean);

    // A backlog nobody could read: same shape, but review/ is unreadable.
    const blind = makeSandbox();
    writePlan(blind, 'review', 'healthy', { files: ['src/present.js'], createFiles: true });
    revoke(path.join(blind, 'plans', 'review'), 0o000);
    const blindRes = scanCheapCandidates(blind);

    assert.equal(cleanRes.count, 0, 'the clean backlog found nothing');
    assert.equal(blindRes.count, 0, 'the blind scan also found nothing — that part is unchanged');

    assert.notDeepEqual(
      { count: cleanRes.count, unreadCount: cleanRes.unreadCount },
      { count: blindRes.count, unreadCount: blindRes.unreadCount },
      'THE LOAD-BEARING CASE: "I read everything and found nothing" and "I could not look" ' +
      'must not be the same result'
    );
    assert.equal(cleanRes.unreadCount, 0, 'read everything ⇒ unreadCount 0 licenses reading count 0 as clean');
    assert.ok(blindRes.unreadCount > 0, 'could not look ⇒ unreadCount > 0 marks the result PARTIAL');
  });

  it('case 3: an unreadable PLAN FILE is reported, and the other plans are still scanned', () => {
    if (!CAN_REVOKE_READ) { announceSkip('case 3 (unreadable plan file)'); return; }
    const root = makeSandbox();
    const bad = writePlan(root, 'review', 'unreadable', { files: ['src/gone.js'] });
    writePlan(root, 'review', 'readable', { files: ['src/also-gone.js'] });
    revoke(bad, 0o000);

    const res = scanCheapCandidates(root);

    const entry = res.unread.find((u) => u.reason === 'read-failed');
    assert.ok(entry, 'a plan whose read fails must be reported as read-failed');
    assert.equal(entry.path, path.posix.join('plans', 'review', 'unreadable.md'));
    assert.ok(res.candidates.some((c) => c.plan === 'readable'),
      'the walk continues — the readable plan is still scanned');
  });

  it('case 4: an OVERSIZED plan is reported, not silently dropped', () => {
    const root = makeSandbox();
    const p = path.join(root, 'plans', 'review', 'huge.md');
    fs.writeFileSync(p, 'x'.repeat(MAX_PLAN_BYTES + 1));
    writePlan(root, 'review', 'small', { files: ['src/gone.js'] });

    const res = scanCheapCandidates(root);

    const entry = res.unread.find((u) => u.reason === 'oversized');
    assert.ok(entry, 'a plan above MAX_PLAN_BYTES must be reported as oversized');
    assert.equal(entry.path, path.posix.join('plans', 'review', 'huge.md'));
    assert.ok(res.candidates.some((c) => c.plan === 'small'), 'the walk continues past the oversized file');
    // The size gate is PRESERVED: audible must not mean read.
    assert.ok(!res.candidates.some((c) => c.plan === 'huge'), 'the oversized file is still not read');
  });

  it('case 5: a plan whose STAT fails is reported', () => {
    if (!CAN_REVOKE_READ) { announceSkip('case 5 (stat failure)'); return; }
    const root = makeSandbox();
    writePlan(root, 'review', 'vanishing', { files: ['src/gone.js'] });
    // Read permission WITHOUT search permission: readdir lists the entry, lstat
    // on it fails with EACCES — the "file vanished between readdir and stat" path.
    revoke(path.join(root, 'plans', 'review'), 0o400);

    const res = scanCheapCandidates(root);

    const entry = res.unread.find((u) => u.reason === 'stat-failed');
    assert.ok(entry, 'a plan whose lstat fails must be reported as stat-failed');
    assert.equal(entry.stage, 'review');
    assert.equal(entry.path, path.posix.join('plans', 'review', 'vanishing.md'));
  });

  it('case 6: a fully readable backlog reports nothing unread', () => {
    const root = makeSandbox();
    writePlan(root, 'review', 'a', { files: ['src/a.js'], createFiles: true });
    writePlan(root, 'implementation', 'b', { files: ['src/b.js'], createFiles: true });
    writePlan(root, 'functional', 'c', { files: ['src/c.js'], createFiles: true });

    const res = scanCheapCandidates(root);

    assert.deepEqual(res.unread, [], 'a complete walk has nothing to report as unread');
    assert.equal(res.unreadCount, 0, 'reachable ONLY after every stage and every plan was read');
  });

  it('case 11: one unreadable plan among five does not abort the walk', () => {
    if (!CAN_REVOKE_READ) { announceSkip('case 11 (skips do not abort the walk)'); return; }
    const root = makeSandbox();
    for (const slug of ['p1', 'p2', 'p3', 'p4']) {
      writePlan(root, 'review', slug, { files: ['src/' + slug + '-gone.js'] });
    }
    const bad = writePlan(root, 'review', 'p0-bad', { files: ['src/bad-gone.js'] });
    revoke(bad, 0o000);

    const res = scanCheapCandidates(root);

    assert.equal(res.unreadCount, 1, 'exactly one plan could not be read');
    const scanned = res.candidates.filter((c) => c.stage === 'review').map((c) => c.plan).sort();
    assert.deepEqual(scanned, ['p1', 'p2', 'p3', 'p4'],
      'the other four are still scanned AND still classified');
  });

  it('case 12: the reason enum is CLOSED and carries no raw error text or absolute path', () => {
    if (!CAN_REVOKE_READ) { announceSkip('case 12 (closed reason enum)'); return; }
    const root = makeSandbox();
    const badFile = writePlan(root, 'review', 'bad-read', { files: ['src/gone.js'] });
    revoke(badFile, 0o000);
    fs.writeFileSync(path.join(root, 'plans', 'review', 'huge.md'), 'x'.repeat(MAX_PLAN_BYTES + 1));
    revoke(path.join(root, 'plans', 'implementation'), 0o000);

    const res = scanCheapCandidates(root);

    assert.ok(res.unreadCount >= 3, 'three distinct faults were induced');
    for (const u of res.unread) {
      assert.ok(REASONS.has(u.reason), `reason "${u.reason}" is outside the closed four-value enum`);
      assert.equal(Object.keys(u).sort().join(','), 'path,reason,stage',
        'an unread entry carries exactly { path, reason, stage } — no error object, no leak');
      assert.ok(!path.isAbsolute(u.path), 'paths are repository-relative, never absolute');
      assert.ok(!u.path.includes(os.tmpdir()), 'the sandbox root never appears in a returned path');
      // A filesystem error string would carry EACCES / errno / a username.
      assert.ok(!/EACCES|ENOENT|errno|Error/i.test(u.reason),
        'no raw error message reaches the returned value — it is rendered on a dashboard');
    }
  });

  it('case 10: the existing shape is preserved — candidates and count keep their meaning', () => {
    const root = makeSandbox();
    writePlan(root, 'review', 'missing-one', { files: ['src/gone.js'] });

    const res = scanCheapCandidates(root);

    assert.ok(Array.isArray(res.candidates));
    assert.equal(res.count, res.candidates.length,
      'count remains candidates.length — the unread channel is purely ADDITIVE');
    const cand = res.candidates.find((c) => c.plan === 'missing-one');
    assert.ok(cand);
    assert.deepEqual(Object.keys(cand).sort(), ['actionable', 'plan', 'signals', 'stage'],
      'the candidate shape is untouched, so every existing consumer is unaffected');
  });

  it('a missing plans/ directory returns the full shape, not a half-shaped result', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-stale-noplans-'));
    sandboxes.push(root);

    const res = scanCheapCandidates(root);

    assert.deepEqual(res.candidates, []);
    assert.equal(res.count, 0);
    assert.deepEqual(res.unread, [], 'the early return must carry the unread channel too');
    assert.equal(res.unreadCount, 0, 'no plans/ directory is "nothing to read", not "could not read"');
  });

  it('a stage directory that does not EXIST is not an unread fault', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-stale-onestage-'));
    sandboxes.push(root);
    fs.mkdirSync(path.join(root, 'plans', 'review'), { recursive: true });
    writePlan(root, 'review', 'solo', { files: ['src/gone.js'] });

    const res = scanCheapCandidates(root);

    assert.equal(res.unreadCount, 0,
      'an absent stage has no plans to fail to read — reporting it would be a false partial');
    assert.equal(res.count, 1);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// PART TWO — an unbuilt plan is not abandoned work.
// ═════════════════════════════════════════════════════════════════════════════

describe('the implementation stage is PRE-BUILD — its missing files are not abandonment', () => {
  it('case 7: implementation is in NOT_STARTED_STAGES', () => {
    assert.ok(NOT_STARTED_STAGES.has('implementation'),
      'implementation sits BEFORE Gate 2, has never entered the todo queue, and has ' +
      'therefore never been executed — its declared files are SUPPOSED to be missing');
  });

  it('case 7: an unbuilt implementation plan is NOT classified as abandoned work', () => {
    const root = makeSandbox();
    writePlan(root, 'implementation', 'unbuilt', { files: ['src/lib/not-yet.js'] });

    const res = scanCheapCandidates(root);
    const cand = res.candidates.find((c) => c.plan === 'unbuilt');

    // The cheap pass stays a BROAD generator (the module header's deliberate
    // design, locked by the SP5 regression T3b): the candidate is still emitted.
    assert.ok(cand, 'the candidate is still emitted — nothing downstream loses input');
    assert.ok(cand.signals.includes('missing-files'));

    // The polarity is applied downstream, exactly where the module says it lives.
    const proposal = classifyStaleCandidate(cand, evidence());
    assert.equal(proposal.category, 'inconclusive',
      'THE HUMAN\'S LOUDEST NOISE: an unbuilt implementation plan must not be dead-on-arrival');
    assert.equal(proposal.proposedAction, null, 'no cleanup path may act on a plan that was never built');
    assert.match(proposal.evidence.join(' '), /not started/, 'and it says WHY, in the evidence');
  });

  it('case 7: the unbuilt implementation plan does not inflate the dashboard nag count', () => {
    const root = makeSandbox();
    writePlan(root, 'implementation', 'unbuilt', { files: ['src/lib/not-yet.js'] });
    writePlan(root, 'review', 'stranded', { files: ['src/lib/shipped.js'] });

    // The nag count is inbox.countActionableStale's rule: candidates filtered to
    // the stages the classifier can ACT on. Applied here against the real export.
    const { candidates } = scanCheapCandidates(root);
    const nagged = candidates.filter((c) => !NOT_STARTED_STAGES.has(c.stage)).map((c) => c.plan);

    assert.deepEqual(nagged, ['stranded'],
      'only the review plan drives the nag; the unbuilt implementation plan is advisory');
  });

  it('case 8: missing-files keeps its teeth at REVIEW', () => {
    const root = makeSandbox();
    writePlan(root, 'review', 'stranded', { files: ['src/lib/shipped.js'] });

    const res = scanCheapCandidates(root);
    const cand = res.candidates.find((c) => c.plan === 'stranded');
    assert.ok(cand);
    assert.equal(cand.actionable, true);

    const proposal = classifyStaleCandidate(cand, evidence());
    assert.equal(proposal.category, 'dead-on-arrival',
      'a declared file that does not exist at review is a GENUINE signal — this is a ' +
      'correction of scope, not a deletion');
    assert.equal(proposal.proposedAction, 'revert');
  });

  it('case 9: functional does not regress — it behaves exactly as it did', () => {
    const root = makeSandbox();
    writePlan(root, 'functional', 'unbuilt-func', { files: ['src/lib/not-yet.js'] });

    const res = scanCheapCandidates(root);
    const cand = res.candidates.find((c) => c.plan === 'unbuilt-func');
    assert.ok(cand, 'still emitted by the broad generator');
    assert.equal(cand.actionable, true, 'cheap-actionable at any gate-source stage — the SP5 T3b invariant');

    const proposal = classifyStaleCandidate(cand, evidence());
    assert.equal(proposal.category, 'inconclusive');
    assert.equal(proposal.proposedAction, null);
  });

  it('implementation and functional now behave IDENTICALLY — one rule, not two', () => {
    const root = makeSandbox();
    writePlan(root, 'implementation', 'twin-impl', { files: ['src/lib/twin.js'] });
    writePlan(root, 'functional', 'twin-func', { files: ['src/lib/twin.js'] });

    const { candidates } = scanCheapCandidates(root);
    const impl = candidates.find((c) => c.plan === 'twin-impl');
    const func = candidates.find((c) => c.plan === 'twin-func');

    assert.deepEqual(impl.signals, func.signals);
    assert.equal(impl.actionable, func.actionable);
    assert.equal(
      classifyStaleCandidate(impl, evidence()).category,
      classifyStaleCandidate(func, evidence()).category,
      'two pre-build stages must not have two different polarities'
    );
  });

  it('POSITIVE death evidence still keeps its teeth at implementation', () => {
    const root = makeSandbox();
    writePlan(root, 'implementation', 'rejected', { files: ['src/lib/killed.js'] });

    const { candidates } = scanCheapCandidates(root);
    const cand = candidates.find((c) => c.plan === 'rejected');

    const proposal = classifyStaleCandidate(cand, evidence({ explicitlyRejected: true }));
    assert.equal(proposal.category, 'dead-on-arrival',
      'the not-started gate exempts explicitlyRejected — a killed plan is still dead');
    assert.equal(proposal.proposedAction, 'delete');
  });
});
