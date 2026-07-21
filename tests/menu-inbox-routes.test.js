/**
 * R2-C Change 1 — Inbox doors (W1): a reachable read-only list behind every
 * dashboard inbox COUNT. Iron Loop Step 8 (TDD).
 *
 * New routes `inbox questions`, `inbox decisions`, `inbox gates` each render the
 * items their inbox.js lister returns (bullet rows, stripCtl'd, capped, ◀ Back);
 * an empty stream renders safely; the dashboard inbox lines name the routes.
 *
 * Isolated tmp roots (fs.mkdtempSync); afterEach rm. Raw fs/os are permitted in
 * tests/** (eslint exempts the fs rule there). Seeding uses the real inbox.js
 * writers (createQuestion/createDecision) and real plan files for the gate stream.
 */

'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ms = require('../src/lib/menu-screens');
const inbox = require('../src/lib/inbox');
const { invalidate } = require('../src/lib/cache');

let root;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-r2c-inbox-'));
  for (const s of ['functional', 'implementation', 'review', 'todo', 'done']) {
    fs.mkdirSync(path.join(root, 'plans', s), { recursive: true });
  }
  invalidate('getInboxCounts');
});
afterEach(() => {
  invalidate('getInboxCounts');
  try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* best-effort */ }
});

/** Count bullet rows in a rendered screen body. */
function bulletRows(text) {
  return text.split('\n').filter((l) => l.trimStart().startsWith('•')).length;
}

// ═══════════════════════════════════════════════════════════════════════════
// inbox questions
// ═══════════════════════════════════════════════════════════════════════════

describe('R2-C — inbox questions door', () => {
  it('lists seeded questions, Back-only, no digit keys', () => {
    inbox.createQuestion({ source_plan: 'plan-alpha', source_step: '5', question: 'Which store?' }, root);
    inbox.createQuestion({ source_plan: 'plan-beta', source_step: '6', question: 'Which engine?' }, root);
    const screen = ms.route(['inbox', 'questions'], root);
    assert.equal(screen.ask.questions[0].header, 'Inbox', 'questions door renders the Inbox header');
    assert.match(screen.text, /Morning questions \(2\)/);
    assert.ok(screen.text.includes('plan-alpha'), 'names the first question source plan');
    assert.ok(screen.text.includes('plan-beta'), 'names the second question source plan');
    assert.equal(bulletRows(screen.text), 2, 'one bullet row per question');
    assert.deepEqual(Object.keys(screen.actions), ['◀ Back']);
    for (const k of Object.keys(screen.actions)) assert.ok(!/^\d+$/.test(k), `no digit key: ${k}`);
    assert.ok(screen.text.endsWith('\n\n\n'), 'menu return contract: trailing newlines');
  });

  it('empty questions stream renders safely', () => {
    const screen = ms.route(['inbox', 'questions'], root);
    assert.equal(screen.ask.questions[0].header, 'Inbox');
    assert.match(screen.text, /No morning questions/);
    assert.deepEqual(Object.keys(screen.actions), ['◀ Back']);
  });

  it('caps at 20 rows with a "… and N more" line', () => {
    for (let i = 0; i < 27; i++) inbox.createQuestion({ source_plan: `p${i}`, question: 'q' }, root);
    const screen = ms.route(['inbox', 'questions'], root);
    assert.equal(bulletRows(screen.text), 20, 'at most 20 rows render');
    assert.match(screen.text, /… and 7 more/);
    assert.match(screen.text, /Morning questions \(27\)/, 'header shows the true total');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// inbox decisions
// ═══════════════════════════════════════════════════════════════════════════

describe('R2-C — inbox decisions door', () => {
  it('lists seeded decisions, Back-only', () => {
    inbox.createDecision({ plan: 'plan-gamma', step: '10', ambiguity: 'x', choice: 'y', rationale: 'z' }, root);
    const screen = ms.route(['inbox', 'decisions'], root);
    assert.equal(screen.ask.questions[0].header, 'Inbox');
    assert.match(screen.text, /Decisions awaiting review \(1\)/);
    assert.ok(screen.text.includes('plan-gamma'));
    assert.equal(bulletRows(screen.text), 1);
    assert.deepEqual(Object.keys(screen.actions), ['◀ Back']);
  });

  it('empty decisions stream renders safely', () => {
    const screen = ms.route(['inbox', 'decisions'], root);
    assert.match(screen.text, /No decisions awaiting review/);
    assert.deepEqual(Object.keys(screen.actions), ['◀ Back']);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// inbox gates
// ═══════════════════════════════════════════════════════════════════════════

describe('R2-C — inbox gates door', () => {
  it('lists plans awaiting a gate decision (gate-source stages), Back-only', () => {
    fs.writeFileSync(path.join(root, 'plans', 'functional', 'feat-x.md'), '# feat-x\n');
    fs.writeFileSync(path.join(root, 'plans', 'review', 'feat-y.md'), '# feat-y\n');
    const screen = ms.route(['inbox', 'gates'], root);
    assert.equal(screen.ask.questions[0].header, 'Inbox');
    assert.match(screen.text, /Plans at gates \(2\)/);
    assert.ok(screen.text.includes('feat-x'));
    assert.ok(screen.text.includes('feat-y'));
    // INVERTED (plan 00154). Contract from OUTSIDE the test: the owner reads a gate
    // number as an undecodable internal code; gate-words says what each moment IS.
    // The TEST was wrong, not the code — it asserted the door SHOW "Gate 1"/"Gate 3",
    // the exact strings the owner objected to. Each source stage now shows its
    // DECISION label, and a gate number is a case that FAILS if it returns.
    assert.ok(screen.text.includes('Build this?'), 'functional → its decision, not a number');
    assert.ok(screen.text.includes('Finished?'), 'review → its decision, not a number');
    assert.doesNotMatch(screen.text, /\bGate\s+[0-3]\b/, 'a gate number returned to the door');
    assert.equal(bulletRows(screen.text), 2);
    assert.deepEqual(Object.keys(screen.actions), ['◀ Back']);
  });

  it('empty gate stream renders safely', () => {
    const screen = ms.route(['inbox', 'gates'], root);
    assert.match(screen.text, /No plans at gates/);
    assert.deepEqual(Object.keys(screen.actions), ['◀ Back']);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// security — control-char injection from a hostile inbox item
// ═══════════════════════════════════════════════════════════════════════════

describe('R2-C — inbox door render is injection-safe (S1 stripCtl)', () => {
  it('strips ANSI/control chars and never forges an extra row', () => {
    // A hostile source_plan carries ESC + a newline. The row must survive minus
    // the control bytes and the newline must NOT split it into two bullet rows.
    inbox.createQuestion({ source_plan: 'evil\x1b[2Jboom\ninjected', question: 'q' }, root);
    const screen = ms.route(['inbox', 'questions'], root);
    assert.ok(!screen.text.includes('\x1b'), 'no raw ESC byte in rendered text');
    assert.ok(!/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]/.test(screen.text), 'no C0/C1 control bytes');
    assert.equal(bulletRows(screen.text), 1, 'hostile newline must not forge an extra row');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// dashboard hint text names the routes (W1: a count with no door is the defect)
// ═══════════════════════════════════════════════════════════════════════════

describe('R2-C — dashboard inbox lines name their door routes', () => {
  it('questions/decisions/gates lines carry the "view: inbox <route>" hint when > 0', () => {
    inbox.createQuestion({ source_plan: 'p', question: 'q' }, root);
    inbox.createDecision({ plan: 'p', ambiguity: 'a', choice: 'c', rationale: 'r' }, root);
    fs.writeFileSync(path.join(root, 'plans', 'functional', 'g.md'), '# g\n');
    invalidate('getInboxCounts');
    const text = ms.route([], root).text;
    assert.match(text, /morning question[^\n]*inbox questions/, 'questions line names its route');
    assert.match(text, /awaiting review[^\n]*inbox decisions/, 'decisions line names its route');
    assert.match(text, /at gates[^\n]*inbox gates/, 'gates line names its route');
  });

  it('no hint when the whole inbox is clear', () => {
    const text = ms.route([], root).text;
    assert.match(text, /Inbox clear/);
    assert.doesNotMatch(text, /view: inbox/);
  });
});
