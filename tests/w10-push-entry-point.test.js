/**
 * W10-s1 — Real /ctoc:push entry point (H3)
 *
 * Behavior tests for src/commands/push.js. Every case injects fakes via the
 * `run(opts, deps)` seam — NO real test-suite run and NO real network push.
 *
 * Load-bearing behaviors under test:
 *   - A Tier-1 check failure means `pushToRemote` is NEVER called (fail-safe).
 *   - Clean Tier-1 pass calls `pushToRemote` exactly once.
 *   - `--dry-run` runs the checks but does not push.
 *   - `--skip-tests` omits ONLY the test runner; the others still run.
 *   - `--force` never overrides a Tier-1 failure.
 *   - `parsePushArgs` recognizes every documented flag and reports unknowns.
 *   - `require('quality-agent')` is side-effect-free (the require.main guard).
 */

const assert = require('node:assert/strict');
const { test, describe } = require('node:test');
const path = require('path');
const os = require('os');
const fs = require('fs');
const { execFileSync } = require('child_process');

const REPO_ROOT = path.resolve(__dirname, '..');
const push = require('../src/commands/push');

/**
 * Build a set of injectable deps. Each check runner defaults to a passing
 * async stub; override per-test. `pushToRemote` and `detect` are spies.
 */
function makeDeps(overrides = {}) {
  const calls = {
    runLint: 0,
    runTypecheck: 0,
    runSmartTests: 0,
    runSecurityScan: 0,
    pushToRemote: 0,
    detect: 0
  };
  const pass = async () => ({ passed: true });
  const deps = {
    detect: () => {
      calls.detect++;
      return { languages: ['javascript'], tools: {} };
    },
    runLint: async (t) => {
      calls.runLint++;
      return (overrides.runLint || pass)(t);
    },
    runTypecheck: async (t) => {
      calls.runTypecheck++;
      return (overrides.runTypecheck || pass)(t);
    },
    runSmartTests: async (t) => {
      calls.runSmartTests++;
      return (overrides.runSmartTests || pass)(t);
    },
    runSecurityScan: async (t) => {
      calls.runSecurityScan++;
      return (overrides.runSecurityScan || pass)(t);
    },
    pushToRemote: () => {
      calls.pushToRemote++;
      return overrides.pushToRemote ? overrides.pushToRemote() : true;
    },
    logger: { log: () => {} }
  };
  return { deps, calls };
}

describe('push.js — run(opts, deps) seam', () => {
  test('1. happy path: checks pass, push runs exactly once', async () => {
    const { deps, calls } = makeDeps();
    const result = await push.run({}, deps);
    assert.equal(result.ok, true);
    assert.equal(result.pushed, true);
    assert.equal(calls.pushToRemote, 1, 'pushToRemote called exactly once');
  });

  test('2. Tier-1 failure blocks, push never called', async () => {
    const { deps, calls } = makeDeps({
      runSmartTests: async () => ({ passed: false })
    });
    const result = await push.run({}, deps);
    assert.equal(result.ok, false);
    assert.equal(result.pushed, false);
    assert.equal(result.tier, 1);
    assert.ok(result.blockedBy.includes('tests'), 'blockedBy names tests');
    assert.equal(calls.pushToRemote, 0, 'pushToRemote NEVER called on Tier-1 failure');
  });

  test('3. --dry-run runs checks but does not push', async () => {
    const { deps, calls } = makeDeps();
    const result = await push.run({ dryRun: true }, deps);
    assert.equal(result.ok, true);
    assert.equal(result.pushed, false);
    assert.equal(result.dryRun, true);
    assert.equal(calls.pushToRemote, 0, 'dry-run never pushes');
    assert.ok(/Would push/.test(result.text), 'text contains "Would push"');
    // checks still ran
    assert.equal(calls.runLint, 1);
    assert.equal(calls.runSmartTests, 1);
  });

  test('4. --skip-tests omits the test runner only', async () => {
    const { deps, calls } = makeDeps();
    const result = await push.run({ skipTests: true }, deps);
    assert.equal(calls.runSmartTests, 0, 'test runner is NOT called');
    assert.equal(calls.runLint, 1, 'lint still runs');
    assert.equal(calls.runTypecheck, 1, 'typecheck still runs');
    assert.equal(calls.runSecurityScan, 1, 'security still runs');
    assert.equal(result.ok, true);
    assert.equal(result.pushed, true, 'push proceeds when the rest pass');
    assert.equal(calls.pushToRemote, 1);
  });

  test('5. --force never overrides a Tier-1 failure', async () => {
    const { deps, calls } = makeDeps({
      runLint: async () => ({ passed: false })
    });
    const result = await push.run({ force: true }, deps);
    assert.equal(result.ok, false, 'force does not flip a Tier-1 block');
    assert.equal(result.pushed, false);
    assert.equal(result.tier, 1);
    assert.ok(result.blockedBy.includes('lint'));
    assert.equal(calls.pushToRemote, 0, 'force never pushes past a Tier-1 failure');
  });
});

describe('push.js — security skip disclosure (honesty)', () => {
  test('8. passing security with skipped scanners surfaces a partial-coverage line', async () => {
    const skipped = [
      'secrets scan skipped (error, NOT a pass)',
      'SCA skipped: no scanner'
    ];
    const { deps } = makeDeps({
      runSecurityScan: async () => ({ passed: true, critical: 0, high: 0, skipped })
    });
    const result = await push.run({}, deps);
    // The gate decision is unchanged: skips do NOT block.
    assert.equal(result.ok, true, 'skips never block the push');
    assert.equal(result.pushed, true);
    assert.equal(result.blockedBy.length, 0, 'skips do not populate blockedBy');
    // But the honesty payload MUST reach the structured output.
    assert.ok(
      /skip/i.test(result.text),
      'text must disclose that scanner(s) were skipped'
    );
    assert.ok(
      /2/.test(result.text),
      'text must name how many scanners were skipped (2)'
    );
    assert.ok(
      result.text.includes('secrets scan skipped (error, NOT a pass)'),
      'text should echo at least the first skipped scanner detail'
    );
  });

  test('9. clean security (no skips) emits no spurious skip line', async () => {
    const { deps } = makeDeps({
      runSecurityScan: async () => ({ passed: true, critical: 0, high: 0, skipped: [] })
    });
    const result = await push.run({}, deps);
    assert.equal(result.ok, true);
    assert.equal(result.pushed, true);
    assert.ok(!/skip/i.test(result.text), 'no skip disclosure when nothing was skipped');
  });

  test('10. missing skipped field is read defensively (no throw, no skip line)', async () => {
    const { deps } = makeDeps({
      runSecurityScan: async () => ({ passed: true })
    });
    const result = await push.run({}, deps);
    assert.equal(result.ok, true);
    assert.ok(!/skip/i.test(result.text), 'undefined skipped → guarded, no line');
  });

  test('11. a blocked push (security failed) still blocks as before', async () => {
    const { deps, calls } = makeDeps({
      runSecurityScan: async () => ({
        passed: false,
        critical: 1,
        high: 0,
        skipped: ['SAST skipped: no scanner']
      })
    });
    const result = await push.run({}, deps);
    assert.equal(result.ok, false, 'security failure still blocks');
    assert.equal(result.pushed, false);
    assert.equal(result.tier, 1);
    assert.ok(result.blockedBy.includes('security'), 'blockedBy names security');
    assert.equal(calls.pushToRemote, 0, 'never pushes past a Tier-1 security block');
  });
});

describe('push.js — parsePushArgs', () => {
  test('6. recognizes every documented flag and reports unknowns', () => {
    const ok = push.parsePushArgs(['--force', '--dry-run']);
    assert.equal(ok.force, true);
    assert.equal(ok.dryRun, true);
    assert.equal(ok.skipTests, false);
    assert.deepEqual(ok.unknown, []);

    const skip = push.parsePushArgs(['--skip-tests']);
    assert.equal(skip.skipTests, true);

    const bad = push.parsePushArgs(['--bogus']);
    assert.ok(bad.unknown.includes('--bogus'), 'unknown flag reported, never silently ignored');
  });
});

describe('quality-agent.js — require guard regression', () => {
  test('7. requiring quality-agent has no side effects and exports the blocks', () => {
    // Run in an EMPTY temp dir so that even if the guard were absent, main()
    // would detect no languages and return without running a suite or pushing.
    // With the guard present, require returns immediately and the script prints
    // exactly "OK".
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-qa-guard-'));
    const script =
      "const m=require(" + JSON.stringify(path.join(REPO_ROOT, 'src/lib/quality-agent')) + ");" +
      "if(typeof m.runTieredChecks!=='function'||typeof m.pushToRemote!=='function'){process.exit(3);}" +
      "process.stdout.write('OK');";
    let out;
    try {
      out = execFileSync(process.execPath, ['-e', script], {
        cwd: tmp,
        encoding: 'utf8'
      });
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
    assert.equal(
      out.trim(),
      'OK',
      'require(quality-agent) must not auto-run main() and must export runTieredChecks + pushToRemote'
    );
  });
});
