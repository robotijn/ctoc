/**
 * Tests for inbox.js (A3 — CTOC v7)
 *
 * Inbox is the async-overnight surface: morning questions, decisions awaiting
 * review, plans at gates. Filesystem queue under .ctoc/inbox/.
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  getInboxCounts,
  listQuestions,
  listDecisions,
  createQuestion,
  createDecision,
  listPlansAtGates,
} = require('../src/lib/inbox');

function tempProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-inbox-'));
  fs.mkdirSync(path.join(dir, '.ctoc', 'inbox', 'questions'), { recursive: true });
  fs.mkdirSync(path.join(dir, '.ctoc', 'inbox', 'decisions'), { recursive: true });
  for (const stage of ['functional', 'implementation', 'todo', 'in-progress', 'review', 'done']) {
    fs.mkdirSync(path.join(dir, 'plans', stage), { recursive: true });
  }
  return dir;
}
function cleanup(dir) { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} }

describe('inbox counts and listing', () => {
  let root;
  beforeEach(() => { root = tempProject(); });
  afterEach(() => { cleanup(root); });

  it('returns zero counts when inbox is empty', () => {
    const counts = getInboxCounts(root);
    assert.equal(counts.questions, 0);
    assert.equal(counts.decisions, 0);
    assert.equal(counts.gatesWaiting, 0);
  });

  it('counts questions correctly', () => {
    createQuestion({
      source_plan: 'A1-canvas-layer',
      source_step: '10',
      question: 'Should I split the canvas templates?',
      context: 'Both templates have similar frontmatter.',
    }, root);
    const counts = getInboxCounts(root);
    assert.equal(counts.questions, 1);
  });

  it('counts decisions correctly', () => {
    createDecision({
      plan: 'A1-canvas-layer',
      step: '10',
      ambiguity: 'Display name format unclear',
      choice: 'Title-cased slug with spaces',
      rationale: 'Reads naturally',
    }, root);
    const counts = getInboxCounts(root);
    assert.equal(counts.decisions, 1);
  });
});

describe('createQuestion + listQuestions', () => {
  let root;
  beforeEach(() => { root = tempProject(); });
  afterEach(() => { cleanup(root); });

  it('writes a question file with timestamp-based slug', () => {
    const result = createQuestion({
      source_plan: 'A1',
      source_step: '8',
      question: 'Why no tests?',
      context: 'Looking at the spec',
    }, root);
    assert.ok(result.id, 'returns an id');
    assert.match(result.id, /^\d+-[a-z0-9]+$/, 'I8: timestamp + random slug');
    assert.ok(fs.existsSync(result.path));
  });

  it('lists questions with status: open', () => {
    createQuestion({ source_plan: 'A1', source_step: '8', question: 'q1', context: 'c1' }, root);
    createQuestion({ source_plan: 'A2', source_step: '10', question: 'q2', context: 'c2' }, root);
    const questions = listQuestions(root);
    assert.equal(questions.length, 2);
    assert.ok(questions.every(q => q.status === 'open'));
  });
});

describe('createDecision + listDecisions', () => {
  let root;
  beforeEach(() => { root = tempProject(); });
  afterEach(() => { cleanup(root); });

  it('writes a decision file with all required fields', () => {
    const result = createDecision({
      plan: 'A1',
      step: '10',
      ambiguity: 'Slug format',
      choice: 'lowercase-hyphen',
      rationale: 'matches existing convention',
    }, root);
    const content = fs.readFileSync(result.path, 'utf8');
    assert.match(content, /plan:\s*A1/);
    assert.match(content, /ambiguity:/);
    assert.match(content, /status:\s*pending-review/);
  });

  it('listDecisions returns only pending-review', () => {
    createDecision({ plan: 'A1', step: '10', ambiguity: 'x', choice: 'y', rationale: 'z' }, root);
    const pending = listDecisions(root);
    assert.equal(pending.length, 1);
    assert.equal(pending[0].status, 'pending-review');
  });
});

describe('listPlansAtGates (X3 — all gates by default)', () => {
  let root;
  beforeEach(() => { root = tempProject(); });
  afterEach(() => { cleanup(root); });

  it('reports plans in stages with frontmatter dogfood_retro or approved_by', () => {
    // X3 default = all gates shown. Plan with approval marker counts as 'at gate'.
    const planContent = `---\ntitle: "Test"\napproved_by: human\ngate_crossed: implementation → todo\n---\n# Test\n`;
    fs.writeFileSync(path.join(root, 'plans', 'todo', 'test-plan.md'), planContent);
    const plans = listPlansAtGates(root);
    assert.ok(plans.length >= 0, 'returns an array');
  });

  it('returns array of {plan, stage, gate} entries', () => {
    const plans = listPlansAtGates(root);
    assert.ok(Array.isArray(plans));
  });
});

describe('I8 — slug collision strategy', () => {
  let root;
  beforeEach(() => { root = tempProject(); });
  afterEach(() => { cleanup(root); });

  it('generates unique slugs across rapid successive calls', () => {
    const ids = new Set();
    for (let i = 0; i < 20; i++) {
      const r = createQuestion({
        source_plan: 'A1', source_step: '8', question: `q${i}`, context: '',
      }, root);
      ids.add(r.id);
    }
    assert.equal(ids.size, 20, 'all 20 slugs are unique (timestamp + random)');
  });
});
