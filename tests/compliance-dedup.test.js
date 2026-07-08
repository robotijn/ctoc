/**
 * Tests for the cross-regime compliance-finding dedup (EC5-s2).
 *
 * Contract under test (see plans/todo/EC5-s2-compliance-dedup.md):
 *   deduplicateFindings(ec2Findings, ec3Findings) → mergedFindings[]
 *   - key each finding on (kind, normalizeRegulationRef(regulation_ref))
 *   - EC2 (GDPR) list is passed FIRST for stable precedence
 *   - on collision: keep highest confidence (high>medium>low>undefined);
 *     EC2 (first-seen) wins on a true tie; survivor.message names BOTH
 *     regulation sources; survivor.severity = 'critical'
 *   - different `kind` NEVER merges (conservative — no false-positive merge)
 *   - unknown regulation_ref falls back to its own slug (never collides with a
 *     known topic)
 *   - non-array inputs coerced to []; inputs never mutated; never throws for
 *     object/array inputs
 */

'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const {
  deduplicateFindings,
  normalizeRegulationRef,
  dedupKey,
} = require('../src/lib/compliance-dedup');

describe('deduplicateFindings — cross-regime merge', () => {
  it('case 1: parent worked example merges GDPR Art. 5(1)(e) + EU-AI-Act Art. 10 to one', () => {
    const ec2 = [{
      kind: 'missing-data-governance',
      regulation_ref: 'GDPR Art. 5(1)(e)',
      confidence: 'medium',
      severity: 'critical',
    }];
    const ec3 = [{
      kind: 'missing-data-governance',
      regulation_ref: 'EU-AI-Act Art. 10',
      confidence: 'medium',
      severity: 'critical',
    }];

    const out = deduplicateFindings(ec2, ec3);
    assert.equal(out.length, 1, 'the cross-regime pair must collapse to one finding');
    assert.equal(out[0].severity, 'critical');
    assert.match(out[0].message, /GDPR Art\. 5\(1\)\(e\)/, 'message names the GDPR ref');
    assert.match(out[0].message, /EU-AI-Act Art\. 10/, 'message names the EU-AI-Act ref');
  });

  it('case 2: tie keeps the EC2 (first-argument) finding', () => {
    const ec2 = [{
      kind: 'missing-data-governance',
      regulation_ref: 'GDPR Art. 5',
      confidence: 'medium',
      severity: 'critical',
      _origin: 'ec2',
    }];
    const ec3 = [{
      kind: 'missing-data-governance',
      regulation_ref: 'EU-AI-Act Art. 10',
      confidence: 'medium',
      severity: 'critical',
      _origin: 'ec3',
    }];

    const out = deduplicateFindings(ec2, ec3);
    assert.equal(out.length, 1);
    assert.equal(out[0]._origin, 'ec2', 'on a confidence tie the EC2 finding survives');
  });

  it('case 3: higher confidence wins (EC3 high beats EC2 low)', () => {
    const ec2 = [{
      kind: 'missing-data-governance',
      regulation_ref: 'GDPR Art. 5',
      confidence: 'low',
      severity: 'critical',
      _origin: 'ec2',
    }];
    const ec3 = [{
      kind: 'missing-data-governance',
      regulation_ref: 'EU-AI-Act Art. 10',
      confidence: 'high',
      severity: 'critical',
      _origin: 'ec3',
    }];

    const out = deduplicateFindings(ec2, ec3);
    assert.equal(out.length, 1);
    assert.equal(out[0]._origin, 'ec3', 'higher-confidence EC3 finding survives');
    assert.equal(out[0].severity, 'critical');
    assert.match(out[0].message, /GDPR Art\. 5/);
    assert.match(out[0].message, /EU-AI-Act Art\. 10/);
  });

  it('case 4: different kind NEVER merges (same regulation_ref)', () => {
    const ec2 = [{
      kind: 'missing-data-governance',
      regulation_ref: 'GDPR Art. 5',
      confidence: 'medium',
      severity: 'critical',
    }];
    const ec3 = [{
      kind: 'missing-transparency',
      regulation_ref: 'GDPR Art. 5',
      confidence: 'medium',
      severity: 'critical',
    }];

    const out = deduplicateFindings(ec2, ec3);
    assert.equal(out.length, 2, 'different kind is conservative: keep both');
  });

  it('case 5: unknown regulation_ref does not collide with a known topic', () => {
    const ec2 = [{
      kind: 'missing-data-governance',
      regulation_ref: 'GDPR Art. 30', // not in the table → own slug
      confidence: 'medium',
      severity: 'critical',
    }];
    const ec3 = [{
      kind: 'missing-data-governance',
      regulation_ref: 'EU-AI-Act Art. 10', // → data-governance
      confidence: 'medium',
      severity: 'critical',
    }];

    const out = deduplicateFindings(ec2, ec3);
    assert.equal(out.length, 2, 'unknown ref must not merge into the known data-governance topic');
  });

  it('case 6: non-array inputs coerce to []; single-list passes through', () => {
    assert.deepEqual(deduplicateFindings(null, undefined), []);
    assert.deepEqual(deduplicateFindings(undefined, undefined), []);
    assert.deepEqual(deduplicateFindings('nope', 42), []);

    const f = { kind: 'k', regulation_ref: 'GDPR Art. 30', confidence: 'low' };
    const out = deduplicateFindings([f], null);
    assert.equal(out.length, 1);
    assert.equal(out[0].kind, 'k');
  });

  it('case 7: inputs are never mutated (deep-frozen inputs, no throw)', () => {
    const ec2 = [Object.freeze({
      kind: 'missing-data-governance',
      regulation_ref: 'GDPR Art. 5(1)(e)',
      confidence: 'medium',
      severity: 'critical',
    })];
    const ec3 = [Object.freeze({
      kind: 'missing-data-governance',
      regulation_ref: 'EU-AI-Act Art. 10',
      confidence: 'medium',
      severity: 'critical',
    })];
    Object.freeze(ec2);
    Object.freeze(ec3);

    const before2 = JSON.stringify(ec2);
    const before3 = JSON.stringify(ec3);
    assert.doesNotThrow(() => deduplicateFindings(ec2, ec3));
    assert.equal(JSON.stringify(ec2), before2, 'ec2 unchanged');
    assert.equal(JSON.stringify(ec3), before3, 'ec3 unchanged');
    // original findings still lack a `message` (survivor is a fresh object)
    assert.equal(ec2[0].message, undefined);
    assert.equal(ec3[0].message, undefined);
  });

  it('case 6b: non-object elements pass through without throwing', () => {
    const out = deduplicateFindings([null, 5, 'x'], []);
    assert.equal(out.length, 3);
  });

  it('input order is stable by first-seen key', () => {
    const ec2 = [
      { kind: 'a', regulation_ref: 'GDPR Art. 30', confidence: 'low' },
      { kind: 'b', regulation_ref: 'GDPR Art. 15', confidence: 'low' },
    ];
    const ec3 = [
      { kind: 'c', regulation_ref: 'EU-AI-Act Art. 99', confidence: 'low' },
    ];
    const out = deduplicateFindings(ec2, ec3);
    assert.deepEqual(out.map((f) => f.kind), ['a', 'b', 'c']);
  });
});

describe('normalizeRegulationRef — unit', () => {
  it('case 8: GDPR Art. 5(1)(e) and EU-AI-Act Art. 10 both normalize to data-governance', () => {
    assert.equal(normalizeRegulationRef('GDPR Art. 5(1)(e)'), 'data-governance');
    assert.equal(normalizeRegulationRef('EU-AI-Act Art. 10'), 'data-governance');
    assert.equal(normalizeRegulationRef('GDPR Art. 5'), 'data-governance');
  });

  it('normalization is case/space tolerant for known stems', () => {
    assert.equal(normalizeRegulationRef('  gdpr art. 5(1)(e)  '), 'data-governance');
    assert.equal(normalizeRegulationRef('EU-AI-ACT ART. 10'), 'data-governance');
  });

  it('non-string ⇒ empty string', () => {
    assert.equal(normalizeRegulationRef(null), '');
    assert.equal(normalizeRegulationRef(undefined), '');
    assert.equal(normalizeRegulationRef(42), '');
    assert.equal(normalizeRegulationRef({}), '');
  });

  it('unknown ref falls back to its own trimmed/lowercased value', () => {
    assert.equal(normalizeRegulationRef('  GDPR Art. 30  '), 'gdpr art. 30');
  });
});

describe('dedupKey — unit', () => {
  it('case 9: same kind + same topic ⇒ identical key; differing kind ⇒ different key', () => {
    const a = { kind: 'missing-data-governance', regulation_ref: 'GDPR Art. 5(1)(e)' };
    const b = { kind: 'missing-data-governance', regulation_ref: 'EU-AI-Act Art. 10' };
    const c = { kind: 'missing-transparency', regulation_ref: 'GDPR Art. 5(1)(e)' };

    assert.equal(dedupKey(a), dedupKey(b), 'same kind + same topic collapse to one key');
    assert.notEqual(dedupKey(a), dedupKey(c), 'different kind ⇒ different key');
  });

  it('missing fields use empty-string parts safely', () => {
    assert.equal(dedupKey({}), '::');
    assert.equal(dedupKey(null), '::');
    assert.equal(dedupKey(undefined), '::');
  });
});

describe('GATE-INVARIANT (load-bearing)', () => {
  it('case 10: human-gate-check keeps exactly 3 destination keys and dedup names no gate key', () => {
    const gateSrc = fs.readFileSync(
      path.join(__dirname, '..', 'src', 'hooks', 'human-gate-check.js'),
      'utf8'
    );
    // Parse the HUMAN_GATES object literal destination keys.
    const block = gateSrc.match(/const HUMAN_GATES\s*=\s*\{([\s\S]*?)\};/);
    assert.ok(block, 'HUMAN_GATES literal present');
    const keys = [...block[1].matchAll(/'([a-z-]+)'\s*:/g)].map((m) => m[1]);
    assert.deepEqual(
      keys.sort(),
      ['done', 'implementation', 'todo'],
      'exactly 3 gate destination keys'
    );

    const dedupSrc = fs.readFileSync(
      path.join(__dirname, '..', 'src', 'lib', 'compliance-dedup.js'),
      'utf8'
    );
    for (const forbidden of ['HUMAN_GATES', 'requireReviewGate', 'enforcementMode', 'review_gate']) {
      assert.ok(
        !dedupSrc.includes(forbidden),
        `dedup module must not reference gate token "${forbidden}"`
      );
    }
  });
});
