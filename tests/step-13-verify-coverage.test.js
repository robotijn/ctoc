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

/** An execSync failure that mimics a MISSING tool/script (a spawn-layer error). */
function missingToolError(msg) {
  return Object.assign(new Error('spawn failed'), { stderr: msg, stdout: '' });
}
/**
 * An execSync failure that mimics a TRUE spawn-layer ENOENT — the binary itself
 * could not be launched. This (and ONLY this) is what reclassifies a check as
 * NOT-RUN; a substring of the command's own output never does.
 */
function absentBinaryError(msg) {
  return Object.assign(new Error('spawn ENOENT'), { code: 'ENOENT', stderr: msg, stdout: '' });
}
/** An execSync failure that mimics a REAL nonzero exit (launched, then failed). */
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
  it('C1: ruff selected but the binary is truly absent at exec (spawn ENOENT) → applicable:false, "not runnable"', () => {
    // Arrange — toolExists says ruff is present, but the actual invocation fails
    // at the SPAWN layer with a true ENOENT (the binary vanished between probe and
    // run — the only race the NOT-RUN reclassification legitimately handles). A
    // mere "command not found" substring is NOT enough; it must be a real spawn ENOENT.
    write('pyproject.toml', '[project]\nname = "p"\n');
    const spawnSync = () => ({ error: null });                 // toolExists → true → candidate pushed
    const execSync = (command) => {
      if (/ctoc quality/.test(command)) throw missingToolError('ctoc: command not found');
      throw absentBinaryError(`${command}: ENOENT`);           // every candidate is a true spawn ENOENT
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

// ─────────────────────────────────────────────────────────────────────────────
// Cluster G — DEFECT 1: a REAL non-zero exit whose OWN output contains a
// ubiquitous substring ("No such file", "ENOENT", …) must be a REAL failure, NOT
// swallowed as NOT-RUN. Candidates are already presence-filtered upstream
// (npmScriptExists/toolExists), so the only thing an output-scan can do is MISFIRE
// on a genuine failure and carry VERIFY to green on some other passing check.
// A NOT-RUN reclassification is legitimate ONLY on a TRUE spawn error
// (execSync throwing with e.code === 'ENOENT'), never on a substring of stdout/stderr.
// ─────────────────────────────────────────────────────────────────────────────
describe('runVerify — a real failure containing "No such file" is NOT swallowed (DEFECT 1)', () => {
  it('G1: lint passes, tests exit non-zero with "No such file" in stderr → tests FAIL, VERIFY fails', () => {
    // Arrange — a node project whose lint script passes but whose test script
    // exits non-zero; its output happens to contain "No such file". The candidates
    // were presence-verified (both scripts exist), so this is a genuine failure.
    pkg({ name: 'app', version: '1.0.0', scripts: { lint: 'x', test: 'y' } });
    const execSync = (command) => {
      if (/ctoc quality/.test(command)) throw missingToolError('ctoc: command not found');
      if (/lint/.test(command)) return 'lint clean';
      // The test command RAN and exited non-zero; the OLD looksNotRun swallowed
      // this as NOT-RUN because of the "No such file" substring, letting the
      // passing lint carry VERIFY to green.
      throw realFailureError('Error: boom: No such file or directory');
    };

    // Act
    const res = withFakedBoundary(
      { execSync, driveAppSync: noApp },
      (mod) => mod.runVerify(dir)
    );

    // Assert — the command executed and exited non-zero → it RAN and FAILED; the
    // ubiquitous substring must not reclassify it as not-run.
    assert.equal(res.checks.tests.ran, true, 'a command that executed and exited non-zero RAN');
    assert.equal(res.checks.tests.passed, false);
    assert.equal(res.passed, false, 'a genuine test failure must fail VERIFY even when its output contains "No such file"');
    assert.ok(res.errors.some((e) => /Tests failed/i.test(e)), `errors: ${JSON.stringify(res.errors)}`);
  });

  it('G2: a real failure whose stderr contains "ENOENT" (but NOT a spawn ENOENT) still FAILS', () => {
    // Arrange — same idea, different ubiquitous substring, and asserted via lint.
    pkg({ name: 'app', version: '1.0.0', scripts: { lint: 'x', test: 'y' } });
    const execSync = (command) => {
      if (/ctoc quality/.test(command)) throw missingToolError('ctoc: command not found');
      if (/lint/.test(command)) throw realFailureError('AssertionError: ENOENT appeared in the diff output');
      return 'tests ok';
    };

    // Act
    const res = withFakedBoundary(
      { execSync, driveAppSync: noApp },
      (mod) => mod.runVerify(dir)
    );

    // Assert — a real lint failure, not a not-run reclassification.
    assert.equal(res.checks.lint.ran, true);
    assert.equal(res.checks.lint.passed, false);
    assert.equal(res.passed, false);
    assert.ok(res.errors.some((e) => /Lint failed/i.test(e)), `errors: ${JSON.stringify(res.errors)}`);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Cluster H — DEFECT 2: the coverage floor must be enforced against Node's own
// --experimental-test-coverage table ("# all files | 42.10 | …"), which the old
// case-sensitive Istanbul-only regex missed → parseCoveragePct returned null →
// the floor was SILENTLY unenforced (below-floor coverage PASSED). Also: a
// declared floor with UNMEASURABLE coverage must fail closed (unmeasured != pass).
// ─────────────────────────────────────────────────────────────────────────────
describe('parseCoveragePct — Node native and Istanbul rows (DEFECT 2 unit)', () => {
  it('H1: reads a Node-native lowercase coverage summary row (hash prefix), parsing 42.10 percent', () => {
    assert.equal(require(MOD).parseCoveragePct('# all files | 42.10 | 30.00 | 25.00 | 1-9'), 42.10);
  });
  it('H2: still reads the Istanbul "All files | 95 |" row (no regression)', () => {
    assert.equal(require(MOD).parseCoveragePct('All files |     95 |'), 95);
  });
  it('H3: returns null when no coverage figure is present', () => {
    assert.equal(require(MOD).parseCoveragePct('ok, nothing here'), null);
  });
});

describe('runVerify — coverage floor enforced against Node-native format (DEFECT 2)', () => {
  it('H4: 99% floor + a Node-native 42.10% coverage table → VERIFY FAILS below floor', () => {
    // Arrange — the exact repro: a declared 99 floor and a node --test-shaped
    // coverage table printing "# all files | 42.10 |".
    write('.ctoc/coverage-baseline.json', JSON.stringify({ minPct: 99 }));
    pkg({ name: 'nodecov', version: '1.0.0', scripts: {
      test: 'node -e "console.log(\'# all files | 42.10 |\'); process.exit(0)"'
    } });

    // Act
    const res = require(MOD).runVerify(dir);

    // Assert — coverage parsed from the Node-native row, and below the floor.
    assert.equal(res.checks.tests.coverage, 42.10, 'the Node-native coverage row must be parsed');
    assert.equal(res.passed, false, 'below-floor Node-native coverage must fail VERIFY');
    assert.ok(res.errors.some((e) => /below the project floor/i.test(e)), `errors: ${JSON.stringify(res.errors)}`);
  });

  it('H5: floor declared but coverage UNPARSEABLE → VERIFY fails closed (unmeasured is not a pass)', () => {
    // Arrange — a declared floor, a passing test that emits NO coverage table.
    write('.ctoc/coverage-baseline.json', JSON.stringify({ minPct: 99 }));
    pkg({ name: 'nocov', version: '1.0.0', scripts: {
      test: 'node -e "console.log(\'ok, no coverage table here\'); process.exit(0)"'
    } });

    // Act
    const res = require(MOD).runVerify(dir);

    // Assert — unmeasured coverage against a declared floor fails closed.
    assert.equal(res.checks.tests.coverage, null);
    assert.equal(res.passed, false, 'a declared floor with no measurable coverage must fail closed');
    assert.ok(
      res.errors.some((e) => /no coverage figure|unmeasured is NOT a pass/i.test(e)),
      `the failure must name the unmeasured coverage; errors: ${JSON.stringify(res.errors)}`
    );
  });

  it('H6: a passing project with above-floor Node-native coverage PASSES (happy path)', () => {
    // Arrange — floor 40, node-native table reporting 99.50%.
    write('.ctoc/coverage-baseline.json', JSON.stringify({ minPct: 40 }));
    pkg({ name: 'goodcov', version: '1.0.0', scripts: {
      test: 'node -e "console.log(\'# all files | 99.50 |\'); process.exit(0)"'
    } });

    // Act
    const res = require(MOD).runVerify(dir);

    // Assert
    assert.equal(res.checks.tests.coverage, 99.5);
    assert.equal(res.passed, true, `above-floor coverage must pass; errors: ${JSON.stringify(res.errors)}`);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Cluster I — DEFECT 1 (CRITICAL, coverage spoof): parseCoveragePct used a
// non-global `.match()` which returns the FIRST match. Node prints the REAL
// coverage-summary row LAST (after all test output), so any earlier line reading
// `all files | 100` in test stdout wins over the real `# all files | 40.1 |`
// summary → below-floor coverage passes green AND is copied verbatim into the
// durable VERIFY artifact that Gate 3 trusts. The fix takes the LAST match for
// EVERY format parseCoveragePct handles (mirroring test-gate.js intent).
// ─────────────────────────────────────────────────────────────────────────────
describe('parseCoveragePct — the LAST (real) summary row wins over an earlier spoof (DEFECT 1)', () => {
  it('I1: an early "all files | 100" then a real "# all files | 40.1" → 40.1 (last match)', () => {
    const polluted = [
      'some test log line mentioning all files | 100 in prose',
      'all files | 100',                 // an early stray/spoof row
      'ok 1 - a passing assertion',
      '# all files | 40.1 |  30.0 | 25.0 | 1-9'  // the REAL summary, emitted last
    ].join('\n');
    assert.equal(require(MOD).parseCoveragePct(polluted), 40.1,
      'the real summary is emitted last; the last "all files" match must win');
  });

  it('I2: an early Istanbul "All files | 100 |" then a real "All files | 42 |" → 42 (last match)', () => {
    const polluted = 'All files | 100 |\n...more output...\nAll files |     42 |';
    assert.equal(require(MOD).parseCoveragePct(polluted), 42);
  });

  it('I3: multiple "Lines: NN%" rows → the last one wins', () => {
    assert.equal(require(MOD).parseCoveragePct('Lines: 100%\n...\nLines: 55.5%'), 55.5);
  });
});

describe('runVerify — a spoofed early coverage row does not defeat the floor (DEFECT 1)', () => {
  it('I4: 99 floor, test prints "all files | 100" early then real "# all files | 40.1" last → VERIFY FAILS', () => {
    // Arrange — the exact executed repro: an early spoof row, then the real
    // Node-native summary row below the floor, printed last.
    write('.ctoc/coverage-baseline.json', JSON.stringify({ minPct: 99 }));
    pkg({ name: 'spoofcov', version: '1.0.0', scripts: {
      test: 'node -e "console.log(\'all files | 100\'); console.log(\'# all files | 40.1 |\'); process.exit(0)"'
    } });

    // Act
    const res = require(MOD).runVerify(dir);

    // Assert — the real (last) figure is parsed, below floor → VERIFY fails.
    assert.equal(res.checks.tests.coverage, 40.1, 'the real last-emitted coverage row must win over the early spoof');
    assert.equal(res.passed, false, 'below-floor coverage must fail VERIFY even when an earlier row reads 100');
    assert.ok(res.errors.some((e) => /below the project floor/i.test(e)), `errors: ${JSON.stringify(res.errors)}`);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Cluster J — DEFECT 2 (CRITICAL, a declared suite that cannot launch is silently
// dropped): a `test` candidate is presence-qualified by npmScriptExists (the
// script STRING exists), but when the script's INNER binary is missing, `npm test`
// spawn-fails (exit 127) → tryCommands treats it as NOT-RUN with no error → the
// test category is recorded {ran:false, applicable:false}. One passing lint then
// carries VERIFY green while the project's OWN declared suite never ran. The fix
// distinguishes a PRESENCE-QUALIFIED (project-owned npm script) candidate that
// could not launch — a REAL failure — from a genuinely-absent OPTIONAL tool.
// ─────────────────────────────────────────────────────────────────────────────
/** An execSync failure that mimics the shell's command-not-found exit status 127. */
function exit127Error(msg) {
  return Object.assign(new Error('exit 127'), { status: 127, stderr: msg, stdout: '' });
}
describe('runVerify — a declared npm test whose binary is missing FAILS (DEFECT 2)', () => {
  it('J1: lint passes, npm test spawn-fails (127) → VERIFY FAILS, tests not recorded as not-applicable', () => {
    // Arrange — the project declares BOTH lint and test scripts (presence-qualified),
    // lint passes, but the test script's inner binary is missing → npm test exits 127.
    pkg({ name: 'app', version: '1.0.0', scripts: { lint: 'x', test: 'y' } });
    const execSync = (command) => {
      if (/ctoc quality/.test(command)) throw missingToolError('ctoc: command not found');
      if (/npm run lint/.test(command)) return 'lint clean';
      if (/npm test/.test(command)) throw exit127Error('sh: this-binary-does-not-exist-xyz: command not found');
      throw realFailureError(`unexpected: ${command}`);
    };

    // Act
    const res = withFakedBoundary(
      { execSync, driveAppSync: noApp },
      (mod) => mod.runVerify(dir)
    );

    // Assert — the declared suite could not launch → a REAL failure, NOT a passed-on-lint.
    assert.equal(res.passed, false, 'a declared test suite that fails to start must fail VERIFY, not pass on lint');
    assert.notEqual(res.checks.tests.applicable, false,
      'a presence-qualified test candidate that spawn-failed must NOT be recorded as not-applicable');
    assert.equal(res.checks.tests.passed, false);
    assert.ok(
      res.errors.some((e) => /could not launch|failed to start/i.test(e)),
      `the failure must name the launch failure; errors: ${JSON.stringify(res.errors)}`
    );
  });

  it('J2: NO-REGRESSION — a project with NO test script at all is still applicable:false (not a failure)', () => {
    // Arrange — only a passing lint script; no test/typecheck declared, no app.
    pkg({ name: 'nolint', version: '1.0.0', scripts: { lint: 'x' } });
    const execSync = (command) => {
      if (/ctoc quality/.test(command)) throw missingToolError('ctoc: command not found');
      if (/npm run lint/.test(command)) return 'lint clean';
      throw realFailureError(`unexpected: ${command}`);
    };

    // Act
    const res = withFakedBoundary(
      { execSync, driveAppSync: noApp },
      (mod) => mod.runVerify(dir)
    );

    // Assert — no declared test candidate → applicable:false (a project with no
    // test script is not a VERIFY failure by this axis), and lint carries the pass.
    assert.equal(res.checks.tests.applicable, false, 'no declared test script → not-applicable, unchanged');
    assert.equal(res.passed, true, 'a project with a passing lint and no test script still passes');
    assert.ok(!res.errors.some((e) => /could not launch|failed to start/i.test(e)),
      `no launch-failure error when nothing was declared; errors: ${JSON.stringify(res.errors)}`);
  });

  it('J3: NO-REGRESSION — a genuinely-absent OPTIONAL tool (ruff) is still a benign skip, not a failure', () => {
    // Arrange — a Python project whose ruff/mypy/pytest are NOT installed, but a
    // node lint script passes. The optional tools are toolExists-qualified; their
    // absence must remain a benign not-applicable, never a launch failure.
    write('pyproject.toml', '[project]\nname = "p"\n');
    pkg({ name: 'mixed', version: '1.0.0', scripts: { lint: 'x' } });
    const spawnSync = () => ({ error: missingToolError('ENOENT') }); // ruff/mypy/pytest absent
    const execSync = (command) => {
      if (/ctoc quality/.test(command)) throw missingToolError('ctoc: command not found');
      if (/npm run lint/.test(command)) return 'lint clean';
      throw realFailureError(`unexpected: ${command}`);
    };

    // Act
    const res = withFakedBoundary(
      { execSync, spawnSync, driveAppSync: noApp },
      (mod) => mod.runVerify(dir)
    );

    // Assert — the absent optional test tool is applicable:false, not a launch failure.
    assert.equal(res.checks.tests.applicable, false, 'absent optional pytest → benign not-applicable');
    assert.equal(res.passed, true, 'a passing lint with only absent optional tools still passes');
    assert.ok(!res.errors.some((e) => /could not launch|failed to start/i.test(e)),
      `an absent optional tool must not be a launch failure; errors: ${JSON.stringify(res.errors)}`);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Cluster K — DEFECT 3 (HIGH, TAP failures on stdout with exit 0 pass):
// tryCommand sets success solely from execSync not throwing (exit 0).
// applyTestQualityContracts parses stdout for skipped/todo and coverage (proving
// the author does NOT fully trust the exit code) but NEVER parses failure counts.
// A runner reporting failures on stdout but exiting 0 (jest --passWithNoTests, a
// wrapping `|| true`, `set +e`, a custom reporter) passes. The fix parses the TAP
// `# fail N` summary and fails closed, mirroring the existing skipped-count logic.
// ─────────────────────────────────────────────────────────────────────────────
describe('runVerify — TAP failures on stdout with exit 0 must FAIL (DEFECT 3)', () => {
  it('K1: test prints "not ok"/"# fail 2" then exits 0 → VERIFY FAILS', () => {
    // Arrange — the exact executed repro: TAP failures on stdout, exit 0.
    pkg({ name: 'tapfail', version: '1.0.0', scripts: {
      test: 'node -e "console.log(\'not ok 1\'); console.log(\'not ok 2\'); console.log(\'# fail 2\'); process.exit(0)"'
    } });

    // Act
    const res = require(MOD).runVerify(dir);

    // Assert — reported failures fail the gate despite a zero exit code.
    assert.equal(res.passed, false, 'reported test failures must fail VERIFY even when the runner exits 0');
    assert.equal(res.checks.tests.passed, false);
    assert.ok(
      res.errors.some((e) => /failing test/i.test(e)),
      `the failure must name the failing tests; errors: ${JSON.stringify(res.errors)}`
    );
  });

  it('K2: NO-REGRESSION — a genuinely-passing suite reporting "# fail 0" still PASSES', () => {
    // Arrange — a node --test-shaped run that honestly reports zero failures.
    pkg({ name: 'tapok', version: '1.0.0', scripts: {
      test: 'node -e "console.log(\'ok 1\'); console.log(\'# pass 1\'); console.log(\'# fail 0\'); process.exit(0)"'
    } });

    // Act
    const res = require(MOD).runVerify(dir);

    // Assert — "# fail 0" is not a failure; the suite passes.
    assert.equal(res.passed, true, `# fail 0 must not fail the gate; errors: ${JSON.stringify(res.errors)}`);
    assert.equal(res.checks.tests.passed, true);
  });
});
