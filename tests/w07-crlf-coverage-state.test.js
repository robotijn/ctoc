/**
 * W07-s2 — CRLF fix: enforcement hot path (plan-coverage + state)
 *
 * Finding H1: a plan checked out on Windows (CRLF line endings) must parse
 * byte-identically to its LF twin. The two parsers on the enforcement hot path
 * are `state.parseMetadata()` (feeds plan-validator → every gate check) and
 * `plan-coverage.readPlanFiles()` / `findCoveringPlan()` (the PreToolUse hook's
 * coverage resolver). Before the fix both used the LF-only `/^---\n/` pattern,
 * so a CRLF plan silently resolved to EMPTY metadata / EMPTY coverage — locking
 * the Windows user out of editing their own declared files.
 *
 * These are BEHAVIOR tests: CRLF/LF twins must produce identical results, and
 * the results must be NON-EMPTY (an empty parse is exactly the lockout bug).
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { parseMetadata } = require('../src/lib/state');
const { readPlanFiles, findCoveringPlan } = require('../src/lib/plan-coverage');
const { validateForReview } = require('../src/lib/plan-validator');

// A realistic plan with a title, priority, gate-relevant fields, and a files: block.
const LF_PLAN = [
  '---',
  'title: "CRLF twin plan"',
  'type: feature',
  'priority: MEDIUM',
  'approved_by: human',
  'iron_loop: true',
  'revision: 2',
  'files:',
  '  - "src/foo.js"',
  '  - "tests/foo.test.js"',
  '---',
  '',
  '# CRLF twin plan',
  '',
  'Body text.',
  '',
].join('\n');

const CRLF_PLAN = LF_PLAN.replace(/\n/g, '\r\n');

function mkPlan(dir, slug, content) {
  const stageDir = path.join(dir, 'plans', 'todo');
  fs.mkdirSync(stageDir, { recursive: true });
  const p = path.join(stageDir, `${slug}.md`);
  fs.writeFileSync(p, content, 'utf8');
  return p;
}

test('parseMetadata: CRLF twin equals LF twin and is non-empty', () => {
  const lf = parseMetadata(LF_PLAN);
  const crlf = parseMetadata(CRLF_PLAN);

  assert.ok(Object.keys(lf).length > 0, 'LF metadata must be non-empty (sanity)');
  assert.deepStrictEqual(crlf, lf, 'CRLF metadata must byte-match LF metadata');
  // Explicit lockout guard: the gate-relevant fields must survive CRLF.
  assert.strictEqual(crlf.title, 'CRLF twin plan');
  assert.strictEqual(crlf.approved_by, 'human');
  assert.strictEqual(crlf.iron_loop, true);
  assert.strictEqual(crlf.revision, 2);
});

test('readPlanFiles: CRLF twin equals LF twin and is non-empty (the lockout scenario)', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'w07-rpf-'));
  try {
    const lfPath = mkPlan(root, 'lf-plan', LF_PLAN);
    const crlfPath = mkPlan(root, 'crlf-plan', CRLF_PLAN);

    const lf = readPlanFiles(lfPath);
    const crlf = readPlanFiles(crlfPath);

    assert.deepStrictEqual(lf, ['src/foo.js', 'tests/foo.test.js'], 'LF files resolve (sanity)');
    assert.deepStrictEqual(crlf, lf, 'CRLF files must byte-match LF files');
    assert.ok(crlf.length > 0, 'CRLF coverage must NOT resolve to empty (the lockout)');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('findCoveringPlan: declared file resolves as COVERED under CRLF via the hook entry point', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'w07-cov-'));
  try {
    // Only the CRLF plan is present, so a match proves CRLF coverage resolves.
    mkPlan(root, 'crlf-only', CRLF_PLAN);

    const covered = findCoveringPlan('src/foo.js', root);
    assert.ok(covered, 'declared file must be COVERED (not treated as uncovered) under CRLF');
    assert.strictEqual(covered.stage, 'todo');
    assert.strictEqual(covered.glob, 'src/foo.js');

    const uncovered = findCoveringPlan('src/not-declared.js', root);
    assert.strictEqual(uncovered, null, 'a non-declared file stays uncovered (no widening)');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('gate propagation: validateForReview inherits the CRLF fix (same verdict on both twins)', () => {
  // plan-validator.js imports parseMetadata from state.js, so the same function
  // object drives every gate check. Prove the propagation end-to-end: the review
  // gate must render an identical verdict for a CRLF plan and its LF twin.
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'w07-gate-'));
  try {
    const lfPath = mkPlan(root, 'lf-gate', LF_PLAN);
    const crlfPath = mkPlan(root, 'crlf-gate', CRLF_PLAN);

    const lfResult = validateForReview(lfPath, root);
    const crlfResult = validateForReview(crlfPath, root);

    assert.strictEqual(crlfResult.valid, lfResult.valid, 'same valid verdict across line endings');
    assert.deepStrictEqual(crlfResult.errors, lfResult.errors, 'same errors across line endings');

    // And the metadata that feeds the gate must itself be CRLF-safe and non-empty.
    const crlfMeta = parseMetadata(fs.readFileSync(crlfPath, 'utf8'));
    assert.strictEqual(crlfMeta.approved_by, 'human', 'gate-relevant field survives CRLF');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
