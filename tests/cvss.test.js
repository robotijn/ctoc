'use strict';

/**
 * CVSS — the single-source CVSS v3 base-score + severity module (src/lib/cvss.js).
 *
 * F1 fix: sca-runner's mapOSVSeverity/mapCvssSeverity used parseFloat, which returns
 * NaN on a CVSS VECTOR string (exactly what OSV `severity[].score` and RustSec
 * `advisory.cvss` emit) — silently downgrading a CRITICAL dependency CVE to a
 * non-blocking MEDIUM. The correct scorer already existed as private methods on
 * DependencyAuditor; this module extracts them so BOTH runners route through one
 * audited implementation.
 *
 * These tests fence the two exported pure functions:
 *   - cvssVectorBaseScore(vector) → number | null (null iff the vector is incomplete)
 *   - severityFromCvss(scoreOrVectorOrLabel, SEVERITY) → SEVERITY.* (never under-report)
 *
 * `severityFromCvss` takes a SEVERITY vocabulary so it serves both the
 * DependencyAuditor map (mid-band key MODERATE) and the SCA map (mid-band key MEDIUM).
 */

const { test } = require('node:test');
const assert = require('node:assert');

const { cvssVectorBaseScore, severityFromCvss } = require('../src/lib/cvss');

// DependencyAuditor's vocabulary (mid-band = MODERATE).
const SEV_MODERATE = {
  CRITICAL: 'CRITICAL', HIGH: 'HIGH', MODERATE: 'MODERATE', LOW: 'LOW', INFO: 'INFO'
};
// SCA runner's vocabulary (mid-band = MEDIUM).
const SEV_MEDIUM = {
  CRITICAL: 'CRITICAL', HIGH: 'HIGH', MEDIUM: 'MEDIUM', LOW: 'LOW', INFO: 'INFO'
};

// ── cvssVectorBaseScore: the standard CVSS v3 base-score formula ─────────────────

test('cvssVectorBaseScore: the canonical worst-case network RCE vector scores 9.8', () => {
  const score = cvssVectorBaseScore('CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H');
  assert.strictEqual(score, 9.8, 'AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H is a 9.8 base score');
});

test('cvssVectorBaseScore: a confidentiality-only network vector scores 7.5 (HIGH band)', () => {
  const score = cvssVectorBaseScore('CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N');
  assert.strictEqual(score, 7.5);
});

test('cvssVectorBaseScore: an incomplete/garbage vector returns null (caller bands HIGH)', () => {
  assert.strictEqual(cvssVectorBaseScore('CVSS:3.1/AV:N/GARBAGE'), null);
  assert.strictEqual(cvssVectorBaseScore('not a vector at all'), null);
});

// ── severityFromCvss: vector / numeric / label, over-report on the unknown ───────

test('severityFromCvss: a 9.8 CVSS VECTOR string bands CRITICAL, never a downgraded MEDIUM', () => {
  assert.strictEqual(
    severityFromCvss('CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H', SEV_MEDIUM),
    'CRITICAL',
    'a CVSS-vector CRITICAL must map to CRITICAL — this is the F1 gate defect'
  );
  assert.strictEqual(
    severityFromCvss('CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H', SEV_MODERATE),
    'CRITICAL'
  );
});

test('severityFromCvss: a numeric 9.8 bands CRITICAL', () => {
  assert.strictEqual(severityFromCvss(9.8, SEV_MEDIUM), 'CRITICAL');
  assert.strictEqual(severityFromCvss('9.8', SEV_MEDIUM), 'CRITICAL');
});

test('severityFromCvss: a bare label HIGH maps to HIGH', () => {
  assert.strictEqual(severityFromCvss('HIGH', SEV_MEDIUM), 'HIGH');
  assert.strictEqual(severityFromCvss('high', SEV_MODERATE), 'HIGH');
});

test('severityFromCvss: the mid band resolves to each vocabulary’s own key', () => {
  // 5.0 is the CVSS mid band. In the SCA vocabulary that is MEDIUM; in the
  // DependencyAuditor vocabulary it is MODERATE.
  assert.strictEqual(severityFromCvss(5.0, SEV_MEDIUM), 'MEDIUM');
  assert.strictEqual(severityFromCvss(5.0, SEV_MODERATE), 'MODERATE');
  // A 'medium'/'moderate' label maps to the same mid band.
  assert.strictEqual(severityFromCvss('medium', SEV_MEDIUM), 'MEDIUM');
  assert.strictEqual(severityFromCvss('moderate', SEV_MODERATE), 'MODERATE');
});

test('severityFromCvss: an unknown/absent severity over-reports to the mid band, never LOW', () => {
  for (const v of [undefined, null, '', 'whatever', {}, NaN]) {
    assert.strictEqual(
      severityFromCvss(v, SEV_MEDIUM), 'MEDIUM',
      `unknown severity ${JSON.stringify(v)} must default to the mid band, never LOW`
    );
  }
});

test('severityFromCvss: an unparseable CVSS vector bands HIGH, never the mid band or LOW', () => {
  const banded = severityFromCvss('CVSS:3.1/AV:N/GARBAGE', SEV_MEDIUM);
  assert.strictEqual(banded, 'HIGH', 'a security advisory carrying a CVSS vector is never downgraded');
});

test('severityFromCvss: a MIXED "9.9 HIGH" string takes the MAX of the numeric and label tokens', () => {
  assert.strictEqual(severityFromCvss('7.5 HIGH', SEV_MEDIUM), 'HIGH');
  assert.strictEqual(severityFromCvss('9.8 CRITICAL', SEV_MEDIUM), 'CRITICAL');
  assert.strictEqual(severityFromCvss('9.9 HIGH', SEV_MEDIUM), 'CRITICAL');
});

test('severityFromCvss: array and object score shapes are handled, taking the MAX', () => {
  assert.strictEqual(severityFromCvss(['LOW', 'CRITICAL', 'MODERATE'], SEV_MEDIUM), 'CRITICAL');
  assert.strictEqual(severityFromCvss({ baseScore: 9.8 }, SEV_MEDIUM), 'CRITICAL');
  assert.strictEqual(severityFromCvss({ score: '7.5' }, SEV_MEDIUM), 'HIGH');
  assert.strictEqual(
    severityFromCvss([{ score: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H' }], SEV_MEDIUM),
    'CRITICAL'
  );
});
