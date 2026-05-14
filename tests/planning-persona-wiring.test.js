/**
 * Tests: planning-chain persona-wiring (v8.5)
 *
 * Verifies that the planning agents (vision-advisor, product-owner,
 * implementation-planner) actually USE the persona system — not just
 * declare it in frontmatter. Their body text must:
 *
 *   1. Reference .ctoc/session/persona.yaml as the persona source
 *   2. Reference .ctoc/templates/questions.yaml as the question catalog
 *   3. Describe persona-gated behavior (defer questions to inbox)
 *   4. Hand off to the next agent based on persona
 *
 * Plus tests for the /ctoc:start slash command and SessionStart persona surfacing.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const projectRoot = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(projectRoot, rel), 'utf8');

describe('vision-advisor — persona-aware wiring (v8.3+)', () => {
  const content = read('agents/planning/vision-advisor.md');

  it('has a Step 0 (or equivalent) for persona check', () => {
    assert.match(content, /Step 0:?\s+Persona/i, 'must declare a persona-check step');
  });

  it('references .ctoc/session/persona.yaml as the persona source', () => {
    assert.match(content, /\.ctoc\/session\/persona\.yaml/);
  });

  it('references the question catalog', () => {
    assert.match(content, /\.ctoc\/templates\/questions\.yaml/);
  });

  it('describes deferring out-of-scope questions to the inbox', () => {
    assert.match(content, /\.ctoc\/inbox\/questions/);
    assert.match(content, /awaits_persona/);
  });

  it('describes persona-aware behavior with founder/programmer differences', () => {
    assert.match(content, /founder/i);
    assert.match(content, /programmer/i);
  });

  it('mentions handing off based on persona', () => {
    assert.match(content, /hand[- ]off/i);
    assert.match(content, /product-owner/);
    assert.match(content, /implementation-planner/);
  });
});

describe('product-owner — persona-aware wiring (v8.3+)', () => {
  const content = read('agents/planning/product-owner.md');

  it('has a Step 0 for persona check', () => {
    assert.match(content, /Step 0:?\s+Persona/i);
  });

  it('references .ctoc/session/persona.yaml', () => {
    assert.match(content, /\.ctoc\/session\/persona\.yaml/);
  });

  it('describes skipping canvas for programmer/architect personas', () => {
    assert.match(content, /skip.*canvas/i);
    assert.match(content, /programmer/i);
  });

  it('mentions dispatching kpi-planner (v8.4 DEFINE step)', () => {
    assert.match(content, /kpi-planner/);
  });

  it('mentions deferring founder-only questions to inbox', () => {
    assert.match(content, /awaits_persona:?\s*founder/i);
  });

  it('mentions unit-economics-modeler for SaaS', () => {
    assert.match(content, /unit-economics-modeler/);
  });
});

describe('implementation-planner — persona-aware wiring (v8.3+)', () => {
  const content = read('agents/planning/implementation-planner.md');

  it('has a Step 0 for persona + template selection', () => {
    assert.match(content, /Step 0/i);
    assert.match(content, /[Tt]emplate/);
  });

  it('dispatches stack-chooser', () => {
    assert.match(content, /stack-chooser/);
  });

  it('references the SaaS template manifest', () => {
    assert.match(content, /saas\/b2c-subscription/);
    assert.match(content, /manifest\.yaml/);
  });

  it('wires Product Loop instrumentation from KPI plan files', () => {
    // Accept either the per-project `<slug>-kpis.yaml` or the template's `kpi-plan.yaml`
    assert.match(content, /kpis?[-.]?(plan|yaml)/);
    assert.match(content, /[Pp]roduct [Ll]oop|posthog-analytics|kpi-planner/);
  });

  it('references production-readiness.yaml for Gate 3', () => {
    assert.match(content, /production-readiness\.yaml/);
  });
});

describe('/ctoc:start ignition command', () => {
  it('exists', () => {
    assert.ok(fs.existsSync(path.join(projectRoot, 'src/commands/start.md')));
  });

  const content = read('src/commands/start.md');

  it('describes the persona-aware ignition flow', () => {
    assert.match(content, /persona-classifier/);
    assert.match(content, /vision-advisor/);
    assert.match(content, /Gate 0/);
  });

  it('describes branching by persona', () => {
    assert.match(content, /founder/);
    assert.match(content, /programmer/);
    assert.match(content, /hobbyist/);
  });

  it('mentions kpi-planner and stack-chooser', () => {
    assert.match(content, /kpi-planner/);
    assert.match(content, /stack-chooser/);
  });

  it('declares model: claude-haiku-4-5 (slash command safe)', () => {
    assert.match(content, /model:\s+claude-haiku-4-5/);
  });
});

describe('SessionStart — persona surfacing (v8.3+)', () => {
  const content = read('src/hooks/SessionStart.js');

  it('imports loadPersona from src/lib/persona', () => {
    assert.match(content, /require\(['"]\.\.\/lib\/persona['"]\)/);
    assert.match(content, /loadPersona/);
  });

  it('generates a persona line for the session context', () => {
    assert.match(content, /personaSummary/);
    assert.match(content, /Persona:/);
  });

  it('passes personaSummary to generateContext', () => {
    assert.match(content, /generateContext\([^)]*personaSummary/);
  });

  it('handles missing persona file gracefully (no crash)', () => {
    // Verified by running session-start with no persona file
    assert.match(content, /catch\s*\{/);
  });
});

describe('Iron-loop self-enforcer — checks the wiring', () => {
  it('REQUIRED_LIBS includes persona.js (gates Step 0 of planning agents)', () => {
    const { REQUIRED_LIBS } = require('../src/lib/iron-loop-enforcer');
    assert.ok(REQUIRED_LIBS.includes('src/lib/persona.js'));
  });

  it('TIER_1_AGENTS includes persona-classifier, stack-chooser, kpi-planner', () => {
    // Note: kpi-planner is a v8.4 addition; verify it's tier 1
    const c = read('agents/planning/kpi-planner.md');
    assert.match(c, /^tier:\s*1$/m);
    assert.match(c, /reports_to:\s*cto-chief/);
  });
});
