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

const { detectAppShape, driveApp, probeHttp } = require('../src/lib/app-runner');

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
