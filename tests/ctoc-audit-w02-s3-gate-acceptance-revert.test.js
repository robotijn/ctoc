'use strict';

/**
 * W02-s3 — Ledger-based gate acceptance, SIP1 exemption, fault-isolated revert.
 *
 * Findings under test: C4 (approval provenance comes from the agent-write-denied
 * ledger at `.ctoc/approvals/`, NOT from the forgeable `approved_by: human`
 * marker in the plan body), H7 (a freshly-authored SIP1 slice in
 * `implementation/` is exempt from the residency revert), and C5 (a throw from
 * one revert does not abandon the remaining violations, and the sweep never
 * reports a silent clean pass while a violation stands).
 *
 * BEHAVIOR-first, no test doubles: every assertion drives the REAL exported
 * functions against a REAL temp plan tree in os.tmpdir() and a REAL ledger
 * written by the REAL `approval-ledger` module, then asserts whether a plan is
 * FLAGGED / REVERTED / EXEMPT and its final on-disk residency — never a bare
 * return value in isolation.
 *
 * Safety note (RED phase): the module under test historically ran `main()` at
 * require-time, and `main()` scans `process.cwd()/plans` and reverts unapproved
 * plans. To keep a pre-fix (red) run from mutating THIS repository's plans, we
 * chdir into an empty sandbox BEFORE requiring the module, so any require-time
 * `main()` scans an empty tree. After the fix (the `require.main === module`
 * guard) require no longer runs `main()` at all. Every green assertion passes an
 * explicit sandbox project path, so the working directory is irrelevant to the
 * behavior being tested.
 */

const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ledger = require('../src/lib/approval-ledger');

// --- CWD safety: chdir into an empty sandbox before requiring the module -----
const originalCwd = process.cwd();
const cwdSandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-hgc-cwd-'));
process.chdir(cwdSandbox);

// Require AFTER the chdir so any legacy require-time main() scans an empty tree.
const gate = require('../src/hooks/human-gate-check.js');

after(() => {
  process.chdir(originalCwd);
  try { fs.rmSync(cwdSandbox, { recursive: true, force: true }); } catch { /* best effort */ }
});

// --- Sandbox project helpers -------------------------------------------------

const STAGES = ['functional', 'implementation', 'todo', 'in-progress', 'review', 'done'];
let projectDir;

before(() => {
  // no-op; per-test dirs created in beforeEach
});

beforeEach(() => {
  projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-w02s3-'));
  for (const stage of STAGES) {
    fs.mkdirSync(path.join(projectDir, 'plans', stage), { recursive: true });
  }
  fs.mkdirSync(path.join(projectDir, '.ctoc', 'approvals'), { recursive: true });
});

/**
 * Build a plan file's content. Includes a forgeable `approved_by: human` marker
 * only when `approvedMarker` is set, and a `parent_plan` line only when given.
 */
function planContent({ title = 'Plan', parentPlan, approvedMarker = false, body = '# Body\n\nSome content.\n' } = {}) {
  let fm = '---\n';
  if (approvedMarker) fm += 'approved_by: human\n';
  fm += `title: "${title}"\ntype: feature\n`;
  if (parentPlan) fm += `parent_plan: ${parentPlan}\n`;
  fm += '---\n\n';
  return fm + body;
}

/** Write a plan into a stage folder; returns its absolute path and content. */
function writePlan(stage, slug, opts) {
  const content = planContent(opts);
  const filePath = path.join(projectDir, 'plans', stage, `${slug}.md`);
  fs.writeFileSync(filePath, content);
  return { filePath, content };
}

/** Record a ledger entry for a plan at a gate edge. */
function approve(slug, content, stageFrom, stageTo) {
  ledger.writeEntry(slug, {
    content_sha256: ledger.computeContentHash(content),
    stage_from: stageFrom,
    stage_to: stageTo,
  }, projectDir);
}

const exists = (stage, slug) =>
  fs.existsSync(path.join(projectDir, 'plans', stage, `${slug}.md`));

const flaggedSlugs = (stage) =>
  gate.checkFolder(stage, projectDir).map((v) => path.basename(v.path).replace(/\.md$/, ''));

// --- [C4] acceptance comes from the ledger, not the in-plan marker -----------

test('[C4] self-authored marker in done/ with NO ledger entry is FLAGGED', () => {
  writePlan('done', 'forged-plan', { approvedMarker: true });
  assert.ok(
    flaggedSlugs('done').includes('forged-plan'),
    'a forged approved_by:human marker with no ledger entry must be flagged as a violation',
  );
});

test('[C4] a valid ledger entry for done/ is NOT flagged', () => {
  const { content } = writePlan('done', 'ledger-approved', { approvedMarker: true });
  approve('ledger-approved', content, 'review', 'done');
  assert.ok(
    !flaggedSlugs('done').includes('ledger-approved'),
    'a plan with a matching ledger entry for stage_to=done must NOT be flagged',
  );
});

test('[C4] a plan edited after approval (hash diverges) is FLAGGED', () => {
  const { filePath, content } = writePlan('done', 'edited-after-approval', { approvedMarker: true });
  approve('edited-after-approval', content, 'review', 'done');
  // Genuine post-approval edit: the live hash no longer matches the ledger.
  fs.appendFileSync(filePath, '\n\nSmuggled extra line after approval.\n');
  assert.ok(
    flaggedSlugs('done').includes('edited-after-approval'),
    'invalidate-on-edit: a body change after approval must flag the plan',
  );
});

// --- [H7] fresh SIP1 slice exemption -----------------------------------------

test('[H7] fresh SIP1 slice in implementation/ (parent_plan → approved parent, no own ledger) is EXEMPT', () => {
  // The exemption is valid ONLY under an APPROVED/LEDGERED parent: the parent index
  // crossed Gate 1 (functional→implementation) and carries a real ledger entry,
  // while the freshly-decomposed slice has none of its own yet. A dangling parent
  // is NOT exempt (that was a Gate-1 residency hole) and is covered separately.
  const { content: parentContent } = writePlan('implementation', 'parent-thing');
  approve('parent-thing', parentContent, 'functional', 'implementation');
  writePlan('implementation', 'parent-thing-s1-slice', { parentPlan: 'parent-thing' });
  assert.ok(
    !flaggedSlugs('implementation').includes('parent-thing-s1-slice'),
    'a fresh SIP1 slice under an approved/ledgered parent (no ledger entry of its own) must NOT be reverted',
  );
});

test('[H7] fresh SIP1 slice whose parent_plan is DANGLING (no ledger) is FLAGGED', () => {
  // The Gate-1 residency hole: a lone `parent_plan:` line pointing at a parent with
  // no ledger entry must NOT earn the exemption — it is squatting implementation/
  // with zero provenance and must be reverted like any unstamped Gate-1 resident.
  writePlan('implementation', 'dangling-parent-slice', { parentPlan: 'no-such-parent' });
  assert.ok(
    flaggedSlugs('implementation').includes('dangling-parent-slice'),
    'a slice under a dangling/unledgered parent must be flagged, not exempted',
  );
});

test('[H7] implementation/ plan with NO parent_plan and NO ledger is FLAGGED', () => {
  writePlan('implementation', 'smuggled-impl', { approvedMarker: true });
  assert.ok(
    flaggedSlugs('implementation').includes('smuggled-impl'),
    'the SIP1 exemption is not a blanket bypass: no parent_plan + no ledger must be flagged',
  );
});

test('[H7] a ledger-approved plan in implementation/ is accepted by entry existence', () => {
  const { content } = writePlan('implementation', 'gate1-approved', { approvedMarker: true });
  // Note: implementation acceptance binds to entry EXISTENCE with stage_to,
  // not a frozen hash (active editing is expected there).
  ledger.writeEntry('gate1-approved', {
    content_sha256: ledger.computeContentHash(content) + 'stale',
    stage_from: 'functional',
    stage_to: 'implementation',
  }, projectDir);
  assert.ok(
    !flaggedSlugs('implementation').includes('gate1-approved'),
    'implementation acceptance binds to the fact of the Gate-1 crossing (entry existence), not a hash',
  );
});

// --- [C5] revert survives a mid-loop throw and never reports silent success --

test('[C5] a throw on one revert still reverts the others and reports the failure', () => {
  // Three unapproved plans in done/ → three violations, all revert to review/.
  writePlan('done', 'violation-one', { approvedMarker: true });
  writePlan('done', 'violation-two', { approvedMarker: true });
  writePlan('done', 'violation-three', { approvedMarker: true });

  const violations = gate.checkFolder('done', projectDir);
  assert.equal(violations.length, 3, 'all three unapproved plans must be violations');

  // Inject a revertPlan that THROWS for the first violation and delegates to the
  // REAL revert (actual file move) for the rest — no test double of the move.
  const realRevert = gate.revertPlan;
  const throwOn = violations[0].path;
  const injected = (v) => {
    if (v.path === throwOn) throw new Error('injected filesystem failure');
    return realRevert(v);
  };

  const result = gate.revertAll(violations, { revertPlan: injected });

  // The other two were genuinely reverted on disk.
  const survivors = violations.slice(1).map((v) => path.basename(v.path).replace(/\.md$/, ''));
  for (const slug of survivors) {
    assert.equal(exists('done', slug), false, `${slug} must have left done/`);
    assert.equal(exists('review', slug), true, `${slug} must have been reverted to review/`);
  }

  // The failing one was NOT silently dropped: it is recorded as a failure and
  // still resides in done/ (revert did not happen for it).
  assert.ok(result && Array.isArray(result.failures), 'revertAll must return a failures[] array');
  assert.equal(result.failures.length, 1, 'exactly one revert failed');
  assert.equal(result.reverted.length, 2, 'the other two reverts succeeded');
  const firstSlug = path.basename(throwOn).replace(/\.md$/, '');
  assert.equal(exists('done', firstSlug), true, 'the failed-revert plan still stands in done/');
  // The sweep does NOT report a clean pass while a violation remains unresolved.
  assert.ok(result.failures.length > 0, 'a failed revert must surface as an incomplete outcome');
});
