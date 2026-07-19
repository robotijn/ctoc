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

// ═════════════════════════════════════════════════════════════════════════════
// THE SETTLED FINDING, PINNED.
//
// The worry was that the three opt-out reasons a reader sees in evidence
// artifacts ("no human-facing runtime", "shape could not be determined", and the
// capability-registry build-and-test reason) might be THREE code paths, so that
// making the check drive a DECLARED entry point would have closed only one of
// them. It is not three paths. There are three PRODUCERS of an opt-out result —
// `malformedDeclarationResult`, `nativeNotApplicableResult`, and the inline
// library/unknown result via `noRuntimeReason` — and all three sit BELOW one
// decision point: the declaration is read first. That single decision point is
// written TWICE, once in the asynchronous `driveApp` and once in the synchronous
// `driveAppSync`, which is the real hazard: two ladders can drift apart silently.
// Ladder case 4 is what makes that drift a test failure instead of a surprise.
//
// Until now this was true by reading the file and by nothing else.
// ═════════════════════════════════════════════════════════════════════════════

/** A fixture the capability registry classifies as a native run target. */
function registryPkg(dir) {
  write(dir, 'Cargo.toml', '[package]\nname = "fixture"\nversion = "0.1.0"\n');
  write(dir, path.join('src', 'main.rs'), 'fn main() {}\n');
}

/** The entry script every ladder fixture declares — one command, renders and exits. */
function entryScript(dir) {
  write(dir, 'entry.js', 'process.stdout.write("READY-MARKER\\n");');
}

describe('the opt-out ladder is ONE ladder, and the declaration sits above all of it', () => {
  it('ladder 1: the declaration outranks a LIBRARY shape', async () => {
    const dir = makeProject('ctoc-ladder-lib-');
    libraryPkg(dir);
    entryScript(dir);
    declare(dir, { command: 'node entry.js', expect: 'READY-MARKER' });

    const res = await driveApp(dir);
    assert.strictEqual(res.applicable, true, 'a library that DECLARES an entry point is not an opt-out');
    assert.strictEqual(res.evidence.shape, 'declared-entry-point');
    assert.strictEqual(res.responded, true);
  });

  it('ladder 2: the declaration outranks a capability-registry-detected target', async () => {
    const dir = makeProject('ctoc-ladder-reg-');
    registryPkg(dir);
    entryScript(dir);
    declare(dir, { command: 'node entry.js', expect: 'READY-MARKER' });

    // Sanity: without the declaration this fixture IS a registry target — so the
    // case proves the declaration outranks a live producer, not a dead branch.
    assert.ok(appRunner.detectRunTarget(dir), 'fixture must be registry-detectable for this case to mean anything');

    const res = await driveApp(dir);
    assert.strictEqual(res.applicable, true, 'a registry-detected project that DECLARES is not an opt-out');
    assert.strictEqual(res.evidence.shape, 'declared-entry-point');
    assert.notStrictEqual(res.evidence.shape, 'native');
  });

  it('ladder 3: the declaration outranks an UNKNOWN shape', async () => {
    const dir = makeProject('ctoc-ladder-unk-');
    entryScript(dir); // no package.json, no registry marker — nothing to classify
    declare(dir, { command: 'node entry.js', expect: 'READY-MARKER' });

    assert.strictEqual(appRunner.detectAppShape(dir), 'unknown');
    const res = await driveApp(dir);
    assert.strictEqual(res.applicable, true, 'an unshaped project that DECLARES is not an opt-out');
    assert.strictEqual(res.evidence.shape, 'declared-entry-point');
  });

  it('ladder 4: the async and synchronous ladders agree on every fixture', async () => {
    const declaredLib = makeProject('ctoc-ladder-agree-lib-');
    libraryPkg(declaredLib); entryScript(declaredLib);
    declare(declaredLib, { command: 'node entry.js', expect: 'READY-MARKER' });

    const declaredReg = makeProject('ctoc-ladder-agree-reg-');
    registryPkg(declaredReg); entryScript(declaredReg);
    declare(declaredReg, { command: 'node entry.js', expect: 'READY-MARKER' });

    const declaredUnknown = makeProject('ctoc-ladder-agree-unk-');
    entryScript(declaredUnknown);
    declare(declaredUnknown, { command: 'node entry.js', expect: 'READY-MARKER' });

    const undeclared = makeProject('ctoc-ladder-agree-none-');
    libraryPkg(undeclared);
    declare(undeclared, undefined);

    for (const dir of [declaredLib, declaredReg, declaredUnknown, undeclared]) {
      const asyncRes = await driveApp(dir);
      const syncRes = driveAppSync(dir);
      assert.strictEqual(syncRes.applicable, asyncRes.applicable,
        `the two ladders disagree on applicable for ${path.basename(dir)}`);
      // The producer identity — a drift in WHICH producer answered is the failure
      // this case exists to catch, not merely a different boolean.
      assert.strictEqual(syncRes.evidence.shape, asyncRes.evidence.shape,
        `the two ladders disagree on the producer for ${path.basename(dir)}`);
    }
  });

  it('ladder 5: each of the three opt-out producers is identifiable', async () => {
    const malformedDir = makeProject('ctoc-ladder-mal-');
    libraryPkg(malformedDir);
    declare(malformedDir, {}); // declared and unreadable

    const registryDir = makeProject('ctoc-ladder-nat-');
    registryPkg(registryDir);

    const libDir = makeProject('ctoc-ladder-none-');
    libraryPkg(libDir);
    declare(libDir, undefined);

    const malformed = await driveApp(malformedDir);
    const registry = await driveApp(registryDir);
    const library = await driveApp(libDir);

    for (const res of [malformed, registry, library]) {
      assert.strictEqual(res.applicable, false);
      assert.deepStrictEqual(res.errors, [], 'an opt-out contributes no error');
    }

    const shapes = [malformed.evidence.shape, registry.evidence.shape, library.evidence.shape];
    assert.strictEqual(new Set(shapes).size, 3,
      `the three producers must be distinguishable; got shapes ${JSON.stringify(shapes)}`);

    // Each reason teaches the reader how to turn the check on: the two heuristic
    // producers name the settings key; the malformed one names the specific defect.
    assert.ok(/entry_point/.test(registry.evidence.reason), 'the registry reason must name the settings key');
    assert.ok(/entry_point/.test(library.evidence.reason), 'the library reason must name the settings key');
    assert.ok(/`command` is required/.test(malformed.evidence.reason),
      `the malformed reason must name the specific defect; got: ${malformed.evidence.reason}`);
  });

  it('ladder 6: a malformed declaration is NEVER degraded to "none declared"', async () => {
    const dir = makeProject('ctoc-ladder-mal2-');
    libraryPkg(dir);
    declare(dir, {}); // entry_point present, empty

    for (const res of [await driveApp(dir), driveAppSync(dir)]) {
      assert.strictEqual(res.evidence.shape, 'declared-entry-point-malformed');
      assert.ok(!/no human-facing runtime|shape could not be determined/.test(res.evidence.reason),
        'a project that TRIED to declare is a different state from one that never did');
    }
  });

  it('ladder 7: the entry-point block documented in CLAUDE.md is still valid', () => {
    const claudeMd = path.join(__dirname, '..', 'CLAUDE.md');
    const doc = fs.readFileSync(claudeMd, 'utf8');

    // Find the fenced JSON block that declares an entry point. If it cannot be
    // found or cannot be parsed, this case FAILS LOUDLY naming what it looked for
    // — a documentation check that silently passes on a document it could not read
    // is the very false-green shape this file exists to fence.
    const fences = [...doc.matchAll(/```json\n([\s\S]*?)```/g)].map((m) => m[1]);
    const candidates = fences.filter((f) => f.includes('entry_point'));
    assert.strictEqual(candidates.length, 1,
      `expected exactly ONE fenced \`\`\`json block containing "entry_point" in ${claudeMd}; ` +
      `found ${candidates.length} among ${fences.length} json fences. The documented declaration ` +
      'must be locatable, or this case is asserting nothing.');

    let parsed;
    try {
      // The documented block is shown with trailing-comment annotations elsewhere in
      // the file; this one is plain JSON and must parse as-is.
      parsed = JSON.parse(candidates[0]);
    } catch (e) {
      assert.fail(`the documented entry_point block in ${claudeMd} is not parseable JSON: ${e.message}\n` +
        `block was:\n${candidates[0]}`);
    }

    assert.ok(parsed.general && parsed.general.entry_point,
      'the documented block must sit under general.entry_point, the key the reader actually sets');

    // The real reader is the judge — not a second copy of its rules written here.
    const dir = makeProject('ctoc-ladder-doc-');
    libraryPkg(dir);
    write(dir, path.join('.ctoc', 'settings.json'), JSON.stringify(parsed, null, 2));
    const decl = appRunner.readDeclaredEntryPoint(dir);
    assert.strictEqual(decl.reason, null,
      `the documented block was rejected by the real reader: ${decl.reason}`);
    assert.ok(decl.declaration, 'the documented block must produce a usable declaration');
    assert.strictEqual(decl.declaration.command, parsed.general.entry_point.command);
  });

  it('ladder 8: this repository is honestly UNDECLARED today', () => {
    // Deliberate, recorded state — NOT an endorsement. This slice does not throw
    // the switch: declaring an entry point here makes every Step 14 verification
    // launch a real process, which is a decision with timing and gate consequences
    // that belongs to the human in a quiet moment. Recording it as an assertion is
    // what makes throwing that switch VISIBLE: this one case turns red and names
    // itself, instead of the last mile's behaviour changing silently.
    const repoRoot = path.join(__dirname, '..');
    const decl = appRunner.readDeclaredEntryPoint(repoRoot);
    assert.strictEqual(decl.declaration, null,
      'this repository now DECLARES an entry point — that is a deliberate change; ' +
      'update this case (and expect Step 14 to launch the menu on every verification).');
    assert.strictEqual(decl.reason, null, 'undeclared is not malformed');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// THE VERDICT MUST SURVIVE ITS OWN PIPE.
//
// `driveAppSync` runs the asynchronous engine inside a `--drive` child and reads
// the verdict off that child's stdout. The child wrote the verdict and then called
// `process.exit(0)` — the exit-with-pending-writes signature this repository
// fences by name. A write to a PIPE is asynchronous, so `process.exit` discards
// whatever is still buffered; the verdict is printed LAST and is therefore exactly
// what is lost. The parent then finds no parseable marker and fails closed.
//
// Being precise about the failure mode, because overstating it would be the same
// dishonesty: this is a flaky false RED, not a false green. The gate FAILS on a
// verdict that was computed correctly and then thrown away. It gets worse as the
// evidence payload grows — that is, exactly as the check becomes more useful.
// ═════════════════════════════════════════════════════════════════════════════
describe('the --drive child does not throw away the verdict it just printed', () => {
  const APP_RUNNER = path.join(__dirname, '..', 'src', 'lib', 'app-runner.js');
  const { spawnSync } = require('node:child_process');

  /**
   * A fixture whose verdict is comfortably larger than a pipe's 64KB capacity.
   * The size comes from real code: a declared command containing a shell operator
   * is rejected as undrivable BEFORE anything is spawned, and both the evidence
   * and the diagnosis echo the command in full. No process ever receives the long
   * argument, so no operating-system argument-length limit is involved.
   */
  function hugeVerdictProject() {
    const dir = makeProject('ctoc-pipe-huge-');
    libraryPkg(dir);
    const longCommand = `node ${'x'.repeat(120000)} && echo done`;
    declare(dir, { command: longCommand });
    return { dir, longCommand };
  }

  it('pipe 9: a verdict larger than the pipe buffer is delivered WHOLE', () => {
    const { dir, longCommand } = hugeVerdictProject();
    // Measured on the DECLARATION, not on what came back: the received payload is
    // the very thing under test, so sizing the case by it would let a truncated
    // read excuse itself.
    assert.ok(longCommand.length > 65536,
      `this case only means something if the verdict exceeds a pipe buffer; the declared ` +
      `command alone is ${longCommand.length} bytes`);

    const proc = spawnSync(process.execPath, [APP_RUNNER, '--drive', dir, '{}'],
      { encoding: 'utf8', shell: false, maxBuffer: 64 * 1024 * 1024 });
    const out = proc.stdout || '';
    const marker = out.lastIndexOf('__APP_RUNNER_RESULT__');
    assert.ok(marker >= 0, `the child printed no verdict marker at all; stdout was ${out.length} bytes`);

    const payload = out.slice(marker + '__APP_RUNNER_RESULT__'.length).trim();

    let verdict;
    try {
      verdict = JSON.parse(payload);
    } catch (e) {
      assert.fail(
        'the verdict was computed and then DISCARDED by process.exit: received only ' +
        `${out.length} bytes, ending ${JSON.stringify(out.slice(-40))}, for a verdict whose ` +
        `command field alone is ${longCommand.length} bytes. Parse error: ${e.message}`);
    }
    assert.strictEqual(verdict.evidence.command, longCommand,
      'the verdict must arrive intact, not merely parseable');
  });

  it('pipe 9b: the synchronous caller parses that same large verdict', () => {
    const { dir, longCommand } = hugeVerdictProject();

    const res = driveAppSync(dir);

    assert.ok(!res.errors.some((e) => /Could not parse app-runner driver verdict/.test(e)),
      `the parent lost the verdict: ${res.errors.join(' | ').slice(0, 240)}`);
    assert.strictEqual(res.applicable, true, 'a declared entry point is always a verdict, never a skip');
    assert.strictEqual(res.evidence.command, longCommand);
    assert.ok(res.errors.some((e) => /shell operator/.test(e)),
      'the real diagnosis must survive the trip, not just the envelope');
  });

  it('pipe 10: the failure branch delivers its verdict too, and exits 0', () => {
    // `{"port":"x"}` makes the asynchronous engine reject inside the child, which
    // is the `catch` handler — the second `process.exit(0)` site. Real input, no
    // test double: the child parses this options payload from its own argv.
    const dir = makeProject('ctoc-pipe-catch-');
    write(dir, 'package.json', JSON.stringify({
      name: 'fixture', version: '1.0.0', scripts: { dev: 'node server.js' }
    }));
    write(dir, 'server.js', 'setTimeout(() => {}, 50);');

    const proc = spawnSync(process.execPath, [APP_RUNNER, '--drive', dir, JSON.stringify({ port: 'x' })],
      { encoding: 'utf8', shell: false, maxBuffer: 64 * 1024 * 1024 });

    assert.strictEqual(proc.status, 0, 'the failure branch still exits 0 — the verdict carries the failure');
    const out = proc.stdout || '';
    const marker = out.lastIndexOf('__APP_RUNNER_RESULT__');
    assert.ok(marker >= 0, `the catch branch printed no verdict; stderr: ${(proc.stderr || '').slice(0, 200)}`);
    const verdict = JSON.parse(out.slice(marker + '__APP_RUNNER_RESULT__'.length).trim());
    assert.strictEqual(verdict.applicable, true);
    assert.strictEqual(verdict.launched, false);
    assert.ok(verdict.errors.some((e) => /app-runner driver exception/.test(e)),
      `the catch branch must deliver its diagnosis; got ${JSON.stringify(verdict.errors)}`);
  });

  it('pipe 11: an unreadable verdict is still an ERROR, never a pass', () => {
    // The point is to stop LOSING the verdict, not to start trusting one that
    // could not be read. Forced with real inputs: an invalid NODE_OPTIONS makes
    // the child process fail before it can print anything, so the parent sees no
    // marker at all — the same state a truncated verdict produces.
    const dir = makeProject('ctoc-pipe-failclosed-');
    libraryPkg(dir);
    entryScript(dir);
    declare(dir, { command: 'node entry.js', expect: 'READY-MARKER' });

    const previous = process.env.NODE_OPTIONS;
    let res;
    try {
      process.env.NODE_OPTIONS = '--ctoc-not-a-real-node-flag';
      res = driveAppSync(dir);
    } finally {
      if (previous === undefined) delete process.env.NODE_OPTIONS;
      else process.env.NODE_OPTIONS = previous;
    }

    assert.strictEqual(res.launched, false, 'nothing was proven to have launched');
    assert.strictEqual(res.responded, false);
    assert.ok(res.errors.length > 0, 'an unreadable verdict must fail closed, loudly');
  });

  it('pipe 12: the success branch still exits 0', () => {
    const dir = makeProject('ctoc-pipe-exit0-');
    libraryPkg(dir);
    entryScript(dir);
    declare(dir, { command: 'node entry.js', expect: 'READY-MARKER' });

    const proc = spawnSync(process.execPath, [APP_RUNNER, '--drive', dir, '{}'],
      { encoding: 'utf8', shell: false });
    assert.strictEqual(proc.status, 0, `the child must exit 0; stderr: ${(proc.stderr || '').slice(0, 200)}`);
    const out = proc.stdout || '';
    const verdict = JSON.parse(out.slice(out.lastIndexOf('__APP_RUNNER_RESULT__') + '__APP_RUNNER_RESULT__'.length).trim());
    assert.strictEqual(verdict.responded, true);
  });
});
