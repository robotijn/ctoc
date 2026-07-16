/**
 * W05-s2 — validateReviewToDone can return valid:false (finding C9).
 *
 * SIP1 slice 2 of 5 for functional plan `ctoc-audit-w05-gate3-verifies`
 * (vision `ctoc-self-audit-remediation`). This is the load-bearing slice: it
 * turns the review->done validator from a structurally-always-`true` function
 * into a gate that can actually REJECT.
 *
 * Zero-doubles constraint (project rule): every fixture is a REAL `.md` plan
 * file on disk and a REAL `.ctoc/state/verify/<slug>.json` artifact (a data
 * fixture, hand-written JSON — not a code double). No function is mocked. The
 * validator, `validateReviewToDone`, and the integration entry point,
 * `approveSubplans`, are exercised against those real files.
 *
 * Behavior asserted (not structure): the gate REJECTS an unapproved /
 * unfinished / unverified / stale plan, ACCEPTS a genuinely finished one, and
 * `approveSubplans` inherits the skip for a bad sibling with NO change to its
 * own code.
 */

'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { validateReviewToDone } = require('../src/lib/plan-validator');
const { verifyEvidencePath } = require('../src/lib/step-13-verify');
const { approveSubplans } = require('../src/lib/actions');

const NOW = Date.now();

// The nine Iron Loop execution steps (labels are mandatory / validated).
const STEPS = [
  [8, 'TEST'],
  [9, 'PREPARE'],
  [10, 'IMPLEMENT'],
  [11, 'REVIEW'],
  [12, 'OPTIMIZE'],
  [13, 'SECURE'],
  [14, 'VERIFY'],
  [15, 'DOCUMENT'],
  [16, 'FINAL-REVIEW']
];

/**
 * Render a real "## Execution Plan" section. Every step's checkbox is ticked
 * except the one named in `uncheckedStep` (null = all ticked). Step prose
 * deliberately avoids the words done/complete so completion is decided purely
 * by the checkbox state, not by an incidental completion word.
 */
function execPlan(uncheckedStep) {
  let out = '## Execution Plan\n\n';
  for (const [n, name] of STEPS) {
    const box = n === uncheckedStep ? '- [ ]' : '- [x]';
    out += `### Step ${n}: ${name}\n${box} ${name.toLowerCase()} work performed\n\n`;
  }
  return out;
}

/**
 * Write a real plan `.md` file and force its mtime to `NOW` so freshness of the
 * VERIFY artifact is decided deterministically by the artifact timestamp alone.
 */
function writePlan(dir, slug, { marker = true, uncheckedStep = null, parent = null } = {}) {
  fs.mkdirSync(dir, { recursive: true });
  const fm = ['---', 'title: "Fixture plan"', 'type: feature'];
  if (marker) fm.push('approved_by: human');
  if (parent) fm.push(`parent_plan: ${parent}`);
  fm.push('---', '');
  const body = `# Fixture plan\n\nSome descriptive prose.\n\n${execPlan(uncheckedStep)}`;
  const planPath = path.join(dir, `${slug}.md`);
  fs.writeFileSync(planPath, `${fm.join('\n')}\n${body}`);
  // Pin mtime so artifact-vs-plan staleness is controlled by the test, not by
  // filesystem write-time jitter.
  fs.utimesSync(planPath, new Date(NOW), new Date(NOW));
  return planPath;
}

/**
 * Write a real VERIFY evidence artifact JSON. `ageMs` shifts the timestamp
 * relative to the plan mtime (NOW): positive = fresher (recorded after the
 * plan), negative = stale (recorded before).
 */
function writeArtifact(root, slug, { passed, errors = [], ageMs = 60000, summary = 'fixture run' } = {}) {
  const p = verifyEvidencePath(root, slug);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const artifact = {
    planSlug: slug,
    timestamp: new Date(NOW + ageMs).toISOString(),
    passed,
    method: 'fallback-direct',
    checks: {},
    errors,
    summary
  };
  fs.writeFileSync(p, JSON.stringify(artifact, null, 2));
  return p;
}

describe('W05-s2 validateReviewToDone: the review->done gate can now REJECT', () => {
  let tempRoot;
  let fxDir;

  before(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-w05-s2-'));
    fxDir = path.join(tempRoot, 'fixtures');
  });

  after(() => {
    try {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    } catch (e) {
      // Best-effort teardown.
    }
  });

  // M1a — the body `approved_by: human` marker is NOT a Gate-3 signal. A
  // marker-free plan that is otherwise complete (all boxes ticked + fresh
  // passing VERIFY evidence) must PASS: the marker rides in from an EARLIER
  // gate (implementation->todo stamps it) and carries no Gate-3 meaning, so it
  // must never gate this transition. This is the RED-first assertion — it fails
  // against the pre-fix code, which false-blocks on the missing body marker.
  it('M1a: a marker-free but otherwise complete plan is NOT blocked (the body marker is not a Gate-3 signal)', () => {
    const slug = 'm1a-no-marker-complete';
    const planPath = writePlan(fxDir, slug, { marker: false });
    writeArtifact(tempRoot, slug, { passed: true });

    const result = validateReviewToDone(planPath, tempRoot);

    assert.strictEqual(
      result.valid,
      true,
      `a complete plan must pass regardless of the body marker, errors: ${JSON.stringify(result.errors)}`
    );
    assert.strictEqual(result.errors.length, 0, 'no blocking errors for a complete marker-free plan');
    assert.ok(
      !result.errors.some((e) => /approved_by|marker/i.test(e)),
      `no error may mention the body approval marker, got: ${JSON.stringify(result.errors)}`
    );
  });

  // M1a2 — a marker-free plan that is genuinely incomplete (no VERIFY evidence)
  // still blocks, but on the REAL quality leg (evidence), never on the marker.
  it('M1a2: a marker-free plan missing VERIFY evidence blocks on the evidence leg, not the marker', () => {
    const slug = 'm1a2-no-marker-no-evidence';
    const planPath = writePlan(fxDir, slug, { marker: false });
    // Intentionally write NO artifact.

    const result = validateReviewToDone(planPath, tempRoot);

    assert.strictEqual(result.valid, false, 'missing VERIFY evidence must block');
    assert.ok(
      result.errors.some((e) => /VERIFY evidence/i.test(e)),
      `expected a missing-evidence error, got: ${JSON.stringify(result.errors)}`
    );
    assert.ok(
      !result.errors.some((e) => /approved_by|marker/i.test(e)),
      `the block reason must be the evidence leg, not the marker, got: ${JSON.stringify(result.errors)}`
    );
  });

  // M1b — unchecked Step 14 VERIFY checkbox -> valid:false.
  it('M1b: rejects a plan with an unchecked Step 14 VERIFY checkbox', () => {
    const slug = 'm1b-unchecked-step14';
    const planPath = writePlan(fxDir, slug, { uncheckedStep: 14 });
    writeArtifact(tempRoot, slug, { passed: true });

    const result = validateReviewToDone(planPath, tempRoot);

    assert.strictEqual(result.valid, false, 'unchecked required step must block');
    assert.ok(
      result.errors.some((e) => /step\s*14/i.test(e) || /VERIFY/.test(e)),
      `expected an error naming Step 14 / VERIFY, got: ${JSON.stringify(result.errors)}`
    );
  });

  // M1c — no VERIFY evidence at all -> valid:false.
  it('M1c: rejects a plan with no recorded VERIFY evidence', () => {
    const slug = 'm1c-no-evidence';
    const planPath = writePlan(fxDir, slug, {});
    // Intentionally write NO artifact.

    const result = validateReviewToDone(planPath, tempRoot);

    assert.strictEqual(result.valid, false, 'absent VERIFY evidence must block');
    assert.ok(
      result.errors.some((e) => /VERIFY evidence/i.test(e)),
      `expected a missing-evidence error, got: ${JSON.stringify(result.errors)}`
    );
  });

  // M2 — fully compliant plan -> valid:true (guards against always-reject).
  it('M2: accepts a genuinely finished plan (marker + all boxes + fresh passing evidence)', () => {
    const slug = 'm2-compliant';
    const planPath = writePlan(fxDir, slug, {});
    writeArtifact(tempRoot, slug, { passed: true });

    const result = validateReviewToDone(planPath, tempRoot);

    assert.strictEqual(result.valid, true, `compliant plan must pass, errors: ${JSON.stringify(result.errors)}`);
    assert.strictEqual(result.errors.length, 0, 'a compliant plan has no blocking errors');
  });

  // M4 — recorded FAIL vs PASS flips the result on the VERIFY axis.
  it('M4: a recorded failing VERIFY run blocks with the specific failure; a passing run does not', () => {
    const failSlug = 'm4-fail';
    const passSlug = 'm4-pass';
    const failPlan = writePlan(fxDir, failSlug, {});
    const passPlan = writePlan(fxDir, passSlug, {});
    writeArtifact(tempRoot, failSlug, { passed: false, errors: ['Tests failed: 3 assertions'] });
    writeArtifact(tempRoot, passSlug, { passed: true });

    const failResult = validateReviewToDone(failPlan, tempRoot);
    const passResult = validateReviewToDone(passPlan, tempRoot);

    assert.strictEqual(failResult.valid, false, 'recorded failing VERIFY must block');
    assert.ok(
      failResult.errors.some((e) => /VERIFY/i.test(e) && /fail/i.test(e)),
      `expected a specific VERIFY-failure error (not generic), got: ${JSON.stringify(failResult.errors)}`
    );
    // The two fixtures differ ONLY in recorded VERIFY outcome — so the pass
    // fixture must NOT be rejected on the VERIFY axis.
    assert.strictEqual(passResult.valid, true, `identical plan with a passing run must pass, errors: ${JSON.stringify(passResult.errors)}`);
  });

  // Staleness — passing artifact older than the plan's last change -> valid:false.
  it('Staleness: rejects when VERIFY evidence predates the plan\'s last modification', () => {
    const slug = 'stale-evidence';
    const planPath = writePlan(fxDir, slug, {});
    // Passing, but recorded BEFORE the plan mtime.
    writeArtifact(tempRoot, slug, { passed: true, ageMs: -120000 });

    const result = validateReviewToDone(planPath, tempRoot);

    assert.strictEqual(result.valid, false, 'stale evidence must block');
    assert.ok(
      result.errors.some((e) => /stale/i.test(e)),
      `expected a staleness error, got: ${JSON.stringify(result.errors)}`
    );
  });
});

describe('W05-s2 approveSubplans inherits the fix (integration, no approveSubplans code change)', () => {
  let tempRoot;
  let reviewDir;

  before(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-w05-s2-int-'));
    reviewDir = path.join(tempRoot, 'plans', 'review');
  });

  after(() => {
    try {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    } catch (e) {
      // Best-effort teardown.
    }
  });

  // M3 — approveSubplans moves the compliant sibling to done and SKIPS the bad
  // one, reporting it with a reason. The bad sibling fails on a REAL quality leg
  // (no recorded VERIFY evidence) — NOT on a body marker, which is no longer a
  // Gate-3 signal.
  it('M3: approves the compliant sibling and skips the bad one with a reason', () => {
    const goodSlug = 'fixparent-s1-good';
    const badSlug = 'fixparent-s2-bad';

    // Both are review-stage siblings of parent "fixparent". Neither carries a
    // body marker — proving the batch decision rides on real quality legs, not
    // on the leftover `approved_by: human` line.
    writePlan(reviewDir, goodSlug, { marker: false, parent: 'fixparent' });
    writePlan(reviewDir, badSlug, { marker: false, parent: 'fixparent' });

    // Fresh passing evidence for the GOOD sibling only. The bad sibling has NO
    // recorded VERIFY evidence, which is the sole reason it fails.
    writeArtifact(tempRoot, goodSlug, { passed: true });
    // Intentionally write NO artifact for badSlug.

    const { approved, skipped } = approveSubplans('fixparent', 'review', tempRoot);

    assert.ok(approved.includes(goodSlug), `expected the good sibling to be approved, got approved=${JSON.stringify(approved)}`);
    assert.ok(!approved.includes(badSlug), 'the bad sibling must NOT be approved');

    const badSkip = skipped.find((s) => s.slug === badSlug);
    assert.ok(badSkip, `expected the bad sibling in skipped[], got skipped=${JSON.stringify(skipped)}`);
    assert.ok(typeof badSkip.reason === 'string' && badSkip.reason.length > 0, 'skip must carry a non-empty reason');
    assert.ok(/VERIFY evidence/i.test(badSkip.reason), `skip reason should name the missing VERIFY evidence, got: ${badSkip.reason}`);

    // Behavior on disk: good moved to done, bad stayed in review.
    assert.ok(fs.existsSync(path.join(tempRoot, 'plans', 'done', `${goodSlug}.md`)), 'good sibling should be in plans/done');
    assert.ok(fs.existsSync(path.join(reviewDir, `${badSlug}.md`)), 'bad sibling should remain in plans/review');
  });
});
