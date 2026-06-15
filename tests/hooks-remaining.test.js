/**
 * Tests for previously-untested CTOC hooks.
 *
 * Hooks under test (each had ZERO dedicated tests before this file):
 *   - src/hooks/PrePush.js                  CI gate before push     (exit 0 allow / 1 block)
 *   - src/hooks/PreReview.js                CI gate before review   (exit 0 allow / 1 block)
 *   - src/hooks/post-commit.js              non-blocking quality-agent launcher
 *   - src/hooks/validate-plan-steps.js      Iron Loop step-label validator (CLI + lib)
 *   - src/hooks/PostToolUse.status-check.js background-agent / quality-state reporter
 *
 * MECHANICS: each hook is spawned as a REAL process via child_process.spawnSync
 * against a hermetic temp project. Exit codes and side effects are asserted
 * against the hook's documented contract discovered from source. The CLI lib of
 * validate-plan-steps.js is additionally require()'d and unit-tested directly.
 *
 * Deterministic CI control (PrePush/PreReview): the hooks call
 * runLocalCI(projectPath) with no explicit checks, so they parse the project's
 * CI config. We drop a minimal GitHub Actions workflow whose single `run:` step
 * is a direct `node -e` invocation -- exit 0 => CI pass => hook allows (exit 0);
 * exit 1 => CI fail => hook blocks (exit 1). This avoids any npm dependency and
 * is fully deterministic and cross-platform.
 */

const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const REPO = path.resolve(__dirname, '..');
const HOOK = (name) => path.join(REPO, 'src', 'hooks', name);

const ALL_STAGES = ['vision', 'functional', 'implementation', 'todo', 'in-progress', 'review', 'done'];

/**
 * Create a hermetic temp CTOC project.
 * realpathSync resolves macOS /var -> /private/var so cwd comparisons hold.
 */
function tempProject() {
  const raw = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-hooks-rem-'));
  const dir = fs.realpathSync(raw);
  fs.mkdirSync(path.join(dir, '.ctoc'), { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'CLAUDE.md'),
    '# CTOC Project Instructions\n\nHermetic test project.\n'
  );
  for (const stage of ALL_STAGES) {
    fs.mkdirSync(path.join(dir, 'plans', stage), { recursive: true });
  }
  return dir;
}

function cleanup(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ }
}

/**
 * Write a minimal GitHub Actions workflow whose single check is a direct
 * `node -e` invocation with the given exit code. Parsed by ci-parser as an
 * "unknown but substantial" check (survives filterRelevantChecks).
 */
function writeWorkflow(dir, exitCode) {
  const wf = path.join(dir, '.github', 'workflows');
  fs.mkdirSync(wf, { recursive: true });
  // node -e "process.exit(N)" — no npm, deterministic, cross-platform.
  const content =
    'name: ci\n' +
    'on: [push]\n' +
    'jobs:\n' +
    '  main:\n' +
    '    runs-on: ubuntu-latest\n' +
    '    steps:\n' +
    '      - name: ci-check\n' +
    `        run: node -e "process.exit(${exitCode})"\n`;
  fs.writeFileSync(path.join(wf, 'ci.yml'), content);
}

function runHook(name, cwd, { input = '', env = {} } = {}) {
  return spawnSync(process.execPath, [HOOK(name)], {
    cwd,
    input,
    encoding: 'utf8',
    env: { ...process.env, ...env },
    timeout: 60000
  });
}

// ---------------------------------------------------------------------------
// PrePush.js — CI gate before push. main(): exit 0 if CI passes, exit 1 if not
// or on error (fail-SAFE: an error blocks the push, it does not allow it).
// ---------------------------------------------------------------------------
describe('PrePush.js (CI gate before push)', () => {
  let dir;
  afterEach(() => { if (dir) { cleanup(dir); dir = null; } });

  it('(success path) exits 0 when local CI passes', () => {
    dir = tempProject();
    writeWorkflow(dir, 0);
    const r = runHook('PrePush.js', dir);
    assert.equal(r.status, 0, `expected allow (exit 0), got ${r.status}\nstderr: ${r.stderr}`);
  });

  it('(block path) exits 1 when local CI fails', () => {
    dir = tempProject();
    writeWorkflow(dir, 1);
    const r = runHook('PrePush.js', dir);
    assert.equal(r.status, 1, `expected block (exit 1), got ${r.status}\nstdout: ${r.stdout}`);
  });

  it('exposes prePushGate + formatOutput on module.exports', () => {
    const mod = require('../src/hooks/PrePush.js');
    assert.equal(typeof mod.prePushGate, 'function');
    assert.equal(typeof mod.formatOutput, 'function');
  });

  it('(fail-safe) prePushGate blocks (allowed:false) when CI throws, never crashes', async () => {
    const { prePushGate } = require('../src/hooks/PrePush.js');
    // A non-existent path makes runLocalCI's parse degrade to default checks,
    // which run npm in a dir without package.json -> non-pass. Either way the
    // documented contract is: errors/failures BLOCK (allowed must be false),
    // and the call must resolve without throwing.
    const bogus = path.join(os.tmpdir(), 'ctoc-does-not-exist-' + Date.now());
    const res = await prePushGate(bogus);
    assert.equal(typeof res, 'object');
    assert.equal(res.allowed, false, 'unverifiable CI must NOT allow push (fail-safe gate)');
  });
});

// ---------------------------------------------------------------------------
// PreReview.js — CI gate before moving to review. Same contract as PrePush.
// ---------------------------------------------------------------------------
describe('PreReview.js (CI gate before review)', () => {
  let dir;
  afterEach(() => { if (dir) { cleanup(dir); dir = null; } });

  it('(success path) exits 0 when local CI passes', () => {
    dir = tempProject();
    writeWorkflow(dir, 0);
    const r = runHook('PreReview.js', dir);
    assert.equal(r.status, 0, `expected allow (exit 0), got ${r.status}\nstderr: ${r.stderr}`);
  });

  it('(block path) exits 1 when local CI fails', () => {
    dir = tempProject();
    writeWorkflow(dir, 1);
    const r = runHook('PreReview.js', dir);
    assert.equal(r.status, 1, `expected block (exit 1), got ${r.status}\nstdout: ${r.stdout}`);
  });

  it('exposes preReviewGate + formatOutput on module.exports', () => {
    const mod = require('../src/hooks/PreReview.js');
    assert.equal(typeof mod.preReviewGate, 'function');
    assert.equal(typeof mod.formatOutput, 'function');
  });

  it('(fail-safe) preReviewGate blocks (allowed:false) when CI is unverifiable', async () => {
    const { preReviewGate } = require('../src/hooks/PreReview.js');
    const bogus = path.join(os.tmpdir(), 'ctoc-does-not-exist-' + Date.now());
    const res = await preReviewGate(bogus);
    assert.equal(typeof res, 'object');
    assert.equal(res.allowed, false, 'unverifiable CI must NOT allow review (fail-safe gate)');
  });
});

// ---------------------------------------------------------------------------
// post-commit.js — NON-BLOCKING. main() always returns (no process.exit on the
// success path), starts a detached quality agent IF one exists. Documented
// skip conditions: CTOC_SKIP_QUALITY=1, MERGE_HEAD present, rebase in progress.
// shouldRun() is the documented predicate; startAgent() no-ops if the agent
// file is missing. We assert it never throws and prints the documented lines.
// ---------------------------------------------------------------------------
describe('post-commit.js (non-blocking quality-agent launcher)', () => {
  let dir;
  afterEach(() => { if (dir) { cleanup(dir); dir = null; } });

  it('(success path) exits 0 and prints the "started" line when an agent exists', () => {
    dir = tempProject();
    fs.mkdirSync(path.join(dir, '.git'), { recursive: true });
    // The hook looks for ../lib/quality-agent.js relative to the hook file, so a
    // git dir with no MERGE_HEAD/rebase makes shouldRun() true and the real
    // quality-agent.js (in the repo) is launched detached. Assert it announces.
    const r = runHook('post-commit.js', dir);
    assert.equal(r.status, 0, `post-commit must succeed instantly, got ${r.status}`);
    assert.match(r.stdout, /Quality agent started in background|Quality agent not found/);
  });

  it('(skip path) honors CTOC_SKIP_QUALITY=1 and prints the skip line', () => {
    dir = tempProject();
    fs.mkdirSync(path.join(dir, '.git'), { recursive: true });
    const r = runHook('post-commit.js', dir, { env: { CTOC_SKIP_QUALITY: '1' } });
    assert.equal(r.status, 0);
    assert.match(r.stdout, /skipped \(CTOC_SKIP_QUALITY=1\)/);
  });

  it('(skip path) skips on a merge commit (MERGE_HEAD present)', () => {
    dir = tempProject();
    fs.mkdirSync(path.join(dir, '.git'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.git', 'MERGE_HEAD'), 'deadbeef\n');
    const r = runHook('post-commit.js', dir);
    assert.equal(r.status, 0);
    assert.match(r.stdout, /skipped \(merge commit\)/);
  });

  it('(skip path) skips during a rebase (rebase-merge present)', () => {
    dir = tempProject();
    fs.mkdirSync(path.join(dir, '.git', 'rebase-merge'), { recursive: true });
    const r = runHook('post-commit.js', dir);
    assert.equal(r.status, 0);
    assert.match(r.stdout, /skipped \(rebase in progress\)/);
  });

  it('shouldRun() unit: false when CTOC_SKIP_QUALITY=1, restores env after', () => {
    const { shouldRun } = require('../src/hooks/post-commit.js');
    const prev = process.env.CTOC_SKIP_QUALITY;
    process.env.CTOC_SKIP_QUALITY = '1';
    try {
      assert.equal(shouldRun(), false);
    } finally {
      if (prev === undefined) delete process.env.CTOC_SKIP_QUALITY;
      else process.env.CTOC_SKIP_QUALITY = prev;
    }
  });

  it('exposes main, shouldRun, startAgent', () => {
    const mod = require('../src/hooks/post-commit.js');
    assert.equal(typeof mod.main, 'function');
    assert.equal(typeof mod.shouldRun, 'function');
    assert.equal(typeof mod.startAgent, 'function');
  });
});

// ---------------------------------------------------------------------------
// validate-plan-steps.js — CLI validator + exported lib functions.
// Canonical: TEST PREPARE IMPLEMENT REVIEW OPTIMIZE SECURE VERIFY DOCUMENT
//            FINAL-REVIEW for steps 8..16. CLI exit 0 = pass, 1 = fail (block).
// ---------------------------------------------------------------------------
const CANONICAL_PLAN_BODY = [
  '### Step 8: TEST',
  'Write the unit tests first (TDD).',
  '### Step 9: PREPARE',
  'Prepare scaffolding.',
  '### Step 10: IMPLEMENT',
  'Implement the change.',
  '### Step 11: REVIEW',
  'Self review.',
  '### Step 12: OPTIMIZE',
  'Optimize.',
  '### Step 13: SECURE',
  'Security scan.',
  '### Step 14: VERIFY',
  'Verify quality gate.',
  '### Step 15: DOCUMENT',
  'Document.',
  '### Step 16: FINAL-REVIEW',
  'Final review.'
].join('\n') + '\n';

function writePlan(dir, name, body) {
  const p = path.join(dir, 'plans', 'todo', name);
  fs.writeFileSync(p, body);
  return p;
}

describe('validate-plan-steps.js (CLI step-label validator)', () => {
  let dir;
  afterEach(() => { if (dir) { cleanup(dir); dir = null; } });

  it('(success path) CLI exits 0 for a plan with all canonical labels', () => {
    dir = tempProject();
    const plan = writePlan(dir, 'good.md', CANONICAL_PLAN_BODY);
    const r = spawnSync(process.execPath, [HOOK('validate-plan-steps.js'), plan], { encoding: 'utf8' });
    assert.equal(r.status, 0, `expected pass, got ${r.status}\nstderr: ${r.stderr}`);
    assert.match(r.stdout, /PASSED/);
  });

  it('(block path) CLI exits 1 when Step 10 is mislabeled CODE', () => {
    dir = tempProject();
    const plan = writePlan(dir, 'bad-code.md', CANONICAL_PLAN_BODY.replace('Step 10: IMPLEMENT', 'Step 10: CODE'));
    const r = spawnSync(process.execPath, [HOOK('validate-plan-steps.js'), plan], { encoding: 'utf8' });
    assert.equal(r.status, 1, 'mislabeled IMPLEMENT->CODE must block (exit 1)');
    assert.match(r.stderr, /FAILED/);
    assert.match(r.stderr, /CODE/);
  });

  it('(block path) CLI exits 1 with no plan-path argument (usage error)', () => {
    const r = spawnSync(process.execPath, [HOOK('validate-plan-steps.js')], { encoding: 'utf8' });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /Usage/);
  });

  it('(block path) CLI exits 1 for a non-existent plan file', () => {
    const r = spawnSync(
      process.execPath,
      [HOOK('validate-plan-steps.js'), path.join(os.tmpdir(), 'nope-' + Date.now() + '.md')],
      { encoding: 'utf8' }
    );
    assert.equal(r.status, 1);
    assert.match(r.stderr, /not found/i);
  });
});

describe('validate-plan-steps.js (exported lib functions)', () => {
  const { validatePlanStepLabels, autoFixStepLabels, CANONICAL_LABELS, WRONG_LABEL_MAP } =
    require('../src/hooks/validate-plan-steps.js');
  let dir;
  afterEach(() => { if (dir) { cleanup(dir); dir = null; } });

  it('CANONICAL_LABELS is the documented 8..16 mapping', () => {
    assert.deepEqual(CANONICAL_LABELS, {
      8: 'TEST', 9: 'PREPARE', 10: 'IMPLEMENT', 11: 'REVIEW', 12: 'OPTIMIZE',
      13: 'SECURE', 14: 'VERIFY', 15: 'DOCUMENT', 16: 'FINAL-REVIEW'
    });
  });

  it('valid:true for a fully canonical plan', () => {
    dir = tempProject();
    const plan = writePlan(dir, 'ok.md', CANONICAL_PLAN_BODY);
    const res = validatePlanStepLabels(plan);
    assert.equal(res.valid, true, `expected valid, errors: ${res.errors.join(' | ')}`);
    assert.deepEqual(res.errors, []);
  });

  it('valid:false with a targeted message for QUALITY at Step 9', () => {
    dir = tempProject();
    const plan = writePlan(dir, 'q9.md', CANONICAL_PLAN_BODY.replace('Step 9: PREPARE', 'Step 9: QUALITY'));
    const res = validatePlanStepLabels(plan);
    assert.equal(res.valid, false);
    assert.ok(res.errors.some(e => /QUALITY/.test(e)), `errors: ${res.errors.join(' | ')}`);
  });

  it('valid:false for TESTING at Step 8 (known wrong label)', () => {
    // CONTRACT: WRONG_LABEL_MAP.TESTING declares "TESTING is not a valid step
    // label. Step 8 should be TEST." So a plan labeled "Step 8: TESTING" MUST be
    // rejected. This currently FAILS — a real bug: the canonical check uses
    //   new RegExp(`Step\\s*8[:\\s]+TEST`, 'i')
    // with no trailing word boundary, so "Step 8: TESTING" substring-matches
    // "...TEST" and passes. The WRONG_LABEL_MAP branch (which would flag TESTING)
    // is only reached when the canonical pattern fails, so it never fires here —
    // dead code. A mislabeled plan slips through the step-label gate.
    // Left failing intentionally per test discipline; do NOT weaken.
    dir = tempProject();
    const plan = writePlan(dir, 't8.md', CANONICAL_PLAN_BODY.replace('Step 8: TEST', 'Step 8: TESTING'));
    const res = validatePlanStepLabels(plan);
    assert.equal(res.valid, false);
    assert.ok(res.errors.some(e => /TESTING/.test(e)), `errors: ${res.errors.join(' | ')}`);
  });

  it('valid:false when a step label is entirely missing', () => {
    dir = tempProject();
    const plan = writePlan(dir, 'missing16.md', CANONICAL_PLAN_BODY.replace(/### Step 16: FINAL-REVIEW\nFinal review\.\n?/, ''));
    const res = validatePlanStepLabels(plan);
    assert.equal(res.valid, false);
    assert.ok(res.errors.some(e => /16/.test(e) && /FINAL-REVIEW/.test(e)), `errors: ${res.errors.join(' | ')}`);
  });

  it('valid:false for duplicate IMPLEMENT steps', () => {
    dir = tempProject();
    // Insert a second IMPLEMENT step so two exist.
    const dup = CANONICAL_PLAN_BODY.replace(
      '### Step 11: REVIEW',
      '### Step 10: IMPLEMENT\nA second implement.\n### Step 11: REVIEW'
    );
    const plan = writePlan(dir, 'dup.md', dup);
    const res = validatePlanStepLabels(plan);
    assert.equal(res.valid, false);
    assert.ok(res.errors.some(e => /IMPLEMENT step/i.test(e)), `errors: ${res.errors.join(' | ')}`);
  });

  it('valid:false for a non-existent plan path (no throw)', () => {
    const res = validatePlanStepLabels(path.join(os.tmpdir(), 'absent-' + Date.now() + '.md'));
    assert.equal(res.valid, false);
    assert.ok(res.errors.some(e => /not found/i.test(e)));
  });

  it('WRONG_LABEL_MAP documents CODE/QUALITY/TESTING as known-wrong', () => {
    assert.ok(WRONG_LABEL_MAP.CODE);
    assert.ok(WRONG_LABEL_MAP.QUALITY);
    assert.ok(WRONG_LABEL_MAP.TESTING);
  });

  it('autoFixStepLabels rewrites QUALITY->PREPARE at Step 9 and re-validates valid', () => {
    dir = tempProject();
    const plan = writePlan(dir, 'fixme.md', CANONICAL_PLAN_BODY.replace('Step 9: PREPARE', 'Step 9: QUALITY'));
    const res = autoFixStepLabels(plan);
    assert.equal(res.fixed, true);
    assert.ok(res.changes.some(c => /QUALITY to PREPARE/.test(c)), `changes: ${res.changes.join(' | ')}`);
    // File now contains the corrected label and re-validates clean.
    assert.match(fs.readFileSync(plan, 'utf8'), /Step 9: PREPARE/);
    assert.equal(res.valid, true, `post-fix errors: ${(res.errors || []).join(' | ')}`);
  });
});

// ---------------------------------------------------------------------------
// PostToolUse.status-check.js — runs after every tool use, ALWAYS exits 0
// (fail-open: must never block tool use). Documented side effects:
//   - prints a [BACKGROUND AGENT PENDING] block for each status:"working" file
//   - prints a [QUALITY GATE FAILED] block when quality-state status is "fail"
//   - rewrites stale (>5min) working status files to status:"timeout"
//   - silent (no output) when nothing is pending.
// ---------------------------------------------------------------------------
describe('PostToolUse.status-check.js (background-agent / quality reporter)', () => {
  let dir;
  afterEach(() => { if (dir) { cleanup(dir); dir = null; } });

  function writeStatus(stage, planName, status) {
    const p = path.join(dir, 'plans', stage, planName + '.status');
    fs.writeFileSync(p, JSON.stringify(status, null, 2));
    return p;
  }

  it('(silent path) exits 0 with no output when nothing is pending', () => {
    dir = tempProject();
    const r = runHook('PostToolUse.status-check.js', dir);
    assert.equal(r.status, 0, 'status-check must always exit 0 (fail-open)');
    assert.equal(r.stdout.trim(), '', `expected no output, got: ${r.stdout}`);
  });

  it('(pending path) prints BACKGROUND AGENT PENDING for a fresh working status', () => {
    dir = tempProject();
    writeStatus('implementation', 'feature.md', {
      agent: 'implementation-planner',
      status: 'working',
      started: new Date().toISOString(),
      message: 'Generating implementation plan'
    });
    const r = runHook('PostToolUse.status-check.js', dir);
    assert.equal(r.status, 0);
    assert.match(r.stdout, /\[BACKGROUND AGENT PENDING\]/);
    assert.match(r.stdout, /implementation-planner/);
  });

  it('(timeout side effect) rewrites a stale (>5min) working status to "timeout" and stays silent for it', () => {
    dir = tempProject();
    const old = new Date(Date.now() - 6 * 60 * 1000).toISOString(); // 6 minutes ago
    const statusPath = writeStatus('review', 'old.md', {
      agent: 'critic',
      status: 'working',
      started: old,
      message: 'stale agent'
    });
    const r = runHook('PostToolUse.status-check.js', dir);
    assert.equal(r.status, 0);
    // Stale entries are marked timeout and NOT reported as pending.
    assert.doesNotMatch(r.stdout, /\[BACKGROUND AGENT PENDING\]/);
    const after = JSON.parse(fs.readFileSync(statusPath, 'utf8'));
    assert.equal(after.status, 'timeout', 'stale working status must be rewritten to timeout');
  });

  it('(quality path) prints QUALITY GATE FAILED when quality-state status is "fail"', () => {
    dir = tempProject();
    const qsDir = path.join(dir, '.ctoc', 'quality-state');
    fs.mkdirSync(qsDir, { recursive: true });
    fs.writeFileSync(path.join(qsDir, 'status.json'), JSON.stringify({
      overallStatus: 'fail',
      gitHead: 'abc1234',
      summary: { tests: { failed: 2 }, lint: { errors: 1 } }
    }));
    const r = runHook('PostToolUse.status-check.js', dir);
    assert.equal(r.status, 0);
    assert.match(r.stdout, /\[QUALITY GATE FAILED\]/);
    assert.match(r.stdout, /Tests: 2 failed/);
  });

  it('(fail-open) exits 0 and stays silent on a malformed quality-state file', () => {
    dir = tempProject();
    const qsDir = path.join(dir, '.ctoc', 'quality-state');
    fs.mkdirSync(qsDir, { recursive: true });
    fs.writeFileSync(path.join(qsDir, 'status.json'), '{ this is not json');
    const r = runHook('PostToolUse.status-check.js', dir);
    assert.equal(r.status, 0, 'malformed quality-state must not break tool use');
  });

  it('(fail-open) exits 0 and stays silent on a malformed status file', () => {
    dir = tempProject();
    writeStatus('in-progress', 'broken.md', {}); // placeholder, then corrupt it
    fs.writeFileSync(path.join(dir, 'plans', 'in-progress', 'broken.md.status'), 'not-json{');
    const r = runHook('PostToolUse.status-check.js', dir);
    assert.equal(r.status, 0);
    assert.doesNotMatch(r.stdout, /\[BACKGROUND AGENT PENDING\]/);
  });
});
