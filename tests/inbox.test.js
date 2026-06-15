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

describe('listPlansAtGates (X3 — plans AWAITING approval at a gate source)', () => {
  let root;
  beforeEach(() => { root = tempProject(); });
  afterEach(() => { cleanup(root); });

  const PLAN = (title) => `---\ntitle: "${title}"\n---\n# ${title}\n`;
  const APPROVED_PLAN = (title, crossed) =>
    `---\ntitle: "${title}"\napproved_by: human\ngate_crossed: "${crossed}"\n---\n# ${title}\n`;

  it('returns an array of {plan, stage, gate} entries', () => {
    const plans = listPlansAtGates(root);
    assert.ok(Array.isArray(plans));
  });

  it('counts a functional plan as awaiting Gate 1', () => {
    fs.writeFileSync(path.join(root, 'plans', 'functional', 'f1.md'), PLAN('F1'));
    const plans = listPlansAtGates(root);
    assert.equal(plans.length, 1);
    assert.deepEqual(plans[0], { plan: 'f1', stage: 'functional', gate: 1 });
  });

  it('counts an implementation plan as awaiting Gate 2', () => {
    fs.writeFileSync(path.join(root, 'plans', 'implementation', 'i1.md'), PLAN('I1'));
    const plans = listPlansAtGates(root);
    assert.equal(plans.length, 1);
    assert.equal(plans[0].stage, 'implementation');
    assert.equal(plans[0].gate, 2);
  });

  it('counts a review plan as awaiting Gate 3', () => {
    fs.writeFileSync(path.join(root, 'plans', 'review', 'r1.md'), PLAN('R1'));
    const plans = listPlansAtGates(root);
    assert.equal(plans.length, 1);
    assert.equal(plans[0].stage, 'review');
    assert.equal(plans[0].gate, 3);
  });

  it('does NOT count a shipped done/ plan (regression: prior bug counted these)', () => {
    // The exact failure we fixed: an approved plan that already crossed Gate 3
    // and landed in done/ must not be reported as "at a gate".
    fs.writeFileSync(
      path.join(root, 'plans', 'done', 'shipped.md'),
      APPROVED_PLAN('Shipped', 'review → done'),
    );
    const plans = listPlansAtGates(root);
    assert.equal(plans.length, 0, 'done/ plans have crossed their gate, not waiting at one');
    assert.equal(getInboxCounts(root).gatesWaiting, 0);
  });

  it('does NOT count a todo/ plan (past Gate 2, queued for execution)', () => {
    fs.writeFileSync(
      path.join(root, 'plans', 'todo', 't1.md'),
      APPROVED_PLAN('T1', 'implementation → todo'),
    );
    assert.equal(listPlansAtGates(root).length, 0);
  });

  it('does NOT count an in-progress/ plan (mid-execution, no pending gate)', () => {
    fs.writeFileSync(path.join(root, 'plans', 'in-progress', 'p1.md'), PLAN('P1'));
    assert.equal(listPlansAtGates(root).length, 0);
  });

  it('sums across all three source stages', () => {
    fs.writeFileSync(path.join(root, 'plans', 'functional', 'f1.md'), PLAN('F1'));
    fs.writeFileSync(path.join(root, 'plans', 'implementation', 'i1.md'), PLAN('I1'));
    fs.writeFileSync(path.join(root, 'plans', 'review', 'r1.md'), PLAN('R1'));
    // noise that must be ignored
    fs.writeFileSync(path.join(root, 'plans', 'done', 'd1.md'), APPROVED_PLAN('D1', 'review → done'));
    fs.writeFileSync(path.join(root, 'plans', 'todo', 't1.md'), PLAN('T1'));
    const plans = listPlansAtGates(root);
    assert.equal(plans.length, 3);
    assert.deepEqual(plans.map(p => p.gate).sort(), [1, 2, 3]);
    assert.equal(getInboxCounts(root).gatesWaiting, 3);
  });

  it('ignores .gitkeep and non-markdown files', () => {
    fs.writeFileSync(path.join(root, 'plans', 'review', '.gitkeep'), '');
    fs.writeFileSync(path.join(root, 'plans', 'review', 'notes.txt'), 'not a plan');
    assert.equal(listPlansAtGates(root).length, 0);
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
