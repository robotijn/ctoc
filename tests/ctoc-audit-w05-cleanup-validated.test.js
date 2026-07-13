'use strict';

/**
 * W05-s3 — Route cleanupStaleInProgress through validateForReview (finding C9).
 *
 * Behavior tests, ZERO doubles: real temp `plans/in-progress/` fixtures, real
 * `.ctoc/logs/cleanup.json`, `validateForReview` runs for real against fixture
 * content, `cleanupStaleInProgress` is the actual exported function. Nothing is
 * mocked.
 *
 * The defect under repair: `cleanupStaleInProgress` moves EVERY orphaned
 * in-progress plan to `review` unconditionally, with no `validateForReview`
 * gate — so a plan that could never pass review is smuggled to the Gate-3
 * doorstep. After the fix, an invalid plan is left in `in-progress`, the skip is
 * recorded (return value + cleanup.json) with the validation reason, and a valid
 * plan still moves.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { cleanupStaleInProgress } = require('../src/lib/actions');
const { validateForReview } = require('../src/lib/plan-validator');

// ── Fixture plan bodies ──────────────────────────────────────────────────────

// A plan whose Execution Plan has EVERY required Iron-Loop step present and
// completed → passes validateForReview.
function validPlanBody(title, declaredFile) {
  return [
    '---',
    `title: "${title}"`,
    'type: feature',
    'files:',
    `  - ${declaredFile}`,
    '---',
    '',
    `# ${title}`,
    '',
    'A genuinely finished slice.',
    '',
    '## Execution Plan',
    '',
    '### Step 8: TEST',
    '- [x] Wrote tests',
    '',
    '### Step 9: PREPARE',
    '- [x] Prepared environment',
    '',
    '### Step 10: IMPLEMENT',
    '- [x] Implemented the feature',
    '',
    '### Step 11: REVIEW',
    '- [x] Self-reviewed',
    '',
    '### Step 12: OPTIMIZE',
    '- [x] Optimized',
    '',
    '### Step 13: SECURE',
    '- [x] Secured inputs',
    '',
    '### Step 14: VERIFY',
    '- [x] All tests pass, coverage >= 80%',
    '',
    '### Step 15: DOCUMENT',
    '- [x] Documented',
    '',
    '### Step 16: FINAL-REVIEW',
    '- [x] Ready for review',
    ''
  ].join('\n');
}

// A plan whose Execution Plan OMITS the required Step 14 VERIFY entirely →
// validateForReview returns valid:false ("Step 14 (VERIFY) is required but not
// addressed").
function invalidPlanBody(title, declaredFile) {
  return [
    '---',
    `title: "${title}"`,
    'type: feature',
    'files:',
    `  - ${declaredFile}`,
    '---',
    '',
    `# ${title}`,
    '',
    'A slice that never finished verification.',
    '',
    '## Execution Plan',
    '',
    '### Step 8: TEST',
    '- [x] Wrote tests',
    '',
    '### Step 9: PREPARE',
    '- [x] Prepared environment',
    '',
    '### Step 10: IMPLEMENT',
    '- [x] Implemented the feature',
    '',
    '### Step 11: REVIEW',
    '- [x] Self-reviewed',
    '',
    '### Step 13: SECURE',
    '- [x] Secured inputs',
    '',
    '### Step 16: FINAL-REVIEW',
    '- [x] Ready for review',
    ''
  ].join('\n');
}

// ── Temp project harness ─────────────────────────────────────────────────────

function makeProject() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'w05s3-'));
  const inProgress = path.join(root, 'plans', 'in-progress');
  fs.mkdirSync(inProgress, { recursive: true });
  return { root, inProgress };
}

function writePlan(dir, name, body) {
  const p = path.join(dir, `${name}.md`);
  fs.writeFileSync(p, body);
  return p;
}

function cleanup(root) {
  fs.rmSync(root, { recursive: true, force: true });
}

function reviewPath(root, name) {
  return path.join(root, 'plans', 'review', `${name}.md`);
}

function inProgressPath(root, name) {
  return path.join(root, 'plans', 'in-progress', `${name}.md`);
}

function readCleanupLog(root) {
  const logFile = path.join(root, '.ctoc', 'logs', 'cleanup.json');
  if (!fs.existsSync(logFile)) return [];
  return JSON.parse(fs.readFileSync(logFile, 'utf8'));
}

// ── Fixture-anchoring guard (prevents a false test) ──────────────────────────

test('fixtures: validateForReview actually classifies the fixtures as intended', () => {
  const { root, inProgress } = makeProject();
  try {
    const okPath = writePlan(inProgress, 'ok', validPlanBody('OK', 'src/lib/a.js'));
    const badPath = writePlan(inProgress, 'bad', invalidPlanBody('Bad', 'src/lib/b.js'));
    assert.equal(validateForReview(okPath, root).valid, true, 'valid fixture must pass validateForReview');
    const badResult = validateForReview(badPath, root);
    assert.equal(badResult.valid, false, 'invalid fixture must fail validateForReview');
    assert.ok(badResult.errors.length > 0, 'invalid fixture must carry a non-empty errors[]');
  } finally {
    cleanup(root);
  }
});

// ── M5: invalid stale plan is NOT moved ──────────────────────────────────────

test('M5 — an invalid stale plan is NOT moved into review and stays in in-progress', () => {
  const { root, inProgress } = makeProject();
  try {
    writePlan(inProgress, 'bad', invalidPlanBody('Bad', 'src/lib/b.js'));

    cleanupStaleInProgress(root);

    assert.equal(fs.existsSync(reviewPath(root, 'bad')), false,
      'invalid plan must NOT be present in plans/review/');
    assert.equal(fs.existsSync(inProgressPath(root, 'bad')), true,
      'invalid plan must remain in plans/in-progress/');
  } finally {
    cleanup(root);
  }
});

// ── M5: the skip is observable and reasoned ──────────────────────────────────

test('M5 — the skip is observable in the return value and in cleanup.json with a reason', () => {
  const { root, inProgress } = makeProject();
  try {
    writePlan(inProgress, 'bad', invalidPlanBody('Bad', 'src/lib/b.js'));

    const result = cleanupStaleInProgress(root);

    // Return value observability
    assert.ok(Array.isArray(result.skipped), 'result.skipped must be an array');
    const skippedEntry = result.skipped.find((s) => s.name === 'bad');
    assert.ok(skippedEntry, 'skipped[] must contain the invalid plan');
    assert.ok(typeof skippedEntry.reason === 'string' && skippedEntry.reason.length > 0,
      'the skip must carry a non-empty reason');

    // Log observability
    const log = readCleanupLog(root);
    const skipLog = log.find((e) => e.plan === 'bad' && e.action === 'skipped');
    assert.ok(skipLog, "cleanup.json must record an action:'skipped' entry for the invalid plan");
    assert.ok(typeof skipLog.reason === 'string' && skipLog.reason.length > 0,
      'the cleanup.json skip entry must carry a non-empty reason');
    assert.notEqual(skipLog.to, 'review',
      'a skipped plan must not be logged as relocated to review');
  } finally {
    cleanup(root);
  }
});

// ── Valid stale plan IS still moved (no over-rejection) ───────────────────────

test('a valid stale plan IS still moved to review and reported in cleanedUp[]', () => {
  const { root, inProgress } = makeProject();
  try {
    writePlan(inProgress, 'ok', validPlanBody('OK', 'src/lib/a.js'));

    const result = cleanupStaleInProgress(root);

    assert.equal(fs.existsSync(reviewPath(root, 'ok')), true,
      'valid plan must be moved into plans/review/');
    assert.equal(fs.existsSync(inProgressPath(root, 'ok')), false,
      'valid plan must no longer be in plans/in-progress/');
    assert.ok(Array.isArray(result.cleanedUp), 'result.cleanedUp must be an array');
    assert.ok(result.cleanedUp.includes('ok'), 'the moved plan must appear in cleanedUp[]');
  } finally {
    cleanup(root);
  }
});

// ── One invalid plan does not abort the batch ─────────────────────────────────

test('one invalid plan does not abort the batch: the valid one still moves, the invalid one is skipped', () => {
  const { root, inProgress } = makeProject();
  try {
    writePlan(inProgress, 'ok', validPlanBody('OK', 'src/lib/a.js'));
    writePlan(inProgress, 'bad', invalidPlanBody('Bad', 'src/lib/b.js'));

    const result = cleanupStaleInProgress(root);

    // Valid one moved
    assert.equal(fs.existsSync(reviewPath(root, 'ok')), true, 'valid plan must be moved');
    assert.ok(result.cleanedUp.includes('ok'), 'valid plan must be in cleanedUp[]');

    // Invalid one skipped and left in place
    assert.equal(fs.existsSync(reviewPath(root, 'bad')), false, 'invalid plan must NOT be moved');
    assert.equal(fs.existsSync(inProgressPath(root, 'bad')), true, 'invalid plan must stay in in-progress');
    assert.ok(result.skipped.some((s) => s.name === 'bad'), 'invalid plan must be in skipped[]');
  } finally {
    cleanup(root);
  }
});
