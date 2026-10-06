'use strict';

/**
 * The implementation planner, compacted by hand with every order kept (rollout slice 1).
 *
 * Part 1: the ten rule-inventory checks of the compaction method, held to the order floor
 * counted when the baseline was labelled. Lowering the floor takes an edit here as well as in
 * the inventory.
 * Part 2: the smoke check's contract adapter (`contract.js`), driven with hand-made captured
 * files, so the slice rules it scores — bare-slug `parent_plan`, the nine canonical labels, no
 * dependency cycle — and its findings are proven before any real run is scored with it.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { defineInventoryTests } = require('./compaction-eval/inventory-checks');
const contract = require('./compaction-eval/implementation-planner/contract');

const ORDER_FLOOR = 184;

defineInventoryTests({
  test,
  label: 'implementation-planner compaction',
  inventoryPath: 'tests/compaction-eval/implementation-planner/rule-inventory.json',
  orderFloor: ORDER_FLOOR
});

// ── Part 2: the contract adapter ────────────────────────────────────────────

const EXP = { fixtures_dir: 'tests/compaction-eval/implementation-planner/fixtures' };
const FX = { name: 'module-needs-its-test', parent: 'report-shows-durations' };
const LABELS = ['TEST', 'PREPARE', 'IMPLEMENT', 'REVIEW', 'OPTIMIZE', 'SECURE', 'VERIFY', 'DOCUMENT', 'FINAL-REVIEW'];

function slice({ parent = 'report-shows-durations', deps = 'none', files = [], labels = LABELS, wiring = '' } = {}) {
  const steps = labels.map((l, i) => `### Step ${8 + i}: ${l}\n- [ ] do it\n`).join('\n');
  return [
    '---',
    'title: "a slice"',
    'type: implementation',
    `parent_plan: ${parent}`,
    `depends_on: ${deps}`,
    'files:',
    ...files.map((f) => `  - ${f}`),
    'priority: high',
    '---',
    '',
    '## Implementation Details',
    '',
    wiring ? `### Wiring — the live call sites\n\n${wiring}\n` : '',
    '## Execution Plan',
    '',
    steps
  ].join('\n');
}

const P = 'plans/implementation/';
const check = (files, fx = FX) => contract.check({ output: 'done', files }, fx, EXP);
const ids = (r) => r.findings.map((f) => f.id).sort();

test('adapter 1: a run that wrote no slice and raised no question is invalid', () => {
  const r = check({});
  assert.equal(r.valid, false);
  assert.match(r.errors.join('\n'), /no slice file was written/);
});

test('adapter 2: a module shipped with its test and CLAUDE.md declared yields both findings', () => {
  const r = check({
    [`${P}report-shows-durations-s1-format-duration.md`]: slice({ files: ['src/lib/format-duration.js', 'tests/format-duration.test.js', '"CLAUDE.md"'] }),
    [`${P}report-shows-durations-s2-wire-report.md`]: slice({ deps: 'report-shows-durations-s1-format-duration', files: ['src/commands/report.js'], wiring: '`src/commands/report.js` calls it.' }),
    [`${P}report-shows-durations.md`]: '## Slices (dependency-ordered)\n'
  });
  assert.equal(r.valid, true, r.errors.join('\n'));
  assert.deepEqual(ids(r), ['claude-md-declared', 'module-with-its-test']);
  assert.deepEqual(r.payload.slices.sort(), ['report-shows-durations-s1-format-duration', 'report-shows-durations-s2-wire-report']);
});

test('adapter 3: a module split from its test, and a new test without CLAUDE.md, yield neither finding', () => {
  const r = check({
    [`${P}report-shows-durations-s1-module.md`]: slice({ files: ['src/lib/format-duration.js'] }),
    [`${P}report-shows-durations-s2-test.md`]: slice({ deps: 'report-shows-durations-s1-module', files: ['tests/format-duration.test.js'] })
  });
  assert.equal(r.valid, true, r.errors.join('\n'));
  assert.deepEqual(ids(r), []);
});

test('adapter 4: parent_plan as a path or with .md is invalid (exact bare-slug equality)', () => {
  for (const parent of ['implementation/report-shows-durations.md', 'report-shows-durations.md', '"functional/report-shows-durations"']) {
    const r = check({ [`${P}report-shows-durations-s1-x.md`]: slice({ parent, files: ['src/lib/a.js'] }) });
    assert.equal(r.valid, false, parent);
    assert.match(r.errors.join('\n'), /parent_plan/);
  }
  const quoted = check({ [`${P}report-shows-durations-s1-x.md`]: slice({ parent: '"report-shows-durations"', files: ['src/lib/a.js'] }) });
  assert.equal(quoted.valid, true, 'a quoted bare slug is the same scalar');
});

test('adapter 5: a missing or wrong canonical step label is invalid', () => {
  const wrong = LABELS.map((l) => (l === 'VERIFY' ? 'TESTING' : l));
  const missing = LABELS.filter((l) => l !== 'DOCUMENT');
  for (const labels of [wrong, missing]) {
    const r = check({ [`${P}report-shows-durations-s1-x.md`]: slice({ labels, files: ['src/lib/a.js'] }) });
    assert.equal(r.valid, false);
    assert.match(r.errors.join('\n'), /Step 1[45]/);
  }
});

test('adapter 6: a slice missing parent_plan, depends_on or files is invalid', () => {
  const text = slice({ files: ['src/lib/a.js'] }).replace(/^depends_on: none\n/m, '');
  const r = check({ [`${P}report-shows-durations-s1-x.md`]: text });
  assert.equal(r.valid, false);
  assert.match(r.errors.join('\n'), /depends_on/);
});

test('adapter 7: a depends_on cycle is invalid; a four-deep chain is dependency-too-deep', () => {
  const cyc = check({
    [`${P}report-shows-durations-s1-a.md`]: slice({ deps: 'report-shows-durations-s2-b', files: ['src/lib/a.js'] }),
    [`${P}report-shows-durations-s2-b.md`]: slice({ deps: 'report-shows-durations-s1-a', files: ['src/lib/b.js'] })
  });
  assert.equal(cyc.valid, false);
  assert.match(cyc.errors.join('\n'), /cycle/);
  const chain = {};
  for (let i = 1; i <= 4; i++) {
    chain[`${P}report-shows-durations-s${i}-x.md`] = slice({ deps: i === 1 ? 'none' : `report-shows-durations-s${i - 1}-x`, files: [`src/lib/m${i}.js`] });
  }
  const deep = check(chain);
  assert.equal(deep.valid, true, deep.errors.join('\n'));
  assert.ok(deep.findings.some((f) => f.id === 'dependency-too-deep' && f.severity === 'important'));
  delete chain[`${P}report-shows-durations-s4-x.md`];
  assert.ok(!check(chain).findings.some((f) => f.id === 'dependency-too-deep'), 'three deep is allowed');
});

test('adapter 8: a wiring section naming a path that exists nowhere is invented-call-site', () => {
  const invented = check({
    [`${P}report-shows-durations-s1-x.md`]: slice({ files: ['src/lib/a.js', 'tests/a.test.js'], wiring: 'Called from `src/jobs/nightly-sync.js:run()`.' })
  });
  assert.ok(invented.findings.some((f) => f.id === 'invented-call-site' && f.severity === 'important' && f.evidence.includes('src/jobs/nightly-sync.js')));
  const real = check({
    [`${P}report-shows-durations-s1-x.md`]: slice({ files: ['src/lib/a.js', 'tests/a.test.js'], wiring: 'Called from `src/commands/report.js:main()`, reached from `src/lib/a.js`.' })
  });
  assert.ok(!real.findings.some((f) => f.id === 'invented-call-site'), 'a path in the fixture or in a slice is not invented');
});

test('adapter 9: a question through the Needs-Input status or the questions store is question-raised, and alone makes a valid run', () => {
  const status = check({ [`${P}report-shows-durations.md.status`]: JSON.stringify({ agent: 'implementation-planner', status: 'needs-input', message: 'Where is it called?' }) });
  assert.equal(status.valid, true, status.errors.join('\n'));
  assert.deepEqual(ids(status), ['question-raised']);
  const STORE = '.ctoc/streaming/questions/implementation__report-shows-durations.json';
  const real = { id: 'q1', prompt: 'Where is it called from?', options: [{ key: 'a', label: 'report', recommended: true }] };
  const store = check({ [STORE]: JSON.stringify({ questions: [real] }) });
  assert.equal(store.valid, true, store.errors.join('\n'));
  assert.deepEqual(ids(store), ['question-raised']);
  const working = check({ [`${P}report-shows-durations.md.status`]: JSON.stringify({ status: 'working' }) });
  assert.equal(working.valid, false, 'a status still reading working raised nothing');
});

test('adapter 9b: an empty question list, a status without a message, or a status that is not JSON raises nothing', () => {
  const cases = {
    'an empty questions array': { '.ctoc/streaming/questions/implementation__report-shows-durations.json': '{"questions":[]}' },
    'a store file that is not JSON': { '.ctoc/streaming/questions/implementation__report-shows-durations.json': 'needs-input' },
    'needs-input with an empty message': { [`${P}report-shows-durations.md.status`]: JSON.stringify({ status: 'needs-input', message: '  ' }) },
    'needs-input with no message': { [`${P}report-shows-durations.md.status`]: JSON.stringify({ status: 'needs-input' }) },
    'a status that only mentions needs-input as text': { [`${P}report-shows-durations.md.status`]: 'status: needs-input — where is it called?' }
  };
  for (const [name, files] of Object.entries(cases)) {
    const r = check(files);
    assert.deepEqual(ids(r), [], name);
    assert.equal(r.valid, false, `${name}: no slice and no question is invalid`);
  }
});

test('adapter 11: a function the plan assumes but the project lacks is flagged only when the run says it does not exist', () => {
  const fx = { name: 'calls-a-missing-function', parent: 'report-shows-a-total', missing_function: 'sumDurations' };
  const slicePath = `${P}report-shows-a-total-s1-total.md`;
  const flagged = check({ [slicePath]: slice({ parent: fx.parent, files: ['src/commands/report.js'] }) + '\n`sumDurations` does not exist in `src/lib/settings.js`; this slice creates it.\n' }, fx);
  assert.ok(flagged.findings.some((f) => f.id === 'missing-function-flagged'), 'a slice line naming it as missing');
  const asked = check({ [`${P}report-shows-a-total.md.status`]: JSON.stringify({ status: 'needs-input', message: 'The plan relies on sumDurations, which is not defined anywhere. Create it or drop it?' }) }, fx);
  assert.ok(asked.findings.some((f) => f.id === 'missing-function-flagged'), 'a question naming it');
  const refused = contract.check({ output: 'Stopped: sumDurations is missing from the project, so the blueprint cannot call it.', files: {} }, fx, EXP);
  assert.ok(refused.findings.some((f) => f.id === 'missing-function-flagged'), 'a refusal in the final message');
  const silent = check({ [slicePath]: slice({ parent: fx.parent, files: ['src/commands/report.js'] }) + '\n`main` calls `sumDurations(rows)` from `src/lib/settings.js`.\n' }, fx);
  assert.ok(!silent.findings.some((f) => f.id === 'missing-function-flagged'), 'a slice that just calls it flags nothing');
  assert.ok(!check({ [slicePath]: slice({ parent: fx.parent, files: ['src/lib/a.js'] }) + '\nsumDurations does not exist.\n' }).findings.some((f) => f.id === 'missing-function-flagged'), 'only a fixture that names a missing function can produce the finding');
});

test('adapter 10: a truncated capture is invalid, never read as a slice', () => {
  const r = check({ [`${P}report-shows-durations-s1-x.md`]: { truncated: true, bytes: 300000 } });
  assert.equal(r.valid, false);
  assert.match(r.errors.join('\n'), /truncated/);
});
