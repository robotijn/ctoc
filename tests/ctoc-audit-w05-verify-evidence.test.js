/**
 * W05-s1 — Persist and read real VERIFY evidence.
 *
 * SIP1 slice 1 of 5 for functional plan `ctoc-audit-w05-gate3-verifies`
 * (finding C9, vision `ctoc-self-audit-remediation`).
 *
 * These tests drive three new functions on `src/lib/step-13-verify.js`:
 *   - verifyEvidencePath(projectPath, planSlug)
 *   - persistVerifyResult(projectPath, planSlug)  (the real caller for runVerify)
 *   - readVerifyEvidence(projectPath, planSlug)
 *
 * Zero-doubles constraint (project rule): no mocking/stubbing of runVerify.
 * The persist path runs against a REAL empty temp project (no
 * package.json/pyproject.toml/go.mod/Cargo.toml), for which runVerify's
 * fallback finds no toolchain and returns passed:true deterministically and
 * fast. The failing-evidence read path uses a REAL hand-written artifact JSON
 * file on disk (a data fixture, not a code double).
 */

'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  verifyEvidencePath,
  persistVerifyResult,
  readVerifyEvidence
} = require('../src/lib/step-13-verify');

describe('W05-s1 VERIFY evidence: persist and read', () => {
  let tempRoot;

  before(() => {
    // A real project with a REAL passing test script. R4-A closed the vacuous
    // pass: an EMPTY project now fails loudly (no-verifiable-toolchain), so the
    // persist/round-trip cases need a project that genuinely verifies something.
    // `main` keeps it a library (no app to launch); the test script runs and
    // passes deterministically without any network or external tool.
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-w05-s1-'));
    fs.writeFileSync(path.join(tempRoot, 'package.json'), JSON.stringify({
      name: 'w05-fixture', version: '1.0.0', main: 'index.js',
      scripts: { test: 'node -e "process.exit(0)"' }
    }, null, 2));
  });

  after(() => {
    try {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    } catch (e) {
      // Best-effort teardown; ignore cleanup errors.
    }
  });

  // Case 1 — read: absent -> null.
  it('readVerifyEvidence returns null when no artifact exists', () => {
    const result = readVerifyEvidence(tempRoot, 'nope');
    assert.strictEqual(result, null);
  });

  // Case 2 — persist writes a readable, timestamped, passing artifact that
  // round-trips through readVerifyEvidence.
  it('persistVerifyResult writes a passing, timestamped artifact that round-trips', () => {
    const artifact = persistVerifyResult(tempRoot, 'plan-a');

    assert.strictEqual(artifact.passed, true, 'a real project with a passing test script passes VERIFY');
    assert.strictEqual(artifact.planSlug, 'plan-a');
    assert.ok(typeof artifact.timestamp === 'string', 'timestamp should be a string');
    // ISO 8601 round-trips through Date without becoming Invalid Date.
    assert.strictEqual(
      new Date(artifact.timestamp).toISOString(),
      artifact.timestamp,
      'timestamp should be a valid ISO 8601 instant'
    );

    // The file exists at the computed path.
    const evidencePath = verifyEvidencePath(tempRoot, 'plan-a');
    assert.ok(fs.existsSync(evidencePath), 'evidence file should exist on disk');

    // And it round-trips to a deep-equal object.
    const readBack = readVerifyEvidence(tempRoot, 'plan-a');
    assert.deepStrictEqual(readBack, artifact);
  });

  // Case 3 — persist proves runVerify actually ran (the caller exists): the
  // returned artifact carries a method field populated by runVerify, not a
  // fabricated result.
  it('persistVerifyResult invokes runVerify (method field is populated by the runner)', () => {
    const artifact = persistVerifyResult(tempRoot, 'plan-method');
    assert.ok(
      artifact.method === 'ctoc-quality-gate' || artifact.method === 'fallback-direct',
      `method should come from runVerify; got ${JSON.stringify(artifact.method)}`
    );
    // In an empty project with no ctoc CLI, the runner takes the fallback path.
    assert.strictEqual(artifact.method, 'fallback-direct');
  });

  // Case 4 — read: faithfully surfaces a recorded FAILURE. This is the datum
  // that slice s2 will reject on at the review->done gate.
  it('readVerifyEvidence faithfully surfaces a recorded failing run', () => {
    const failing = {
      planSlug: 'plan-b',
      passed: false,
      method: 'fallback-direct',
      checks: {},
      errors: ['Tests failed: 1'],
      summary: '1 check(s) failed: Tests failed: 1',
      timestamp: new Date().toISOString()
    };
    const evidencePath = verifyEvidencePath(tempRoot, 'plan-b');
    fs.mkdirSync(path.dirname(evidencePath), { recursive: true });
    fs.writeFileSync(evidencePath, JSON.stringify(failing, null, 2));

    const result = readVerifyEvidence(tempRoot, 'plan-b');
    assert.notStrictEqual(result, null);
    assert.strictEqual(result.passed, false);
    assert.deepStrictEqual(result.errors, ['Tests failed: 1']);
  });

  // Case 5 — read: corrupt JSON -> null (never throws). Corrupt reads as
  // absent so s2 fails closed on unusable evidence.
  it('readVerifyEvidence returns null (does not throw) on corrupt JSON', () => {
    const evidencePath = verifyEvidencePath(tempRoot, 'plan-corrupt');
    fs.mkdirSync(path.dirname(evidencePath), { recursive: true });
    fs.writeFileSync(evidencePath, '{ not json');

    let result;
    assert.doesNotThrow(() => {
      result = readVerifyEvidence(tempRoot, 'plan-corrupt');
    });
    assert.strictEqual(result, null);
  });

  // Security: the evidence path is built under a fixed .ctoc/state/verify/ root
  // from a bare slug basename. A bare slug produces no path separators beyond
  // that fixed root, keeping the write inside .ctoc/state/verify/.
  it('verifyEvidencePath keeps a bare slug under .ctoc/state/verify/', () => {
    const evidencePath = verifyEvidencePath(tempRoot, 'plan-a');
    const expected = path.join(tempRoot, '.ctoc', 'state', 'verify', 'plan-a.json');
    assert.strictEqual(evidencePath, expected);
  });
});
