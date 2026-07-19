'use strict';

/**
 * THE LAST MILE DRIVES THE REAL ENTRY POINT.
 *
 * The defect these tests close: the app last-mile check could only recognise an
 * entry point it knew how to GUESS at (a `bin` field, a `dev`/`start` script), so
 * a project whose human entry point is a one-shot command-line dashboard reported
 * `applicable: false` — "nothing to launch" — while a human opens that entry point
 * every day. "No app to launch" is not "no entry point", and a reachability check
 * that opts itself out on a project WITH a live entry point passes every slice that
 * adds a module and its test while nothing proves anyone can reach it.
 *
 * The fix under test: the project DECLARES its entry point in
 * `.ctoc/settings.json` under `general.entry_point`, and the check drives what was
 * declared. The load-bearing property is that a declared-but-failing entry point is
 * a FAILURE and never `applicable: false` — reporting "not applicable" for
 * something that was attempted and did not answer is exactly the false-green shape
 * this repository fences.
 *
 * Fixtures are hermetic temp projects whose declared command is a generated Node
 * script; nothing here depends on this repository's own dashboard. Every fixture
 * command is `node <file>` so `resolveScriptCommand` maps it to `process.execPath`
 * with `shell:false` — no shell builtin, no `/bin` path, no platform-specific
 * syntax (case 13).
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const appRunner = require('../src/lib/app-runner');
const { driveApp, driveAppSync } = appRunner;
const { runVerify } = require('../src/lib/step-13-verify');

const created = [];

/** Create a temp project root. @returns {string} the project path */
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
  }, null, 2));
}

/** A library-shaped package.json — no dev/start script, no bin. */
function libraryPkg(dir, extra = {}) {
  write(dir, 'package.json', JSON.stringify({
    name: 'fixture', version: '1.0.0', main: 'index.js', ...extra
  }));
  write(dir, 'index.js', 'module.exports = {};');
}

after(() => {
  for (const dir of created) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch (e) {
      // A temp directory that cannot be removed is a cleanup nuisance, never a
      // verdict about the code under test — recorded, not swallowed silently.
      process.stderr.write(`[fixture cleanup] could not remove ${dir}: ${e.message}\n`);
    }
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Cases 1-5, 7, 8 — the declared entry point is driven, and every non-response
// is a FAILURE with a diagnosis, never a skip.
// ─────────────────────────────────────────────────────────────────────────────
describe('a DECLARED entry point is driven by the last-mile check', () => {
  it('1: a declared entry point that runs and prints its marker PASSES', async () => {
    const dir = makeProject('ctoc-ep-ok-');
    libraryPkg(dir);
    write(dir, 'entry.js', 'process.stdout.write("READY-MARKER\\n");');
    declare(dir, { command: 'node entry.js', expect: 'READY-MARKER' });

    const res = await driveApp(dir);

    assert.strictEqual(res.applicable, true, 'a declared entry point is always applicable');
    assert.strictEqual(res.launched, true);
    assert.strictEqual(res.responded, true);
    assert.strictEqual(res.evidence.shape, 'declared-entry-point');
    assert.strictEqual(res.evidence.exitCode, 0);
    assert.strictEqual(res.evidence.matched, true);
    assert.deepStrictEqual(res.errors, []);
  });

  it('2: a NON-RESPONDING declared entry point FAILS verification (the defect this closes)', () => {
    const dir = makeProject('ctoc-ep-fail-');
    libraryPkg(dir);
    write(dir, 'entry.js', 'process.exitCode = 1;');
    declare(dir, { command: 'node entry.js', expect: 'READY-MARKER' });

    const res = runVerify(dir);

    assert.strictEqual(res.checks.appRuns.applicable, true,
      'a declared entry point must NEVER be reported not-applicable');
    assert.strictEqual(res.checks.appRuns.responded, false);
    assert.strictEqual(res.passed, false, 'a dead entry point must FAIL verification');
    assert.ok(res.errors.some((e) => /App did not run/.test(e)),
      `an error must name the entry point; got: ${JSON.stringify(res.errors)}`);
  });

  it('3: exit 0 with no marker is a failure naming the MISSING MARKER', async () => {
    const dir = makeProject('ctoc-ep-silent-');
    libraryPkg(dir);
    write(dir, 'entry.js', '// prints nothing, exits 0');
    declare(dir, { command: 'node entry.js', expect: 'READY-MARKER' });

    const res = await driveApp(dir);

    assert.strictEqual(res.applicable, true);
    assert.strictEqual(res.responded, false);
    assert.strictEqual(res.evidence.matched, false);
    const joined = res.errors.join(' ');
    assert.ok(/READY-MARKER/.test(joined), `the error must name the missing marker; got: ${joined}`);
    // The exit code must not be BLAMED. Naming it is correct and desirable — the
    // shipped message says "exited 0 but ... The exit status was fine", which is the
    // separate diagnosis this case exists to pin. What must never appear is the
    // failure phrasing reserved for a bad exit.
    assert.ok(!/exited with code|was killed by|expected 0/.test(joined),
      `a clean exit must not be blamed; got: ${joined}`);
    assert.ok(/exit status was fine/.test(joined),
      `the message must positively clear the exit code; got: ${joined}`);
  });

  it('4: a non-zero exit is diagnosed separately from the marker', async () => {
    const dir = makeProject('ctoc-ep-exit3-');
    libraryPkg(dir);
    write(dir, 'entry.js', 'process.stdout.write("READY-MARKER\\n"); process.exitCode = 3;');
    declare(dir, { command: 'node entry.js', expect: 'READY-MARKER' });

    const res = await driveApp(dir);

    assert.strictEqual(res.responded, false);
    assert.strictEqual(res.evidence.exitCode, 3);
    assert.strictEqual(res.evidence.matched, true, 'the marker WAS printed');
    const joined = res.errors.join(' ');
    assert.ok(/exit(ed)? .*3/.test(joined), `the error must name the non-zero exit; got: ${joined}`);
    assert.ok(!/missing|did not print/i.test(joined),
      `the error must NOT claim the marker was missing; got: ${joined}`);
  });

  it('5: a HANG fails loudly within the budget — never applicable:false', async () => {
    const dir = makeProject('ctoc-ep-hang-');
    libraryPkg(dir);
    write(dir, 'entry.js', 'setTimeout(() => {}, 120000);');
    declare(dir, { command: 'node entry.js', expect: 'READY-MARKER', timeout_ms: 500 });

    const started = Date.now();
    const res = await driveApp(dir);
    const elapsed = Date.now() - started;

    assert.strictEqual(res.applicable, true, 'a timeout is a FAILURE, never not-applicable');
    assert.strictEqual(res.launched, true);
    assert.strictEqual(res.responded, false);
    assert.strictEqual(res.evidence.timedOut, true);
    assert.ok(res.errors.some((e) => /did not respond within 500/.test(e)),
      `the error must name the budget; got: ${JSON.stringify(res.errors)}`);
    assert.ok(elapsed < 20000, `the check must be bounded; took ${elapsed}ms`);
  });

  it('7: a MALFORMED declaration is reported, not silently ignored', async () => {
    const dir = makeProject('ctoc-ep-malformed-');
    libraryPkg(dir);
    declare(dir, {}); // declared, but no command

    const res = await driveApp(dir);

    assert.strictEqual(res.applicable, false, 'nothing could be attempted');
    assert.ok(/malformed/i.test(res.evidence.reason),
      `the reason must name the malformed declaration; got: ${res.evidence.reason}`);
    assert.ok(/entry_point/.test(res.evidence.reason),
      'the reason must name the settings key so a reader can fix it');
    assert.deepStrictEqual(res.errors, [], 'a malformed declaration is not a gate failure');
  });

  it('7b: a declared but UNDRIVABLE command is a FAILURE, never a skip', async () => {
    const dir = makeProject('ctoc-ep-compound-');
    libraryPkg(dir);
    declare(dir, { command: 'node a.js && node b.js', expect: 'X' });

    const res = await driveApp(dir);

    assert.strictEqual(res.applicable, true,
      'the project STATED this is its entry point; failing to run it is a verdict, not a skip');
    assert.strictEqual(res.launched, false);
    assert.strictEqual(res.responded, false);
    assert.ok(/shell operator/i.test(res.errors.join(' ')),
      `the error must explain why it could not be launched; got: ${res.errors.join(' ')}`);
  });

  it('7c: a command that cannot be spawned at all FAILS with the spawn error', async () => {
    const dir = makeProject('ctoc-ep-enoent-');
    libraryPkg(dir);
    declare(dir, { command: 'ctoc-no-such-binary-xyz --version', expect: 'X', timeout_ms: 10000 });

    const res = await driveApp(dir);

    assert.strictEqual(res.applicable, true);
    assert.strictEqual(res.responded, false);
    assert.ok(res.errors.length > 0, 'a missing binary must produce a loud error');
    assert.ok(/ctoc-no-such-binary-xyz/.test(res.errors.join(' ')),
      `the error must name the command; got: ${res.errors.join(' ')}`);
  });

  it('7c-sync: a command that makes spawn THROW fails the check instead of crashing VERIFY', async () => {
    const dir = makeProject('ctoc-ep-spawn-throw-');
    libraryPkg(dir);
    // A NUL byte in an argument makes child_process.spawn throw SYNCHRONOUSLY
    // (ERR_INVALID_ARG_VALUE) rather than emit an async 'error'. A declared entry
    // point that cannot even be spawned must produce a verdict, never an exception
    // escaping into the middle of a Step-14 run.
    declare(dir, { command: 'node entry\u0000.js', expect: 'X' });

    let res;
    await assert.doesNotReject(async () => { res = await driveApp(dir); });

    assert.strictEqual(res.applicable, true);
    assert.strictEqual(res.launched, false);
    assert.strictEqual(res.responded, false);
    assert.ok(/failed to spawn/.test(res.errors.join(' ')),
      `the error must name the spawn failure; got: ${res.errors.join(' ')}`);
  });

  it('7d: without `expect`, a clean exit is the whole verdict', async () => {
    const dir = makeProject('ctoc-ep-noexpect-');
    libraryPkg(dir);
    write(dir, 'entry.js', 'process.stdout.write("anything at all\\n");');
    declare(dir, { command: 'node entry.js' });

    const ok = await driveApp(dir);
    assert.strictEqual(ok.responded, true, 'exit 0 with no declared marker is a pass');
    assert.strictEqual(ok.evidence.expect, null);
    assert.strictEqual(ok.evidence.matched, true);

    write(dir, 'entry.js', 'process.exitCode = 2;');
    const bad = await driveApp(dir);
    assert.strictEqual(bad.responded, false, 'a non-zero exit still fails without a marker');
    assert.ok(/exited with code 2/.test(bad.errors.join(' ')));
  });

  it('8: a declaration WINS over shape detection', async () => {
    const dir = makeProject('ctoc-ep-precedence-');
    write(dir, 'package.json', JSON.stringify({
      name: 'both', version: '1.0.0', scripts: { start: 'node server.js' }
    }));
    write(dir, 'server.js', 'require("http").createServer((q, s) => s.end("hi")).listen(process.env.PORT);');
    write(dir, 'entry.js', 'process.stdout.write("DECLARED-WINS\\n");');
    declare(dir, { command: 'node entry.js', expect: 'DECLARED-WINS' });

    const res = await driveApp(dir);

    assert.strictEqual(res.evidence.shape, 'declared-entry-point',
      'an explicit declaration outranks a heuristic about the project');
    assert.strictEqual(res.responded, true);
    assert.ok(res.evidence.port === undefined, 'no server was polled');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Case 6 — the "nothing else regresses" guard. A project with NO declaration
// behaves exactly as it does today, with a reason that now names BOTH halves.
// ─────────────────────────────────────────────────────────────────────────────
describe('no declaration ⇒ today’s behaviour, with an honest reason', () => {
  it('6: a library with no declaration is applicable:false, naming both absences', async () => {
    const dir = makeProject('ctoc-ep-none-');
    libraryPkg(dir);
    declare(dir, undefined); // settings exist, no entry_point

    const res = await driveApp(dir);

    // First half — unchanged behaviour (GREEN before this slice).
    assert.strictEqual(res.applicable, false);
    assert.strictEqual(res.launched, false);
    assert.deepStrictEqual(res.errors, []);
    assert.ok(/library/.test(res.evidence.reason), 'the existing half of the reason survives');

    // Second half — the reason gains the missing half (RED before this slice).
    assert.ok(/no entry point.*declared|entry point.*not declared/i.test(res.evidence.reason),
      `the reason must name the absent declaration; got: ${res.evidence.reason}`);
    assert.ok(/entry_point/.test(res.evidence.reason),
      `the reason must name the settings key that enables the check; got: ${res.evidence.reason}`);
  });

  it('6b: the native/registry not-applicable reason ALSO names the absent declaration', async () => {
    // This repository's OWN evidence takes the capability-registry path, not the
    // library literal — so the honesty fix must reach this reason too, or the
    // project that motivated the slice still gets a reason that teaches nothing.
    const dir = makeProject('ctoc-ep-native-');
    write(dir, 'Cargo.toml', '[package]\nname = "fixture"\nversion = "0.1.0"\n');
    write(dir, path.join('src', 'main.rs'), 'fn main() {}\n');

    const res = await driveApp(dir);

    assert.strictEqual(res.applicable, false);
    if (res.evidence.shape === 'native') {
      assert.ok(/entry_point/.test(res.evidence.reason),
        `the native reason must name the settings key too; got: ${res.evidence.reason}`);
    } else {
      assert.ok(/entry_point/.test(res.evidence.reason),
        `the reason must name the settings key; got: ${res.evidence.reason}`);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Cases 9-12 — the gate integration and the trust properties the cost analysis
// demands: substantive, stream-matched, orphan-free, repeatable.
// ─────────────────────────────────────────────────────────────────────────────
describe('the driven entry point is trustworthy inside the gate', () => {
  it('9: a driven entry point COUNTS as a substantive check', () => {
    const okDir = makeProject('ctoc-ep-subst-ok-');
    libraryPkg(okDir);
    write(okDir, 'entry.js', 'process.stdout.write("READY-MARKER\\n");');
    declare(okDir, { command: 'node entry.js', expect: 'READY-MARKER' });

    const ok = runVerify(okDir);
    assert.strictEqual(ok.checks.appRuns.applicable, true);
    assert.strictEqual(ok.checks.appRuns.launched, true);
    assert.strictEqual(ok.passed, true,
      `a project whose only substantive check is a passing entry point is a PASS; got: ${JSON.stringify(ok.errors)}`);
    assert.ok(!/no-verifiable-toolchain/.test(ok.errors.join(' ')),
      'a driven entry point means something DID run');

    const badDir = makeProject('ctoc-ep-subst-bad-');
    libraryPkg(badDir);
    write(badDir, 'entry.js', 'process.exitCode = 1;');
    declare(badDir, { command: 'node entry.js', expect: 'READY-MARKER' });

    const bad = runVerify(badDir);
    assert.strictEqual(bad.passed, false, 'a failing entry point is NOT a pass');
  });

  it('10: matching runs on the STREAM — the marker is found after 2 MB of output', async () => {
    const dir = makeProject('ctoc-ep-stream-');
    libraryPkg(dir);
    write(dir, 'entry.js', [
      'const chunk = "x".repeat(64 * 1024);',
      'for (let i = 0; i < 32; i++) process.stdout.write(chunk);',
      'process.stdout.write("READY-MARKER\\n");'
    ].join('\n'));
    declare(dir, { command: 'node entry.js', expect: 'READY-MARKER', timeout_ms: 30000 });

    const res = await driveApp(dir);

    assert.strictEqual(res.responded, true,
      'the marker arrives LAST, after far more output than any retained buffer — ' +
      'finding it proves the match runs on the stream, not on a truncated copy');
    assert.strictEqual(res.evidence.matched, true);
    assert.ok(res.evidence.outputBytes >= 2 * 1024 * 1024,
      `the byte COUNT must reflect the full stream; got: ${res.evidence.outputBytes}`);
    const evidenceSize = JSON.stringify(res.evidence).length;
    assert.ok(evidenceSize < 64 * 1024,
      `retained evidence must be bounded (and must not carry the output); got ${evidenceSize} bytes`);
  });

  it('11: a timed-out entry point leaves NO orphaned process', async () => {
    const dir = makeProject('ctoc-ep-orphan-');
    libraryPkg(dir);
    const pidFile = path.join(dir, 'child.pid');
    write(dir, 'entry.js', [
      `require("fs").writeFileSync(${JSON.stringify(pidFile)}, String(process.pid));`,
      'setTimeout(() => {}, 120000);'
    ].join('\n'));
    declare(dir, { command: 'node entry.js', expect: 'READY-MARKER', timeout_ms: 600 });

    const res = await driveApp(dir);
    assert.strictEqual(res.responded, false);

    const pid = Number(fs.readFileSync(pidFile, 'utf8').trim());
    assert.ok(Number.isFinite(pid) && pid > 0, 'the fixture must have recorded its pid');
    let alive = true;
    try {
      process.kill(pid, 0); // signal 0 = existence probe, sends nothing
    } catch (e) {
      alive = false; // ESRCH: the process is gone, which is the pass condition
      assert.ok(/ESRCH|EPERM/.test(e.code || ''), `unexpected probe error: ${e.code}`);
    }
    assert.strictEqual(alive, false, 'the child must be reaped before the call returns');
  });

  it('12: twenty consecutive runs produce twenty identical verdicts', async () => {
    const dir = makeProject('ctoc-ep-determinism-');
    libraryPkg(dir);
    write(dir, 'entry.js', 'process.stdout.write("READY-MARKER\\n");');
    declare(dir, { command: 'node entry.js', expect: 'READY-MARKER' });

    const verdicts = new Set();
    for (let i = 0; i < 20; i++) {
      // Sequential BY DESIGN: twenty runs in series is what a repeatability guard
      // means. Running them concurrently would prove something else entirely.
      const res = await driveApp(dir);
      verdicts.add(JSON.stringify({
        applicable: res.applicable,
        launched: res.launched,
        responded: res.responded,
        matched: res.evidence.matched,
        exitCode: res.evidence.exitCode,
        errors: res.errors
      }));
    }

    assert.strictEqual(verdicts.size, 1,
      `a gate that must stay trustworthy has to be repeatable; got ${verdicts.size} distinct verdicts: ` +
      `${[...verdicts].join(' | ')}`);
  });

  it('13/sync: driveAppSync drives the declaration too (the live Step-14 path)', () => {
    const dir = makeProject('ctoc-ep-sync-');
    libraryPkg(dir);
    write(dir, 'entry.js', 'process.stdout.write("READY-MARKER\\n");');
    declare(dir, { command: 'node entry.js', expect: 'READY-MARKER' });

    const res = driveAppSync(dir);

    assert.strictEqual(res.applicable, true,
      'the SYNC path must not short-circuit a library-shaped project past its declaration');
    assert.strictEqual(res.responded, true);
    assert.strictEqual(res.evidence.shape, 'declared-entry-point');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// The declaration reader, exercised directly.
// ─────────────────────────────────────────────────────────────────────────────
describe('readDeclaredEntryPoint', () => {
  let dir;
  before(() => { dir = makeProject('ctoc-ep-read-'); libraryPkg(dir); });

  it('returns null with NO reason when nothing is declared', () => {
    declare(dir, undefined);
    const decl = appRunner.readDeclaredEntryPoint(dir);
    assert.strictEqual(decl.declaration, null);
    assert.strictEqual(decl.reason, null, 'absent is not malformed');
  });

  it('returns a reason for each malformed shape', () => {
    for (const bad of [{}, { command: '' }, { command: 42 }, { command: 'node e.js', expect: 7 },
      { command: 'node e.js', timeout_ms: 'soon' }, { command: 'node e.js', timeout_ms: 0 }]) {
      declare(dir, bad);
      const decl = appRunner.readDeclaredEntryPoint(dir);
      assert.strictEqual(decl.declaration, null, `must not accept ${JSON.stringify(bad)}`);
      assert.ok(typeof decl.reason === 'string' && decl.reason.length > 0,
        `must record a reason for ${JSON.stringify(bad)}`);
    }
  });

  it('accepts a declaration without expect (exit 0 is then the whole verdict)', () => {
    declare(dir, { command: 'node entry.js' });
    const decl = appRunner.readDeclaredEntryPoint(dir);
    assert.ok(decl.declaration, 'expect is optional');
    assert.strictEqual(decl.declaration.expect, null);
    assert.strictEqual(decl.reason, null);
  });
});
