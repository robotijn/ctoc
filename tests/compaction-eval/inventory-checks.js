'use strict';

/**
 * The ten rule-inventory checks of the compaction method, shared by every compacted agent.
 *
 * An inventory (`tests/compaction-eval/<agent>/rule-inventory.json`) names a baseline (the file
 * byte for byte before compaction), the compacted file, every unit of the baseline with its kind
 * and fate, and every ORDER with anchors drawn verbatim from the original. These checks hold the
 * compacted file to it. Paths inside the inventory are relative to the repository root.
 *
 * The order floor is passed in by the caller and stays written in the caller's test file, so
 * lowering it takes an edit in a second place.
 *
 * A RULE THE OWNER REPLACED. An order may end as `fate: "replaced"` only with a complete
 * `replaced_by` record — `{ instruction, date: "YYYY-MM-DD", plan, new_anchors: [...] }` — and
 * keeps its old `anchors` as history. It is then held to its NEW anchors (present in its
 * section, exactly once, each deletion reported), and its old anchors must be GONE from the
 * agent, so a replaced rule is really replaced and never silently duplicated or dropped. A unit
 * carrying a replaced order is marked `replaced` too (never `kept`); a unit marked `replaced`
 * must carry one. Everything else is held exactly as strictly as before.
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const units = require('./units');

const ROOT = path.join(__dirname, '..', '..');
const KINDS = new Set(['order', 'reason', 'history', 'example', 'reference', 'description', 'heading', 'frontmatter']);
const FATES = new Set(['kept', 'tightened', 'merged', 'cut', 'replaced']);
const CUTTABLE = new Set(['reason', 'history', 'example', 'description', 'reference']);

const isReplaced = (o) => o.fate === 'replaced';
const nonEmpty = (v) => typeof v === 'string' && units.normalize(v).length > 0;

/** What is wrong with an order's fate and replacement record; empty when nothing is. */
function replacementErrors(o) {
  if (o.fate === undefined) return [];
  if (!isReplaced(o)) return [`order ${o.id} has fate ${o.fate}`];
  const r = o.replaced_by;
  if (!r || typeof r !== 'object' || Array.isArray(r)) return [`order ${o.id} is replaced with no replaced_by record`];
  const errors = [];
  for (const field of ['instruction', 'plan']) if (!nonEmpty(r[field])) errors.push(`order ${o.id}: replaced_by.${field} is empty`);
  if (typeof r.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(r.date)) errors.push(`order ${o.id}: replaced_by.date is not YYYY-MM-DD`);
  if (!Array.isArray(r.new_anchors) || r.new_anchors.length === 0 || !r.new_anchors.every(nonEmpty)) {
    errors.push(`order ${o.id}: replaced_by.new_anchors is not a non-empty list of anchors`);
  }
  return errors;
}

/** The order as the agent is held to it now: a replaced order answers for its new anchors. */
function liveOrder(o) {
  return isReplaced(o) && o.replaced_by && Array.isArray(o.replaced_by.new_anchors) ? { ...o, anchors: o.replaced_by.new_anchors } : o;
}

/**
 * Registers the ten inventory checks for one inventory file. Reads nothing until a check runs.
 * @param {{ test: Function, label: string, inventoryPath: string, orderFloor: number }} opts
 *   test: `node:test`'s `test`; label: prefixes every test name; inventoryPath: absolute, or
 *   relative to the repository root; orderFloor: the order count at extraction, a positive integer.
 * @throws when orderFloor is not a positive integer or inventoryPath is not a non-empty string
 */
function defineInventoryTests({ test, label, inventoryPath, orderFloor }) {
  if (!Number.isInteger(orderFloor) || orderFloor <= 0) throw new Error(`orderFloor must be a positive integer, got ${JSON.stringify(orderFloor)}`);
  if (typeof inventoryPath !== 'string' || !inventoryPath) throw new Error('inventoryPath must be a non-empty string');
  const inventory = path.resolve(ROOT, inventoryPath);
  const t = (name, fn) => test(`${label}: ${name}`, fn);

  function load() {
    const inv = JSON.parse(fs.readFileSync(inventory, 'utf8'));
    const baseline = fs.readFileSync(path.resolve(ROOT, inv.baseline), 'utf8');
    const agent = fs.readFileSync(path.resolve(ROOT, inv.agent), 'utf8');
    return { inv, baseline, agent, live: inv.orders.map(liveOrder) };
  }

  t('1. the baseline is the snapshot the inventory was labelled against', () => {
    const { inv, baseline } = load();
    const sha = crypto.createHash('sha256').update(baseline).digest('hex');
    assert.equal(sha, inv.baseline_sha256, 'the baseline file changed after it was labelled');
    assert.match(inv.baseline_commit, /^[0-9a-f]{40}$/);
  });

  t('2. splitting the baseline yields exactly the inventoried units, in order', () => {
    const { inv, baseline } = load();
    const split = units.splitUnits(baseline);
    assert.equal(inv.units.length, split.length, 'unit count differs from the baseline split');
    split.forEach((u, i) => {
      assert.equal(inv.units[i].n, i + 1, `unit ${i + 1} is numbered ${inv.units[i].n}`);
      assert.equal(inv.units[i].sha, u.sha, `unit ${i + 1} does not match the baseline: ${u.text.slice(0, 80)}`);
    });
  });

  t('3. every unit is classified, every order is listed, no id repeats', () => {
    const { inv } = load();
    const ids = inv.orders.map((o) => o.id);
    assert.equal(new Set(ids).size, ids.length, 'an order id repeats');
    const known = new Set(ids);
    const replaced = new Set(inv.orders.filter(isReplaced).map((o) => o.id));
    const listed = new Set();
    for (const u of inv.units) {
      assert.ok(KINDS.has(u.kind), `unit ${u.n} has kind ${u.kind}`);
      assert.ok(FATES.has(u.fate), `unit ${u.n} has fate ${u.fate}`);
      if (u.fate === 'cut') assert.ok(CUTTABLE.has(u.kind), `unit ${u.n} is a ${u.kind} and may not be cut`);
      if (u.kind === 'order') assert.ok(u.orders.length > 0, `order unit ${u.n} lists no order`);
      if (u.fate === 'replaced') assert.ok(u.orders.some((id) => replaced.has(id)), `unit ${u.n} is marked replaced but carries no replaced order`);
      if (u.fate === 'kept') assert.ok(!u.orders.some((id) => replaced.has(id)), `unit ${u.n} is kept but carries a replaced order`);
      for (const id of u.orders) {
        assert.ok(known.has(id), `unit ${u.n} lists unknown order ${id}`);
        listed.add(id);
      }
    }
    for (const o of inv.orders) {
      assert.ok(listed.has(o.id), `order ${o.id} is listed by no unit`);
      assert.ok(o.anchors.length > 0 && o.anchors.every((a) => units.normalize(a).length > 0), `order ${o.id} has an empty anchor`);
      assert.ok(o.says.length <= 160, `order ${o.id}: says is longer than 160 characters`);
      assert.deepEqual(replacementErrors(o), [], `order ${o.id} has an incomplete replacement record`);
    }
  });

  t('4. every anchor of every order is in the agent, inside the section it now lives in', () => {
    const { inv, agent, live } = load();
    const failures = units.anchorFailures(units.sectionize(agent), live);
    const flat = units.normalize(agent);
    for (const o of inv.orders.filter(isReplaced)) {
      for (const anchor of o.anchors) if (flat.includes(units.normalize(anchor))) failures.push({ id: o.id, anchor, reason: 'replaced-but-present' });
    }
    assert.deepEqual(failures, [], failures.slice(0, 20).map((f) => `${f.id} (${f.reason}): ${f.anchor}`).join('\n'));
  });

  t('5. no unit cut from the agent still appears in it verbatim', () => {
    const { inv, baseline, agent } = load();
    const split = units.splitUnits(baseline);
    const flat = units.normalize(agent);
    const back = inv.units.filter((u) => u.fate === 'cut' && flat.includes(units.normalize(split[u.n - 1].text)));
    assert.deepEqual(back.map((u) => u.n), [], 'cut units still present');
  });

  t('6. the agent is no larger than maxBytes', () => {
    const { inv, agent } = load();
    assert.ok(Buffer.byteLength(agent) <= inv.maxBytes, `the agent is ${Buffer.byteLength(agent)} bytes; maxBytes is ${inv.maxBytes}`);
  });

  t('7. the order count holds its floor and maxBytes is set', () => {
    const { inv } = load();
    assert.ok(inv.orders.length >= orderFloor, `${inv.orders.length} orders, floor ${orderFloor}`);
    assert.ok(inv.maxBytes > 0, 'maxBytes is zero');
  });

  t('8. deleting any anchor makes check 4 report its order by id', () => {
    const { agent, live } = load();
    const sections = units.sectionize(agent);
    const silent = [];
    for (const order of live) {
      for (const anchor of order.anchors) {
        const a = units.normalize(anchor);
        const mutated = sections.map((s) => (s.heading === order.now_in ? { ...s, text: s.text.split(a).join('') } : s));
        if (!units.anchorFailures(mutated, [order]).some((f) => f.id === order.id)) silent.push(`${order.id}: ${anchor}`);
      }
    }
    assert.deepEqual(silent, [], 'anchors whose deletion goes unreported');
  });

  t('9. every unit marked kept appears word for word in the agent', () => {
    const { inv, baseline, agent } = load();
    const split = units.splitUnits(baseline);
    const flat = units.normalize(agent);
    const missing = inv.units.filter((u) => u.fate === 'kept' && !flat.includes(units.normalize(split[u.n - 1].text)));
    assert.deepEqual(missing.map((u) => u.n), [], 'units marked kept that are not in the agent word for word');
  });

  t('10. every anchor occurs exactly once in the agent, so it can only stand for its own order', () => {
    const { agent, live } = load();
    const flat = units.normalize(agent);
    const owners = new Map();
    for (const o of live) for (const a of o.anchors) owners.set(units.normalize(a), (owners.get(units.normalize(a)) || new Set()).add(o.id));
    const bad = [];
    for (const [a, ids] of owners) {
      const count = flat.split(a).length - 1;
      if (count !== 1 || ids.size !== 1) bad.push(`${[...ids].join(',')} x${count}: ${a}`);
    }
    assert.deepEqual(bad, [], 'anchors that are not unique to one order and one place');
  });
}

module.exports = { defineInventoryTests };
