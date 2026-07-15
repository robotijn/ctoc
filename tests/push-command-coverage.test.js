/**
 * push-command-coverage.test.js — DARK-branch coverage for src/commands/push.js.
 *
 * Companion to tests/w10-push-entry-point.test.js (do NOT edit that file). This
 * suite targets the branches the entry-point suite leaves dark, each pinned so it
 * goes RED under mutation of the production line — not line-coverage theater.
 *
 * Dark branches targeted (baseline: line 88.66%, branch 62.16%; uncovered
 * 155-156, 171-185, 190-194):
 *   - Cluster A: `d.pushToRemote() === true` coercion + the git-push-failed path
 *                (lines 151-156). Existing suite only ever returns `true`.
 *   - Cluster B: the `d.detect() || {}` and `detection.tools || {}` fallbacks
 *                (line 87-88) — the SECOND operand, dark whenever detect() is well-formed.
 *   - Cluster C: the security-skip disclosure boundary — `length > 3` `+N more`
 *                ternary and the `passed &&` gate (lines 116-121).
 *   - Cluster D: parsePushArgs edges — empty argv, bare positional NOT treated as
 *                unknown, single-dash token IS unknown (line 49 `startsWith('-')`).
 *   - Cluster E: main() (lines 171-185) — unknown-flag exit 2, the ok?0:1 exit-code
 *                fork, and the `argv = process.argv.slice(2)` default initializer.
 *                Boundary modules (quality-agent, tool-detector) are patched at the
 *                require cache so main() runs its REAL deps path with NO network push.
 *
 * Every double sits at the true boundary (child_process/git via quality-agent,
 * filesystem via tool-detector). push's own decision logic is never mocked.
 *
 * Documented unreachable: lines 190-194 (`if (require.main === module)` direct-CLI
 * bootstrap + its `.catch`) fire only when push.js is spawned as a script. node's
 * in-process --experimental-test-coverage does NOT instrument a child process, so
 * these lines are genuinely unreachable from an in-process require() test. Not faked.
 */

const assert = require('node:assert/strict');
const { test, describe, afterEach } = require('node:test');
const path = require('path');

const push = require('../src/commands/push');
const qualityAgent = require('../src/lib/quality-agent');
const toolDetector = require('../src/lib/tool-detector');

/**
 * Minimal all-passing deps with per-call spies. Overrides replace individual
 * runners. Mirrors the boundary the real command injects.
 */
function makeDeps(overrides = {}) {
  const calls = { pushToRemote: 0, lintTools: undefined };
  const pass = async () => ({ passed: true });
  const deps = {
    detect: overrides.detect || (() => ({ languages: ['javascript'], tools: {} })),
    runLint: async (t) => {
      calls.lintTools = t;
      return (overrides.runLint || pass)(t);
    },
    runTypecheck: overrides.runTypecheck || pass,
    runSmartTests: overrides.runSmartTests || pass,
    runSecurityScan: overrides.runSecurityScan || pass,
    pushToRemote: () => {
      calls.pushToRemote++;
      return overrides.pushToRemote ? overrides.pushToRemote() : true;
    },
    logger: { log: () => {} }
  };
  return { deps, calls };
}

// ---------------------------------------------------------------------------
// Cluster A — push result coercion + git-push-failed path (lines 151-156)
// ---------------------------------------------------------------------------
describe('push.run — pushToRemote result handling (dark: lines 155-156, `=== true`)', () => {
  test('reports failure and ok=false when pushToRemote returns false', async () => {
    // Arrange — checks all pass, but the git push itself fails.
    const { deps } = makeDeps({ pushToRemote: () => false });

    // Act
    const result = await push.run({}, deps);

    // Assert — the else-branch of `if (pushed)`: not ok, not pushed, honest text.
    assert.equal(result.ok, false);
    assert.equal(result.pushed, false);
    assert.equal(result.tier, null, 'a push failure is not a Tier-1 block');
    assert.deepEqual(result.blockedBy, []);
    assert.match(result.text, /git push failed/, 'text names the push failure honestly');
  });

  test('coerces a truthy-non-true pushToRemote result to pushed=false', async () => {
    // Arrange — pushToRemote returns a truthy value that is NOT strictly `true`.
    // Kills the mutation `=== true` -> truthy: a stringy/loose result must NOT
    // be reported as a successful push.
    const { deps } = makeDeps({ pushToRemote: () => 'ok' });

    // Act
    const result = await push.run({}, deps);

    // Assert
    assert.equal(result.pushed, false, 'only strict boolean true counts as pushed');
    assert.equal(result.ok, false);
    assert.match(result.text, /git push failed/);
  });
});

// ---------------------------------------------------------------------------
// Cluster B — detection fallbacks (dark second operand of `|| {}`)
// ---------------------------------------------------------------------------
describe('push.run — malformed detection is coerced, never thrown (line 87-88 `|| {}`)', () => {
  test('proceeds with empty tools when detect() returns null', async () => {
    // Arrange — a null detection must not crash; `d.detect() || {}` guards it.
    const { deps, calls } = makeDeps({ detect: () => null });

    // Act
    const result = await push.run({}, deps);

    // Assert — the run still completes end-to-end and pushes.
    assert.equal(result.ok, true, 'null detection is tolerated, not fatal');
    assert.equal(calls.pushToRemote, 1);
  });

  test('passes an empty tools object to runners when detection omits tools', async () => {
    // Arrange — detection present but no `tools` key → `detection.tools || {}`.
    const { deps, calls } = makeDeps({ detect: () => ({ languages: ['go'] }) });

    // Act
    await push.run({}, deps);

    // Assert — runLint received a defined (empty) object, not undefined.
    assert.deepEqual(calls.lintTools, {}, 'missing tools coerces to {} before runners see it');
  });
});

// ---------------------------------------------------------------------------
// Cluster C — security-skip disclosure boundary (lines 116-121)
// ---------------------------------------------------------------------------
describe('push.run — security skip disclosure boundary (dark: `>3` +more, `passed &&` gate)', () => {
  test('appends "+N more" when more than three scanners were skipped', async () => {
    // Arrange — 5 skips: preview shows first 3, suffix names the remaining 2.
    const skipped = ['sast skip', 'sca skip', 'secrets skip', 'license skip', 'container skip'];
    const { deps } = makeDeps({
      runSecurityScan: async () => ({ passed: true, skipped })
    });

    // Act
    const result = await push.run({}, deps);

    // Assert — count, preview truncation, and the "+N more" tail all present.
    assert.match(result.text, /5 scanner\(s\) were skipped/, 'names the full count (5)');
    assert.match(result.text, /\+2 more/, 'names the count beyond the 3-item preview');
    assert.ok(
      !result.text.includes('license skip') && !result.text.includes('container skip'),
      'items beyond the preview are summarized, not listed'
    );
  });

  test('omits "+N more" at exactly three skipped scanners (boundary >3 is false)', async () => {
    // Arrange — exactly 3 skips: the `length > 3` boundary is false, no tail.
    const { deps } = makeDeps({
      runSecurityScan: async () => ({ passed: true, skipped: ['a skip', 'b skip', 'c skip'] })
    });

    // Act
    const result = await push.run({}, deps);

    // Assert
    assert.match(result.text, /3 scanner\(s\) were skipped/);
    assert.ok(!/more/.test(result.text), 'no "+N more" tail at the boundary');
  });

  test('does NOT emit a skip-disclosure line when security FAILED but had skips', async () => {
    // Arrange — the disclosure is gated on `security.passed &&`; a failing scan
    // with skips must block WITHOUT the "scanner(s) were skipped" line.
    const { deps } = makeDeps({
      runSecurityScan: async () => ({ passed: false, critical: 1, skipped: ['sast skip', 'sca skip'] })
    });

    // Act
    const result = await push.run({}, deps);

    // Assert — blocked, and the passed-only disclosure line is absent.
    assert.equal(result.ok, false);
    assert.ok(result.blockedBy.includes('security'));
    assert.ok(
      !/scanner\(s\) were skipped/.test(result.text),
      'skip disclosure is gated on security.passed and must not appear on a failed scan'
    );
  });
});

// ---------------------------------------------------------------------------
// Cluster D — parsePushArgs edges (dark: empty argv, `startsWith('-')`)
// ---------------------------------------------------------------------------
describe('push.parsePushArgs — argument-shape edges', () => {
  test('returns all-false defaults for empty argv', () => {
    // Act
    const opts = push.parsePushArgs([]);

    // Assert — every flag off, nothing collected as unknown.
    assert.deepEqual(opts, { force: false, skipTests: false, dryRun: false, unknown: [] });
  });

  test('ignores a bare positional but flags a single-dash token as unknown', () => {
    // Arrange / Act — 'deploy' is a bare word (push takes no positionals),
    // '-x' starts with '-' so it is an unrecognized flag.
    const opts = push.parsePushArgs(['deploy', '-x', '--force']);

    // Assert — the `startsWith('-')` branch: positional ignored, dash-token captured.
    assert.equal(opts.force, true, 'known flag still parsed alongside noise');
    assert.deepEqual(opts.unknown, ['-x'], 'only the dash-prefixed token is unknown');
    assert.ok(!opts.unknown.includes('deploy'), 'a bare positional is never treated as unknown');
  });
});

// ---------------------------------------------------------------------------
// Cluster E — main() (lines 171-185). Boundary modules patched at the require
// cache so main()'s REAL deps path runs with NO network push.
// ---------------------------------------------------------------------------
describe('push.main — CLI entry (dark: lines 171-185)', () => {
  const originalExitCode = process.exitCode;

  // Snapshot the real boundary functions so each test restores them.
  const realQA = {
    runLint: qualityAgent.runLint,
    runTypecheck: qualityAgent.runTypecheck,
    runSmartTests: qualityAgent.runSmartTests,
    runSecurityScan: qualityAgent.runSecurityScan,
    pushToRemote: qualityAgent.pushToRemote
  };
  const realDetect = toolDetector.detectTools;
  const realArgv = process.argv;

  function patchBoundary({ lintPasses = true, pushOk = true } = {}) {
    qualityAgent.runLint = async () => ({ passed: lintPasses });
    qualityAgent.runTypecheck = async () => ({ passed: true });
    qualityAgent.runSmartTests = async () => ({ passed: true });
    qualityAgent.runSecurityScan = async () => ({ passed: true, skipped: [] });
    qualityAgent.pushToRemote = () => pushOk;
    toolDetector.detectTools = () => ({ languages: [], tools: {} });
  }

  afterEach(() => {
    Object.assign(qualityAgent, realQA);
    toolDetector.detectTools = realDetect;
    process.argv = realArgv;
    process.exitCode = originalExitCode;
  });

  test('sets exit code 2 and never runs checks when an unknown flag is passed', async () => {
    // Arrange — patch boundary so that if the guard were broken and run() fired,
    // it still would not touch the network; but the assertion is that run() is skipped.
    let pushed = 0;
    patchBoundary();
    qualityAgent.pushToRemote = () => { pushed++; return true; };

    // Act
    const result = await push.main(['--bogus']);

    // Assert — the unknown-flag branch exits 2 and returns before running anything.
    assert.equal(process.exitCode, 2, 'unknown flag exits non-zero (2)');
    assert.equal(result, undefined, 'main returns early on unknown flags');
    assert.equal(pushed, 0, 'no push is attempted when a flag is rejected');
  });

  test('runs the real deps path and exits 0 on a clean pass', async () => {
    // Arrange — every boundary check passes, push succeeds.
    patchBoundary({ lintPasses: true, pushOk: true });

    // Act
    const result = await push.main([]);

    // Assert — main wired run()'s result to exit code 0.
    assert.equal(result.ok, true);
    assert.equal(result.pushed, true);
    assert.equal(process.exitCode, 0, 'clean pass exits 0 (ok ? 0 : 1, true branch)');
  });

  test('exits 1 when a Tier-1 check fails through the real deps path', async () => {
    // Arrange — lint fails at the boundary → run() blocks → main exits 1.
    patchBoundary({ lintPasses: false });

    // Act
    const result = await push.main([]);

    // Assert — the false branch of `ok ? 0 : 1`.
    assert.equal(result.ok, false);
    assert.ok(result.blockedBy.includes('lint'));
    assert.equal(process.exitCode, 1, 'a blocked push exits 1');
  });

  test('defaults argv to process.argv.slice(2) when called with no arguments', async () => {
    // Arrange — no flags in argv so parsePushArgs finds nothing to reject; this
    // exercises the `argv = process.argv.slice(2)` default initializer (line 171).
    patchBoundary({ lintPasses: true, pushOk: true });
    process.argv = [process.execPath, path.join('src', 'commands', 'push.js')];

    // Act — no argument → default initializer runs.
    const result = await push.main();

    // Assert — the default path parsed zero flags and pushed cleanly.
    assert.equal(result.ok, true, 'default argv path parses no flags and proceeds');
    assert.equal(process.exitCode, 0);
  });
});
