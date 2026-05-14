/**
 * Inbox — async-overnight queue surface (A3 / CTOC v7)
 *
 * Filesystem queue with three streams under .ctoc/inbox/:
 *   - questions/   morning questions raised by agents
 *   - decisions/   documented choices the implementer took under ambiguity
 *
 * Plus a derived view:
 *   - plansAtGates  plans currently awaiting human approval at any gate (X3)
 *
 * Inbox is READ-ONLY at its surface — writes come from upstream agents
 * (vision-decomposer creates questions, implementer creates decisions).
 * Per A3 impl plan ADRs 2-3.
 */

const fs = require('fs');
const path = require('path');
const { memoize } = require('./cache');

const QUESTIONS_DIR = ['.ctoc', 'inbox', 'questions'];
const DECISIONS_DIR = ['.ctoc', 'inbox', 'decisions'];

const HUMAN_GATE_STAGES = ['implementation', 'todo', 'done'];

function getQuestionsDir(root) { return path.join(root, ...QUESTIONS_DIR); }
function getDecisionsDir(root) { return path.join(root, ...DECISIONS_DIR); }

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

/**
 * I8: generate a slug from timestamp + 6-char random suffix.
 * Tests cover 20+ rapid successive calls producing unique slugs.
 */
function generateSlug() {
  const ts = Date.now();
  const rand = Math.random().toString(36).slice(2, 8).padEnd(6, '0');
  return `${ts}-${rand}`;
}

/**
 * Create a question file for morning review.
 * @param {Object} opts - { source_plan, source_step, question, context }
 * @param {string} root
 * @returns {{ id: string, path: string }}
 */
function createQuestion(opts, root) {
  const dir = getQuestionsDir(root);
  ensureDir(dir);
  const id = generateSlug();
  const filePath = path.join(dir, `${id}.md`);
  const content = `---
id: ${id}
created: ${new Date().toISOString()}
source_plan: ${opts.source_plan || ''}
source_step: ${opts.source_step || ''}
status: open
---

## Question

${opts.question || ''}

## Context

${opts.context || ''}
`;
  fs.writeFileSync(filePath, content);
  return { id, path: filePath };
}

/**
 * Create a decision file (implementer's documented choice under ambiguity).
 * @param {Object} opts - { plan, step, ambiguity, choice, rationale }
 * @param {string} root
 * @returns {{ id: string, path: string }}
 */
function createDecision(opts, root) {
  const dir = getDecisionsDir(root);
  ensureDir(dir);
  const id = generateSlug();
  const filePath = path.join(dir, `${id}.md`);
  const content = `---
id: ${id}
created: ${new Date().toISOString()}
plan: ${opts.plan || ''}
step: ${opts.step || ''}
ambiguity: "${(opts.ambiguity || '').replace(/"/g, '\\"')}"
choice: "${(opts.choice || '').replace(/"/g, '\\"')}"
rationale: "${(opts.rationale || '').replace(/"/g, '\\"')}"
status: pending-review
---

## Ambiguity

${opts.ambiguity || ''}

## Choice

${opts.choice || ''}

## Rationale

${opts.rationale || ''}
`;
  fs.writeFileSync(filePath, content);
  return { id, path: filePath };
}

function parseFrontmatter(content) {
  const m = content.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return {};
  const out = {};
  for (const line of m[1].split('\n')) {
    const c = line.indexOf(':');
    if (c > 0) {
      const k = line.slice(0, c).trim();
      let v = line.slice(c + 1).trim();
      v = v.replace(/^["']|["']$/g, '');
      out[k] = v;
    }
  }
  return out;
}

function listItemsInDir(dir, statusFilter) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.md') && f !== '.gitkeep')
    .map(f => {
      const filePath = path.join(dir, f);
      const meta = parseFrontmatter(fs.readFileSync(filePath, 'utf8'));
      return { ...meta, path: filePath };
    })
    .filter(item => !statusFilter || item.status === statusFilter);
}

function listQuestions(root) {
  return listItemsInDir(getQuestionsDir(root), 'open');
}

function listDecisions(root) {
  return listItemsInDir(getDecisionsDir(root), 'pending-review');
}

/**
 * X3: list plans currently at any human gate (1, 2, or 3).
 * A plan is "at a gate" if it has an `approved_by: human` marker AND sits in
 * a gate destination stage.
 *
 * @param {string} root
 * @returns {Array<{plan: string, stage: string, gate: number}>}
 */
function listPlansAtGates(root) {
  const out = [];
  const plansDir = path.join(root, 'plans');
  if (!fs.existsSync(plansDir)) return out;

  for (const stage of HUMAN_GATE_STAGES) {
    const stageDir = path.join(plansDir, stage);
    if (!fs.existsSync(stageDir)) continue;
    const files = fs.readdirSync(stageDir).filter(f => f.endsWith('.md') && f !== '.gitkeep');
    for (const f of files) {
      const filePath = path.join(stageDir, f);
      let content;
      try { content = fs.readFileSync(filePath, 'utf8'); } catch { continue; }
      if (content.includes('approved_by: human')) {
        const gate = stage === 'implementation' ? 1 : stage === 'todo' ? 2 : 3;
        out.push({ plan: f.replace(/\.md$/, ''), stage, gate });
      }
    }
  }
  return out;
}

const getInboxCounts = memoize(function getInboxCountsImpl(root) {
  return {
    questions: listQuestions(root).length,
    decisions: listDecisions(root).length,
    gatesWaiting: listPlansAtGates(root).length,
  };
}, 'getInboxCounts');

module.exports = {
  getInboxCounts,
  listQuestions,
  listDecisions,
  listPlansAtGates,
  createQuestion,
  createDecision,
};
