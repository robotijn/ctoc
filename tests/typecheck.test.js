/**
 * Typecheck Enforcement Test (ratcheting baseline)
 *
 * Shells out to `tsc --noEmit` (TypeScript checkJs over src/**) and asserts the
 * number of type errors is AT OR BELOW the committed baseline in
 * .ctoc/typecheck-baseline.json.
 *
 * Why a baseline instead of zero: the codebase is plain CommonJS JavaScript with
 * minimal JSDoc, so a from-scratch `tsc --checkJs` run reports inference-artifact
 * errors (object shapes inferred from first use, Date-string arithmetic, etc.)
 * that are not runtime bugs. Driving them to zero requires a large, separate
 * JSDoc-annotation effort. Until then this gate enforces a RATCHET:
 *
 *   - It is NEVER always-green: if the current error count rises above the
 *     baseline, the test fails. New code may not add type errors.
 *   - The baseline may only be LOWERED (annotate code, then lower the number).
 *     Lowering is rewarded automatically: if the current count drops below the
 *     baseline, the test fails with a message telling you to lower the baseline,
 *     locking in the improvement.
 *
 * This is the standard "type-coverage ratchet" pattern for gradual checkJs
 * adoption.
 */

'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const REPO = path.join(__dirname, '..');
const TSC_BIN = path.join(REPO, 'node_modules', 'typescript', 'bin', 'tsc');
const BASELINE_FILE = path.join(REPO, '.ctoc', 'typecheck-baseline.json');

function countTscErrors(output) {
  // tsc prints one diagnostic per error in the form
  //   path(line,col): error TSxxxx: message
  // Count those lines. The trailing "Found N errors." summary is ignored.
  const matches = output.match(/: error TS\d+:/g);
  return matches ? matches.length : 0;
}

describe('Typecheck enforcement (ratcheting baseline)', () => {
  it('tsc --checkJs error count stays at or below the committed baseline', () => {
    assert.ok(
      fs.existsSync(TSC_BIN),
      `TypeScript is not installed at ${TSC_BIN}. Run \`npm install\` so the typecheck gate can run.`
    );
    assert.ok(
      fs.existsSync(BASELINE_FILE),
      `Missing typecheck baseline at ${BASELINE_FILE}.`
    );

    const baseline = JSON.parse(fs.readFileSync(BASELINE_FILE, 'utf8'));
    assert.equal(
      typeof baseline.maxErrors,
      'number',
      'typecheck-baseline.json must contain a numeric "maxErrors".'
    );

    const res = spawnSync(process.execPath, [TSC_BIN, '--noEmit'], {
      cwd: REPO,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024
    });

    assert.equal(res.error, undefined, `Failed to launch tsc: ${res.error && res.error.message}`);

    const output = `${res.stdout || ''}${res.stderr || ''}`;
    const current = countTscErrors(output);

    // Guard against a silent toolchain failure that produces no diagnostics:
    // tsc exits 0 only when there are zero errors. If it exited non-zero but we
    // parsed zero errors, something other than type errors broke (bad config,
    // crash) — fail loudly instead of treating it as "clean".
    if (res.status !== 0 && current === 0) {
      assert.fail(
        `tsc exited ${res.status} but produced no parseable diagnostics — ` +
        `the typecheck toolchain is broken.\n${output.trim()}`
      );
    }

    if (current > baseline.maxErrors) {
      assert.fail(
        `Typecheck regressed: ${current} errors > baseline ${baseline.maxErrors}. ` +
        `New code must not add type errors. Run \`npm run typecheck\` to see them, ` +
        `then fix the code or add JSDoc annotations.`
      );
    }

    if (current < baseline.maxErrors) {
      assert.fail(
        `Typecheck improved: ${current} errors < baseline ${baseline.maxErrors}. ` +
        `Lower "maxErrors" to ${current} in .ctoc/typecheck-baseline.json to lock in ` +
        `the improvement (the baseline is a one-way ratchet).`
      );
    }

    assert.equal(
      current,
      baseline.maxErrors,
      `Typecheck error count (${current}) matches baseline (${baseline.maxErrors}).`
    );
  });
});
