/**
 * Lint Enforcement Test
 *
 * Shells out to the project's `lint` npm script (ESLint flat config) and asserts
 * a clean exit (0 errors). This makes lint a HARD GATE in the test suite: any new
 * ESLint *error* (not warning) introduced anywhere in src/** or tests/** will fail
 * `node --test tests/*.test.js`.
 *
 * Warnings (the eslint-plugin-security advisories) do not fail the build — ESLint
 * exits 0 with warnings present. Only errors cause a non-zero exit.
 *
 * Cross-platform: uses process.execPath via npm's bin resolution and never assumes
 * a shell.
 */

'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const REPO = path.join(__dirname, '..');
const ESLINT_BIN = path.join(REPO, 'node_modules', 'eslint', 'bin', 'eslint.js');

describe('Lint enforcement', () => {
  it('ESLint reports zero errors across the codebase', () => {
    // If dependencies are not installed, fail loudly rather than silently skip —
    // the gate must never be a no-op. Run `npm install` to provision the toolchain.
    assert.ok(
      fs.existsSync(ESLINT_BIN),
      `ESLint is not installed at ${ESLINT_BIN}. Run \`npm install\` so the lint gate can run.`
    );

    const res = spawnSync(process.execPath, [ESLINT_BIN, '.', '--format', 'stylish'], {
      cwd: REPO,
      encoding: 'utf8',
      // Generous buffer: a full run over src/** + tests/** can be large.
      maxBuffer: 64 * 1024 * 1024
    });

    assert.equal(res.error, undefined, `Failed to launch ESLint: ${res.error && res.error.message}`);

    // ESLint exit codes: 0 = no errors (warnings allowed), 1 = lint errors,
    // 2 = config/internal failure. Anything non-zero is a failure for this gate.
    if (res.status !== 0) {
      const out = `${res.stdout || ''}${res.stderr || ''}`.trim();
      assert.fail(
        `ESLint exited with code ${res.status} (expected 0).\n` +
        `Run \`npm run lint\` to see the errors. Output:\n${out}`
      );
    }
  });
});
