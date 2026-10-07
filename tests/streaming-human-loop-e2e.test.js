'use strict';

/**
 * THE STREAMING HUMAN LOOP — permanent, sandboxed end-to-end proof.
 *
 * The measure is the human. This is the loop a founder actually walks:
 *
 *   founder idea → a CTOC agent PRODUCES the decision questions → the human ANSWERS
 *   every one → the gate CROSSES ITSELF by sufficiency, approving nothing.
 *
 * It was proven by hand once this session against the live tree, which left a real
 * ledger entry that broke an unrelated count test. This test makes the proof
 * permanent and HERMETIC: everything — the plan, `.ctoc/`, the answers, the ledger —
 * lives under `os.tmpdir()` and is torn down in `afterEach`.
 *
 * X7 — SESSION-DRIVEN. The producer is no longer a `claude -p` subprocess; the
 * SESSION MODEL dispatches a subagent that writes its questions through the real
 * `streaming-precompute.writePlanQuestions`. This test writes the questions through
 * that EXACT store-writer — precisely what the dispatched subagent does — and then
 * exercises EVERYTHING downstream as the real shipped code: `writePlanQuestions` →
 * `streamAnswer` → `hasEnoughInformation` → the real `pendingGateDecisions`
 * sufficiency cross. No `claude -p`, no model, no producer module.
 *
 * Case 6 is the YES: enough information crosses the plan with a `sufficiency` ledger
 * entry, evidence, and NO `approved_by`. Case 7 is the fail-closed NO: one
 * unanswered FORK keeps the plan exactly where it is.
 */

const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const precompute = require('../src/lib/streaming-precompute.js');
const streamingGate = require('../src/lib/streaming-gate.js');
const ledger = require('../src/lib/approval-ledger.js');
const { route } = require('../src/lib/menu-screens.js');

const STAGES = ['vision', 'canvas', 'functional', 'implementation', 'todo', 'in-progress', 'review', 'done'];
const sandboxes = [];
let counter = 0;

function makeSandbox() {
  const root = path.join(os.tmpdir(), 'ctoc-loop-e2e-' + process.pid + '-' + Date.now() + '-' + counter++);
  for (const stage of STAGES) fs.mkdirSync(path.join(root, 'plans', stage), { recursive: true });
  fs.mkdirSync(path.join(root, '.ctoc'), { recursive: true });
  sandboxes.push(root);
  return root;
}

// A VALID functional plan. The `## Acceptance Criteria` section is REQUIRED by the
// functional→implementation transition validator; without it the plan would (correctly)
// refuse to cross. This is the founder's magic-link idea, captured as a plan.
function magicLinkPlan(slug) {
  return `---\ntitle: ${slug}\n---\n\n# Passwordless magic-link sign-in\n\n` +
    `## Problem Statement\nUsers forget passwords and churn at the login wall.\n\n` +
    `## Acceptance Criteria\n- [ ] a user receives a one-time link by email\n- [ ] the link signs them in\n\n` +
    `## Scope\nThe auth module.\n`;
}

// The product-owner-shaped question set the injected dispatch returns: FOUR
// questions — three real forks (two critical, one important) and one normal detail.
// Every fork must be answered for the plan to be sufficient.
function magicLinkQuestions() {
  return [
    { id: 'q10-store', prompt: 'Which store backs sessions?', critical: true, important: false, topic: 'technology-stack',
      options: [{ key: '1', label: 'Postgres', recommended: true, pros: 'RLS' }, { key: '2', label: 'SQLite', cons: 'Single writer' }] },
    { id: 'q11-expiry', prompt: 'How long is a magic link valid?', critical: false, important: true, topic: 'security-posture',
      options: [{ key: '1', label: '15 minutes', recommended: true }, { key: '2', label: '1 hour' }] },
    { id: 'q12-transport', prompt: 'Which email transport?', critical: true, important: false, topic: 'technology-stack',
      options: [{ key: '1', label: 'Resend', recommended: true }, { key: '2', label: 'Amazon SES' }] },
    { id: 'q13-copy', prompt: 'What does the sign-in button say?', critical: false, important: false, topic: 'detail',
      options: [{ key: '1', label: 'Sign in', recommended: true }, { key: '2', label: 'Continue' }] },
  ];
}

function ledgerFile(root, slug) {
  return path.join(root, '.ctoc', 'approvals', slug.toLowerCase() + '.json');
}

/**
 * The human answers the question the plan's screen asks now, by choosing the option labelled
 * `label`: the screen's own action runs through the real router exactly as the session runs it
 * (single quotes delimit one word), so the answer carries the digest of the question shown.
 * Returns the id of the question that was answered.
 */
function answerOnScreen(root, ref, label) {
  const screen = route(['plan', ref], root);
  const action = screen.actions[label];
  assert.match(String(action), /^stream answer \S+ '[^']+' '[1-3]' '[0-9a-f]{64}'$/, `the screen offers ${label} as an answer`);
  const words = [...action.matchAll(/'([^']*)'|(\S+)/g)].map((m) => (m[1] !== undefined ? m[1] : m[2]));
  route(words, root);
  return words[3];
}

/** The gate critic's classification block: only a file it classified can move a plan (the owner, 2026-10-07). */
const CLASSIFIED = Object.freeze({ by: 'gate-critic', at: 1786000000000 });

afterEach(() => {
  while (sandboxes.length) fs.rmSync(sandboxes.pop(), { recursive: true, force: true });
});

describe('streaming human loop — end to end, sandboxed, real code', () => {
  it('case 6 — founder idea → produced questions → answered → the gate CROSSES ITSELF by sufficiency (no approved_by)', async () => {
    const root = makeSandbox();
    const ref = 'functional/magic-link.md';
    const planPath = path.join(root, 'plans', 'functional', 'magic-link.md');
    fs.writeFileSync(planPath, magicLinkPlan('magic-link'));

    // 1. A dispatched CTOC subagent PRODUCES the questions — X7 makes this the SESSION
    //    MODEL, and the subagent's only write is exactly this: the real store-writer,
    //    stamped with the plan's current mtime. No producer module, no model here.
    const planMtimeMs = fs.statSync(planPath).mtimeMs;
    //    The file is the gate critic's, classified: an author's own file never moves a plan.
    const produced = precompute.writePlanQuestions(root, ref, magicLinkQuestions(), planMtimeMs, undefined, CLASSIFIED);
    assert.equal(produced.ok, true, 'the subagent wrote the questions to the real store');
    assert.deepEqual(precompute.loadPlanQuestions(root, ref).map((q) => q.id),
      ['q10-store', 'q11-expiry', 'q12-transport', 'q13-copy'], 'all four questions were persisted');

    // 2. The human ANSWERS every question the screen asks, through the screen's own actions.
    //    The weighty ones come first; the last weighty answer moves the plan on by itself.
    const answered = [];
    answered.push(answerOnScreen(root, ref, 'Postgres'));
    answered.push(answerOnScreen(root, ref, '15 minutes'));
    assert.ok(fs.existsSync(planPath), 'a weighty question is still open, so the plan stays');
    answered.push(answerOnScreen(root, ref, 'Resend'));
    assert.deepEqual(answered, ['q10-store', 'q11-expiry', 'q12-transport'], 'weighty questions are asked first');

    // 3. Drive the REAL sufficiency-cross path. (streamAnswer already re-renders
    //    through this same path; calling it explicitly asserts the END STATE, not
    //    the trigger mechanism.)
    streamingGate.pendingGateDecisions(root);

    // ── THE PROOF ──────────────────────────────────────────────────────────────
    assert.ok(!fs.existsSync(planPath), 'the plan left functional/ by itself');
    assert.ok(
      fs.existsSync(path.join(root, 'plans', 'implementation', 'magic-link.md')),
      'it crossed to implementation/ — the pre-build gate crossed ITSELF'
    );

    const entry = JSON.parse(fs.readFileSync(ledgerFile(root, 'magic-link'), 'utf8'));
    assert.equal(entry.advanced_by, 'sufficiency', 'crossed by sufficiency, never a human click');
    assert.equal(
      ledger.entryKind(entry), 'sufficiency',
      'the ledger classifies the crossing as a sufficiency provenance'
    );
    assert.equal(entry.approved_by, undefined, 'the human approved NOTHING — no approved_by marker');
    assert.equal(entry.stage_to, 'implementation');
    assert.ok(
      typeof entry.evidence === 'string' && entry.evidence.length > 0,
      'the crossing carries reconstructable evidence'
    );
    assert.match(entry.evidence, /magic-link/, 'the evidence names the plan');
  });

  it('case 7 — one unanswered FORK fails closed: the plan does NOT cross and stays in functional/', async () => {
    const root = makeSandbox();
    const ref = 'functional/fail-closed.md';
    const planPath = path.join(root, 'plans', 'functional', 'fail-closed.md');
    fs.writeFileSync(planPath, magicLinkPlan('fail-closed'));

    const produced = precompute.writePlanQuestions(
      root, ref, magicLinkQuestions(), fs.statSync(planPath).mtimeMs, undefined, CLASSIFIED);
    assert.equal(produced.ok, true);

    // The human answers the questions the screen asks, through its own actions, and stops
    // before the critical `q12-transport` fork — a real fork left open.
    assert.equal(answerOnScreen(root, ref, 'Postgres'), 'q10-store');
    assert.equal(answerOnScreen(root, ref, '15 minutes'), 'q11-expiry');

    const decisions = streamingGate.pendingGateDecisions(root);
    const d = decisions.find((x) => x.ref === ref);

    // FAIL CLOSED: an open fork keeps the plan pending — the implementer would guess.
    assert.ok(d, 'the plan is STILL a pending decision — it did not cross');
    assert.equal(d.enough, false, 'not enough information while a fork is open');
    assert.equal(d.sufficiencyReason, 'open-forks');
    assert.deepEqual(d.blockingQuestionIds, ['q12-transport'], 'the unanswered critical fork is what blocks');
    assert.ok(fs.existsSync(planPath), 'the plan stays in functional/');
    assert.ok(!fs.existsSync(path.join(root, 'plans', 'implementation', 'fail-closed.md')), 'nothing crossed');
    assert.ok(!fs.existsSync(ledgerFile(root, 'fail-closed')), 'no ledger entry — nothing was crossed');
  });
});
