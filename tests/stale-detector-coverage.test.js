'use strict';

// ---------------------------------------------------------------------------
// stale-detector-coverage.test.js
//
// Dark-branch coverage for src/lib/stale-detector.js, TARGETING the parts the
// cheap scan test never reaches: the pure classifier (classifyStaleCandidate),
// the git-driven verifier (verifyStaleCandidate), the evidence formatter
// (reached through the classifier), and the degrade/catch branches in
// dismissStale + scanCheapCandidates.
//
// The bar is mutation survival, not line count: every test below pins a branch
// that goes RED if the production line is mutated. Human-reviewed line by line.
//
// Boundary discipline: the ONLY fakes are at the true I/O boundary — a real
// on-disk tmp fixture (fs) and a real `git` process. No classification logic is
// mocked; the classifier is exercised as the pure function it is, with
// hand-built StaleEvidence objects that the public API documents.
// ---------------------------------------------------------------------------

const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const {
  scanCheapCandidates,
  verifyStaleCandidate,
  classifyStaleCandidate,
  dismissStale,
  AGE_THRESHOLD_MS,
} = require('../src/lib/stale-detector.js');

// ---------------------------------------------------------------------------
// Fixtures (real fs, cleaned in afterEach)
// ---------------------------------------------------------------------------

const sandboxes = [];
const perms = []; // { p, mode } to restore before rmSync

function makeSandbox() {
  const dir = path.join(
    os.tmpdir(),
    'ctoc-sd-cov-' + process.pid + '-' + Date.now() + '-' + Math.random().toString(36).slice(2)
  );
  fs.mkdirSync(dir, { recursive: true });
  sandboxes.push(dir);
  return dir;
}

function writePlan(sb, stage, slug, { files = [], syntax = 'inline', approvedBy = undefined } = {}) {
  const stageDir = path.join(sb, 'plans', stage);
  fs.mkdirSync(stageDir, { recursive: true });
  let filesBlock = '';
  if (syntax === 'inline' && files.length) filesBlock = `files: [${files.join(', ')}]\n`;
  else if (syntax === 'block' && files.length) {
    filesBlock = 'files:\n' + files.map((f) => `  - ${f}\n`).join('');
  }
  const approvedLine = approvedBy === undefined ? '' : `approved_by: ${approvedBy}\n`;
  const content =
    '---\n' + `title: "${slug}"\n` + filesBlock + approvedLine + 'status: refined\n' + '---\n\n' + `# ${slug}\n`;
  const fp = path.join(stageDir, slug + '.md');
  fs.writeFileSync(fp, content);
  return fp;
}

function touch(sb, rel) {
  const full = path.join(sb, ...rel.split('/'));
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, '');
}

// Real git repo helper. All commits get a deterministic committer date so %ct
// comparisons (stage-entry vs files-last-modified) are exact and reproducible.
function gitInit(sb) {
  const env = { ...process.env, GIT_CONFIG_NOSYSTEM: '1', HOME: sb };
  execFileSync('git', ['init', '-q', '.'], { cwd: sb, env });
  execFileSync('git', ['config', 'user.email', 't@ctoc.test'], { cwd: sb, env });
  execFileSync('git', ['config', 'user.name', 'ctoc-test'], { cwd: sb, env });
  execFileSync('git', ['config', 'commit.gpgsign', 'false'], { cwd: sb, env });
  return env;
}

function gitCommit(sb, env, message, epochSeconds) {
  const date = '@' + epochSeconds + ' +0000';
  execFileSync('git', ['add', '-A'], { cwd: sb, env });
  execFileSync('git', ['commit', '-q', '-m', message], {
    cwd: sb,
    env: { ...env, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date },
  });
}

const find = (res, slug) => res.candidates.find((c) => c.plan === slug);

// A complete, git-available StaleEvidence with all keys the classifier reads —
// callers override only the fields under test so intent is obvious.
function evidence(overrides = {}) {
  return {
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
    explicitlyRejected: false,
    ...overrides,
  };
}

afterEach(() => {
  while (perms.length) {
    const { p, mode } = perms.pop();
    try {
      fs.chmodSync(p, mode);
    } catch {
      /* best-effort restore so rmSync can proceed */
    }
  }
  while (sandboxes.length) {
    fs.rmSync(sandboxes.pop(), { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// CLUSTER A — classifier category → remediation mapping (each mapping is a
// distinct branch; a mutant that swaps any action string goes RED here).
// ---------------------------------------------------------------------------

describe('classifyStaleCandidate — category → proposedAction mapping', () => {
  it('dead-on-arrival (files gone, nothing shipped, not approved) proposes revert', () => {
    const proposal = classifyStaleCandidate(
      { plan: 'p', stage: 'review' },
      evidence({ anyFileMissing: true, declaredFiles: ['src/gone.js'] })
    );
    assert.equal(proposal.category, 'dead-on-arrival');
    assert.equal(proposal.proposedAction, 'revert');
  });

  it('dead-on-arrival WITH explicit rejection proposes delete, not revert', () => {
    // Same inputs as above except explicitlyRejected — the ternary flips the
    // action from revert to delete. Pins line 619's second branch.
    const proposal = classifyStaleCandidate(
      { plan: 'p', stage: 'review' },
      evidence({ anyFileMissing: true, declaredFiles: ['src/gone.js'], explicitlyRejected: true })
    );
    assert.equal(proposal.category, 'dead-on-arrival');
    assert.equal(proposal.proposedAction, 'delete');
  });

  it('approved-but-stranded (approved AND work continued after entry) proposes advance-via-reconciliation', () => {
    const proposal = classifyStaleCandidate(
      { plan: 'p', stage: 'review' },
      evidence({
        approvedBy: 'human',
        filesModifiedAfterEntry: true,
        declaredFiles: ['src/a.js'],
        allFilesExist: true,
      })
    );
    assert.equal(proposal.category, 'approved-but-stranded');
    assert.equal(proposal.proposedAction, 'advance-via-reconciliation');
  });

  it('shipped-but-early (slug-match + modified-after-entry + all present) proposes archive-to-done', () => {
    const proposal = classifyStaleCandidate(
      { plan: 'p', stage: 'review' },
      evidence({
        slugMatchAfterEntry: true,
        filesModifiedAfterEntry: true,
        allFilesExist: true,
        declaredFiles: ['src/a.js'],
        slugMatchCommits: [{ shortHash: 'abc1234', dateISO: '2026-01-01', subject: 'ship p' }],
      })
    );
    assert.equal(proposal.category, 'shipped-but-early');
    assert.equal(proposal.proposedAction, 'archive-to-done');
  });

  it('inconclusive (thin evidence, all present, nothing after entry) proposes null action', () => {
    const proposal = classifyStaleCandidate(
      { plan: 'p', stage: 'review' },
      evidence({ declaredFiles: ['src/a.js'], allFilesExist: true })
    );
    assert.equal(proposal.category, 'inconclusive');
    assert.equal(proposal.proposedAction, null);
  });
});

// ---------------------------------------------------------------------------
// CLUSTER B — not-started polarity: a pre-implementation plan whose files are
// merely unbuilt must NOT be reported as dead (it would inflate the nag and
// invite a wrong revert/delete). This is the classifier's NOT_STARTED gate.
// ---------------------------------------------------------------------------

describe('classifyStaleCandidate — not-started gate (missing files ≠ dead before build)', () => {
  it('functional-stage missing files ⇒ inconclusive with null action (benign, not dead-on-arrival)', () => {
    const proposal = classifyStaleCandidate(
      { plan: 'p', stage: 'functional' },
      evidence({ anyFileMissing: true, declaredFiles: ['src/notyet.js'] })
    );
    assert.equal(proposal.category, 'inconclusive');
    assert.equal(proposal.proposedAction, null);
    assert.match(proposal.evidence[0], /not started/);
  });

  // ── REVERSAL, 2026-07-19, and it is deliberate ────────────────────────────
  // This test previously read `implementation-stage missing files ⇒
  // dead-on-arrival (past the not-started gate)` and its comment said "Pins the
  // polarity split." THAT PIN WAS WRONG, and an earlier author placed it on
  // purpose, so the reversal is recorded here rather than performed quietly.
  //
  // WHAT THE CODE IS SUPPOSED TO DO, derived from OUTSIDE this test — never from
  // what the code returns, which would be circular:
  //   1. The NOT_STARTED_STAGES contract in src/lib/stale-detector.js states the
  //      set is "stages at which declared files are NOT yet expected to exist — a
  //      missing-files signal here means the plan is UNBUILT (not started), never
  //      abandoned."
  //   2. CLAUDE.md's pipeline model — "Pre-todo is context-building. Todo+ is
  //      execution" — places the implementation stage BEFORE Gate 2. Such a plan
  //      has never entered the todo queue and has therefore NEVER BEEN EXECUTED.
  //      Its declared `files:` are the files it INTENDS to create.
  //   3. Measured on this repository before the fix: 8 of 21 cheap-scan
  //      candidates (38%) were unbuilt implementation plans classified
  //      dead-on-arrival. It was the detector's loudest output and it was noise.
  // By (1) and (2), an implementation-stage plan satisfies the set's own stated
  // membership rule. It was simply missing from the set.
  //
  // WHY THE TEST WAS WRONG RATHER THAN THE CODE: the test asserted a CONSEQUENCE
  // of the omission (implementation reaches DOA) as though it were the intent.
  // Nothing outside the test ever said implementation expects built files; the
  // header says the opposite. The test pinned the defect in place.
  //
  // WHICH IMPLEMENTATION PASSES/FAILS: it passed while NOT_STARTED_STAGES was
  // {vision, canvas, functional} and fails once `implementation` joins it.
  //
  // The test's REAL value — proving the gate does not swallow every stage — is
  // preserved below by relocating it to `review`, a stage where declared files
  // genuinely SHOULD exist because the work has been built. The polarity split is
  // still pinned; it is pinned at the correct boundary.
  it('review-stage missing files ⇒ dead-on-arrival (past the not-started gate)', () => {
    // Same evidence, different stage. If the not-started gate leaked to cover a
    // POST-BUILD stage, this would wrongly read inconclusive. Pins the polarity
    // split at the real boundary: pre-Gate-2 stages are benign, review is not.
    const proposal = classifyStaleCandidate(
      { plan: 'p', stage: 'review' },
      evidence({ anyFileMissing: true, declaredFiles: ['src/notyet.js'] })
    );
    assert.equal(proposal.category, 'dead-on-arrival');
    assert.equal(proposal.proposedAction, 'revert');
  });

  it('implementation-stage missing files ⇒ inconclusive (pre-Gate-2: the files are UNBUILT, not abandoned)', () => {
    const proposal = classifyStaleCandidate(
      { plan: 'p', stage: 'implementation' },
      evidence({ anyFileMissing: true, declaredFiles: ['src/notyet.js'] })
    );
    assert.equal(proposal.category, 'inconclusive');
    assert.equal(proposal.proposedAction, null);
    assert.match(proposal.evidence[0], /not started/);
  });

  it('functional-stage BUT explicitly rejected ⇒ falls THROUGH the gate to delete (rejection keeps its teeth)', () => {
    // The not-started gate exempts positive death evidence: a rejected plan is
    // dead even at a not-started stage. Kills a mutant that drops the
    // !explicitlyRejected guard from the gate condition.
    const proposal = classifyStaleCandidate(
      { plan: 'p', stage: 'functional' },
      evidence({ anyFileMissing: true, declaredFiles: ['src/x.js'], explicitlyRejected: true })
    );
    assert.equal(proposal.category, 'dead-on-arrival');
    assert.equal(proposal.proposedAction, 'delete');
  });

  it('unknown/missing stage with missing files ⇒ dead-on-arrival (Set.has(undefined)===false → teeth kept)', () => {
    const proposal = classifyStaleCandidate(
      { plan: 'p' }, // no stage
      evidence({ anyFileMissing: true, declaredFiles: ['src/x.js'] })
    );
    assert.equal(proposal.category, 'dead-on-arrival');
    assert.equal(proposal.proposedAction, 'revert');
  });
});

// ---------------------------------------------------------------------------
// CLUSTER C — classifier totality over malformed input, and the || fallbacks
// on the git-unavailable message. Degrade-never-throw.
// ---------------------------------------------------------------------------

describe('classifyStaleCandidate — malformed input degrades to inconclusive, never throws', () => {
  it('null candidate ⇒ inconclusive, plan null (no property-read throw)', () => {
    const proposal = classifyStaleCandidate(null, evidence());
    assert.equal(proposal.category, 'inconclusive');
    assert.equal(proposal.plan, null);
    assert.equal(proposal.proposedAction, null);
  });

  it('undefined evidence ⇒ inconclusive; message ends with empty parens (both || operands: evidence&&… short-circuits to "")', () => {
    const proposal = classifyStaleCandidate({ plan: 'p', stage: 'review' }, undefined);
    assert.equal(proposal.category, 'inconclusive');
    assert.equal(proposal.evidence[0], 'git unavailable — cannot verify ()');
  });

  it('git-unavailable WITH an error string surfaces that error in the evidence line (first || operand)', () => {
    const proposal = classifyStaleCandidate(
      { plan: 'p', stage: 'review' },
      { gitAvailable: false, error: 'not a git repository' }
    );
    assert.equal(proposal.category, 'inconclusive');
    assert.equal(proposal.evidence[0], 'git unavailable — cannot verify (not a git repository)');
  });

  it('missing slugMatchCommits key does not throw (slugMatchCommits || []) — still classifies dead-on-arrival', () => {
    // Build evidence WITHOUT slugMatchCommits so `.length` would throw absent the
    // `|| []` guard. A mutant deleting that guard reds this test with a TypeError.
    const ev = evidence({ anyFileMissing: true, declaredFiles: ['src/gone.js'] });
    delete ev.slugMatchCommits;
    const proposal = classifyStaleCandidate({ plan: 'p', stage: 'review' }, ev);
    assert.equal(proposal.category, 'dead-on-arrival');
  });
});

// ---------------------------------------------------------------------------
// CLUSTER D — evidence line formatting (buildEvidenceLines), reached via the
// classifier. Each branch of the formatter is pinned through a category that
// routes to it. Covers the approvedBy line, the slug line with/without the
// "after stage entry" suffix, the missing vs present file lines, the present
// line's modified-after-entry suffix, and the age-only fallback.
// ---------------------------------------------------------------------------

describe('evidence lines (via classifier) — every formatter branch', () => {
  it('dead-on-arrival: reports "at least one of N declared file(s) missing"', () => {
    const p = classifyStaleCandidate(
      { plan: 'p', stage: 'review' },
      evidence({ anyFileMissing: true, declaredFiles: ['a.js', 'b.js'] })
    );
    assert.ok(p.evidence.some((l) => l === 'at least one of 2 declared file(s) missing'));
  });

  it('approved-but-stranded: approvedBy line + slug "after stage entry" suffix + present "last change after stage entry" suffix', () => {
    const p = classifyStaleCandidate(
      { plan: 'p', stage: 'review' },
      evidence({
        approvedBy: 'human',
        filesModifiedAfterEntry: true,
        allFilesExist: true,
        declaredFiles: ['a.js'],
        slugMatchAfterEntry: true,
        slugMatchCommits: [{ shortHash: 'deadbee', dateISO: '2026-02-02', subject: 's' }],
      })
    );
    assert.ok(p.evidence.includes('approved_by: human'));
    assert.ok(p.evidence.some((l) => l === 'slug matched in deadbee (2026-02-02), after stage entry'));
    assert.ok(p.evidence.some((l) => l === 'all 1 declared files present; last change after stage entry'));
  });

  it('approved-but-stranded with slugMatchAfterEntry=false omits the ", after stage entry" suffix', () => {
    const p = classifyStaleCandidate(
      { plan: 'p', stage: 'review' },
      evidence({
        approvedBy: 'human',
        filesModifiedAfterEntry: true,
        allFilesExist: true,
        declaredFiles: ['a.js'],
        slugMatchAfterEntry: false,
        slugMatchCommits: [{ shortHash: 'cafe123', dateISO: '2026-03-03', subject: 's' }],
      })
    );
    assert.ok(p.evidence.some((l) => l === 'slug matched in cafe123 (2026-03-03)'));
  });

  it('inconclusive with all files present but NOT modified after entry: present line WITHOUT the suffix', () => {
    const p = classifyStaleCandidate(
      { plan: 'p', stage: 'review' },
      evidence({ allFilesExist: true, declaredFiles: ['a.js'], filesModifiedAfterEntry: false })
    );
    assert.equal(p.category, 'inconclusive');
    assert.ok(p.evidence.some((l) => l === 'all 1 declared files present'));
  });

  it('inconclusive with no discriminating evidence at all falls back to the age-only line', () => {
    const p = classifyStaleCandidate({ plan: 'p', stage: 'review' }, evidence({ declaredFiles: [] }));
    assert.equal(p.category, 'inconclusive');
    assert.deepEqual(p.evidence, ['age-only signal; no shipping evidence']);
  });
});

// ---------------------------------------------------------------------------
// CLUSTER E — scan age boundary is STRICT `>` (not `>=`). At exactly the
// threshold, no advisory:age; one millisecond past, it fires. Kills the
// >→>= mutant. mtime is pinned to an integer via utimes so the float
// arithmetic reconstructs the difference exactly.
// ---------------------------------------------------------------------------

describe('scanCheapCandidates — advisory:age boundary is strict greater-than', () => {
  const INT_MTIME = 1_600_000_000_000; // integer ms → exact double arithmetic

  it('age difference EXACTLY at the threshold does NOT flag the plan (present files, no signal)', () => {
    const sb = makeSandbox();
    const fp = writePlan(sb, 'review', 'p-edge', { files: ['src/lib/here.js'] });
    touch(sb, 'src/lib/here.js');
    const d = new Date(INT_MTIME);
    fs.utimesSync(fp, d, d);
    const nowMs = INT_MTIME + AGE_THRESHOLD_MS; // diff === threshold, `> threshold` is false
    const res = scanCheapCandidates(sb, { nowMs });
    assert.equal(find(res, 'p-edge'), undefined, 'exactly-threshold age must not fire (strict >)');
  });

  it('age difference ONE millisecond past the threshold DOES flag advisory:age', () => {
    const sb = makeSandbox();
    const fp = writePlan(sb, 'review', 'p-edge', { files: ['src/lib/here.js'] });
    touch(sb, 'src/lib/here.js');
    const d = new Date(INT_MTIME);
    fs.utimesSync(fp, d, d);
    const nowMs = INT_MTIME + AGE_THRESHOLD_MS + 1;
    const res = scanCheapCandidates(sb, { nowMs });
    const cand = find(res, 'p-edge');
    assert.ok(cand, 'threshold+1ms must flag');
    assert.deepEqual(cand.signals, ['advisory:age']);
    assert.equal(cand.actionable, false);
  });
});

// ---------------------------------------------------------------------------
// CLUSTER F — verifyStaleCandidate argument-misuse throws (the ONLY throws in
// the verifier; everything else degrades).
// ---------------------------------------------------------------------------

describe('verifyStaleCandidate — misuse throws TypeError', () => {
  it('candidate without a non-empty plan throws', () => {
    assert.throws(() => verifyStaleCandidate({ plan: '', stage: 'review' }, '/tmp/x'), TypeError);
  });
  it('candidate without a non-empty stage throws', () => {
    assert.throws(() => verifyStaleCandidate({ plan: 'p', stage: '' }, '/tmp/x'), TypeError);
  });
  it('null candidate throws', () => {
    assert.throws(() => verifyStaleCandidate(null, '/tmp/x'), TypeError);
  });
  it('empty-string root throws', () => {
    assert.throws(() => verifyStaleCandidate({ plan: 'p', stage: 'review' }, ''), TypeError);
  });
});

// ---------------------------------------------------------------------------
// CLUSTER G — verifyStaleCandidate degraded path: NOT a git repo ⇒
// gitAvailable:false, error captured, but fs-derived fields still populated.
// GIT_CEILING_DIRECTORIES makes the "not a repo" result deterministic even if
// the tmp dir happens to sit under an unrelated repo.
// ---------------------------------------------------------------------------

describe('verifyStaleCandidate — outside a git repo degrades (never throws)', () => {
  it('returns gitAvailable:false with the git error, and fs truth still filled in', () => {
    const sb = makeSandbox();
    writePlan(sb, 'review', 'p-nogit', { files: ['src/lib/present.js', 'src/lib/gone.js'] });
    touch(sb, 'src/lib/present.js');

    const prevCeil = process.env.GIT_CEILING_DIRECTORIES;
    process.env.GIT_CEILING_DIRECTORIES = path.dirname(sb);
    let ev;
    try {
      ev = verifyStaleCandidate({ plan: 'p-nogit', stage: 'review' }, sb);
    } finally {
      if (prevCeil === undefined) delete process.env.GIT_CEILING_DIRECTORIES;
      else process.env.GIT_CEILING_DIRECTORIES = prevCeil;
    }

    assert.equal(ev.gitAvailable, false);
    assert.equal(typeof ev.error, 'string');
    assert.ok(ev.error.length > 0, 'the git failure message is captured');
    assert.deepEqual(ev.declaredFiles, ['src/lib/present.js', 'src/lib/gone.js']);
    assert.equal(ev.allFilesExist, false, 'one declared file is missing');
    assert.equal(ev.anyFileMissing, true);
    assert.equal(ev.stageEntryEpoch, null);
    assert.equal(ev.explicitlyRejected, false);
  });
});

// ---------------------------------------------------------------------------
// CLUSTER H — verifyStaleCandidate inside a git repo with NO commits: rev-parse
// succeeds (gitAvailable:true) but every `git log` throws, so all epoch queries
// degrade to null via their catch branches (stage entry, per-file, full history).
// ---------------------------------------------------------------------------

describe('verifyStaleCandidate — git repo with zero commits degrades every epoch to null', () => {
  it('gitAvailable true, but stage-entry / files-modified / slug-history all degrade to null/[]', () => {
    const sb = makeSandbox();
    gitInit(sb);
    writePlan(sb, 'review', 'p-empty', { files: ['src/lib/present.js'] });
    touch(sb, 'src/lib/present.js'); // declaredFiles non-empty ⇒ the per-file log loop runs

    const ev = verifyStaleCandidate({ plan: 'p-empty', stage: 'review' }, sb);

    assert.equal(ev.gitAvailable, true, 'rev-parse succeeds in an initialized repo');
    assert.equal(ev.error, null);
    assert.equal(ev.stageEntryEpoch, null, 'git log on the plan path threw ⇒ null');
    assert.equal(ev.filesLastModifiedEpoch, null, 'per-file git log threw ⇒ null');
    assert.equal(ev.filesModifiedAfterEntry, false);
    assert.deepEqual(ev.slugMatchCommits, [], 'full-history git log threw ⇒ empty records');
    assert.equal(ev.slugMatchAfterEntry, false);
  });
});

// ---------------------------------------------------------------------------
// CLUSTER I — verifyStaleCandidate happy path in a repo WITH commits: real
// epoch extraction, the files-last-modified MAX walk, files-modified-after-entry
// truth, slug matching after entry, and the control-char sanitization at
// capture. Then the pure classifier reads that real evidence end-to-end.
// ---------------------------------------------------------------------------

describe('verifyStaleCandidate — committed repo computes epochs, slug match, and sanitizes subjects', () => {
  it('extracts stage-entry (oldest plan commit) and files-last-modified (max across files), flags modified-after-entry and slug-after-entry', () => {
    const sb = makeSandbox();
    const env = gitInit(sb);

    // T0: the plan enters the stage (its only, hence oldest, commit).
    writePlan(sb, 'review', 'p-git', { files: ['src/lib/one.js', 'src/lib/two.js'] });
    gitCommit(sb, env, 'add plan', 1_600_000_000);

    // T1: first declared file lands, in a commit whose subject names the slug.
    touch(sb, 'src/lib/one.js');
    gitCommit(sb, env, 'one for p-git', 1_600_000_100);

    // T2: second declared file lands later ⇒ exercises the `n > max` update.
    touch(sb, 'src/lib/two.js');
    gitCommit(sb, env, 'finish two', 1_600_000_200);

    const ev = verifyStaleCandidate({ plan: 'p-git', stage: 'review' }, sb);

    assert.equal(ev.gitAvailable, true);
    assert.equal(ev.stageEntryEpoch, 1_600_000_000, 'oldest commit touching the plan file');
    assert.equal(ev.filesLastModifiedEpoch, 1_600_000_200, 'MAX across the two declared files');
    assert.equal(ev.filesModifiedAfterEntry, true, 'files last changed after stage entry');
    assert.equal(ev.allFilesExist, true);
    assert.equal(ev.slugMatchAfterEntry, true, 'a slug-named commit exists after stage entry');
    assert.ok(
      ev.slugMatchCommits.some((c) => c.subject === 'one for p-git'),
      'the slug-matching commit subject is captured'
    );

    // End-to-end: the pure classifier reads this REAL evidence ⇒ shipped-but-early.
    const proposal = classifyStaleCandidate({ plan: 'p-git', stage: 'review' }, ev);
    assert.equal(proposal.category, 'shipped-but-early');
    assert.equal(proposal.proposedAction, 'archive-to-done');
  });

  it('strips control characters from a hostile commit subject at capture (no ANSI leak downstream)', () => {
    const sb = makeSandbox();
    const env = gitInit(sb);
    writePlan(sb, 'review', 'p-ctl', { files: ['src/lib/z.js'] });
    gitCommit(sb, env, 'add plan', 1_600_000_000);
    touch(sb, 'src/lib/z.js');
    // Subject carries a raw control byte (\x01) surrounding the slug.
    gitCommit(sb, env, 'p-ctl \x01 danger', 1_600_000_100);

    const ev = verifyStaleCandidate({ plan: 'p-ctl', stage: 'review' }, sb);
    const match = ev.slugMatchCommits.find((c) => /danger/.test(c.subject));
    assert.ok(match, 'the slug-matching commit is captured');
    assert.ok(!/[\x00-\x1f]/.test(match.subject), 'control chars are stripped at capture');
    assert.equal(match.subject, 'p-ctl  danger');
  });

  it('unreadable plan file degrades content to empty (declaredFiles [], approvedBy null) but git still runs', () => {
    const sb = makeSandbox();
    const env = gitInit(sb);
    writePlan(sb, 'review', 'real', { files: ['src/lib/a.js'] });
    gitCommit(sb, env, 'seed', 1_600_000_000);

    // Candidate points at a plan slug with no file on disk ⇒ readFileSync throws
    // ⇒ content '' ⇒ empty frontmatter region.
    const ev = verifyStaleCandidate({ plan: 'ghost', stage: 'review' }, sb);
    assert.equal(ev.gitAvailable, true);
    assert.deepEqual(ev.declaredFiles, []);
    assert.equal(ev.approvedBy, null);
  });

  it('reuses a supplied slugHistoryCache instead of re-reading git history', () => {
    const sb = makeSandbox();
    const env = gitInit(sb);
    writePlan(sb, 'review', 'p-cache', { files: ['src/lib/a.js'] });
    touch(sb, 'src/lib/a.js');
    gitCommit(sb, env, 'seed with no slug mention', 1_600_000_000);

    // Pre-seed the cache with a record that names the slug but does NOT exist in
    // the real git log. If the cache is honoured, this fabricated commit surfaces;
    // if the function re-scanned git, it would not — so the assertion proves reuse.
    const cache = {
      records: [{ ct: 1_600_000_500, shortHash: 'feed777', message: 'work on p-cache slice' }],
    };
    const ev = verifyStaleCandidate({ plan: 'p-cache', stage: 'review' }, sb, {
      slugHistoryCache: cache,
    });
    assert.ok(
      ev.slugMatchCommits.some((c) => c.shortHash === 'feed777'),
      'the cached (not re-read) history record is used'
    );
  });

  it('an empty approved_by value resolves to null (the `|| null` second operand)', () => {
    const sb = makeSandbox();
    const env = gitInit(sb);
    // approved_by present but empty after trim ⇒ stripQuotes("") || null ⇒ null.
    writePlan(sb, 'review', 'p-empty-approve', { files: ['src/lib/a.js'], approvedBy: '""' });
    touch(sb, 'src/lib/a.js');
    gitCommit(sb, env, 'seed', 1_600_000_000);

    const ev = verifyStaleCandidate({ plan: 'p-empty-approve', stage: 'review' }, sb);
    assert.equal(ev.approvedBy, null, 'empty approved_by must collapse to null, not ""');
  });
});

// ---------------------------------------------------------------------------
// CLUSTER J — dismissStale degrade branches.
// ---------------------------------------------------------------------------

describe('dismissStale — degrade paths', () => {
  it('a candidate whose plan file vanished is skipped (count 0) but the store write still succeeds', () => {
    const sb = makeSandbox();
    // No plans/review/ghost.md exists ⇒ lstat throws ⇒ the candidate is skipped.
    const res = dismissStale(sb, [{ plan: 'ghost', stage: 'review' }]);
    assert.equal(res.ok, true, 'the write of an (empty) store still succeeds');
    assert.equal(res.count, 0, 'the vanished-plan candidate contributed nothing');
  });

  it('a write failure (store parent is a FILE, not a dir) returns ok:false, never throws', () => {
    const sb = makeSandbox();
    // Make `.ctoc` a regular file so mkdir(.ctoc/state) throws ENOTDIR inside the
    // outer try ⇒ the catch returns { ok:false }.
    fs.writeFileSync(path.join(sb, '.ctoc'), 'not a directory');
    let res;
    assert.doesNotThrow(() => {
      res = dismissStale(sb, []);
    });
    assert.deepEqual(res, { ok: false, count: 0 });
  });
});

// ---------------------------------------------------------------------------
// CLUSTER K — scanCheapCandidates catch branches that keep the scan going when
// a single stage/file faults.
// ---------------------------------------------------------------------------

describe('scanCheapCandidates — per-stage / per-file faults are contained', () => {
  it('a stage path that is a FILE (not a dir) is skipped; other stages still scan', () => {
    const sb = makeSandbox();
    // plans/functional is a regular file ⇒ existsSync true, readdirSync throws ENOTDIR.
    fs.mkdirSync(path.join(sb, 'plans'), { recursive: true });
    fs.writeFileSync(path.join(sb, 'plans', 'functional'), 'x');
    writePlan(sb, 'review', 'ok', { files: ['src/lib/gone.js'] });

    let res;
    assert.doesNotThrow(() => {
      res = scanCheapCandidates(sb);
    });
    assert.ok(find(res, 'ok'), 'the healthy stage is still scanned after the faulting stage');
  });

  it('an unreadable plan FILE (chmod 000) is skipped; a sibling still scans [skips if perms not enforced]', () => {
    const sb = makeSandbox();
    const fp = writePlan(sb, 'review', 'locked', { files: ['src/lib/gone.js'] });
    writePlan(sb, 'review', 'open', { files: ['src/lib/also-gone.js'] });

    fs.chmodSync(fp, 0o000);
    perms.push({ p: fp, mode: 0o644 });

    // Guard: if this process can still read the file (root, or a permission model
    // that ignores 000), the read-fault branch is not exercisable here — assert the
    // scan is at least well-formed and move on rather than fake a hit.
    let enforced = true;
    try {
      fs.readFileSync(fp, 'utf8');
      enforced = false;
    } catch {
      /* good: the read genuinely faults */
    }

    const res = scanCheapCandidates(sb);
    assert.ok(find(res, 'open'), 'the readable sibling is always flagged');
    if (enforced) {
      assert.equal(find(res, 'locked'), undefined, 'the unreadable plan is skipped, not thrown on');
    }
  });

  it('a stat fault on entries (stage dir readable but not searchable, chmod 0400) is contained [skips if perms not enforced]', () => {
    const sb = makeSandbox();
    // Two plans in a dir we will make r-- : readdir lists them, but lstat on each
    // child needs search (x) permission and therefore throws EACCES.
    writePlan(sb, 'functional', 'a', { files: ['src/lib/ga.js'] });
    writePlan(sb, 'functional', 'b', { files: ['src/lib/gb.js'] });
    writePlan(sb, 'review', 'reachable', { files: ['src/lib/gr.js'] });
    const fdir = path.join(sb, 'plans', 'functional');

    fs.chmodSync(fdir, 0o400);
    perms.push({ p: fdir, mode: 0o700 });

    // Guard: confirm the stat genuinely faults on this host before asserting the skip.
    let enforced = true;
    try {
      fs.lstatSync(path.join(fdir, 'a.md'));
      enforced = false;
    } catch {
      /* good: search permission is enforced */
    }

    let res;
    assert.doesNotThrow(() => {
      res = scanCheapCandidates(sb);
    });
    assert.ok(find(res, 'reachable'), 'a plan in an unaffected stage is still flagged');
    if (enforced) {
      assert.equal(find(res, 'a'), undefined, 'a stat-faulting entry is skipped');
      assert.equal(find(res, 'b'), undefined, 'a stat-faulting entry is skipped');
    }
  });
});
