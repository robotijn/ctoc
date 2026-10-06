'use strict';

/**
 * The pre-mortem critic keeps every order it had before it was compacted.
 *
 * `tests/compaction-eval/premortem-critic/baseline-agent.md` is the agent byte for byte as
 * it stood before compaction (commit and sha256 in the inventory). The inventory splits that
 * baseline into units with the SAME splitter this test uses (`tests/compaction-eval/units.js`),
 * classifies every unit, and names every ORDER with anchors drawn verbatim from the original
 * text. The compacted agent must keep every anchor, inside the section the order now lives in.
 *
 * What it cannot see: an order wrongly labelled as a reason is inventoried as `cut` and passes,
 * and an anchor present does not prove the sentence around it still means the same thing. The
 * human-dispatched review reads every `cut` unit against the original for exactly that.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const units = require('./compaction-eval/units');

const ROOT = path.join(__dirname, '..');
const INVENTORY = path.join(__dirname, 'compaction-eval', 'premortem-critic', 'rule-inventory.json');

/** The order count at extraction. A floor: it may rise, never fall. */
const ORDER_FLOOR = 401;

const KINDS = new Set(['order', 'reason', 'history', 'example', 'reference', 'description', 'heading', 'frontmatter']);
const FATES = new Set(['kept', 'tightened', 'merged', 'cut']);
const CUTTABLE = new Set(['reason', 'history', 'example', 'description', 'reference']);

function load() {
  const inv = JSON.parse(fs.readFileSync(INVENTORY, 'utf8'));
  const baseline = fs.readFileSync(path.join(ROOT, inv.baseline), 'utf8');
  const agent = fs.readFileSync(path.join(ROOT, inv.agent), 'utf8');
  return { inv, baseline, agent };
}

test('1. the baseline is the snapshot the inventory was labelled against', () => {
  const { inv, baseline } = load();
  const sha = crypto.createHash('sha256').update(baseline).digest('hex');
  assert.equal(sha, inv.baseline_sha256, 'the baseline file changed after it was labelled');
  assert.match(inv.baseline_commit, /^[0-9a-f]{40}$/);
});

test('2. splitting the baseline yields exactly the inventoried units, in order', () => {
  const { inv, baseline } = load();
  const split = units.splitUnits(baseline);
  assert.equal(inv.units.length, split.length, 'unit count differs from the baseline split');
  split.forEach((u, i) => {
    assert.equal(inv.units[i].n, i + 1, `unit ${i + 1} is numbered ${inv.units[i].n}`);
    assert.equal(inv.units[i].sha, u.sha, `unit ${i + 1} does not match the baseline: ${u.text.slice(0, 80)}`);
  });
});

test('3. every unit is classified, every order is listed, no id repeats', () => {
  const { inv } = load();
  const ids = inv.orders.map((o) => o.id);
  assert.equal(new Set(ids).size, ids.length, 'an order id repeats');
  const known = new Set(ids);
  const listed = new Set();
  for (const u of inv.units) {
    assert.ok(KINDS.has(u.kind), `unit ${u.n} has kind ${u.kind}`);
    assert.ok(FATES.has(u.fate), `unit ${u.n} has fate ${u.fate}`);
    if (u.fate === 'cut') assert.ok(CUTTABLE.has(u.kind), `unit ${u.n} is a ${u.kind} and may not be cut`);
    if (u.kind === 'order') assert.ok(u.orders.length > 0, `order unit ${u.n} lists no order`);
    for (const id of u.orders) {
      assert.ok(known.has(id), `unit ${u.n} lists unknown order ${id}`);
      listed.add(id);
    }
  }
  for (const o of inv.orders) {
    assert.ok(listed.has(o.id), `order ${o.id} is listed by no unit`);
    assert.ok(o.anchors.length > 0 && o.anchors.every((a) => units.normalize(a).length > 0), `order ${o.id} has an empty anchor`);
    assert.ok(o.says.length <= 160, `order ${o.id}: says is longer than 160 characters`);
  }
});

test('4. every anchor of every order is in the agent, inside the section it now lives in', () => {
  const { inv, agent } = load();
  const failures = units.anchorFailures(units.sectionize(agent), inv.orders);
  assert.deepEqual(failures, [], failures.slice(0, 20).map((f) => `${f.id} (${f.reason}): ${f.anchor}`).join('\n'));
});

test('5. no unit cut from the agent still appears in it verbatim', () => {
  const { inv, baseline, agent } = load();
  const split = units.splitUnits(baseline);
  const flat = units.normalize(agent);
  const back = inv.units.filter((u) => u.fate === 'cut' && flat.includes(units.normalize(split[u.n - 1].text)));
  assert.deepEqual(back.map((u) => u.n), [], 'cut units still present');
});

test('6. the agent is no larger than maxBytes', () => {
  const { inv, agent } = load();
  assert.ok(Buffer.byteLength(agent) <= inv.maxBytes, `the agent is ${Buffer.byteLength(agent)} bytes; maxBytes is ${inv.maxBytes}`);
});

test('7. the order count holds its floor and maxBytes is set', () => {
  const { inv } = load();
  assert.ok(inv.orders.length >= ORDER_FLOOR, `${inv.orders.length} orders, floor ${ORDER_FLOOR}`);
  assert.ok(ORDER_FLOOR > 0, 'the floor was never set');
  assert.ok(inv.maxBytes > 0, 'maxBytes is zero');
});

test('8. deleting any anchor makes check 4 report its order by id', () => {
  const { inv, agent } = load();
  const sections = units.sectionize(agent);
  const silent = [];
  for (const order of inv.orders) {
    for (const anchor of order.anchors) {
      const a = units.normalize(anchor);
      const mutated = sections.map((s) => (s.heading === order.now_in ? { ...s, text: s.text.split(a).join('') } : s));
      if (!units.anchorFailures(mutated, [order]).some((f) => f.id === order.id)) silent.push(`${order.id}: ${anchor}`);
    }
  }
  assert.deepEqual(silent, [], 'anchors whose deletion goes unreported');
});

test('9. every unit marked kept appears word for word in the agent', () => {
  const { inv, baseline, agent } = load();
  const split = units.splitUnits(baseline);
  const flat = units.normalize(agent);
  const missing = inv.units.filter((u) => u.fate === 'kept' && !flat.includes(units.normalize(split[u.n - 1].text)));
  assert.deepEqual(missing.map((u) => u.n), [], 'units marked kept that are not in the agent word for word');
});

test('10. every anchor occurs exactly once in the agent, so it can only stand for its own order', () => {
  const { inv, agent } = load();
  const flat = units.normalize(agent);
  const owners = new Map();
  for (const o of inv.orders) for (const a of o.anchors) owners.set(units.normalize(a), (owners.get(units.normalize(a)) || new Set()).add(o.id));
  const bad = [];
  for (const [a, ids] of owners) {
    const count = flat.split(a).length - 1;
    if (count !== 1 || ids.size !== 1) bad.push(`${[...ids].join(',')} x${count}: ${a}`);
  }
  assert.deepEqual(bad, [], 'anchors that are not unique to one order and one place');
});
