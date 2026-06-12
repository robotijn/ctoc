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
    // "Decide later" must NOT loop back into a prompt-gate.
    assert.equal(r.actions['Decide later'], 'claude:env-decide-later');
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
