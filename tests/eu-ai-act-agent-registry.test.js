/**
 * EC3-s3 — eu-ai-act-agent operations-registry LIVE wiring tests.
 *
 * PI4: a registry entry is a human-facing dispatch surface (CTO Chief reads it
 * to dispatch), so the wiring is asserted by a REAL resolution test — not prose.
 *
 * Proves:
 *   - the eu-ai-act-agent entry is present under `agents:` (CTO Chief can discover it);
 *   - its `path` resolves to the REAL s2 agent file on disk (no dangling pointer);
 *   - tier:2 / category:compliance / gated_by:shouldRunEuAiAct are recorded;
 *   - GATE INTEGRITY: the "NEVER block humans" banner, the three iron-loop
 *     `human_gate: true` markers, and the three `review_gate: true` markers are
 *     UNCHANGED — the additive edit weakened no human gate;
 *   - the eu-ai-act-agent entry itself carries NO `review_gate: true` (it stays advisory).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.join(__dirname, '..');
const REGISTRY = path.join(REPO_ROOT, '.ctoc', 'operations-registry.yaml');
const AGENT_REL = 'agents/compliance/eu-ai-act-agent.md';

const registrySrc = fs.readFileSync(REGISTRY, 'utf8');

// Isolate the eu-ai-act-agent entry block (from its key to the next top-level-ish
// key or a blank-line/comment boundary) so per-entry assertions don't leak.
function entryBlock(src, key) {
  const re = new RegExp(`^\\s{2}${key}:\\s*$([\\s\\S]*?)(?=^\\s{2}[a-z#]|^[a-z#]|^\\s*$)`, 'm');
  const m = src.match(re);
  return m ? m[0] : null;
}

describe('operations-registry — eu-ai-act-agent LIVE wiring', () => {
  it('1. registry contains an eu-ai-act-agent entry CTO Chief can discover', () => {
    assert.match(registrySrc, /^\s{2}eu-ai-act-agent:/m, 'eu-ai-act-agent key present under agents:');
  });

  it('2. path resolves to the REAL s2 agent file on disk (no dangling pointer)', () => {
    assert.match(
      registrySrc,
      /path:\s*agents\/compliance\/eu-ai-act-agent\.md/,
      'path points at the s2 agent definition',
    );
    assert.ok(
      fs.existsSync(path.join(REPO_ROOT, AGENT_REL)),
      'the registered agent definition file exists on disk',
    );
  });

  it('3. tier:2 and category:compliance are recorded on the entry', () => {
    const block = entryBlock(registrySrc, 'eu-ai-act-agent');
    assert.ok(block, 'eu-ai-act-agent entry block isolated');
    assert.match(block, /tier:\s*2\b/, 'tier: 2');
    assert.match(block, /category:\s*compliance\b/, 'category: compliance');
  });

  it('4. gated_by: shouldRunEuAiAct is recorded (the EC1 gate is on the dispatch surface)', () => {
    const block = entryBlock(registrySrc, 'eu-ai-act-agent');
    assert.ok(block, 'eu-ai-act-agent entry block isolated');
    assert.match(block, /gated_by:\s*shouldRunEuAiAct\b/, 'gated_by: shouldRunEuAiAct');
  });
});

describe('operations-registry — gate integrity (no human gate weakened)', () => {
  it('5. the "NEVER block humans" Core Principles banner is intact', () => {
    assert.match(registrySrc, /1\. NEVER block humans/, 'Core Principles banner unchanged');
  });

  it('6. exactly the three iron-loop human_gate: true markers remain', () => {
    const humanGates = [...registrySrc.matchAll(/human_gate:\s*true/g)];
    assert.equal(humanGates.length, 3, 'three iron-loop human gates on steps 3/6/15, unchanged');
  });

  it('7. exactly the three review_gate: true markers remain', () => {
    const reviewGates = [...registrySrc.matchAll(/review_gate:\s*true/g)];
    assert.equal(reviewGates.length, 3, 'three review-agent review_gate markers, unchanged');
  });

  it('8. the eu-ai-act-agent entry adds NO review_gate (stays advisory)', () => {
    const block = entryBlock(registrySrc, 'eu-ai-act-agent');
    assert.ok(block, 'eu-ai-act-agent entry block isolated');
    assert.doesNotMatch(block, /review_gate:\s*true/, 'eu-ai-act-agent carries no review_gate: true');
  });
});
