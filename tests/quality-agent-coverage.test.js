'use strict';

/**
 * QUALITY-AGENT COVERAGE — hard, failure-first, mutation-resistant tests for
 * src/lib/quality-agent.js. Targets the branches the fleet-wiring suite leaves
 * uncovered, and pins NON-OBVIOUS behavior: every kept test goes RED if a
 * happy-path-only implementation were substituted (error/throw paths, the exact
 * per-framework command string, boundary/severity classification, the ship-gate
 * default, the LOUD-skip degradation when a scanner throws mid-fleet).
 *
 * DISCIPLINE (mirrors quality-fleet-wiring.test.js):
 *  - No test doubles for the orchestrator's OWN logic. The security orchestrator
 *    IS the code under test; its degradation contract ("a scanner that throws
 *    becomes a LOUD skip, never a crash and never a silent pass") is exercised by
 *    injecting a fault at the collaborator boundary (stubbing a scanner's run() to
 *    throw) — the same boundary-stub technique the sibling suite uses.
 *  - The only mocked seam is child_process (execSync/execFileSync) — the TRUE
 *    process boundary — to capture the exact command a runner builds and to make
 *    tool availability deterministic. Real temp-dir repos otherwise.
 *  - Cleanup in finally/after; cross-platform (path.join, os.tmpdir, no shells).
 *
 * Secret fixtures are GENERIC high-entropy AWS-shaped values (no real provider
 * token), identical in shape to the sibling suite's PLANTED_AWS_KEY.
 *
 * DOCUMENTED UNREACHABLE (never faked):
 *  - main() (1010-1080) and the `require.main === module` script guard (1085-1091)
 *    are NOT on the module's export surface, so they cannot be driven in-process;
 *    a subprocess run would not be captured by --experimental-test-coverage. Left
 *    uncovered by design rather than green-washed with a no-op test.
 *  - pushToRemote's rejected/non-fast-forward string branch (918-924) is
 *    unreachable via real git: runCommand uses stdio:'inherit' (silent:false), so
 *    git's "! [rejected]" text goes to the terminal and err.message is only
 *    "Command failed: git push" — the string match can never fire from a real
 *    subprocess. It is defensive code for a hypothetical stderr-capturing caller.
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const cp = require('node:child_process');
const { execFileSync } = cp;

const qualityAgent = require('../src/lib/quality-agent');

// The scanner classes the orchestrator constructs — same module instances it uses,
// so a prototype stub here reaches the live runSecurityScan path.
const { SecretsScanner } = require('../src/lib/secrets-scanner');
const { DependencyAuditor } = require('../src/lib/dependency-auditor');
const { SASTRunner } = require('../src/lib/sast-runner');
const { SCARunner } = require('../src/lib/sca-runner');
const { MigrationSafetyChecker } = require('../src/lib/migration-safety-checker');
const { FrameworkSecurityChecker } = require('../src/lib/framework-security-checker');

// A generic AWS Access Key ID shape (AKIA + 16 upper-alnum), no placeholder
// substring so the scanner's placeholder filter keeps it. NOT a real credential.
const PLANTED_AWS_KEY = 'AKIAJKQR7MNPZ2WXVBDF';

function mkTmp(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}
function rm(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ }
}
function git(args, cwd) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'ctoc-test', GIT_AUTHOR_EMAIL: 'ctoc@test.invalid',
      GIT_COMMITTER_NAME: 'ctoc-test', GIT_COMMITTER_EMAIL: 'ctoc@test.invalid'
    }
  }).trim();
}

/** Capture console.log output while fn runs; always restore. */
async function captureLog(fn) {
  const orig = console.log;
  const lines = [];
  console.log = (...a) => lines.push(a.map(String).join(' '));
  let res;
  try {
    res = await fn();
  } finally {
    console.log = orig;
  }
  return { res, out: lines.join('\n') };
}

/** Run fn with cwd temporarily set to dir; always restore. */
async function withCwd(dir, fn) {
  const orig = process.cwd();
  process.chdir(dir);
  try {
    return await fn();
  } finally {
    process.chdir(orig);
  }
}

const NODE = process.execPath;
// Node one-liner commands that behave identically on every platform.
const passCmd = (msg = '3 passed') => `"${NODE}" -e "console.log('${msg}')"`;
const failCmd = () => `"${NODE}" -e "process.exit(1)"`;

// ---------------------------------------------------------------------------
// child_process spy seam — capture the EXACT command a runner builds, and make
// its execution succeed deterministically. quality-agent destructures execSync at
// load, so we reload it AFTER installing the spy. This is the true process
// boundary, not orchestrator logic.
// ---------------------------------------------------------------------------
const REAL_EXECSYNC = cp.execSync;
const QA_PATH = require.resolve('../src/lib/quality-agent');

// ---------------------------------------------------------------------------
// child_process argv spy seam — the INJECTION-SAFE boundary. The runners start a test
// program with spawnSync and an ARGV VECTOR (shell:false), so a test-file path from
// coverage-map.json can never be interpreted by a shell. This harness fakes BOTH process
// calls the module takes at load, then reloads it:
//  - spawnSync records {bin, args, opts} and answers through the case's own function. A
//    returned string is read as { status: 0, stdout: <the string>, stderr: '' }, a
//    returned object is the spawnSync result itself, and a thrown error (the shape
//    execFileSync threw) becomes { status: 1, stdout: <its stdout>, stderr: '' }.
//  - execFileSync hands `git` to the real execFileSync; any other program is recorded and
//    refused with `runner started through execFileSync`, so no real runner ever starts
//    (`npm test` would run this repository's gated suite again, `npx jest` could install
//    from the network).
//  - execSync is stubbed harmlessly (the shell path).
// "The fake saw no process start" means neither fake recorded a call.
// ---------------------------------------------------------------------------
const REAL_EXECFILESYNC = cp.execFileSync;
const REAL_SPAWNSYNC = cp.spawnSync;

function withExecSpies(impl, fn) {
  const fileCalls = [];
  const shellCalls = [];
  const execCalls = [];
  cp.spawnSync = (bin, args, opts) => {
    fileCalls.push({ bin, args, opts });
    let answer;
    try {
      answer = impl(bin, args, opts);
    } catch (err) {
      return { status: 1, signal: null, stdout: err.stdout || '', stderr: '' };
    }
    return typeof answer === 'string' ? { status: 0, signal: null, stdout: answer, stderr: '' } : answer;
  };
  cp.execFileSync = (bin, args, opts) => {
    if (bin === 'git') return REAL_EXECFILESYNC(bin, args, opts);
    execCalls.push({ bin, args, opts });
    throw new Error('runner started through execFileSync');
  };
  cp.execSync = (command) => {
    shellCalls.push(command);
    return '';
  };
  delete require.cache[QA_PATH];
  const qa = require(QA_PATH);
  const restore = () => {
    cp.spawnSync = REAL_SPAWNSYNC;
    cp.execFileSync = REAL_EXECFILESYNC;
    cp.execSync = REAL_EXECSYNC;
    delete require.cache[QA_PATH];
  };
  let out;
  try {
    out = fn(qa, fileCalls, shellCalls, execCalls);
  } catch (err) {
    restore();
    throw err;
  }
  if (out && typeof out.then === 'function') {
    return out.then((v) => { restore(); return { fileCalls, shellCalls, execCalls, ...v }; },
      (err) => { restore(); throw err; });
  }
  restore();
  return { fileCalls, shellCalls, execCalls, ...out };
}

/** Run `fn` with process.platform and process.execPath replaced, restoring both. */
async function withPlatform(platform, execPath, fn) {
  const savedPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
  const savedExecPath = Object.getOwnPropertyDescriptor(process, 'execPath');
  Object.defineProperty(process, 'platform', { value: platform, configurable: true });
  if (execPath) Object.defineProperty(process, 'execPath', { value: execPath, configurable: true, writable: true });
  try {
    return await fn();
  } finally {
    Object.defineProperty(process, 'platform', savedPlatform);
    Object.defineProperty(process, 'execPath', savedExecPath);
  }
}

// ---------------------------------------------------------------------------
// parseArgs — the ship-gate-safe defaults and every recognized flag (63-81)
// ---------------------------------------------------------------------------
describe('parseArgs', () => {
  it('defaults onSuccess to "none" (NEVER "push") so a machine cannot ship by default', () => {
    // The ship-gate red line: the default must not be 'push'. A mutant defaulting to
    // 'push' would fail this exact assertion.
    assert.deepEqual(qualityAgent.parseArgs([]), { triggeredBy: 'manual', onSuccess: 'none', verbose: false });
  });

  it('parses --triggered-by, --on-success and --verbose from argv', () => {
    const args = qualityAgent.parseArgs(['--triggered-by=commit-hook', '--on-success=push', '--verbose']);
    assert.equal(args.triggeredBy, 'commit-hook');
    assert.equal(args.onSuccess, 'push');
    assert.equal(args.verbose, true);
  });

  it('treats -v as verbose and leaves defaults intact for an unrecognized flag', () => {
    const args = qualityAgent.parseArgs(['-v', '--not-a-flag']);
    assert.equal(args.verbose, true);
    assert.equal(args.triggeredBy, 'manual');
    assert.equal(args.onSuccess, 'none');
  });
});

// ---------------------------------------------------------------------------
// runCommand — throw-to-fail vs allowFail (100-112)
// ---------------------------------------------------------------------------
describe('runCommand', () => {
  it('re-throws on a non-zero exit when allowFail is NOT set (callers must not mistake failure for success)', () => {
    assert.throws(() => qualityAgent.runCommand(failCmd(), { silent: true }));
  });

  it('returns {success:false} (never throws) when allowFail is set', () => {
    const res = qualityAgent.runCommand(failCmd(), { silent: true, allowFail: true });
    assert.equal(res.success, false);
    assert.equal(typeof res.error, 'string');
  });

  it('trims stdout on success', () => {
    const res = qualityAgent.runCommand(passCmd('hello'), { silent: true, allowFail: true });
    assert.equal(res.success, true);
    assert.equal(res.output, 'hello'); // trimmed — a mutant dropping .trim() would leave "\n"
  });
});

// ---------------------------------------------------------------------------
// runLint / runTypecheck — fail loudly, skip absent tools (155-197)
// ---------------------------------------------------------------------------
describe('runLint', () => {
  it('returns passed:false, errors:1 when a linter exits non-zero', async () => {
    const { res } = await captureLog(() => qualityAgent.runLint({ js: { lint: failCmd() } }));
    assert.equal(res.passed, false);
    assert.equal(res.errors, 1);
  });

  it('passes and skips a language with no lint command', async () => {
    const { res } = await captureLog(() => qualityAgent.runLint({
      js: { lint: passCmd('lint ok') },
      go: { lint: null } // the `continue` branch
    }));
    assert.equal(res.passed, true);
    assert.equal(res.errors, 0);
  });
});

describe('runTypecheck', () => {
  it('returns passed:false, errors:1 when a typechecker exits non-zero', async () => {
    const { res } = await captureLog(() => qualityAgent.runTypecheck({ ts: { typecheck: failCmd() } }));
    assert.equal(res.passed, false);
    assert.equal(res.errors, 1);
  });

  it('passes and skips a language with no typecheck command', async () => {
    const { res } = await captureLog(() => qualityAgent.runTypecheck({
      ts: { typecheck: passCmd('types ok') },
      c: { typecheck: null }
    }));
    assert.equal(res.passed, true);
    assert.equal(res.errors, 0);
  });
});

// ---------------------------------------------------------------------------
// runSpecificTests — the EXACT per-framework ARGV VECTOR is pinned via the
// execFileSync spy. jest/vitest/pytest/go run with shell:false so a test-file path
// (which originates from coverage-map.json — arbitrary, unsanitized strings) can
// NEVER be interpreted by a shell. A mutant that rebuilds a shell STRING, or swaps a
// framework's argv, goes red here — including the command-injection regression.
// ---------------------------------------------------------------------------
describe('runSpecificTests — per-framework argv construction (injection-safe process boundary)', () => {
  // The four cases below find or fake the jest or vitest call by its first argument, which is
  // the program's own name only where npx starts by name; on Windows node starts npm's own
  // npx-cli.js (case g pins that launch). So they run with the platform set to Linux.
  it('SECURITY (RCE regression): a shell-metacharacter test path is a LITERAL argv element, never interpolated into a shell string', async () => {
    // A path like this arrives verbatim from .ctoc/state/coverage-map.json (entry.tests)
    // with NO sanitization. On the old string-interpolation path
    // (`npx jest ${testFiles.join(' ')}` → execSync → /bin/sh -c) the `$(...)` was a
    // command substitution and executed arbitrary code on every /ctoc:push. The fix
    // passes it as one raw argv element to execFileSync (shell:false), so no shell
    // ever sees it. This test fails LOUDLY against the vulnerable string code (which
    // never calls execFileSync and leaks the payload into a shell string).
    const evil = 'a$(touch /tmp/ctoc_pwn).test.js';
    await withExecSpies(() => '0 passed', (qa, fileCalls, shellCalls) => withPlatform('linux', null, () => {
      qa.runSpecificTests({ js: { test: 'ignored', testFramework: 'jest' } }, [evil]);

      const jestCall = fileCalls.find(c => Array.isArray(c.args) && c.args[0] === 'jest');
      assert.ok(jestCall,
        `jest must run via an execFileSync ARGV vector, not a shell string. execFile calls=${JSON.stringify(fileCalls)}; shell calls=${JSON.stringify(shellCalls)}`);
      assert.ok(jestCall.args.includes(evil),
        'the raw, unescaped path must be a standalone argv element (a shell never interprets it)');
      assert.equal(jestCall.opts && jestCall.opts.shell, false,
        'execFileSync must run with shell:false so no shell interprets the path');
      // And the payload must never have reached the shell-string (execSync) path.
      assert.ok(!shellCalls.some(c => c.includes(evil)),
        `the malicious path must never appear in a shell command string; shell calls=${JSON.stringify(shellCalls)}`);
      return {};
    }));
  });

  it('builds an `npx jest <files>` ARGV vector for the jest framework', async () => {
    await withExecSpies(() => '5 passed', (qa, fileCalls) => withPlatform('linux', null, () => {
      const res = qa.runSpecificTests({ js: { test: 'ignored', testFramework: 'jest' } }, ['a.test.js', 'b.test.js']);
      assert.equal(res.passed, true);
      const c = fileCalls.find(x => x.args && x.args[0] === 'jest');
      assert.ok(c, `expected a spawnSync npx jest call; got ${JSON.stringify(fileCalls)}`);
      // The launcher contract (Decision 35): `npx` by name off Windows; on Windows node runs
      // npm's own npx-cli.js, which case g below pins with a replaced platform.
      assert.equal(c.bin, 'npx', 'jest launches via npx');
      assert.deepEqual(c.args, ['jest', 'a.test.js', 'b.test.js']);
      assert.equal(c.opts && c.opts.shell, false);
      return {};
    }));
  });

  it('builds an `npx vitest run <files>` ARGV vector for the vitest framework', async () => {
    await withExecSpies(() => '', (qa, fileCalls) => withPlatform('linux', null, () => {
      qa.runSpecificTests({ js: { test: 'ignored', testFramework: 'vitest' } }, ['a.test.js']);
      const c = fileCalls.find(x => x.args && x.args[0] === 'vitest');
      assert.ok(c, `expected an execFileSync npx vitest call; got ${JSON.stringify(fileCalls)}`);
      assert.equal(c.bin, 'npx', 'vitest launches via npx by name');
      assert.deepEqual(c.args, ['vitest', 'run', 'a.test.js']);
      assert.equal(c.opts && c.opts.shell, false);
      return {};
    }));
  });

  it('builds a `pytest <files>` ARGV vector for the pytest framework', () => {
    withExecSpies(() => '', (qa, fileCalls) => {
      qa.runSpecificTests({ py: { test: 'ignored', testFramework: 'pytest' } }, ['test_a.py']);
      const c = fileCalls.find(x => x.bin === 'pytest');
      assert.ok(c, `expected an execFileSync pytest call; got ${JSON.stringify(fileCalls)}`);
      assert.deepEqual(c.args, ['test_a.py']);
      assert.equal(c.opts && c.opts.shell, false);
      return {};
    });
  });

  it('derives DEDUPED, POSIX (forward-slash) go package paths even from backslash inputs, as an ARGV vector', () => {
    withExecSpies(() => '', (qa, fileCalls) => {
      // Two files in the SAME package, one with Windows backslashes — must collapse to a
      // single `./pkg/sub/...` with forward slashes, never `./pkg\sub/...`.
      qa.runSpecificTests({ go: { test: 'ignored', testFramework: 'go' } },
        ['pkg/sub/a_test.go', 'pkg\\sub\\b_test.go']);
      const c = fileCalls.find(x => x.bin === 'go');
      assert.ok(c, `expected an execFileSync go test call; got ${JSON.stringify(fileCalls)}`);
      assert.deepEqual(c.args, ['test', './pkg/sub/...'],
        'go packages must be deduped and posix-normalized regardless of input separators');
      for (const a of c.args) assert.ok(!a.includes('\\'), 'no backslashes may leak into a go import path');
      assert.equal(c.opts && c.opts.shell, false);
      return {};
    });
  });

  it('falls back to langTools.test as an ARGV VECTOR (no shell) when no framework is named, and parses the pass count', () => {
    // CONTRACT CHANGE (plan 00203): langTools.test is a CONFIGURED command from an
    // agent-writable .ctoc config, so the full-suite fallback now runs it as an argv
    // vector (runConfiguredCommand → execFileSync, shell:false), NOT via execSync. The
    // old assertion (`execSync calls include 'my-custom-runner'`) asserted the SHELL path
    // this fix removes and is re-pointed at the argv path — a tightening, not a weakening:
    // it now proves the configured command never reaches a shell.
    withExecSpies(() => '7 passed', (qa, fileCalls, shellCalls) => {
      const res = qa.runSpecificTests({ js: { test: 'my-custom-runner' } }, ['a.test.js']);
      const c = fileCalls.find(x => x.bin === 'my-custom-runner');
      assert.ok(c, `the fallback must run langTools.test via execFileSync argv; got ${JSON.stringify(fileCalls)}`);
      assert.deepEqual(c.args, [], 'a single-token configured command has no args');
      assert.equal(c.opts && c.opts.shell, false, 'shell:false so no shell interprets the configured command');
      assert.ok(!shellCalls.includes('my-custom-runner'),
        'the configured command must NEVER reach the execSync shell path');
      assert.equal(res.passCount, 7); // parsed from "7 passed"
      return {};
    });
  });

  it('returns a failing result (failed:1, passCount preserved) when a framework command exits non-zero', async () => {
    const { fileCalls } = await withExecSpies((bin, args) => {
      if (args && args[0] === 'jest') { const e = new Error('boom'); e.stdout = 'nope'; throw e; }
      return '';
    }, (qa) => withPlatform('linux', null, () => {
      const res = qa.runSpecificTests({ js: { test: 'ignored', testFramework: 'jest' } }, ['a.test.js']);
      assert.equal(res.passed, false);
      assert.equal(res.failed, 1);
      assert.equal(res.passCount, 0);
      return {};
    }));
    assert.equal(fileCalls.length, 1, 'the one jest call was the one that failed');
  });

  it('short-circuits to a NON-pass (undetermined) before running anything', async () => {
    const res = await qualityAgent.runSpecificTests({ js: { test: null, testUndetermined: true } }, ['a.test.js']);
    assert.equal(res.passed, false);
    assert.equal(res.undetermined, true);
  });
});

// ---------------------------------------------------------------------------
// runFullTests — flaky detection, plain failure, pass-count parse (287-327)
// ---------------------------------------------------------------------------
describe('runFullTests', () => {
  it('sets flaky:1 (zero-tolerance) when failing output contains a flaky indicator', async () => {
    const { res } = await captureLog(() => qualityAgent.runFullTests({
      js: { test: `"${NODE}" -e "console.log('1 flaky test detected'); process.exit(1)"` }
    }));
    assert.equal(res.passed, false);
    assert.equal(res.flaky, 1); // a mutant dropping the flaky check would leave 0 → red
  });

  it('sets flaky:0 for a plain failure with no flaky indicator', async () => {
    const { res } = await captureLog(() => qualityAgent.runFullTests({ js: { test: failCmd() } }));
    assert.equal(res.passed, false);
    assert.equal(res.flaky, 0);
    assert.equal(res.failed, 1);
  });

  it('parses the total pass count from a passing suite', async () => {
    const { res } = await captureLog(() => qualityAgent.runFullTests({ js: { test: passCmd('42 passed') } }));
    assert.equal(res.passed, true);
    assert.equal(res.passCount, 42);
  });
});

// ---------------------------------------------------------------------------
// runSmartTests — git-delta short-circuits and the affected-test path (341-398)
// ---------------------------------------------------------------------------
describe('runSmartTests', () => {
  it('runs the FULL suite for a one-commit repo (HEAD~1 absent), NEVER a zero-test cached pass', async () => {
    // CONTRACT CHANGE (plan 00208): a single-commit / shallow-clone repo (HEAD~1 does not
    // resolve) used to return { passed:true, passCount:0, cached:true } — a PASS over ZERO
    // tests run, the false-green class. Test selection now derives the push delta from
    // getPushDeltaBlobs (no upstream → the whole tree), which contains unmapped files and
    // escalates to the full suite. The old assertion (`res.cached === true`) asserted the
    // BUG and is replaced, not weakened: the runner MUST actually run.
    const dir = mkTmp('ctoc-smart-nochange-');
    try {
      git(['init'], dir);
      fs.writeFileSync(path.join(dir, 'a.js'), 'module.exports = 1;\n');
      git(['add', '-A'], dir);
      git(['commit', '-m', 'c1'], dir);

      const { res } = await withCwd(dir, () =>
        captureLog(() => qualityAgent.runSmartTests({ js: { test: passCmd() } })));
      assert.equal(res.passed, true);
      assert.ok(!res.cached, 'a shallow/single-commit repo must run the full suite, not the cached shortcut');
      assert.equal(res.passCount, 3, 'the real runner count must surface (proves the suite ran)');
    } finally {
      rm(dir);
    }
  });

  it('goes PAST the cached short-circuit into real selection when a file changed, and stays green for a green suite', async () => {
    const dir = mkTmp('ctoc-smart-change-');
    try {
      git(['init'], dir);
      fs.writeFileSync(path.join(dir, 'a.js'), 'module.exports = 1;\n');
      git(['add', '-A'], dir);
      git(['commit', '-m', 'c1'], dir);
      fs.writeFileSync(path.join(dir, 'b.js'), 'module.exports = 2;\n');
      git(['add', '-A'], dir);
      git(['commit', '-m', 'c2 add b'], dir);

      const { res } = await withCwd(dir, () =>
        captureLog(() => qualityAgent.runSmartTests({ js: { test: passCmd() } })));
      assert.equal(res.passed, true);
      // The distinguishing assertion: a real delta must NOT return via the cached branch.
      assert.ok(!res.cached, 'a non-empty delta must be processed, not short-circuited as cached');
    } finally {
      rm(dir);
    }
  });

  it('surfaces auto-undetermined tests as a NON-pass BEFORE touching git (guard order)', async () => {
    const { res } = await captureLog(() =>
      qualityAgent.runSmartTests({ js: { test: null, testUndetermined: true } }));
    assert.equal(res.passed, false);
    assert.equal(res.undetermined, true);
  });

  it('runs the SELECTED affected tests (heuristic-matched), then returns cache-valid on an unchanged re-run', async () => {
    // A co-located src.test.js gives the changed src.js a heuristic test match, so
    // findAffectedTests returns tests>0 WITHOUT requiresFullSuite → the runSpecificTests
    // affected-selection branch runs. The first (successful) run updates the hash cache;
    // an immediate re-run finds no CONTENT change and returns the cache-valid short-circuit.
    const dir = mkTmp('ctoc-smart-affected-');
    try {
      git(['init'], dir);
      fs.writeFileSync(path.join(dir, 'src.js'), 'module.exports = 1;\n');
      fs.writeFileSync(path.join(dir, 'src.test.js'), '// colocated test\n');
      git(['add', '-A'], dir);
      git(['commit', '-m', 'c1'], dir);
      fs.writeFileSync(path.join(dir, 'src.js'), 'module.exports = 2;\n'); // changed
      git(['add', '-A'], dir);
      git(['commit', '-m', 'c2 edit src'], dir);

      await withCwd(dir, async () => {
        const first = await captureLog(() => qualityAgent.runSmartTests({ js: { test: passCmd() } }));
        assert.equal(first.res.passed, true, 'the affected-selection path must pass for a green suite');
        assert.ok(!first.res.cached, 'the first run processes the delta (not the cached short-circuit)');

        // Re-run with no file change: content hashes now match the cache → cache-valid branch.
        const second = await captureLog(() => qualityAgent.runSmartTests({ js: { test: passCmd() } }));
        assert.equal(second.res.passed, true);
        assert.equal(second.res.cached, true, 'an unchanged re-run must return the cache-valid short-circuit');
      });
    } finally {
      rm(dir);
    }
  });
});

// ---------------------------------------------------------------------------
// security delta scope (getPushChangedFiles) — no-git null + no-upstream all-tracked
// (416-441)
// ---------------------------------------------------------------------------
describe('runSecurityScan delta scope', () => {
  it('falls back to a whole-project scan (still catches the secret) when projectRoot is NOT a git repo', async () => {
    const dir = mkTmp('ctoc-nogit-');
    try {
      fs.writeFileSync(path.join(dir, 'config.js'), `const k = "${PLANTED_AWS_KEY}";\n`);
      const { res } = await captureLog(() => qualityAgent.runSecurityScan(null, { projectRoot: dir }));
      assert.ok(res.critical >= 1, 'a non-git delta must fall back to whole-project and still find the secret');
      assert.equal(res.passed, false);
    } finally {
      rm(dir);
    }
  });

  it('treats every tracked file as the delta when the branch has no upstream', async () => {
    const dir = mkTmp('ctoc-noupstream-');
    try {
      git(['init'], dir);
      fs.writeFileSync(path.join(dir, 'config.js'), `const k = "${PLANTED_AWS_KEY}";\n`);
      git(['add', '-A'], dir);
      git(['commit', '-m', 'c1'], dir);
      const { res } = await captureLog(() => qualityAgent.runSecurityScan(null, { projectRoot: dir }));
      assert.ok(res.critical >= 1, 'the no-upstream (git ls-files) delta must include the tracked secret');
      assert.equal(res.passed, false);
    } finally {
      rm(dir);
    }
  });
});

// ---------------------------------------------------------------------------
// Security orchestrator — a scanner throwing mid-fleet is a LOUD skip, never a
// crash and never a silent pass (573-576, 626-629, 681-684, 769-772, 801-804, 835-838)
// ---------------------------------------------------------------------------
describe('runSecurityScan degradation — a thrown scanner becomes a LOUD skip', () => {
  let dir;
  before(() => {
    dir = mkTmp('ctoc-thrower-');
    fs.writeFileSync(path.join(dir, 'hello.js'), 'module.exports = 1;\n');
  });
  after(() => rm(dir));

  async function assertLoudSkip(proto, method, stub, matcher) {
    const orig = proto[method];
    proto[method] = stub;
    try {
      const { res } = await captureLog(() =>
        qualityAgent.runSecurityScan(null, { projectRoot: dir, allFiles: true }));
      assert.ok(Array.isArray(res.skipped), 'a thrown scanner must not crash the scan');
      assert.ok(res.skipped.some((s) => matcher.test(s)),
        `the thrown scanner must be recorded as a loud skip; got ${JSON.stringify(res.skipped)}`);
      return res;
    } finally {
      proto[method] = orig;
    }
  }

  it('SECRETS scanner run() throws → loud skip', async () => {
    await assertLoudSkip(SecretsScanner.prototype, 'run',
      async function () { throw new Error('secrets boom'); },
      /secrets scan skipped \(error, NOT a pass\)/i);
  });

  it('DEPENDENCY auditor throws → loud skip', async () => {
    await assertLoudSkip(DependencyAuditor.prototype, 'detectPackageManagers',
      function () { throw new Error('dep boom'); },
      /dependency audit skipped \(error, NOT a pass\)/i);
  });

  it('SAST runner throws → loud skip', async () => {
    await assertLoudSkip(SASTRunner.prototype, 'detectLanguages',
      function () { throw new Error('sast boom'); },
      /SAST skipped \(error, NOT a pass\)/i);
  });

  it('SCA runner throws → loud skip', async () => {
    await assertLoudSkip(SCARunner.prototype, 'detectLanguages',
      function () { throw new Error('sca boom'); },
      /SCA skipped \(error, NOT a pass\)/i);
  });

  it('MIGRATION checker throws → loud skip', async () => {
    await assertLoudSkip(MigrationSafetyChecker.prototype, 'run',
      async function () { throw new Error('migration boom'); },
      /migration safety skipped \(error, NOT a pass\)/i);
  });

  it('FRAMEWORK-SECURITY checker throws → loud skip', async () => {
    await assertLoudSkip(FrameworkSecurityChecker.prototype, 'run',
      async function () { throw new Error('framework boom'); },
      /framework security skipped \(error, NOT a pass\)/i);
  });
});

// ---------------------------------------------------------------------------
// A REAL destructive migration → REAL HIGH finding that blocks (783-799)
// ---------------------------------------------------------------------------
describe('runSecurityScan — destructive migration', () => {
  it('surfaces a DROP TABLE migration as HIGH and FAILS the gate', async () => {
    const dir = mkTmp('ctoc-migration-');
    try {
      fs.mkdirSync(path.join(dir, 'migrations'), { recursive: true });
      fs.writeFileSync(path.join(dir, 'migrations', '001_drop.sql'), 'DROP TABLE users;\n');
      const { res } = await captureLog(() =>
        qualityAgent.runSecurityScan(null, { projectRoot: dir, allFiles: true }));
      assert.ok(res.high >= 1, `DROP TABLE must bump HIGH; got high=${res.high}`);
      assert.equal(res.passed, false, 'a destructive migration must fail the gate');
      assert.match(res.details, /migration\[/, 'the destructive DDL must appear in details');
    } finally {
      rm(dir);
    }
  });

  it('does NOT flag an additive migration (CREATE TABLE) — no false positive', async () => {
    const dir = mkTmp('ctoc-migration-safe-');
    try {
      fs.mkdirSync(path.join(dir, 'migrations'), { recursive: true });
      fs.writeFileSync(path.join(dir, 'migrations', '001_add.sql'), 'CREATE TABLE users (id int);\n');
      const { res } = await captureLog(() =>
        qualityAgent.runSecurityScan(null, { projectRoot: dir, allFiles: true }));
      assert.equal(res.passed, true, 'an additive migration must not block the gate');
      assert.ok(!/migration\[/.test(res.details), 'no destructive finding for CREATE TABLE');
    } finally {
      rm(dir);
    }
  });
});

// ---------------------------------------------------------------------------
// A REAL framework-inlined secret → REAL HIGH finding that blocks (817-833)
// ---------------------------------------------------------------------------
describe('runSecurityScan — framework client-exposed secret', () => {
  it('surfaces a NEXT_PUBLIC_*_SECRET as a finding that FAILS the gate', async () => {
    // Next.js inlines NEXT_PUBLIC_-prefixed env values into the browser bundle; a
    // secret-named one is a shipped leak. A real detected Next.js repo produces a real
    // finding (no mock) — this drives the framework findings loop and severity bump.
    const dir = mkTmp('ctoc-fwsec-');
    try {
      fs.writeFileSync(path.join(dir, 'package.json'),
        JSON.stringify({ name: 'nx', version: '1.0.0', dependencies: { next: '15.0.0' } }, null, 2));
      fs.writeFileSync(path.join(dir, 'next.config.js'), 'module.exports = {};\n');
      fs.writeFileSync(path.join(dir, '.env'), 'NEXT_PUBLIC_API_SECRET=abc123def456ghi789\n');

      const { res } = await captureLog(() =>
        qualityAgent.runSecurityScan(null, { projectRoot: dir, allFiles: true }));
      assert.match(res.details, /framework-security\[/, 'the client-exposed secret must appear in details');
      assert.equal(res.passed, false, 'a shipped client-exposed secret must fail the gate');
    } finally {
      rm(dir);
    }
  });
});

// ---------------------------------------------------------------------------
// SAST result handling — a scanner that reports it did NOT run is a LOUD skip
// (664-667); real findings are aggregated into the gate tally (669-671).
// The scanner (SASTRunner) is the collaborator; its RESULT is injected at that
// boundary so the orchestrator's handling of it is what's under test.
// ---------------------------------------------------------------------------
describe('runSecurityScan — SAST result handling', () => {
  let dir;
  before(() => {
    dir = mkTmp('ctoc-sast-result-');
    fs.writeFileSync(path.join(dir, 'app.js'), 'module.exports = 1;\n'); // javascript detected
  });
  after(() => rm(dir));

  async function withSastResult(runResult, fn) {
    const oDetect = SASTRunner.prototype.detectLanguages;
    const oAvail = SASTRunner.prototype.isToolAvailable;
    const oRun = SASTRunner.prototype.run;
    SASTRunner.prototype.detectLanguages = function () { return ['javascript']; };
    SASTRunner.prototype.isToolAvailable = function () { return true; }; // make javascript scannable
    SASTRunner.prototype.run = async function () { return runResult; };
    try {
      return await fn();
    } finally {
      SASTRunner.prototype.detectLanguages = oDetect;
      SASTRunner.prototype.isToolAvailable = oAvail;
      SASTRunner.prototype.run = oRun;
    }
  }

  it('records a LOUD skip when a scannable language yields scanned:false (no scanner actually ran)', async () => {
    const { res } = await withSastResult({ scanned: false, reason: 'no scanner ran' }, () =>
      captureLog(() => qualityAgent.runSecurityScan(null, { projectRoot: dir, allFiles: true })).then(r => r));
    assert.ok(res.skipped.some((s) => /SAST skipped: no scanner ran/i.test(s)),
      `a scanned:false result must be a loud skip; got ${JSON.stringify(res.skipped)}`);
    assert.equal(res.passed, true, 'a skip is not a finding — it must not block');
  });

  it('aggregates a HIGH SAST finding into the gate tally and blocks', async () => {
    const { res } = await withSastResult(
      { findings: [{ severity: 'HIGH', rule: 'insecure-eval', file: 'app.js', line: 3 }] },
      () => captureLog(() => qualityAgent.runSecurityScan(null, { projectRoot: dir, allFiles: true })).then(r => r));
    assert.ok(res.high >= 1, `a HIGH SAST finding must bump the high tally; got high=${res.high}`);
    assert.equal(res.passed, false, 'a HIGH finding must fail the gate');
    assert.match(res.details, /sast\[HIGH\] insecure-eval/, 'the SAST finding must appear in details');
  });
});

// ---------------------------------------------------------------------------
// SAST "no supported language" branch (636) — a repo with no code at all
// ---------------------------------------------------------------------------
describe('runSecurityScan — no scannable language', () => {
  it('announces "no supported language" for SAST (and does not block) on a prose-only repo', async () => {
    const dir = mkTmp('ctoc-nolang-');
    try {
      fs.writeFileSync(path.join(dir, 'notes.txt'), 'just prose, no code here\n');
      const { res, out } = await captureLog(() =>
        qualityAgent.runSecurityScan(null, { projectRoot: dir, allFiles: true }));
      assert.match(out, /SAST: no supported language detected/, 'SAST must announce the no-language case');
      assert.equal(res.passed, true, 'a repo with nothing to scan must not block');
    } finally {
      rm(dir);
    }
  });
});

// ---------------------------------------------------------------------------
// runTieredChecks — Tier 1 gate decides push vs block (863-891)
// ---------------------------------------------------------------------------
describe('runTieredChecks', () => {
  it('returns action:push when every Tier 1 check passes on a clean project', async () => {
    const dir = mkTmp('ctoc-tier-pass-');
    try {
      fs.writeFileSync(path.join(dir, 'hello.js'), 'module.exports = 1;\n');
      // A "clean project" has DETECTED tools that RAN and PASSED (ran >= 1) — NOT an empty
      // tools map. An empty map is a zero-tool DETECTION, which plan 00209 makes NOT VERIFIED
      // (a check that never ran is not a pass), so it now correctly BLOCKS. This case asserts
      // the real clean-project path: lint + typecheck + tests all present and passing.
      const cleanProject = { js: { lint: passCmd('lint ok'), typecheck: passCmd('types ok'), test: passCmd('3 passed') } };
      const { res } = await withCwd(dir, () => captureLog(() => qualityAgent.runTieredChecks(cleanProject)));
      assert.equal(res.allPassed, true);
      assert.equal(res.action, 'push');
      assert.equal(res.tier1.lint.ran, 1, 'lint actually ran');
      assert.equal(res.tier1.typecheck.ran, 1, 'typecheck actually ran');
      assert.ok(res.tier2 && typeof res.tier2 === 'object', 'a passing Tier 1 yields a Tier 2 object');
    } finally {
      rm(dir);
    }
  });

  it('returns action:block with tier2 null when a Tier 1 check fails (lint non-zero)', async () => {
    const dir = mkTmp('ctoc-tier-block-');
    try {
      fs.writeFileSync(path.join(dir, 'hello.js'), 'module.exports = 1;\n');
      const { res } = await withCwd(dir, () =>
        captureLog(() => qualityAgent.runTieredChecks({ js: { lint: failCmd() } })));
      assert.equal(res.allPassed, false);
      assert.equal(res.action, 'block'); // a mutant returning 'push' here would ship on red → this pins it
      assert.equal(res.tier2, null);
    } finally {
      rm(dir);
    }
  });
});

// ---------------------------------------------------------------------------
// pushToRemote — the MECHANISM (908-928)
// ---------------------------------------------------------------------------
describe('pushToRemote', () => {
  it('returns true on a clean fast-forward push to a configured upstream', async () => {
    const upstream = mkTmp('ctoc-push-up-');
    const work = mkTmp('ctoc-push-work-');
    try {
      git(['init', '--bare'], upstream);
      git(['init'], work);
      git(['remote', 'add', 'origin', upstream], work);
      fs.writeFileSync(path.join(work, 'a.txt'), 'a\n');
      git(['add', '-A'], work); git(['commit', '-m', 'c1'], work);
      git(['push', '-u', 'origin', 'HEAD'], work);
      fs.writeFileSync(path.join(work, 'b.txt'), 'b\n');
      git(['add', '-A'], work); git(['commit', '-m', 'c2'], work);

      const { res } = await withCwd(work, () => captureLog(() => qualityAgent.pushToRemote()));
      assert.equal(res, true);
    } finally {
      rm(work); rm(upstream);
    }
  });

  it('returns false (never throws) when there is no configured remote', async () => {
    const work = mkTmp('ctoc-push-noremote-');
    try {
      git(['init'], work);
      fs.writeFileSync(path.join(work, 'a.txt'), 'a\n');
      git(['add', '-A'], work); git(['commit', '-m', 'c1'], work);

      const { res } = await withCwd(work, () => captureLog(() => qualityAgent.pushToRemote()));
      assert.equal(res, false); // a mutant that swallows-and-returns-true would ship a non-push as success
    } finally {
      rm(work);
    }
  });
});

// ---------------------------------------------------------------------------
// maybePushOnSuccess — the ship gate (944-961)
// ---------------------------------------------------------------------------
describe('maybePushOnSuccess', () => {
  it('does not push when onSuccess is not "push"', () => {
    const r = qualityAgent.maybePushOnSuccess({ onSuccess: 'none' }, os.tmpdir());
    assert.equal(r.pushed, false);
    assert.match(r.reason, /on-success is not push/);
  });

  it('does not push when onSuccess is "push" but auto-push is DISABLED (default ship gate)', async () => {
    const dir = mkTmp('ctoc-shipgate-off-'); // no settings.json → default false
    try {
      const { res } = await captureLog(() =>
        Promise.resolve(qualityAgent.maybePushOnSuccess({ onSuccess: 'push' }, dir)));
      assert.equal(res.pushed, false);
      assert.match(res.reason, /auto-push disabled/i);
    } finally {
      rm(dir);
    }
  });

  it('pushes only when onSuccess is "push" AND the human enabled auto-push in settings', async () => {
    const upstream = mkTmp('ctoc-ship-up-');
    const work = mkTmp('ctoc-ship-work-');
    try {
      git(['init', '--bare'], upstream);
      git(['init'], work);
      git(['remote', 'add', 'origin', upstream], work);
      fs.writeFileSync(path.join(work, 'a.txt'), 'a\n');
      git(['add', '-A'], work); git(['commit', '-m', 'c1'], work);
      git(['push', '-u', 'origin', 'HEAD'], work);
      fs.writeFileSync(path.join(work, 'b.txt'), 'b\n');
      git(['add', '-A'], work); git(['commit', '-m', 'c2'], work);
      fs.mkdirSync(path.join(work, '.ctoc'), { recursive: true });
      fs.writeFileSync(path.join(work, '.ctoc', 'settings.json'),
        JSON.stringify({ git: { autoPushEnabled: true } }, null, 2));

      const { res } = await withCwd(work, () =>
        captureLog(() => Promise.resolve(qualityAgent.maybePushOnSuccess({ onSuccess: 'push' }, work))));
      assert.equal(res.pushed, true, 'auto-push enabled + a good remote must push');
      assert.match(res.reason, /auto-push enabled by the human/);
    } finally {
      rm(work); rm(upstream);
    }
  });
});

// ---------------------------------------------------------------------------
// printSummary — pass count + Tier 2 warnings + security skip note (966-1005)
// ---------------------------------------------------------------------------
describe('printSummary', () => {
  it('prints the passed-tests count line and each Tier 2 check status', async () => {
    const results = {
      allPassed: true,
      tier1: {
        lint: { passed: true }, typecheck: { passed: true },
        tests: { passed: true, passCount: 11 }, security: { passed: true, skipped: [] }
      },
      tier2: { coverage: { passed: false }, complexity: { passed: true } }
    };
    const { out } = await captureLog(() => Promise.resolve(qualityAgent.printSummary(results, 2500)));
    assert.match(out, /Tests: 11 passed/);
    assert.match(out, /coverage: WARN/); // a failing Tier 2 check is WARN, not PASS
    assert.match(out, /complexity: PASS/);
  });

  it('omits the pass-count line when passCount is 0 (no "Tests: 0 passed")', async () => {
    const results = {
      allPassed: true,
      tier1: {
        lint: { passed: true }, typecheck: { passed: true },
        tests: { passed: true, passCount: 0 }, security: { passed: true, skipped: [] }
      },
      tier2: {}
    };
    const { out } = await captureLog(() => Promise.resolve(qualityAgent.printSummary(results, 100)));
    assert.ok(!/Tests: 0 passed/.test(out), 'a zero pass count must not print the count line');
  });

  it('renders a FAIL header and the security skip note when checks failed with skips', async () => {
    const results = {
      allPassed: false,
      tier1: {
        lint: { passed: false }, typecheck: { passed: true }, tests: { passed: false },
        security: { passed: true, skipped: ['SAST skipped for go: no scanner installed'] }
      },
      tier2: null
    };
    const { out } = await captureLog(() => Promise.resolve(qualityAgent.printSummary(results, 1000)));
    assert.match(out, /CHECKS FAILED/);
    assert.match(out, /Lint:\s+FAIL/);
    assert.match(out, /1 scanner\(s\) skipped/, 'a partial-coverage security result must surface its skip count');
  });
});

// ---------------------------------------------------------------------------
// The test runners' faults the hotfix check met (plan: the hotfix check, Step 8, cases a
// to k). A run's standard error is read on a passing and a failing run; a timeout, output
// past 10 MiB, a runner that cannot start and npm's placeholder are "undetermined", never
// a failure and never a pass; on Windows npm and npx start as node running npm's own
// command-line script, with no command interpreter.
// ---------------------------------------------------------------------------
describe('runFullTests and runSpecificTests — undetermined runs, standard error and the npm launcher', () => {
  const ENOENT_NOT_STARTED = /could not be started/;

  it('a. a failing run\'s output holds its standard output and its standard error', async () => {
    const cmd = `"${NODE}" -e "console.log('one line'); console.error('FAIL tests/a.test.js'); process.exit(1)"`;
    const { res } = await captureLog(() => qualityAgent.runFullTests({ javascript: { test: cmd } }));
    assert.equal(res.passed, false);
    assert.match(res.output, /one line/);
    assert.match(res.output, /FAIL tests\/a\.test\.js/);
  });

  it('b. a configured test command that does not exist is undetermined', async () => {
    const { res } = await captureLog(() => qualityAgent.runFullTests({ javascript: { test: 'ctoc-no-such-runner' } }));
    assert.equal(res.passed, false);
    assert.equal(res.undetermined, true);
    assert.match(res.output, ENOENT_NOT_STARTED);
  });

  it('c. a configured run that exits 127 (a shell that cannot find the program) is undetermined', async () => {
    const code = process.platform === 'win32' ? 9009 : 127;
    const { res } = await captureLog(() => qualityAgent.runFullTests({ javascript: { test: `"${NODE}" -e "process.exit(${code})"` } }));
    assert.equal(res.passed, false);
    assert.equal(res.undetermined, true);
  });

  it('d. a timeout is undetermined, through runFullTests and through runSpecificTests\' jest path', async () => {
    const timeout = () => ({ status: null, signal: 'SIGTERM', error: Object.assign(new Error('spawnSync npx ETIMEDOUT'), { code: 'ETIMEDOUT' }), stdout: '', stderr: '' });
    await withExecSpies(timeout, async (qa) => {
      const { res } = await captureLog(() => qa.runFullTests({ javascript: { test: 'jest' } }));
      assert.equal(res.passed, false);
      assert.equal(res.undetermined, true);
      assert.match(res.output, /timed out/);
      const spec = qa.runSpecificTests({ javascript: { test: 'jest', testFramework: 'jest' } }, ['tests/a.test.js']);
      assert.equal(spec.passed, false);
      assert.equal(spec.undetermined, true);
      assert.match(spec.output, /timed out/);
      return {};
    });
  });

  it('e. npm\'s placeholder test script runs nothing and is undetermined', async () => {
    const { fileCalls, execCalls } = await withExecSpies(() => 'should never run', async (qa) => {
      const { res } = await captureLog(() => qa.runFullTests({
        js: { test: 'echo "Error: no test specified" && exit 1', testFromScript: true }
      }));
      assert.equal(res.passed, false);
      assert.equal(res.undetermined, true);
      assert.match(res.output, /placeholder/);
      return {};
    });
    assert.deepEqual(fileCalls, [], 'the fake saw no process start');
    assert.deepEqual(execCalls, [], 'the fake saw no process start');
  });

  it('f. on Windows `npm test` starts as node running npm-cli.js, with no shell', async () => {
    const dir = mkTmp('ctoc-npm-win-');
    try {
      const nodeExe = path.join(dir, 'node.exe');
      const cli = path.join(dir, 'node_modules', 'npm', 'bin', 'npm-cli.js');
      fs.mkdirSync(path.dirname(cli), { recursive: true });
      fs.writeFileSync(cli, '');
      const { fileCalls } = await withExecSpies(() => '\u2139 pass 1\n\u2139 fail 0\n', (qa) => withPlatform('win32', nodeExe, async () => {
        const { res } = await captureLog(() => qa.runFullTests({ javascript: { test: 'node --test', testFromScript: true } }));
        assert.equal(res.passed, true);
        return {};
      }));
      assert.equal(fileCalls.length, 1);
      assert.equal(fileCalls[0].bin, nodeExe);
      assert.deepEqual(fileCalls[0].args, [cli, 'test']);
      assert.equal(fileCalls[0].opts.shell, false);
    } finally {
      rm(dir);
    }
  });

  it('g. on Windows `npx jest <files>` starts as node running npx-cli.js', async () => {
    const dir = mkTmp('ctoc-npx-win-');
    try {
      const nodeExe = path.join(dir, 'node.exe');
      const cli = path.join(dir, 'node_modules', 'npm', 'bin', 'npx-cli.js');
      fs.mkdirSync(path.dirname(cli), { recursive: true });
      fs.writeFileSync(cli, '');
      const { fileCalls } = await withExecSpies(() => 'Tests: 1 passed, 1 total', (qa) => withPlatform('win32', nodeExe, async () => {
        const res = qa.runSpecificTests({ javascript: { test: 'jest', testFramework: 'jest' } }, ['tests/a.test.js']);
        assert.equal(res.passed, true);
        return {};
      }));
      assert.equal(fileCalls.length, 1);
      assert.equal(fileCalls[0].bin, nodeExe);
      assert.deepEqual(fileCalls[0].args, [cli, 'jest', 'tests/a.test.js']);
      assert.equal(fileCalls[0].opts.shell, false);
    } finally {
      rm(dir);
    }
  });

  it('h. on Windows without npm\'s script beside node nothing starts, and the run is undetermined', async () => {
    const dir = mkTmp('ctoc-npm-none-');
    try {
      const nodeExe = path.join(dir, 'node.exe');
      const { fileCalls, execCalls } = await withExecSpies(() => 'should never run', (qa) => withPlatform('win32', nodeExe, async () => {
        const { res } = await captureLog(() => qa.runFullTests({ javascript: { test: 'node --test', testFromScript: true } }));
        assert.equal(res.passed, false);
        assert.equal(res.undetermined, true);
        assert.match(res.output, /npm-cli\.js/, 'the output names the missing script');
        return {};
      }));
      assert.deepEqual(fileCalls, [], 'the fake saw no process start');
      assert.deepEqual(execCalls, [], 'the fake saw no process start');
    } finally {
      rm(dir);
    }
  });

  it('i. every other platform starts `npm test` and `npx jest <files>` by name', async () => {
    const { fileCalls } = await withExecSpies(() => '\u2139 pass 1\n\u2139 fail 0\n', (qa) => withPlatform('linux', null, async () => {
      await captureLog(() => qa.runFullTests({ javascript: { test: 'node --test', testFromScript: true } }));
      qa.runSpecificTests({ javascript: { test: 'jest', testFramework: 'jest' } }, ['tests/a.test.js']);
      return {};
    }));
    assert.deepEqual(fileCalls.map((c) => [c.bin, c.args]), [['npm', ['test']], ['npx', ['jest', 'tests/a.test.js']]]);
  });

  it('j. a passing run whose counters are on standard error counts as a run', async () => {
    const cmd = `"${NODE}" -e "console.error('Tests:       2 passed, 2 total')"`;
    const { res } = await captureLog(() => qualityAgent.runFullTests({ javascript: { test: cmd } }));
    assert.equal(res.passed, true);
    assert.equal(res.passCount, 2);
  });

  it('k. output past 10 MiB is undetermined, never a timeout', async () => {
    const tooLarge = () => ({ status: null, signal: 'SIGTERM', error: Object.assign(new Error('spawnSync jest ENOBUFS'), { code: 'ENOBUFS' }), stdout: '\u2139 pass 3', stderr: '' });
    await withExecSpies(tooLarge, async (qa) => {
      const { res } = await captureLog(() => qa.runFullTests({ javascript: { test: 'jest' } }));
      assert.equal(res.passed, false);
      assert.equal(res.undetermined, true);
      assert.match(res.output, /10 MiB/);
      assert.doesNotMatch(res.output, /timed out/);
      return {};
    });
  });

  it('a configured test command with shell structure is refused, and the result says so', async () => {
    const { res } = await captureLog(() => qualityAgent.runFullTests({ javascript: { test: 'npm run build && npm test' } }));
    assert.equal(res.passed, false);
    assert.equal(res.refused, true);
    assert.match(res.output, /REFUSED/);
    const specific = qualityAgent.runSpecificTests({ javascript: { test: 'npm run build && npm test' } }, ['a.test.js']);
    assert.equal(specific.passed, false);
    assert.equal(specific.refused, true);
  });

  it('counters are read from standard output; standard error only when standard output has none', async () => {
    const both = () => ({ status: 0, signal: null, stdout: '\u2139 pass 2\n\u2139 fail 1\n', stderr: '\u2139 pass 3\n\u2139 fail 0\n' });
    await withExecSpies(both, async (qa) => {
      const { res } = await captureLog(() => qa.runFullTests({ javascript: { test: 'node x' } }));
      assert.equal(res.passed, false, 'standard output reports a failure; standard error cannot outvote it');
      assert.equal(res.failed, 1);
      const specific = qa.runSpecificTests({ javascript: { test: 'node x' } }, ['a.test.js']);
      assert.equal(specific.passed, false);
      assert.equal(specific.failed, 1);
      return {};
    });
    const errOnly = () => ({ status: 0, signal: null, stdout: 'Determining test suites to run...\n', stderr: 'Tests:       4 passed, 4 total\n' });
    await withExecSpies(errOnly, async (qa) => {
      const { res } = await captureLog(() => qa.runFullTests({ javascript: { test: 'node x' } }));
      assert.equal(res.passed, true);
      assert.equal(res.passCount, 4, 'jest\'s case: the counters on standard error are read');
      return {};
    });
  });

  it('a failure on standard error refuses the run even when standard output reports none', async () => {
    const mirrored = () => ({ status: 0, signal: null, stdout: '\u2139 pass 2\n\u2139 fail 0\n', stderr: '\u2139 pass 3\n\u2139 fail 1\n' });
    await withExecSpies(mirrored, async (qa) => {
      const { res } = await captureLog(() => qa.runFullTests({ javascript: { test: 'node x' } }));
      assert.equal(res.passed, false, 'standard error reports a failure; a clean standard output cannot hide it');
      assert.equal(res.failed, 1);
      const specific = qa.runSpecificTests({ javascript: { test: 'node x' } }, ['a.test.js']);
      assert.equal(specific.passed, false);
      assert.equal(specific.failed, 1);
      return {};
    });
  });

  /**
   * What a timed call must cost, in milliseconds, and below what a time is noise. Until the tenth
   * round the ratio was `big / max(small, 20)`: with a small input that cost 2 ms, a reader that
   * took 100 ms at four times the size (50 times as long) showed a ratio of 5 and passed. The
   * inputs now grow until a call costs 40 ms, and only a time below 2 ms is taken for 2 ms, so
   * that a reader too fast to time must also be fast, in milliseconds, at four times the size.
   */
  const TIMED_MS = 40;
  const NOISE_MS = 2;
  /**
   * A timing case in ratio form (the decision at review of 2026-10-09: a bound in milliseconds
   * passed or failed with the machine's load, where a ratio does not). `at(n)` gives the call
   * to time on an input of size `n`, built before it is timed. The call is warmed once; `n`
   * grows until one call costs at least 40 ms or `4n` would pass `limit` (inputs of many
   * megabytes measure the engine's memory, not the reader); an input that cannot grow that
   * far is run several times in a row, so that what is timed still costs about 40 ms. Then
   * the minimum of five runs at `n` and of five runs at `4n` is taken. Work that is linear in
   * the input gives a ratio near 4, quadratic work one near 16, and the bound is 8. The one
   * absolute bound is seconds wide and stops a runaway reader early.
   */
  async function growth(at, n, limit) {
    const ms = async (call) => {
      const start = process.hrtime.bigint();
      await call();
      return Number(process.hrtime.bigint() - start) / 1e6;
    };
    let call = at(n);
    await ms(call); // warm once
    let once = await ms(call);
    while (once < TIMED_MS && n * 8 <= limit) {
      n *= once < TIMED_MS / 4 && n * 16 <= limit ? 4 : 2;
      call = at(n);
      once = await ms(call);
    }
    assert.ok(once < 5000, `one call at size ${n} took ${once.toFixed(0)} ms`);
    const times = once < TIMED_MS ? Math.min(Math.ceil(TIMED_MS / Math.max(once, 0.02)), 2000) : 1;
    const run = async (fn) => {
      let sum = 0;
      for (let k = 0; k < times; k++) sum += await ms(fn);
      return sum;
    };
    const least = async (fn) => Math.min(await run(fn), await run(fn), await run(fn), await run(fn), await run(fn));
    const small = await least(call);
    const big = await least(at(4 * n));
    return { n, small, big, ratio: big / Math.max(small, NOISE_MS) };
  }

  it('a passing run with a long blank stretch is read in linear time', async () => {
    // The runner is faked once and answers the output of the call being timed; the quality
    // agent reads it in this process.
    let stdout = '';
    await withExecSpies(() => stdout, async (qa) => {
      const at = (kb) => {
        const output = `\u2139 pass 1\n\u2139 fail 0\n${'\n'.repeat(kb * 1024)}done\n`;
        return async () => {
          stdout = output;
          const { res } = await captureLog(() => qa.runFullTests({ javascript: { test: 'node x' } }));
          assert.equal(res.passed, true, JSON.stringify(res));
          assert.equal(res.passCount, 1);
        };
      };
      const { n, small, big, ratio } = await growth(at, 4, 2048);
      assert.ok(ratio < 8, `${n} KB of blank lines took ${small.toFixed(1)} ms and ${4 * n} KB took ${big.toFixed(1)} ms`);
      return {};
    });
  });

  it('a long run of digits in a run\'s output is read in linear time by the skipped and passed fallbacks', async () => {
    // The re-review of 2026-10-09: `(\d+)\s+skipped` and `(\d+)\s*(passed|passing)` tried
    // every start inside a run of digits, each scanning to its end: quadratic.
    let stdout = '';
    await withExecSpies(() => stdout, async (qa) => {
      for (const [label, head] of [['the skipped fallback', '\u2139 pass 1\n\u2139 fail 0\n'], ['the passed fallback', '']]) {
        const at = (kb) => {
          const output = `${head}${'7'.repeat(kb * 1024)}x\n`;
          return async () => {
            stdout = output;
            await captureLog(() => qa.runFullTests({ javascript: { test: 'node x' } }));
          };
        };
        const { n, small, big, ratio } = await growth(at, 4, 2048);
        assert.ok(ratio < 8, `${label}: ${n} thousand digits took ${small.toFixed(1)} ms and ${4 * n} thousand took ${big.toFixed(1)} ms`);
      }
      return {};
    });
  });

  it('runCommandArgv without allowFail throws the shape execFileSync threw', () => {
    assert.throws(() => qualityAgent.runCommandArgv(NODE, ['-e', 'process.exit(3)'], { silent: true }), (err) => {
      assert.equal(err.status, 3);
      assert.match(err.message, /exited with 3/);
      return true;
    });
    assert.throws(() => qualityAgent.runCommandArgv('ctoc-no-such-runner', [], { silent: true }), (err) => err.code === 'ENOENT');
  });
});

// The hotfix check's tenth round (2026-10-10): what the reviewers of its ninth round found in
// the test run. Each case was written and seen failing before its fix.
describe('the test run: one run per command, a failure counted on a summary line, and the whole process tree ended at the time limit', () => {
  const COUNTERS = `${String.fromCharCode(0x2139)} pass 5\n${String.fromCharCode(0x2139)} fail 0\n`;

  it('B11: a test command two detected languages share runs once, and its count is the count of one run', async () => {
    await withExecSpies(() => COUNTERS, async (qa, fileCalls) => {
      const { res } = await captureLog(() => qa.runFullTests({ javascript: { test: 'node x' }, typescript: { test: 'node x' } }));
      assert.equal(fileCalls.length, 1, JSON.stringify(fileCalls.map((c) => [c.bin, c.args])));
      assert.deepEqual([res.passed, res.passCount], [true, 5]);
      return {};
    });
    await withExecSpies(() => COUNTERS, async (qa, fileCalls) => {
      const script = { test: 'node --test', testFromScript: true };
      const { res } = await captureLog(() => qa.runFullTests({ javascript: script, typescript: { ...script } }));
      assert.equal(fileCalls.length, 1, 'npm test once');
      assert.equal(res.passCount, 5);
      return {};
    });
    // Two commands that differ each run; a script's `node x` and a configured `node x` are two.
    await withExecSpies(() => COUNTERS, async (qa, fileCalls) => {
      const { res } = await captureLog(() => qa.runFullTests({ javascript: { test: 'node x' }, python: { test: 'pytest' }, typescript: { test: 'node x', testFromScript: true } }));
      assert.equal(fileCalls.length, 3);
      assert.equal(res.passCount, 15);
      return {};
    });
    await withExecSpies(() => COUNTERS, async (qa, fileCalls) => {
      const jest = { test: 'jest', testFramework: 'jest' };
      const res = qa.runSpecificTests({ javascript: jest, typescript: { ...jest } }, ['a.test.js']);
      assert.equal(fileCalls.length, 1, 'the selected tests once');
      assert.equal(res.passCount, 5);
      return {};
    });
  });

  it('B11: a lint command two detected languages share runs once', async () => {
    await withExecSpies(() => '', async (qa, fileCalls) => {
      const { res } = await captureLog(() => qa.runLint({ javascript: { lint: 'eslint .' }, typescript: { lint: 'eslint .' }, python: { lint: 'ruff check' } }));
      assert.deepEqual(fileCalls.map((c) => [c.bin, ...c.args].join(' ')), ['eslint .', 'ruff check']);
      assert.deepEqual([res.passed, res.ran], [true, 2]);
      return {};
    });
  });

  it('B13: "N failed" on a summary line is a failure, also when the runner exits with 0', async () => {
    const failing = ['1 failed, 3 passed', '=== 1 failed, 3 passed in 0.12s ===', '3 passed, 2 failed', '  2 failed', '1 failed in 0.1s', '1 skipped, 1 failed, 3 passed'];
    for (const summary of failing) {
      await withExecSpies(() => `collected 4 items\n${summary}\n`, async (qa) => {
        const { res } = await captureLog(() => qa.runFullTests({ python: { test: 'pytest' } }));
        assert.equal(res.passed, false, summary);
        assert.ok(res.failed >= 1, summary);
        return {};
      });
    }
    // No summary line: a test's name or its own output that holds the words, and a count of none.
    const clean = ['ok 1 - 3 failed attempts are retried\n4 passed', '2 failed logins recorded\n4 passed', '4 passed, 0 failed', 'the 1 failed request is retried\n4 passed'];
    for (const output of clean) {
      await withExecSpies(() => `${output}\n`, async (qa) => {
        const { res } = await captureLog(() => qa.runFullTests({ python: { test: 'pytest' } }));
        assert.equal(res.passed, true, output);
        return {};
      });
    }
  });

  it('B14: the tree is ended only for a run that asked for it and was stopped; a group already gone is no fault, any other failure is one', async () => {
    const stopped = () => ({ pid: 4242, status: null, signal: 'SIGTERM', error: Object.assign(new Error('spawnSync node ETIMEDOUT'), { code: 'ETIMEDOUT' }), stdout: '', stderr: '' });
    const realKill = process.kill;
    const killed = [];
    const withKill = async (fake, fn) => {
      process.kill = fake;
      try { return await fn(); } finally { process.kill = realKill; }
    };
    const record = (pid, signal) => { killed.push([pid, signal]); return true; };
    const tools = { javascript: { test: 'node x' } };
    await withExecSpies(stopped, async (qa, fileCalls) => {
      const { res } = await withKill(record, () => captureLog(() => qa.runFullTests(tools, { wholeTree: true, timeout: 5 })));
      assert.equal(res.undetermined, true);
      assert.deepEqual(killed, [[-4242, 'SIGKILL']], 'the group of the stopped program');
      assert.deepEqual([fileCalls[0].opts.detached, fileCalls[0].opts.timeout], [true, 5]);
      killed.length = 0;
      await withKill(record, () => captureLog(() => qa.runFullTests(tools)));
      assert.deepEqual(killed, [], 'not asked for: nothing is ended');
      assert.equal('detached' in fileCalls[1].opts, false);
      const gone = () => { throw Object.assign(new Error('kill ESRCH'), { code: 'ESRCH' }); };
      const { res: quiet } = await withKill(gone, () => captureLog(() => qa.runFullTests(tools, { wholeTree: true })));
      assert.equal(quiet.undetermined, true, 'a group already gone is no fault');
      const refused = () => { throw Object.assign(new Error('kill EPERM'), { code: 'EPERM' }); };
      await assert.rejects(withKill(refused, () => captureLog(() => qa.runFullTests(tools, { wholeTree: true }))), /EPERM/);
      return {};
    });
    // A run that ended by itself has its group ended too (since the second final re-check of
    // 2026-10-10: what it started could still write after the answer).
    await withExecSpies(() => ({ pid: 4242, status: 1, signal: null, stdout: '', stderr: '' }), async (qa) => {
      await withKill(record, () => captureLog(() => qa.runFullTests(tools, { wholeTree: true })));
      assert.deepEqual(killed, [[-4242, 'SIGKILL']]);
      killed.length = 0;
      return {};
    });
    // Windows: taskkill with the program's id, and no process group.
    const platform = Object.getOwnPropertyDescriptor(process, 'platform');
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
    try {
      await withExecSpies((bin) => (bin === 'taskkill' ? '' : stopped()), async (qa, fileCalls) => {
        await withKill(record, () => captureLog(() => qa.runFullTests({ javascript: { test: 'runner x' } }, { wholeTree: true })));
        assert.deepEqual(fileCalls.map((c) => [c.bin, ...c.args]), [['runner', 'x'], ['taskkill', '/pid', '4242', '/T', '/F']]);
        assert.equal('detached' in fileCalls[0].opts, false);
        assert.deepEqual(killed, []);
        return {};
      });
    } finally {
      Object.defineProperty(process, 'platform', platform);
    }
  });

  it('B14: at the time limit the whole process tree of the test command ends', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-tree-'));
    const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
    let pid = 0;
    try {
      fs.writeFileSync(path.join(dir, 'slow.js'), "require('fs').writeFileSync('slow.pid', String(process.pid));\nsetTimeout(() => {}, 60000);\n");
      fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'slow', version: '1.0.0', private: true, scripts: { test: 'node slow.js && echo done' } }));
      const started = Date.now();
      const { res } = await withCwd(dir, () => captureLog(() => qualityAgent.runFullTests(
        { javascript: { test: 'node slow.js && echo done', testFromScript: true } }, { timeout: 3000, wholeTree: true })));
      assert.ok(Date.now() - started < 30000, 'the run came back at its time limit');
      assert.deepEqual([res.passed, res.undetermined], [false, true], JSON.stringify(res));
      assert.match(res.output, /timed out/);
      pid = Number(fs.readFileSync(path.join(dir, 'slow.pid'), 'utf8'));
      assert.ok(pid > 0, 'the test script started');
      // The signal that ends the tree is sent before the run returns; the processes need a moment to go.
      for (let waited = 0; alive(pid) && waited < 5000; waited += 50) await new Promise((resolve) => setTimeout(resolve, 50));
      assert.equal(alive(pid), false, `the test script (process ${pid}) is left behind`);
    } finally {
      if (pid > 0 && alive(pid)) process.kill(pid, 'SIGKILL');
      fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
  });
});
