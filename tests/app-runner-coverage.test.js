'use strict';

/**
 * DARK-BRANCH coverage for src/lib/app-runner.js.
 *
 * Companion to tests/app-runner.test.js (which drives the happy last-mile flow).
 * Every test here pins a NON-OBVIOUS branch that the existing suite leaves dark —
 * the error/throw paths, the honesty decisions (a CLI that exits non-zero or
 * silently must FAIL loudly; a server whose dev script is un-launchable must
 * surface the reason, never mis-launch), the boundary fallbacks, the free-form
 * fallthroughs, and the run-strategy selection for a NON-JS project.
 *
 * ZERO doubles of core logic: every case builds a REAL project in os.tmpdir()
 * and, where a runtime is involved, launches a REAL subprocess. All fixtures are
 * removed in `after`/`finally`; app-runner tears down every process it spawns, and
 * the one raw net server we open is closed in `finally`.
 *
 * Each cluster names the source line(s) it kills under mutation.
 */

const { describe, it, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const path = require('node:path');

const {
  detectAppShape,
  detectRunTarget,
  driveApp,
  driveAppSync,
  probeHttp,
  scaffoldPlaywright,
  DEFAULT_TIME_BUDGET_MS
} = require('../src/lib/app-runner');

const APP_RUNNER_PATH = require.resolve('../src/lib/app-runner');

/** Make a fresh temp project dir. */
function makeProject(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

/** Remove a temp dir, best-effort. */
function rm(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { /* ignore */ }
}

/** Write a file into a project dir. */
function write(dir, name, content) {
  fs.writeFileSync(path.join(dir, name), content);
}

// ─────────────────────────────────────────────────────────────────────────────
// detectAppShape — the FINAL `return 'unknown'` fallthrough (line 138).
//
// A package.json that carries a bin? → cli. A dev/start script? → server/web. A
// main/exports/module? → library. A package that has NONE of these (only an
// unrelated `test` script, say) hits neither the library branch nor any runtime
// branch and must fall through to 'unknown'. Mutating that fallthrough to
// 'library' (the visually-adjacent return) goes RED here.
// ─────────────────────────────────────────────────────────────────────────────
describe('app-runner: detectAppShape falls through to unknown for a package with no runtime and no main (line 138)', () => {
  let dir;
  after(() => rm(dir));

  it('a package.json with only an unrelated test script (no bin/dev/start/main/exports/module) is unknown, NOT library', () => {
    // Arrange
    dir = makeProject('ctoc-cov-nomain-');
    write(dir, 'package.json', JSON.stringify({ name: 'x', version: '1.0.0', scripts: { test: 'jest' } }));

    // Act
    const shape = detectAppShape(dir);

    // Assert
    assert.equal(shape, 'unknown', 'no bin, no dev/start, no main/exports/module → the honest verdict is unknown, not library');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// detectRunTarget — the loop's terminal `return null` (line 224).
//
// detectRunTarget only fires when detectAppShape is 'unknown'. For a genuinely
// empty project there is no registry language to walk, so the for-loop never
// returns and the function must yield null (→ driveApp gives the generic
// "shape could not be determined" not-applicable result, NOT a native target).
// Mutating the `return null` to a truthy object would falsely claim a native run
// target for an empty dir; this pins it.
// ─────────────────────────────────────────────────────────────────────────────
describe('app-runner: detectRunTarget returns null for an empty project with no detectable language (line 224)', () => {
  let dir;
  after(() => rm(dir));

  it('an empty directory has no native run target', () => {
    // Arrange
    dir = makeProject('ctoc-cov-empty-');

    // Act
    const target = detectRunTarget(dir);

    // Assert
    assert.equal(target, null, 'nothing on disk → no language → no native run strategy');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// DEFAULT_TIME_BUDGET_MS — the env-override TRUE branch (lines 52-55).
//
// The module reads CTOC_APP_TIME_BUDGET_MS at load and uses it only when it
// parses to a finite positive integer; otherwise it defaults to 60000. The
// already-loaded module took the default (env unset). A fresh load with a valid
// env value must take the OTHER operand of the ternary. Mutating `> 0` or the
// chosen operand goes RED. Invalid/negative env must still fall back to 60000.
// ─────────────────────────────────────────────────────────────────────────────
describe('app-runner: DEFAULT_TIME_BUDGET_MS honours a valid env override and rejects an invalid one (lines 52-55)', () => {
  const prior = process.env.CTOC_APP_TIME_BUDGET_MS;
  after(() => {
    if (prior === undefined) delete process.env.CTOC_APP_TIME_BUDGET_MS;
    else process.env.CTOC_APP_TIME_BUDGET_MS = prior;
    delete require.cache[APP_RUNNER_PATH];
    require('../src/lib/app-runner'); // restore the canonical instance for any later loader
  });

  it('a valid positive env value becomes the budget', () => {
    // Arrange
    process.env.CTOC_APP_TIME_BUDGET_MS = '12345';
    delete require.cache[APP_RUNNER_PATH];

    // Act
    const fresh = require('../src/lib/app-runner');

    // Assert
    assert.equal(fresh.DEFAULT_TIME_BUDGET_MS, 12345, 'a valid CTOC_APP_TIME_BUDGET_MS overrides the 60000 default');
  });

  it('a non-positive env value is rejected and the 60000 default stands', () => {
    // Arrange
    process.env.CTOC_APP_TIME_BUDGET_MS = '-5';
    delete require.cache[APP_RUNNER_PATH];

    // Act
    const fresh = require('../src/lib/app-runner');

    // Assert
    assert.equal(fresh.DEFAULT_TIME_BUDGET_MS, 60000, 'a non-positive override must NOT be trusted; the safe default holds');
  });

  it('the canonically-loaded module used the 60000 default (env unset at first load)', () => {
    // Assert (guards that the ternary default operand is the one the real module took)
    assert.equal(DEFAULT_TIME_BUDGET_MS, 60000, 'with no env set at load, the budget is the 60s default');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// probeHttp — the request-timeout branch (lines 302-304).
//
// probeHttp NEVER rejects. When a server accepts the TCP connection but never
// sends a response, the 2000ms request timeout must fire, destroy the request,
// and resolve to { ok: false }. A hung server is NOT "responded". Mutating the
// timeout handler to resolve { ok: true } (a false green) goes RED here.
// ─────────────────────────────────────────────────────────────────────────────
describe('app-runner: probeHttp resolves ok:false when a server accepts but never responds (lines 302-304)', () => {
  it('a connection that is accepted but left hanging times out to ok:false', async () => {
    // Arrange — a raw TCP server that accepts sockets and never writes a byte.
    const srv = net.createServer(() => { /* accept, never respond */ });
    await new Promise((res) => srv.listen(0, '127.0.0.1', res));
    const port = srv.address().port;

    try {
      // Act
      const started = Date.now();
      const probe = await probeHttp(port);
      const elapsed = Date.now() - started;

      // Assert
      assert.equal(probe.ok, false, 'a hung server must never be reported as ok');
      assert.ok(probe.statusCode === undefined, 'no status is attributed to a non-responding server');
      assert.ok(elapsed >= 1900, `the resolve must come from the ~2000ms timeout, not an instant error; elapsed=${elapsed}ms`);
    } finally {
      srv.close();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// driveCli — the honesty branches: a CLI that fails to launch, exits non-zero,
// or exits 0 with NO output must all be responded:false with the reason surfaced
// (lines 504, 531-533, 535-537, 539-541). Green-until-you-look is exactly the
// failure "the measure is the human" exists to kill: a tool that exits 0 while
// printing nothing has not been shown to work.
// ─────────────────────────────────────────────────────────────────────────────
describe('app-runner: driveCli fails loudly on non-zero exit, empty output, and launch timeout', () => {
  const projects = [];
  after(() => { for (const p of projects) rm(p); });

  it('a CLI declared with a STRING bin that exits non-zero → responded:false, exit code surfaced (lines 504, 535-537)', async () => {
    // Arrange — `bin` as a bare string exercises the string-entry branch (504).
    const dir = makeProject('ctoc-cov-cli-nonzero-');
    projects.push(dir);
    write(dir, 'package.json', JSON.stringify({ name: 'boom', bin: 'cli.js' }));
    write(dir, 'cli.js', "console.log('starting');\nprocess.exit(3);");

    // Act
    const res = await driveApp(dir, { timeBudgetMs: 5000 });

    // Assert
    assert.equal(res.responded, false, 'a CLI that exits 3 has NOT been shown to work');
    assert.equal(res.evidence.exitCode, 3, 'the real non-zero exit code is recorded');
    assert.ok(
      res.errors.some((e) => /exited with code 3 \(expected 0\)/.test(e)),
      `the non-zero exit must be surfaced; got: ${JSON.stringify(res.errors)}`
    );
  });

  it('a CLI that exits 0 but prints NOTHING → responded:false, silence surfaced (lines 539-541)', async () => {
    // Arrange
    const dir = makeProject('ctoc-cov-cli-silent-');
    projects.push(dir);
    write(dir, 'package.json', JSON.stringify({ name: 'silent', bin: { silent: 'cli.js' } }));
    write(dir, 'cli.js', 'process.exit(0);');

    // Act
    const res = await driveApp(dir, { timeBudgetMs: 5000 });

    // Assert
    assert.equal(res.responded, false, 'exit 0 with no output is not proof the tool ran — must NOT be a false green');
    assert.ok(
      res.errors.some((e) => /exited 0 but produced no output/.test(e)),
      `the empty-output failure must be surfaced; got: ${JSON.stringify(res.errors)}`
    );
  });

  it('a CLI that hangs past the time budget → responded:false, launch failure surfaced (lines 531-533)', async () => {
    // Arrange — an entry that never exits; a tiny budget forces the spawnSync timeout.
    const dir = makeProject('ctoc-cov-cli-hang-');
    projects.push(dir);
    write(dir, 'package.json', JSON.stringify({ name: 'hang', bin: 'cli.js' }));
    write(dir, 'cli.js', 'setInterval(() => {}, 1000);');

    // Act
    const res = await driveApp(dir, { timeBudgetMs: 600 });

    // Assert
    assert.equal(res.responded, false, 'a CLI that never returns within budget has not responded');
    assert.ok(
      res.errors.some((e) => /CLI failed to launch/.test(e)),
      `the launch/timeout failure must be surfaced; got: ${JSON.stringify(res.errors)}`
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// driveServer — the two un-launchable-script branches.
//
//  * A dev script carrying an unquoted shell operator is `unsupported`; driveServer
//    must surface that reason and NOT spawn (lines 647-649). Handing package.json
//    shell metacharacters to a shell is a command-injection surface; mis-launching
//    a wrong single command is a silent lie. Either way: honest error, launched:false.
//  * A whitespace-only dev script tokenizes to NO command, so `spawn(undefined,...)`
//    throws synchronously and must be caught into a "Failed to spawn" error
//    (lines 662-664), never an uncaught crash of the driver.
// ─────────────────────────────────────────────────────────────────────────────
describe('app-runner: driveServer surfaces an un-launchable dev script instead of mis-launching', () => {
  const projects = [];
  after(() => { for (const p of projects) rm(p); });

  it('a compound dev script (build && start) is reported unsupported and NOT launched (lines 647-649)', async () => {
    // Arrange
    const dir = makeProject('ctoc-cov-shellop-');
    projects.push(dir);
    write(dir, 'package.json', JSON.stringify({ name: 'compound', scripts: { dev: 'npm run build && node server.js' } }));

    // Act
    const res = await driveApp(dir, { timeBudgetMs: 3000 });

    // Assert
    assert.equal(res.launched, false, 'a compound script must NOT be spawned (no shell metachars handed off)');
    assert.equal(res.responded, false);
    assert.ok(
      res.errors.some((e) => /shell operator/i.test(e)),
      `the unsupported-script reason must be surfaced; got: ${JSON.stringify(res.errors)}`
    );
  });

  it('a whitespace-only dev script throws on spawn and is caught into a Failed-to-spawn error (lines 662-664)', async () => {
    // Arrange — "   " is truthy (so the project is server-shaped) but tokenizes to
    // no command, so the underlying spawn(undefined, ...) throws synchronously.
    const dir = makeProject('ctoc-cov-wsscript-');
    projects.push(dir);
    write(dir, 'package.json', JSON.stringify({ name: 'ws', scripts: { dev: '   ' } }));

    // Act
    const res = await driveApp(dir, { timeBudgetMs: 3000 });

    // Assert
    assert.equal(res.launched, false, 'a spawn that throws must not be marked launched');
    assert.equal(res.responded, false);
    assert.ok(
      res.errors.some((e) => /Failed to spawn dev server/.test(e)),
      `the synchronous spawn throw must be caught and surfaced, not crash the driver; got: ${JSON.stringify(res.errors)}`
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// driveAppSync — the native run-target short-circuit (lines 771-773).
//
// The SYNCHRONOUS facade (what Step 14 calls) must, for an 'unknown' JS shape that
// the capability registry recognizes as a native project (Cargo.toml → rust),
// return the HONEST native not-applicable result WITHOUT spawning the --drive
// child. applicable:false (never gates), but the evidence names the stack and the
// build-is-last-mile run command. Mutating this to fall through to the generic
// "shape could not be determined" would lose the native run evidence; this pins it.
// ─────────────────────────────────────────────────────────────────────────────
describe('app-runner: driveAppSync returns the native run-target evidence for a non-JS project (lines 771-773)', () => {
  let dir;
  after(() => rm(dir));

  it('a Cargo.toml project → applicable:false with rust/cargo-run evidence, no subprocess', () => {
    // Arrange
    dir = makeProject('ctoc-cov-native-sync-');
    write(dir, 'Cargo.toml', '[package]\nname = "x"\n');

    // Act
    const res = driveAppSync(dir, {});

    // Assert
    assert.equal(res.applicable, false, 'a native build-is-last-mile project must NOT be gated on an HTTP endpoint');
    assert.equal(res.evidence.language, 'rust', 'the native stack must be named in the evidence');
    assert.equal(res.evidence.runCommand, 'cargo run', 'the honest run command must be surfaced, not a generic "unknown"');
    assert.deepEqual(res.errors, [], 'a not-applicable native target is not a failure');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// teardown — the grace-then-SIGKILL path (lines 464-468).
//
// A server that IGNORES SIGTERM must still be reliably killed: teardown signals
// the group, waits a 400ms grace, then SIGKILLs. This proves the runner never
// leaks a process that refuses the polite signal — a real orphan-process hazard.
// Mutating away the hard-kill timer would leave the port answering after teardown.
// ─────────────────────────────────────────────────────────────────────────────
describe('app-runner: teardown hard-kills a server that ignores SIGTERM (lines 464-468)', () => {
  let dir;
  after(() => rm(dir));

  it('a SIGTERM-ignoring server responds, then is torn down anyway (port stops answering)', async () => {
    // Arrange — the server traps SIGTERM into a no-op, so only SIGKILL can end it.
    dir = makeProject('ctoc-cov-sigterm-ignore-');
    write(dir, 'package.json', JSON.stringify({ name: 'stubborn', scripts: { dev: 'node server.js' } }));
    write(dir, 'server.js', [
      "process.on('SIGTERM', () => { /* refuse the polite signal */ });",
      "const http = require('http');",
      'const port = Number(process.env.PORT) || 0;',
      "http.createServer((req, res) => { res.writeHead(200); res.end('stubborn ok'); })",
      "  .listen(port, '127.0.0.1');"
    ].join('\n'));

    // Act
    const res = await driveApp(dir, { timeBudgetMs: 8000 });

    // Assert
    assert.equal(res.responded, true, `the server must answer before teardown; errors: ${JSON.stringify(res.errors)}`);
    const after = await probeHttp(res.evidence.port);
    assert.equal(after.ok, false, 'a SIGTERM-ignoring server must still be hard-killed — no leaked process on the port');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// scaffoldPlaywright — the shape gate (lines 846-855).
//
// Playwright scaffolding applies to WEB apps only. A non-web project must return
// { scaffolded:false, reason } naming its actual shape (the negation branch), and
// a real web app must return { scaffolded:true } after laying down config. Mutating
// the `!== 'web'` guard (e.g. to `=== 'web'`) flips both assertions RED.
// ─────────────────────────────────────────────────────────────────────────────
describe('app-runner: scaffoldPlaywright scaffolds a web app and refuses a non-web project (lines 846-855)', () => {
  const projects = [];
  after(() => { for (const p of projects) rm(p); });

  it('a library project is refused with scaffolded:false and its shape named (lines 848-852)', async () => {
    // Arrange
    const dir = makeProject('ctoc-cov-pw-lib-');
    projects.push(dir);
    write(dir, 'package.json', JSON.stringify({ name: 'lib', main: 'index.js', version: '1.0.0' }));

    // Act
    const res = await scaffoldPlaywright(dir);

    // Assert
    assert.equal(res.scaffolded, false, 'a library has no browser flow to drive — scaffolding must be refused');
    assert.ok(/library/.test(res.reason), `the reason must name the non-web shape; got: ${res.reason}`);
  });

  it('a real web app is scaffolded with scaffolded:true and a config file written (lines 854-855)', async () => {
    // Arrange
    const dir = makeProject('ctoc-cov-pw-web-');
    projects.push(dir);
    write(dir, 'package.json', JSON.stringify({
      name: 'realweb', dependencies: { next: '^15.0.0', react: '^18' }, scripts: { dev: 'next dev' }
    }));

    // Act
    const res = await scaffoldPlaywright(dir, { typescript: true });

    // Assert
    assert.equal(res.scaffolded, true, 'a real web app must be scaffolded');
    assert.ok(
      fs.existsSync(path.join(dir, 'playwright.config.ts')),
      'scaffolding a web app must actually write the Playwright config'
    );
  });
});
