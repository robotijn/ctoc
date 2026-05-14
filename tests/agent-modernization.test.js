/**
 * Tests for B1 — Orchestrator Agent Modernization (v7)
 *
 * Verifies:
 *   - Shared snippets exist (no-stub-rule, async-choice-protocol, ancestry-read)
 *   - init-project.js declares agents/_shared in CTOC_DIRS
 *   - Each modernized orchestrator agent has v7 frontmatter fields
 *   - Each modernized orchestrator references at least one shared snippet
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const projectRoot = path.join(__dirname, '..');

const SHARED_SNIPPETS = [
  'no-stub-rule.md',
  'async-choice-protocol.md',
  'ancestry-read.md',
];

// Orchestrators modernized in B1 Phase 1 (first batch).
// Phase 2 will extend this list to all 12 orchestrators.
const MODERNIZED_AGENTS_PHASE_1 = [
  'agents/planning/vision-advisor.md',
  'agents/planning/product-owner.md',
  'agents/planning/implementation-planner.md',
];

describe('agents/_shared/ snippets', () => {
  for (const snippet of SHARED_SNIPPETS) {
    it(`${snippet} exists`, () => {
      const p = path.join(projectRoot, 'agents', '_shared', snippet);
      assert.ok(fs.existsSync(p), `agents/_shared/${snippet} must exist`);
      const content = fs.readFileSync(p, 'utf8');
      assert.ok(content.length > 100, 'snippet has substantive content');
    });
  }

  it('all 3 snippets are referenced in B1 plan', () => {
    // Look in plans/in-progress/, plans/review/, or plans/done/
    const candidates = [
      'plans/in-progress/B1-orchestrator-agent-modernization.md',
      'plans/review/B1-orchestrator-agent-modernization.md',
      'plans/done/B1-orchestrator-agent-modernization.md',
    ];
    const planPath = candidates.map(c => path.join(projectRoot, c)).find(fs.existsSync);
    assert.ok(planPath, 'B1 plan exists in some stage');
    const content = fs.readFileSync(planPath, 'utf8');
    for (const snippet of SHARED_SNIPPETS) {
      assert.match(content, new RegExp(snippet.replace('.md', '')), `B1 plan references ${snippet}`);
    }
  });
});

describe('init-project.js declares agents/_shared', () => {
  it('CTOC_DIRS includes agents/_shared', () => {
    const initPath = path.join(projectRoot, 'src', 'lib', 'init-project.js');
    const content = fs.readFileSync(initPath, 'utf8');
    assert.match(content, /agents\/_shared/, 'CTOC_DIRS must include agents/_shared');
  });

  it('PLAN_DIRS includes plans/canvas (A1 stage)', () => {
    const initPath = path.join(projectRoot, 'src', 'lib', 'init-project.js');
    const content = fs.readFileSync(initPath, 'utf8');
    assert.match(content, /plans\/canvas/);
  });

  it('CTOC_DIRS includes .ctoc/inbox/{questions,decisions}', () => {
    const initPath = path.join(projectRoot, 'src', 'lib', 'init-project.js');
    const content = fs.readFileSync(initPath, 'utf8');
    assert.match(content, /\.ctoc\/inbox\/questions/);
    assert.match(content, /\.ctoc\/inbox\/decisions/);
  });
});

describe('Phase 1 modernized agents have v7 frontmatter', () => {
  for (const agentPath of MODERNIZED_AGENTS_PHASE_1) {
    it(`${agentPath} declares v7 frontmatter fields`, () => {
      const p = path.join(projectRoot, agentPath);
      assert.ok(fs.existsSync(p), `${agentPath} must exist`);
      const content = fs.readFileSync(p, 'utf8');
      // Must declare effort, reads_ancestry, async_choice_protocol, model_optimized_for
      assert.match(content, /effort:\s*(xhigh|high|medium|low)/, `${agentPath} declares effort`);
      assert.match(content, /reads_ancestry:\s*(true|false)/, `${agentPath} declares reads_ancestry`);
      assert.match(content, /async_choice_protocol:\s*enabled/, `${agentPath} declares async_choice_protocol`);
      assert.match(content, /model_optimized_for:\s*opus-4-7/, `${agentPath} declares model_optimized_for`);
    });

    it(`${agentPath} references at least one shared snippet`, () => {
      const p = path.join(projectRoot, agentPath);
      const content = fs.readFileSync(p, 'utf8');
      const referencesAny = SHARED_SNIPPETS.some(s =>
        content.includes(`agents/_shared/${s}`) || content.includes(s.replace('.md', ''))
      );
      assert.ok(referencesAny, `${agentPath} should reference at least one shared snippet`);
    });
  }
});
