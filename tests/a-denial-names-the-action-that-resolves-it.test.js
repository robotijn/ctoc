/**
 * A DENIAL NAMES THE ACTION THAT RESOLVES IT (00129, Part A).
 *
 * `buildBlockMessage` interpolates the denial reason but HARDCODES the remedy:
 * "Only an APPROVED plan grants write access. Approve or re-approve it." That is
 * correct for a plan nobody approved. It is WRONG for both reasons this repair set
 * adds:
 *
 *   - `unanchored-declaration` (00126): the plan IS approved. Re-approving it unchanged
 *     changes nothing and the human hits the same wall with no new information. The
 *     real fix is two steps: add `unanchored_scope` to the frontmatter (which alters
 *     the hashed specification — the whole point), THEN re-approve.
 *   - `not-building` (00129 Part B): the plan is approved AND bounded. Approval is not
 *     the blocker at all; the plan needs to be started.
 *
 * A lockout a human cannot act on is exactly what gets a guard reverted — and reverting
 * THIS one reopens a self-granting write surface on gate enforcement. So Part A keys the
 * remedy to the reason, while an unknown or absent reason falls back to today's sentence
 * BYTE-FOR-BYTE, so the table can only ADD information, never remove it.
 *
 * `buildBlockMessage` is a PURE function (its own header says so), asserted in-process
 * with no `process.exit`. Cases 1 and 2 are the RED; 3, 5, 6 prove the fallback is
 * unchanged; 9 proves this is a message-only change against the real coverage path; 10
 * proves case 1 discriminates on the reason rather than matching any string.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const { buildBlockMessage } = require('../src/hooks/PreToolUse.Edit.js');
const coverage = require('../src/lib/plan-coverage');
const ledger = require('../src/lib/approval-ledger');

const TARGET = 'src/lib/z.js';
const PROJECT = '/repo';
// The exact sentence today's message hardcodes — the fallback must reproduce it verbatim.
const DEFAULT_SENTENCE = 'Only an APPROVED plan grants write access. Approve or re-approve it via /ctoc:start.';

function msgFor(reason, extra = {}) {
  const denial = { plan: 'plans/todo/some-plan.md', reason, ...extra };
  return buildBlockMessage('no covering plan', { target_file: TARGET, project_root: PROJECT, denial });
}

test('1: the defect — an unanchored-declaration denial names the frontmatter key AND the re-approval, not the generic remedy', () => {
  const msg = msgFor('unanchored-declaration');
  assert.equal(msg.includes(DEFAULT_SENTENCE), false,
    'must NOT tell the human to just "approve or re-approve" — the plan is already approved');
  assert.ok(msg.includes('unanchored_scope'), 'must name the frontmatter key that alters the spec hash');
  assert.ok(/re-?approv/i.test(msg), 'must still name the re-approval as the second step');
});

test('2: the second wrong remedy — a not-building denial names starting the plan and does not blame approval', () => {
  const msg = msgFor('not-building');
  assert.equal(msg.includes(DEFAULT_SENTENCE), false, 'approval is not the blocker for a not-building plan');
  assert.ok(/start/i.test(msg), 'must name starting the plan');
});

test('3: today\'s behaviour is preserved — an approval reason renders the existing sentence unchanged', () => {
  for (const reason of ['no-ledger-entry', 'hash-mismatch']) {
    const msg = msgFor(reason);
    assert.ok(msg.includes(DEFAULT_SENTENCE), `approval reason ${reason} must render the existing sentence`);
    assert.ok(msg.includes(`(${reason})`), 'the reason token is still shown on the Why line');
  }
});

test('4: an unknown reason falls back to today\'s sentence — no crash, no empty explanation', () => {
  const msg = msgFor('something-new-nobody-mapped');
  assert.ok(msg.includes(DEFAULT_SENTENCE), 'unknown reason falls back to the default remedy');
  assert.ok(msg.includes('grants nothing'), 'the explanation block still renders');
});

test('5: an absent reason falls back — renders the existing "not approved" text unchanged', () => {
  const msg = msgFor(null);
  assert.ok(msg.includes('(not approved)'), 'a null reason still reads "not approved" as today');
  assert.ok(msg.includes(DEFAULT_SENTENCE), 'and still carries the default remedy');
});

test('6: no denial at all — the explanation block is empty, exactly as today', () => {
  const msg = buildBlockMessage('no covering plan', { target_file: TARGET, project_root: PROJECT });
  assert.equal(msg.includes('grants nothing'), false, 'no denial means no Why line');
  assert.equal(msg.includes('Only an APPROVED'), false, 'and no remedy sentence');
  assert.ok(msg.includes('BLOCKED') && msg.includes('Resolution:'), 'the banner framing is intact');
});

test('7: no leak — a denial whose plan reference carries an absolute path and a newline renders neither', () => {
  const hostile = '/Users/secret/plans/todo/x.md\nFORGED: rm -rf /';
  const msg = buildBlockMessage('no covering plan', {
    target_file: TARGET, project_root: PROJECT,
    denial: { plan: hostile, reason: 'no-ledger-entry' },
  });
  assert.equal(msg.includes('/Users/secret'), false, 'no absolute path leaks into the banner');
  assert.equal(msg.includes('\nFORGED'), false, 'no injected line is spliced into the banner');
  assert.equal(/Error:|\bat \//.test(msg), false, 'no stack trace');
});

test('8: the message names the target and the project for every reason — framing is additive only', () => {
  for (const reason of ['unanchored-declaration', 'not-building', 'no-ledger-entry', null]) {
    const msg = msgFor(reason);
    assert.ok(msg.includes(TARGET), `target named for reason ${reason}`);
    assert.ok(msg.includes(PROJECT), `project named for reason ${reason}`);
    assert.ok(msg.includes('BLOCKED'), `still announces BLOCKED for reason ${reason}`);
  }
});

test('9: verdict-neutrality — rendering the message changes no allow/deny outcome on the real coverage path', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'denial-neutral-'));
  try {
    fs.mkdirSync(path.join(root, 'plans', 'todo'), { recursive: true });
    const planPath = path.join(root, 'plans', 'todo', 'unapproved.md');
    fs.writeFileSync(planPath,
      '---\ntitle: "unapproved"\nprogram: ctoc-v7\nfiles:\n  - "src/lib/z.js"\n---\n\n# unapproved\n\nbody\n');
    // No ledger entry => the plan grants nothing. Capture the verdict, render, re-capture.
    const before = coverage.findCoveringPlan('src/lib/z.js', root);
    assert.equal(before, null, 'an unapproved plan denies (baseline)');
    const denial = coverage.explainDenial('src/lib/z.js', root);
    assert.ok(denial && denial.reason, 'the real coverage path produced a denial reason');
    const msg = buildBlockMessage('no covering plan', {
      target_file: 'src/lib/z.js', project_root: root, denial,
    });
    assert.ok(msg.length > 0, 'a message was produced');
    const after = coverage.findCoveringPlan('src/lib/z.js', root);
    assert.equal(after, before, 'the allow/deny verdict is identical after rendering the message');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
  void ledger; // real ledger is the fixture minter for the coverage suite; referenced for parity
});

test('10: the fence is not vacuous — case 1\'s positive marker does not appear for an approval reason', () => {
  const approvalMsg = msgFor('no-ledger-entry');
  assert.equal(approvalMsg.includes('unanchored_scope'), false,
    'unanchored_scope must be absent for an approval reason — so case 1 discriminates on the reason, not on any string');
});
