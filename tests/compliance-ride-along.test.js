/**
 * Menu × Compliance-regime ride-along tests (EC1-s3).
 *
 * The compliance-regime selection must reach a real human on the LIVE menu path
 * (`src/commands/menu.js:main()` non-interactive JSON branch) — the SAME
 * mechanism the environment question uses (`attachEnvironmentQuestion`). The
 * question rides ALONG with the dashboard; it never replaces or gates the plan
 * overview, and it never weakens a human gate.
 *
 * These tests DRIVE THE REAL LIVE MENU end-to-end (execFileSync(menu.js) → parse
 * JSON → assert), exactly like tests/menu-environment.test.js (the PI4 lesson:
 * test the real mounted path, not an unmounted helper). Selecting a profile
 * persists it via writeActiveProfiles (EC1-s2) to `.ctoc/settings.yaml`.
 */

const { describe, it, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const MENU = path.join(__dirname, '..', 'src', 'commands', 'menu.js');
const { writeActiveProfiles } = require('../src/lib/compliance-regime');

// A minimal but real settings.yaml carrying the regulatory_regime block the
// reader (regulatory-regime.js:loadActiveProfiles) parses, plus a trailing
// top-level key so the block-extraction regex terminates. `profiles` is an
// inline bracket list, exactly what writeActiveProfiles round-trips.
function settingsYaml(profiles, environment) {
  const list = `[${profiles.join(', ')}]`;
  return [
    'enforcement:',
    '  mode: strict',
    '',
    'regulatory_regime:',
    `  active_profiles: ${list}`,
    '  overrides: {}',
    '',
    'general:',
    `  environment: ${environment}`,
    '',
  ].join('\n');
}

const tmpDirs = [];

/**
 * Build a temp project whose `.ctoc/settings.yaml` carries the given active
 * profiles and environment. `plans/functional/` exists so the dashboard renders.
 * The real regulatory-regimes dir is not needed for the active-profiles read
 * (loadActiveProfiles reads only settings.yaml), so we keep the fixture lean.
 */
function projectWith(profiles, environment = 'prod') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'menu-compliance-'));
  tmpDirs.push(dir);
  fs.mkdirSync(path.join(dir, '.ctoc'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'plans', 'functional'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.ctoc', 'settings.yaml'), settingsYaml(profiles, environment));
  // settings.json drives needsEnvironmentPrompt; a set environment suppresses
  // the environment ride-along so tests can isolate the compliance question.
  if (environment !== 'ask') {
    fs.writeFileSync(
      path.join(dir, '.ctoc', 'settings.json'),
      JSON.stringify({ general: { environment } })
    );
  }
  return dir;
}

after(() => tmpDirs.forEach(d => fs.rmSync(d, { recursive: true, force: true })));

function runMenu(cwd) {
  const out = execFileSync(process.execPath, [MENU], {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return JSON.parse(out);
}

function headers(r) {
  return r.ask.questions.map(q => q.header);
}
function complianceQuestion(r) {
  return r.ask.questions.find(q => q.header === 'Compliance');
}

describe('Menu — compliance-regime question rides along, never gates', () => {
  it('neither profile active → compliance question rides along, dashboard intact', () => {
    const r = runMenu(projectWith([], 'prod')); // env set → only compliance rides
    // Dashboard NOT replaced — the plan-phase overview is present.
    assert.match(r.text, /▼ Business/, 'Business section visible');
    assert.match(r.text, /▼ Implementation/, 'Implementation section visible');
    assert.match(r.text, /▼ Execution/, 'Execution section visible');
    // Pipeline question is always first — the overview is never gated.
    assert.equal(r.ask.questions[0].header, 'Pipeline', 'pipeline question first');
    // The compliance question rides along (not replacing the dashboard).
    const cq = complianceQuestion(r);
    assert.ok(cq, 'compliance question present');
    assert.equal(cq.options.length, 4, 'exactly 4 compliance options');
    const labels = cq.options.map(o => o.label);
    assert.deepEqual(labels, ['None', 'GDPR', 'EU AI Act', 'Both'], 'the closed option set');
    // Actions map to the closed set of set-compliance-regime side-effects.
    assert.equal(r.actions['None'], 'claude:set-compliance-regime none');
    assert.equal(r.actions['GDPR'], 'claude:set-compliance-regime gdpr');
    assert.equal(r.actions['EU AI Act'], 'claude:set-compliance-regime eu-ai-act');
    assert.equal(r.actions['Both'], 'claude:set-compliance-regime both');
    // Pipeline navigation intact — the dashboard actions still present.
    assert.ok('Business' in r.actions, 'pipeline navigation intact');
  });

  it('gdpr profile already active → NO compliance question (asked once)', () => {
    const r = runMenu(projectWith(['gdpr'], 'prod'));
    assert.match(r.text, /▼ Business/, 'overview visible');
    assert.ok(!complianceQuestion(r), 'no compliance question when gdpr active');
    assert.ok(
      !Object.values(r.actions).some(a => a.startsWith('claude:set-compliance-regime')),
      'no set-compliance-regime action when a profile is active'
    );
  });

  it('eu-ai-act-high-risk active also suppresses the compliance prompt', () => {
    const r = runMenu(projectWith(['eu-ai-act-high-risk'], 'prod'));
    assert.match(r.text, /▼ Business/, 'overview visible');
    assert.ok(!complianceQuestion(r), 'no compliance question when eu-ai-act active');
  });

  it('AskUserQuestion limits: ≤4 questions, ≤4 options each (env + compliance both ride)', () => {
    const r = runMenu(projectWith([], 'ask')); // env unset → env AND compliance ride
    assert.ok(r.ask.questions.length <= 4, `≤4 questions (got ${r.ask.questions.length})`);
    for (const q of r.ask.questions) {
      assert.ok(q.options.length <= 4, `${q.header}: ≤4 options`);
    }
  });

  it('Pipeline always first; both ride-alongs present when env + compliance unset', () => {
    const r = runMenu(projectWith([], 'ask'));
    assert.equal(r.ask.questions[0].header, 'Pipeline', 'pipeline first (overview never gated)');
    const hs = headers(r);
    assert.ok(hs.includes('Environment'), 'environment question rides along');
    assert.ok(hs.includes('Compliance'), 'compliance question rides along');
  });

  it('end-to-end persistence: choosing gdpr persists via writeActiveProfiles → not re-asked', () => {
    const dir = projectWith([], 'prod');
    // Precondition: unset → compliance question rides along.
    assert.ok(complianceQuestion(runMenu(dir)), 'compliance asked before choice');
    // Apply the wired write path the action invokes (EC1-s2 writer).
    const res = writeActiveProfiles(dir, ['gdpr']);
    assert.equal(res.ok, true, 'writeActiveProfiles landed the choice');
    // Re-run the LIVE menu: the write landed in the real settings.yaml and the
    // live menu re-read it → the question is gone. ask → choose → persisted → not re-asked.
    assert.ok(!complianceQuestion(runMenu(dir)), 'compliance not re-asked after persistence');
  });

  it('gate safety: compliance activation never touches enforcementMode / requireReviewGate', () => {
    const r = runMenu(projectWith(['gdpr', 'eu-ai-act-high-risk'], 'prod'));
    // Pipeline question intact — the gate surface is unchanged.
    assert.equal(r.ask.questions[0].header, 'Pipeline', 'pipeline intact');
    const blob = JSON.stringify(r);
    assert.ok(!/enforcementMode/.test(blob), 'no enforcementMode in the menu output');
    assert.ok(!/requireReviewGate/.test(blob), 'no requireReviewGate in the menu output');
    // No compliance action present (both profiles already active).
    assert.ok(
      !Object.values(r.actions).some(a => a.startsWith('claude:set-compliance-regime')),
      'no compliance action when both profiles active'
    );
  });

  it('fail-open: settings.yaml missing still renders the menu with the compliance question', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'menu-compliance-nofile-'));
    tmpDirs.push(dir);
    fs.mkdirSync(path.join(dir, '.ctoc'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'plans', 'functional'), { recursive: true });
    // No settings.yaml at all; settings.json sets env so only compliance rides.
    fs.writeFileSync(
      path.join(dir, '.ctoc', 'settings.json'),
      JSON.stringify({ general: { environment: 'prod' } })
    );
    const r = runMenu(dir);
    assert.match(r.text, /▼ Business/, 'dashboard still renders (fail-open)');
    // No active profiles readable → question rides along (fail-open, not a crash).
    assert.ok(complianceQuestion(r), 'compliance question rides along when settings.yaml absent');
  });
});
