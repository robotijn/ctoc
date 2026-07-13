/**
 * Menu — Critique First & Brutal
 *
 * CTO Chief directive: the plan menu's critique action (the `Discuss` verb) must be
 * the FIRST and MOST IMPORTANT item on EVERY plan screen — both the generic plan
 * actions menu (planActions) and the review-stage menu (reviewActions). These tests
 * call the REAL menu-screens functions (zero doubles) and assert first-option
 * placement + action wiring to claude:discuss.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { test, describe, beforeEach, afterEach } = require('node:test');

describe('Menu Critique First', () => {
  let testDir;
  let plansDir;
  let menuScreens;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-critique-'));
    plansDir = path.join(testDir, 'plans');

    const stages = ['functional', 'implementation', 'todo', 'in-progress', 'review', 'done', 'vision'];
    stages.forEach(stage => {
      fs.mkdirSync(path.join(plansDir, stage), { recursive: true });
    });
    fs.mkdirSync(path.join(testDir, '.ctoc'), { recursive: true });

    delete require.cache[require.resolve('../src/lib/menu-screens.js')];
    menuScreens = require('../src/lib/menu-screens.js');
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  function createPlan(stage, name) {
    const filePath = path.join(plansDir, stage, `${name}.md`);
    fs.writeFileSync(filePath, `# ${name}\n\n## Scope\nTest scope.\n`);
    return filePath;
  }

  test('planActions (non-review stage) returns critique/Discuss as the FIRST option, mapped to claude:discuss', () => {
    createPlan('functional', 'my-plan');

    const result = menuScreens.planActions('functional', 'my-plan.md', testDir);
    const firstOption = result.ask.questions[0].options[0];

    assert.strictEqual(firstOption.label, 'Discuss',
      'The FIRST option must be the Discuss/critique action');
    assert.strictEqual(result.actions[firstOption.label], 'claude:discuss',
      'The first option must map to claude:discuss');
    assert.match(firstOption.description, /critique/i,
      'The first option description must convey a critique');
    console.log('# planActions returns critique first');
  });

  test('reviewActions returns critique/Discuss as the FIRST option, mapped to claude:discuss', () => {
    createPlan('review', 'reviewed-plan');

    const result = menuScreens.reviewActions('review', 'reviewed-plan.md', testDir);
    const firstOption = result.ask.questions[0].options[0];

    assert.strictEqual(firstOption.label, 'Discuss',
      'The FIRST option in review actions must be the Discuss/critique action');
    assert.strictEqual(result.actions[firstOption.label], 'claude:discuss',
      'The first review option must map to claude:discuss');
    assert.match(firstOption.description, /critique/i,
      'The first review option description must convey a critique');
    console.log('# reviewActions returns critique first');
  });

  test('planActions review-stage delegation also surfaces critique first', () => {
    createPlan('review', 'reviewed-plan');

    const result = menuScreens.planActions('review', 'reviewed-plan.md', testDir);
    const firstOption = result.ask.questions[0].options[0];

    assert.strictEqual(firstOption.label, 'Discuss',
      'planActions delegating to reviewActions must still show Discuss first');
    assert.strictEqual(result.actions[firstOption.label], 'claude:discuss',
      'Delegated first option must map to claude:discuss');
    console.log('# planActions review delegation returns critique first');
  });
});
