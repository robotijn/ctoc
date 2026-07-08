/**
 * EC4-s3 — eu-solution-recommender operations-registry LIVE wiring tests.
 *
 * PI4: a registry entry is a human-facing dispatch surface (CTO Chief reads it
 * to dispatch), so the wiring is asserted by a REAL resolution test — not prose.
 * Mirrors the EC3-s3 precedent (tests/eu-ai-act-agent-registry.test.js).
 *
 * Proves:
 *   - the eu-solution-recommender entry is present under `agents:` (CTO Chief can discover it);
 *   - its `path` resolves to the REAL s2 agent file on disk (no dangling pointer);
 *   - tier:2 / category:compliance are recorded;
 *   - it is web-enabled (tools include WebSearch + WebFetch) and stays advisory (no review_gate);
 *   - invoked_by records gdpr-agent + eu-ai-act-agent (called by EC2/EC3, not self-gated);
 *   - GATE INTEGRITY: the "NEVER block humans" banner, the three iron-loop
 *     `human_gate: true` markers, and the three `review_gate: true` markers are
 *     UNCHANGED — the additive edit weakened no human gate.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.join(__dirname, '..');
const REGISTRY = path.join(REPO_ROOT, '.ctoc', 'operations-registry.yaml');
const AGENT_REL = 'agents/compliance/eu-solution-recommender.md';

const registrySrc = fs.readFileSync(REGISTRY, 'utf8');

// Isolate the eu-solution-recommender entry block so per-entry assertions don't leak.
function entryBlock(src, key) {
  const re = new RegExp(`^\\s{2}${key}:\\s*$([\\s\\S]*?)(?=^\\s{2}[a-z#]|^[a-z#]|^\\s*$)`, 'm');
  const m = src.match(re);
  return m ? m[0] : null;
}

describe('operations-registry — eu-solution-recommender LIVE wiring', () => {
  it('1. registry contains an eu-solution-recommender entry CTO Chief can discover', () => {
    assert.match(registrySrc, /^\s{2}eu-solution-recommender:/m, 'eu-solution-recommender key present under agents:');
  });

  it('2. path resolves to the REAL s2 agent file on disk (no dangling pointer)', () => {
    assert.match(
      registrySrc,
      /path:\s*agents\/compliance\/eu-solution-recommender\.md/,
      'path points at the s2 agent definition',
    );
    assert.ok(
      fs.existsSync(path.join(REPO_ROOT, AGENT_REL)),
      'the registered agent definition file exists on disk',
    );
  });

  it('3. tier:2 and category:compliance are recorded on the entry', () => {
    const block = entryBlock(registrySrc, 'eu-solution-recommender');
    assert.ok(block, 'eu-solution-recommender entry block isolated');
    assert.match(block, /tier:\s*2\b/, 'tier: 2');
    assert.match(block, /category:\s*compliance\b/, 'category: compliance');
  });

  it('4. web-enabled (tools include WebSearch + WebFetch) and stays advisory (no review_gate)', () => {
    const block = entryBlock(registrySrc, 'eu-solution-recommender');
    assert.ok(block, 'eu-solution-recommender entry block isolated');
    assert.match(block, /tools:.*WebSearch/, 'tools include WebSearch');
    assert.match(block, /tools:.*WebFetch/, 'tools include WebFetch');
    assert.doesNotMatch(block, /review_gate:\s*true/, 'eu-solution-recommender carries no review_gate: true');
  });

  it('5. invoked_by records gdpr-agent + eu-ai-act-agent (called by EC2/EC3, not self-gated)', () => {
    const block = entryBlock(registrySrc, 'eu-solution-recommender');
    assert.ok(block, 'eu-solution-recommender entry block isolated');
    assert.match(block, /invoked_by:.*gdpr-agent/, 'invoked_by names gdpr-agent');
    assert.match(block, /invoked_by:.*eu-ai-act-agent/, 'invoked_by names eu-ai-act-agent');
    assert.doesNotMatch(block, /gated_by:/, 'no gated_by marker (activation scoped by the caller)');
  });
});

describe('operations-registry — gate integrity (no human gate weakened)', () => {
  it('6. the "NEVER block humans" Core Principles banner is intact', () => {
    assert.match(registrySrc, /1\. NEVER block humans/, 'Core Principles banner unchanged');
  });

  it('7. exactly the three iron-loop human_gate: true markers remain', () => {
    const humanGates = [...registrySrc.matchAll(/human_gate:\s*true/g)];
    assert.equal(humanGates.length, 3, 'three iron-loop human gates on steps 3/6/15, unchanged');
  });

  it('8. exactly the three review_gate: true markers remain', () => {
    const reviewGates = [...registrySrc.matchAll(/review_gate:\s*true/g)];
    assert.equal(reviewGates.length, 3, 'three review-agent review_gate markers, unchanged');
  });
});
