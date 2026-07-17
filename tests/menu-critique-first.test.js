/**
 * Critique First & Brutal — on every plan screen.
 *
 * CTO Chief directive: the critique action (the `Discuss` verb) is the FIRST and
 * MOST IMPORTANT thing you can do to a plan, on EVERY plan screen.
 *
 * The directive is unchanged; the surface it applies to has moved. Opening a plan
 * used to render a MENU (`planActions` / `reviewActions`) whose first row was
 * Discuss. Those screens are gone: the owner replaced the menu with questions, and
 * a plan screen now asks the next real DECISION — the PRODUCT question about what
 * the application should do when one is waiting, the gate question otherwise.
 *
 * So the invariant is restated, not relaxed: **critique is reachable on every plan
 * screen, at every stage, and it LEADS the plan's own lifecycle decisions.** It no
 * longer outranks the product question — a question about what the application does
 * is the main event, and critique is the first thing offered about the plan itself.
 *
 * These tests drive the REAL `route` (zero doubles) across EVERY stage — broader
 * coverage than the two functions they replace, which only checked functional and
 * review.
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
  let precompute;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-critique-'));
    plansDir = path.join(testDir, 'plans');

    const stages = ['functional', 'implementation', 'todo', 'in-progress', 'review', 'done', 'vision', 'canvas'];
    stages.forEach(stage => {
      fs.mkdirSync(path.join(plansDir, stage), { recursive: true });
    });
    fs.mkdirSync(path.join(testDir, '.ctoc'), { recursive: true });

    delete require.cache[require.resolve('../src/lib/menu-screens.js')];
    menuScreens = require('../src/lib/menu-screens.js');
    precompute = require('../src/lib/streaming-precompute.js');
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  function createPlan(stage, name) {
    const filePath = path.join(plansDir, stage, `${name}.md`);
    fs.writeFileSync(filePath, `# ${name}\n\n## Scope\nTest scope.\n`);
    return filePath;
  }

  /** The question on `screen` that carries the plan's lifecycle decisions. */
  function lifecycleQuestion(screen) {
    return screen.ask.questions.find(q => q.options.some(o => o.label === 'Discuss'));
  }

  // Every stage a plan can sit in — gate stages and non-gate stages alike.
  for (const stage of ['functional', 'implementation', 'review', 'todo', 'in-progress', 'done', 'canvas']) {
    test(`${stage}: critique is reachable and LEADS the plan's lifecycle decisions`, () => {
      createPlan(stage, 'my-plan');

      const result = menuScreens.route(['plan', `${stage}/my-plan.md`], testDir);
      const q = lifecycleQuestion(result);

      assert.ok(q, `a ${stage} plan screen must offer critique somewhere`);
      assert.strictEqual(q.options[0].label, 'Discuss',
        'Discuss must LEAD the plan-lifecycle decisions');
      assert.strictEqual(result.actions['Discuss'], 'claude:discuss',
        'Discuss must map to claude:discuss');
      assert.match(q.options[0].description, /critique/i,
        'the critique option must convey a critique');
    });
  }

  test('critique stays reachable even when a PRODUCT question owns the screen', () => {
    const p = createPlan('review', 'reviewed-plan');
    precompute.writePlanQuestions(testDir, 'review/reviewed-plan.md', [{
      id: 'q01-retention-window',
      prompt: 'How long should an exported report stay downloadable?',
      options: [{ key: '1', label: 'Seven days', recommended: true, pros: 'Covers a working week.', cons: 'Storage grows.' }],
    }], fs.statSync(p).mtimeMs);

    const result = menuScreens.route(['plan', 'review/reviewed-plan.md'], testDir);

    // The product question is the main event — critique does not pre-empt it.
    assert.match(result.ask.questions[0].question, /How long should an exported report/);
    // …and critique is still one answer away, never lost to the product question.
    const q = lifecycleQuestion(result);
    assert.ok(q, 'critique must survive alongside a product question');
    assert.strictEqual(q.options[0].label, 'Discuss');
    assert.strictEqual(result.actions['Discuss'], 'claude:discuss');
  });

  test('the brutal-critique contract is carried by the action, on every stage', () => {
    createPlan('review', 'reviewed-plan');
    const result = menuScreens.route(['plan', 'review/reviewed-plan.md'], testDir);
    const q = lifecycleQuestion(result);
    assert.match(q.options[0].description, /nothing held back/i,
      'the critique option must still promise the no-holds-barred critique');
  });
});
