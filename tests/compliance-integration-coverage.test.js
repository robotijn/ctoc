/**
 * EC5-s3 — compliance-integration DARK-BRANCH coverage tests.
 *
 * Complements tests/compliance-integration.test.js (the LIVE happy/fail-open
 * suite). This file targets the branches that suite leaves dark, and every test
 * pins a branch that goes RED under mutation — no obvious-only line-coverage
 * theater. Nothing is mocked: the gate is the REAL shouldRun*, the Inbox is the
 * REAL src/lib/inbox.js writing/faulting on a REAL tmp filesystem, dedup/routing
 * are the REAL modules. Fakes only at the true boundary (fs) — and even there we
 * do not stub, we make the real directory un-creatable so the real writer throws.
 *
 * Dark branches pinned here (uncovered lines in the baseline were 208-210 and
 * 217-219 — the two defense-in-depth catch blocks):
 *   - the GDPR runner-throw catch (a runner fault at the fs boundary is contained,
 *     recorded in droppedFindings, and the seam never throws);
 *   - the EU-AI-Act runner-throw catch (symmetric);
 *   - cross-regime INDEPENDENCE on the throw path (one regime throwing never
 *     aborts the other's dispatch — the defense-in-depth guarantee);
 *   - splitByRoute's `.length > 0` boundary (empty-string target_file is
 *     plan-stage, therefore deduped — NOT code-stage);
 *   - splitByRoute's `typeof === 'string'` type guard (a non-string target_file
 *     is plan-stage at the seam);
 *   - the regime-GATED dispatch decision behaviourally (dispatch follows the gate,
 *     not the presence of findings — a closed regime never runs even when handed
 *     a finding; an open regime runs even when handed none).
 *
 * ADVISORY / GATE-SAFETY thread: several tests assert that neither the success
 * nor the FAILURE path mutates a plan, writes a gate/enforcement key, or lets a
 * supplied finding force a closed regime to run. A mutant that weakened a gate or
 * dispatched a compliance agent for an inactive regime goes RED here.
 */

'use strict';

const { describe, it, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const seam = require('../src/lib/compliance-integration');

const REPO_ROOT = path.join(__dirname, '..');
const REGIMES_SRC = path.join(REPO_ROOT, '.ctoc', 'regulatory-regimes');

function settingsYaml(activeProfilesLine) {
  return [
    'timezone: "UTC"',
    '',
    'regulatory_regime:',
    `  active_profiles: ${activeProfilesLine}`,
    '  overrides: {}',
    '',
    'enforcement:',
    '  mode: strict',
    '',
  ].join('\n');
}

const tmpDirs = [];

// Build a tmp project with a real .ctoc/settings.yaml AND a copy of the shipped
// regulatory-regimes/ so the REAL gates resolve gdpr.yaml + eu-ai-act-*.yaml.
// When `poisonInbox` is set, `.ctoc/inbox` is created as a FILE, so the real
// inbox writer's `mkdirSync('.ctoc/inbox/questions', {recursive:true})` throws
// ENOTDIR — the genuine fs fault that drives the runner-throw catch blocks. No
// mock: the runner really calls the real writer and the real write really fails.
function projectWith(activeProfilesLine, poisonInbox = false) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'compl-integ-cov-'));
  tmpDirs.push(dir);
  fs.mkdirSync(path.join(dir, '.ctoc', 'regulatory-regimes'), { recursive: true });
  for (const f of fs.readdirSync(REGIMES_SRC)) {
    if (f.endsWith('.yaml')) {
      fs.copyFileSync(path.join(REGIMES_SRC, f), path.join(dir, '.ctoc', 'regulatory-regimes', f));
    }
  }
  fs.writeFileSync(path.join(dir, '.ctoc', 'settings.yaml'), settingsYaml(activeProfilesLine));
  if (poisonInbox) {
    // A FILE where the inbox directory tree must go — makes the real writer throw.
    fs.writeFileSync(path.join(dir, '.ctoc', 'inbox'), 'not a directory');
  }
  return dir;
}

function questionsDir(root) {
  return path.join(root, '.ctoc', 'inbox', 'questions');
}

function listQuestionFiles(root) {
  const dir = questionsDir(root);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(f => f.endsWith('.md'));
}

after(() => tmpDirs.forEach(d => fs.rmSync(d, { recursive: true, force: true })));

// A GDPR plan-stage finding (valid gdpr_article so it survives the seam's
// pre-dispatch schema partition and reaches the runner). Shared topic key with
// the EU finding below so the two collapse under cross-regime dedup.
function gdprPlanFinding(overrides = {}) {
  return {
    gdpr_article: 'GDPR-17',
    kind: 'data-governance',
    regulation_ref: 'gdpr art. 5(1)(e)',
    confidence: 'medium',
    message: 'personal data kept longer than necessary',
    plan: 'user-data-flow',
    ...overrides,
  };
}

function euAiActPlanFinding(overrides = {}) {
  return {
    regulation: 'eu-ai-act',
    risk_class: 'high-risk',
    kind: 'data-governance',
    regulation_ref: 'eu-ai-act art. 10',
    confidence: 'medium',
    message: 'high-risk training data lacks Art.10 governance',
    plan: 'model-training',
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────
// A. GDPR runner throws at the real fs boundary ⇒ the seam's defense-in-depth
//    catch (lines 208-210) contains it, records it, and never re-throws.
// ─────────────────────────────────────────────────────────────────────

describe('runComplianceForTransition — a GDPR RUNNER fault is contained by the seam (never re-thrown)', () => {
  it('should record the GDPR runner throw in droppedFindings and NOT re-throw when the real Inbox write faults', () => {
    // Arrange — GDPR gate ON, EU gate OFF, a valid plan finding, poisoned inbox.
    const root = projectWith('[gdpr]', true);

    // Act
    let res;
    assert.doesNotThrow(() => {
      res = seam.runComplianceForTransition(root, { gdprFindings: [gdprPlanFinding()] });
    }, 'a runner fault at the fs boundary must never escape the total seam');

    // Assert — the fault is recorded, attributed to GDPR, with the runner-throw
    // reason; nothing reached the Inbox; the sibling regime was untouched.
    assert.equal(res.droppedFindings.length, 1, 'exactly the faulting dispatch is recorded');
    assert.equal(res.droppedFindings[0].regime, 'gdpr', 'attributed to the GDPR regime');
    assert.match(String(res.droppedFindings[0].reason), /runGdprFindings threw:/, 'reason names the GDPR runner throw');
    assert.deepEqual(res.inboxIds, [], 'the faulting write produced no Inbox id');
    assert.deepEqual(res.letters, [], 'no code-stage findings');
    assert.equal(res.euAiActRan, false, 'the EU-AI-Act regime was off and did not run');
  });
});

// ─────────────────────────────────────────────────────────────────────
// B. EU-AI-Act runner throws at the real fs boundary ⇒ the seam's OTHER
//    defense-in-depth catch (lines 217-219) contains it.
// ─────────────────────────────────────────────────────────────────────

describe('runComplianceForTransition — an EU-AI-Act RUNNER fault is contained by the seam (never re-thrown)', () => {
  it('should record the EU-AI-Act runner throw in droppedFindings and NOT re-throw when the real Inbox write faults', () => {
    // Arrange — EU gate ON, GDPR gate OFF, a valid plan finding, poisoned inbox.
    const root = projectWith('[eu-ai-act-high-risk]', true);

    // Act
    let res;
    assert.doesNotThrow(() => {
      res = seam.runComplianceForTransition(root, { euAiActFindings: [euAiActPlanFinding()] });
    }, 'a runner fault at the fs boundary must never escape the total seam');

    // Assert
    assert.equal(res.droppedFindings.length, 1, 'exactly the faulting dispatch is recorded');
    assert.equal(res.droppedFindings[0].regime, 'eu-ai-act', 'attributed to the EU-AI-Act regime');
    assert.match(String(res.droppedFindings[0].reason), /runEuAiActFindings threw:/, 'reason names the EU-AI-Act runner throw');
    assert.deepEqual(res.inboxIds, [], 'the faulting write produced no Inbox id');
    assert.equal(res.gdprRan, false, 'the GDPR regime was off and did not run');
  });
});

// ─────────────────────────────────────────────────────────────────────
// C. Cross-regime INDEPENDENCE on the throw path: a GDPR throw must NOT abort
//    the EU-AI-Act dispatch. Both regimes on, both faulting ⇒ BOTH recorded
//    (proving the first throw did not short-circuit the second dispatch).
// ─────────────────────────────────────────────────────────────────────

describe('runComplianceForTransition — one regime throwing never aborts the other (defense-in-depth independence)', () => {
  it('should attempt and record BOTH regime dispatches when both fault, proving the GDPR throw did not skip the EU-AI-Act dispatch', () => {
    // Arrange — both gates ON, both plan findings, poisoned inbox faults both.
    const root = projectWith('[gdpr, eu-ai-act-high-risk]', true);

    // Act
    let res;
    assert.doesNotThrow(() => {
      res = seam.runComplianceForTransition(root, {
        gdprFindings: [gdprPlanFinding({ kind: 'lawful-basis', regulation_ref: 'gdpr art. 6' })],
        euAiActFindings: [euAiActPlanFinding({ kind: 'risk-management', regulation_ref: 'eu-ai-act art. 9' })],
      });
    }, 'neither runner fault escapes the seam');

    // Assert — two independent drops; the EU dispatch ran despite the GDPR throw.
    assert.equal(res.droppedFindings.length, 2, 'both faulting dispatches recorded — neither aborted the other');
    const regimes = res.droppedFindings.map(d => d.regime).sort();
    assert.deepEqual(regimes, ['eu-ai-act', 'gdpr'], 'both regimes attempted and recorded independently');
    assert.deepEqual(res.inboxIds, [], 'no Inbox ids — both writes faulted');
  });
});

// ─────────────────────────────────────────────────────────────────────
// D. splitByRoute `.length > 0` BOUNDARY: an empty-string target_file is
//    plan-stage (eligible for cross-regime dedup), NOT code-stage. Two
//    overlapping findings both carrying target_file:'' collapse to ONE Inbox
//    write. Under `.length >= 0` they would mis-route to code-stage, skip dedup,
//    and produce TWO writes.
// ─────────────────────────────────────────────────────────────────────

describe('runComplianceForTransition — empty-string target_file is plan-stage (dedup boundary)', () => {
  it('should cross-dedup two overlapping findings carrying an empty-string target_file into ONE Inbox write', () => {
    // Arrange — both regimes on; overlapping topic; both target_file === ''.
    const root = projectWith('[gdpr, eu-ai-act-high-risk]');

    // Act
    const res = seam.runComplianceForTransition(root, {
      gdprFindings: [gdprPlanFinding({ target_file: '' })],
      euAiActFindings: [euAiActPlanFinding({ target_file: '' })],
    });

    // Assert — empty-string target_file behaves as plan-stage: deduped to one.
    assert.equal(res.deduped, 1, 'the two empty-target findings were treated as plan-stage and merged');
    assert.equal(res.inboxIds.length, 1, 'exactly ONE Inbox id — the merged survivor');
    assert.equal(listQuestionFiles(root).length, 1, 'exactly ONE question file on disk (not two)');
    assert.deepEqual(res.letters, [], 'an empty-string target_file is NOT the letter/code path');
  });
});

// ─────────────────────────────────────────────────────────────────────
// E. splitByRoute `typeof === 'string'` TYPE GUARD: a non-string target_file is
//    plan-stage at the seam (so it is deduped). Two overlapping findings both
//    with a numeric target_file collapse to ONE survivor; the runner's own
//    truthiness route then sends that survivor to letters[]. Under a mutant that
//    dropped the typeof guard, both would be code-stage, skip dedup, and yield
//    TWO letters.
// ─────────────────────────────────────────────────────────────────────

describe('runComplianceForTransition — non-string target_file is plan-stage at the seam (type guard)', () => {
  it('should cross-dedup two overlapping findings with a numeric target_file into ONE survivor', () => {
    // Arrange — both regimes on; overlapping topic; numeric (non-string) target_file.
    const root = projectWith('[gdpr, eu-ai-act-high-risk]');

    // Act
    const res = seam.runComplianceForTransition(root, {
      gdprFindings: [gdprPlanFinding({ target_file: 123 })],
      euAiActFindings: [euAiActPlanFinding({ target_file: 456 })],
    });

    // Assert — deduped as plan-stage; the lone survivor then takes the runner's
    // truthiness letter route (numeric target_file is truthy), so exactly one
    // letter and no Inbox write.
    assert.equal(res.deduped, 1, 'the two numeric-target findings were treated as plan-stage and merged');
    assert.equal(res.letters.length, 1, 'the single merged survivor routes to letters[] (not two)');
    assert.deepEqual(res.inboxIds, [], 'no Inbox write for the merged numeric-target survivor');
    assert.deepEqual(listQuestionFiles(root), [], 'no question file on disk');
  });
});

// ─────────────────────────────────────────────────────────────────────
// F. Regime-GATED dispatch decision (advisory / gate-safety): dispatch follows
//    the GATE, never the presence of findings. GDPR on with ZERO gdpr findings
//    still dispatches (gdprRan:true, no writes); EU off with a supplied finding
//    NEVER dispatches (euAiActRan:false, the finding is never emitted).
// ─────────────────────────────────────────────────────────────────────

describe('runComplianceForTransition — dispatch is gated by the regime, not by findings presence', () => {
  it('should run the active regime even with no findings and NEVER run an inactive regime even when handed one', () => {
    // Arrange — GDPR active, EU inactive; supply ONLY an EU finding, no GDPR ones.
    const root = projectWith('[gdpr]');

    // Act
    const res = seam.runComplianceForTransition(root, { euAiActFindings: [euAiActPlanFinding()] });

    // Assert — the active regime dispatched despite zero findings; the inactive
    // regime did NOT dispatch despite a supplied finding; that finding never
    // reached disk (a closed gate cannot be forced open by a finding).
    assert.equal(res.gdprRan, true, 'the active GDPR regime dispatched even with no GDPR findings');
    assert.equal(res.euAiActRan, false, 'the inactive EU-AI-Act regime did NOT dispatch despite a supplied finding');
    assert.deepEqual(res.inboxIds, [], 'no Inbox id — no active-regime finding and the inactive finding is dropped');
    assert.deepEqual(listQuestionFiles(root), [], 'the inactive regime never emitted its finding to disk');
    assert.deepEqual(res.droppedFindings, [], 'clean path — nothing recorded as dropped');
  });
});
