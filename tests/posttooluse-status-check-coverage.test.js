/**
 * Dark-branch coverage for src/hooks/PostToolUse.status-check.js.
 *
 * This hook has no exports and runs main() at require-time, reading
 * process.cwd() for PLANS_DIR and .ctoc/quality-state. The ONLY honest way to
 * drive it is as a real child process with cwd pointed at a hermetic temp
 * project — that is the true boundary (process control + filesystem), and it is
 * the mechanism the existing sibling suite (tests/hooks-remaining.test.js) also
 * uses. No core logic is mocked; only the fs fixtures and the process are real.
 *
 * The sibling suite already pins the obvious paths (silent / fresh-pending /
 * stale-timeout / fail-with-summary / two malformed-JSON fail-open cases). This
 * file deliberately targets the branches that suite leaves DARK — each test
 * below goes RED if the specific production branch it names is mutated:
 *
 *   line 32   existsSync guard on a missing stage dir      -> cluster L
 *   line 41   status.status === 'working' (false operand)  -> cluster B
 *   line 92   status.gitHead || 'unknown' (2nd operand)    -> cluster C
 *   line 93   if (status.summary) (false operand)          -> cluster D
 *   line 94   summary.tests?.failed optional-chain absent  -> cluster D2
 *   101-102   summary.typecheck.errors > 0                 -> cluster E
 *   103-105   security critical/high + `|| 0` fallbacks    -> cluster F
 *   110-115   tiers loop + data.status === 'fail'          -> cluster G
 *   118-126   overallStatus === 'running' + elapsed > 30   -> cluster H/I
 *   line 144  if (agentDef) (false operand)                -> cluster A
 *   155-156   main() catch — fail-open on internal throw   -> cluster K
 *
 * All fixtures live under os.tmpdir() and are removed in afterEach.
 */

const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const REPO = path.resolve(__dirname, '..');
const HOOK = path.join(REPO, 'src', 'hooks', 'PostToolUse.status-check.js');

const AGENT_STAGES = ['implementation', 'review', 'in-progress'];

/**
 * Hermetic temp project. By default creates the three agent-stage plan dirs so
 * findPendingAgents() walks them without hitting the missing-dir guard. Pass
 * { stageDirs: false } to omit them (cluster L), or create the stage as a file
 * afterward (cluster K).
 */
function tempProject({ stageDirs = true } = {}) {
  const raw = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-statuscheck-'));
  const dir = fs.realpathSync(raw);
  fs.mkdirSync(path.join(dir, 'plans'), { recursive: true });
  if (stageDirs) {
    for (const stage of AGENT_STAGES) {
      fs.mkdirSync(path.join(dir, 'plans', stage), { recursive: true });
    }
  }
  return dir;
}

function cleanup(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ }
}

function run(cwd) {
  return spawnSync(process.execPath, [HOOK], {
    cwd,
    input: '',
    encoding: 'utf8',
    env: { ...process.env },
    timeout: 60000
  });
}

function writeStatus(dir, stage, planName, status) {
  const p = path.join(dir, 'plans', stage, planName + '.status');
  fs.writeFileSync(p, JSON.stringify(status, null, 2));
  return p;
}

function writeQuality(dir, obj) {
  const qsDir = path.join(dir, '.ctoc', 'quality-state');
  fs.mkdirSync(qsDir, { recursive: true });
  fs.writeFileSync(path.join(qsDir, 'status.json'), JSON.stringify(obj));
}

describe('PostToolUse.status-check.js — dark branches', () => {
  let dir;
  afterEach(() => { if (dir) { cleanup(dir); dir = null; } });

  // ── Cluster A: line 144  if (agentDef) — FALSE operand ────────────────────
  // A working status whose agent is NOT a key of AGENT_DEFINITIONS must still
  // be reported as pending, but WITHOUT an "Agent definition:" line. Kills the
  // mutant that drops the guard (which would print "Agent definition: undefined").
  it('reports_pending_but_omits_agent_definition_line_when_agent_is_unknown', () => {
    // Arrange
    dir = tempProject();
    writeStatus(dir, 'implementation', 'ghost.md', {
      agent: 'ghost-agent',                 // absent from AGENT_DEFINITIONS
      status: 'working',
      started: new Date().toISOString(),
      message: 'doing ghostly work'
    });

    // Act
    const r = run(dir);

    // Assert
    assert.equal(r.status, 0);
    assert.match(r.stdout, /\[BACKGROUND AGENT PENDING\]/);
    assert.match(r.stdout, /ghost-agent/);
    assert.doesNotMatch(r.stdout, /Agent definition:/);
  });

  // ── Cluster B: line 41  status.status === 'working' — FALSE operand ───────
  // A non-"working" status file must be ignored entirely: no pending report and
  // no timeout rewrite. Kills a mutation of the === comparison (which would pull
  // a 'complete' file into the pending set).
  it('ignores_status_file_and_leaves_it_untouched_when_status_is_not_working', () => {
    // Arrange
    dir = tempProject();
    const statusPath = writeStatus(dir, 'review', 'done.md', {
      agent: 'critic',
      status: 'complete',                   // not "working"
      started: new Date().toISOString(),
      message: 'already finished'
    });

    // Act
    const r = run(dir);

    // Assert
    assert.equal(r.status, 0);
    assert.doesNotMatch(r.stdout, /\[BACKGROUND AGENT PENDING\]/);
    const after = JSON.parse(fs.readFileSync(statusPath, 'utf8'));
    assert.equal(after.status, 'complete', 'non-working status must not be rewritten');
  });

  // ── Cluster C: line 92  status.gitHead || 'unknown' — 2nd operand ─────────
  // A failing quality state with NO gitHead field must print "Git HEAD: unknown".
  // Kills the mutant that drops the `|| 'unknown'` fallback (prints "undefined").
  it('prints_git_head_unknown_when_quality_fail_has_no_git_head', () => {
    // Arrange
    dir = tempProject();
    writeQuality(dir, { overallStatus: 'fail', summary: { tests: { failed: 1 } } });

    // Act
    const r = run(dir);

    // Assert
    assert.equal(r.status, 0);
    assert.match(r.stdout, /\[QUALITY GATE FAILED\]/);
    assert.match(r.stdout, /Git HEAD: unknown/);
  });

  // ── Cluster D: line 93  if (status.summary) — FALSE operand ───────────────
  // A fail with no `summary` object prints the header and the closing "Fix
  // issues" line but NONE of the per-check sub-lines. Kills the mutant that
  // drops the `if (status.summary)` guard (would throw on status.summary.tests
  // -> caught by the inner fail-open -> whole failure block suppressed).
  it('prints_header_but_no_check_sublines_when_fail_has_no_summary', () => {
    // Arrange
    dir = tempProject();
    writeQuality(dir, { overallStatus: 'fail', gitHead: 'deadbee' });

    // Act
    const r = run(dir);

    // Assert
    assert.equal(r.status, 0);
    assert.match(r.stdout, /\[QUALITY GATE FAILED\]/);
    assert.match(r.stdout, /Fix issues and commit again to retry\./);
    assert.doesNotMatch(r.stdout, /Tests:|Lint:|Typecheck:|Security:/);
  });

  // ── Cluster D2: line 94  summary.tests?.failed — optional chain absent ────
  // summary present but WITHOUT a `tests` key: no "Tests:" line, yet a sibling
  // "Lint:" line still prints. Kills a mutant removing the `?.` short-circuit
  // (which would throw reading .failed of undefined).
  it('prints_lint_but_no_tests_line_when_summary_omits_tests', () => {
    // Arrange
    dir = tempProject();
    writeQuality(dir, {
      overallStatus: 'fail',
      gitHead: 'cafe123',
      summary: { lint: { errors: 4 } }      // no `tests` key
    });

    // Act
    const r = run(dir);

    // Assert
    assert.equal(r.status, 0);
    assert.match(r.stdout, /Lint: 4 errors/);
    assert.doesNotMatch(r.stdout, /Tests:/);
  });

  // ── Cluster E: lines 101-102  summary.typecheck.errors > 0 ────────────────
  it('prints_typecheck_line_when_typecheck_errors_present', () => {
    // Arrange
    dir = tempProject();
    writeQuality(dir, {
      overallStatus: 'fail',
      gitHead: 'tc0001',
      summary: { typecheck: { errors: 3 } }
    });

    // Act
    const r = run(dir);

    // Assert
    assert.equal(r.status, 0);
    assert.match(r.stdout, /Typecheck: 3 errors/);
  });

  // ── Cluster E-neg: line 100  typecheck?.errors > 0 — FALSE (zero) ─────────
  // errors: 0 must NOT print a Typecheck line. Kills a `>`-to-`>=` mutant.
  it('omits_typecheck_line_when_typecheck_errors_is_zero', () => {
    // Arrange
    dir = tempProject();
    writeQuality(dir, {
      overallStatus: 'fail',
      gitHead: 'tc0000',
      summary: { typecheck: { errors: 0 } }
    });

    // Act
    const r = run(dir);

    // Assert
    assert.equal(r.status, 0);
    assert.match(r.stdout, /\[QUALITY GATE FAILED\]/);
    assert.doesNotMatch(r.stdout, /Typecheck:/);
  });

  // ── Cluster F: lines 103-105  security critical/high + `|| 0` fallbacks ────
  // Table-driven: each row pins a distinct operand of the `||` condition and a
  // distinct `|| 0` render fallback.
  const securityRows = [
    { id: 'both-present',   security: { critical: 2, high: 1 }, expect: /Security: 2 critical, 1 high/ },
    { id: 'high-only',      security: { high: 4 },              expect: /Security: 0 critical, 4 high/ },
    { id: 'critical-only',  security: { critical: 5 },          expect: /Security: 5 critical, 0 high/ }
  ];
  for (const row of securityRows) {
    it(`prints_security_line_with_zero_fallbacks_[${row.id}]`, () => {
      // Arrange
      dir = tempProject();
      writeQuality(dir, {
        overallStatus: 'fail',
        gitHead: 'sec' + row.id,
        summary: { security: row.security }
      });

      // Act
      const r = run(dir);

      // Assert
      assert.equal(r.status, 0);
      assert.match(r.stdout, row.expect);
    });
  }

  // ── Cluster F-neg: line 103  both counts zero -> no Security line ─────────
  // Kills the mutant that flips the `||` condition to `&&`-style always-true, or
  // drops the guard: critical:0/high:0 must produce NO Security line.
  it('omits_security_line_when_critical_and_high_are_both_zero', () => {
    // Arrange
    dir = tempProject();
    writeQuality(dir, {
      overallStatus: 'fail',
      gitHead: 'sec000',
      summary: { security: { critical: 0, high: 0 } }
    });

    // Act
    const r = run(dir);

    // Assert
    assert.equal(r.status, 0);
    assert.match(r.stdout, /\[QUALITY GATE FAILED\]/);
    assert.doesNotMatch(r.stdout, /Security:/);
  });

  // ── Cluster G: lines 110-115  tiers loop + data.status === 'fail' ─────────
  // Only the tier whose status is 'fail' is printed; a passing sibling tier is
  // not. Kills the `if (status.tiers)` guard AND the `data.status === 'fail'`
  // per-entry comparison.
  it('prints_only_failed_tiers_and_skips_passing_tiers', () => {
    // Arrange
    dir = tempProject();
    writeQuality(dir, {
      overallStatus: 'fail',
      gitHead: 'tier01',
      tiers: {
        compile: { status: 'fail' },
        style: { status: 'pass' }
      }
    });

    // Act
    const r = run(dir);

    // Assert
    assert.equal(r.status, 0);
    assert.match(r.stdout, /compile: FAILED/);
    assert.doesNotMatch(r.stdout, /style: FAILED/);
  });

  // ── Cluster H: lines 118-124  overallStatus === 'running' & elapsed > 30 ──
  // A running state whose lastRun.startedAt is well over 30s ago prints the
  // "[QUALITY] Background quality checks running" progress line. Kills both the
  // `=== 'running'` branch and the `elapsed > 30` comparison.
  it('prints_running_progress_line_when_running_and_elapsed_over_30s', () => {
    // Arrange
    dir = tempProject();
    const started = new Date(Date.now() - 45 * 1000).toISOString(); // 45s ago
    writeQuality(dir, { overallStatus: 'running', lastRun: { startedAt: started } });

    // Act
    const r = run(dir);

    // Assert
    assert.equal(r.status, 0);
    assert.match(r.stdout, /\[QUALITY\] Background quality checks running \(\d+s elapsed\)/);
    const m = r.stdout.match(/running \((\d+)s elapsed\)/);
    assert.ok(m && Number(m[1]) > 30, `elapsed should exceed 30s, got ${m && m[1]}`);
  });

  // ── Cluster I: line 123  elapsed > 30 — FALSE (recent run) -> silent ──────
  // Kills a `>`-to-`>=`/`<` mutation: a run started 3s ago must stay silent.
  it('stays_silent_when_running_and_elapsed_under_30s', () => {
    // Arrange
    dir = tempProject();
    const started = new Date(Date.now() - 3 * 1000).toISOString(); // 3s ago
    writeQuality(dir, { overallStatus: 'running', lastRun: { startedAt: started } });

    // Act
    const r = run(dir);

    // Assert
    assert.equal(r.status, 0);
    assert.doesNotMatch(r.stdout, /\[QUALITY\]/);
  });

  // ── Cluster I2: lines 120-122  lastRun?.startedAt absent -> ternary `: 0` ──
  // No lastRun object => elapsed defaults to 0 => 0 > 30 is false => silent.
  // Kills a mutation of the `: 0` alternative to a non-zero literal (which would
  // trip the > 30 branch and print).
  it('stays_silent_when_running_with_no_lastRun_started_at', () => {
    // Arrange
    dir = tempProject();
    writeQuality(dir, { overallStatus: 'running' }); // no lastRun

    // Act
    const r = run(dir);

    // Assert
    assert.equal(r.status, 0);
    assert.doesNotMatch(r.stdout, /\[QUALITY\]/);
  });

  // ── Cluster J: line 88/118 both FALSE — neither fail nor running -> silent ─
  // A 'pass' quality state must produce no quality output at all.
  it('stays_silent_when_quality_state_is_pass', () => {
    // Arrange
    dir = tempProject();
    writeQuality(dir, { overallStatus: 'pass', gitHead: 'ok0001' });

    // Act
    const r = run(dir);

    // Assert
    assert.equal(r.status, 0);
    assert.equal(r.stdout.trim(), '', `expected silence, got: ${r.stdout}`);
  });

  // ── Cluster L: line 32  existsSync(stageDir) guard — missing dir ──────────
  // With the agent-stage plan dirs absent, findPendingAgents must skip them
  // (continue) and STILL reach checkQualityState so the fail is reported. If the
  // existsSync guard were removed, readdirSync would throw ENOENT, propagate to
  // main's catch, and suppress the quality output — so the QUALITY line proves
  // the guard fired.
  it('skips_missing_stage_dirs_and_still_reports_quality_failure', () => {
    // Arrange
    dir = tempProject({ stageDirs: false });
    writeQuality(dir, { overallStatus: 'fail', gitHead: 'noStg1', summary: { tests: { failed: 1 } } });

    // Act
    const r = run(dir);

    // Assert
    assert.equal(r.status, 0);
    assert.match(r.stdout, /\[QUALITY GATE FAILED\]/);
    assert.match(r.stdout, /Tests: 1 failed/);
  });

  // ── Cluster K: lines 155-156  main() catch — fail-open on internal throw ──
  // A stage PATH that exists but is a FILE (not a directory) passes existsSync
  // yet makes the unguarded readdirSync at line 34 throw ENOTDIR. That escapes
  // findPendingAgents (its inner try only wraps per-file JSON parsing) and hits
  // main()'s outer try/catch. The hook must still exit 0 (fail-open) AND, because
  // the throw pre-empts checkQualityState, must NOT emit the quality failure
  // even though a fail state file is present — proving the catch was entered.
  it('fails_open_exit0_and_skips_quality_when_a_stage_path_is_a_file', () => {
    // Arrange
    dir = tempProject({ stageDirs: false });
    fs.mkdirSync(path.join(dir, 'plans', 'review'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'plans', 'in-progress'), { recursive: true });
    // 'implementation' is the FIRST agent stage — make it a regular file.
    fs.writeFileSync(path.join(dir, 'plans', 'implementation'), 'not a directory');
    writeQuality(dir, { overallStatus: 'fail', gitHead: 'boom01', summary: { tests: { failed: 9 } } });

    // Act
    const r = run(dir);

    // Assert
    assert.equal(r.status, 0, 'internal throw must fail open (exit 0), never crash the session');
    assert.doesNotMatch(r.stdout, /\[QUALITY GATE FAILED\]/);
  });
});
