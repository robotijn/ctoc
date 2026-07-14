/**
 * Menu × Environment regression tests.
 *
 * v6.9.40 introduced a first-run environment prompt that REPLACED the
 * dashboard, hiding the plan-phase overview behind an inescapable question
 * ("Decide later" looped back to the same prompt). v6.9.44 fixed it: the
 * dashboard always renders, and the environment question rides along as a
 * second question when the environment is unset.
 *
 * These tests pin that contract: the plan overview must NEVER be gated.
 */

const { describe, it, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const MENU = path.join(__dirname, '..', 'src', 'commands', 'menu.js');

const tmpDirs = [];
function projectWith(settings) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'menu-env-'));
  tmpDirs.push(dir);
  fs.mkdirSync(path.join(dir, '.ctoc'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'plans', 'functional'), { recursive: true });
  if (settings !== undefined) {
    fs.writeFileSync(path.join(dir, '.ctoc', 'settings.json'), JSON.stringify(settings));
  }
  // EC1-s3: a SECOND ride-along (the compliance-regime question) also attaches
  // when no EU compliance profile is active. These tests pin the ENVIRONMENT
  // ride-along in isolation, so mark a compliance profile active (gdpr) to
  // suppress that second ride-along. The compliance ride-along has its own
  // suite in tests/compliance-ride-along.test.js.
  fs.writeFileSync(
    path.join(dir, '.ctoc', 'settings.yaml'),
    'regulatory_regime:\n  active_profiles: [gdpr]\n  overrides: {}\n\ngeneral:\n  x: 1\n'
  );
  return dir;
}
after(() => tmpDirs.forEach(d => fs.rmSync(d, { recursive: true, force: true })));

function runMenu(cwd) {
  const out = execFileSync(process.execPath, [MENU], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  return JSON.parse(out);
}

describe('Menu — environment question rides along, never gates', () => {
  it('environment UNSET: dashboard overview renders WITH the env question attached', () => {
    const r = runMenu(projectWith(undefined)); // no settings.json → env unset
    // The plan-phase overview must be present.
    assert.match(r.text, /▼ Business/, 'Business section visible');
    assert.match(r.text, /▼ Implementation/, 'Implementation section visible');
    assert.match(r.text, /▼ Execution/, 'Execution section visible');
    // The env question is the SECOND question, not a replacement.
    assert.equal(r.ask.questions.length, 2, 'pipeline + environment questions');
    assert.equal(r.ask.questions[0].header, 'Pipeline', 'pipeline question first');
    assert.equal(r.ask.questions[1].header, 'Environment', 'environment question second');
    // Both action sets present.
    assert.ok('Business' in r.actions, 'pipeline navigation intact');
    assert.equal(r.actions['Development'], 'claude:set-environment dev');
    // R2-C2 item 2: the one-turn "Decide later" skip (the F7 re-ask hell) is
    // REPLACED by a durable "Keep defaults, stop asking" option that persists
    // general.environment_prompt_dismissed. Option count stays 4.
    assert.ok(!('Decide later' in r.actions), 'one-turn "Decide later" is gone');
    assert.equal(r.actions['Keep defaults, stop asking'], 'claude:env-keep-defaults',
      'durable dismissal replaces the one-turn skip');
    assert.equal(r.ask.questions[1].options.length, 4, 'environment question still has 4 options');
    // The durable option names the anytime-changeable path (System → Settings).
    const keep = r.ask.questions[1].options.find(o => o.label === 'Keep defaults, stop asking');
    assert.match(keep.description, /Settings/, 'description names where to set the environment later');
  });

  it('environment UNSET but DISMISSED: env question does NOT ride along', () => {
    // The human already chose "Keep defaults, stop asking" — the durable marker
    // makes needsEnvironmentPrompt false even though environment stays 'ask'.
    const r = runMenu(projectWith({ general: { environment_prompt_dismissed: true } }));
    assert.match(r.text, /▼ Business/, 'overview still visible');
    assert.equal(r.ask.questions.length, 1, 'only the pipeline question — env ride-along suppressed');
    assert.equal(r.ask.questions[0].header, 'Pipeline');
    assert.ok(!('Development' in r.actions), 'no env actions once dismissed');
    assert.ok(!('Keep defaults, stop asking' in r.actions), 'no env dismiss action once dismissed');
  });

  it('environment SET: plain dashboard, single question, no banner', () => {
    const r = runMenu(projectWith({ general: { environment: 'prod' } }));
    assert.match(r.text, /▼ Business/, 'overview visible');
    assert.equal(r.ask.questions.length, 1, 'only the pipeline question');
    assert.ok(!r.text.includes('No CTOC environment'), 'no env banner');
    assert.ok(!('Development' in r.actions), 'no env actions');
  });

  it('AskUserQuestion limits respected: ≤4 questions, ≤4 options each', () => {
    const r = runMenu(projectWith(undefined));
    assert.ok(r.ask.questions.length <= 4, 'max 4 questions');
    for (const q of r.ask.questions) {
      assert.ok(q.options.length <= 4, `${q.header}: max 4 options`);
    }
  });

  it('the dashboard is never replaced: every menu output contains the pipeline question', () => {
    for (const settings of [undefined, { general: { environment: 'dev' } }, { general: { environment: 'bogus' } }]) {
      const r = runMenu(projectWith(settings));
      assert.equal(r.ask.questions[0].header, 'Pipeline',
        'first question is always the pipeline — the overview is never gated');
    }
  });
});
