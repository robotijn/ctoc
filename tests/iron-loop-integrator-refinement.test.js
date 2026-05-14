/**
 * Tests for v6.9.7 — integrator drives the refinement loop.
 *
 * Verifies the iron-loop-integrator agent definition now documents
 * dual semantics for Steps 11/12/13 and references the loop spec.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const AGENT = path.join(__dirname, '..', 'agents', 'iron-loop', 'iron-loop-integrator.md');
const content = fs.readFileSync(AGENT, 'utf8');

describe('iron-loop-integrator — refinement loop awareness (v6.9.7)', () => {
  it('declares Refinement Loop Awareness section', () => {
    assert.match(content, /## Refinement Loop Awareness/);
  });

  it('documents dual semantics for Steps 11/12/13', () => {
    assert.match(content, /dual semantics/i);
    assert.match(content, /Step 11/);
    assert.match(content, /Step 12/);
    assert.match(content, /Step 13/);
  });

  it('references the refinement loop spec', () => {
    assert.match(content, /docs\/REFINEMENT_LOOP\.md/);
  });

  it('references the shouldRunLoop gate function', () => {
    assert.match(content, /shouldRunLoop/);
  });

  it('references the refinement-triggers config', () => {
    assert.match(content, /refinement-triggers\.yaml/);
  });

  it('preserves the canonical 16-step skeleton (do-not-delete rule)', () => {
    assert.match(content, /16-step skeleton is invariant|Do NOT delete or rename the canonical steps/i);
  });

  it('classifies warnings as critical-tier findings (Step 13)', () => {
    assert.match(content, /0 warnings across all toolchains/);
    assert.match(content, /warnings classify as critical-tier|warnings.*critical/i);
  });

  it('does NOT dispatch critics itself — that is CTO Chief role', () => {
    assert.match(content, /does not itself dispatch|does NOT.*dispatch critics/i);
  });

  it('records gating decision under "Decisions Taken Under Ambiguity"', () => {
    assert.match(content, /Decisions Taken Under Ambiguity/);
  });

  it('preserves the original Step 11 OPTIMIZE label', () => {
    assert.match(content, /### Step 11: OPTIMIZE/);
  });

  it('preserves the original Step 12 SECURE label', () => {
    assert.match(content, /### Step 12: SECURE/);
  });

  it('preserves the original Step 13 VERIFY label', () => {
    assert.match(content, /### Step 13: VERIFY/);
  });

  it('shows Refinement-loop mode for each of 11/12/13', () => {
    const step11Idx = content.indexOf('### Step 11: OPTIMIZE');
    const step12Idx = content.indexOf('### Step 12: SECURE');
    const step13Idx = content.indexOf('### Step 13: VERIFY');
    const step14Idx = content.indexOf('### Step 14: DOCUMENT');

    const step11Body = content.slice(step11Idx, step12Idx);
    const step12Body = content.slice(step12Idx, step13Idx);
    const step13Body = content.slice(step13Idx, step14Idx);

    assert.match(step11Body, /Refinement-loop mode/);
    assert.match(step12Body, /Refinement-loop mode/);
    assert.match(step13Body, /Refinement-loop mode/);
  });

  it('mentions the journal location', () => {
    assert.match(content, /\.ctoc\/loops\/.*journal\.yaml/);
  });

  it('mentions the 4 phases (critical/medium/low/final-sweep)', () => {
    assert.match(content, /critical/);
    assert.match(content, /medium/);
    assert.match(content, /low/);
    assert.match(content, /final-sweep/);
  });
});
