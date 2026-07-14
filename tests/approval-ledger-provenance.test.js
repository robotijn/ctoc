'use strict';

/**
 * R6-B — the single gate-edge encoding, finished.
 *
 * Before R6-B the three human gate edges were still encoded in TWO more places as
 * destination→source INVERSE maps, outside R5-B's file scope:
 *   - `human-gate-check.js` `HUMAN_GATES` (the revert map), and
 *   - `approval-ledger.js`  `STAGE_SOURCE` (a backfilled entry's `stage_from`).
 * Both are now DERIVED from `gate-order.GATE_SOURCE` — the one place the inverse is
 * computed. These tests pin the derived behavior (never a bare literal), prove the
 * require stays acyclic on the Bash-hook path, and fence the repo so no inverse
 * gate-edge literal can reappear outside `gate-order.js`.
 *
 * BEHAVIOR-first: the ledger assertions drive `backfillEntry` against a REAL temp
 * plan tree (no test doubles) and check the recorded `stage_from`, not an internal
 * constant.
 */

const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ledger = require('../src/lib/approval-ledger');
const gateOrder = require('../src/lib/gate-order');
const gateHook = require('../src/hooks/human-gate-check');

let projectDir;
const sandboxes = [];

beforeEach(() => {
  projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-r6b-'));
  sandboxes.push(projectDir);
  for (const stage of ['functional', 'implementation', 'todo', 'in-progress', 'review', 'done']) {
    fs.mkdirSync(path.join(projectDir, 'plans', stage), { recursive: true });
  }
  fs.mkdirSync(path.join(projectDir, '.ctoc', 'approvals'), { recursive: true });
});

afterEach(() => {
  while (sandboxes.length) {
    const dir = sandboxes.pop();
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ }
  }
});

function writePlan(stage, basename) {
  const content = `---\ntitle: "${basename}"\ntype: feature\n---\n\n# ${basename}\n\nBody.\n`;
  const filePath = path.join(projectDir, 'plans', stage, `${basename}.md`);
  fs.writeFileSync(filePath, content);
  return { filePath, content };
}

// --- approval-ledger STAGE_SOURCE derives from gate-order.GATE_SOURCE ----------
//
// A backfilled entry records the gate SOURCE it crossed FROM, keyed by the
// destination stage it now resides in. That source must be exactly the inverse of
// the canonical gate edge — i.e. `gate-order.sourceOf(stage_to)`.

test('backfillEntry records stage_from = gate-order.sourceOf(stage_to) for every gate edge', () => {
  for (const [from, to] of gateOrder.GATE_EDGES) {
    const { filePath } = writePlan(to, `bf-${to}`);
    const entry = ledger.backfillEntry(projectDir, filePath, { stage_to: to, reason: 'r6b' });
    assert.equal(entry.stage_to, to);
    assert.equal(entry.stage_from, from, `${to} must backfill from ${from}`);
    assert.equal(entry.stage_from, gateOrder.sourceOf(to), 'stage_from must equal gate-order.sourceOf(stage_to)');
  }
});

test('backfillEntry falls back to the "backfill" marker for a non-gate destination', () => {
  // `review` is not a gate DESTINATION (no edge ends there), so gate-order.GATE_SOURCE
  // has no entry — the record must not be left with an empty required field.
  const { filePath } = writePlan('review', 'bf-review');
  assert.equal(gateOrder.sourceOf('review'), undefined);
  const entry = ledger.backfillEntry(projectDir, filePath, { stage_to: 'review', reason: 'r6b' });
  assert.equal(entry.stage_from, 'backfill');
});

// --- human-gate-check revert map derives from the same inverse -----------------

test('human-gate-check HUMAN_GATES equals gate-order.GATE_SOURCE (byte-identical mappings)', () => {
  assert.deepEqual(gateHook.HUMAN_GATES, gateOrder.GATE_SOURCE);
  assert.deepEqual(gateHook.HUMAN_GATES, {
    implementation: 'functional',
    todo: 'implementation',
    done: 'review',
  });
  // The folder-scan iteration order (main() iterates Object.keys(HUMAN_GATES)) is the
  // three gate destinations, unchanged.
  assert.deepEqual(Object.keys(gateHook.HUMAN_GATES), ['implementation', 'todo', 'done']);
});

// --- no circular require: gate-order stays a pure leaf on the hook path --------

test('gate-order loads WITHOUT dragging in approval-ledger (no cycle on the Bash-hook path)', () => {
  const gatePath = require.resolve('../src/lib/gate-order');
  const ledgerPath = require.resolve('../src/lib/approval-ledger');
  // Purge both, require ONLY gate-order, and assert approval-ledger was NOT loaded as
  // a side effect. approval-ledger REQUIRES gate-order (not the reverse); if gate-order
  // ever required approval-ledger it would be a cycle on the fast Bash-hook path.
  delete require.cache[gatePath];
  delete require.cache[ledgerPath];
  assert.doesNotThrow(() => require('../src/lib/gate-order'), 'gate-order must load in isolation');
  assert.equal(require.cache[ledgerPath], undefined,
    'gate-order must not pull in approval-ledger');
  // Restore the ledger module for the remaining tests.
  require('../src/lib/approval-ledger');
});

test('approval-ledger requires gate-order and the require completes without hang or throw', () => {
  const ledgerPath = require.resolve('../src/lib/approval-ledger');
  delete require.cache[ledgerPath];
  let fresh;
  assert.doesNotThrow(() => { fresh = require('../src/lib/approval-ledger'); },
    'approval-ledger must load (it now requires the pure-constant gate-order)');
  // Prove it functions: a backfilled done/ entry still sources from review.
  const { filePath } = writePlan('done', 'fresh-ledger-load');
  assert.equal(fresh.backfillEntry(projectDir, filePath, { stage_to: 'done', reason: 'x' }).stage_from, 'review');
});

// --- the single-encoding fence: no inverse gate-edge literal outside gate-order -
//
// The gate-edge INVERSE map is uniquely identified by two unambiguous code pairs —
// `todo: 'implementation'` and `done: 'review'`. (The forward tuple shape
// `['implementation','todo']` collides with unrelated section-membership arrays in
// sections.js/menu-screens.js, and the lone pair `implementation: 'functional'`
// coincidentally appears in stale-cleanup's per-stage REVERT_MAP — so the fence keys
// on the two pairs that belong ONLY to the gate inverse map.) After R6-B these
// literals are DERIVED from gate-order.GATE_SOURCE and must appear as a code literal
// in NO src file at all.

function collectJsFiles(dir, acc = []) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) collectJsFiles(full, acc);
    else if (name.endsWith('.js')) acc.push(full);
  }
  return acc;
}

test('no inverse gate-edge literal (todo→implementation / done→review) survives outside gate-order.js', () => {
  const srcRoot = path.join(__dirname, '..', 'src');
  // gate-order.js is the ONE legitimate home for the encoding (it carries the pairs
  // only in a JSDoc example); every OTHER src file must be free of the inverse literal.
  const gateOrderFile = path.join(srcRoot, 'lib', 'gate-order.js');
  const inversePairs = [
    /\btodo\s*:\s*['"]implementation['"]/,
    /\bdone\s*:\s*['"]review['"]/,
  ];
  const offenders = [];
  for (const file of collectJsFiles(srcRoot)) {
    if (path.resolve(file) === path.resolve(gateOrderFile)) continue;
    const text = fs.readFileSync(file, 'utf8');
    for (const re of inversePairs) {
      if (re.test(text)) offenders.push(`${path.relative(srcRoot, file)} :: ${re}`);
    }
  }
  assert.deepEqual(offenders, [],
    `the inverse gate-edge map must live ONCE (derived in gate-order.js); offenders:\n${offenders.join('\n')}`);
});
