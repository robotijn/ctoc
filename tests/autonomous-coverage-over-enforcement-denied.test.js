/**
 * AN AUTONOMOUS COVERAGE GRANT MUST NEVER REACH CTOC'S OWN ENFORCEMENT CODE.
 *
 * THE VULNERABILITY (verified end-to-end in live code, 2026-08-01). CTOC's
 * irreversibility floor was not self-contained: the REVERSIBLE sufficiency flow
 * could mint write-coverage over the very files that guard the four human gates,
 * and with auto-build enabled an executor would build that edit before any human
 * saw it. The chain, all confirmed:
 *   1. An agent authors a structurally-valid plan (plans are edit-whitelisted)
 *      declaring `files: ["src/hooks/human-gate-check.js"]` (or `["**"]`).
 *   2. With an empty / all-non-blocking questions file the sufficiency gate
 *      auto-crosses it implementation→todo, minting a `sufficiency`-KIND ledger
 *      entry — no human.
 *   3. At `todo/`, `classifyResidency` ACCEPTS a sufficiency-kind entry, so
 *      `isApprovedForCoverage` returns approved.
 *   4. `plan-coverage.findCoveringPlan` then treats that plan's `files:` globs as
 *      a real write grant — including over `src/hooks/human-gate-check.js`.
 * Result: the enforcement code that guards the four human gates was writable via
 * an autonomous, human-free path.
 *
 * THE FIX. An AUTONOMOUS (sufficiency / pipeline) coverage grant NEVER confers
 * write access over CTOC's own enforcement surface (`protected-paths.js`). Those
 * files still require a HUMAN-approved (human | backfilled) covering plan. Ordinary
 * auto-build over ordinary source is unaffected; a human-approved plan editing a
 * hook (CTOC dogfoods this) is unaffected.
 *
 * The decision lives in the SHARED oracle `plan-coverage.scanForCoverage` (reached
 * by `findCoveringPlan`), which BOTH write channels — `PreToolUse.Edit.js` and
 * `PreToolUse.Bash.js` — call, so a single encoding covers both.
 *
 * Fixtures are real `os.tmpdir()` directories; approvals are minted with the REAL
 * `approval-ledger` (it hashes the fixture's actual bytes). The only hand-written
 * ledger file is the deliberately unreadable-kind one (case e), a shape the real
 * writers refuse to produce.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const coverage = require('../src/lib/plan-coverage');
const ledger = require('../src/lib/approval-ledger');

const GATE_HOOK = 'src/hooks/human-gate-check.js';
const PROTECTED_LIB = 'src/lib/plan-coverage.js';
const ORDINARY = 'src/lib/foo.js';

function makeRoot() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'autonomy-enf-'));
  for (const s of ['in-progress', 'todo', 'implementation']) {
    fs.mkdirSync(path.join(dir, 'plans', s), { recursive: true });
  }
  return dir;
}
function rm(dir) { try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best-effort */ } }

/** Write a plan declaring `files:` (optionally with an unanchored_scope ack). */
function writePlan(root, stage, slug, files, unanchored) {
  const yaml = files.map((f) => `  - "${f}"`).join('\n');
  const ack = unanchored ? `unanchored_scope: "${unanchored}"\n` : '';
  const content = `---\ntitle: "${slug}"\nprogram: ctoc-v7\n${ack}files:\n${yaml}\n---\n\n# ${slug}\n\nbody\n`;
  const p = path.join(root, 'plans', stage, `${slug}.md`);
  fs.writeFileSync(p, content);
  return p;
}
function suffApprove(root, planPath, stageTo = 'todo') {
  return ledger.writeSufficiencyEntry(ledger.slugFromPlanPath(planPath), {
    content: fs.readFileSync(planPath, 'utf8'),
    stage_from: 'implementation',
    stage_to: stageTo,
    evidence: `${path.basename(planPath)}: 3 questions answered, zero open forks`,
  }, root);
}
function humanApprove(root, planPath, stageTo = 'todo') {
  return ledger.writeEntry(ledger.slugFromPlanPath(planPath), {
    content: fs.readFileSync(planPath, 'utf8'),
    stage_from: 'implementation',
    stage_to: stageTo,
    approved_by: 'human',
  }, root);
}

// ---------------------------------------------------------------------------
// (a) THE EXPLOIT. A sufficiency-kind plan declaring the gate hook must be REFUSED.
//     RED before the fix (today it GRANTS); GREEN after.
// ---------------------------------------------------------------------------
test('a: a SUFFICIENCY-kind plan declaring the gate-enforcement hook grants NOTHING', () => {
  const root = makeRoot();
  try {
    const p = writePlan(root, 'todo', 'zz-exploit', [GATE_HOOK]);
    suffApprove(root, p, 'todo');

    assert.equal(
      coverage.findCoveringPlan(GATE_HOOK, root), null,
      'an autonomous (sufficiency) grant must never reach the gate-enforcement code',
    );
    const why = coverage.explainDenial(GATE_HOOK, root);
    assert.ok(why, 'the refusal must explain itself');
    assert.equal(why.reason, 'autonomous-coverage-over-enforcement-denied');
  } finally { rm(root); }
});

test('a2: a sufficiency-kind plan declaring another protected lib (plan-coverage.js) grants nothing', () => {
  const root = makeRoot();
  try {
    const p = writePlan(root, 'todo', 'zz-exploit2', [PROTECTED_LIB]);
    suffApprove(root, p, 'todo');
    assert.equal(coverage.findCoveringPlan(PROTECTED_LIB, root), null);
  } finally { rm(root); }
});

// ---------------------------------------------------------------------------
// (b) DOGFOODING PRESERVED. The SAME plan, HUMAN-approved, DOES grant the hook.
// ---------------------------------------------------------------------------
test('b: a HUMAN-approved plan declaring the gate hook STILL grants access (dogfooding)', () => {
  const root = makeRoot();
  try {
    const p = writePlan(root, 'todo', 'zz-human', [GATE_HOOK]);
    humanApprove(root, p, 'todo');

    const hit = coverage.findCoveringPlan(GATE_HOOK, root);
    assert.ok(hit, 'a human-approved plan editing a hook is exactly how CTOC dogfoods this');
    assert.equal(hit.glob, GATE_HOOK);
  } finally { rm(root); }
});

// ---------------------------------------------------------------------------
// (c) ORDINARY AUTO-BUILD UNAFFECTED. A sufficiency plan over ordinary source
//     still grants coverage.
// ---------------------------------------------------------------------------
test('c: a SUFFICIENCY-kind plan over ORDINARY source (not enforcement) STILL grants coverage', () => {
  const root = makeRoot();
  try {
    const p = writePlan(root, 'todo', 'zz-ordinary', [ORDINARY]);
    suffApprove(root, p, 'todo');
    assert.ok(
      coverage.findCoveringPlan(ORDINARY, root),
      'autonomous build of ordinary code must be unaffected',
    );
  } finally { rm(root); }
});

// ---------------------------------------------------------------------------
// (d) THE BROAD VARIANT. A sufficiency `["**"]` WITH an unanchored_scope ack:
//     refused for a protected target, still granted for an ordinary one.
// ---------------------------------------------------------------------------
test('d: a SUFFICIENCY-kind files:["**"] is refused for a protected target, granted for an ordinary one', () => {
  const root = makeRoot();
  try {
    const p = writePlan(root, 'todo', 'zz-glob', ['**'], 'rooted at the repository');
    suffApprove(root, p, 'todo');

    assert.equal(
      coverage.findCoveringPlan(GATE_HOOK, root), null,
      'an autonomous globstar must never reach the gate hook',
    );
    assert.equal(
      coverage.findCoveringPlan('src/lib/approval-ledger.js', root), null,
      'nor any other protected enforcement file',
    );
    assert.ok(
      coverage.findCoveringPlan(ORDINARY, root),
      'but it still covers an ordinary file (autonomous build unaffected)',
    );
  } finally { rm(root); }
});

test('d2: a HUMAN files:["**"] with the ack STILL grants the protected hook (dogfooding, broad)', () => {
  const root = makeRoot();
  try {
    const p = writePlan(root, 'todo', 'zz-glob-human', ['**'], 'rooted at the repository');
    humanApprove(root, p, 'todo');
    assert.ok(coverage.findCoveringPlan(GATE_HOOK, root), 'documented human consent still grants the hook');
    assert.ok(coverage.findCoveringPlan(ORDINARY, root), 'and ordinary files');
  } finally { rm(root); }
});

// ---------------------------------------------------------------------------
// (e) FAIL-CLOSED, at the contract level. A protected-path write is permitted ONLY
//     when the covering plan's kind is positively human; every other kind — the
//     autonomous ones AND an unresolved/unknown/null kind — is refused. This pins
//     the fail-closed direction that (a)/(d) exercise through the oracle.
// ---------------------------------------------------------------------------
test('e: protected-paths — the enforcement surface is protected and only human kinds may cover it', () => {
  const pp = require('../src/lib/protected-paths');

  // Every protected class is recognised.
  for (const rel of [
    'src/hooks/human-gate-check.js',
    'src/hooks/PreToolUse.Edit.js',
    'src/hooks/PreToolUse.Bash.js',
    'src/lib/plan-coverage.js',
    'src/lib/approval-residency.js',
    'src/lib/approval-ledger.js',
    'src/lib/gate-order.js',
    'src/lib/continuation.js',
    'src/lib/continuation-queue.js',
    'src/lib/streaming-gate.js',
    'src/scripts/ledger-backfill.js',
  ]) {
    assert.equal(pp.isProtectedEnforcementPath(rel), true, `${rel} must be protected`);
  }

  // Ordinary source and same-prefix siblings are NOT protected.
  for (const rel of ['src/lib/foo.js', 'src/lib/plan-coverage-helper.js', 'src/hooksX/y.js', 'package.json', '']) {
    assert.equal(pp.isProtectedEnforcementPath(rel), false, `${rel} must not be protected`);
  }

  // Only positively-human kinds may cover a protected path; everything else fails closed.
  assert.equal(pp.isHumanCoverageKind('human'), true);
  assert.equal(pp.isHumanCoverageKind('backfilled'), true);
  for (const k of ['sufficiency', 'pipeline', 'unknown', null, undefined, '', 'Human']) {
    assert.equal(pp.isHumanCoverageKind(k), false, `kind ${String(k)} must not be treated as human`);
  }
});
