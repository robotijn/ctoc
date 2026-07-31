'use strict';

/**
 * 00191 — the compliance seam is EXECUTABLE (reachable through a shipped recipe).
 *
 * The behavioral flow (trigger → seam → real Inbox, dispatcher identity, gate
 * invariant) is already owned end-to-end IN-PROCESS by
 * `tests/cto-chief-compliance-dispatch.test.js`. This test does NOT duplicate that
 * coverage (case 10's one-fence-per-invariant rule forbids it). Its distinct job is
 * to prove the two EXECUTABLE RECIPES this plan adds to the CTO Chief agent body:
 *
 *   (a) EXTRACT from `agents/coordinator/cto-chief.md` (via the shipped
 *       recipe-harness — never a second extraction implementation);
 *   (b) RUN as child processes via `process.execPath` (the shipped recipe form —
 *       NOT the direct in-process call the existing test already drives); and
 *   (c) make the seven-file compliance closure LEAVE the unreachable set
 *       (`src/lib/reachability.js` `analyze()`), which is the whole point of the
 *       slice — a coordinator instructed to follow a protocol whose modules are dead.
 *
 * The RECIPE is the subject here; the pure in-process behavioral guards stay the
 * property of the existing test.
 */

const { describe, it, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const harness = require('../src/lib/recipe-harness');
const { analyze } = require('../src/lib/reachability');
const trig = require('../src/lib/iron-loop-compliance-trigger');
const seam = require('../src/lib/compliance-integration');

const REPO_ROOT = path.join(__dirname, '..');
const CTO_CHIEF_PATH = path.join(REPO_ROOT, 'agents', 'coordinator', 'cto-chief.md');
const REGIMES_SRC = path.join(REPO_ROOT, '.ctoc', 'regulatory-regimes');
const SUBS = { '${CLAUDE_PLUGIN_ROOT}': REPO_ROOT };

// The seven modules the two recipe conversions revive (the closure verified from
// each module's require block on this rebase).
const SEVEN = [
  'src/lib/iron-loop-compliance-trigger.js',
  'src/lib/compliance-integration.js',
  'src/lib/gdpr-agent-runner.js',
  'src/lib/eu-ai-act-agent-runner.js',
  'src/lib/compliance-dedup.js',
  'src/lib/gdpr-helpers.js',
  'src/lib/eu-ai-act-helpers.js',
];

// ─── recipe extraction (shared, via the shipped harness) ─────────────────────

const allRecipes = harness.extractRecipes(CTO_CHIEF_PATH).filter((r) => r.kind === 'node-e');
const triggerRecipe = allRecipes.find((r) => /iron-loop-compliance-trigger/.test(r.program));
const seamRecipe = allRecipes.find((r) => /compliance-integration/.test(r.program));

// ─── fixture helpers (test scaffolding, not recipe logic) ────────────────────

const tmpDirs = [];
after(() => tmpDirs.forEach((d) => fs.rmSync(d, { recursive: true, force: true })));

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

// A real project with a real .ctoc/settings.yaml AND a copy of the shipped
// regulatory-regimes/ so the REAL gates resolve gdpr.yaml + eu-ai-act.yaml.
function projectWith(activeProfilesLine) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'compl-exec-'));
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
  const d = questionsDir(root);
  return fs.existsSync(d) ? fs.readdirSync(d).filter((f) => f.endsWith('.md')) : [];
}
function readQuestionBodies(root) {
  return listQuestionFiles(root).map((f) => fs.readFileSync(path.join(questionsDir(root), f), 'utf8'));
}
// Run both recipes in sequence (trigger, then seam) with the given raw findings.
function runSeamViaRecipes(root, findingsObj) {
  const t = harness.runRecipe(triggerRecipe.program, { root, substitutions: SUBS });
  assert.equal(t.code, 0, `trigger recipe exit ${t.code}\n${t.stderr}`);
  const res = harness.runRecipe(seamRecipe.program, {
    root, substitutions: SUBS, args: [JSON.stringify(findingsObj)],
  });
  assert.equal(res.error, null, `seam recipe errored: ${res.error}\n${res.stderr}`);
  assert.equal(res.code, 0, `seam recipe exit ${res.code}\n${res.stderr}`);
  return res;
}

// A GDPR plan-stage finding (no target_file ⇒ routes to the Inbox).
function gdprPlanFinding(overrides = {}) {
  return {
    gdpr_article: 'GDPR-17',
    kind: 'data-retention',
    regulation_ref: 'gdpr art. 5(1)(e)',
    confidence: 'medium',
    message: 'personal data kept longer than necessary',
    plan: 'user-data-flow',
    ...overrides,
  };
}

// Snapshot every file under a directory tree as { relPath: bytes }.
function snapshotTree(root) {
  const out = {};
  const walk = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else out[path.relative(root, full)] = fs.readFileSync(full);
    }
  };
  walk(root);
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Both recipes are extractable
// ─────────────────────────────────────────────────────────────────────────────
describe('00191 — the two compliance recipes are shipped in executable form', () => {
  it('1. the compliance dispatch section yields two node -e programs (trigger + seam)', () => {
    assert.ok(triggerRecipe, 'MISSING: the trigger recipe (a node -e program calling iron-loop-compliance-trigger)');
    assert.ok(seamRecipe, 'MISSING: the seam recipe (a node -e program calling compliance-integration)');
    // And they live inside the compliance dispatch section, not stray elsewhere.
    const md = fs.readFileSync(CTO_CHIEF_PATH, 'utf8');
    const secStart = md.search(/###[^\n]*[Cc]ompliance dispatch[^\n]*/);
    assert.ok(secStart !== -1, 'the compliance dispatch section heading must be present');
    const nextSec = md.slice(secStart + 3).search(/\n###\s/);
    const section = nextSec === -1 ? md.slice(secStart) : md.slice(secStart, secStart + 3 + nextSec);
    assert.ok(section.includes(triggerRecipe.program), 'the trigger recipe must sit inside the compliance dispatch section');
    assert.ok(section.includes(seamRecipe.program), 'the seam recipe must sit inside the compliance dispatch section');
  });

  it('2. each recipe is in a form the reachability analyzer CREDITS (require of the src path, carrying .js) — not a prose mention, and injection-free', () => {
    for (const [label, r, mod] of [
      ['trigger', triggerRecipe, 'iron-loop-compliance-trigger'],
      ['seam', seamRecipe, 'compliance-integration'],
    ]) {
      assert.ok(r, `${label} recipe must exist to check its form`);
      // A creditable require() of the module path, WITH the .js extension.
      const re = new RegExp(`require\\(\\s*['"][^'"]*src/lib/${mod}\\.js['"]\\s*\\)`);
      assert.match(r.program, re, `${label} recipe must require('…src/lib/${mod}.js') — the creditable form, not a backtick prose mention`);
      // Injection surface (Step 13 SECURE): the PROGRAM interpolates no user value —
      // no angle-bracket placeholder survives in the program body itself.
      assert.doesNotMatch(r.program, /<[a-z][a-z-]*>/, `${label} recipe program must interpolate no <placeholder> user value`);
    }
  });

  it('3. each named export the recipes call exists as a function', () => {
    assert.equal(typeof trig.evaluateComplianceTrigger, 'function', 'evaluateComplianceTrigger export');
    assert.equal(typeof seam.runComplianceForTransition, 'function', 'runComplianceForTransition export');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4 + 5. The trigger recipe RUNS (child process) and returns the descriptor
// ─────────────────────────────────────────────────────────────────────────────
describe('00191 — the trigger recipe runs as a child process', () => {
  it('4. runs via process.execPath and returns the documented descriptor', () => {
    const root = projectWith('[]'); // no regime active
    const res = harness.runRecipe(triggerRecipe.program, { root, substitutions: SUBS });
    assert.equal(res.error, null, `trigger recipe errored: ${res.error}\n${res.stderr}`);
    assert.equal(res.code, 0, `trigger recipe exit code ${res.code}\n${res.stderr}`);
    assert.ok(res.json && typeof res.json === 'object', 'stdout must parse to a descriptor object');
    for (const k of ['runGdpr', 'runEuAiAct', 'dispatcher']) {
      assert.ok(k in res.json, `descriptor must carry ${k}`);
    }
  });

  it('5. the descriptor dispatcher is the literal cto-chief, never iron-loop', () => {
    const root = projectWith('[]');
    const res = harness.runRecipe(triggerRecipe.program, { root, substitutions: SUBS });
    assert.equal(res.json.dispatcher, 'cto-chief', 'dispatcher is the literal cto-chief');
    assert.notEqual(res.json.dispatcher, 'iron-loop', 'dispatcher is NEVER iron-loop');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. No regime active ⇒ provable no-op (the seam recipe is not run)
// ─────────────────────────────────────────────────────────────────────────────
describe('00191 — no regime active is a provable no-op', () => {
  it('6. trigger both false ⇒ the seam recipe is not run ⇒ nothing under .ctoc/inbox/', () => {
    const root = projectWith('[]');
    const res = harness.runRecipe(triggerRecipe.program, { root, substitutions: SUBS });
    assert.equal(res.json.runGdpr, false, 'gdpr gate off');
    assert.equal(res.json.runEuAiAct, false, 'eu-ai-act gate off');
    // The protocol runs the seam ONLY when a regime is on; both false ⇒ not run.
    assert.deepEqual(listQuestionFiles(root), [], 'no Inbox question written when both gates are off');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. A regime active ⇒ the seam recipe RUNS and attaches a finding
// ─────────────────────────────────────────────────────────────────────────────
describe('00191 — a regime active runs the seam recipe end-to-end', () => {
  it('7. trigger on, seam recipe run via process.execPath with argv findings ⇒ a finding reaches the Inbox', () => {
    const root = projectWith('[gdpr]');
    const t = harness.runRecipe(triggerRecipe.program, { root, substitutions: SUBS });
    assert.equal(t.json.runGdpr, true, 'gdpr gate on ⇒ CTO Chief dispatches the seam');

    const findings = JSON.stringify({ gdprFindings: [gdprPlanFinding()], euAiActFindings: [] });
    const res = harness.runRecipe(seamRecipe.program, { root, substitutions: SUBS, args: [findings] });
    assert.equal(res.error, null, `seam recipe errored: ${res.error}\n${res.stderr}`);
    assert.equal(res.code, 0, `seam recipe exit code ${res.code}\n${res.stderr}`);
    assert.ok(res.json && Array.isArray(res.json.inboxIds), 'seam summary must carry inboxIds');
    assert.equal(res.json.inboxIds.length, 1, 'exactly one Inbox id created by the recipe run');
    assert.equal(listQuestionFiles(root).length, 1, 'exactly one real Inbox question file landed on disk');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. The seam recipe moves no plan and crosses no gate
// ─────────────────────────────────────────────────────────────────────────────
describe('00191 — the seam recipe is advisory and gate-safe', () => {
  it('8. running the seam recipe leaves every file under plans/ byte-identical and writes no approval marker', () => {
    const root = projectWith('[gdpr]');
    const plansDir = path.join(root, 'plans', 'implementation');
    fs.mkdirSync(plansDir, { recursive: true });
    fs.writeFileSync(
      path.join(plansDir, 'critical-plan.md'),
      '---\nstage: implementation\napproved_by: human\n---\n# Critical plan\nbody\n',
    );
    const before = snapshotTree(path.join(root, 'plans'));

    const findings = JSON.stringify({
      gdprFindings: [gdprPlanFinding({ severity: 'critical', message: 'critical retention gap' })],
      euAiActFindings: [],
    });
    const res = harness.runRecipe(seamRecipe.program, { root, substitutions: SUBS, args: [findings] });
    assert.equal(res.code, 0, `seam recipe exit code ${res.code}\n${res.stderr}`);

    const afterTree = snapshotTree(path.join(root, 'plans'));
    assert.deepEqual(Object.keys(afterTree).sort(), Object.keys(before).sort(), 'no plan file added or removed');
    for (const k of Object.keys(before)) {
      assert.ok(before[k].equals(afterTree[k]), `plans/${k} must be byte-identical after the seam runs`);
    }
    // No approval marker written anywhere in the fixture by the seam.
    const inboxSnap = snapshotTree(path.join(root, '.ctoc', 'inbox'));
    for (const [k, bytes] of Object.entries(inboxSnap)) {
      assert.doesNotMatch(bytes.toString('utf8'), /approved_by:\s*human/, `${k} must not carry an approval marker`);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 9. The seven files LEAVE the unreachable set — the measurement of the slice
// ─────────────────────────────────────────────────────────────────────────────
describe('00191 — the compliance closure becomes reachable', () => {
  it('9. analyze() on the real root reports none of the seven as unreachable', () => {
    const r = analyze(REPO_ROOT);
    assert.deepEqual(r.readErrors, [], 'the analyzer read every input it judged (a partial read must not seed a verdict)');
    const stillDead = SEVEN.filter((f) => r.unreachable.includes(f));
    assert.deepEqual(
      stillDead,
      [],
      `these compliance modules are still dead beneath a protocol CTO Chief is instructed to follow: ${stillDead.join(', ')}`,
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 11–13. The three revived helper exports are REALLY executed by the seam recipe
//        (real-use proof — not a fence-satisfying no-op caller)
// ─────────────────────────────────────────────────────────────────────────────
describe('00191 — the seam recipe really executes the deterministic derivation helpers', () => {
  it('11. gdpr-helpers#mapPiiFieldToArticles: a PII-field finding is enriched with its full triggered-Article set by the recipe run', () => {
    const root = projectWith('[gdpr]');
    // The finding is flagged under GDPR-17 (so it survives the seam's schema
    // validation) AND names the pii_field `email`; the runner enriches it with
    // the complete triggered-Article set via the deterministic mapping.
    runSeamViaRecipes(root, {
      gdprFindings: [{ gdpr_article: 'GDPR-17', pii_field: 'email', kind: 'pii-retention', message: 'email kept longer than necessary', plan: 'signup' }],
      euAiActFindings: [],
    });
    const body = readQuestionBodies(root)[0];
    assert.ok(body, 'a question file must have been written');
    assert.match(body, /pii_field:\s*email/, 'the source PII field is surfaced');
    assert.match(body, /gdpr_articles:\s*GDPR-6,\s*GDPR-13,\s*GDPR-17/, 'the full triggered-Article set was mapped from the field and surfaced');
  });

  it('12. eu-ai-act-helpers#classifyFromPlanText: an unclassified finding is classified from its plan prose by the recipe run', () => {
    const root = projectWith('[gdpr, eu-ai-act-high-risk]');
    // regulation:'eu-ai-act' survives filterToEuAiAct; NO risk_class ⇒ classified.
    runSeamViaRecipes(root, {
      gdprFindings: [],
      euAiActFindings: [{ regulation: 'eu-ai-act', message: 'we screen CVs and rank candidates for hiring', plan: 'ats' }],
    });
    const body = readQuestionBodies(root)[0];
    assert.ok(body, 'a question file must have been written');
    assert.match(body, /risk_class:\s*high-risk/, 'risk_class derived from the plan prose');
    assert.match(body, /annex_iii_category:\s*4-employment/, 'the Annex III employment category was derived');
  });

  it('13. eu-ai-act-helpers#readEnforcementDates: the Inbox context carries the enforcement date read from the profile', () => {
    const root = projectWith('[gdpr, eu-ai-act-high-risk]');
    runSeamViaRecipes(root, {
      gdprFindings: [],
      euAiActFindings: [{ regulation: 'eu-ai-act', risk_class: 'high-risk', message: 'high-risk system lacks governance', plan: 'model' }],
    });
    const body = readQuestionBodies(root)[0];
    assert.ok(body, 'a question file must have been written');
    // Annex III high-risk obligations effective 2026-08-02, read from the profile.
    assert.match(body, /enforcement_date:\s*2026-08-02/, 'the profile enforcement date reached the human-facing Inbox context');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 10. The recipes are not duplicated — the test holds no copy
// ─────────────────────────────────────────────────────────────────────────────
describe('00191 — one fence per invariant: the recipes are not duplicated', () => {
  it('10. each recipe program appears exactly once in the agent file, and this test holds no copy', () => {
    const md = fs.readFileSync(CTO_CHIEF_PATH, 'utf8');
    const testSrc = fs.readFileSync(__filename, 'utf8');
    for (const [label, r] of [['trigger', triggerRecipe], ['seam', seamRecipe]]) {
      assert.ok(r, `${label} recipe must exist`);
      const occurrences = md.split(r.program).length - 1;
      assert.equal(occurrences, 1, `${label} recipe must appear exactly once in cto-chief.md (found ${occurrences})`);
      assert.ok(!testSrc.includes(r.program), `this test must NOT hold a copy of the ${label} recipe — it extracts it`);
    }
  });
});
