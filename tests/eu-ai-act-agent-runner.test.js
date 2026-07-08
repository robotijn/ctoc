/**
 * EC5-s1 — eu-ai-act-agent-runner LIVE wiring tests.
 *
 * Parity with tests/gdpr-agent-runner.test.js: the human-facing seam wires LIVE
 * and its test drives the REAL flow. No mock stands in for the gate or the Inbox:
 *   - the gate is the REAL `shouldRunEuAiAct` reading a REAL tmp `.ctoc/settings.yaml`
 *     (+ a copy of the shipped regulatory-regimes/ so loadActiveProfiles sees
 *     eu-ai-act-high-risk.yaml);
 *   - the Inbox is the REAL `src/lib/inbox.js` — assertions read the created
 *     question file(s) back from `.ctoc/inbox/questions/` on disk;
 *   - filtering/normalization/routing are the REAL EC3 eu-ai-act-helpers.
 *
 * Proves: gate OFF ⇒ no-op (no Inbox write); gate ON ⇒ plan-stage finding lands
 * in the real Inbox; code-stage finding is RETURNED (letter path) and NOT Inbox'd;
 * severity is normalized to critical; a non-eu-ai-act finding is fail-strictly
 * dropped; fail-open on bad input; and the human-gate topology is unchanged and
 * this advisory runner names no gate key (gate invariant).
 */

const { describe, it, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const runner = require('../src/lib/eu-ai-act-agent-runner');

const REPO_ROOT = path.join(__dirname, '..');
const REGIMES_SRC = path.join(REPO_ROOT, '.ctoc', 'regulatory-regimes');
const RUNNER_SRC_PATH = path.join(REPO_ROOT, 'src', 'lib', 'eu-ai-act-agent-runner.js');
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
// regulatory-regimes/ dir so the REAL shouldRunEuAiAct gate resolves
// eu-ai-act-high-risk.yaml.
function projectWith(activeProfilesLine) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'euaiact-runner-'));
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

after(() => tmpDirs.forEach(d => fs.rmSync(d, { recursive: true, force: true })));

// ─────────────────────────────────────────────────────────────────────
// 1. Gate OFF ⇒ no output, NO Inbox writes
// ─────────────────────────────────────────────────────────────────────

describe('runEuAiActFindings — gate OFF is a no-op', () => {
  it('1. active_profiles: [] ⇒ {ran:false}, empty results, NO question file written', () => {
    const root = projectWith('[]');
    const res = runner.runEuAiActFindings(root, [
      { regulation: 'eu-ai-act', risk_class: 'high-risk', message: 'missing risk management' },
    ]);
    assert.equal(res.ran, false);
    assert.deepEqual(res.inbox, []);
    assert.deepEqual(res.letter, []);
    // REAL filesystem proof: nothing was written to the Inbox.
    assert.deepEqual(listQuestionFiles(root), [], 'no Inbox question file on disk when gate off');
  });
});

// ─────────────────────────────────────────────────────────────────────
// 2. Gate ON + plan-stage finding ⇒ REAL Inbox question (disk readback)
// ─────────────────────────────────────────────────────────────────────

describe('runEuAiActFindings — gate ON routes plan-stage findings to the REAL Inbox', () => {
  it('2. plan-stage finding lands in the real Inbox; readback carries message + source_step + risk_class', () => {
    const root = projectWith('[eu-ai-act-high-risk]');
    const res = runner.runEuAiActFindings(root, [
      {
        regulation: 'eu-ai-act',
        risk_class: 'high-risk',
        annex_iii_category: '4-employment',
        confidence: 'medium',
        kind: 'missing-risk-management',
        message: 'high-risk employment AI needs an Art.9 risk-management system',
        plan: 'hiring-flow',
      },
    ]);
    assert.equal(res.ran, true);
    assert.equal(res.inbox.length, 1, 'one Inbox id returned');
    assert.deepEqual(res.letter, [], 'plan-stage finding does not go to the letter path');

    const files = listQuestionFiles(root);
    assert.equal(files.length, 1, 'exactly one question file written to disk');
    const body = fs.readFileSync(path.join(questionsDir(root), files[0]), 'utf8');
    assert.match(body, /high-risk employment AI needs an Art\.9 risk-management system/, 'message in the question body');
    assert.match(body, /source_step:\s*compliance-eu-ai-act/, 'source_step frontmatter set');
    assert.match(body, /source_plan:\s*hiring-flow/, 'source_plan frontmatter carried through');
    assert.match(body, /risk_class:\s*high-risk/, 'risk_class appears in the context');
    assert.match(body, /severity:\s*critical/, 'severity normalized to critical in context');
    assert.match(body, /annex_iii_category:\s*4-employment/, 'annex_iii_category surfaced when present');
  });
});

// ─────────────────────────────────────────────────────────────────────
// 3, 4. Gate ON + code-stage finding ⇒ letter route (returned, NOT Inbox'd)
// ─────────────────────────────────────────────────────────────────────

describe('runEuAiActFindings — code-stage findings take the letter path', () => {
  it('3. code-stage finding is returned in letter[] (severity:critical) and NOT Inbox\'d', () => {
    const root = projectWith('[eu-ai-act-high-risk]');
    const res = runner.runEuAiActFindings(root, [
      {
        regulation: 'eu-ai-act',
        risk_class: 'high-risk',
        kind: 'no-logging',
        target_file: 'src/model.ts',
        target_line: 42,
        message: 'high-risk system lacks Art.12 automatic logging',
      },
    ]);
    assert.equal(res.ran, true);
    assert.deepEqual(res.inbox, [], 'no Inbox question created for a code-stage finding');
    assert.equal(res.letter.length, 1, 'code-stage finding returned for the letter path');
    assert.equal(res.letter[0].severity, 'critical', 'severity normalized to critical');
    assert.equal(res.letter[0].target_file, 'src/model.ts', 'code coordinates preserved');
    // REAL filesystem proof: nothing landed in the Inbox for the letter finding.
    assert.deepEqual(listQuestionFiles(root), [], 'no question file on disk for a letter finding');
  });

  it('4. severity is forced to critical even when the input says low', () => {
    const root = projectWith('[eu-ai-act-high-risk]');
    const res = runner.runEuAiActFindings(root, [
      {
        regulation: 'eu-ai-act',
        risk_class: 'high-risk',
        severity: 'low',
        target_file: 'src/y.ts',
        target_line: 5,
        message: 'transparency gap',
      },
    ]);
    assert.equal(res.letter.length, 1);
    assert.equal(res.letter[0].severity, 'critical', 'low upgraded to critical');
  });
});

// ─────────────────────────────────────────────────────────────────────
// 5. Fail-strict scope isolation — non-eu-ai-act findings are dropped
// ─────────────────────────────────────────────────────────────────────

describe('runEuAiActFindings — fail-strict scope isolation', () => {
  it('5. a mixed batch processes ONLY the eu-ai-act finding; the foreign one is dropped', () => {
    const root = projectWith('[eu-ai-act-high-risk]');
    const res = runner.runEuAiActFindings(root, [
      { regulation: 'nist-ai-rmf', risk_class: 'high-risk', message: 'NIST finding — must be dropped' },
      { regulation: 'eu-ai-act', risk_class: 'high-risk', message: 'EU AI Act plan finding' },
    ]);
    assert.equal(res.ran, true);
    assert.equal(res.inbox.length, 1, 'only the eu-ai-act finding was Inbox\'d');
    assert.deepEqual(res.letter, [], 'no letter entries in this batch');
    const files = listQuestionFiles(root);
    assert.equal(files.length, 1, 'exactly one question on disk — the foreign finding never emitted');
    const body = fs.readFileSync(path.join(questionsDir(root), files[0]), 'utf8');
    assert.match(body, /EU AI Act plan finding/, 'the surviving finding is the eu-ai-act one');
    assert.doesNotMatch(body, /NIST finding/, 'the nist-ai-rmf finding was never emitted');
  });

  it('5b. a finding with a MISSING regulation field is fail-strictly dropped', () => {
    const root = projectWith('[eu-ai-act-high-risk]');
    const res = runner.runEuAiActFindings(root, [
      { risk_class: 'high-risk', message: 'fieldless finding — dropped' },
    ]);
    assert.equal(res.ran, true);
    assert.deepEqual(res.inbox, []);
    assert.deepEqual(res.letter, []);
    assert.deepEqual(listQuestionFiles(root), [], 'nothing emitted for a fieldless finding');
  });
});

// ─────────────────────────────────────────────────────────────────────
// Fail-open / defensive input handling
// ─────────────────────────────────────────────────────────────────────

describe('runEuAiActFindings — fail-open on bad input', () => {
  it('6. non-array findings ⇒ {ran:true} with empty results (gate on)', () => {
    const root = projectWith('[eu-ai-act-high-risk]');
    let res;
    assert.doesNotThrow(() => { res = runner.runEuAiActFindings(root, /** @type {any} */ (null)); });
    assert.equal(res.ran, true);
    assert.deepEqual(res.inbox, []);
    assert.deepEqual(res.letter, []);
    assert.deepEqual(listQuestionFiles(root), []);
  });

  it('7. missing findings argument ⇒ {ran:true} empty (gate on)', () => {
    const root = projectWith('[eu-ai-act-high-risk]');
    const res = runner.runEuAiActFindings(root);
    assert.equal(res.ran, true);
    assert.deepEqual(res.inbox, []);
    assert.deepEqual(res.letter, []);
  });

  it('8. non-string root ⇒ gate resolves false ⇒ {ran:false}, no throw', () => {
    let res;
    assert.doesNotThrow(() => {
      res = runner.runEuAiActFindings(undefined, [{ regulation: 'eu-ai-act', risk_class: 'high-risk', message: 'x' }]);
    });
    assert.equal(res.ran, false);
    assert.deepEqual(res.inbox, []);
    assert.deepEqual(res.letter, []);
  });

  it('mixed plan + code batch (gate on) routes each independently', () => {
    const root = projectWith('[eu-ai-act-high-risk]');
    const res = runner.runEuAiActFindings(root, [
      { regulation: 'eu-ai-act', risk_class: 'high-risk', message: 'plan finding' },
      { regulation: 'eu-ai-act', risk_class: 'high-risk', target_file: 'src/z.ts', target_line: 3, message: 'code finding' },
    ]);
    assert.equal(res.ran, true);
    assert.equal(res.inbox.length, 1, 'the plan-stage finding was Inbox\'d');
    assert.equal(res.letter.length, 1, 'the code-stage finding took the letter path');
    assert.equal(listQuestionFiles(root).length, 1, 'exactly one question on disk');
  });
});

// ─────────────────────────────────────────────────────────────────────
// 9. GATE INVARIANT (load-bearing) — advisory runner touches no human gate
// ─────────────────────────────────────────────────────────────────────

describe('runEuAiActFindings — gate invariant (no human gate added/weakened)', () => {
  const gateHookSrc = fs.readFileSync(GATE_HOOK_PATH, 'utf8');
  const runnerSrc = fs.readFileSync(RUNNER_SRC_PATH, 'utf8');

  it('9a. HUMAN_GATES still has exactly the 3 destination keys (4-gate topology intact)', () => {
    // Parse the HUMAN_GATES object literal from the hook source and assert its keys.
    const m = /const HUMAN_GATES\s*=\s*\{([\s\S]*?)\};/.exec(gateHookSrc);
    assert.ok(m, 'HUMAN_GATES object literal present in the hook');
    const keys = [...m[1].matchAll(/'([a-z-]+)'\s*:/g)].map(k => k[1]);
    assert.deepEqual(keys.sort(), ['done', 'implementation', 'todo'], 'exactly the three gate destinations');
  });

  it('9b. the runner source names NO gate/enforcement key', () => {
    assert.doesNotMatch(runnerSrc, /HUMAN_GATES/, 'runner names no HUMAN_GATES');
    assert.doesNotMatch(runnerSrc, /requireReviewGate/, 'runner names no requireReviewGate');
    assert.doesNotMatch(runnerSrc, /enforcementMode/, 'runner names no enforcementMode');
    assert.doesNotMatch(runnerSrc, /review_gate/, 'runner names no review_gate');
  });
});
