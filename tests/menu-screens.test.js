/**
 * Menu Screens Tests
 * Unit tests for all screen JSON outputs from the state machine.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { test, describe, beforeEach, afterEach } = require('node:test');

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
    assert.ok(result.actions['Create new'], 'Should have Create new action');
    assert.ok('Back' in result.actions, 'Should have Back action key');
    // Back maps to '' (re-run dashboard), which is falsy but intentional
    assert.strictEqual(result.actions['Back'], '', 'Back should map to empty string (dashboard)');
    console.log('# stageBrowse with empty stage returns valid JSON');
  });

  test('stageBrowse with 1-3 plans shows plan buttons', () => {
    createPlan('functional', 'plan-a');
    createPlan('functional', 'plan-b');

    const result = menuScreens.stageBrowse('functional', testDir);
    const labels = result.ask.questions[0].options.map(o => o.label);

    assert.ok(labels.includes('plan-a'), 'Should have plan-a as button');
    assert.ok(labels.includes('plan-b'), 'Should have plan-b as button');
    assert.ok(result.actions['plan-a'], 'plan-a should have action');
    assert.ok(result.actions['plan-b'], 'plan-b should have action');
    console.log('# stageBrowse with 1-3 plans shows plan buttons');
  });

  test('stageBrowse with 4+ plans shows numbered list', () => {
    createPlan('functional', 'plan-a');
    createPlan('functional', 'plan-b');
    createPlan('functional', 'plan-c');
    createPlan('functional', 'plan-d');

    const result = menuScreens.stageBrowse('functional', testDir);
    const labels = result.ask.questions[0].options.map(o => o.label);

    // 4+ plans: plan names should NOT be buttons
    assert.ok(!labels.includes('plan-a'), 'plan-a should NOT be a button with 4+ plans');
    // But should have number actions
    assert.ok(result.actions['1'], 'Should have number 1 action');
    assert.ok(result.actions['4'], 'Should have number 4 action');
    console.log('# stageBrowse with 4+ plans shows numbered list');
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

  test('planActions returns Create new, View/Edit, Discuss, Approve', () => {
    createPlan('functional', 'my-plan');

    const result = menuScreens.planActions('functional', 'my-plan.md', testDir);
    const labels = result.ask.questions[0].options.map(o => o.label);

    assert.ok(labels.includes('Create new'), 'Should have Create new');
    assert.ok(labels.includes('View/Edit'), 'Should have View/Edit (See and Edit merged)');
    assert.ok(labels.includes('Discuss'), 'Should have Discuss');
    assert.ok(labels.some(l => l.startsWith('Approve')), 'Should have Approve');
    assert.ok(!labels.includes('View'), 'View is merged into View/Edit, not a separate option');
    assert.ok(result.actions['View/Edit'].startsWith('claude:view-edit'),
      'View/Edit maps to the merged claude:view-edit action');
    console.log('# planActions returns Create new, View/Edit, Discuss, Approve');
  });

  test('planActions Approve includes next stage', () => {
    createPlan('functional', 'my-plan');

    const result = menuScreens.planActions('functional', 'my-plan.md', testDir);
    const labels = result.ask.questions[0].options.map(o => o.label);

    assert.ok(labels.some(l => l.includes('implementation')), 'Approve should mention implementation');
    console.log('# planActions Approve includes next stage');
  });

  test('planActions Approve maps to validate command', () => {
    createPlan('functional', 'my-plan');

    const result = menuScreens.planActions('functional', 'my-plan.md', testDir);

    // Find the approve action
    const approveKey = Object.keys(result.actions).find(k => k.startsWith('Approve'));
    assert.ok(approveKey, 'Should have an approve action');
    assert.ok(result.actions[approveKey].startsWith('validate'), 'Approve should map to validate command');
    console.log('# planActions Approve maps to validate command');
  });

  test('planActionsMore returns Delete, Back to list, Actions (Edit merged away)', () => {
    createPlan('functional', 'my-plan');

    const result = menuScreens.planActionsMore('functional', 'my-plan.md', testDir);
    const labels = result.ask.questions[0].options.map(o => o.label);

    assert.ok(!labels.includes('Edit'), 'Edit is merged into the main menu View/Edit action');
    assert.ok(labels.includes('Delete'), 'Should have Delete');
    assert.ok(labels.includes('Back to list'), 'Should have Back to list');
    assert.ok(labels.some(l => l.includes('Actions')), 'Should have Actions back');
    console.log('# planActionsMore returns Delete, Back to list, Actions');
  });

  test('reviewActions returns View/Edit, Approve, Feedback, Rework', () => {
    createPlan('review', 'reviewed-plan');

    const result = menuScreens.reviewActions('review', 'reviewed-plan.md', testDir);
    const labels = result.ask.questions[0].options.map(o => o.label);

    assert.ok(labels.includes('View/Edit'), 'Should have View/Edit (See and Edit merged)');
    assert.ok(!labels.includes('View'), 'View is merged into View/Edit, not a separate option');
    assert.ok(labels.some(l => l.includes('Approve')), 'Should have Approve');
    assert.ok(labels.some(l => l.includes('Feedback')), 'Should have Feedback');
    assert.ok(labels.some(l => l.includes('Rework')), 'Should have Rework');
    console.log('# reviewActions returns View/Edit, Approve, Feedback, Rework');
  });

  test('reviewActions maps to correct claude actions', () => {
    createPlan('review', 'reviewed-plan');

    const result = menuScreens.reviewActions('review', 'reviewed-plan.md', testDir);

    assert.ok(result.actions['Approve → Done'].startsWith('validate'), 'Approve should validate first');
    assert.ok(result.actions['Feedback → Functional'].startsWith('claude:reject'), 'Feedback should reject');
    assert.ok(result.actions['Rework → Implementation'].startsWith('claude:reject'), 'Rework should reject');
    console.log('# reviewActions maps to correct claude actions');
  });

  test('planActions for review stage delegates to reviewActions', () => {
    createPlan('review', 'reviewed-plan');

    const result = menuScreens.planActions('review', 'reviewed-plan.md', testDir);
    const labels = result.ask.questions[0].options.map(o => o.label);

    // Should have review-specific actions, not generic ones
    assert.ok(labels.some(l => l.includes('Approve → Done')), 'Should show review-specific Approve');
    console.log('# planActions for review stage delegates to reviewActions');
  });

  test('discussMenu returns Continue, Apply edits, Approve, Back', () => {
    const result = menuScreens.discussMenu('functional', 'my-plan.md', testDir);
    const labels = result.ask.questions[0].options.map(o => o.label);

    assert.ok(labels.includes('Continue'), 'Should have Continue');
    assert.ok(labels.includes('Apply edits'), 'Should have Apply edits');
    assert.ok(labels.some(l => l.startsWith('Approve')), 'Should have Approve');
    assert.ok(labels.includes('Back to actions'), 'Should have Back to actions');
    console.log('# discussMenu returns Continue, Apply edits, Approve, Back');
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

  test('all text fields end with triple newline', () => {
    createPlan('functional', 'plan-a');

    const screens = [
      menuScreens.dashboardPipeline(testDir),
      menuScreens.dashboardCommands(testDir),
      menuScreens.stageBrowse('functional', testDir),
      menuScreens.planActions('functional', 'plan-a.md', testDir),
      menuScreens.planActionsMore('functional', 'plan-a.md', testDir),
      menuScreens.discussMenu('functional', 'plan-a.md', testDir),
      menuScreens.validateScreen('functional', 'plan-a.md', testDir)
    ];

    screens.forEach((screen, i) => {
      assert.ok(screen.text.endsWith('\n\n\n'), `Screen ${i} text should end with \\n\\n\\n`);
    });
    console.log('# all text fields end with triple newline');
  });

  test('all screens have actions mapping for every option', () => {
    createPlan('functional', 'plan-a');

    const screens = [
      menuScreens.dashboardPipeline(testDir),
      menuScreens.dashboardCommands(testDir),
      menuScreens.stageBrowse('functional', testDir),
      menuScreens.planActions('functional', 'plan-a.md', testDir),
      menuScreens.planActionsMore('functional', 'plan-a.md', testDir),
      menuScreens.discussMenu('functional', 'plan-a.md', testDir)
    ];

    screens.forEach((screen, i) => {
      const options = screen.ask.questions[0].options;
      options.forEach(opt => {
        const hasAction = opt.label in screen.actions;
        // Allow "Other" options that don't map to actions
        if (!hasAction && opt.label !== 'Other') {
          // Check if it's a plan name that maps via plan name
          const hasAnyAction = Object.keys(screen.actions).some(k => k === opt.label);
          assert.ok(hasAnyAction || opt.label in screen.actions,
            `Screen ${i}: option "${opt.label}" has no action mapping`);
        }
      });
    });
    console.log('# all screens have actions mapping for every option');
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

    // plan stage/file -> plan actions
    const plan = menuScreens.route(['plan', 'functional/test-plan.md'], testDir);
    assert.ok(plan.ask.questions[0].options.some(o => o.label === 'View/Edit'));

    // plan stage/file more -> more actions
    const more = menuScreens.route(['plan', 'functional/test-plan.md', 'more'], testDir);
    assert.ok(more.ask.questions[0].options.some(o => o.label === 'Delete'));

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

  test('planActionsMore returns to the main plan actions menu', () => {
    createPlan('functional', 'plan-a');

    // planActions no longer has a "More ▶" button — its four slots are
    // Create new, View/Edit, Discuss, Approve. planActionsMore is reached by
    // typing "more" and routes back to the main actions menu.
    const actions = menuScreens.planActions('functional', 'plan-a.md', testDir);
    assert.ok(!('More ▶' in actions.actions), 'planActions has no More ▶ button');

    const more = menuScreens.planActionsMore('functional', 'plan-a.md', testDir);
    assert.ok(more.actions['◀ Actions'].includes('plan'), 'More returns to the actions menu');
    console.log('# planActionsMore returns to the main plan actions menu');
  });
});

console.log('\nMenu Screens Tests');
console.log('==================\n');
