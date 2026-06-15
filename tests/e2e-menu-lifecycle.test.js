/**
 * End-to-end menu lifecycle tests.
 *
 * Unlike the unit suites (menu-screens.test.js, menu-environment.test.js)
 * these tests exercise the REAL state machine through the REAL process: each
 * case spawns `node src/commands/menu.js <args>` with the cwd pointed at a
 * hermetic temp project, then parses the JSON the process prints. Nothing is
 * imported from src/ — the only contract under test is the observable
 * stdout/exit-code behaviour an external caller (Claude) actually sees.
 *
 * Discipline: every assertion pins the INTENDED contract. If one fails it is a
 * real bug in the spawned code, not a harness artefact — the harness itself
 * (spawn, fixture writing, JSON parsing) is kept mechanically simple so a
 * failure can only come from menu.js / menu-screens.js / their dependencies.
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const REPO = path.resolve(__dirname, '..');
const MENU = path.join(REPO, 'src', 'commands', 'menu.js');

// All plan stage directories a fully-initialised project carries. `in-progress`
// is a state in frontmatter rather than a routed stage, but the directory still
// exists on disk and findProjectRoot looks for these subdirs, so create them.
const STAGE_DIRS = [
  'vision', 'canvas', 'functional', 'implementation',
  'todo', 'in-progress', 'review', 'done',
];

let tempProject;

beforeEach(() => {
  tempProject = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-e2e-menu-'));
  // `.ctoc/` must exist BEFORE the menu runs: its presence is what makes
  // ensureInitialized() skip initProject(), keeping the fixture hermetic, and
  // it is the strongest findProjectRoot marker so the menu operates here.
  fs.mkdirSync(path.join(tempProject, '.ctoc', 'logs'), { recursive: true });
  for (const stage of STAGE_DIRS) {
    fs.mkdirSync(path.join(tempProject, 'plans', stage), { recursive: true });
  }
});

afterEach(() => {
  if (tempProject) {
    fs.rmSync(tempProject, { recursive: true, force: true });
    tempProject = null;
  }
});

/**
 * Spawn the real menu process inside the temp project.
 * @param {string[]} args - extra argv passed to menu.js (already split)
 * @returns {{ res: import('child_process').SpawnSyncReturns<string>, json: object }}
 */
function runMenu(args = []) {
  const res = spawnSync(process.execPath, [MENU, ...args], {
    cwd: tempProject,
    encoding: 'utf8',
  });
  // Surface spawn failures loudly rather than letting a later JSON.parse throw
  // a confusing error — a non-zero exit or stderr noise is itself a bug signal.
  assert.equal(res.status, 0,
    `menu.js exited ${res.status} for args [${args.join(' ')}]\nstderr: ${res.stderr}`);
  let json;
  try {
    json = JSON.parse(res.stdout);
  } catch (err) {
    assert.fail(
      `menu.js stdout was not valid JSON for args [${args.join(' ')}]: ` +
      `${err.message}\n--- stdout ---\n${res.stdout}\n--- stderr ---\n${res.stderr}`);
  }
  return { res, json };
}

/**
 * Write a minimally-valid plan file into a stage directory.
 * Frontmatter carries title, type and files: so the plan is coverage-aware and
 * readPlans() parses it without warnings.
 */
function writePlan(stage, name, { title } = {}) {
  const dir = path.join(tempProject, 'plans', stage);
  fs.mkdirSync(dir, { recursive: true });
  const body =
    `---\n` +
    `title: ${title || name}\n` +
    `type: ${stage}\n` +
    `files:\n` +
    `  - src/${name}.js\n` +
    `---\n\n` +
    `# ${title || name}\n\n` +
    `## Problem Statement\n${name} problem.\n`;
  fs.writeFileSync(path.join(dir, `${name}.md`), body);
}

/** Extract the integer count rendered after a stage label in the dashboard. */
function dashboardStageCount(text, label) {
  // Lines look like:  "    Functional    3"  (label padded to 14 chars).
  const re = new RegExp(`^\\s+${label}\\s+(\\d+)\\s*$`, 'm');
  const m = text.match(re);
  assert.ok(m, `dashboard line for stage "${label}" not found in:\n${text}`);
  return Number(m[1]);
}

describe('e2e: menu state machine via real process', () => {
  it('1. empty project renders the three sections all-zero with full action map', () => {
    const { json } = runMenu([]);

    // Three task-aligned sections, all expanded (▼), all zero.
    assert.match(json.text, /▼ Business \(0\)/, 'Business section header, 0 total');
    assert.match(json.text, /▼ Implementation \(0\)/, 'Implementation section header, 0 total');
    assert.match(json.text, /▼ Execution \(0\)/, 'Execution section header, 0 total');

    // Every stage line is present and zero.
    for (const label of ['Vision', 'Canvas', 'Functional', 'Implementation', 'Todo', 'In progress', 'Review', 'Done']) {
      assert.equal(dashboardStageCount(json.text, label), 0, `${label} should be 0 in empty project`);
    }

    // Empty project → inbox clear.
    assert.match(json.text, /Inbox clear/, 'empty project reports inbox clear');

    // The pipeline question and its four navigation actions exist.
    assert.ok(json.ask && Array.isArray(json.ask.questions) && json.ask.questions.length >= 1,
      'ask.questions present');
    assert.equal(json.ask.questions[0].header, 'Pipeline', 'first question is Pipeline');
    for (const k of ['Business', 'Implementation', 'Execution', 'More ▶']) {
      assert.ok(k in json.actions, `actions map carries "${k}"`);
    }
    assert.equal(json.actions['Business'], 'section business');
    assert.equal(json.actions['Implementation'], 'section implementation');
    assert.equal(json.actions['Execution'], 'section execution');
    assert.equal(json.actions['More ▶'], 'menu commands');
  });

  it('2. dashboard counts reflect the fixture exactly', () => {
    // Place a known, distinct number of plans per stage.
    writePlan('functional', 'fn-a');
    writePlan('functional', 'fn-b');
    writePlan('functional', 'fn-c');           // functional = 3
    writePlan('implementation', 'impl-a');     // implementation = 1
    writePlan('todo', 'todo-a');
    writePlan('todo', 'todo-b');               // todo = 2
    writePlan('done', 'done-a');
    writePlan('done', 'done-b');
    writePlan('done', 'done-c');
    writePlan('done', 'done-d');               // done = 4

    const { json } = runMenu([]);

    assert.equal(dashboardStageCount(json.text, 'Functional'), 3, 'functional count');
    assert.equal(dashboardStageCount(json.text, 'Implementation'), 1, 'implementation count');
    assert.equal(dashboardStageCount(json.text, 'Todo'), 2, 'todo count');
    assert.equal(dashboardStageCount(json.text, 'Done'), 4, 'done count');
    assert.equal(dashboardStageCount(json.text, 'Canvas'), 0, 'canvas count');

    // Section totals roll up the stage counts.
    assert.match(json.text, /▼ Business \(3\)/, 'Business total = vision0+canvas0+functional3');
    assert.match(json.text, /▼ Implementation \(3\)/, 'Implementation total = impl1+todo2');
    assert.match(json.text, /▼ Execution \(4\)/, 'Execution total = inProgress0+review0+done4');

    // Section descriptions in the pipeline question must echo the same numbers.
    const opts = json.ask.questions[0].options;
    const byLabel = Object.fromEntries(opts.map(o => [o.label, o.description]));
    assert.match(byLabel['Business'], /3 functional/, 'Business description names 3 functional');
    assert.match(byLabel['Implementation'], /1 impl/, 'Implementation description names 1 impl');
    assert.match(byLabel['Implementation'], /2 todo/, 'Implementation description names 2 todo');
    assert.match(byLabel['Execution'], /4 done/, 'Execution description names 4 done');
  });

  it('3. "section business" returns the Business sub-stages routed to browse', () => {
    writePlan('functional', 'fn-only');
    const { json } = runMenu(['section', 'business']);

    assert.equal(json.ask.questions[0].header, 'Business', 'header is Business');
    const labels = json.ask.questions[0].options.map(o => o.label);
    // Business = vision · canvas · functional, plus a Back option.
    assert.ok(labels.includes('Vision'), 'Vision stage offered');
    assert.ok(labels.includes('Canvas'), 'Canvas stage offered');
    assert.ok(labels.includes('Functional'), 'Functional stage offered');
    assert.ok(labels.some(l => /Back/.test(l)), 'a Back option is present');

    // Plan-file stages route to browse; Vision is special (Vision Mode).
    assert.equal(json.actions['Functional'], 'browse functional', 'Functional → browse functional');
    assert.equal(json.actions['Canvas'], 'browse canvas', 'Canvas → browse canvas');
    assert.equal(json.actions['Vision'], 'claude:vision', 'Vision → Vision Mode, not browse');
  });

  it('4. "browse functional" with 3 plans lists 3 numbered items mapped to plan actions', () => {
    writePlan('functional', 'alpha');
    writePlan('functional', 'beta');
    writePlan('functional', 'gamma');

    const { json } = runMenu(['browse', 'functional']);

    // Header line reports the count.
    assert.match(json.text, /\[functional\] \(3 items\)/, 'header reports 3 items');

    // Three numbered entries in the body.
    for (let i = 1; i <= 3; i++) {
      assert.match(json.text, new RegExp(`\\[${i}\\] `), `numbered item [${i}] rendered`);
    }

    // With ≤3 plans each plan is its own button; every plan maps to a `plan
    // functional/<file>.md` action keyed by its name (order-independent, so no
    // reliance on birthtime-tie FIFO ordering).
    for (const name of ['alpha', 'beta', 'gamma']) {
      assert.equal(json.actions[name], `plan functional/${name}.md`,
        `"${name}" button routes to its plan action`);
    }
    // Navigation affordances present.
    assert.ok('Create new' in json.actions, 'Create new offered');
    assert.equal(json.actions['Back'], '', 'Back returns to dashboard');
  });

  it('4b. "browse functional" with 4+ plans uses numbered-key actions', () => {
    const names = ['one', 'two', 'three', 'four', 'five'];
    names.forEach(n => writePlan('functional', n));

    const { json } = runMenu(['browse', 'functional']);
    assert.match(json.text, /\[functional\] \(5 items\)/, 'header reports 5 items');

    // 4+ plans: selection is by number key (1..N), not per-plan button. The
    // contract is a bijection between number keys 1..5 and the five plan files;
    // their relative order is readPlans' FIFO concern (birthtime ties make it
    // filesystem-dependent), so we assert the mapping covers every file exactly
    // once rather than pinning a specific order.
    const mapped = [];
    for (let i = 1; i <= 5; i++) {
      const action = json.actions[String(i)];
      assert.ok(action, `number key ${i} maps to a plan action`);
      assert.match(action, /^plan functional\/[a-z]+\.md$/, `key ${i} routes to a functional plan`);
      mapped.push(action);
    }
    const expected = names.map(n => `plan functional/${n}.md`).sort();
    assert.deepEqual(mapped.slice().sort(), expected,
      'number keys 1..5 map bijectively onto the five plan files');
  });

  it('5. "validate functional/<file>.md" returns a pre-transition validation result', () => {
    // A functional plan missing acceptance criteria → validateFunctionalToImpl
    // should flag it (valid:false). This proves the validator actually runs.
    writePlan('functional', 'needs-criteria', { title: 'Needs Criteria' });

    const { json } = runMenu(['validate', 'functional/needs-criteria.md']);

    assert.match(json.text, /Pre-transition validation: functional → implementation/,
      'validation header names the transition');
    assert.ok(json.validation, 'validation result object attached');
    assert.equal(typeof json.validation.valid, 'boolean', 'validation.valid is boolean');
    assert.ok(Array.isArray(json.validation.errors), 'errors is an array');
    assert.ok(Array.isArray(json.validation.warnings), 'warnings is an array');

    // Fixture has a Problem Statement but no acceptance/success criteria →
    // functional→implementation validation must FAIL on that missing criteria.
    assert.equal(json.validation.valid, false,
      'plan with no acceptance criteria fails functional→implementation validation');
    assert.ok(
      json.validation.errors.some(e => /acceptance|success/i.test(e)),
      'an error names the missing acceptance/success criteria');

    // When invalid, the screen offers an override path and a fix path.
    assert.ok('Approve anyway' in json.actions, 'override action offered for invalid plan');
    assert.equal(json.actions['Approve anyway'], 'claude:approve functional/needs-criteria.md');
    assert.equal(json.actions['Fix issues'], 'plan functional/needs-criteria.md');
  });

  it('5b. a complete functional plan passes validation and offers Confirm approve', () => {
    const dir = path.join(tempProject, 'plans', 'functional');
    fs.writeFileSync(path.join(dir, 'complete.md'),
      `---\ntitle: Complete\ntype: functional\nfiles:\n  - src/x.js\n---\n\n` +
      `# Complete\n\n## Problem Statement\nA real problem.\n\n` +
      `## Scope\nIn scope: the thing.\n\n` +
      `## Acceptance Criteria\n- It works.\n`);

    const { json } = runMenu(['validate', 'functional/complete.md']);
    assert.equal(json.validation.valid, true,
      'plan with problem + scope + acceptance criteria passes functional→implementation');
    assert.ok('Confirm approve' in json.actions, 'valid plan offers Confirm approve');
    assert.equal(json.actions['Confirm approve'], 'claude:approve functional/complete.md');
  });

  it('6. dashboard always renders WITH a second environment question when env is unset (v6.9.44)', () => {
    // settings.json present but WITHOUT general.environment → needsEnvironmentPrompt true.
    fs.writeFileSync(
      path.join(tempProject, '.ctoc', 'settings.json'),
      JSON.stringify({ general: { timezone: 'UTC' } }, null, 2));

    const { json } = runMenu([]);

    // The dashboard (overview) is NEVER replaced — all three sections render.
    assert.match(json.text, /▼ Business/, 'Business overview still visible under env prompt');
    assert.match(json.text, /▼ Implementation/, 'Implementation overview still visible');
    assert.match(json.text, /▼ Execution/, 'Execution overview still visible');

    // The environment prompt rides along as a SECOND question.
    assert.equal(json.ask.questions.length, 2, 'pipeline + environment = 2 questions');
    assert.equal(json.ask.questions[0].header, 'Pipeline', 'pipeline question is first (overview not gated)');
    assert.equal(json.ask.questions[1].header, 'Environment', 'environment question is second');

    // Pipeline navigation survives alongside the environment actions.
    assert.ok('Business' in json.actions, 'pipeline navigation intact');
    assert.equal(json.actions['Development'], 'claude:set-environment dev');
    assert.equal(json.actions['Decide later'], 'claude:env-decide-later',
      '"Decide later" must not loop back into a prompt-gate');
  });

  it('6b. env SET → plain dashboard, single question, no environment banner', () => {
    fs.writeFileSync(
      path.join(tempProject, '.ctoc', 'settings.json'),
      JSON.stringify({ general: { environment: 'prod' } }, null, 2));

    const { json } = runMenu([]);
    assert.match(json.text, /▼ Business/, 'overview visible');
    assert.equal(json.ask.questions.length, 1, 'only the pipeline question');
    assert.ok(!json.text.includes('No CTOC environment'), 'no environment banner');
    assert.ok(!('Development' in json.actions), 'no environment actions when env is set');
  });

  it('7. unknown/garbage args fall back to the dashboard without crashing', () => {
    for (const args of [
      ['totally-bogus-command'],
      ['plan'],                      // missing ref → dashboard
      ['plan', 'no-slash-here'],     // no slash → dashboard
      ['validate'],                  // missing ref → dashboard
      ['section', 'nonexistent'],    // handled section error path (not dashboard)
      ['browse', 'not-a-stage'],     // unknown stage error path
      [''],                          // empty-string arg
    ]) {
      const { res, json } = runMenu(args);
      assert.equal(res.status, 0, `args [${args.join(' ')}] exit 0`);
      // Every output is valid JSON with the contract shape.
      assert.ok(json.ask && Array.isArray(json.ask.questions),
        `args [${args.join(' ')}] produce a question`);
      assert.ok(json.actions && typeof json.actions === 'object',
        `args [${args.join(' ')}] produce an actions map`);
    }

    // Spot-check the fall-throughs that must land on the dashboard.
    for (const args of [['totally-bogus-command'], ['plan'], ['plan', 'no-slash-here'], ['validate']]) {
      const { json } = runMenu(args);
      assert.equal(json.ask.questions[0].header, 'Pipeline',
        `args [${args.join(' ')}] fall back to the pipeline dashboard`);
    }

    // The error paths are handled (a real screen), not a crash.
    const unknownSection = runMenu(['section', 'nonexistent']).json;
    assert.match(unknownSection.text, /Unknown section/, 'unknown section reports an error screen');
    const unknownStage = runMenu(['browse', 'not-a-stage']).json;
    assert.match(unknownStage.text, /Unknown stage/, 'unknown stage reports an error screen');
  });
});
