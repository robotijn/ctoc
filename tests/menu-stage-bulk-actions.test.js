/**
 * Menu — Stage Bulk Actions (word shortcuts on the stage plan list)
 *
 * The stage plan list (stageBrowse, rendered by `browse functional` /
 * `browse implementation`) reserves NUMBERS exclusively for opening a single
 * plan. Meta-actions are always WORDS. Two bulk word shortcuts are added:
 *
 *   • "discuss"  (BOTH functional + implementation) → claude:discuss-all {stage}
 *       Bulk adversarial critique across every plan in the stage. Advisory only —
 *       never edits a plan, never crosses a gate.
 *
 *   • "todo-all" (implementation ONLY) → claude:advance-all-implementation
 *       The human deliberately crossing the implementation→todo gate for every
 *       implementation plan at once, then starting the iron loop to build them.
 *
 * These tests call the REAL stageBrowse (zero doubles) and assert word-shortcut
 * wiring for the correct stages, and that numbers still open a single plan.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { test, describe, beforeEach, afterEach } = require('node:test');

describe('Menu Stage Bulk Actions', () => {
  let testDir;
  let plansDir;
  let menuScreens;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-bulk-'));
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

  test('functional stage list exposes the "discuss" shortcut mapped to claude:discuss-all functional', () => {
    createPlan('functional', 'plan-one');
    createPlan('functional', 'plan-two');

    const result = menuScreens.stageBrowse('functional', testDir);

    assert.strictEqual(result.actions['discuss'], 'claude:discuss-all functional',
      'functional list must map the "discuss" word to claude:discuss-all functional');
    console.log('# functional exposes discuss-all');
  });

  test('implementation stage list exposes the "discuss" shortcut mapped to claude:discuss-all implementation', () => {
    createPlan('implementation', 'impl-one');

    const result = menuScreens.stageBrowse('implementation', testDir);

    assert.strictEqual(result.actions['discuss'], 'claude:discuss-all implementation',
      'implementation list must map the "discuss" word to claude:discuss-all implementation');
    console.log('# implementation exposes discuss-all');
  });

  test('implementation stage list exposes the "todo-all" shortcut mapped to claude:advance-all-implementation', () => {
    createPlan('implementation', 'impl-one');

    const result = menuScreens.stageBrowse('implementation', testDir);

    assert.strictEqual(result.actions['todo-all'], 'claude:advance-all-implementation',
      'implementation list must map the "todo-all" word to claude:advance-all-implementation');
    console.log('# implementation exposes todo-all');
  });

  test('functional stage list does NOT expose the "todo-all" move-all shortcut (implementation only)', () => {
    createPlan('functional', 'plan-one');

    const result = menuScreens.stageBrowse('functional', testDir);

    assert.strictEqual(result.actions['todo-all'], undefined,
      'the move-all-to-todo shortcut must exist on the implementation list only');
    console.log('# functional has no todo-all');
  });

  test('a numeric reply maps ONLY to opening a single plan (numbers never trigger bulk actions)', () => {
    createPlan('implementation', 'impl-one');
    createPlan('implementation', 'impl-two');

    const result = menuScreens.stageBrowse('implementation', testDir);

    // Every numeric key opens exactly one plan file, nothing else.
    Object.keys(result.actions).forEach(key => {
      if (/^\d+$/.test(key)) {
        assert.match(result.actions[key], /^plan implementation\/.+\.md$/,
          `numeric key ${key} must open a single plan, not a bulk action`);
      }
    });
    // And the two present plans are reachable by number.
    assert.match(result.actions['1'], /^plan implementation\/.+\.md$/);
    assert.match(result.actions['2'], /^plan implementation\/.+\.md$/);
    // The bulk shortcuts are words, never numbers.
    assert.strictEqual(/^\d+$/.test('discuss'), false);
    assert.strictEqual(/^\d+$/.test('todo-all'), false);
    console.log('# numbers open a single plan only');
  });
});
