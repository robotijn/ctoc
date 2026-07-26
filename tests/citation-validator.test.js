/**
 * Content-contract test for agents/ai-quality/citation-validator.md (plan 00212).
 *
 * The agent is markdown prose — `node --test` cannot execute it, and a snapshot of
 * "a section rendered" would be false-green. Per the PI4 rule this test reads the
 * REAL agent file from disk (fresh, no cache) and asserts the LOAD-BEARING CONTRACT
 * FACTS that, if broken, would silently break the agent's wiring or its integrity:
 *
 *   1.  frontmatter contract (name, tier: 2, category: ai-quality);
 *   2.  web-enabled + Tier-2 conventions (WebSearch/WebFetch/Read/Grep, reports_to,
 *       reads_ancestry, max_subagents: 0);
 *   3.  model/effort floor (model: opus, effort: xhigh);
 *   4.  NOT a writer (no Write/Edit/MultiEdit/NotebookEdit/Bash/Task);
 *   5.  read-only-verdict contract (validates only, emits verdicts, never edits,
 *       executor applies edits in a separate/linear step);
 *   6.  four verdict classes named;
 *   7.  three recommended actions named;
 *   8.  the no-guesses rule (unsourceable → stripped, never recollection);
 *   9.  dispatch-schema wiring (references the schema path, restates < 3 fields);
 *   10. five watcher headings in order + no Blocking Rules/Red Lines/When to Block;
 *   11. catalogued CONFORMING, not legacy; ratchet untouched;
 *   12. the fence admits it via a scoped WEB_ENABLED set naming this agent.
 *
 * Real assertions on the real files; no always-green paths, no skips.
 */

'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const AGENT_PATH = path.join(ROOT, 'agents', 'ai-quality', 'citation-validator.md');
const AGENT_REL = 'agents/ai-quality/citation-validator.md';
const BASELINE_PATH = path.join(ROOT, '.ctoc', 'watcher-baseline.json');
const FENCE_PATH = path.join(ROOT, 'tests', 'watcher-shape.test.js');

/** Read the agent markdown from disk (fresh; no cache). */
function readAgent() {
  return fs.readFileSync(AGENT_PATH, 'utf8');
}

/** Split the leading YAML frontmatter block from the body (byte-0 anchored). */
function splitFrontmatter(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text);
  assert.ok(m, 'agent must open, at byte 0, with a YAML frontmatter block delimited by ---');
  return { frontmatter: m[1], body: m[2] };
}

/** The finding fields the dispatch schema already defines (mirrors the fence). */
const SCHEMA_FIELDS = ['severity', 'type', 'file', 'line_range', 'message', 'confidence', 'citations'];

describe('citation-validator.md content contract (plan 00212)', () => {
  it('1. file exists and opens with byte-0 frontmatter (name/tier/category)', () => {
    assert.ok(fs.existsSync(AGENT_PATH), `${AGENT_PATH} must exist`);
    const raw = readAgent();
    assert.ok(raw.startsWith('---\n') || raw.startsWith('---\r\n'), 'frontmatter must start at byte 0');
    const { frontmatter } = splitFrontmatter(raw);
    assert.match(frontmatter, /^name:\s*citation-validator\s*$/m, 'name must be citation-validator');
    assert.match(frontmatter, /^tier:\s*2\s*$/m, 'tier must be 2 (Tier-2 specialist)');
    assert.match(frontmatter, /^category:\s*ai-quality\s*$/m, 'category must be ai-quality');
  });

  it('2. web-enabled + Tier-2 conventions', () => {
    const { frontmatter } = splitFrontmatter(readAgent());
    const toolsLine = /^tools:\s*(.+)$/m.exec(frontmatter);
    assert.ok(toolsLine, 'frontmatter must declare a tools: line');
    for (const t of ['WebSearch', 'WebFetch', 'Read', 'Grep']) {
      assert.match(toolsLine[1], new RegExp(`\\b${t}\\b`), `tools must include ${t}`);
    }
    assert.match(frontmatter, /^reports_to:\s*cto-chief\s*$/m, 'reports_to must be cto-chief');
    assert.match(frontmatter, /^reads_ancestry:\s*true\s*$/m, 'reads_ancestry must be true');
    assert.match(frontmatter, /max_subagents:\s*0\b/, 'max_subagents must be 0 (no fan-out)');
  });

  it('3. model/effort floor — model: opus, effort: xhigh', () => {
    const { frontmatter } = splitFrontmatter(readAgent());
    assert.match(frontmatter, /^model:\s*opus\s*$/m, 'model must be exactly opus');
    assert.match(frontmatter, /^effort:\s*xhigh\s*$/m, 'effort must be xhigh (TOP_EFFORT)');
  });

  it('4. NOT a writer — tools exclude all mutation-capable tools', () => {
    const { frontmatter } = splitFrontmatter(readAgent());
    const toolsLine = /^tools:\s*(.+)$/m.exec(frontmatter);
    assert.ok(toolsLine, 'frontmatter must declare a tools: line');
    for (const t of ['Write', 'Edit', 'MultiEdit', 'NotebookEdit', 'Bash', 'Task']) {
      assert.doesNotMatch(toolsLine[1], new RegExp(`\\b${t}\\b`), `read-only agent must NOT declare ${t}`);
    }
  });

  it('5. read-only-verdict contract — validates only, emits verdicts, never edits', () => {
    const { body } = splitFrontmatter(readAgent());
    assert.match(body, /validate/i, 'body must state it validates');
    assert.match(body, /verdict/i, 'body must state it emits verdicts');
    assert.match(body, /never\s+edit|not?\s+edit|do(?:es)?\s+not\s+edit/i, 'body must state it never edits a file');
    assert.match(body, /\bseparate\b/i, 'body must state the edits are applied in a separate step');
    assert.match(body, /\blinear\b/i, 'body must state the edit-application step is linear');
    assert.match(body, /executor/i, 'body must name the executor as the downstream edit-applier');
  });

  it('6. four verdict classes named', () => {
    const { body } = splitFrontmatter(readAgent());
    for (const verdict of ['VALIDATED', 'FABRICATED', 'UNSOURCEABLE', 'MISATTRIBUTED']) {
      assert.match(body, new RegExp(verdict), `body must name the verdict ${verdict}`);
    }
  });

  it('7. three recommended actions named', () => {
    const { body } = splitFrontmatter(readAgent());
    assert.match(body, /\bkeep\b/, 'body must name the keep action');
    assert.match(body, /strip-the-specificity/, 'body must name the strip-the-specificity action');
    assert.match(body, /correct-to/, 'body must name the correct-to action');
  });

  it('8. the no-guesses rule — unsourceable is stripped, never recollection', () => {
    const { body } = splitFrontmatter(readAgent());
    assert.match(body, /strip/i, 'body must state an unsourceable claim is stripped of its specificity');
    assert.match(
      body,
      /never\s+replaced|not?\s+replaced|never\s+.{0,30}recollection/i,
      'body must state the claim is NEVER replaced with the model\'s recollection'
    );
    assert.match(body, /recollection/i, 'body must name recollection as the thing it refuses to substitute');
  });

  it('9. dispatch-schema wiring — references the schema path, restates < 3 fields', () => {
    const { body } = splitFrontmatter(readAgent());
    assert.ok(
      body.includes('.ctoc/architecture/dispatch-schema.yaml'),
      'body must reference the dispatch schema by path (the single source of the finding shape)'
    );
    const restated = SCHEMA_FIELDS.filter((f) =>
      new RegExp(`^\\s*[-*]?\\s*\`?${f}\`?\\s*:`, 'm').test(body)
    );
    assert.ok(
      restated.length < 3,
      `body restates dispatch-schema fields inline (${restated.join(', ')}) — reference the schema, do not copy it`
    );
  });

  it('10. five watcher headings appear in order; no Blocking Rules/Red Lines/When to Block', () => {
    const { body } = splitFrontmatter(readAgent());
    const headings = body
      .split(/\r?\n/)
      .filter((l) => /^#{1,6}\s/.test(l))
      .map((l) => l.trim());
    const required = ['# What I watch', '## Trigger', '## What I Report', '## What I Borrow', '## Anti-Scope'];
    let cursor = 0;
    for (const h of required) {
      const at = headings.indexOf(h, cursor);
      assert.notEqual(at, -1, `heading "${h}" must be present and in order`);
      cursor = at + 1;
    }
    for (const h of headings) {
      assert.doesNotMatch(
        h,
        /^#+\s*(Blocking Rules|Red Lines|When to Block vs Warn)/i,
        `a watcher REPORTS; it must not carry "${h}"`
      );
    }
  });

  it('11. catalogued CONFORMING, not legacy; ratchet untouched', () => {
    const baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'));
    assert.ok(baseline.conforming.includes(AGENT_REL), `${AGENT_REL} must be in conforming`);
    assert.ok(!baseline.legacy.includes(AGENT_REL), `${AGENT_REL} must NOT be in legacy`);
    assert.equal(baseline.maxLegacy, 122, 'maxLegacy ratchet must be untouched (122)');
    assert.ok(baseline.legacy.length <= baseline.maxLegacy, 'legacy must stay at or below its ceiling');
  });

  it('12. the fence admits it via a scoped WEB_ENABLED set naming this agent', () => {
    const fence = fs.readFileSync(FENCE_PATH, 'utf8');
    assert.match(fence, /WEB_ENABLED/, 'fence must define a WEB_ENABLED allowlist');
    assert.match(
      fence,
      new RegExp(`WEB_ENABLED[\\s\\S]{0,200}${AGENT_REL.replace(/[/.]/g, '\\$&')}`),
      'WEB_ENABLED must name agents/ai-quality/citation-validator.md'
    );
    assert.match(fence, /WEB_TOOLS\s*=\s*\[[^\]]*'WebSearch'[^\]]*'WebFetch'/, 'WebSearch/WebFetch must be the scoped extension');
  });
});
