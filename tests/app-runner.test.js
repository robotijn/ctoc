'use strict';

/**
 * THE LAST MILE — real end-to-end tests for src/lib/app-runner.js.
 *
 * ZERO DOUBLES. Every case builds a REAL tiny project on disk in os.tmpdir()
 * and launches a REAL subprocess:
 *   (a) a real node http server         -> driveApp launches it, gets a 200,
 *                                          and the child is dead afterward;
 *   (b) a real node command-line tool   -> driveApp runs it with --help, exit 0;
 *   (c) a library (no runtime)          -> applicable:false (not a failure);
 *   (d) a web app that crashes on boot  -> the drive FAILS loudly, error surfaced.
 *
 * The suite drives the actual human flow (start -> it answers on '/' -> tear
 * down), which is exactly what "green tests are not working" warns is otherwise
 * never checked.
 */

const { describe, it, after, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  detectAppShape,
  detectRunTarget,
  driveApp,
  probeHttp,
  resolveScriptCommand,
  classifyServerOutcome
} = require('../src/lib/app-runner');

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

describe('app-runner: detectAppShape', () => {
  let dir;
  beforeEach(() => { dir = makeProject('ctoc-shape-'); });
  afterEach(() => { rm(dir); });

  it('classifies a project with a dev/start script (no web deps) as a server', () => {
    write(dir, 'package.json', JSON.stringify({ name: 'srv', scripts: { dev: 'node server.js' } }));
    assert.strictEqual(detectAppShape(dir), 'server');
  });

  it('classifies a project with a bin field as a cli', () => {
    write(dir, 'package.json', JSON.stringify({ name: 'tool', bin: { tool: 'cli.js' } }));
    assert.strictEqual(detectAppShape(dir), 'cli');
  });

  it('classifies a react dependency as a web app', () => {
    write(dir, 'package.json', JSON.stringify({ name: 'web', dependencies: { react: '^18.0.0' } }));
    assert.strictEqual(detectAppShape(dir), 'web');
  });

  it('classifies a main-only package as a library', () => {
    write(dir, 'package.json', JSON.stringify({ name: 'lib', main: 'index.js', version: '1.0.0' }));
    assert.strictEqual(detectAppShape(dir), 'library');
  });

  it('classifies an empty directory as unknown', () => {
    assert.strictEqual(detectAppShape(dir), 'unknown');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// F1 — the run target must follow the MANIFEST, not a stray source file. A Rust/
// Go/Python project carrying an incidental C/C++ file at the root (FFI wrapper.h,
// cgo bridge.c, C-extension _ext.c) must NOT be told its run target is c → ./a.out
// (a gcc default that does not exist and is not the app). detectRunTarget consumes
// capabilityRegistry.detectLanguages, whose first element is now manifest-first.
// ─────────────────────────────────────────────────────────────────────────────
describe('app-runner: detectRunTarget follows the manifest, not a stray source file (F1)', () => {
  const projects = [];
  after(() => { for (const p of projects) rm(p); });

  it('Cargo.toml + incidental wrapper.h → rust run target (cargo run), NOT c/./a.out', () => {
    const dir = makeProject('ctoc-rt-rust-'); projects.push(dir);
    write(dir, 'Cargo.toml', '[package]\nname = "x"\n');
    write(dir, 'wrapper.h', '#pragma once\n');
    const t = detectRunTarget(dir);
    assert.ok(t, 'a Cargo.toml project must be a native run target');
    assert.strictEqual(t.language, 'rust', 'the run target must be rust, not c');
    assert.strictEqual(t.strategy.command, 'cargo run', 'and its run command must be cargo run, not ./a.out');
  });

  it('go.mod + incidental bridge.c → go run target, NOT c', () => {
    const dir = makeProject('ctoc-rt-go-'); projects.push(dir);
    write(dir, 'go.mod', 'module x\n');
    write(dir, 'bridge.c', 'int f(){return 0;}\n');
    const t = detectRunTarget(dir);
    assert.ok(t, 'a go.mod project must be a native run target');
    assert.strictEqual(t.language, 'go', 'the run target must be go, not c');
  });

  it('requirements.txt + incidental _ext.c → python run target, NOT c', () => {
    const dir = makeProject('ctoc-rt-py-'); projects.push(dir);
    write(dir, 'requirements.txt', 'flask\n');
    write(dir, '_ext.c', 'int f(){return 0;}\n');
    const t = detectRunTarget(dir);
    assert.ok(t, 'a requirements.txt project must be a native run target');
    assert.strictEqual(t.language, 'python', 'the run target must be python, not c');
  });

  it('CONTROL: a pure C project (main.c) still detects c → its cli run shape', () => {
    const dir = makeProject('ctoc-rt-purec-'); projects.push(dir);
    write(dir, 'main.c', 'int main(void){return 0;}\n');
    const t = detectRunTarget(dir);
    assert.ok(t, 'a pure C project must still be a native run target');
    assert.strictEqual(t.language, 'c', 'with no manifest language present, c stays the run target');
    assert.strictEqual(t.strategy.command, './a.out', 'and its declared cli run command is ./a.out');
  });
});

describe('app-runner: driveApp launches and drives real projects', () => {
  const projects = [];
  after(() => { for (const p of projects) rm(p); });

  it('(a) launches a real node web server, gets a 200 on /, and kills the child', async () => {
    const dir = makeProject('ctoc-web-good-');
    projects.push(dir);
    write(dir, 'package.json', JSON.stringify({ name: 'web-good', scripts: { dev: 'node server.js' } }));
    write(dir, 'server.js', [
      "const http = require('http');",
      'const port = Number(process.env.PORT) || 0;',
      'const server = http.createServer((req, res) => {',
      "  res.writeHead(200, { 'content-type': 'text/plain' });",
      "  res.end('hello from the last mile');",
      '});',
      "server.listen(port, '127.0.0.1', () => console.log('listening on ' + port));"
    ].join('\n'));

    const res = await driveApp(dir, { timeBudgetMs: 10000 });

    assert.strictEqual(res.applicable, true, 'a server is app-shaped');
    assert.strictEqual(res.launched, true, 'the server must be launched');
    assert.strictEqual(res.responded, true, 'the server must answer on /');
    assert.strictEqual(res.evidence.httpStatus, 200, 'must be a real HTTP 200');
    assert.ok(/hello from the last mile/.test(res.evidence.bodyExcerpt), 'body must be the real response');
    assert.deepStrictEqual(res.errors, []);

    // The child must be dead afterward: the port must no longer answer.
    const after = await probeHttp(res.evidence.port);
    assert.strictEqual(after.ok, false, 'the launched server must be torn down (port no longer answers)');
  });

  it('(b) runs a real node CLI with --help and asserts exit 0 with output', async () => {
    const dir = makeProject('ctoc-cli-');
    projects.push(dir);
    write(dir, 'package.json', JSON.stringify({ name: 'mycli', bin: { mycli: 'cli.js' } }));
    write(dir, 'cli.js', [
      '#!/usr/bin/env node',
      "if (process.argv.includes('--help')) {",
      "  console.log('Usage: mycli [options]');",
      '  process.exit(0);',
      '}',
      "console.log('ran without --help');",
      'process.exit(0);'
    ].join('\n'));

    const res = await driveApp(dir, { timeBudgetMs: 10000 });

    assert.strictEqual(res.applicable, true);
    assert.strictEqual(res.launched, true);
    assert.strictEqual(res.responded, true);
    assert.strictEqual(res.evidence.exitCode, 0, 'CLI must exit 0');
    assert.ok(/Usage: mycli/.test(res.evidence.output), 'CLI must produce real output');
    assert.deepStrictEqual(res.errors, []);
  });

  it('(c) reports applicable:false for a library (no human-facing runtime)', async () => {
    const dir = makeProject('ctoc-lib-');
    projects.push(dir);
    write(dir, 'package.json', JSON.stringify({ name: 'lib', main: 'index.js', version: '1.0.0' }));
    write(dir, 'index.js', 'module.exports = { add: (a, b) => a + b };');

    const res = await driveApp(dir, { timeBudgetMs: 10000 });

    assert.strictEqual(res.applicable, false, 'a library must NOT be gated on a runtime');
    assert.strictEqual(res.launched, false);
    assert.strictEqual(res.responded, false);
    assert.deepStrictEqual(res.errors, [], 'not-applicable is not a failure');
    assert.ok(/library/.test(res.evidence.reason), 'reason must honestly explain not-applicable');
  });

  it('(d) FAILS loudly for a web app that crashes on boot, surfacing the error', async () => {
    const dir = makeProject('ctoc-web-broken-');
    projects.push(dir);
    write(dir, 'package.json', JSON.stringify({ name: 'web-broken', scripts: { dev: 'node server.js' } }));
    write(dir, 'server.js', "throw new Error('boot crash: missing DATABASE_URL');");

    const res = await driveApp(dir, { timeBudgetMs: 10000 });

    assert.strictEqual(res.applicable, true, 'a broken app is still app-shaped');
    assert.strictEqual(res.launched, true, 'we attempted to launch it');
    assert.strictEqual(res.responded, false, 'a crashed server never responds');
    assert.ok(res.errors.length > 0, 'the failure must be reported, not swallowed');
    assert.ok(
      res.errors.some((e) => /boot crash: missing DATABASE_URL/.test(e)),
      `the real boot error must be surfaced; got: ${JSON.stringify(res.errors)}`
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// R4-A item 9 — NEVER trust a framework default port; ALWAYS bind a free one.
//
// If the human already has a dev server on the framework default (3000 for a web
// app), the spawned child would fail to bind and die — but a probe against the
// default port would hit the OTHER process and falsely attest "responded". The
// fix: always allocate a free port and export it via PORT, so the app under test
// is the ONLY thing that could answer on it.
// ─────────────────────────────────────────────────────────────────────────────
describe('app-runner: driveApp binds a FREE port, never the framework default', () => {
  const projects = [];
  after(() => { for (const p of projects) rm(p); });

  it('a web-shaped app is driven on a free port (not 3000), and it responds there', async () => {
    const dir = makeProject('ctoc-web-freeport-');
    projects.push(dir);
    // react dependency ⇒ detectAppShape === 'web' ⇒ framework default port is 3000.
    write(dir, 'package.json', JSON.stringify({
      name: 'web-freeport', dependencies: { react: '^18.0.0' }, scripts: { dev: 'node server.js' }
    }));
    write(dir, 'server.js', [
      "const http = require('http');",
      'const port = Number(process.env.PORT) || 0;',
      "http.createServer((req, res) => { res.writeHead(200); res.end('ok'); })",
      "  .listen(port, '127.0.0.1');"
    ].join('\n'));

    const res = await driveApp(dir, { timeBudgetMs: 12000 });

    assert.strictEqual(res.responded, true, `the app must respond on its assigned port; errors: ${JSON.stringify(res.errors)}`);
    assert.notStrictEqual(res.evidence.port, 3000, 'a web app must NOT be driven on the framework default port (3000)');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// R4-A item 3 — the SYNCHRONOUS drive path (driveAppSync) is what Step 14 uses,
// and NO test drove it. Cover it with the same rigor: real boot, real HTTP, real
// teardown; and a non-responding app fails.
// ─────────────────────────────────────────────────────────────────────────────
describe('app-runner: driveAppSync (the path Step 14 VERIFY actually calls)', () => {
  const { driveAppSync } = require('../src/lib/app-runner');
  const projects = [];
  after(() => { for (const p of projects) rm(p); });

  it('launches a real server synchronously, gets a response, and reports responded:true', () => {
    const dir = makeProject('ctoc-sync-good-');
    projects.push(dir);
    write(dir, 'package.json', JSON.stringify({ name: 'sync-good', scripts: { dev: 'node server.js' } }));
    write(dir, 'server.js', [
      "const http = require('http');",
      'const port = Number(process.env.PORT) || 0;',
      "http.createServer((req, res) => { res.writeHead(200); res.end('sync ok'); })",
      "  .listen(port, '127.0.0.1');"
    ].join('\n'));

    const res = driveAppSync(dir, { timeBudgetMs: 12000 });
    assert.strictEqual(res.applicable, true);
    assert.strictEqual(res.responded, true, `sync drive must get a real response; errors: ${JSON.stringify(res.errors)}`);
  });

  it('FAILS a non-responding app synchronously (responded:false, error surfaced)', () => {
    const dir = makeProject('ctoc-sync-broken-');
    projects.push(dir);
    write(dir, 'package.json', JSON.stringify({ name: 'sync-broken', scripts: { dev: 'node server.js' } }));
    write(dir, 'server.js', "throw new Error('sync boot crash');");

    const res = driveAppSync(dir, { timeBudgetMs: 12000 });
    assert.strictEqual(res.applicable, true);
    assert.strictEqual(res.responded, false, 'a crashed server never responds');
    assert.ok(res.errors.length > 0, 'the failure must be reported through the sync facade');
  });

  it('reports applicable:false for a library without spawning anything', () => {
    const dir = makeProject('ctoc-sync-lib-');
    projects.push(dir);
    write(dir, 'package.json', JSON.stringify({ name: 'lib', main: 'index.js', version: '1.0.0' }));
    const res = driveAppSync(dir, { timeBudgetMs: 5000 });
    assert.strictEqual(res.applicable, false);
    assert.deepStrictEqual(res.errors, []);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// DEFECT 1 — a booted-but-ERRORING server must NOT pass the last-mile gate.
// "The measure is the human": a server that answers '/' with HTTP 500 shows the
// person an error page — that is NOT "working". A 5xx is a FAILURE and the status
// is surfaced. A 2xx/3xx/4xx server is up (an API-only server legitimately 404s
// on '/'), so those stay responded:true.
// classifyServerOutcome is the REAL decision code driveServer runs (extracted for
// deterministic coverage, not a double).
// ─────────────────────────────────────────────────────────────────────────────
describe('app-runner: a 5xx response is a failure, 2xx/3xx/4xx is up (DEFECT 1)', () => {
  const port = 54321;
  const budget = 1000;
  const projects500 = [];
  after(() => { for (const p of projects500) rm(p); });

  it('HTTP 500 → responded:false, the 500 surfaced in errors, status in evidence', () => {
    const o = classifyServerOutcome({
      exited: false,
      exitInfo: null,
      probe: { ok: true, statusCode: 500, body: 'internal error page' },
      port,
      budget,
      stderr: ''
    });
    assert.strictEqual(o.responded, false, 'a server that 500s on / is NOT working');
    assert.strictEqual(o.httpStatus, 500, 'the 500 status must be surfaced to the human');
    assert.ok(
      o.errors.some((e) => /HTTP 500/.test(e) && /errors on load/.test(e)),
      `the boot-error must name the 500; got: ${JSON.stringify(o.errors)}`
    );
  });

  it('HTTP 200 → responded:true (regression guard)', () => {
    const o = classifyServerOutcome({
      exited: false, exitInfo: null, probe: { ok: true, statusCode: 200, body: 'ok' }, port, budget, stderr: ''
    });
    assert.strictEqual(o.responded, true, 'a 200 server is working');
    assert.strictEqual(o.httpStatus, 200);
    assert.deepStrictEqual(o.errors, []);
  });

  it('HTTP 404 on / → responded:true (an API-only server is still up)', () => {
    const o = classifyServerOutcome({
      exited: false, exitInfo: null, probe: { ok: true, statusCode: 404, body: 'not found' }, port, budget, stderr: ''
    });
    assert.strictEqual(o.responded, true, 'a bound server that 404s on / is still up — must NOT be failed');
    assert.strictEqual(o.httpStatus, 404);
    assert.deepStrictEqual(o.errors, []);
  });

  it('end-to-end: a REAL server that 500s on / is failed, not attested (the human sees the error)', async () => {
    const dir = makeProject('ctoc-web-500-');
    projects500.push(dir);
    write(dir, 'package.json', JSON.stringify({ name: 'web-500', scripts: { dev: 'node server.js' } }));
    write(dir, 'server.js', [
      "const http = require('http');",
      'const port = Number(process.env.PORT) || 0;',
      "http.createServer((req, res) => { res.writeHead(500); res.end('boom'); })",
      "  .listen(port, '127.0.0.1');"
    ].join('\n'));

    const res = await driveApp(dir, { timeBudgetMs: 10000 });

    assert.strictEqual(res.launched, true, 'we attempted to launch it');
    assert.strictEqual(res.responded, false, 'a 500-on-/ server must NOT be attested as responded');
    assert.strictEqual(res.evidence.httpStatus, 500, 'the 500 must be recorded in the evidence');
    assert.ok(
      res.errors.some((e) => /HTTP 500/.test(e)),
      `the human must see the boot error; got: ${JSON.stringify(res.errors)}`
    );

    // The child must be torn down.
    const probe = await probeHttp(res.evidence.port);
    assert.strictEqual(probe.ok, false, 'the launched server must be torn down');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// DEFECT 2 — the child WE launched exiting is DECISIVE. If our child crashed
// (e.g. EADDRINUSE in the port TOCTOU gap) and a FOREIGN process answers the
// port, we must NOT falsely attest responded:true. A dead child is a failure
// regardless of who answers.
// ─────────────────────────────────────────────────────────────────────────────
describe('app-runner: a crashed child is a failure even if the port answers (DEFECT 2)', () => {
  it('exited:true + a probe that WOULD succeed → responded:false, crash surfaced', () => {
    const o = classifyServerOutcome({
      exited: true,
      exitInfo: { code: 1, signal: null },
      // a foreign process answering the (supposedly private) port with a 200
      probe: { ok: true, statusCode: 200, body: 'answered by a foreign process' },
      port: 54322,
      budget: 1000,
      stderr: 'Error: listen EADDRINUSE'
    });
    assert.strictEqual(o.responded, false, 'a dead child must never attest responded, even if the port answers');
    assert.ok(
      o.errors.some((e) => /exited before responding/.test(e)),
      `the crash must be surfaced; got: ${JSON.stringify(o.errors)}`
    );
  });

  it('exited:true with a spawn error (ENOENT) → responded:false, error detail surfaced', () => {
    const o = classifyServerOutcome({
      exited: true,
      exitInfo: { code: null, signal: null, error: 'spawn nope ENOENT' },
      probe: { ok: false },
      port: 54323,
      budget: 1000,
      stderr: ''
    });
    assert.strictEqual(o.responded, false);
    assert.ok(o.errors.some((e) => /spawn nope ENOENT/.test(e)), 'the spawn error must be surfaced');
  });

  it('a normal non-response (alive but silent) still fails with the timeout message', () => {
    const o = classifyServerOutcome({
      exited: false, exitInfo: null, probe: { ok: false }, port: 54324, budget: 1500, stderr: 'still compiling'
    });
    assert.strictEqual(o.responded, false);
    assert.ok(o.errors.some((e) => /did not respond/.test(e) && /1500ms/.test(e)));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// DEFECT 3 — resolveScriptCommand must be quote-aware (a spaced quoted arg stays
// ONE token, so a correct dev script is not falsely failed on POSIX), and it must
// NOT silently hand shell operators (&&, ||, |, ;, &) from a semi-trusted
// package.json to cmd.exe — such scripts are handled explicitly (surfaced as an
// unsupported-script error), never mis-tokenized into a wrong command.
// ─────────────────────────────────────────────────────────────────────────────
describe('app-runner: resolveScriptCommand is quote-aware and operator-safe (DEFECT 3)', () => {
  it('keeps a double-quoted spaced arg as ONE token', () => {
    const spec = resolveScriptCommand('next dev --hostname "my host"');
    assert.ok(!spec.unsupported, 'a plain single command must be launchable');
    assert.strictEqual(spec.command, 'next');
    assert.deepStrictEqual(spec.args, ['dev', '--hostname', 'my host']);
  });

  it('keeps a single-quoted spaced arg as ONE token', () => {
    const spec = resolveScriptCommand("node -e 'console.log(1 + 1)'");
    assert.ok(!spec.unsupported);
    assert.strictEqual(spec.command, process.execPath, 'a node script runs via process.execPath');
    assert.deepStrictEqual(spec.args, ['-e', 'console.log(1 + 1)']);
  });

  it('a plain node script still resolves to execPath (regression guard)', () => {
    const spec = resolveScriptCommand('node server.js');
    assert.ok(!spec.unsupported);
    assert.strictEqual(spec.command, process.execPath);
    assert.deepStrictEqual(spec.args, ['server.js']);
  });

  it('a script with && is handled explicitly, NOT silently split into a wrong command', () => {
    const spec = resolveScriptCommand('npm run build && node server.js');
    assert.strictEqual(spec.unsupported, true, 'a compound shell script must be flagged, not mis-launched');
    assert.notStrictEqual(spec.command, 'npm', 'it must NOT be reduced to `npm` with && handed on as an arg');
    assert.ok(/shell operator/i.test(spec.reason), 'the reason must explain the unsupported operator');
  });

  it('a script with a pipe is handled explicitly', () => {
    const spec = resolveScriptCommand('cat data | node process.js');
    assert.strictEqual(spec.unsupported, true);
    assert.ok(/shell operator/i.test(spec.reason));
  });

  it('an operator INSIDE quotes is data, not an operator (not flagged)', () => {
    const spec = resolveScriptCommand('node run.js --title "a && b"');
    assert.ok(!spec.unsupported, 'a quoted && is a literal argument, not a shell operator');
    assert.deepStrictEqual(spec.args, ['run.js', '--title', 'a && b']);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// R7 — the poll loop must keep polling THROUGH a transient 5xx.
//
// A warming-up dev server commonly answers '/' with a transient 5xx (DB pool
// coming up, first compile, a migration running) before it reaches its steady
// 200. The R6 "5xx is a failure" fix latched the FIRST 5xx: probeHttp returns
// ok:true for ANY status, so the loop broke on that first 503 and classified
// once on the latched 5xx → a FALSE failure for a normal startup pattern.
//
// The fix keeps polling through a 5xx until a NON-5xx response OR the deadline,
// then classifies on the LAST probe:
//   - a TRANSIENT 5xx-then-200 now recovers to its eventual 200 (responded:true);
//   - a PERSISTENT 5xx still fails (the last probe at the deadline is 5xx) — the
//     R6 steady-state-500-fails intent is preserved, not weakened.
//
// These drive REAL subprocesses on OS-allocated free ports and tear them down.
// ─────────────────────────────────────────────────────────────────────────────
describe('app-runner: the poll loop recovers a transient 5xx, still fails a persistent one (R7)', () => {
  const projects = [];
  after(() => { for (const p of projects) rm(p); });

  it('a server that 503s for ~1s then 200s → responded:true, httpStatus:200 (transient recovery)', async () => {
    const dir = makeProject('ctoc-web-warmup-');
    projects.push(dir);
    write(dir, 'package.json', JSON.stringify({ name: 'web-warmup', scripts: { dev: 'node server.js' } }));
    // OS-allocated free port (PORT=0-derived via the runner; here we bind 0 too).
    write(dir, 'server.js', [
      "const http = require('http');",
      'const port = Number(process.env.PORT) || 0;',
      'const started = Date.now();',
      'const WARMUP_MS = 1000;',
      'const server = http.createServer((req, res) => {',
      '  if (Date.now() - started < WARMUP_MS) {',
      "    res.writeHead(503, { 'content-type': 'text/plain' });",
      "    res.end('warming up');",
      '  } else {',
      "    res.writeHead(200, { 'content-type': 'text/plain' });",
      "    res.end('warmed up and ready');",
      '  }',
      '});',
      "server.listen(port, '127.0.0.1');"
    ].join('\n'));

    // Budget comfortably larger than the ~1s warmup so the eventual 200 is reachable.
    const res = await driveApp(dir, { timeBudgetMs: 8000 });

    assert.strictEqual(res.launched, true, 'the server must be launched');
    assert.strictEqual(
      res.responded, true,
      `a 5xx-then-200 startup must be polled through to its 200; errors: ${JSON.stringify(res.errors)}`
    );
    assert.strictEqual(res.evidence.httpStatus, 200, 'classification must land on the eventual 200, not the latched 503');
    assert.deepStrictEqual(res.errors, [], 'a recovered startup is not a failure');

    // No leaked process: the port must no longer answer once torn down.
    const after = await probeHttp(res.evidence.port);
    assert.strictEqual(after.ok, false, 'the launched server must be torn down (port no longer answers)');
  });

  it('a server that 500s on EVERY request within the budget → responded:false, the 500 surfaced (R6 preserved)', async () => {
    const dir = makeProject('ctoc-web-steady500-');
    projects.push(dir);
    write(dir, 'package.json', JSON.stringify({ name: 'web-steady500', scripts: { dev: 'node server.js' } }));
    write(dir, 'server.js', [
      "const http = require('http');",
      'const port = Number(process.env.PORT) || 0;',
      "http.createServer((req, res) => { res.writeHead(500); res.end('always broken'); })",
      "  .listen(port, '127.0.0.1');"
    ].join('\n'));

    const res = await driveApp(dir, { timeBudgetMs: 2000 });

    assert.strictEqual(res.launched, true, 'we attempted to launch it');
    assert.strictEqual(res.responded, false, 'a steady 500 must still fail — polling through must not mask a persistent error');
    assert.strictEqual(res.evidence.httpStatus, 500, 'the persistent 500 must be recorded on the last probe');
    assert.ok(
      res.errors.some((e) => /HTTP 500/.test(e)),
      `the human must see the boot error; got: ${JSON.stringify(res.errors)}`
    );

    const after = await probeHttp(res.evidence.port);
    assert.strictEqual(after.ok, false, 'the launched server must be torn down');
  });

  it('a normal 200 server → responded:true (regression guard)', async () => {
    const dir = makeProject('ctoc-web-normal200-');
    projects.push(dir);
    write(dir, 'package.json', JSON.stringify({ name: 'web-normal200', scripts: { dev: 'node server.js' } }));
    write(dir, 'server.js', [
      "const http = require('http');",
      'const port = Number(process.env.PORT) || 0;',
      "http.createServer((req, res) => { res.writeHead(200); res.end('ok'); })",
      "  .listen(port, '127.0.0.1');"
    ].join('\n'));

    const res = await driveApp(dir, { timeBudgetMs: 8000 });

    assert.strictEqual(res.responded, true, `a normal 200 server must respond; errors: ${JSON.stringify(res.errors)}`);
    assert.strictEqual(res.evidence.httpStatus, 200);
    assert.deepStrictEqual(res.errors, []);

    const after = await probeHttp(res.evidence.port);
    assert.strictEqual(after.ok, false, 'the launched server must be torn down');
  });
});
