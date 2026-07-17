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
 * lives under `os.tmpdir()` and is torn down in `afterEach`. The ONLY injected seam
 * is the producer dispatch (a deterministic fake returning product-owner-shaped
 * questions — no `claude -p`, no model). EVERYTHING downstream is the real shipped
 * code: `produceForPlan` → `writePlanQuestions` → `streamAnswer` →
 * `hasEnoughInformation` → the real `pendingGateDecisions` sufficiency cross.
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

const producer = require('../src/lib/streaming-producer.js');
const streamingGate = require('../src/lib/streaming-gate.js');
const ledger = require('../src/lib/approval-ledger.js');

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
    { id: 'store', prompt: 'Which store backs sessions?', critical: true,
      options: [{ key: 'pg', label: 'Postgres', recommended: true, pros: 'RLS' }, { key: 'sqlite', label: 'SQLite', cons: 'Single writer' }] },
    { id: 'expiry', prompt: 'How long is a magic link valid?', important: true,
      options: [{ key: '15m', label: '15 minutes', recommended: true }, { key: '1h', label: '1 hour' }] },
    { id: 'transport', prompt: 'Which email transport?', critical: true,
      options: [{ key: 'resend', label: 'Resend', recommended: true }, { key: 'ses', label: 'Amazon SES' }] },
    { id: 'copy', prompt: 'What does the sign-in button say?',
      options: [{ key: 'signin', label: 'Sign in', recommended: true }, { key: 'continue', label: 'Continue' }] },
  ];
}

function ledgerFile(root, slug) {
  return path.join(root, '.ctoc', 'approvals', slug.toLowerCase() + '.json');
}

afterEach(() => {
  while (sandboxes.length) fs.rmSync(sandboxes.pop(), { recursive: true, force: true });
});

describe('streaming human loop — end to end, sandboxed, real code', () => {
  it('case 6 — founder idea → produced questions → answered → the gate CROSSES ITSELF by sufficiency (no approved_by)', async () => {
    const root = makeSandbox();
    const ref = 'functional/magic-link.md';
    const planPath = path.join(root, 'plans', 'functional', 'magic-link.md');
    fs.writeFileSync(planPath, magicLinkPlan('magic-link'));

    // 1. A CTOC agent PRODUCES the questions — the REAL producer with an injected
    //    dispatch (no model). This is the pipe PQ1 built; PQ2 wired it live.
    const fakeDispatch = async (dref, planText, stage) => {
      assert.equal(dref, ref);
      assert.equal(stage, 'functional');
      assert.match(planText, /magic-link/);
      return magicLinkQuestions();
    };
    const produced = await producer.produceForPlan(root, ref, fakeDispatch);
    assert.equal(produced.written, true, 'the producer wrote the questions to the real store');
    assert.equal(produced.count, 4, 'all four questions were persisted');

    // 2. The human ANSWERS every question via the REAL answer writer.
    for (const [qid, key] of [['store', 'pg'], ['expiry', '15m'], ['transport', 'resend'], ['copy', 'signin']]) {
      streamingGate.streamAnswer(ref, qid, key, root);
    }

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

    const fakeDispatch = async () => magicLinkQuestions();
    const produced = await producer.produceForPlan(root, ref, fakeDispatch);
    assert.equal(produced.written, true);

    // Answer every question EXCEPT the critical `transport` fork — a real fork left open.
    for (const [qid, key] of [['store', 'pg'], ['expiry', '15m'], ['copy', 'signin']]) {
      streamingGate.streamAnswer(ref, qid, key, root);
    }

    const decisions = streamingGate.pendingGateDecisions(root);
    const d = decisions.find((x) => x.ref === ref);

    // FAIL CLOSED: an open fork keeps the plan pending — the implementer would guess.
    assert.ok(d, 'the plan is STILL a pending decision — it did not cross');
    assert.equal(d.enough, false, 'not enough information while a fork is open');
    assert.equal(d.sufficiencyReason, 'open-forks');
    assert.deepEqual(d.blockingQuestionIds, ['transport'], 'the unanswered critical fork is what blocks');
    assert.ok(fs.existsSync(planPath), 'the plan stays in functional/');
    assert.ok(!fs.existsSync(path.join(root, 'plans', 'implementation', 'fail-closed.md')), 'nothing crossed');
    assert.ok(!fs.existsSync(ledgerFile(root, 'fail-closed')), 'no ledger entry — nothing was crossed');
  });
});
