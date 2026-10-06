'use strict';

/**
 * The approved build queue — a READ-ONLY view of which approved plans wait, plus the
 * session-start banner that shows the human how many. It never decides whether a
 * session may stop: the derived approved-queue regime that did (shouldContinueQueue,
 * recordQueueBlock, the queue fork functions) is removed — plan "CTOC does no unasked
 * work at session start or stop" — and its cases went with it.
 *
 * Real temp-dir state, real ledger entries via approval-ledger.writeEntry —
 * NOTHING mocked (mirrors tests/continuation.test.js). No fixture writes to the
 * real repo root.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const q = require('../src/lib/continuation-queue');
const ledger = require('../src/lib/approval-ledger');

// ── fixtures ────────────────────────────────────────────────────────────────

function mkProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-cq-'));
  fs.mkdirSync(path.join(dir, '.ctoc'), { recursive: true });
  for (const s of ['todo', 'in-progress', 'review', 'done']) {
    fs.mkdirSync(path.join(dir, 'plans', s), { recursive: true });
  }
  return dir;
}

function planText(title, body = 'The specification the human ruled on.') {
  return `---
title: "${title}"
type: implementation
files:
  - "src/lib/${title}.js"
---

# ${title}

${body}
`;
}

/** Create a plan file in a stage and, when approve=true, mint a REAL Gate-2
 *  ledger entry for it (content-bound, hash_scope:'specification'). */
function makePlan(root, stage, slug, { approve = true, body } = {}) {
  const content = planText(slug, body);
  const p = path.join(root, 'plans', stage, `${slug}.md`);
  fs.writeFileSync(p, content);
  if (approve) {
    ledger.writeEntry(
      ledger.slugFromPlanPath(p),
      { content, stage_from: 'implementation', stage_to: 'todo', approved_by: 'human' },
      root,
    );
  }
  return p;
}

const cleanup = (dir) => fs.rmSync(dir, { recursive: true, force: true });

// ── approvedFreeQueue: only approved plans count ────────────────────────────

test('approvedFreeQueue counts ONLY approved plans; unapproved and tampered are excluded', () => {
  const dir = mkProject();
  try {
    makePlan(dir, 'todo', 'alpha-approved', { approve: true });
    makePlan(dir, 'todo', 'beta-noledger', { approve: false }); // no ledger entry -> OUT
    // tampered: approve, then change a SPEC line so the spec hash no longer matches.
    const gamma = makePlan(dir, 'todo', 'gamma-tampered', { approve: true });
    fs.writeFileSync(gamma, planText('gamma-tampered', 'DIFFERENT specification after approval.'));

    const { refs, depth } = q.approvedFreeQueue(dir);
    assert.equal(depth, 1, `only the untouched approved plan counts, got ${JSON.stringify(refs)}`);
    assert.deepEqual(refs, ['todo/alpha-approved.md']);
  } finally { cleanup(dir); }
});

test('approvedFreeQueue: an approved in-progress plan counts (recoverable via the todo edge)', () => {
  const dir = mkProject();
  try {
    makePlan(dir, 'in-progress', 'building-approved', { approve: true });
    makePlan(dir, 'in-progress', 'squatted-noledger', { approve: false }); // OUT
    const { refs, depth } = q.approvedFreeQueue(dir);
    assert.equal(depth, 1);
    assert.deepEqual(refs, ['in-progress/building-approved.md']);
  } finally { cleanup(dir); }
});

test('approvedFreeQueue: todo + in-progress approved plans both count', () => {
  const dir = mkProject();
  try {
    makePlan(dir, 'todo', 'one', { approve: true });
    makePlan(dir, 'in-progress', 'two', { approve: true });
    assert.equal(q.approvedFreeQueue(dir).depth, 2);
  } finally { cleanup(dir); }
});

// ── FAIL-OPEN enumeration ────────────────────────────────────────────────────

test('approvedFreeQueue fails open: bad root and absent stage dirs yield depth 0, never throws', () => {
  assert.doesNotThrow(() => q.approvedFreeQueue(null));
  assert.equal(q.approvedFreeQueue(null).depth, 0);
  assert.equal(q.approvedFreeQueue('').depth, 0);
  // A root with no plans/ tree at all.
  const bare = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-cq-bare-'));
  try {
    assert.doesNotThrow(() => q.approvedFreeQueue(bare));
    assert.equal(q.approvedFreeQueue(bare).depth, 0);
  } finally { cleanup(bare); }
});

// ── approvedQueueBannerLine (the session-start banner) ──────────────────────

test('approvedQueueBannerLine: names N for a non-empty queue, is silent otherwise, never throws', () => {
  const dir = mkProject();
  try {
    assert.equal(q.approvedQueueBannerLine(dir), '', 'depth 0 -> silent banner');
    assert.equal(q.approvedQueueBannerLine(null), '', 'bad root -> silent banner');
    makePlan(dir, 'todo', 'x', { approve: true });
    makePlan(dir, 'todo', 'y', { approve: true });
    const line = q.approvedQueueBannerLine(dir);
    assert.match(line, /^\nApproved queue: 2 plan\(s\) ready to build$/);
  } finally { cleanup(dir); }
});
