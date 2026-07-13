'use strict';

/**
 * THE LAST MILE, integrated into Step 14 VERIFY.
 *
 * This proves the wiring: runVerify (the Step 14 quality gate) now launches an
 * app-shaped project and FAILS verification when the app does not run — the
 * thing that made CTOC's first operating lesson ("green tests are not working")
 * finally machine-checked.
 *
 * ZERO DOUBLES: real fixture projects on disk, real subprocess launches through
 * runVerify's synchronous driveAppSync path.
 */

const { describe, it, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { runVerify } = require('../src/lib/step-13-verify');

const projects = [];
function makeProject(prefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  projects.push(dir);
  return dir;
}
function write(dir, name, content) {
  fs.writeFileSync(path.join(dir, name), content);
}

// Quality scripts that pass, so the ONLY variable under test is whether the app
// runs. Without these, runVerify's fallback would fail on a missing lint script
// and mask the appRuns signal.
const PASSING_QUALITY = {
  lint: 'node -e "0"',
  typecheck: 'node -e "0"',
  test: 'node -e "0"'
};

describe('last mile: runVerify gates on the app actually running', () => {
  after(() => {
    for (const p of projects) {
      try { fs.rmSync(p, { recursive: true, force: true }); } catch (e) { /* ignore */ }
    }
  });

  it('FAILS verification for an app-shaped project whose server crashes on boot', () => {
    const dir = makeProject('ctoc-lastmile-broken-');
    write(dir, 'package.json', JSON.stringify({
      name: 'broken-app',
      scripts: { ...PASSING_QUALITY, dev: 'node server.js' }
    }));
    write(dir, 'server.js', "throw new Error('boot crash: config missing');");

    const res = runVerify(dir);

    assert.strictEqual(res.passed, false, 'a non-responding app-shaped project must fail VERIFY');
    assert.ok(res.checks.appRuns, 'the appRuns check must be recorded');
    assert.strictEqual(res.checks.appRuns.applicable, true);
    assert.strictEqual(res.checks.appRuns.responded, false);
    assert.ok(
      res.errors.some((e) => /^App did not run:/.test(e)),
      `the appRuns failure must be named in errors; got: ${JSON.stringify(res.errors)}`
    );
    assert.ok(/App did not run/.test(res.summary), 'the summary must surface the failure');
  });

  it('PASSES verification for an app-shaped project that launches and responds', () => {
    const dir = makeProject('ctoc-lastmile-good-');
    write(dir, 'package.json', JSON.stringify({
      name: 'good-app',
      scripts: { ...PASSING_QUALITY, dev: 'node server.js' }
    }));
    write(dir, 'server.js', [
      "const http = require('http');",
      'const port = Number(process.env.PORT) || 0;',
      "http.createServer((req, res) => { res.writeHead(200); res.end('ok'); })",
      "  .listen(port, '127.0.0.1', () => console.log('up on ' + port));"
    ].join('\n'));

    const res = runVerify(dir);

    assert.strictEqual(res.passed, true, `a responding app-shaped project must pass; errors: ${JSON.stringify(res.errors)}`);
    assert.strictEqual(res.checks.appRuns.applicable, true);
    assert.strictEqual(res.checks.appRuns.responded, true);
    assert.deepStrictEqual(res.errors, []);
  });

  it('leaves a library project unaffected (appRuns applicable:false, no gate impact)', () => {
    const dir = makeProject('ctoc-lastmile-lib-');
    write(dir, 'package.json', JSON.stringify({
      name: 'a-library',
      version: '1.0.0',
      main: 'index.js',
      scripts: { ...PASSING_QUALITY }
    }));
    write(dir, 'index.js', 'module.exports = { hello: () => "hi" };');

    const res = runVerify(dir);

    assert.strictEqual(res.passed, true, 'a library must not be gated on a runtime it does not have');
    assert.strictEqual(res.checks.appRuns.applicable, false);
    assert.deepStrictEqual(res.errors, []);
  });
});
