/**
 * EC3-s2 — content-contract test for agents/compliance/eu-ai-act-agent.md.
 *
 * The agent is markdown prose — `node --test` cannot execute it, and a snapshot
 * of "a section rendered" would be false-green. Instead this test reads the real
 * agent file from disk and asserts the LOAD-BEARING CONTRACT FACTS that, if
 * broken, would silently break the agent's wiring:
 *
 *   1. frontmatter contract (name, tier: 2, category, tools, reads_ancestry,
 *      max_subagents: 0);
 *   2. the EC1 gate function `shouldRunEuAiAct` is named;
 *   3. all five s1 helper functions are referenced by name (so the agent↔helper
 *      wiring cannot drift from src/lib/eu-ai-act-helpers.js);
 *   4. the agent WRAPS the ai-governance-checker skill and does NOT re-state its
 *      rules (coarse guard: specific skill strings must be absent);
 *   5. regulatory dates come from the profile via readEnforcementDates — no
 *      hardcoded enforcement-date literals in the agent;
 *   6. scope isolation (owns eu-ai-act, drops NIST/ISO via the filter);
 *   7. advisory-only — no new human gate.
 *
 * Real assertions on the real file; no always-green paths, no skips.
 */

'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const AGENT_PATH = path.join(ROOT, 'agents', 'compliance', 'eu-ai-act-agent.md');

/** Read the agent markdown from disk (fresh; no cache). */
function readAgent() {
  return fs.readFileSync(AGENT_PATH, 'utf8');
}

/** Split the leading YAML frontmatter block from the body. */
function splitFrontmatter(text) {
  const m = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(text);
  assert.ok(m, 'agent must open with a YAML frontmatter block delimited by ---');
  return { frontmatter: m[1], body: m[2] };
}

describe('EC3-s2 — eu-ai-act-agent.md content contract', () => {
  it('1. agent file exists and opens with parseable frontmatter', () => {
    assert.ok(fs.existsSync(AGENT_PATH), `${AGENT_PATH} must exist`);
    const { frontmatter } = splitFrontmatter(readAgent());
    assert.match(frontmatter, /^name:\s*eu-ai-act-agent\s*$/m, 'name must be eu-ai-act-agent');
    assert.match(frontmatter, /^tier:\s*2\s*$/m, 'tier must be 2 (Tier-2 specialist)');
    assert.match(frontmatter, /^category:\s*compliance\s*$/m, 'category must be compliance');
  });

  it('2. frontmatter declares Read + Grep tools and reads_ancestry: true', () => {
    const { frontmatter } = splitFrontmatter(readAgent());
    const toolsLine = /^tools:\s*(.+)$/m.exec(frontmatter);
    assert.ok(toolsLine, 'frontmatter must declare a tools: line');
    assert.match(toolsLine[1], /\bRead\b/, 'tools must include Read');
    assert.match(toolsLine[1], /\bGrep\b/, 'tools must include Grep');
    assert.match(frontmatter, /^reads_ancestry:\s*true\s*$/m, 'reads_ancestry must be true');
  });

  it('3. frontmatter declares effort_budget.max_subagents: 0', () => {
    const { frontmatter } = splitFrontmatter(readAgent());
    assert.match(frontmatter, /max_subagents:\s*0\b/, 'max_subagents must be 0 (no fan-out)');
  });

  it('4. body names the EC1 gate shouldRunEuAiAct (runs only when profile active)', () => {
    const { body } = splitFrontmatter(readAgent());
    assert.match(body, /shouldRunEuAiAct/, 'agent must reference the EC1 gate shouldRunEuAiAct');
    // The gate is described as a no-op / exit-immediately when false.
    assert.match(
      body,
      /no output|exit immediately|no-op/i,
      'agent must describe the gate-false path as producing no output'
    );
  });

  it('5. body references all five s1 helper functions by name', () => {
    const { body } = splitFrontmatter(readAgent());
    for (const fn of [
      'classifyFromPlanText',
      'filterToEuAiAct',
      'normalizeSeverity',
      'routeFinding',
      'readEnforcementDates',
    ]) {
      assert.match(body, new RegExp(fn), `agent must reference s1 helper ${fn} by name`);
    }
  });

  it('6. wraps the ai-governance-checker skill and re-states none of its rules', () => {
    const { body } = splitFrontmatter(readAgent());
    // Delegation: the agent must name the skill it wraps.
    assert.match(
      body,
      /compliance\/ai-governance-checker/,
      'agent must delegate to compliance/ai-governance-checker'
    );
    // Coarse "no rule re-stated" guard: the skill's own phase heading and its
    // letter-schema line must NOT be copied into the agent.
    assert.doesNotMatch(
      body,
      /Phase 6 — GPAI/,
      'agent must not copy the skill\'s scan-phase heading'
    );
    assert.doesNotMatch(
      body,
      /finding_id:\s*<sha256/,
      'agent must not copy the skill\'s letter-schema field definition'
    );
  });

  it('7. cites regulatory dates from the profile, never hardcoded', () => {
    const { body } = splitFrontmatter(readAgent());
    assert.match(body, /readEnforcementDates/, 'agent must source dates via readEnforcementDates');
    assert.match(body, /eu-ai-act-high-risk/, 'agent must name the regime profile');
    // No literal enforcement-date strings anywhere in the agent file.
    for (const dateLiteral of [
      '2 Aug 2026',
      '2 August 2026',
      '2 February 2025',
      '2 Feb 2025',
      '2 Aug 2025',
      '2 August 2025',
      '2026-08-02',
      '2025-02-02',
      '2025-08-02',
    ]) {
      assert.ok(
        !body.includes(dateLiteral),
        `agent must not hardcode the enforcement date literal "${dateLiteral}"`
      );
    }
  });

  it('8. states scope isolation — owns eu-ai-act, drops NIST/ISO via the filter', () => {
    const { body } = splitFrontmatter(readAgent());
    assert.match(body, /eu-ai-act/, 'agent must name eu-ai-act as the owned regulation');
    assert.match(body, /filterToEuAiAct/, 'agent must use filterToEuAiAct to drop other regulations');
    assert.match(body, /nist/i, 'agent must reference NIST as a dropped regulation');
    assert.match(body, /iso/i, 'agent must reference ISO as a dropped regulation');
  });

  it('9. advisory only — routes to Inbox / refinement loop and adds no human gate', () => {
    const { body } = splitFrontmatter(readAgent());
    assert.match(
      body,
      /Inbox|refinement[- ]loop/i,
      'agent must route advisory findings to the Inbox / refinement loop'
    );
    // Must explicitly disclaim adding a gate...
    assert.match(
      body,
      /(?:no\s+(?:new\s+)?human\s+gate|adds?\s+no\s+human\s+gate|does\s+not\s+add\s+a\s+(?:new\s+)?human\s+gate|human\s+gates\s+are\s+untouched)/i,
      'agent must explicitly state it adds no human gate'
    );
    // ...and must NOT positively claim to introduce a new gate.
    assert.doesNotMatch(
      body,
      /\b(?:introduces?|adds?|registers?|installs?)\s+a\s+new\s+human\s+gate\b/i,
      'agent must not positively claim to add a new human gate'
    );
  });
});
