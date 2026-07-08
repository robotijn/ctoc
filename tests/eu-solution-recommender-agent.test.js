/**
 * EC4-s2 — content-contract test for agents/compliance/eu-solution-recommender.md.
 *
 * The agent is markdown prose — `node --test` cannot execute it, and a snapshot
 * of "a section rendered" would be false-green. Per the PI4 rule this test reads
 * the REAL agent file from disk (fresh, no cache) and asserts the LOAD-BEARING
 * CONTRACT FACTS that, if broken, would silently break the agent's wiring:
 *
 *   1. frontmatter contract (name, tier: 2, category: compliance);
 *   2. the web tools WebSearch + WebFetch are declared (this is the ONE
 *      web-enabled compliance agent) + reads_ancestry / reports_to /
 *      max_subagents: 0;
 *   3. it is NOT a repo-scanner / writer (no Bash / Edit / Write) — advisory;
 *   4. all five s1 helper functions are referenced by name (so the agent↔helper
 *      wiring cannot drift from src/lib/eu-recommender-helpers.js);
 *   5. the SOLE web boundary is createFetcher(WebSearch, WebFetch);
 *   6. three-bucket output with snake_case self_hosted + canonical schema ref;
 *   7. EU-region-only hosted rule (US w/o SCC/DPF excluded);
 *   8. price-as-fact + NO fabricated numbers (every figure sourced; no baked-in
 *      currency-price literal);
 *   9. fallback protocol (applyFallback / unverified_this_run / continue);
 *  10. no hardcoded enforcement-date literal (dates verified live);
 *  11. DRY — restates no rule (no schema/pattern block, no BAD/SAFE copy);
 *  12. advisory — no human gate, no auto-select, writes no project file;
 *  13. shared by both regimes (EC2 GDPR + EC3 EU AI Act, identical schema).
 *
 * Real assertions on the real file; no always-green paths, no skips.
 */

'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const AGENT_PATH = path.join(ROOT, 'agents', 'compliance', 'eu-solution-recommender.md');

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

describe('EC4-s2 — eu-solution-recommender.md content contract', () => {
  it('1. agent file exists and opens with parseable frontmatter', () => {
    assert.ok(fs.existsSync(AGENT_PATH), `${AGENT_PATH} must exist`);
    const { frontmatter } = splitFrontmatter(readAgent());
    assert.match(
      frontmatter,
      /^name:\s*eu-solution-recommender\s*$/m,
      'name must be eu-solution-recommender'
    );
    assert.match(frontmatter, /^tier:\s*2\s*$/m, 'tier must be 2 (Tier-2 specialist)');
    assert.match(frontmatter, /^category:\s*compliance\s*$/m, 'category must be compliance');
  });

  it('2. frontmatter declares WebSearch + WebFetch tools and the Tier-2 conventions', () => {
    const { frontmatter } = splitFrontmatter(readAgent());
    const toolsLine = /^tools:\s*(.+)$/m.exec(frontmatter);
    assert.ok(toolsLine, 'frontmatter must declare a tools: line');
    assert.match(toolsLine[1], /\bWebSearch\b/, 'tools must include WebSearch (web-sourced agent)');
    assert.match(toolsLine[1], /\bWebFetch\b/, 'tools must include WebFetch (web-sourced agent)');
    assert.match(frontmatter, /^reads_ancestry:\s*true\s*$/m, 'reads_ancestry must be true');
    assert.match(frontmatter, /^reports_to:\s*cto-chief\s*$/m, 'reports_to must be cto-chief');
    assert.match(frontmatter, /max_subagents:\s*0\b/, 'max_subagents must be 0 (no fan-out)');
  });

  it('3. NOT a repo-scanner / writer — tools exclude Bash, Edit, Write', () => {
    const { frontmatter } = splitFrontmatter(readAgent());
    const toolsLine = /^tools:\s*(.+)$/m.exec(frontmatter);
    assert.ok(toolsLine, 'frontmatter must declare a tools: line');
    assert.doesNotMatch(toolsLine[1], /\bBash\b/, 'advisory agent must NOT declare Bash');
    assert.doesNotMatch(toolsLine[1], /\bEdit\b/, 'advisory agent must NOT declare Edit');
    assert.doesNotMatch(toolsLine[1], /\bWrite\b/, 'advisory agent must NOT declare Write');
  });

  it('4. body references all five s1 helper functions by name + the module', () => {
    const { body } = splitFrontmatter(readAgent());
    for (const fn of [
      'validateOutputSchema',
      'validatePriceString',
      'checkMonotonicity',
      'createFetcher',
      'applyFallback',
    ]) {
      assert.match(body, new RegExp(fn), `agent must reference s1 helper ${fn} by name`);
    }
    assert.match(
      body,
      /eu-recommender-helpers/,
      'agent must name the eu-recommender-helpers module (wiring cannot drift)'
    );
  });

  it('5. sole web boundary — builds its fetcher via createFetcher(WebSearch, WebFetch)', () => {
    const { body } = splitFrontmatter(readAgent());
    assert.match(
      body,
      /createFetcher\s*\(\s*WebSearch\s*,\s*WebFetch\s*\)/,
      'agent must build its fetcher via createFetcher(WebSearch, WebFetch) — the sole web boundary'
    );
    assert.match(
      body,
      /(?:sole|single|only)\s+(?:web\s+)?boundary/i,
      'agent must state createFetcher is the sole web boundary'
    );
  });

  it('6. three-bucket output with snake_case self_hosted + canonical schema reference', () => {
    const { body } = splitFrontmatter(readAgent());
    assert.match(body, /\bhosted\b/, 'agent must name the hosted bucket');
    assert.match(body, /\bself_hosted\b/, 'agent must use snake_case self_hosted');
    assert.doesNotMatch(body, /\bself-hosted\b/, 'agent must NOT use hyphenated self-hosted');
    assert.match(body, /\blibrary\b/, 'agent must name the library bucket');
    assert.match(
      body,
      /validateOutputSchema/,
      'agent must reference the canonical schema authority (validateOutputSchema)'
    );
  });

  it('7. EU-region-only hosted rule — US w/o SCC/DPF is excluded', () => {
    const { body } = splitFrontmatter(readAgent());
    assert.match(
      body,
      /EU[- ]region|EU[- ]data[- ]residency/i,
      'agent must require an EU region / EU data residency for hosted options'
    );
    assert.match(body, /\bSCC\b|\bDPF\b/, 'agent must name the SCC/DPF transfer mechanism');
    assert.match(
      body,
      /exclud/i,
      'agent must state a non-EU hosted option without SCC/DPF is excluded'
    );
  });

  it('8. price as fact + no fabricated numbers (sourced figures, no baked-in price literal)', () => {
    const { body } = splitFrontmatter(readAgent());
    assert.match(body, /validatePriceString/, 'agent must reference validatePriceString');
    assert.match(
      body,
      /source_url/,
      'agent must state every figure carries a source_url'
    );
    assert.match(
      body,
      /retrieved_date|retrieval date/i,
      'agent must state every figure carries a retrieval date'
    );
    // Coarse guard: no hardcoded currency price literal — prices are web-verified
    // at runtime, never baked in.
    assert.doesNotMatch(body, /€\s*\d/, 'agent must not bake in a euro price literal');
    assert.doesNotMatch(body, /\$\s*\d/, 'agent must not bake in a dollar price literal');
    assert.doesNotMatch(body, /£\s*\d/, 'agent must not bake in a pound price literal');
  });

  it('9. fallback protocol — applyFallback / unverified_this_run / continue on failure', () => {
    const { body } = splitFrontmatter(readAgent());
    assert.match(body, /applyFallback/, 'agent must name applyFallback');
    assert.match(body, /unverified_this_run/, 'agent must name the unverified_this_run field');
    assert.match(
      body,
      /continue|no crash|never crash|does not (?:crash|block)/i,
      'agent must state the continue-on-failure (no crash / no block) contract'
    );
    assert.match(
      body,
      /\{\s*ok\s*:\s*false\s*\}|ok:\s*false/i,
      'agent must name the {ok:false} fail-soft fetch result'
    );
  });

  it('10. no hardcoded enforcement-date literal — dates verified live', () => {
    const { body } = splitFrontmatter(readAgent());
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

  it('11. DRY — restates no rule (no schema/pattern block, no BAD/SAFE copy)', () => {
    const { body } = splitFrontmatter(readAgent());
    assert.doesNotMatch(
      body,
      /CANONICAL_SCHEMA_KEYS\s*=\s*\[/,
      'agent must not copy the canonical schema key literal block'
    );
    assert.doesNotMatch(
      body,
      /EVALUATIVE_PRICE_PATTERNS/,
      'agent must not copy the evaluative-price-pattern definition'
    );
    assert.doesNotMatch(body, /^BAD:/m, 'agent must not copy a BAD: example');
    assert.doesNotMatch(body, /^SAFE:/m, 'agent must not copy a SAFE: example');
    // It must instead reference the two authorities by name.
    assert.match(
      body,
      /eu-recommender-helpers/,
      'agent must reference the deterministic authority by name'
    );
  });

  it('12. advisory — no human gate, no auto-select, writes no project file', () => {
    const { body } = splitFrontmatter(readAgent());
    // Disclaims adding a gate.
    assert.match(
      body,
      /(?:no\s+(?:new\s+)?human\s+gate|adds?\s+no\s+human\s+gate|does\s+not\s+add\s+a\s+(?:new\s+)?human\s+gate|human\s+gates\s+are\s+untouched)/i,
      'agent must explicitly state it adds no human gate'
    );
    // Must NOT positively claim to introduce a new gate.
    assert.doesNotMatch(
      body,
      /\b(?:introduces?|adds?|registers?|installs?)\s+a\s+new\s+human\s+gate\b/i,
      'agent must not positively claim to add a new human gate'
    );
    // No auto-select — never emits a `selected` field.
    assert.match(
      body,
      /auto[- ]select|no\s+`?selected`?|never\s+selects?/i,
      'agent must state it auto-selects nothing (no selected field)'
    );
    // Writes no project file.
    assert.match(
      body,
      /(?:writes?|modif\w+|creates?)\s+no\s+(?:project\s+)?file|no\s+(?:project\s+)?file(?:\s+is)?\s+(?:written|modified)/i,
      'agent must state it writes no project file'
    );
  });

  it('13. shared by both regimes — EC2 (GDPR) + EC3 (EU AI Act), identical schema', () => {
    const { body } = splitFrontmatter(readAgent());
    assert.match(body, /gdpr/i, 'agent must reference GDPR (EC2) as a caller');
    assert.match(body, /eu[- ]ai[- ]act/i, 'agent must reference the EU AI Act (EC3) as a caller');
    assert.match(
      body,
      /identical|same\s+(?:output\s+)?schema/i,
      'agent must state the output schema is identical across both regimes'
    );
  });
});
