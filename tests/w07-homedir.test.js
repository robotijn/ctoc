/**
 * W07-s7 — os.homedir() over process.env.HOME (Finding M22)
 *
 * Two modules build the grades path from process.env.HOME, which is undefined
 * on Windows. agent-critic-loop.js:44 is a module-level const, so path.join
 * throws a TypeError at require() time when HOME is unset. grading-system.js
 * guards with `|| '/tmp'`, so it does not throw but resolves to a bogus path.
 *
 * These tests assert BEHAVIOR on a platform where HOME is unset but a real home
 * directory is still resolvable (os.homedir() falls back to USERPROFILE/getpwuid).
 */

const { test } = require('node:test');
const assert = require('node:assert');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const projectRoot = path.join(__dirname, '..');
const criticLoopPath = path.join(projectRoot, 'src/lib/agent-critic-loop.js');

/** Build a copy of process.env with HOME removed (leaving USERPROFILE/getpwuid). */
function envWithoutHome() {
  const env = { ...process.env };
  delete env.HOME;
  return env;
}

test('agent-critic-loop loads in a child process with HOME unset', () => {
  // Module cache means a second in-process require would not re-run the
  // top-level path.join — the throw only reproduces in a fresh process.
  assert.doesNotThrow(() => {
    execFileSync(
      process.execPath,
      ['-e', `require(${JSON.stringify(criticLoopPath)})`],
      { env: envWithoutHome(), cwd: projectRoot, stdio: 'pipe' }
    );
  });
});

test('agent-critic-loop GRADES_FILE resolves under os.homedir(), not /tmp', () => {
  const script =
    `const m = require(${JSON.stringify(criticLoopPath)});` +
    `process.stdout.write(m.GRADES_FILE || '');`;
  const out = execFileSync(
    process.execPath,
    ['-e', script],
    { env: envWithoutHome(), cwd: projectRoot, stdio: 'pipe' }
  ).toString();

  assert.ok(out.length > 0, 'GRADES_FILE should be a non-empty path');
  assert.ok(
    out.startsWith(os.homedir()),
    `GRADES_FILE (${out}) should start with os.homedir() (${os.homedir()})`
  );
  assert.ok(!out.includes('/tmp'), `GRADES_FILE (${out}) should not resolve under /tmp`);
});

test('grading-system.getGradesFile() resolves under os.homedir() with HOME deleted', () => {
  const grading = require('../src/lib/grading-system');
  const savedHome = process.env.HOME;
  try {
    delete process.env.HOME;
    const gradesFile = grading.getGradesFile();
    assert.ok(
      gradesFile.startsWith(os.homedir()),
      `getGradesFile() (${gradesFile}) should start with os.homedir() (${os.homedir()})`
    );
    assert.ok(
      !gradesFile.startsWith('/tmp'),
      `getGradesFile() (${gradesFile}) should not be /tmp-derived`
    );
  } finally {
    if (savedHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = savedHome;
    }
  }
});
