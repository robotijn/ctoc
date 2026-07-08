/**
 * EC5-s3 — compliance-integration LIVE seam tests.
 *
 * This is the functional→implementation orchestration seam that runs BOTH regime
 * runners (GDPR from EC2, EU-AI-Act from EC5-s1), cross-dedups their plan-stage
 * findings via EC5-s2's `deduplicateFindings`, and guarantees a SINGLE Inbox write
 * per merged cross-regime finding — no double-write.
 *
 * The test drives the REAL flow end-to-end. Nothing is mocked:
 *   - the gate is the REAL `shouldRunGdpr` / `shouldRunEuAiAct` reading a REAL tmp
 *     `.ctoc/settings.yaml` (+ a copy of the shipped regulatory-regimes/ so
 *     loadActiveProfiles resolves gdpr.yaml and eu-ai-act-high-risk.yaml);
 *   - the Inbox is the REAL `src/lib/inbox.js` — assertions read the created
 *     question file(s) back from `.ctoc/inbox/questions/` on disk;
 *   - dedup / routing / normalization are the REAL EC5-s2 + helper modules.
 *
 * Proves (the load-bearing claims):
 *   - GDPR-only / EU-AI-Act-only: each regime runs independently and Inbox'es its
 *     own plan-stage finding;
 *   - BOTH active with an OVERLAPPING (kind, regulation_ref) finding ⇒ the Inbox
 *     gets the DEDUPED count (ONE file on disk, not the sum of two) — proving no
 *     double-write;
 *   - non-overlapping findings both attach (two files);
 *   - code-stage findings are NEVER cross-deduped — they take the letter path and
 *     never touch the Inbox;
 *   - empty active_profiles ⇒ provable no-op (no Inbox write, plan file bytes
 *     unchanged);
 *   - ADVISORY — a critical finding NEVER moves a plan across any stage;
 *   - fail-open on bad input (non-string root, missing opts);
 *   - GATE INVARIANT — HUMAN_GATES topology unchanged and this module names no
 *     gate/enforcement key and never requires the gate-crossing path.
 */

const { describe, it, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const seam = require('../src/lib/compliance-integration');

const REPO_ROOT = path.join(__dirname, '..');
const REGIMES_SRC = path.join(REPO_ROOT, '.ctoc', 'regulatory-regimes');
const MODULE_SRC_PATH = path.join(REPO_ROOT, 'src', 'lib', 'compliance-integration.js');
const GATE_HOOK_PATH = path.join(REPO_ROOT, 'src', 'hooks', 'human-gate-check.js');

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
// regulatory-regimes/ dir so the REAL gates resolve gdpr.yaml + eu-ai-act.yaml.
function projectWith(activeProfilesLine) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'compl-integ-'));
  tmpDirs.push(dir);
  fs.mkdirSync(path.join(dir, '.ctoc', 'regulatory-regimes'), { recursive: true });
  for (const f of fs.readdirSync(REGIMES_SRC)) {
    if (f.endsWith('.yaml')) {
      fs.copyFileSync(path.join(REGIMES_SRC, f), path.join(dir, '.ctoc', 'regulatory-regimes', f));
    }
  }
  fs.writeFileSync(path.join(dir, '.ctoc', 'settings.yaml'), settingsYaml(activeProfilesLine));
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

function readAllQuestionBodies(root) {
  return listQuestionFiles(root).map(f => fs.readFileSync(path.join(questionsDir(root), f), 'utf8'));
}

after(() => tmpDirs.forEach(d => fs.rmSync(d, { recursive: true, force: true })));

// A GDPR plan-stage finding (no target_file ⇒ routes to Inbox).
function gdprPlanFinding(overrides = {}) {
  return {
    // gdpr_article MUST be a VALID_GDPR_ARTICLES code (the GDPR runner validates
    // it before any emission). GDPR-17 = erasure/retention. `regulation_ref` is
    // the (independent) dedup topic key.
    gdpr_article: 'GDPR-17',
    kind: 'data-retention',
    regulation_ref: 'gdpr art. 5(1)(e)',
    confidence: 'medium',
    message: 'personal data kept longer than necessary',
    plan: 'user-data-flow',
    ...overrides,
  };
}

// An EU-AI-Act plan-stage finding (no target_file ⇒ routes to Inbox).
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
// 1. GDPR only
// ─────────────────────────────────────────────────────────────────────

describe('runComplianceForTransition — one regime active', () => {
  it('1. GDPR only ⇒ gdprRan:true, euAiActRan:false, one Inbox id, deduped:0, one file on disk', () => {
    const root = projectWith('[gdpr]');
    const res = seam.runComplianceForTransition(root, {
      gdprFindings: [gdprPlanFinding()],
      euAiActFindings: [euAiActPlanFinding()], // profile OFF ⇒ contributes nothing
    });
    assert.equal(res.gdprRan, true);
    assert.equal(res.euAiActRan, false);
    assert.equal(res.inboxIds.length, 1, 'one Inbox id created');
    assert.equal(res.deduped, 0, 'no cross-regime dedup when only one regime ran');
    assert.deepEqual(res.letters, [], 'no code-stage findings');
    assert.equal(listQuestionFiles(root).length, 1, 'exactly one question file on disk');
    const body = readAllQuestionBodies(root)[0];
    assert.match(body, /personal data kept longer than necessary/, 'GDPR finding message present');
    assert.match(body, /source_step:\s*compliance-gdpr/, 'routed through the GDPR runner');
  });

  it('2. EU AI Act only ⇒ euAiActRan:true, gdprRan:false, one Inbox id, the EU finding attached', () => {
    const root = projectWith('[eu-ai-act-high-risk]');
    const res = seam.runComplianceForTransition(root, {
      gdprFindings: [gdprPlanFinding()], // profile OFF ⇒ contributes nothing
      euAiActFindings: [euAiActPlanFinding()],
    });
    assert.equal(res.gdprRan, false);
    assert.equal(res.euAiActRan, true);
    assert.equal(res.inboxIds.length, 1, 'one Inbox id created');
    assert.equal(res.deduped, 0);
    assert.equal(listQuestionFiles(root).length, 1, 'exactly one question file on disk');
    const body = readAllQuestionBodies(root)[0];
    assert.match(body, /high-risk training data lacks Art\.10 governance/, 'EU AI Act finding present');
    assert.match(body, /source_step:\s*compliance-eu-ai-act/, 'routed through the EU-AI-Act runner');
  });
});

// ─────────────────────────────────────────────────────────────────────
// 3. Both active — cross-regime overlap deduped, written ONCE (single-write)
// ─────────────────────────────────────────────────────────────────────

describe('runComplianceForTransition — both regimes, cross-regime dedup', () => {
  it('3. overlapping (kind, regulation_ref) ⇒ deduped:1, ONE file on disk (NOT two), survivor critical + names both regs', () => {
    const root = projectWith('[gdpr, eu-ai-act-high-risk]');
    // GDPR Art.5(1)(e) data-minimization ↔ EU AI Act Art.10 data-governance both
    // normalize (via the s2 REGULATION_TOPIC_TABLE) to topic 'data-governance'
    // and share kind 'data-governance' ⇒ collapse to a single survivor.
    const res = seam.runComplianceForTransition(root, {
      gdprFindings: [gdprPlanFinding({ kind: 'data-governance', regulation_ref: 'gdpr art. 5(1)(e)' })],
      euAiActFindings: [euAiActPlanFinding({ kind: 'data-governance', regulation_ref: 'eu-ai-act art. 10' })],
    });
    assert.equal(res.gdprRan, true);
    assert.equal(res.euAiActRan, true);
    assert.equal(res.deduped, 1, 'exactly one cross-regime duplicate collapsed');
    // THE load-bearing single-write proof: 2 findings in, 1 file on disk (not 2).
    assert.equal(res.inboxIds.length, 1, 'exactly ONE Inbox id — no double-write');
    const files = listQuestionFiles(root);
    assert.equal(files.length, 1, 'exactly ONE question file on disk — proves single deduped write, not the sum');
    const body = fs.readFileSync(path.join(questionsDir(root), files[0]), 'utf8');
    assert.match(body, /severity:\s*critical/, 'merged survivor severity is critical');
    // The merged message names BOTH regulation sources (s2 mergedMessage).
    assert.match(body, /gdpr art\. 5\(1\)\(e\)/i, 'names the GDPR reference');
    assert.match(body, /eu-ai-act art\. 10/i, 'names the EU-AI-Act reference');
  });

  it('4. non-overlapping findings both attach ⇒ deduped:0, two files on disk', () => {
    const root = projectWith('[gdpr, eu-ai-act-high-risk]');
    const res = seam.runComplianceForTransition(root, {
      gdprFindings: [gdprPlanFinding({ kind: 'lawful-basis', regulation_ref: 'gdpr art. 6' })],
      euAiActFindings: [euAiActPlanFinding({ kind: 'risk-management', regulation_ref: 'eu-ai-act art. 9' })],
    });
    assert.equal(res.deduped, 0, 'distinct keys do not merge');
    assert.equal(res.inboxIds.length, 2, 'both findings Inbox\'d');
    assert.equal(listQuestionFiles(root).length, 2, 'two question files on disk');
  });
});

// ─────────────────────────────────────────────────────────────────────
// 5. Code-stage findings are NEVER cross-deduped (letter path, no Inbox)
// ─────────────────────────────────────────────────────────────────────

describe('runComplianceForTransition — code-stage findings take the letter path', () => {
  it('5. two code-stage findings (both target_file) with the same key ⇒ both in letters[], NO Inbox write', () => {
    const root = projectWith('[gdpr, eu-ai-act-high-risk]');
    const res = seam.runComplianceForTransition(root, {
      gdprFindings: [gdprPlanFinding({ kind: 'data-governance', regulation_ref: 'gdpr art. 5(1)(e)', target_file: 'src/store.ts', target_line: 10 })],
      euAiActFindings: [euAiActPlanFinding({ kind: 'data-governance', regulation_ref: 'eu-ai-act art. 10', target_file: 'src/train.ts', target_line: 20 })],
    });
    assert.equal(res.gdprRan, true);
    assert.equal(res.euAiActRan, true);
    assert.equal(res.deduped, 0, 'code-stage findings are never cross-deduped');
    assert.equal(res.letters.length, 2, 'both code-stage findings returned in letters[] (not merged)');
    assert.deepEqual(res.inboxIds, [], 'no Inbox ids for code-stage findings');
    assert.deepEqual(listQuestionFiles(root), [], 'no question file on disk for letter findings');
    const files = res.letters.map(l => l.target_file).sort();
    assert.deepEqual(files, ['src/store.ts', 'src/train.ts'], 'both code coordinates preserved distinctly');
  });
});

// ─────────────────────────────────────────────────────────────────────
// 6. Empty active_profiles ⇒ provable no-op (no Inbox write, plan bytes unchanged)
// ─────────────────────────────────────────────────────────────────────

describe('runComplianceForTransition — empty profiles is a provable no-op', () => {
  it('6. active_profiles:[] ⇒ empty summary, NO question file, and a plan file is byte-for-byte unchanged', () => {
    const root = projectWith('[]');
    // Seed a plan file in the tmp project; capture its bytes before/after.
    const planDir = path.join(root, 'plans', 'implementation');
    fs.mkdirSync(planDir, { recursive: true });
    const planPath = path.join(planDir, 'sample-plan.md');
    const planBytesBefore = Buffer.from('---\napproved_by: human\n---\n# Sample plan\nbody\n');
    fs.writeFileSync(planPath, planBytesBefore);

    const res = seam.runComplianceForTransition(root, {
      gdprFindings: [gdprPlanFinding()],
      euAiActFindings: [euAiActPlanFinding()],
    });
    assert.deepEqual(res, {
      gdprRan: false, euAiActRan: false, inboxIds: [], letters: [], deduped: 0, droppedFindings: [],
    });
    assert.deepEqual(listQuestionFiles(root), [], 'no question file written when both gates are off');
    const planBytesAfter = fs.readFileSync(planPath);
    assert.ok(planBytesBefore.equals(planBytesAfter), 'the plan file is byte-for-byte unchanged (no-op)');
  });
});

// ─────────────────────────────────────────────────────────────────────
// 7. ADVISORY — a critical finding NEVER moves a plan across a stage
// ─────────────────────────────────────────────────────────────────────

describe('runComplianceForTransition — advisory (no auto-revert / auto-advance)', () => {
  it('7. a critical GDPR finding does NOT move the plan out of plans/implementation/', () => {
    const root = projectWith('[gdpr]');
    // A plan sitting in implementation/. The seam must leave it exactly where it is.
    const implDir = path.join(root, 'plans', 'implementation');
    const funcDir = path.join(root, 'plans', 'functional');
    const todoDir = path.join(root, 'plans', 'todo');
    fs.mkdirSync(implDir, { recursive: true });
    fs.mkdirSync(funcDir, { recursive: true });
    fs.mkdirSync(todoDir, { recursive: true });
    const planPath = path.join(implDir, 'critical-plan.md');
    const before = '---\nstage: implementation\napproved_by: human\n---\n# Critical plan\n';
    fs.writeFileSync(planPath, before);

    seam.runComplianceForTransition(root, {
      gdprFindings: [gdprPlanFinding({ severity: 'critical', message: 'critical retention gap' })],
    });

    // Advisory proof: still in implementation/, not moved to functional/ or todo/.
    assert.ok(fs.existsSync(planPath), 'plan still in plans/implementation/');
    assert.deepEqual(fs.readdirSync(funcDir), [], 'nothing moved into plans/functional/');
    assert.deepEqual(fs.readdirSync(todoDir), [], 'nothing moved into plans/todo/');
    assert.equal(fs.readFileSync(planPath, 'utf8'), before, 'plan frontmatter/stage/approval marker unchanged');
  });
});

// ─────────────────────────────────────────────────────────────────────
// 8. Fail-open on bad input
// ─────────────────────────────────────────────────────────────────────

describe('runComplianceForTransition — fail-open on bad input', () => {
  it('8. non-string root ⇒ both gates resolve false ⇒ empty summary, no throw', () => {
    let res;
    assert.doesNotThrow(() => {
      res = seam.runComplianceForTransition(undefined, {
        gdprFindings: [gdprPlanFinding()],
        euAiActFindings: [euAiActPlanFinding()],
      });
    });
    assert.deepEqual(res, {
      gdprRan: false, euAiActRan: false, inboxIds: [], letters: [], deduped: 0, droppedFindings: [],
    });
  });

  it('8b. missing opts ⇒ no throw, empty findings (gates resolve; no writes)', () => {
    const root = projectWith('[gdpr, eu-ai-act-high-risk]');
    let res;
    assert.doesNotThrow(() => { res = seam.runComplianceForTransition(root); });
    assert.equal(res.gdprRan, true);
    assert.equal(res.euAiActRan, true);
    assert.deepEqual(res.inboxIds, []);
    assert.deepEqual(res.letters, []);
    assert.equal(res.deduped, 0);
    assert.deepEqual(listQuestionFiles(root), [], 'no findings supplied ⇒ nothing written');
  });

  it('8c. non-array findings fields ⇒ coerced to [], no throw', () => {
    const root = projectWith('[gdpr, eu-ai-act-high-risk]');
    let res;
    assert.doesNotThrow(() => {
      res = seam.runComplianceForTransition(root, {
        gdprFindings: /** @type {any} */ (null),
        euAiActFindings: /** @type {any} */ ('not-an-array'),
      });
    });
    assert.deepEqual(res.inboxIds, []);
    assert.deepEqual(res.letters, []);
    assert.equal(res.deduped, 0);
  });
});

// ─────────────────────────────────────────────────────────────────────
// 9. GATE INVARIANT (load-bearing) — seam touches no human gate
// ─────────────────────────────────────────────────────────────────────

describe('runComplianceForTransition — gate invariant (no human gate added/weakened)', () => {
  const gateHookSrc = fs.readFileSync(GATE_HOOK_PATH, 'utf8');
  const moduleSrc = fs.readFileSync(MODULE_SRC_PATH, 'utf8');

  it('9a. HUMAN_GATES still has exactly the 3 destination keys (4-gate topology intact)', () => {
    const m = /const HUMAN_GATES\s*=\s*\{([\s\S]*?)\};/.exec(gateHookSrc);
    assert.ok(m, 'HUMAN_GATES object literal present in the hook');
    const keys = [...m[1].matchAll(/'([a-z-]+)'\s*:/g)].map(k => k[1]);
    assert.deepEqual(keys.sort(), ['done', 'implementation', 'todo'], 'exactly the three gate destinations');
  });

  it('9b. the seam source names NO gate/enforcement key and never requires the gate-crossing path', () => {
    assert.doesNotMatch(moduleSrc, /HUMAN_GATES/, 'seam names no HUMAN_GATES');
    assert.doesNotMatch(moduleSrc, /requireReviewGate/, 'seam names no requireReviewGate');
    assert.doesNotMatch(moduleSrc, /enforcementMode/, 'seam names no enforcementMode');
    assert.doesNotMatch(moduleSrc, /review_gate/, 'seam names no review_gate');
    assert.doesNotMatch(moduleSrc, /require\(['"]\.\.\/hooks\//, 'seam does not require any hook');
    assert.doesNotMatch(moduleSrc, /require\(['"]\.\/actions['"]\)/, 'seam does not require the plan-moving actions module');
  });
});

// ─────────────────────────────────────────────────────────────────────
// 10. SEAM FAIL-OPEN — a bad gdpr_article never throws, never contaminates
//     the sibling regime, and is recorded (not silently lost).
//
// The GDPR RUNNER stays fail-loud: it THROWS via validateFindingSchema on an
// unknown gdpr_article — a bad code must never be silently EMITTED. The SEAM
// wraps that: it partitions GDPR findings into schema-valid vs invalid per
// finding (mirroring the EU-AI-Act filterToEuAiAct fail-strict-drop), so the
// runner only ever RECEIVES valid findings and the seam itself never throws.
//
// Regression: before the fix, the unguarded runGdprFindings call ran BEFORE
// runEuAiActFindings, so a throwing GDPR finding aborted the whole seam and
// SILENTLY DROPPED the valid EU-AI-Act finding (non-atomic cross-regime
// contamination). These tests are RED before the fix (they throw / drop the
// EU finding) and GREEN after.
// ─────────────────────────────────────────────────────────────────────

describe('runComplianceForTransition — seam fail-open on a bad gdpr_article (never contaminates the other regime)', () => {
  it('10a. bad gdpr_article + VALID EU-AI-Act finding ⇒ no throw, the EU finding STILL attaches to the real Inbox, the bad GDPR finding is recorded as dropped', () => {
    const root = projectWith('[gdpr, eu-ai-act-high-risk]');
    let res;
    assert.doesNotThrow(() => {
      res = seam.runComplianceForTransition(root, {
        // Unknown code — the runner would THROW on this. The seam must DROP it.
        gdprFindings: [gdprPlanFinding({ gdpr_article: 'GDPR-999', message: 'bogus article finding' })],
        // A perfectly valid EU-AI-Act finding that MUST survive the GDPR failure.
        euAiActFindings: [euAiActPlanFinding()],
      });
    }, 'the seam does NOT throw on a bad gdpr_article');

    // Both gates ran.
    assert.equal(res.gdprRan, true, 'GDPR gate on');
    assert.equal(res.euAiActRan, true, 'EU-AI-Act gate on');

    // ATOMICITY / INDEPENDENCE: the EU-AI-Act finding reaches the REAL Inbox on
    // disk despite the bad GDPR finding. Disk readback — no mocks.
    const files = listQuestionFiles(root);
    assert.equal(files.length, 1, 'exactly ONE question file on disk — the EU-AI-Act finding');
    const body = fs.readFileSync(path.join(questionsDir(root), files[0]), 'utf8');
    assert.match(body, /high-risk training data lacks Art\.10 governance/, 'the EU-AI-Act finding survived and attached');
    assert.match(body, /source_step:\s*compliance-eu-ai-act/, 'routed through the EU-AI-Act runner (sibling regime unaffected)');

    // The bad GDPR finding produced NO Inbox id.
    assert.equal(res.inboxIds.length, 1, 'only the EU-AI-Act finding produced an Inbox id');

    // HONESTY: the dropped bad finding is RECORDED, not silently lost.
    assert.ok(Array.isArray(res.droppedFindings), 'summary surfaces a droppedFindings array');
    assert.equal(res.droppedFindings.length, 1, 'exactly one finding recorded as dropped');
    const dropped = res.droppedFindings[0];
    assert.equal(dropped.regime, 'gdpr', 'the dropped finding is attributed to the GDPR regime');
    assert.match(String(dropped.reason), /GDPR-999|unknown gdpr_article|gdpr_article/i, 'the drop reason names the offending code / cause');
  });

  it('10b. bad GDPR finding alongside a GOOD GDPR finding ⇒ the good one attaches, the bad one is recorded, no throw', () => {
    const root = projectWith('[gdpr]');
    let res;
    assert.doesNotThrow(() => {
      res = seam.runComplianceForTransition(root, {
        gdprFindings: [
          gdprPlanFinding({ gdpr_article: 'GDPR-999', kind: 'bogus', regulation_ref: 'nope', message: 'bad article' }),
          gdprPlanFinding({ gdpr_article: 'GDPR-17', kind: 'data-retention', regulation_ref: 'gdpr art. 5(1)(e)', message: 'good retention finding' }),
        ],
      });
    }, 'a bad GDPR finding does not abort the good GDPR finding');

    assert.equal(res.gdprRan, true);
    // Exactly the GOOD finding reaches the Inbox.
    const files = listQuestionFiles(root);
    assert.equal(files.length, 1, 'exactly ONE question file on disk — the valid GDPR finding');
    const body = fs.readFileSync(path.join(questionsDir(root), files[0]), 'utf8');
    assert.match(body, /good retention finding/, 'the valid GDPR finding attached');
    assert.doesNotMatch(body, /bad article/, 'the invalid GDPR finding was NOT emitted');
    assert.equal(res.inboxIds.length, 1, 'one Inbox id — only the valid finding');

    // The bad one is recorded.
    assert.equal(res.droppedFindings.length, 1, 'the invalid GDPR finding is recorded as dropped');
    assert.equal(res.droppedFindings[0].regime, 'gdpr');
  });

  it('10c. a non-object / null GDPR finding is contained (no throw), recorded, and never emitted', () => {
    const root = projectWith('[gdpr, eu-ai-act-high-risk]');
    let res;
    assert.doesNotThrow(() => {
      res = seam.runComplianceForTransition(root, {
        // null is a plan-stage element (splitByRoute keeps it plan-stage);
        // validateFindingSchema throws a TypeError on it — the seam must contain that.
        gdprFindings: [/** @type {any} */ (null), gdprPlanFinding({ message: 'valid alongside null' })],
        euAiActFindings: [euAiActPlanFinding()],
      });
    }, 'a null GDPR finding does not throw the seam');

    // The valid GDPR finding + the EU-AI-Act finding both attach; null is dropped.
    const bodies = readAllQuestionBodies(root).join('\n---\n');
    assert.match(bodies, /valid alongside null/, 'the valid GDPR finding attached');
    assert.match(bodies, /high-risk training data lacks Art\.10 governance/, 'the EU-AI-Act finding attached (sibling unaffected)');
    assert.equal(listQuestionFiles(root).length, 2, 'exactly two question files — the two valid findings');

    // The null is recorded as dropped.
    assert.ok(res.droppedFindings.length >= 1, 'the null finding is recorded as dropped');
    assert.ok(res.droppedFindings.some(d => d.regime === 'gdpr'), 'the dropped null is attributed to GDPR');
  });
});

// ─────────────────────────────────────────────────────────────────────
// 11. Summary honesty on the clean path — droppedFindings is present + empty
//     when nothing is dropped (so callers can always read it).
// ─────────────────────────────────────────────────────────────────────

describe('runComplianceForTransition — droppedFindings is always present', () => {
  it('11. all-valid findings ⇒ droppedFindings is an empty array (never undefined)', () => {
    const root = projectWith('[gdpr, eu-ai-act-high-risk]');
    const res = seam.runComplianceForTransition(root, {
      gdprFindings: [gdprPlanFinding()],
      euAiActFindings: [euAiActPlanFinding()],
    });
    assert.ok(Array.isArray(res.droppedFindings), 'droppedFindings present on the clean path');
    assert.equal(res.droppedFindings.length, 0, 'nothing dropped when every finding is valid');
  });
});
