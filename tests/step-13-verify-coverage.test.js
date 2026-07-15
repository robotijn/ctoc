'use strict';

/**
 * step-13-verify.js — DARK-BRANCH coverage (mutation-oriented).
 *
 * This suite targets the honesty branches that the three existing suites
 * (verify-fails-loudly, verify-evidence-wiring, ctoc-audit-w05-verify-evidence)
 * leave dark. Each test pins a branch that goes RED under mutation; none of them
 * merely re-cross an obvious path.
 *
 * BOUNDARY FAKES ONLY. The one true boundary in this module is the subprocess:
 * `child_process.execSync` / `child_process.spawnSync` (real toolchains) and
 * `app-runner.driveAppSync` (a launched app). Faking these keeps the tests
 * deterministic and load-immune — a real `ruff`/`go`/`cargo`/`ctoc` on the runner
 * would otherwise flip the result. The FILESYSTEM boundary is NOT faked: every
 * project is a real directory under os.tmpdir(), read through the real safe-fs,
 * so the fs-facing honesty logic (corrupt package.json, corrupt coverage floor)
 * runs against real bytes. No core logic is mocked.
 *
 * The fakes are installed by mutating the real `child_process` / `app-runner`
 * module objects BEFORE a cache-busted fresh `require` of the module under test —
 * because the module destructures `{ execSync, spawnSync }` and `{ driveAppSync }`
 * at load time, a fresh load captures the fakes. Originals are restored in a
 * finally and the fresh instance is evicted, so the process-shared require.cache
 * is left exactly as found (the real, top-level `verify` binding stays real).
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const MOD = '../src/lib/step-13-verify';
const MOD_PATH = require.resolve(MOD);
const cp = require('child_process');
const appRunner = require('../src/lib/app-runner');

/**
 * Load a fresh instance of step-13-verify with the subprocess boundary faked,
 * run `fn(mod)`, then restore the real functions and evict the fresh instance.
 * fakes: { execSync?, spawnSync?, driveAppSync? } — any omitted stays real.
 */
function withFakedBoundary(fakes, fn) {
  const origExec = cp.execSync;
  const origSpawn = cp.spawnSync;
  const origDrive = appRunner.driveAppSync;
  if (fakes.execSync) cp.execSync = fakes.execSync;
  if (fakes.spawnSync) cp.spawnSync = fakes.spawnSync;
  if (fakes.driveAppSync) appRunner.driveAppSync = fakes.driveAppSync;
  delete require.cache[MOD_PATH];
  try {
    const mod = require(MOD);
    return fn(mod);
  } finally {
    cp.execSync = origExec;
    cp.spawnSync = origSpawn;
    appRunner.driveAppSync = origDrive;
    delete require.cache[MOD_PATH];
  }
}

/** An execSync failure that mimics a MISSING tool/script (looksNotRun == true). */
function missingToolError(msg) {
  return Object.assign(new Error('spawn failed'), { stderr: msg, stdout: '' });
}
/** An execSync failure that mimics a REAL nonzero exit (looksNotRun == false). */
function realFailureError(msg) {
  return Object.assign(new Error('exit 1'), { stderr: msg, stdout: '' });
}

let dir;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-verify-dark-')); });
afterEach(() => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ } });

function write(name, content) {
  const p = path.join(dir, name);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content);
}
function pkg(obj) { write('package.json', JSON.stringify(obj, null, 2)); }
const noApp = () => ({ applicable: false, evidence: { reason: 'library' } });

// ─────────────────────────────────────────────────────────────────────────────
// Cluster A — the ctoc quality gate SUCCESS arm (lines 53-57).
// Kills: the mutant that drops `if (gateResult.success)` (never selects the gate)
// and the mutant that omits qualityGate from the substantive count.
// ─────────────────────────────────────────────────────────────────────────────
describe('runVerify — ctoc quality gate success is the winning method', () => {
  it('selects method ctoc-quality-gate and passes when the gate exits 0', () => {
    // Arrange — the ONLY substantive signal is the ctoc quality gate: no npm
    // scripts, no launchable app. execSync succeeds only for the gate command.
    const execSync = (command) => {
      assert.match(command, /ctoc quality --tier=1/, 'the gate command is the one probed first');
      return '  tier-1 clean\n';
    };

    // Act
    const res = withFakedBoundary(
      { execSync, driveAppSync: noApp },
      (mod) => mod.runVerify(dir)
    );

    // Assert — the success arm ran: method, the recorded check, and a pass that
    // rests SOLELY on the gate being counted as substantive.
    assert.equal(res.method, 'ctoc-quality-gate');
    assert.equal(res.checks.qualityGate.passed, true);
    assert.equal(res.passed, true, 'a passing gate is a substantive check → VERIFY passes');
    assert.equal(res.errors.length, 0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Cluster B — toolchain-detection arms select the RIGHT verifier (toolExists,
// lines 234-243). Fakes let a probed tool be present/absent deterministically.
// ─────────────────────────────────────────────────────────────────────────────
describe('runVerify — pyproject arm selects ruff/pytest when the tools exist', () => {
  it('B1: ruff present + ruff passes → lint RAN via "ruff check ." (toolExists true arm)', () => {
    // Arrange — a Python project; every probed tool reports present.
    write('pyproject.toml', '[project]\nname = "p"\n');
    const spawnSync = () => ({ error: null });                 // toolExists → true
    const execSync = (command) => {
      if (/ctoc quality/.test(command)) throw missingToolError('ctoc: command not found');
      return `ran: ${command}`;                                // ruff/mypy/pytest all pass
    };

    // Act
    const res = withFakedBoundary(
      { execSync, spawnSync, driveAppSync: noApp },
      (mod) => mod.runVerify(dir)
    );

    // Assert — the pyproject arm chose the python verifier, not a node one.
    assert.equal(res.checks.lint.ran, true);
    assert.equal(res.checks.lint.command, 'ruff check .');
    assert.equal(res.checks.lint.passed, true);
    assert.equal(res.checks.tests.command, 'pytest');
    assert.equal(res.method, 'fallback-direct');
  });

  it('B2: probed tools ABSENT → no candidate selected → no-verifiable-toolchain', () => {
    // Arrange — Python project, but ruff/mypy/pytest are not installed.
    write('pyproject.toml', '[project]\nname = "p"\n');
    const spawnSync = () => ({ error: missingToolError('ENOENT') }); // toolExists → false

    // Act
    const res = withFakedBoundary(
      { spawnSync, driveAppSync: noApp },
      (mod) => mod.runVerify(dir)
    );

    // Assert — nothing was runnable, so lint is applicable:false (not a fail) and
    // the whole run fails loudly with the vacuity reason.
    assert.equal(res.checks.lint.applicable, false);
    assert.equal(res.passed, false);
    assert.ok(res.errors.some((e) => /no-verifiable-toolchain/i.test(e)));
  });

  it('B3: toolExists survives a spawnSync THROW → treats tool as absent (catch, 244-246)', () => {
    // Arrange — spawnSync throws synchronously (e.g. bad options / OS refusal).
    write('pyproject.toml', '[project]\nname = "p"\n');
    const spawnSync = () => { throw new Error('spawnSync exploded'); };

    // Act + Assert — the catch swallows it (no crash) and the tool counts as
    // absent, so nothing runs and VERIFY fails loudly rather than throwing.
    const res = withFakedBoundary(
      { spawnSync, driveAppSync: noApp },
      (mod) => mod.runVerify(dir)
    );
    assert.equal(res.checks.lint.applicable, false);
    assert.ok(res.errors.some((e) => /no-verifiable-toolchain/i.test(e)));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Cluster C — a selected candidate that turns out NOT-RUN (tryCommands continue +
// nothing-ran return, 466-467 / 471-480) and evalCategory's !r.ran arm (274-275).
// Distinct from B2: here a candidate WAS selected, but at run time it reports
// "command not found" — the NOT-RUN heuristic must NOT count that as a failure.
// ─────────────────────────────────────────────────────────────────────────────
describe('runVerify — a selected candidate that reports missing is NOT a failure', () => {
  it('C1: ruff selected but exec reports "command not found" → applicable:false, "not runnable"', () => {
    // Arrange — toolExists says ruff is present, but the actual invocation reports
    // missing (the race/heuristic edge the three-state contract exists to handle).
    write('pyproject.toml', '[project]\nname = "p"\n');
    const spawnSync = () => ({ error: null });                 // toolExists → true → candidate pushed
    const execSync = (command) => {
      if (/ctoc quality/.test(command)) throw missingToolError('ctoc: command not found');
      throw missingToolError(`${command}: command not found`); // every candidate reads NOT-RUN
    };

    // Act
    const res = withFakedBoundary(
      { execSync, spawnSync, driveAppSync: noApp },
      (mod) => mod.runVerify(dir)
    );

    // Assert — the "candidates were not runnable" arm (274-275): recorded as
    // applicable:false, NOT pushed as a failing check. And the missing candidate
    // never manufactured an error (the whole point of looksNotRun's continue).
    assert.equal(res.checks.lint.applicable, false);
    assert.match(res.checks.lint.reason, /not runnable/i);
    assert.ok(!res.errors.some((e) => /Lint failed/.test(e)),
      `a NOT-RUN candidate must not become a Lint failure; errors: ${JSON.stringify(res.errors)}`);
    assert.ok(res.errors.some((e) => /no-verifiable-toolchain/i.test(e)));
  });

  it('C2: a candidate that fails for a REAL reason IS a failing check (contrast to C1)', () => {
    // Arrange — same selection, but the invocation fails with a real nonzero exit
    // whose message is NOT a missing-tool message.
    write('pyproject.toml', '[project]\nname = "p"\n');
    const spawnSync = () => ({ error: null });
    const execSync = (command) => {
      if (/ctoc quality/.test(command)) throw missingToolError('ctoc: command not found');
      throw realFailureError('AssertionError: 3 rules violated');
    };

    // Act
    const res = withFakedBoundary(
      { execSync, spawnSync, driveAppSync: noApp },
      (mod) => mod.runVerify(dir)
    );

    // Assert — this one RAN and FAILED: applicable:true, passed:false, error listed.
    assert.equal(res.checks.lint.ran, true);
    assert.equal(res.checks.lint.passed, false);
    assert.equal(res.passed, false);
    assert.ok(res.errors.some((e) => /Lint failed/.test(e)),
      `a real nonzero exit must be a failing check; errors: ${JSON.stringify(res.errors)}`);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Cluster D — the app-run last mile when the app-runner THROWS (applyAppRunCheck
// catch, 135-143). A thrown runner must degrade to launched:false/responded:false
// and push a loud error — never crash VERIFY, never silently pass.
// ─────────────────────────────────────────────────────────────────────────────
describe('runVerify — app-runner that throws fails loudly, not silently', () => {
  it('D1: driveAppSync throws → appRuns launched:false/responded:false + a loud error', () => {
    // Arrange — a real passing test keeps the run otherwise-green, so the ONLY
    // thing that can flip it is the thrown app check.
    pkg({ name: 'app', version: '1.0.0', scripts: { test: 'node -e "process.exit(0)"' } });
    const driveAppSync = () => { throw new Error('runner boom'); };

    // Act
    const res = withFakedBoundary(
      { driveAppSync },
      (mod) => mod.runVerify(dir)
    );

    // Assert — the catch fabricated the fail-shaped record and named the throw.
    assert.equal(res.checks.appRuns.applicable, true);
    assert.equal(res.checks.appRuns.launched, false);
    assert.equal(res.checks.appRuns.responded, false);
    assert.ok(res.checks.appRuns.errors.some((e) => /app-runner threw: runner boom/.test(e)));
    assert.equal(res.passed, false, 'a thrown app check must fail VERIFY');
    assert.ok(res.errors.some((e) => /App did not run/.test(e)));
  });

  it('D2: applyAppRunCheck records applicable:false (with reason) when the runner opts out', () => {
    // Arrange — call the exported helper directly on a result skeleton; the runner
    // returns applicable:false carrying an evidence.reason.
    const driveAppSync = () => ({ applicable: false, evidence: { reason: 'no runtime here' } });
    const result = { checks: {}, errors: [] };

    // Act
    withFakedBoundary(
      { driveAppSync },
      (mod) => mod.applyAppRunCheck(result, dir)
    );

    // Assert — records the runner's reason and contributes NO error.
    assert.equal(result.checks.appRuns.applicable, false);
    assert.equal(result.checks.appRuns.reason, 'no runtime here');
    assert.equal(result.errors.length, 0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Cluster E — the FILESYSTEM honesty catches, run against REAL corrupt bytes
// (no fakes). A removed catch would throw and crash VERIFY.
// ─────────────────────────────────────────────────────────────────────────────
describe('runVerify — corrupt on-disk files degrade safely (do not crash)', () => {
  it('E1: an unparseable package.json is treated as absent (loadPackageJsonSafe catch, 216-217)', () => {
    // Arrange — real bytes that are NOT valid JSON.
    write('package.json', '{ this is not: json,,, ');

    // Act + Assert — no throw; with no other toolchain it fails loudly instead.
    let res;
    assert.doesNotThrow(() => { res = require(MOD).runVerify(dir); });
    assert.equal(res.passed, false);
    assert.ok(res.errors.some((e) => /no-verifiable-toolchain/i.test(e)),
      `a corrupt package.json must read as "no package.json", not crash; errors: ${JSON.stringify(res.errors)}`);
  });

  it('E2: an unparseable coverage-baseline is treated as "no floor" (readCoverageFloor catch, 298-299)', () => {
    // Arrange — a real passing test that emits an istanbul coverage line, plus a
    // CORRUPT baseline. A well-behaved floor read would throw; the catch must make
    // it null → coverage is recorded but NOT gated.
    write('.ctoc/coverage-baseline.json', '{ minPct: not-a-number ');
    pkg({ name: 'cov', version: '1.0.0', scripts: {
      test: 'node -e "console.log(\'All files | 12.5 |\'); process.exit(0)"'
    } });

    // Act
    let res;
    assert.doesNotThrow(() => { res = require(MOD).runVerify(dir); });

    // Assert — coverage measured, no floor applied (corrupt baseline ⇒ ungated),
    // so a low number does NOT fail the gate and nothing threw.
    assert.equal(res.checks.tests.coverage, 12.5);
    assert.equal(res.checks.tests.coverageFloor ?? null, null);
    assert.ok(!res.errors.some((e) => /below the project floor/i.test(e)),
      `a corrupt floor must not gate coverage; errors: ${JSON.stringify(res.errors)}`);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Cluster F — buildSummary honesty on the pass line (second operand of `||`,
// line 195): the "ran: <list> || 'nothing'" fallback must never read as a
// vacuous "all checks passed", and must name what actually ran + what did not.
// ─────────────────────────────────────────────────────────────────────────────
describe('buildSummary — the pass line names what ran and what was skipped', () => {
  it('F1: on pass, summary lists the ran checks and the not-applicable ones distinctly', () => {
    // Arrange — a result where tests RAN and lint is applicable:false.
    const result = {
      passed: true,
      checks: {
        lint: { ran: false, applicable: false },
        types: { ran: false, applicable: false },
        tests: { ran: true, applicable: true, passed: true }
      }
    };

    // Act
    const s = require(MOD).buildSummary(result, 1);

    // Assert — names 'tests' as ran and 'lint'/'typecheck' as not applicable; never
    // the vacuous phrasing; never the 'nothing' fallback (that operand is dark here).
    assert.match(s, /ran: .*tests/);
    assert.match(s, /not applicable: .*lint.*typecheck/);
    assert.ok(!/all .*checks passed/i.test(s));
  });

  it('F2: the "|| \'nothing\'" fallback fires when passed:true but no check ran', () => {
    // Arrange — a degenerate pass with an empty ran-list exercises the SECOND
    // operand of `ran.join(', ') || 'nothing'` (line 195), which F1 leaves dark.
    const result = { passed: true, checks: {} };

    // Act
    const s = require(MOD).buildSummary(result, 0);

    // Assert
    assert.match(s, /ran: nothing/);
  });
});
