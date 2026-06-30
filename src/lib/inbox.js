/**
 * Inbox — async-overnight queue surface (A3 / CTOC v7)
 *
 * Filesystem queue with three streams under .ctoc/inbox/:
 *   - questions/   morning questions raised by agents
 *   - decisions/   documented choices the implementer took under ambiguity
 *
 * Plus a derived view:
 *   - plansAtGates  plans currently AWAITING a human approval decision at a
 *                   gate — i.e. sitting in a gate SOURCE stage (X3)
 *
 * Inbox is READ-ONLY at its surface — writes come from upstream agents
 * (vision-decomposer creates questions, implementer creates decisions).
 * Per A3 impl plan ADRs 2-3.
 */

const fs = require('fs');
const path = require('path');
const { memoize } = require('./cache');

// SP1 cheap stale-plan scan. Imported as a NAMESPACE (not destructured) so the
// call site is late-bound: SP2 tests rewire staleDetector.scanCheapCandidates on
// the live module object at the require boundary. A destructured import would
// capture the function reference at load time and defeat that seam.
// Contract (frozen in SP1): scanCheapCandidates(root, { nowMs }?) =>
//   { candidates: Array<{plan:string, stage:'functional'|'implementation'|'review',
//     signals:Array<'missing-files'|'advisory:age'>, actionable:boolean}>, count:number }
const staleDetector = require('./stale-detector');

const QUESTIONS_DIR = ['.ctoc', 'inbox', 'questions'];
const DECISIONS_DIR = ['.ctoc', 'inbox', 'decisions'];

// Gate SOURCE stages: a plan sitting in one of these stages is AWAITING the
// human's approval decision to cross the named gate. Destination stages
// (implementation/todo/done) are where APPROVED plans land — a plan there has
// already crossed its gate, so it is not "waiting" and is not counted.
//   functional      → Gate 1 (functional → implementation)
//   implementation  → Gate 2 (implementation → todo)
//   review          → Gate 3 (review → done)
const HUMAN_GATE_SOURCE_STAGES = Object.freeze({
  functional: 1,
  implementation: 2,
  review: 3,
});

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
 * X3: list plans currently AWAITING a human approval decision at a gate.
 *
 * A plan is "at a gate" when it sits in a gate SOURCE stage — the human must
 * approve it for the plan to advance across that gate (see
 * HUMAN_GATE_SOURCE_STAGES). Plans in destination stages (implementation/todo/
 * done) are NOT counted: once a plan carries its approval marker and has landed
 * in a destination, it has crossed the gate rather than waiting at one. That
 * inversion was the prior bug — it reported every shipped `done/` plan as
 * "at a gate", so the count tracked the Done total instead of the work the
 * human still owes a decision on.
 *
 * The approval marker is deliberately not consulted here: a marker reflects the
 * PREVIOUS gate a plan crossed to reach its current stage, not the next gate it
 * awaits, so it carries no signal about pending approval.
 *
 * @param {string} root
 * @returns {Array<{plan: string, stage: string, gate: number}>}
 */
function listPlansAtGates(root) {
  const out = [];
  const plansDir = path.join(root, 'plans');
  if (!fs.existsSync(plansDir)) return out;

  for (const [stage, gate] of Object.entries(HUMAN_GATE_SOURCE_STAGES)) {
    const stageDir = path.join(plansDir, stage);
    if (!fs.existsSync(stageDir)) continue;
    const files = fs.readdirSync(stageDir).filter(f => f.endsWith('.md') && f !== '.gitkeep');
    for (const f of files) {
      out.push({ plan: f.replace(/\.md$/, ''), stage, gate });
    }
  }
  return out;
}

/**
 * SP2: the full possibly-stale candidate list for the drill-in screen (cold path).
 * NOT memoized — the drill-in is reached only by explicit navigation, so a single
 * fresh scan there is acceptable; the hot dashboard path uses getInboxCounts.count.
 * @param {string} root
 * @returns {Array<{plan:string, stage:string, signals:string[], actionable:boolean}>}
 */
function listStaleCandidates(root) {
  return staleDetector.scanCheapCandidates(root).candidates;
}

const getInboxCounts = memoize(function getInboxCountsImpl(root) {
  return {
    questions: listQuestions(root).length,
    decisions: listDecisions(root).length,
    gatesWaiting: listPlansAtGates(root).length,
    // SP2: cheap stale count. One scan per memoize window (5 s TTL) ⇒ Goal 1.
    staleCandidates: staleDetector.scanCheapCandidates(root).count,
  };
}, 'getInboxCounts');

module.exports = {
  getInboxCounts,
  listQuestions,
  listDecisions,
  listPlansAtGates,
  listStaleCandidates,
  createQuestion,
  createDecision,
};
