/**
 * W07-s6 — Portable shell-outs (SAST runner + disk probe)
 *
 * Finding M13: two POSIX-only shell-outs on hot paths.
 *   - src/lib/sast-runner.js runESLintSecurity() used
 *     `npx eslint ... 2>/dev/null || true` with { shell: true } — none of
 *     `2>/dev/null`, `|| true`, nor the cmd.exe-invalid shell string is portable
 *     to Windows.
 *   - src/lib/runner-detect.js checkDisk() shelled out to `df -k ... | tail -1`;
 *     `df` and `tail` do not exist on a stock Windows install.
 *
 * These tests assert BOTH:
 *   (a) a STATIC source guarantee — the POSIX-only constructs are absent from the
 *       source, so a dev machine that happens to have /bin/sh, df, and tail cannot
 *       mask the Windows failure; and
 *   (b) shell-independent BEHAVIOR — checkDisk() works with an empty PATH (no
 *       PATH-resolved external binary is needed), and runESLintSecurity() resolves
 *       via its catch path without a shell.
 *
 * Scope note: runner-detect.js legitimately retains `2>/dev/null` at other call
 * sites (commandVersion, checkExistingRunner) — those are separate findings,
 * explicitly out of scope for this slice per the parent plan's Out-of-Scope. This
 * slice touches only the `df | tail` disk probe, so the runner-detect static
 * assertion targets `df `/`| tail` only.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const REPO_ROOT = path.join(__dirname, '..');
const SAST_RUNNER_PATH = path.join(REPO_ROOT, 'src', 'lib', 'sast-runner.js');

// ---------------------------------------------------------------------------
// STATIC source guarantees
// ---------------------------------------------------------------------------

test('sast-runner.js source contains no 2>/dev/null POSIX redirect', () => {
  const src = fs.readFileSync(SAST_RUNNER_PATH, 'utf8');
  assert.ok(
    !src.includes('2>/dev/null'),
    'sast-runner.js must not use the POSIX-only `2>/dev/null` redirect'
  );
});

test('sast-runner.js source contains no `|| true` POSIX shell fallback', () => {
  const src = fs.readFileSync(SAST_RUNNER_PATH, 'utf8');
  assert.ok(
    !src.includes('|| true'),
    'sast-runner.js must not use the POSIX-only `|| true` shell fallback'
  );
});

test('sast-runner.js source does not enable `shell: true`', () => {
  const src = fs.readFileSync(SAST_RUNNER_PATH, 'utf8');
  assert.ok(
    !/shell:\s*true/.test(src),
    'sast-runner.js must not spawn with `shell: true` (no shell means no cmd.exe/sh dependency)'
  );
});

test('runESLintSecurity() resolves without throwing when ESLint security is unavailable', async () => {
  delete require.cache[require.resolve(SAST_RUNNER_PATH)];
  const { SASTRunner } = require(SAST_RUNNER_PATH);

  // A temp dir with no ESLint config: eslint (if resolvable at all) errors on the
  // missing `security` plugin / missing flat config → non-zero exit → the method's
  // catch path. The method must resolve, never reject, and never depend on a shell.
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'w07-sast-'));
  try {
    const runner = new SASTRunner(tmpDir, { timeout: 30000 });
    await assert.doesNotReject(
      runner.runESLintSecurity(),
      'runESLintSecurity() must resolve (catch path) even when ESLint security is unavailable'
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
