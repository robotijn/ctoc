/**
 * Menu Screens Tests
 * Unit tests for all screen JSON outputs from the state machine.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { test, describe, beforeEach, afterEach } = require('node:test');
const gateWords = require('../src/lib/gate-words.js');

// Re-pointed 2026-07-20: the plan screen says what the MOMENT is, never its number.
const NO_GATE_NUMBER = /\bgates?\s*[0-9]/i;

describe('Menu Screens Tests', () => {
  let testDir;
  let plansDir;
  let menuScreens;

  beforeEach(() => {
    // Create a temporary project directory
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-test-'));
    plansDir = path.join(testDir, 'plans');

    // Create all stage directories
    const stages = ['functional', 'implementation', 'todo', 'in-progress', 'review', 'done', 'vision'];
    stages.forEach(stage => {
      fs.mkdirSync(path.join(plansDir, stage), { recursive: true });
    });

    // Create .ctoc directory
    fs.mkdirSync(path.join(testDir, '.ctoc'), { recursive: true });

    // Create a VERSION file at the expected location
    // menu-screens reads from __dirname/../VERSION which is the ctoc root
    // For testing, we use the projectPath param

    // Fresh require
    delete require.cache[require.resolve('../src/lib/menu-screens.js')];
    menuScreens = require('../src/lib/menu-screens.js');
  });

  afterEach(() => {
    // Clean up
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  // Helper to create a plan file
  function createPlan(stage, name, content) {
    const filePath = path.join(plansDir, stage, `${name}.md`);
    fs.writeFileSync(filePath, content || `# ${name}\n\n## Problem Statement\nTest problem.\n\n## Scope\nTest scope.\n`);
    return filePath;
  }

  test('dashboardPipeline returns valid JSON structure', () => {
    const result = menuScreens.dashboardPipeline(testDir);

    assert.ok(result.text, 'Should have text');
    assert.ok(result.ask, 'Should have ask');
    assert.ok(result.actions, 'Should have actions');
    assert.ok(result.text.endsWith('\n\n\n'), 'Text should end with 3 newlines');
    assert.ok(result.ask.questions, 'Should have questions array');
    assert.ok(result.ask.questions.length > 0, 'Should have at least one question');
    console.log('# dashboardPipeline returns valid JSON structure');
  });

  test('dashboardPipeline (v7) shows 3 sections + More', () => {
    const result = menuScreens.dashboardPipeline(testDir);
    const labels = result.ask.questions[0].options.map(o => o.label);

    assert.ok(labels.includes('Business'), 'Should have Business section');
    assert.ok(labels.includes('Implementation'), 'Should have Implementation section');
    assert.ok(labels.includes('Execution'), 'Should have Execution section');
    assert.ok(labels.some(l => l.includes('More')), 'Should have More');
    console.log('# dashboardPipeline (v7) shows 3 sections + More');
  });

  test('dashboardPipeline labels are stable (no counts in label)', () => {
    const result = menuScreens.dashboardPipeline(testDir);
    const labels = result.ask.questions[0].options.map(o => o.label);

    // v7 stability requirement: labels are pure section names; counts go in description
    for (const label of ['Business', 'Implementation', 'Execution']) {
      assert.ok(labels.includes(label), `${label} should be a stable label`);
      assert.ok(!label.match(/\(\d+\)/), `${label} should not embed a count`);
    }
    console.log('# dashboardPipeline labels are stable');
  });

  test('dashboardPipeline descriptions surface per-stage counts', () => {
    const result = menuScreens.dashboardPipeline(testDir);
    const descs = result.ask.questions[0].options.map(o => o.description || '');

    // Counts appear in descriptions, not labels
    assert.ok(descs.some(d => d.includes('total')), 'descriptions include section totals');
    console.log('# dashboardPipeline descriptions surface counts');
  });

  test('dashboardPipeline actions map to correct commands', () => {
    const result = menuScreens.dashboardPipeline(testDir);

    // Check that More maps to menu commands
    assert.strictEqual(result.actions['More ▶'], 'menu commands');
    console.log('# dashboardPipeline actions map to correct commands');
  });

  test('dashboardCommands returns valid JSON structure', () => {
    const result = menuScreens.dashboardCommands(testDir);

    assert.ok(result.text, 'Should have text');
    assert.ok(result.ask, 'Should have ask');
    assert.ok(result.actions, 'Should have actions');
    assert.ok(result.text.endsWith('\n\n\n'), 'Text should end with 3 newlines');
    console.log('# dashboardCommands returns valid JSON structure');
  });

  test('dashboardCommands has Pipeline back option', () => {
    const result = menuScreens.dashboardCommands(testDir);
    const labels = result.ask.questions[0].options.map(o => o.label);

    assert.ok(labels.some(l => l.includes('Pipeline')), 'Should have Pipeline back option');
    assert.strictEqual(result.actions['◀ Pipeline'], '', 'Pipeline should map to empty string (re-run)');
    console.log('# dashboardCommands has Pipeline back option');
  });

  test('stageBrowse with empty stage returns valid JSON', () => {
    const result = menuScreens.stageBrowse('functional', testDir);

    assert.ok(result.text, 'Should have text');
    assert.ok(result.text.includes('[functional]'), 'Should show stage name');
    assert.ok(result.text.includes('0 items'), 'Should show 0 items');
    assert.strictEqual(result.inputMode, 'plan-select', 'browse is free-text plan-select');
    assert.strictEqual(result.actions['n'], 'claude:create-plan functional', "'n' creates a new plan");
    assert.ok('b' in result.actions, "Should have 'b' back action key");
    // 'b' maps to '' (re-run dashboard), which is falsy but intentional
    assert.strictEqual(result.actions['b'], '', "'b' should map to empty string (dashboard)");
    console.log('# stageBrowse with empty stage returns valid JSON');
  });

  test('stageBrowse with 1-3 plans numbers each plan (numbers open plans)', () => {
    createPlan('functional', 'plan-a');
    createPlan('functional', 'plan-b');

    const result = menuScreens.stageBrowse('functional', testDir);

    assert.strictEqual(result.inputMode, 'plan-select');
    assert.match(result.actions['1'], /^plan functional\/plan-[ab]\.md$/, 'number 1 opens a plan');
    assert.match(result.actions['2'], /^plan functional\/plan-[ab]\.md$/, 'number 2 opens a plan');
    const mapped = [result.actions['1'], result.actions['2']].sort();
    assert.deepStrictEqual(mapped, ['plan functional/plan-a.md', 'plan functional/plan-b.md'],
      'numbers 1-2 map bijectively to the two plans');
    console.log('# stageBrowse with 1-3 plans numbers each plan');
  });

  test('stageBrowse with 4+ plans: numbers map ONLY to plans', () => {
    createPlan('functional', 'plan-a');
    createPlan('functional', 'plan-b');
    createPlan('functional', 'plan-c');
    createPlan('functional', 'plan-d');

    const result = menuScreens.stageBrowse('functional', testDir);

    assert.ok(result.actions['1'], 'Should have number 1 action');
    assert.ok(result.actions['4'], 'Should have number 4 action');
    // EVERY numeric action key opens a plan — never a meta-action (the bug).
    for (const [key, val] of Object.entries(result.actions)) {
      if (/^\d+$/.test(key)) {
        assert.match(val, /^plan functional\/.+\.md$/, `numeric key ${key} must open a plan, got '${val}'`);
      }
    }
    console.log('# stageBrowse with 4+ plans: numbers map only to plans');
  });

  test('stageBrowse: every plan including the 25th is reachable by number', () => {
    for (let i = 1; i <= 25; i++) createPlan('functional', `p${String(i).padStart(2, '0')}`);

    const result = menuScreens.stageBrowse('functional', testDir);

    assert.ok(result.actions['25'], 'plan 25 must be reachable by its number (multi-digit)');
    assert.match(result.actions['25'], /^plan functional\/.+\.md$/);
    assert.notStrictEqual(result.actions['1'], '', "number 1 must open a plan, not 'back'");
    console.log('# stageBrowse: plan 25 reachable; numbers never meta-actions');
  });

  test('stageBrowse with unknown stage shows error', () => {
    const result = menuScreens.stageBrowse('invalid-stage', testDir);

    assert.ok(result.text.includes('Unknown stage'), 'Should show error for unknown stage');
    console.log('# stageBrowse with unknown stage shows error');
  });

  test('stageBrowse(vision) redirects to Vision Mode — never dead-ends', () => {
    const result = menuScreens.stageBrowse('vision', testDir);

    // Regression: 'browse vision' used to fall through STAGE_FOLDERS and
    // dead-end on "Unknown stage: vision", stranding the user.
    assert.ok(!result.text.includes('Unknown stage'),
      'browse vision must NOT dead-end — vision is handled by Vision Mode');
    assert.strictEqual(result.actions['Enter Vision Mode'], 'claude:vision',
      'stageBrowse(vision) must offer entry to Vision Mode');
    console.log('# stageBrowse(vision) redirects to Vision Mode');
  });

  test('sectionBrowse(business) routes Vision to Vision Mode, not browse', () => {
    const result = menuScreens.sectionBrowse('business', testDir);

    // Regression: Business → Vision used to map to `browse vision`, which
    // dead-ended. It must enter Vision Mode so the user can create a vision.
    assert.strictEqual(result.actions['Vision'], 'claude:vision',
      'Business → Vision must enter Vision Mode (create/edit/decompose)');
    // Canvas and Functional remain real plan-file stage browses.
    assert.strictEqual(result.actions['Canvas'], 'browse canvas',
      'Business → Canvas still browses the canvas plan stage');
    assert.strictEqual(result.actions['Functional'], 'browse functional',
      'Business → Functional still browses the functional plan stage');
    console.log('# sectionBrowse(business) routes Vision to Vision Mode');
  });

  test('route("browse vision") reaches Vision Mode', () => {
    const result = menuScreens.route(['browse', 'vision'], testDir);

    assert.ok(!result.text.includes('Unknown stage'),
      'route browse vision must not produce Unknown stage');
    assert.strictEqual(result.actions['Enter Vision Mode'], 'claude:vision',
      'route browse vision must route to Vision Mode');
    console.log('# route browse vision reaches Vision Mode');
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Opening a plan is a QUESTION now, not a menu.
  //
  // The four screens these tests used to call — planActions, planActionsMore,
  // reviewActions, discussMenu — are gone. They asked "What would you like to do
  // with this plan?" over a list of navigation routes; the owner replaced that
  // with questions. What follows re-asserts, through the REAL `plan` route, that
  // every DECISION those screens carried still reaches the human. The navigation
  // rows (Back to list, ◀ Actions, Back to actions, Continue) are intentionally
  // gone — removing them was the point, so no test may demand them back.
  // ─────────────────────────────────────────────────────────────────────────

  /** All option labels across every question on a screen. */
  function allLabels(result) {
    return result.ask.questions.flatMap(q => q.options.map(o => o.label));
  }

  test('opening a plan asks a question and carries View/Edit + Discuss + Delete', () => {
    createPlan('functional', 'my-plan');

    const result = menuScreens.route(['plan', 'functional/my-plan.md'], testDir);
    const labels = allLabels(result);

    assert.ok(result.ask.questions[0].question.length > 0, 'a plan screen ASKS something');
    assert.ok(labels.includes('View/Edit'), 'View/Edit survives (See and Edit merged)');
    assert.ok(labels.includes('Discuss'), 'critique survives');
    assert.ok(labels.includes('Delete'), 'Delete survives — it used to need the "more" sub-menu');
    assert.ok(!labels.includes('View'), 'View is merged into View/Edit, not a separate option');
    assert.ok(result.actions['View/Edit'].startsWith('claude:view-edit'),
      'View/Edit maps to the merged claude:view-edit action');
    assert.ok(result.actions['Delete'].startsWith('claude:delete'), 'Delete maps to claude:delete');
  });

  test('a gate plan is asked what the MOMENT is, and the affirmative crosses via the gate-safe path', () => {
    createPlan('functional', 'my-plan');

    const result = menuScreens.route(['plan', 'functional/my-plan.md'], testDir);

    // INVERTED (2026-07-20): was `/Approve my-plan across Gate 1\?/` with the message
    // "the gate question names the gate". Naming the gate IS the defect the human
    // rejected; the question now names the MOMENT and the plan by its title.
    assert.equal(result.ask.questions[0].question, gateWords.question('functional', 'my-plan'));
    assert.equal(result.ask.questions[0].header, gateWords.chip('functional'));
    assert.doesNotMatch(result.ask.questions[0].question, NO_GATE_NUMBER,
      'a gate number must never reach the question a human reads');
    // TIGHTER than the screen it replaces: Approve used to route through `validate`
    // and a second confirm. It now goes straight to the gate-safe `stream approve`
    // (approvePlan — validates, refuses an invalid transition, stamps approved_by).
    assert.equal(result.actions[gateWords.approveLabel('functional')], 'stream approve functional/my-plan.md');
    // The validation detail screen (and its deliberate override) stays reachable.
    assert.equal(result.actions['Check validation'], 'validate functional/my-plan.md');
  });

  test('a FAILING review plan drops the affirmative OPTION but keeps BOTH send-backs, worded by what is wrong', () => {
    // `reviewed-plan` has a body but no verify evidence, so review→done validation
    // FAILS. TIGHTENED (2026-07-28, plan 00155 — "an empty plan is a broken file,
    // not a decision"): this is the owner's exact rejected screen — a review send-back
    // screen whose option 2 read "Approve — approving is refused here". An option
    // validation has already refused must not be an OPTION, so the affirmative is now
    // ABSENT from what the human is offered. The `stream approve` ACTION string still
    // survives (a machine identifier no human reads), asserted below.
    createPlan('review', 'reviewed-plan');

    const result = menuScreens.route(['plan', 'review/reviewed-plan.md'], testDir);
    const labels = allLabels(result);

    assert.ok(!labels.includes(gateWords.approveLabel('review')),
      'the self-refusing affirmative option is NOT offered on a failing plan');
    // The way out of a failed check is still reachable — Check validation leads.
    assert.ok(labels.includes('Check validation'), 'Check validation is offered as the route past a failed check');
    for (const sb of gateWords.SEND_BACK) {
      assert.ok(labels.includes(sb.label), `the send-back is offered: ${sb.label}`);
      assert.ok(result.actions[sb.label].startsWith('claude:reject'), 'a send-back rejects');
    }
    assert.ok(labels.includes('View/Edit'), 'Should have View/Edit');
    assert.ok(!labels.includes('View'), 'View is merged into View/Edit');

    // The FENCE: no label a human reads may name a gate number or a raw stage.
    for (const l of labels) {
      assert.doesNotMatch(l, NO_GATE_NUMBER, `an option label names a gate number: ${l}`);
      assert.doesNotMatch(l, /\b(functional|implementation|todo|review)\b/i,
        `an option label names a raw stage: ${l}`);
      assert.doesNotMatch(l, /\brefus(e|ed|es)\b/i, `an offered option announces its own refusal: ${l}`);
    }

    assert.equal(result.actions[gateWords.approveLabel('review')], 'stream approve review/reviewed-plan.md',
      'the affirmative ACTION still crosses through the gate-safe approvePlan where no human reads it');
    // The ACTION values keep the stage identifier — no human reads them.
    const rejects = Object.values(result.actions).filter(v => String(v).startsWith('claude:reject'));
    assert.deepStrictEqual(rejects.sort(), [
      'claude:reject review/reviewed-plan.md functional',
      'claude:reject review/reviewed-plan.md implementation',
    ], 'the reject action strings are byte-identical to what they always were');
  });

  test('"Create new" survives on the stage list, where creating a plan belongs', () => {
    createPlan('functional', 'my-plan');

    // It used to sit on the plan-actions menu, which is an odd place to create a
    // DIFFERENT plan. The stage list already carried it as the `n` word shortcut.
    const list = menuScreens.route(['browse', 'functional'], testDir);
    assert.equal(list.actions['n'], 'claude:create-plan functional');
    assert.equal(list.actions['new'], 'claude:create-plan functional');
  });

  test('validateScreen returns validation results', () => {
    createPlan('functional', 'valid-plan',
      '# Valid Plan\n\n## Problem Statement\nTest.\n\n## Success Criteria\nTest.\n\n## Scope\nTest.\n');

    const result = menuScreens.validateScreen('functional', 'valid-plan.md', testDir);

    assert.ok(result.text, 'Should have text');
    assert.ok(result.text.includes('Pre-transition'), 'Should show pre-transition header');
    assert.ok(result.ask, 'Should have ask');
    assert.ok(result.actions, 'Should have actions');
    assert.ok(result.validation, 'Should include validation result');
    console.log('# validateScreen returns validation results');
  });

  test('validateScreen shows fix option on validation failure', () => {
    // Plan missing problem statement
    createPlan('functional', 'bad-plan', '# Just a Title\n\nNo proper structure.\n');

    const result = menuScreens.validateScreen('functional', 'bad-plan.md', testDir);
    const labels = result.ask.questions[0].options.map(o => o.label);

    assert.ok(labels.some(l => l.includes('Fix issues') || l.includes('Approve anyway')), 'Should have fix or override option');
    console.log('# validateScreen shows fix option on validation failure');
  });

  // R2-C2 item 3 — the human gate needs an EXPLICIT human click (human override,
  // 2026-07). The one-turn `autoApprove` signal is DELETED: no screen field may
  // let a driver run an approve in the same turn. The approve→validate ROUTE stays
  // (the planActions/reviewActions pins above survive), and a clean validation
  // still offers a single decisive `Confirm approve` action the human must click
  // (no redundant "Proceed?" second ask, no Fix option — there is nothing to fix);
  // a failed validation demotes "Approve anyway" to the LAST option and records
  // that it is an override.
  test('validateScreen (clean) requires an EXPLICIT Confirm approve click, carries NO autoApprove signal', () => {
    createPlan('functional', 'clean-plan',
      '---\ntitle: Clean\ntype: functional\nfiles:\n  - src/x.js\n---\n\n' +
      '# Clean\n\n## Problem Statement\nReal problem.\n\n## Scope\nThe thing.\n\n## Acceptance Criteria\n- It works.\n');

    const result = menuScreens.validateScreen('functional', 'clean-plan.md', testDir);
    assert.strictEqual(result.validation.valid, true, 'fixture passes validation');
    // The one-turn signal is GONE — nothing can auto-run the approve.
    assert.strictEqual(result.autoApprove, undefined, 'no autoApprove signal on any screen (human must click)');
    // The approve action is present and unchanged (route pins survive) — the human
    // clicks it deliberately.
    assert.strictEqual(result.actions['Confirm approve'], 'claude:approve functional/clean-plan.md');
    const labels = result.ask.questions[0].options.map(o => o.label);
    assert.ok(labels.includes('Confirm approve'), 'clean validation offers an explicit Confirm approve click');
    assert.ok(!labels.includes('Fix issues'), 'no Fix option on a clean validation (nothing to fix)');
    console.log('# validateScreen clean requires explicit Confirm approve, no autoApprove');
  });

  test('validateScreen (failed) demotes "Approve anyway" to the LAST option, records override', () => {
    createPlan('functional', 'broken-plan', '# Just a Title\n\nNo structure.\n');

    const result = menuScreens.validateScreen('functional', 'broken-plan.md', testDir);
    assert.strictEqual(result.validation.valid, false, 'fixture fails validation');
    assert.strictEqual(result.autoApprove, undefined, 'no autoApprove signal on any screen');
    const labels = result.ask.questions[0].options.map(o => o.label);
    // "Approve anyway" is the LAST option — never first, never recommended.
    assert.strictEqual(labels[labels.length - 1], 'Approve anyway', 'override is the last option');
    assert.ok(labels.includes('Fix issues'), 'Fix issues offered on failure');
    // The override is recorded as such (description names it an override).
    const anyway = result.ask.questions[0].options.find(o => o.label === 'Approve anyway');
    assert.match(anyway.description, /override/i, 'Approve anyway records an override');
    assert.strictEqual(result.actions['Approve anyway'], 'claude:approve functional/broken-plan.md --override');
    console.log('# validateScreen failed demotes Approve anyway to last');
  });

  // R6-A — the forced crossing must be AUDITABLE at the action-string surface.
  // "Approve anyway" is the one place a human overrides a failed gate; it must
  // carry the `--override` token so the start.md claude:approve recipe records
  // override:true + reason via approvePlan. A bare claude:approve makes the
  // override invisible at the menu surface.
  test('validateScreen (failed) "Approve anyway" carries the --override token', () => {
    createPlan('functional', 'override-plan', '# Just a Title\n\nNo structure.\n');

    const result = menuScreens.validateScreen('functional', 'override-plan.md', testDir);
    assert.strictEqual(result.autoApprove, undefined, 'no autoApprove signal on any screen');
    const anyway = result.actions['Approve anyway'];
    assert.strictEqual(anyway, 'claude:approve functional/override-plan.md --override',
      'forced crossing carries the --override token so it is auditable');
    assert.ok(anyway.includes('--override'), 'override token present on the forced crossing');
    console.log('# validateScreen failed Approve anyway carries --override');
  });

  test('validateScreen (clean) "Confirm approve" carries NO override token', () => {
    createPlan('functional', 'clean-noverride',
      '---\ntitle: Clean\ntype: functional\nfiles:\n  - src/x.js\n---\n\n' +
      '# Clean\n\n## Problem Statement\nReal problem.\n\n## Scope\nThe thing.\n\n## Acceptance Criteria\n- It works.\n');

    const result = menuScreens.validateScreen('functional', 'clean-noverride.md', testDir);
    assert.strictEqual(result.autoApprove, undefined, 'no autoApprove signal on any screen');
    const confirm = result.actions['Confirm approve'];
    assert.strictEqual(confirm, 'claude:approve functional/clean-noverride.md',
      'the clean approve path is unchanged — no override');
    assert.ok(!confirm.includes('--override'), 'clean approve never carries an override token');
    console.log('# validateScreen clean Confirm approve has no override');
  });

  // R6-A hardening — action strings are SPACE-DELIMITED, model-interpreted recipes
  // (`claude:approve <stage>/<file>`). A plan filename carrying whitespace or a
  // control character injects extra tokens into that recipe — e.g. `bar --override .md`
  // rides a `--override` token onto a CLEAN crossing, defeating the audit property
  // that a forced crossing is byte-distinguishable from a clean one. isUnsafePlanFile
  // is the shared guard; a whitespace/control name must be REFUSED (invalidPlanRefScreen),
  // so no ref is ever interpolated into an emitted `claude:*` action.
  const injectionNames = [
    ['space (injects --override token)', 'bar --override .md'],
    ['plain space', 'a b.md'],
    ['tab', 'a\tb.md'],
    ['carriage return', 'a\rb.md'],
    ['newline', 'a\nb.md'],
    ['form feed', 'a\fb.md'],
    ['vertical tab', 'a\vb.md'],
    ['NUL control char', 'a\x01b.md'],
  ];
  for (const [desc, name] of injectionNames) {
    test(`validateScreen refuses a plan filename with ${desc} — no token injection`, () => {
      const result = menuScreens.validateScreen('functional', name, testDir);
      // Refused as an invalid reference (the traversal/injection guard), never
      // resolved into an approve recipe.
      assert.match(result.text, /Refusing a reference that escapes/,
        'whitespace/control filename is refused, not interpolated');
      const emitted = Object.values(result.actions);
      for (const action of emitted) {
        assert.ok(!action.includes('claude:'),
          `refused ref must emit no claude: recipe (got "${action}")`);
        assert.ok(!action.includes('--override'),
          `refused ref must never carry an --override token (got "${action}")`);
      }
      assert.strictEqual(result.actions['Approve anyway'], undefined, 'no override action on a refused ref');
      assert.strictEqual(result.actions['Confirm approve'], undefined, 'no approve action on a refused ref');
      console.log(`# validateScreen refuses injection filename: ${desc}`);
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // HUMAN-GATE Approve affordance. The Approve option must be gated on the REAL
  // crossable set (HUMAN_GATES: functional→implementation, implementation→todo,
  // review→done), NOT on the full pipeline flow NEXT_STAGE. approvePlan throws
  // "Unknown plan location" for any non-gate stage; offering Approve there (todo,
  // canvas, in-progress) is a bug. The `autoApprove` one-turn signal is DELETED
  // everywhere (human override, 2026-07): no screen field may let a driver cross
  // a gate in the same turn, so every screen's `autoApprove` is `undefined`.
  // Below: todo & canvas must NOT offer a claude:approve action; the three real
  // gates MUST keep an explicit Confirm approve click (no regression).
  // ─────────────────────────────────────────────────────────────────────────

  test('plan route (todo) does NOT offer an Approve-to-next-stage action', () => {
    createPlan('todo', 'queued-plan');

    const result = menuScreens.route(['plan', 'todo/queued-plan.md'], testDir);
    const labels = allLabels(result);
    assert.ok(!labels.some(l => l.startsWith('Approve')),
      'todo is not a human gate — no Approve option (approvePlan throws Unknown plan location)');
    assert.ok(!Object.keys(result.actions).some(k => k.startsWith('Approve')),
      'no Approve action string for a todo plan');
    // The gate question must not appear at all for a non-gate stage.
    assert.doesNotMatch(result.ask.questions[0].question, /across Gate/,
      'a non-gate plan is never asked a gate question');
    // Non-approve affordances remain.
    assert.ok(labels.includes('Discuss') && labels.includes('View/Edit'),
      'discuss/view affordances are untouched for todo');
  });

  test('plan route (canvas) does NOT offer an Approve-to-next-stage action', () => {
    fs.mkdirSync(path.join(plansDir, 'canvas'), { recursive: true });
    createPlan('canvas', 'canvas-plan');

    const result = menuScreens.route(['plan', 'canvas/canvas-plan.md'], testDir);
    const labels = allLabels(result);
    assert.ok(!labels.some(l => l.startsWith('Approve')),
      'canvas is not a human gate — no Approve option');
    assert.ok(!Object.keys(result.actions).some(k => k.startsWith('Approve')),
      'no Approve action string for a canvas plan');
  });

  test('validateScreen (todo) carries no autoApprove signal and no claude:approve action', () => {
    createPlan('todo', 'queued-plan');

    const result = menuScreens.validateScreen('todo', 'queued-plan.md', testDir);
    assert.strictEqual(result.autoApprove, undefined,
      'todo is not a human gate — the one-turn signal is deleted everywhere');
    assert.ok(!Object.values(result.actions).some(v => typeof v === 'string' && v.startsWith('claude:approve')),
      'no claude:approve action for a non-gate todo plan');
    console.log('# validateScreen todo no autoApprove');
  });

  test('validateScreen (canvas) carries no autoApprove signal and no claude:approve action', () => {
    fs.mkdirSync(path.join(plansDir, 'canvas'), { recursive: true });
    createPlan('canvas', 'canvas-plan');

    const result = menuScreens.validateScreen('canvas', 'canvas-plan.md', testDir);
    assert.strictEqual(result.autoApprove, undefined,
      'canvas is not a human gate — the one-turn signal is deleted everywhere');
    assert.ok(!Object.values(result.actions).some(v => typeof v === 'string' && v.startsWith('claude:approve')),
      'no claude:approve action for a non-gate canvas plan');
    console.log('# validateScreen canvas no autoApprove');
  });

  test('the plan route STILL offers the build crossing at a real gate (no regression)', () => {
    createPlan('implementation', 'impl-plan');

    const result = menuScreens.route(['plan', 'implementation/impl-plan.md'], testDir);
    const labels = allLabels(result);
    // INVERTED (2026-07-20): was the literal 'Approve' label and
    // `/Approve impl-plan across Gate 2\?/` with the message "the gate is named
    // outright". Naming the gate outright is exactly what the human rejected.
    assert.ok(labels.includes(gateWords.approveLabel('implementation')),
      'this is a real human gate — it keeps its affirmative option');
    assert.equal(result.ask.questions[0].question, gateWords.question('implementation', 'impl-plan'));
    assert.doesNotMatch(result.ask.questions[0].question, NO_GATE_NUMBER,
      'the question must never name a gate number');
    assert.strictEqual(result.actions[gateWords.approveLabel('implementation')],
      'stream approve implementation/impl-plan.md',
      'the affirmative crosses through the gate-safe approvePlan');
    assert.strictEqual(result.actions['Check validation'], 'validate implementation/impl-plan.md',
      'the validation detail screen stays reachable at the real gate');
  });

  test('validateScreen (implementation, clean) STILL offers an explicit Confirm approve click (real gate), no autoApprove', () => {
    createPlan('implementation', 'impl-clean',
      '---\ntitle: Impl\ntype: implementation\nfiles:\n  - src/x.js\n---\n\n' +
      '# Impl\n\n## Implementation\nTechnical approach here.\n\n## Scope\nThe thing.\n');

    const result = menuScreens.validateScreen('implementation', 'impl-clean.md', testDir);
    assert.strictEqual(result.autoApprove, undefined, 'no one-turn signal even at a real gate — the human clicks');
    assert.strictEqual(result.actions['Confirm approve'], 'claude:approve implementation/impl-clean.md',
      'real-gate approve action unchanged — human clicks Confirm approve');
    const labels = result.ask.questions[0].options.map(o => o.label);
    assert.ok(labels.includes('Confirm approve'), 'the explicit Confirm approve click survives at a real gate');
    console.log('# validateScreen implementation clean requires explicit Confirm approve');
  });

  test('all text fields end with triple newline', () => {
    createPlan('functional', 'plan-a');

    const screens = [
      menuScreens.dashboardPipeline(testDir),
      menuScreens.dashboardCommands(testDir),
      menuScreens.stageBrowse('functional', testDir),
      // The plan screen replaces planActions / planActionsMore / discussMenu and
      // must satisfy the same text protocol.
      menuScreens.route(['plan', 'functional/plan-a.md'], testDir),
      menuScreens.route(['plan', 'review/plan-a.md'], testDir),
      menuScreens.validateScreen('functional', 'plan-a.md', testDir)
    ];

    screens.forEach((screen, i) => {
      assert.ok(screen.text.endsWith('\n\n\n'), `Screen ${i} text should end with \\n\\n\\n`);
    });
    console.log('# all text fields end with triple newline');
  });

  test('all screens have actions mapping for every option', () => {
    createPlan('functional', 'plan-a');

    // AskUserQuestion-driven screens: every option label maps to an action.
    const askScreens = [
      menuScreens.dashboardPipeline(testDir),
      menuScreens.dashboardCommands(testDir),
      // The plan screen replaces planActions / planActionsMore / discussMenu. It
      // asks more than one question (the decision, plus the plan's own lifecycle
      // decisions riding along), so EVERY question is checked — a stricter sweep
      // than the first-question-only check it replaces.
      menuScreens.route(['plan', 'functional/plan-a.md'], testDir),
      menuScreens.route(['plan', 'todo/plan-a.md'], testDir)
    ];

    askScreens.forEach((screen, i) => {
      screen.ask.questions.forEach(q => {
        q.options.forEach(opt => {
          const hasAction = opt.label in screen.actions;
          // Allow "Other" options that don't map to actions
          if (!hasAction && opt.label !== 'Other') {
            assert.ok(opt.label in screen.actions,
              `Screen ${i}: option "${opt.label}" has no action mapping`);
          }
        });
      });
    });

    // Free-text plan-select screens (browse) carry no AskUserQuestion: every
    // action key must be a plan number or a navigation word (n/new/b/back).
    const browse = menuScreens.stageBrowse('functional', testDir);
    assert.strictEqual(browse.inputMode, 'plan-select');
    assert.ok(!('ask' in browse), 'plan-select screens carry no AskUserQuestion');
    // Nav words include the bulk word shortcuts: discuss (functional +
    // implementation) and todo-all (implementation only). Numbers still open a
    // single plan exclusively.
    for (const key of Object.keys(browse.actions)) {
      assert.ok(/^\d+$/.test(key) || ['n', 'new', 'b', 'back', 'discuss', 'todo-all'].includes(key),
        `browse action key "${key}" must be a number or a nav word`);
    }
    console.log('# all screens have actions mapping for every option');
  });

  // R2-C2 item 4 — review `done-all` (W3), menu-side. stageBrowse on the review
  // stage registers a WORD shortcut `done-all-<parent>` per distinct parent among
  // the review plans, mapping to the action key `claude:done-all-<parent>` whose
  // recipe (approveSubplans(parent, 'review')) already lives in start.md (same wave).
  // Never a numbered option; the session model executes the recipe.
  test('stageBrowse(review) registers a done-all-<parent> word key per parent', () => {
    createPlan('review', 'featx-s1-alpha',
      '---\ntitle: A\ntype: implementation\nparent_plan: featx\n---\n\n# A\n');
    createPlan('review', 'featx-s2-beta',
      '---\ntitle: B\ntype: implementation\nparent_plan: featx\n---\n\n# B\n');
    createPlan('review', 'featy-s1-gamma',
      '---\ntitle: C\ntype: implementation\nparent_plan: featy\n---\n\n# C\n');

    const result = menuScreens.stageBrowse('review', testDir);

    // Per-parent action keys, never a bare number.
    assert.strictEqual(result.actions['done-all-featx'], 'claude:done-all-featx',
      'done-all key for parent featx maps to its approveSubplans recipe');
    assert.strictEqual(result.actions['done-all-featy'], 'claude:done-all-featy',
      'done-all key for parent featy maps to its approveSubplans recipe');
    // No numeric key ever triggers a done-all (numbers open a single plan).
    for (const [k, v] of Object.entries(result.actions)) {
      if (/^\d+$/.test(k)) assert.ok(!/done-all/.test(v), `numeric key ${k} must not be a done-all`);
    }
    // The list hint names the done-all shortcut so it is discoverable.
    assert.match(result.text, /done-all/, 'review list hint names the done-all shortcut');
    console.log('# stageBrowse(review) registers done-all-<parent> keys');
  });

  test('stageBrowse(review) emits no done-all key when no plan declares a parent', () => {
    createPlan('review', 'orphan-plan', '---\ntitle: O\ntype: implementation\n---\n\n# O\n');
    const result = menuScreens.stageBrowse('review', testDir);
    const doneAllKeys = Object.keys(result.actions).filter(k => k.startsWith('done-all'));
    assert.deepStrictEqual(doneAllKeys, [], 'no parent → no done-all shortcut (approveSubplans needs a parent)');
    console.log('# stageBrowse(review) no done-all without a parent');
  });

  test('route function dispatches correctly', () => {
    createPlan('functional', 'test-plan');

    // No args -> dashboard (v7: shows section labels)
    const dashboard = menuScreens.route([], testDir);
    const labels = dashboard.ask.questions[0].options.map(o => o.label);
    assert.ok(labels.includes('Business'), 'route() returns v7 section labels');

    // menu commands -> commands
    const commands = menuScreens.route(['menu', 'commands'], testDir);
    assert.ok(commands.ask.questions[0].options.some(o => o.label.includes('Vision')));

    // browse functional -> stage browse
    const browse = menuScreens.route(['browse', 'functional'], testDir);
    assert.ok(browse.text.includes('[functional]'));

    // plan stage/file -> the plan QUESTION (not an actions menu)
    const plan = menuScreens.route(['plan', 'functional/test-plan.md'], testDir);
    // INVERTED (2026-07-20): was `/Approve test-plan across Gate 1\?/`.
    assert.equal(plan.ask.questions[0].question, gateWords.question('functional', 'test-plan'),
      'the plan route asks the real decision, not "what would you like to do"');
    assert.doesNotMatch(plan.ask.questions[0].question, NO_GATE_NUMBER);
    assert.ok(allLabels(plan).includes('View/Edit'), 'View/Edit is still offered');

    // The `more` sub-screen is gone; its Delete lives on the plan screen itself.
    const more = menuScreens.route(['plan', 'functional/test-plan.md', 'more'], testDir);
    assert.ok(allLabels(more).includes('Delete'));

    // validate stage/file -> validation
    const validate = menuScreens.route(['validate', 'functional/test-plan.md'], testDir);
    assert.ok(validate.text.includes('Pre-transition'));

    console.log('# route function dispatches correctly');
  });

  test('toggle menus work: Pipeline <-> Commands', () => {
    const pipeline = menuScreens.dashboardPipeline(testDir);
    assert.strictEqual(pipeline.actions['More ▶'], 'menu commands', 'Pipeline More goes to commands');

    const commands = menuScreens.dashboardCommands(testDir);
    assert.strictEqual(commands.actions['◀ Pipeline'], '', 'Commands back goes to pipeline');
    console.log('# toggle menus work: Pipeline <-> Commands');
  });

  test('there is no "more" sub-menu to return from — the plan screen carries everything', () => {
    createPlan('functional', 'plan-a');

    // The old shape was two screens: a four-slot actions menu plus a "more" screen
    // reached by typing `more`, carrying Delete and a route back. Both are gone.
    // Delete now sits on the one plan screen, so there is nothing to navigate to
    // and nothing to come back from.
    const screen = menuScreens.route(['plan', 'functional/plan-a.md'], testDir);
    assert.ok(!('More ▶' in screen.actions), 'no More ▶ button');
    assert.ok(!('◀ Actions' in screen.actions), 'no route back to an actions menu');
    assert.ok(allLabels(screen).includes('Delete'), 'Delete is on the plan screen itself');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// R6-B follow-up (00023): the FORWARD gate-edge map is encoded ONCE too.
//
// The inverse (destination→source) fence lives in approval-ledger-provenance.test.js.
// This mirrors it for the FORWARD direction (source→destination). menu-screens.js
// held a fourth, forward literal of the exact gate-edge set as `HUMAN_GATES`
// ({ functional:'implementation', implementation:'todo', review:'done' }) — a
// duplicate encoding that falsified R6-B's "declared ONCE" claim and could silently
// diverge. After the fix it DERIVES from gate-order.GATE_SOURCE; no forward gate-edge
// object literal may live in any src file outside gate-order.js.
describe('R6-B forward gate-edge single-encoding', () => {
  const gateOrder = require('../src/lib/gate-order.js');

  function collectJsFiles(dir, acc = []) {
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      if (fs.statSync(full).isDirectory()) collectJsFiles(full, acc);
      else if (name.endsWith('.js')) acc.push(full);
    }
    return acc;
  }

  test('no forward gate-edge literal (functional→implementation / review→done) survives outside gate-order.js', () => {
    const srcRoot = path.join(__dirname, '..', 'src');
    const gateOrderFile = path.join(srcRoot, 'lib', 'gate-order.js');
    // Two unambiguous forward pairs identify the gate map. (The full-pipeline flow
    // shares them, but no such flow map exists in src — NEXT_STAGE was deliberately
    // removed; see menu-screens.js. gate-order.js carries the edges only as the
    // GATE_EDGES tuple, never this object shape, so it is excluded like the inverse
    // fence excludes it.)
    const forwardPairs = [
      /\bfunctional\s*:\s*['"]implementation['"]/,
      /\breview\s*:\s*['"]done['"]/,
    ];
    const offenders = [];
    for (const file of collectJsFiles(srcRoot)) {
      if (path.resolve(file) === path.resolve(gateOrderFile)) continue;
      const text = fs.readFileSync(file, 'utf8');
      for (const re of forwardPairs) {
        if (re.test(text)) offenders.push(`${path.relative(srcRoot, file)} :: ${re}`);
      }
    }
    assert.deepStrictEqual(offenders, [],
      `the forward gate-edge map must live ONCE (derived from gate-order.js); offenders:\n${offenders.join('\n')}`);
  });

  test('menu-screens HUMAN_GATES equals the canonical forward gate map (behavior unchanged)', () => {
    delete require.cache[require.resolve('../src/lib/menu-screens.js')];
    const menuScreens = require('../src/lib/menu-screens.js');
    const canonical = { functional: 'implementation', implementation: 'todo', review: 'done' };
    assert.deepStrictEqual(menuScreens.HUMAN_GATES, canonical);
    // …and it is the exact inverse of gate-order.GATE_SOURCE (the one encoding).
    const derived = Object.fromEntries(
      Object.entries(gateOrder.GATE_SOURCE).map(([dest, src]) => [src, dest]));
    assert.deepStrictEqual(menuScreens.HUMAN_GATES, derived);
  });
});

console.log('\nMenu Screens Tests');
console.log('==================\n');
