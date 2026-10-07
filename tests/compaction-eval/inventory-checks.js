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
 * lowering it takes an edit in a second place. So may a digest of every unit's kind
 * (`kindsSha256`, sha256 of the `n:kind` lines): with it pinned, an order unit cannot be
 * relabelled as a cuttable kind and then cut without an edit in the caller as well.
 *
 * A RULE THE OWNER REPLACED OR ADDED. An order may end as `fate: "replaced"` only with a
 * complete `replaced_by` record — `{ instruction, date: "YYYY-MM-DD", plan, new_anchors: [...] }`
 * — and keeps its old `anchors` as history. It is then held to its NEW anchors (present in its
 * section, exactly once, each deletion reported), and every sentence of an old anchor must be
 * gone from the agent or stand inside one of the new anchors, so a replaced rule is really
 * replaced and never silently duplicated or dropped. A unit carrying a replaced order is never
 * `kept`; a unit marked `replaced` must carry one. A rule written after the baseline is an
 * order with `fate: "added"` and an `added_by` record `{ instruction, date, plan }`; no unit
 * lists it, and its own anchors are held like any other. For both records: `plan` names a plan
 * file under `plans/<stage>/` whose approval record `.ctoc/approvals/<plan>.json` is a human or
 * backfilled ledger entry matching the plan's specification hash now, and whose approved
 * specification (never its execution record) names the order id; `date` is a real calendar date, not in the future; no new
 * anchor already occurs in the baseline. The inventoried file must live under `agents/` or
 * `skills/`.
 * Everything else is held exactly as strictly as before.
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const units = require('./units');
const ledger = require('../../src/lib/approval-ledger');

const ROOT = path.join(__dirname, '..', '..');
const KINDS = new Set(['order', 'reason', 'history', 'example', 'reference', 'description', 'heading', 'frontmatter']);
const FATES = new Set(['kept', 'tightened', 'merged', 'cut', 'replaced']);
const CUTTABLE = new Set(['reason', 'history', 'example', 'description', 'reference']);

const isReplaced = (o) => o.fate === 'replaced';
const isAdded = (o) => o.fate === 'added';
const nonEmpty = (v) => typeof v === 'string' && units.normalize(v).length > 0;
const PLAN_SLUG = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
// The instruction surfaces an inventory may hold: agent definitions and specialist skills.
const INSTRUCTION_ROOTS = ['agents', 'skills'];

/** True when `date` is a real YYYY-MM-DD calendar date no later than today (UTC). */
function isPastDate(date) {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const ms = Date.parse(`${date}T00:00:00Z`);
  return Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 10) === date && date <= new Date().toISOString().slice(0, 10);
}

/**
 * The approved SPECIFICATION of plan `slug` under root/plans/<stage>/ — the part its approval
 * hash covers, with the sections the hash excludes (the execution record, the decisions,
 * the checkbox lines) removed — or null when there is no such approved plan. Approved means:
 * `.ctoc/approvals/<slug>.json` parses as a ledger entry of kind human or backfilled, its
 * `hash_scope` is `specification`, and its `content_sha256` equals the plan file's
 * specification hash now. A record anyone could write (`{}`), a record of another text, or a
 * machine crossing never counts.
 */
function approvedPlanText(root, slug) {
  if (typeof slug !== 'string' || !PLAN_SLUG.test(slug) || slug.includes('..')) return null;
  let entry;
  try {
    entry = JSON.parse(fs.readFileSync(path.join(root, '.ctoc', 'approvals', `${slug}.json`), 'utf8'));
  } catch {
    return null; // absent or unparseable: no approval to speak of
  }
  if (!['human', 'backfilled'].includes(ledger.entryKind(entry)) || entry.hash_scope !== 'specification') return null;
  const plans = path.join(root, 'plans');
  const stages = fs.existsSync(plans) ? fs.readdirSync(plans, { withFileTypes: true }).filter((d) => d.isDirectory()) : [];
  for (const stage of stages) {
    const file = path.join(plans, stage.name, `${slug}.md`);
    if (!fs.existsSync(file)) continue;
    const text = fs.readFileSync(file, 'utf8');
    const spec = ledger.computeSpecHash(text);
    return spec.ok && spec.hash === entry.content_sha256 ? specificationPart(text) : null;
  }
  return null;
}

/**
 * The plan text the specification hash covers: every section whose heading the hash
 * excludes (`approval-ledger.EXECUTION_SECTIONS`, to the next heading of the same or a higher
 * level) and every checkbox line removed — the same walk `computeSpecHash` makes.
 */
function specificationPart(text) {
  const kept = [];
  let excludeLevel = 0;
  for (const line of text.split(/\r?\n/)) {
    const m = /^(#{1,6})[ \t]+(.*)$/.exec(line.trim());
    if (m) {
      const level = m[1].length;
      if (excludeLevel && level <= excludeLevel) excludeLevel = 0;
      const title = m[2].trim().toLowerCase();
      if (!excludeLevel && ledger.EXECUTION_SECTIONS.some((name) => title.startsWith(name))) {
        excludeLevel = level;
        continue;
      }
    }
    if (excludeLevel || /^- \[[ xX]\]/.test(line.trim())) continue;
    kept.push(line);
  }
  return kept.join('\n');
}

/**
 * What is wrong with an order's fate and its replaced_by / added_by record; empty when nothing is.
 * @param {object} o the order
 * @param {string} root the repository root plans and approvals are read under
 * @param {string} baselineFlat the normalised baseline: a new anchor must not already be in it
 */
function recordErrors(o, root, baselineFlat) {
  if (o.fate === undefined) return [];
  if (!isReplaced(o) && !isAdded(o)) return [`order ${o.id} has fate ${o.fate}`];
  const field = isReplaced(o) ? 'replaced_by' : 'added_by';
  const r = o[field];
  if (!r || typeof r !== 'object' || Array.isArray(r)) return [`order ${o.id} is ${o.fate} with no ${field} record`];
  const errors = [];
  if (!nonEmpty(r.instruction)) errors.push(`order ${o.id}: ${field}.instruction is empty`);
  if (!isPastDate(r.date)) errors.push(`order ${o.id}: ${field}.date is not a real YYYY-MM-DD date up to today`);
  const planText = approvedPlanText(root, r.plan);
  if (planText === null) errors.push(`order ${o.id}: ${field}.plan names no approved plan under plans/`);
  else if (!planText.includes(o.id)) errors.push(`order ${o.id}: the plan ${r.plan} never names this order`);
  const fresh = isReplaced(o) ? r.new_anchors : o.anchors;
  if (!Array.isArray(fresh) || fresh.length === 0 || !fresh.every(nonEmpty)) {
    errors.push(`order ${o.id}: its new anchors are not a non-empty list`);
  } else {
    for (const a of fresh) if (baselineFlat.includes(units.normalize(a))) errors.push(`order ${o.id}: a new anchor is already in the baseline: ${a.slice(0, 80)}`);
  }
  return errors;
}

/** The order as the agent is held to it now: a replaced order answers for its new anchors. */
function liveOrder(o) {
  return isReplaced(o) && o.replaced_by && Array.isArray(o.replaced_by.new_anchors) ? { ...o, anchors: o.replaced_by.new_anchors } : o;
}

/**
 * Registers the ten inventory checks for one inventory file. Reads nothing until a check runs.
 * @param {{ test: Function, label: string, inventoryPath: string, orderFloor: number, root?: string }} opts
 *   test: `node:test`'s `test`; label: prefixes every test name; inventoryPath: absolute, or
 *   relative to the repository root; orderFloor: the order count at extraction, a positive integer;
 *   root: the repository root (default: this repository) — fixtures pass their own;
 *   kindsSha256: optional sha256 hex of the units' `n:kind` lines, joined by newlines.
 * @throws when orderFloor is not a positive integer, inventoryPath is not a non-empty string,
 *   or kindsSha256 is given and is not a sha256 hex digest
 */
function defineInventoryTests({ test, label, inventoryPath, orderFloor, root = ROOT, kindsSha256 }) {
  if (!Number.isInteger(orderFloor) || orderFloor <= 0) throw new Error(`orderFloor must be a positive integer, got ${JSON.stringify(orderFloor)}`);
  if (typeof inventoryPath !== 'string' || !inventoryPath) throw new Error('inventoryPath must be a non-empty string');
  if (kindsSha256 !== undefined && !/^[0-9a-f]{64}$/.test(kindsSha256)) throw new Error('kindsSha256 must be a sha256 hex digest');
  const inventory = path.resolve(root, inventoryPath);
  const t = (name, fn) => test(`${label}: ${name}`, fn);

  function load() {
    const inv = JSON.parse(fs.readFileSync(inventory, 'utf8'));
    const agentPath = path.resolve(root, inv.agent);
    const inside = (dir) => {
      const rel = path.relative(path.join(root, dir), agentPath);
      return Boolean(rel) && !rel.startsWith('..') && !path.isAbsolute(rel);
    };
    if (!INSTRUCTION_ROOTS.some(inside)) throw new Error(`the inventoried file ${inv.agent} is not under ${INSTRUCTION_ROOTS.join('/ or ')}/`);
    const baseline = fs.readFileSync(path.resolve(root, inv.baseline), 'utf8');
    const agent = fs.readFileSync(agentPath, 'utf8');
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
    const { inv, baseline } = load();
    const baselineFlat = units.normalize(baseline);
    const ids = inv.orders.map((o) => o.id);
    assert.equal(new Set(ids).size, ids.length, 'an order id repeats');
    if (kindsSha256 !== undefined) {
      const kinds = crypto.createHash('sha256').update(inv.units.map((u) => `${u.n}:${u.kind}`).join('\n')).digest('hex');
      assert.equal(kinds, kindsSha256, 'a unit\'s kind changed since it was pinned in the caller');
    }
    const known = new Set(ids);
    const replaced = new Set(inv.orders.filter(isReplaced).map((o) => o.id));
    const added = new Set(inv.orders.filter(isAdded).map((o) => o.id));
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
        assert.ok(!added.has(id), `unit ${u.n} lists ${id}, an order added after the baseline`);
        listed.add(id);
      }
    }
    for (const o of inv.orders) {
      assert.ok(listed.has(o.id) || isAdded(o), `order ${o.id} is listed by no unit`);
      assert.ok(o.anchors.length > 0 && o.anchors.every((a) => units.normalize(a).length > 0), `order ${o.id} has an empty anchor`);
      assert.ok(o.says.length <= 160, `order ${o.id}: says is longer than 160 characters`);
      assert.deepEqual(recordErrors(o, root, baselineFlat), [], `order ${o.id} has an incomplete replaced or added record`);
    }
  });

  t('4. every anchor of every order is in the agent, inside the section it now lives in', () => {
    const { inv, agent, live } = load();
    const failures = units.anchorFailures(units.sectionize(agent), live);
    const flat = units.normalize(agent);
    for (const o of inv.orders.filter(isReplaced)) {
      const fresh = (Array.isArray(o.replaced_by && o.replaced_by.new_anchors) ? o.replaced_by.new_anchors : []).map(units.normalize);
      for (const anchor of o.anchors) {
        for (const sentence of units.splitUnits(anchor).map((u) => units.normalize(u.text))) {
          if (flat.includes(sentence) && !fresh.some((a) => a.includes(sentence))) failures.push({ id: o.id, anchor: sentence, reason: 'replaced-but-present' });
        }
      }
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
