'use strict';

/**
 * tests/app-runner-coverage-holes.test.js — the last mile reports a failed drive as a
 * FAILURE, never as "nothing to launch" (plan 00242, slice 8 of "close the coverage holes").
 *
 * `src/lib/app-runner.js` is the Step 14 last-mile check: it drives a project's DECLARED
 * entry point and decides whether a human could actually reach what was built. Its binding
 * contract, stated in the module header and in CLAUDE.md, is that a declared entry point
 * which exits non-zero, omits its marker, or times out FAILS verification and is NEVER
 * reported `applicable: false` — a verdict reported on a run that never answered is the
 * false-green shape this repository fences. The dark ranges this file closes are precisely
 * the arms where that promise is at risk: the two places `driveAppSync` recovers from a
 * driver child it could not read.
 *
 * RANGES COVERED (numbering from the 2026-08-31 gate report — the gate's own report, not
 * this comment, is the source of truth):
 *   163-164    `readDeclaredEntryPoint`: a declaration that is not an object at all
 *              (a string, an array, a number) is MALFORMED with a reason, never degraded
 *              to "nothing was declared"
 *   815-816    `driveCli`: the entry fallback when `bin` is present but is neither a
 *              string nor an object — `main`, else `index.js`
 *   1117-1125  `driveAppSync`: the driver child FAILED TO LAUNCH → `applicable: true`,
 *              `launched: false`, the launch error named. This is the load-bearing one:
 *              a mutant flipping `applicable` to `false` here turns a failed last mile
 *              into a skipped one, and the gate goes green over an app nobody drove
 *   1133-1134  `driveAppSync`: the result marker is present but what follows it will not
 *              parse → the error result, still `applicable: true`, and NO throw
 *   1193-1194  the `--drive` child entry: an unparseable options argument defaults to `{}`
 *              instead of killing the driver before it can report anything
 *
 * RANGES LEFT UNCOVERED, each named with its reason (none is fabricated, none is deleted):
 *   610, 638   `teardown`'s two `taskkill /T /F` calls — WINDOWS-ONLY branches, guarded by
 *              `process.platform === 'win32'`. They cannot execute on the POSIX machine the
 *              coverage floor is measured on, and faking `process.platform` to reach them
 *              would execute a Windows-only code path against a POSIX process table, which
 *              proves nothing about Windows.
 *   619-620    `teardown`'s OUTER best-effort `catch`. On POSIX it is unreachable: the only
 *              statement inside the `try` is the `process.kill(-pid)` call, which has its
 *              own `catch`, whose fallback `child.kill()` has its own `catch` in turn. It is
 *              defensive depth, not a live arm — reported, never deleted (parent plan,
 *              Decision 2). `teardown` is module-local and unexported, so there is no seam
 *              to reach it through either.
 *   932-934    `driveServer`'s "no dev/start script" guard is UNREACHABLE through the
 *              module's surface. `driveServer` is module-local; its only caller is
 *              `driveApp`, which reaches it only for shape `web`/`server`, and
 *              `detectAppShape` claims both shapes on `Boolean(scripts.dev || scripts.start)`
 *              — the identical predicate this guard re-tests. Same finding: reported, not
 *              deleted.
 *
 * DISCIPLINE. Nothing under test is mocked — not `spawnSync`, not `child_process`, not the
 * module loader. Every fault here is produced by a REAL run of the real code: the driver
 * child's verdict genuinely overflows the parent's read buffer, and the marker genuinely
 * appears twice in the child's output. Every fixture lives under `os.tmpdir()` and is
 * removed afterwards; this repository's own `.ctoc/` state is never read for a verdict,
 * written or deleted. Every launch is an argument array with no shell. No retry, no
 * warm-up, no sleep: the one long-running case is the driver child itself, which exits on
 * its own.
 *
 * SECRETS. A driven command's stdout may carry a secret, so the module records only a byte
 * count and a matched flag. The two `driveAppSync` recovery arms are asserted in that same
 * direction: the sentinel planted in the fixture's declared command must not appear anywhere
 * in the returned result.
 */

const { describe, it, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const appRunner = require('../src/lib/app-runner');

const REPO = path.resolve(__dirname, '..');
const APP_RUNNER = path.join(REPO, 'src', 'lib', 'app-runner.js');

/** The marker the `--drive` child frames its verdict with (mirrors the module constant). */
const RESULT_MARKER = '__APP_RUNNER_RESULT__';

/** Planted in a fixture's declared command; must never surface in a recovery result. */
const SENTINEL = 'SENTINEL-MUST-NEVER-REACH-THE-EVIDENCE';

const created = [];

/** Create a temp project root under the OS temp dir. @returns {string} the project path */
function makeProject(prefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  created.push(dir);
  return dir;
}

/** Write a file inside a project, creating parent directories. */
function write(dir, rel, content) {
  const p = path.join(dir, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content, 'utf8');
}

/** Declare `general.entry_point` in a project's real settings file. */
function declare(dir, entryPoint) {
  write(dir, path.join('.ctoc', 'settings.json'), JSON.stringify({
    general: entryPoint === undefined ? {} : { entry_point: entryPoint }
  }));
}

after(() => {
  for (const dir of created) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch (e) {
      // A temp directory that will not delete is a cleanup nuisance, never a verdict about
      // the code under test — recorded on stderr rather than swallowed.
      process.stderr.write(`[fixture cleanup] could not remove ${dir}: ${e.message}\n`);
    }
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 163-164 — a declaration that is not an object at all.
// ─────────────────────────────────────────────────────────────────────────────
describe('app-runner: a declaration that is not an object is MALFORMED, never "nothing declared"', () => {
  it('a string, an array and a number each yield a reason that names the type found (lines 163-164)', () => {
    const cases = [
      { value: 'node src/commands/start.js', named: 'string' },
      { value: ['node', 'start.js'], named: 'an array' },
      { value: 30000, named: 'number' }
    ];

    for (const { value, named } of cases) {
      const dir = makeProject('ctoc-arch-nonobj-');
      declare(dir, value);

      const read = appRunner.readDeclaredEntryPoint(dir);

      assert.strictEqual(read.declaration, null,
        `a ${named} declaration must not be accepted as a declaration`);
      assert.strictEqual(typeof read.reason, 'string',
        'a malformed declaration reports a reason — absent and malformed are different facts');
      assert.ok(read.reason.includes('the declaration must be an object'),
        `the reason must say the declaration must be an object, got: ${read.reason}`);
      assert.ok(read.reason.includes(`got ${named}`),
        `the reason must name what was found (${named}), got: ${read.reason}`);
      assert.ok(read.reason.includes('general.entry_point'),
        'the reason names the settings key the human has to fix');
    }
  });

  it('both ladders carry a non-object declaration through as MALFORMED, never as "nothing to launch"', async () => {
    // The module draws a line this case pins on the non-object shape. A declaration that
    // was DRIVEN and did not answer is `applicable: true` (a failure). A declaration that
    // could not be UNDERSTOOD is the one honest `applicable: false` that may follow an
    // `entry_point` key — nothing was attempted — but it must stay distinguishable from a
    // project that never declared anything, in BOTH the asynchronous and the synchronous
    // ladder, or the two drift apart silently.
    const dir = makeProject('ctoc-arch-nonobj-drive-');
    write(dir, 'package.json', JSON.stringify({ name: 'fixture', version: '1.0.0', main: 'index.js' }));
    write(dir, 'index.js', 'module.exports = {};');
    declare(dir, 'node start.js');

    for (const res of [await appRunner.driveApp(dir), appRunner.driveAppSync(dir)]) {
      assert.strictEqual(res.evidence.shape, 'declared-entry-point-malformed',
        'a project that TRIED to declare is a different state from a library with nothing to launch');
      assert.ok(res.evidence.reason.includes('the declaration must be an object'),
        `the malformed reason travels into the drive result, got: ${res.evidence.reason}`);
      assert.ok(!/no human-facing runtime|shape could not be determined/.test(res.evidence.reason),
        'the malformed reason is never degraded to the never-declared reason');
      assert.strictEqual(res.launched, false, 'nothing was attempted');
      assert.strictEqual(res.responded, false);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 815-816 — driveCli's entry fallback for a `bin` that is neither string nor object.
// ─────────────────────────────────────────────────────────────────────────────
describe('app-runner: a command-line project whose `bin` is neither a string nor an object', () => {
  it('falls back to `main`, and to index.js when there is no main (lines 815-816)', async () => {
    // `bin: true` is truthy, so detectAppShape claims the cli shape, but it names no entry
    // file — driveCli must fall back rather than launch `undefined`.
    const withMain = makeProject('ctoc-arch-bin-main-');
    write(withMain, 'package.json', JSON.stringify({
      name: 'fixture', version: '1.0.0', bin: true, main: 'tool.js'
    }));
    write(withMain, 'tool.js', 'process.stdout.write("usage: tool [options]\\n");');

    assert.strictEqual(appRunner.detectAppShape(withMain), 'cli',
      'a truthy bin field claims the cli shape');

    const mainRes = await appRunner.driveApp(withMain);

    assert.strictEqual(mainRes.applicable, true);
    assert.strictEqual(mainRes.launched, true);
    assert.strictEqual(mainRes.responded, true, `expected a clean drive, got: ${mainRes.errors.join(' | ')}`);
    assert.strictEqual(mainRes.evidence.command, 'node tool.js --help',
      'the fallback entry is `main`, and it is what was actually run');
    assert.strictEqual(mainRes.evidence.exitCode, 0);

    // No `main` either: the last resort is index.js, and it really is the file that runs.
    const withoutMain = makeProject('ctoc-arch-bin-index-');
    write(withoutMain, 'package.json', JSON.stringify({
      name: 'fixture', version: '1.0.0', bin: true
    }));
    write(withoutMain, 'index.js', 'process.stdout.write("usage: index [options]\\n");');

    const indexRes = await appRunner.driveApp(withoutMain);

    assert.strictEqual(indexRes.responded, true, `expected a clean drive, got: ${indexRes.errors.join(' | ')}`);
    assert.strictEqual(indexRes.evidence.command, 'node index.js --help',
      'with no main declared the last-resort entry is index.js');
    assert.ok(indexRes.evidence.output.includes('usage: index'),
      'index.js is the file that actually ran');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 1117-1125 — the driver child could not be launched or read.
//
// THE FAULT IS REAL, NOT MOCKED. `driveAppSync` runs the async engine in a `--drive`
// child and reads its verdict through `spawnSync`, whose default read buffer is 1 MiB.
// The verdict echoes the declared command back in `evidence.command`, and an undrivable
// command is echoed a SECOND time inside the reason. A declared command a little over
// 1 MiB therefore produces a verdict the parent genuinely cannot read: `spawnSync`
// returns `error` = ENOBUFS. That is the same defect FAMILY the module's own `--drive`
// comment documents (a verdict lost to a pipe), which is why the arm exists.
// ─────────────────────────────────────────────────────────────────────────────
describe('app-runner: a driver child the synchronous caller cannot read is a FAILURE', () => {
  it('a verdict too large to read reports applicable:true, launched:false, and names the launch failure (lines 1117-1125)', () => {
    const dir = makeProject('ctoc-arch-driver-fail-');
    write(dir, 'package.json', JSON.stringify({ name: 'fixture', version: '1.0.0', main: 'index.js' }));
    write(dir, 'index.js', 'module.exports = {};');
    // Over 1 MiB, and undrivable (a shell operator), so the child returns its verdict
    // immediately without launching anything. The sentinel rides inside it.
    const huge = `node ${SENTINEL}${'x'.repeat(1024 * 1024 + 4096)} && true`;
    declare(dir, { command: huge, expect: 'never', timeout_ms: 5000 });

    const res = appRunner.driveAppSync(dir);

    // The load-bearing assertion, first: a drive that was ATTEMPTED and failed is a
    // failure. `applicable: false` here would mean "no app to launch" for a project that
    // declared exactly what to launch — the false-green shape this module exists to avoid.
    assert.strictEqual(res.applicable, true,
      'a driver that failed to launch is a FAILURE, never "nothing to launch"');
    assert.strictEqual(res.launched, false, 'nothing was launched');
    assert.strictEqual(res.responded, false, 'nothing responded');
    assert.strictEqual(res.evidence.shape, 'declared-entry-point',
      'the shape is still the declared one — the project declared an entry point');
    assert.strictEqual(res.durationMs, 0);
    assert.strictEqual(res.errors.length, 1);
    assert.ok(res.errors[0].startsWith('app-runner driver failed to launch: '),
      `the error must name the driver launch failure, got: ${res.errors[0]}`);

    // The recovery result carries a diagnosis, never a payload: nothing of the declared
    // command's body reaches the evidence a human reads (stdout may carry a secret).
    assert.ok(!JSON.stringify(res).includes(SENTINEL),
      'no part of the driven command may leak into the result');
    assert.ok(res.errors[0].length < 500,
      'the launch error is a short diagnosis, not a captured payload');
  });

  it('a result marker followed by unparseable JSON yields the error result, and does not throw (lines 1133-1134)', () => {
    const dir = makeProject('ctoc-arch-driver-parse-');
    write(dir, 'package.json', JSON.stringify({ name: 'fixture', version: '1.0.0', main: 'index.js' }));
    write(dir, 'index.js', 'module.exports = {};');
    write(dir, 'entry.js', 'process.stdout.write("hello\\n");');
    // The declared marker is the DRIVER's own framing marker, so it is echoed into the
    // verdict as `evidence.expect`. The parent then finds its LAST occurrence inside the
    // JSON body, and what follows that occurrence is a JSON fragment. A real run, no mock.
    declare(dir, { command: 'node entry.js', expect: RESULT_MARKER, timeout_ms: 10000 });

    const res = appRunner.driveAppSync(dir);

    assert.strictEqual(res.applicable, true,
      'an unreadable verdict is a failure of the check, never a skip of it');
    assert.strictEqual(res.launched, false);
    assert.strictEqual(res.responded, false,
      'a verdict that could not be parsed can never attest that the app responded');
    assert.strictEqual(res.evidence.shape, 'declared-entry-point');
    assert.strictEqual(res.errors.length, 1);
    assert.ok(res.errors[0].startsWith('Could not parse app-runner driver verdict.'),
      `the error must name the unreadable verdict, got: ${res.errors[0]}`);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 1193-1194 — the `--drive` child's options argument will not parse.
// ─────────────────────────────────────────────────────────────────────────────
describe('app-runner: the --drive child survives an options argument it cannot parse', () => {
  it('an unparseable options argument defaults to {} and the child still reports a verdict (lines 1193-1194)', () => {
    const dir = makeProject('ctoc-arch-drive-opts-');
    write(dir, 'package.json', JSON.stringify({ name: 'fixture', version: '1.0.0', main: 'index.js' }));
    write(dir, 'index.js', 'module.exports = {};');

    const proc = spawnSync(
      process.execPath,
      [APP_RUNNER, '--drive', dir, '{ this is not json'],
      { encoding: 'utf8', shell: false, timeout: 60000, env: { ...process.env } }
    );

    assert.strictEqual(proc.error, undefined, 'the driver child must run');
    assert.strictEqual(proc.status, 0,
      `the driver child exits 0 and carries its verdict inside; stderr: ${(proc.stderr || '').slice(0, 300)}`);

    const out = String(proc.stdout || '');
    const at = out.lastIndexOf(RESULT_MARKER);
    assert.ok(at >= 0, `the child must still print a framed verdict, got: ${out.slice(0, 300)}`);

    const verdict = JSON.parse(out.slice(at + RESULT_MARKER.length).trim());
    // The options defaulted to {}, so the real ladder ran: a library project with no
    // declaration is honestly "nothing to launch".
    assert.strictEqual(verdict.applicable, false);
    assert.strictEqual(verdict.evidence.shape, 'library');
    assert.ok(!/app-runner driver exception/.test(JSON.stringify(verdict.errors)),
      'a bad options argument is absorbed, not turned into a driver exception');
  });
});
