'use strict';

/**
 * The tool-grant ratchet, stated a second time, in a second file.
 *
 * tests/agent-tool-grants.test.js holds six lists that only shrink (DEBT,
 * WRITE_EDIT_DEBT, RULE6_EXCEPTIONS, HELD_REMOVALS, MATCH_IS_DATA_DEBT, METHOD_TOOLS_DEBT); each list's size must EQUAL its
 * maximum there (MAX_DEBT and the rest). This file states each ceiling once more, and
 * adds two counts that could drift unseen: the tools the safety-floor exceptions excuse,
 * and the held removals per tool. It is the HISTORICAL_FLOOR pattern of
 * tests/coverage-ratchet-direction.test.js, in its own file because a second copy in the
 * same file could be raised in the same edit (security re-scan, 2026-10-05). The owner
 * granted this file to slice 1 on 2026-10-05 (scope-growth request 1791226690486-rxjfsg):
 * "a) Yes: add the separate limits file to slice 1."
 *
 * Values, not text (CTO Chief decision, 2026-10-05). The first version read the
 * maximums as literal declarations in the main test's source; the third security scan
 * moved a maximum with the literal kept in a comment or a string, a shadowed binding, or
 * a changed assertion operand, and both files stayed green. This file now EVALUATES the
 * main test with node:test stubbed out and reads back the bound MAX_* values and the
 * real sizes of the lists, so the main file's text cannot stand in for its values. A
 * main test that is missing, throws, or lacks a binding fails here.
 *
 * Equality (CTO Chief decision, 2026-10-05): every value read back must EQUAL its
 * ceiling here. Lowering or raising one takes both files changing in the same slice;
 * slices 2 to 10 declare this file for that reason. A ceiling may only fall (test 2).
 * What this cannot catch: an edit to the main test's own CHECK code (for example, handing
 * check 3 a wider debt set) that leaves every value and list unchanged as read here; a
 * value or a list changed while the suite runs (inside an it body, which this file never
 * runs); and a main test that detects it is being evaluated here (for example by testing
 * for `process`, or by replacing `JSON.stringify` in its own context) and binds different
 * values. Each needs an edit to the main test's code, and review catches that.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const vm = require('node:vm');

const MAIN = path.join(__dirname, 'agent-tool-grants.test.js');

/**
 * The ceilings, each equal to the main test's value at all times. Started 2026-10-05;
 * each may only fall (test 2). Every MAX_* ceiling binds both the main test's MAX_*
 * value and the real size of its list; EXCUSED_TOOLS binds the tools the safety-floor
 * exceptions excuse; HELD_PER_TOOL binds how many times each tool is held for removal.
 */
const CEILINGS = Object.freeze({
  MAX_DEBT: 1,
  MAX_WRITE_EDIT_DEBT: 0,
  MAX_RULE6_EXCEPTIONS: 0,
  MAX_HELD_REMOVALS: 42,
  MAX_MATCH_IS_DATA_DEBT: 0,
  EXCUSED_TOOLS: 0,
  MAX_METHOD_TOOLS_DEBT: 2,
  HELD_PER_TOOL: Object.freeze({ Bash: 21, Write: 10, Edit: 10, Task: 1 }),
});

/** Each maximum in the main test, with the list whose size it bounds. */
const LISTS = [
  ['MAX_DEBT', 'DEBT'],
  ['MAX_WRITE_EDIT_DEBT', 'WRITE_EDIT_DEBT'],
  ['MAX_RULE6_EXCEPTIONS', 'RULE6_EXCEPTIONS'],
  ['MAX_HELD_REMOVALS', 'HELD_REMOVALS'],
  ['MAX_MATCH_IS_DATA_DEBT', 'MATCH_IS_DATA_DEBT'],
  ['MAX_METHOD_TOOLS_DEBT', 'METHOD_TOOLS_DEBT'],
];

// describe bodies run, so a value moved there is read after it moves; it bodies never run.
const NO_TESTS = Object.freeze({ describe(name, fn) { fn(); }, it() {} });

/**
 * Evaluate a main-test source with node:test stubbed out (describe bodies run, no it body
 * runs), within 10 seconds, and read back what it actually binds: the six MAX_* values, the real sizes of its six lists,
 * the tools its safety-floor exceptions excuse and its held removals per tool. A source
 * that throws, or lacks a binding, throws here: it is never read as passing. This runs
 * the repository's own test file, which a test run executes anyway; node:vm is used to
 * read its top-level bindings, not as a security boundary.
 */
function evaluateMain(source) {
  const context = vm.createContext({ require: (id) => (id === 'node:test' ? NO_TESTS : require(id)), __dirname, console });
  vm.runInContext(source, context, { filename: MAIN, timeout: 10000 });
  return JSON.parse(vm.runInContext(`JSON.stringify({
    MAX_DEBT, MAX_WRITE_EDIT_DEBT, MAX_RULE6_EXCEPTIONS, MAX_HELD_REMOVALS, MAX_MATCH_IS_DATA_DEBT, MAX_METHOD_TOOLS_DEBT,
    sizes: {
      DEBT: DEBT.size,
      WRITE_EDIT_DEBT: WRITE_EDIT_DEBT.size,
      RULE6_EXCEPTIONS: Object.keys(RULE6_EXCEPTIONS).length,
      HELD_REMOVALS: Object.values(HELD_REMOVALS).reduce((n, tools) => n + tools.length, 0),
      MATCH_IS_DATA_DEBT: MATCH_IS_DATA_DEBT.size,
      METHOD_TOOLS_DEBT: METHOD_TOOLS_DEBT.size,
    },
    excusedTools: Object.values(RULE6_EXCEPTIONS).reduce((n, e) => n + (e && Array.isArray(e.tools) ? e.tools.length : 0), 0),
    held: Object.values(HELD_REMOVALS).flat().reduce((m, t) => { m[t] = (m[t] || 0) + 1; return m; }, {}),
  })`, context, { timeout: 10000 }));
}

/** Every value the main test binds that differs from its ceiling here, by name. */
function maximaFailures(values, ceilings) {
  const out = [];
  for (const [max, list] of LISTS) {
    const c = ceilings[max];
    if (values[max] !== c) out.push(`${max} is ${JSON.stringify(values[max])} in the main test but ${c} here. The two move together: lower both in the same change when a slice pays debt; never raise either.`);
    if (values.sizes[list] !== c) out.push(`${list} holds ${JSON.stringify(values.sizes[list])} entries in the main test; its ceiling here is ${c}`);
  }
  if (values.excusedTools !== ceilings.EXCUSED_TOOLS) out.push(`RULE6_EXCEPTIONS excuse ${JSON.stringify(values.excusedTools)} tools in the main test; the ceiling here is ${ceilings.EXCUSED_TOOLS}`);
  for (const [tool, c] of Object.entries(ceilings.HELD_PER_TOOL)) {
    const n = values.held[tool] || 0;
    if (n !== c) out.push(`HELD_REMOVALS holds ${tool} ${JSON.stringify(n)} times in the main test; the ceiling here is ${c}`);
  }
  for (const tool of Object.keys(values.held)) if (!(tool in ceilings.HELD_PER_TOOL)) out.push(`HELD_REMOVALS holds ${tool}, which has no ceiling here`);
  return out;
}

/** The check test 1 runs on the main test's source: its values against the ceilings, and no second statement there. */
function checkMain(source, ceilings) {
  const out = maximaFailures(evaluateMain(source), ceilings);
  if (/\bHISTORICAL_MAXIMA\b/.test(source)) out.push('the main test states its maximums a second time (HISTORICAL_MAXIMA); the second statement lives only in this file');
  return out;
}

describe('the tool-grant maximums only fall', () => {
  it('1. every maximum in tests/agent-tool-grants.test.js equals its ceiling here, stated once there and once here', () => {
    const failures = checkMain(fs.readFileSync(MAIN, 'utf8'), CEILINGS);
    assert.deepEqual(failures, [], failures.join('\n'));
  });

  it('2. the ceilings themselves only fall: 118, 22, 6, 50, 12 (MATCH_IS_DATA_DEBT, from slice 3), 6 excused tools, 2 (MAX_METHOD_TOOLS_DEBT, from slice 12), and Bash 21, Write 14, Edit 14, Task 1 on 2026-10-05', () => {
    const first = { MAX_DEBT: 118, MAX_WRITE_EDIT_DEBT: 22, MAX_RULE6_EXCEPTIONS: 6, MAX_HELD_REMOVALS: 50, MAX_MATCH_IS_DATA_DEBT: 12, EXCUSED_TOOLS: 6, MAX_METHOD_TOOLS_DEBT: 2 };
    const firstHeld = { Bash: 21, Write: 14, Edit: 14, Task: 1 };
    assert.deepEqual(Object.keys(CEILINGS), [...Object.keys(first), 'HELD_PER_TOOL']);
    assert.deepEqual(Object.keys(CEILINGS.HELD_PER_TOOL), Object.keys(firstHeld));
    for (const [name, v] of Object.entries(first)) assert.ok(Number.isInteger(CEILINGS[name]) && CEILINGS[name] >= 0 && CEILINGS[name] <= v, `a ceiling rose: ${name} is ${CEILINGS[name]}, above ${v}`);
    for (const [tool, v] of Object.entries(firstHeld)) assert.ok(Number.isInteger(CEILINGS.HELD_PER_TOOL[tool]) && CEILINGS.HELD_PER_TOOL[tool] >= 0 && CEILINGS.HELD_PER_TOOL[tool] <= v, `a ceiling rose: held ${tool} is ${CEILINGS.HELD_PER_TOOL[tool]}, above ${v}`);
  });

  it('3. the check bites: a raised, lowered-alone, doubled, reassigned or computed maximum fails by name, and so does a second statement', () => {
    const lists = [
      "const DEBT = new Set(['a', 'b']);",
      "const WRITE_EDIT_DEBT = new Set(['a']);",
      'const MAX_WRITE_EDIT_DEBT = 1;',
      "const RULE6_EXCEPTIONS = { a: { reason: 'r', tools: ['WebFetch'] } };",
      'const MAX_RULE6_EXCEPTIONS = 1;',
      "const HELD_REMOVALS = { a: ['Bash', 'Write', 'Edit'] };",
      'const MAX_HELD_REMOVALS = 3;',
      "const MATCH_IS_DATA_DEBT = new Set(['a']);",
      'const MAX_MATCH_IS_DATA_DEBT = 1;',
      "const METHOD_TOOLS_DEBT = new Set(['a']);",
      'const MAX_METHOD_TOOLS_DEBT = 1;',
    ].join('\n');
    const main = (debt) => `'use strict';\n${debt}\n${lists}\n`;
    const ceilings = { MAX_DEBT: 2, MAX_WRITE_EDIT_DEBT: 1, MAX_RULE6_EXCEPTIONS: 1, MAX_HELD_REMOVALS: 3, MAX_MATCH_IS_DATA_DEBT: 1, EXCUSED_TOOLS: 1, MAX_METHOD_TOOLS_DEBT: 1, HELD_PER_TOOL: { Bash: 1, Write: 1, Edit: 1, Task: 0 } };
    const fails = (source) => checkMain(source, ceilings).join('\n');
    assert.match(fails(main('const MAX_DEBT = 1;')), /^MAX_DEBT is 1 in the main test but 2 here/);
    assert.match(fails(main('const MAX_DEBT = 3;')), /^MAX_DEBT is 3 in the main test but 2 here/);
    assert.match(fails(main('const MAX_DEBT = 2 + 1;')), /^MAX_DEBT is 3 in the main test but 2 here/);
    assert.throws(() => checkMain(main('const MAX_DEBT = 2;\nconst MAX_DEBT = 3;'), ceilings), /already been declared/);
    assert.throws(() => checkMain(main('const MAX_DEBT = 2;\nMAX_DEBT = 3;'), ceilings), /constant variable/);
    assert.match(fails(main('const MAX_DEBT = 2;\nconst HISTORICAL_MAXIMA = {};')), /HISTORICAL_MAXIMA/);
    // a value of the wrong type is printed as what it is
    assert.match(fails(main("const MAX_DEBT = '2';")), /^MAX_DEBT is "2" in the main test but 2 here/);
    // the safety-sentence debt list has its own maximum and ceiling (slice 3 fix pass)
    assert.match(fails(main('const MAX_DEBT = 2;').replace('const MAX_MATCH_IS_DATA_DEBT = 1;', 'const MAX_MATCH_IS_DATA_DEBT = 2;')), /^MAX_MATCH_IS_DATA_DEBT is 2 in the main test but 1 here/);
    assert.match(fails(main('const MAX_DEBT = 2;').replace("const MATCH_IS_DATA_DEBT = new Set(['a']);", "const MATCH_IS_DATA_DEBT = new Set(['a', 'b']);")), /MATCH_IS_DATA_DEBT holds 2 entries in the main test; its ceiling here is 1/);
    // the method-file debt list has its own maximum and ceiling (slice 12)
    assert.match(fails(main('const MAX_DEBT = 2;').replace('const MAX_METHOD_TOOLS_DEBT = 1;', 'const MAX_METHOD_TOOLS_DEBT = 2;')), /^MAX_METHOD_TOOLS_DEBT is 2 in the main test but 1 here/);
    // the describe bodies run (it stays stubbed): a list moved there is read after it moves
    assert.match(fails(`${main('const MAX_DEBT = 2;')}const { describe } = require('node:test');\ndescribe('moves', () => { DEBT.add('c'); });\n`), /DEBT holds 3 entries in the main test; its ceiling here is 2/);
  });

  it('3.1 a main test that never finishes evaluating fails within the time limit, never hangs', () => {
    assert.throws(() => evaluateMain("'use strict';\nwhile (true) {}\n"), /timed out/);
  });

  it('4. the check reads values, not text: every edit to the main file alone that moves a value or a list fails by name', () => {
    const lists = [
      "const DEBT = new Set(['a', 'b']);",
      "const WRITE_EDIT_DEBT = new Set(['a']);",
      'const MAX_WRITE_EDIT_DEBT = 1;',
      "const RULE6_EXCEPTIONS = { a: { reason: 'r', tools: ['WebFetch'] } };",
      'const MAX_RULE6_EXCEPTIONS = 1;',
      "const HELD_REMOVALS = { a: ['Bash', 'Write', 'Edit'] };",
      'const MAX_HELD_REMOVALS = 3;',
      "const MATCH_IS_DATA_DEBT = new Set(['a']);",
      'const MAX_MATCH_IS_DATA_DEBT = 1;',
      "const METHOD_TOOLS_DEBT = new Set(['a']);",
      'const MAX_METHOD_TOOLS_DEBT = 1;',
      "const { describe, it } = require('node:test');",
      "describe('stubbed', () => { it('never runs', () => { throw new Error('ran'); }); });",
    ].join('\n');
    const main = (debt) => `'use strict';\n${debt}\n${lists}\n`;
    const ceilings = { MAX_DEBT: 2, MAX_WRITE_EDIT_DEBT: 1, MAX_RULE6_EXCEPTIONS: 1, MAX_HELD_REMOVALS: 3, MAX_MATCH_IS_DATA_DEBT: 1, EXCUSED_TOOLS: 1, MAX_METHOD_TOOLS_DEBT: 1, HELD_PER_TOOL: { Bash: 1, Write: 1, Edit: 1, Task: 0 } };
    const fails = (source) => checkMain(source, ceilings).join('\n');
    // the literal kept in a comment or a template string, the real binding elsewhere
    assert.match(fails(main('/*\nconst MAX_DEBT = 2;\n*/\nconst [MAX_DEBT] = [3];')), /MAX_DEBT is 3 in the main test but 2 here/);
    assert.match(fails(main('const NOTE = `\nconst MAX_DEBT = 2;\n`;\nconst { MAX_DEBT } = { MAX_DEBT: 3 };')), /MAX_DEBT is 3 in the main test but 2 here/);
    // the literal untouched, the list grown: the size is read, not the assertion
    assert.match(fails(main("const MAX_DEBT = 2;\nconst EXTRA = 'c';").replace("new Set(['a', 'b'])", "new Set(['a', 'b', EXTRA])")), /DEBT holds 3 entries in the main test; its ceiling here is 2/);
    // the canonical source passes, and evaluating it never runs a test
    assert.deepEqual(checkMain(main('const MAX_DEBT = 2;'), ceilings), []);
    // the tools exceptions excuse, and the held removals per tool, have ceilings of their own
    assert.match(fails(main('const MAX_DEBT = 2;').replace("tools: ['WebFetch']", "tools: ['WebFetch', 'Bash']")), /RULE6_EXCEPTIONS excuse 2 tools in the main test; the ceiling here is 1/);
    const swapped = fails(main('const MAX_DEBT = 2;').replace("['Bash', 'Write', 'Edit']", "['Task', 'Write', 'Edit']"));
    assert.match(swapped, /HELD_REMOVALS holds Bash 0 times in the main test; the ceiling here is 1/);
    assert.match(swapped, /HELD_REMOVALS holds Task 1 times in the main test; the ceiling here is 0/);
    assert.match(fails(main('const MAX_DEBT = 2;').replace("['Bash', 'Write', 'Edit']", "['Agent', 'Write', 'Edit']")), /HELD_REMOVALS holds Agent, which has no ceiling here/);
    // a main test that cannot be evaluated fails; it is never read as passing
    assert.throws(() => checkMain(main('const MAX_DEBT = 2;\nthrow new Error("broken");'), ceilings), /broken/);
    assert.throws(() => checkMain("'use strict';\nconst MAX_DEBT = 2;\n", ceilings), /is not defined/);
  });
});
