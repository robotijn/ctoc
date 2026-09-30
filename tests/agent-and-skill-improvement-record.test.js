/**
 * The improvement record for "every agent and every specialist skill improved
 * three times" — the check that reads it, in its IN-PROGRESS form.
 *
 * The record lives in `.ctoc/audit/agent-and-skill-improvement/`: a starting
 * inventory (`inventory.json`, 225 paths measured once), two list files
 * (`late-corrections.json`, `for-the-human.json`) and one record per in-scope
 * file at the source path with `.json` added. The shape is fixed by the parent
 * plan, `plans/implementation/every-agent-and-specialist-skill-improved-three-times.md`,
 * section "The record's exact shape".
 *
 * This form enforces structure, continuity and consistency, and stays green
 * while the run is in progress. It does NOT yet require three rounds on every
 * inventoried file — that requirement is the run's final slice.
 *
 * The check is ONE function over a repository root, so the same function runs
 * against the real directory and against fixture directories under
 * `os.tmpdir()`. It returns a list of `{ code, message }` failures; each fixture
 * case asserts the specific code its defect must produce, and one well-formed
 * fixture must produce none, so the rejections are not vacuous.
 */

'use strict';

const { describe, it, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const util = require('util');

const ROOT = path.join(__dirname, '..');
const RECORD_REL = path.join('.ctoc', 'audit', 'agent-and-skill-improvement');
const CRITIC = 'agents/pipeline/agent-critic.md';
const VALIDATOR = 'agents/ai-quality/citation-validator.md';

// The planner's listing of 2026-09-29, confirmed on disk by the run's first task.
const REAL_EXPECTED = Object.freeze({ agents: 124, agent_categories: 24, skills: 101, total: 225 });

// ── the check ───────────────────────────────────────────────────────────

const LIST_FILES = new Set(['inventory.json', 'late-corrections.json', 'for-the-human.json']);
const EXCLUDED_GUIDES = ['skills/languages/', 'skills/frameworks/', 'skills/quality-configs/', 'skills/agent-fragments/'];
const CRITIC_TOOLS = 'Read, Grep, WebSearch, WebFetch';
const FORBIDDEN_TOOLS = ['Write', 'Edit', 'MultiEdit', 'NotebookEdit', 'Bash', 'Task'];
const FP_RX = /^sha256:[0-9a-f]{64}$/;
const DATE_RX = /^\d{4}-\d{2}-\d{2}$/;
const CLAIMS_BLOCK_RX = /<!--\s*ctoc:claims\b[\s\S]*?-->/g;

const PURPOSES = ['research-and-critique', 'validate', 're-validate'];
const SOURCE_CLASSES = ['publisher', 'standards body', 'regulator', 'vendor documentation', 'original paper', 'broad web'];
const OUTCOMES = ['supported', 'refuted', 'did-not-bear', 'unreachable'];
const FINDING_KINDS = ['new', 'correction-of-earlier-round', 'regression'];
const DECISIONS = ['applied', 'rejected', 'reported-to-human'];
const RESULTS = ['pass', 'fail'];
const VERDICTS = ['VALIDATED', 'FABRICATED', 'UNSOURCEABLE', 'MISATTRIBUTED'];
const NOT_APPLIED = ['breaks-a-pinned-contract', 'needs-a-wider-tool-grant', 'edit-protection-refused-scope-growth-filed', 'human-declined'];
const HUMAN_KINDS = [
  'wrong-fence', 'tool-grant-change', 'merge-remove-or-rename', 'output-contract-change', 'pinned-contract',
  'frontmatter-key-finding', 'out-of-scope-guide', 'out-of-scope-file', 'late-correction-not-applied',
  'declared-claim', 'claims-ledger-gate', 'claims-ledger-changed', 'instrument-list', 'sequence-cut',
  'circuit-breaker', 'project-rules-disagree',
];

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isStr = (v) => typeof v === 'string' && v.length > 0;
const isStrOrNull = (v) => v === null || typeof v === 'string';
const isCount = (v) => Number.isInteger(v) && v >= 0;
const isRoundNo = (v) => Number.isInteger(v) && v >= 1 && v <= 3;
const isFp = (v) => typeof v === 'string' && FP_RX.test(v);
/** A calendar date written YYYY-MM-DD and nothing else — no clock time. */
function isDate(v) {
  if (typeof v !== 'string' || !DATE_RX.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}
const oneOf = (list) => (v) => list.includes(v);
const arrayOf = (item) => (v) => Array.isArray(v) && v.every(item);
const shape = (spec) => (v) => isObj(v) && Object.entries(spec).every(([k, ok]) => k in v && ok(v[k]));
const FENCE = shape({ test: isStr, result: oneOf(RESULTS) });
const COUNTS_SHAPE = shape({ examined: isCount, VALIDATED: isCount, FABRICATED: isCount, UNSOURCEABLE: isCount, MISATTRIBUTED: isCount });

/** An in-scope path: repository-relative, normalised, no traversal, outside the guides. */
function inScopePath(p) {
  if (!isStr(p) || p.includes('\\') || path.posix.isAbsolute(p) || path.posix.normalize(p) !== p) return false;
  if (p.split('/').includes('..')) return false;
  if (EXCLUDED_GUIDES.some((g) => p.startsWith(g))) return false;
  return /^agents\/.+\.md$/.test(p) || /^skills\/(.+\/)?SKILL\.md$/.test(p);
}

/** Digest of a file's `ctoc:claims` block text, all blocks concatenated; null when none. */
function claimsDigest(text) {
  const blocks = text.match(CLAIMS_BLOCK_RX);
  return blocks ? `sha256:${crypto.createHash('sha256').update(blocks.join('\n')).digest('hex')}` : null;
}

/** The exact `tools:` line of a file's first frontmatter block, or null. */
function toolsLine(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return null;
  const line = m[1].split(/\r?\n/).find((l) => /^tools:/.test(l));
  return line === undefined ? null : line;
}

// Round fields: every key is required; dates and fingerprints carry their own code.
const ROUND_FIELDS = {
  round: [Number.isInteger, 'round-field'],
  date: [isDate, 'date'],
  resumed_after_unrecorded_edit: [(v) => typeof v === 'boolean', 'round-field'],
  fingerprint_before: [isFp, 'fingerprint'],
  fingerprint_after: [isFp, 'fingerprint'],
  instruments: [arrayOf(shape({ path: isStr, fingerprint: isFp })), 'round-field'],
  dispatches: [arrayOf(shape({ id: isStr, agent: isStr, purpose: oneOf(PURPOSES), declared_effort: isStr })), 'round-field'],
  queries: [arrayOf(shape({ text: isStr, source_class: oneOf(SOURCE_CLASSES), repeated_because: isStrOrNull })), 'round-field'],
  sources: [arrayOf(shape({ url: isStr, read_on: isDate, bore_on: isStr, outcome: oneOf(OUTCOMES), quote: isStrOrNull, error: isStrOrNull })), 'round-field'],
  findings: [arrayOf(shape({ id: isStr, kind: oneOf(FINDING_KINDS), text: isStr, evidence: isStr, decision: oneOf(DECISIONS), reason: isStrOrNull, for_the_human_id: isStrOrNull })), 'round-field'],
  nothing_found: [(v) => typeof v === 'boolean', 'round-field'],
  validator: [COUNTS_SHAPE, 'round-field'],
  validator_final: [COUNTS_SHAPE, 'round-field'],
  not_reverified: [arrayOf(shape({ claim: isStr, verified_on: isDate, reason: isStr })), 'round-field'],
  fences: [arrayOf(FENCE), 'round-field'],
  paired_files_compared: [arrayOf(isStr), 'round-field'],
  seven_languages: [shape({ applies: (v) => typeof v === 'boolean', reason: isStr, examples_checked: arrayOf(shape({ language: isStr, how: isStr })) }), 'round-field'],
};

const LATE_FIELDS = shape({
  id: isStr,
  date: isDate,
  found_by: shape({ path: isStr, round: isRoundNo }),
  source: shape({ url: isStr, quote: isStr }),
  before: isStr,
  after: isStrOrNull,
  validator_verdict: oneOf(VERDICTS),
  applied: (v) => typeof v === 'boolean',
  not_applied_because: (v) => v === null || NOT_APPLIED.includes(v),
  for_the_human_id: isStrOrNull,
  fences: arrayOf(FENCE),
  full_gate: shape({ command: (v) => v === 'npm test', result: oneOf(RESULTS) }),
});

const HUMAN_ENTRY = shape({
  id: isStr,
  date: isDate,
  path: isStrOrNull,
  round: (v) => v === null || isRoundNo(v),
  kind: oneOf(HUMAN_KINDS),
  evidence: isStr,
  options: (v) => Array.isArray(v) && v.length >= 2 && v.every(shape({ key: isStr, label: isStr, pros: isStr, cons: isStr })),
});

function listFiles(dir, rel = '') {
  const out = [];
  for (const e of fs.readdirSync(path.join(dir, rel), { withFileTypes: true })) {
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...listFiles(dir, r));
    else out.push(r);
  }
  return out;
}

/**
 * Check the improvement record under `<root>/.ctoc/audit/agent-and-skill-improvement/`.
 *
 * @param {{root: string, expected: {agents: number, agent_categories: number, skills: number, total: number}}} opts
 * @returns {Array<{code: string, message: string}>} every failure found; empty means the record is sound
 */
function checkRecordDir({ root, expected }) {
  const dir = path.join(root, RECORD_REL);
  const errors = [];
  const fail = (code, message) => errors.push({ code, message });
  const readJson = (rel, code) => {
    try {
      return JSON.parse(fs.readFileSync(path.join(dir, ...rel.split('/')), 'utf8'));
    } catch (e) {
      fail(code, `${rel}: ${e.message}`);
      return undefined;
    }
  };

  // 1. The inventory: exists, parses, counts, paths, sequence order.
  const inv = readJson('inventory.json', 'inventory-unreadable');
  if (inv === undefined) return errors;
  if (!isObj(inv) || !Array.isArray(inv.files)) {
    fail('inventory-shape', 'inventory.json is not an object with a files list');
    return errors;
  }
  if (inv.schema !== 1) fail('inventory-shape', 'inventory.json schema is not 1');
  if (!isDate(inv.measured_on)) fail('date', `inventory.json measured_on ${JSON.stringify(inv.measured_on)} is not YYYY-MM-DD`);
  if (!isObj(inv.counts)) fail('inventory-shape', 'inventory.json counts is not an object');
  if (!Number.isInteger(inv.wrapper_count)) fail('inventory-shape', 'inventory.json wrapper_count is not an integer');
  if (!isObj(inv.tools_at_start) || !isStr(inv.tools_at_start[CRITIC]) || !isStr(inv.tools_at_start[VALIDATOR])) {
    fail('inventory-shape', 'inventory.json tools_at_start does not hold both tools lines');
  }
  if (!isFp(inv.claims_ledger_sha256_at_start)) fail('fingerprint', 'inventory.json claims_ledger_sha256_at_start is not a sha256 fingerprint');
  if (!Array.isArray(inv.instruments) || inv.instruments.length === 0 || !inv.instruments.every(shape({ path: isStr, role: isStr, worked_in: isStr }))) {
    fail('inventory-shape', 'inventory.json instruments is not a non-empty list of { path, role, worked_in }');
  }
  if (!('dispatched_agents_observed' in inv)) fail('inventory-shape', 'inventory.json has no dispatched_agents_observed');
  if (!isObj(inv.effort_documentation)) fail('inventory-shape', 'inventory.json effort_documentation is not an object');
  if (!isStr(inv.tests_reading_method)) fail('inventory-shape', 'inventory.json tests_reading_method is not a sentence');

  const inventory = new Map();
  let lastSlice = 0;
  for (const [i, e] of inv.files.entries()) {
    const where = `inventory.json files[${i}]`;
    if (!isObj(e) || !inScopePath(e.path)) {
      fail('inventory-path', `${where} path ${JSON.stringify(e && e.path)} is not an in-scope agent or skill-body path`);
      continue;
    }
    if (inventory.has(e.path)) fail('inventory-path', `${where} path ${e.path} is listed twice`);
    inventory.set(e.path, e);
    let text = null;
    try {
      text = fs.readFileSync(path.join(root, ...e.path.split('/')), 'utf8');
    } catch (err) {
      fail('inventory-path', `${where} path ${e.path} cannot be read on disk: ${err.code || err.message}`);
    }
    const kind = e.path.startsWith('agents/') ? 'agent' : 'skill';
    if (e.kind !== kind) fail('inventory-path', `${where} ${e.path} kind is ${JSON.stringify(e.kind)}, its path says ${kind}`);
    const sm = typeof e.slice === 'string' ? e.slice.match(/^s(\d+)$/) : null;
    const sn = sm ? Number(sm[1]) : NaN;
    if (!(sn >= 3 && sn <= 120)) fail('inventory-shape', `${where} ${e.path} slice ${JSON.stringify(e.slice)} is not s3 to s120`);
    else if (sn < lastSlice) fail('inventory-slice-order', `${where} ${e.path} slice ${e.slice} comes after s${lastSlice}`);
    else lastSlice = sn;
    if (!arrayOf(isStr)(e.paired_with) || e.paired_with.includes(e.path)) fail('inventory-shape', `${where} ${e.path} paired_with is not a list of other paths`);
    const wrapperOk = kind === 'skill'
      ? e.wrapper === null
      : shape({ type: isStrOrNull, target_skill: isStrOrNull, extends_skill: isStrOrNull, body_skill_paths: arrayOf(isStr) })(e.wrapper);
    if (!wrapperOk) fail('inventory-shape', `${where} ${e.path} wrapper does not fit its kind`);
    if (!isFp(e.fingerprint_at_start)) fail('fingerprint', `${where} ${e.path} fingerprint_at_start is not a sha256 fingerprint`);
    if (!(e.claims_block_sha256_at_start === null || isFp(e.claims_block_sha256_at_start))) {
      fail('inventory-shape', `${where} ${e.path} claims_block_sha256_at_start is neither null nor a fingerprint`);
    }
    if (!(e.tests_reading === null || arrayOf((t) => typeof t === 'string' && /^tests\/[^/]+\.test\.js$/.test(t))(e.tests_reading))) {
      fail('inventory-shape', `${where} ${e.path} tests_reading is neither null nor a list of tests/*.test.js`);
    }
    // 10. The claims block has not moved since the start.
    if (text !== null && claimsDigest(text) !== e.claims_block_sha256_at_start) {
      fail('claims-block', `${e.path}: its ctoc:claims block differs from the one recorded at the start`);
    }
  }
  for (const e of inventory.values()) {
    if (Array.isArray(e.paired_with)) {
      for (const p of e.paired_with) if (!inventory.has(p)) fail('inventory-shape', `${e.path} paired_with names ${p}, which is not inventoried`);
    }
  }

  const entries = [...inventory.values()];
  const agents = entries.filter((e) => e.path.startsWith('agents/'));
  const computed = {
    agents: agents.length,
    agent_categories: new Set(agents.map((e) => e.path.split('/')[1])).size,
    skills: entries.length - agents.length,
    total: entries.length,
  };
  for (const k of Object.keys(computed)) {
    if (isObj(inv.counts) && inv.counts[k] !== computed[k]) {
      fail('inventory-counts', `inventory.json counts.${k} is ${inv.counts[k]}, its entries say ${computed[k]}`);
    }
    if (computed[k] !== expected[k]) fail('inventory-counts', `the inventory's entries give ${k} ${computed[k]}, expected ${expected[k]}`);
  }
  const wrappers = agents.filter((e) => isObj(e.wrapper) && e.wrapper.type === 'wrapper').length;
  if (inv.wrapper_count !== wrappers) fail('inventory-counts', `inventory.json wrapper_count is ${inv.wrapper_count}, its entries say ${wrappers}`);

  // 9. The two web-holding agents' tool grants.
  for (const p of [CRITIC, VALIDATOR]) {
    let line = null;
    try {
      line = toolsLine(fs.readFileSync(path.join(root, ...p.split('/')), 'utf8'));
    } catch (err) {
      fail('tools', `${p} cannot be read: ${err.code || err.message}`);
      continue;
    }
    const want = p === CRITIC ? `tools: ${CRITIC_TOOLS}` : isObj(inv.tools_at_start) ? inv.tools_at_start[VALIDATOR] : undefined;
    if (line !== want) fail('tools', `${p} tools line is ${JSON.stringify(line)}, expected ${JSON.stringify(want)}`);
    const named = (line || '').replace(/^tools:/, '').split(',').map((t) => t.trim());
    const bad = named.filter((t) => FORBIDDEN_TOOLS.includes(t));
    if (bad.length) fail('tools', `${p} tools line names ${bad.join(', ')}`);
  }

  // 8. The list for the human.
  const human = readJson('for-the-human.json', 'list-unreadable');
  const humanIds = new Set();
  if (human !== undefined) {
    if (!isObj(human) || human.schema !== 1 || !Array.isArray(human.entries)) {
      fail('for-the-human-shape', 'for-the-human.json is not { schema: 1, entries: [] }');
    } else {
      for (const [i, h] of human.entries.entries()) {
        if (!HUMAN_ENTRY(h)) fail('for-the-human-shape', `for-the-human.json entries[${i}] lacks a required field or has a wrong type`);
        if (isObj(h) && isStr(h.id)) {
          if (humanIds.has(h.id)) fail('for-the-human-shape', `for-the-human.json id ${h.id} is used twice`);
          humanIds.add(h.id);
        }
      }
    }
  }
  const needHuman = (id, where) => {
    if (!isStr(id) || !humanIds.has(id)) fail('for-the-human-missing', `${where} names for_the_human_id ${JSON.stringify(id)}, which is not in for-the-human.json`);
  };

  // 7. The list of late corrections.
  const late = readJson('late-corrections.json', 'list-unreadable');
  const lateById = new Map();
  if (late !== undefined) {
    if (!isObj(late) || late.schema !== 1 || !Array.isArray(late.entries)) {
      fail('late-correction-shape', 'late-corrections.json is not { schema: 1, entries: [] }');
    } else {
      for (const [i, l] of late.entries.entries()) {
        if (!isObj(l) || !isStr(l.id) || !isStr(l.path)) {
          fail('late-correction-shape', `late-corrections.json entries[${i}] has no id or path`);
          continue;
        }
        if (lateById.has(l.id)) fail('late-correction-shape', `late-corrections.json id ${l.id} is used twice`);
        lateById.set(l.id, l);
      }
    }
  }
  const matchedLate = new Set();

  // 2-6. The per-file records.
  let criticRecordSeen = false;
  const recordFiles = fs.existsSync(dir) ? listFiles(dir).filter((r) => !LIST_FILES.has(r)) : [];
  for (const rel of recordFiles) {
    const rec = readJson(rel, 'record-unreadable');
    if (rec === undefined) continue;
    if (!isObj(rec) || rec.schema !== 1 || !isStr(rec.path) || !Array.isArray(rec.rounds) || !Array.isArray(rec.late_corrections) || !('prerequisite' in rec) || !('held' in rec)) {
      fail('record-shape', `${rel} is not a record { schema: 1, path, prerequisite, rounds, late_corrections, held }`);
      continue;
    }
    const p = rec.path;
    if (!inventory.has(p)) fail('record-not-in-inventory', `${rel} names ${JSON.stringify(p)}, which is not in the inventory`);
    if (rel !== `${p}.json`) fail('record-location', `${rel} names ${p}; its record belongs at ${p}.json`);
    else if (p === CRITIC) criticRecordSeen = true;

    // 6. The prerequisite entry, on the critic only.
    const pre = rec.prerequisite;
    if (p === CRITIC) {
      const ok = shape({ date: isDate, fingerprint_before: isFp, fingerprint_after: isFp, fences: arrayOf(FENCE), full_gate: shape({ command: (v) => v === 'npm test', result: oneOf(RESULTS) }) })(pre);
      if (!ok) fail('prerequisite', `${rel}: the critic's prerequisite entry is absent or malformed`);
    } else if (pre !== null) {
      fail('prerequisite', `${rel}: prerequisite must be null on every file but ${CRITIC}`);
    }

    // 3. Round numbering and shape.
    if (rec.rounds.length > 3) fail('round-count', `${rel} holds ${rec.rounds.length} rounds; never more than three`);
    const findingIds = new Set();
    for (const [i, r] of rec.rounds.entries()) {
      const where = `${rel} rounds[${i}]`;
      if (!isObj(r)) {
        fail('round-field', `${where} is not an object`);
        continue;
      }
      if (r.round !== i + 1) fail('round-number', `${where} is numbered ${JSON.stringify(r.round)}, expected ${i + 1}`);
      let complete = true;
      for (const [k, [ok, code]] of Object.entries(ROUND_FIELDS)) {
        if (!(k in r)) {
          fail('round-field', `${where} has no ${k}`);
          complete = false;
        } else if (!ok(r[k])) {
          fail(code, `${where} ${k} has the wrong shape: ${JSON.stringify(r[k]).slice(0, 200)}`);
          complete = false;
        }
      }
      if (!complete) continue;

      // 4. Consistency inside the round.
      const changed = r.fingerprint_before !== r.fingerprint_after;
      const applied = r.findings.some((f) => f.decision === 'applied');
      if (applied !== changed) {
        fail('applied-vs-change', `${where}: ${changed ? 'the file changed with no applied finding' : 'an applied finding left the file unchanged'}`);
      }
      if (r.nothing_found) {
        if (changed) fail('nothing-found', `${where}: nothing_found, yet the fingerprints differ`);
        if (applied) fail('nothing-found', `${where}: nothing_found, yet a finding was applied`);
        for (const k of ['queries', 'sources', 'fences', 'paired_files_compared']) {
          if (r[k].length === 0) fail('nothing-found', `${where}: nothing_found requires a non-empty ${k}`);
        }
      }
      for (const f of r.findings) {
        if (findingIds.has(f.id)) fail('round-field', `${where} finding id ${f.id} is used twice in this record`);
        findingIds.add(f.id);
        if (f.decision === 'rejected' && !isStr(f.reason)) fail('round-field', `${where} finding ${f.id} is rejected with no reason`);
        if (f.decision === 'reported-to-human') needHuman(f.for_the_human_id, `${where} finding ${f.id}`);
      }

      // 5. Continuity.
      if (!r.resumed_after_unrecorded_edit) {
        const prev = i > 0 ? rec.rounds[i - 1] : null;
        if (prev && isObj(prev) && isFp(prev.fingerprint_after) && r.fingerprint_before !== prev.fingerprint_after) {
          fail('continuity', `${where} starts from ${r.fingerprint_before}; round ${i} ended at ${prev.fingerprint_after}`);
        }
        if (i === 0 && p === CRITIC && isObj(pre) && r.fingerprint_before !== pre.fingerprint_after) {
          fail('continuity', `${where} starts from ${r.fingerprint_before}; the prerequisite ended at ${pre.fingerprint_after}`);
        }
      }
    }

    // held marker.
    if (rec.held !== null) {
      if (!shape({ since: isDate, round: isRoundNo, reason: isStr, for_the_human_id: isStr })(rec.held)) fail('record-shape', `${rel}: held is malformed`);
      else needHuman(rec.held.for_the_human_id, `${rel} held`);
    }

    // 7. Late corrections: after three rounds only, mirrored field for field in the list.
    if (rec.late_corrections.length > 0 && rec.rounds.length !== 3) {
      fail('late-correction-early', `${rel} holds a late correction but ${rec.rounds.length} rounds`);
    }
    for (const [i, lc] of rec.late_corrections.entries()) {
      const where = `${rel} late_corrections[${i}]`;
      if (!LATE_FIELDS(lc)) {
        fail('late-correction-shape', `${where} lacks a required field or has a wrong type`);
        continue;
      }
      if (lc.applied && (lc.after === null || lc.not_applied_because !== null)) fail('late-correction-shape', `${where} is applied but carries no after text or a not-applied reason`);
      if (!lc.applied) {
        if (lc.not_applied_because === null) fail('late-correction-shape', `${where} is not applied and says no reason`);
        needHuman(lc.for_the_human_id, where);
      }
      const listed = lateById.get(lc.id);
      if (!listed) {
        fail('late-correction-mismatch', `${where} id ${lc.id} is not in late-corrections.json`);
        continue;
      }
      matchedLate.add(lc.id);
      const { path: listedPath, ...rest } = listed;
      if (listedPath !== p || !util.isDeepStrictEqual(rest, lc)) {
        fail('late-correction-mismatch', `${where} id ${lc.id} differs from its late-corrections.json entry`);
      }
    }
  }
  for (const id of lateById.keys()) {
    if (!matchedLate.has(id)) fail('late-correction-mismatch', `late-corrections.json id ${id} is in no file record`);
  }
  if (inventory.has(CRITIC) && !criticRecordSeen) fail('prerequisite', `${CRITIC} has no record holding its prerequisite entry`);

  return errors;
}

// ── fixtures ──────────────────────────────────────────────────────────

const fp =(c) => `sha256:${c.repeat(64)}`;
const sha = (text) => `sha256:${crypto.createHash('sha256').update(text).digest('hex')}`;
const A = fp('a');
const B = fp('b');
const C = fp('c');
const P0 = fp('d');
const P1 = fp('e');

const COUNTS = () => ({ examined: 2, VALIDATED: 2, FABRICATED: 0, UNSOURCEABLE: 0, MISATTRIBUTED: 0 });

function round(n, before, after, over = {}) {
  const changed = before !== after;
  return {
    round: n,
    date: '2026-09-30',
    resumed_after_unrecorded_edit: false,
    fingerprint_before: before,
    fingerprint_after: after,
    instruments: [],
    dispatches: [{ id: `d-${n}`, agent: 'pipeline/agent-critic', purpose: 'research-and-critique', declared_effort: 'xhigh' }],
    queries: [{ text: 'current guidance', source_class: 'vendor documentation', repeated_because: null }],
    sources: [{ url: 'https://example.org/guide', read_on: '2026-09-30', bore_on: 'the guidance', outcome: 'supported', quote: 'a brief quote', error: null }],
    findings: changed
      ? [{ id: `f${n}`, kind: 'new', text: 'a finding', evidence: 'https://example.org/guide', decision: 'applied', reason: null, for_the_human_id: null }]
      : [],
    nothing_found: !changed,
    validator: COUNTS(),
    validator_final: COUNTS(),
    not_reverified: [],
    fences: [{ test: 'tests/skill-loading.test.js', result: 'pass' }],
    paired_files_compared: ['agents/ai-quality/foo.md'],
    seven_languages: { applies: false, reason: 'the file carries no code example', examples_checked: [] },
    ...over,
  };
}

function lateEntry() {
  return {
    id: 'late-1',
    date: '2026-09-30',
    found_by: { path: CRITIC, round: 1 },
    source: { url: 'https://example.org/refuting', quote: 'the real figure' },
    before: 'an old claim',
    after: 'the corrected claim',
    validator_verdict: 'VALIDATED',
    applied: true,
    not_applied_because: null,
    for_the_human_id: null,
    fences: [{ test: 'tests/skill-loading.test.js', result: 'pass' }],
    full_gate: { command: 'npm test', result: 'pass' },
  };
}

const FOO = 'skills/ai-quality/foo/SKILL.md';

/** A well-formed record directory model; each case mutates one thing. */
function goodModel() {
  const files = {
    [FOO]: '---\nname: foo\n---\n\n# foo\n',
    [VALIDATOR]: '---\nname: citation-validator\ntools: Read, Grep, Skill, WebSearch, WebFetch\n---\n\n# validator\n',
    [CRITIC]: '---\nname: agent-critic\ntools: Read, Grep, WebSearch, WebFetch\n---\n\n# critic\n',
  };
  const entry = (p, kind, slice) => ({
    path: p,
    kind,
    slice,
    paired_with: [],
    wrapper: kind === 'agent' ? { type: null, target_skill: null, extends_skill: null, body_skill_paths: [] } : null,
    fingerprint_at_start: sha(files[p]),
    claims_block_sha256_at_start: null,
    tests_reading: ['tests/skill-loading.test.js'],
  });
  const inventory = {
    schema: 1,
    measured_on: '2026-09-30',
    counts: { agents: 2, agent_categories: 2, skills: 1, total: 3 },
    wrapper_count: 0,
    tools_at_start: {
      [CRITIC]: 'tools: Read, Grep, WebSearch, WebFetch',
      [VALIDATOR]: 'tools: Read, Grep, Skill, WebSearch, WebFetch',
    },
    claims_ledger_sha256_at_start: fp('f'),
    instruments: [{ path: CRITIC, role: 'research and critique', worked_in: 's119' }],
    dispatched_agents_observed: { agents: null, reason: 'the fixture has no dispatch log' },
    effort_documentation: { verdict: 'REFUTED' },
    tests_reading_method: 'fixture',
    files: [entry(FOO, 'skill', 's3'), entry(VALIDATOR, 'agent', 's115'), entry(CRITIC, 'agent', 's119')],
  };
  const records = [
    {
      loc: `${FOO}.json`,
      body: {
        schema: 1,
        path: FOO,
        prerequisite: null,
        rounds: [
          round(1, A, B),
          round(2, B, B),
          round(3, B, B, {
            nothing_found: false,
            findings: [{ id: 'f3', kind: 'new', text: 'a merge the human owns', evidence: 'file and line', decision: 'reported-to-human', reason: null, for_the_human_id: 'h-1' }],
          }),
        ],
        late_corrections: [lateEntry()],
        held: null,
      },
    },
    {
      loc: `${CRITIC}.json`,
      body: {
        schema: 1,
        path: CRITIC,
        prerequisite: {
          date: '2026-09-30',
          fingerprint_before: P0,
          fingerprint_after: P1,
          fences: [{ test: 'tests/agent-contract-load.test.js', result: 'pass' }],
          full_gate: { command: 'npm test', result: 'pass' },
        },
        rounds: [round(1, P1, P1)],
        late_corrections: [],
        held: null,
      },
    },
  ];
  const late = { schema: 1, entries: [{ ...lateEntry(), path: FOO }] };
  const human = {
    schema: 1,
    entries: [{
      id: 'h-1',
      date: '2026-09-30',
      path: FOO,
      round: 3,
      kind: 'merge-remove-or-rename',
      evidence: 'two files claim the same territory',
      options: [
        { key: 'a', label: 'keep both', pros: 'no churn', cons: 'overlap stays' },
        { key: 'b', label: 'merge', pros: 'one owner', cons: 'counts move' },
      ],
    }],
  };
  return { files, inventory, records, late, human };
}

const tmpRoots = [];
after(() => {
  for (const r of tmpRoots) fs.rmSync(r, { recursive: true, force: true });
});

/** Write a model to a fresh fixture repository root under os.tmpdir(). */
function writeFixture(model) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-improvement-record-'));
  tmpRoots.push(root);
  const put = (rel, text) => {
    const abs = path.join(root, ...rel.split('/'));
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, text);
  };
  for (const [rel, text] of Object.entries(model.files)) put(rel, text);
  const dir = RECORD_REL.split(path.sep).join('/');
  if (model.inventory !== undefined) put(`${dir}/inventory.json`, JSON.stringify(model.inventory));
  put(`${dir}/late-corrections.json`, JSON.stringify(model.late));
  put(`${dir}/for-the-human.json`, JSON.stringify(model.human));
  for (const r of model.records) put(`${dir}/${r.loc}`, JSON.stringify(r.body));
  return root;
}

const FIXTURE_EXPECTED = Object.freeze({ agents: 2, agent_categories: 2, skills: 1, total: 3 });

function fixtureErrors(mutate) {
  const model = goodModel();
  if (mutate) mutate(model);
  return checkRecordDir({ root: writeFixture(model), expected: FIXTURE_EXPECTED });
}

function assertRejected(errors, code) {
  assert.ok(
    errors.some((e) => e.code === code),
    `expected a "${code}" failure, got: ${JSON.stringify(errors, null, 2)}`
  );
}

const fooRecord = (m) => m.records.find((r) => r.body.path === FOO).body;

// ── the real directory ──────────────────────────────────────────────────

describe('the improvement record on disk (in-progress form)', () => {
  it('the starting inventory exists', () => {
    const inv = path.join(ROOT, RECORD_REL, 'inventory.json');
    assert.ok(fs.existsSync(inv), `${inv} does not exist — the run's first task writes it`);
  });

  it('the real record directory passes the check', () => {
    const errors = checkRecordDir({ root: ROOT, expected: REAL_EXPECTED });
    assert.deepEqual(errors, [], errors.map((e) => `${e.code}: ${e.message}`).join('\n'));
  });
});

// ── the check's teeth ───────────────────────────────────────────────────

describe('the record check rejects each named defect', () => {
  it('accepts a well-formed record directory (so the rejections are not vacuous)', () => {
    const errors = fixtureErrors(null);
    assert.deepEqual(errors, [], JSON.stringify(errors, null, 2));
  });

  it('rejects an absent inventory — absent is a failure, never a pass', () => {
    assertRejected(fixtureErrors((m) => { m.inventory = undefined; }), 'inventory-unreadable');
  });

  it('rejects a fourth round', () => {
    assertRejected(fixtureErrors((m) => { fooRecord(m).rounds.push(round(4, B, B)); }), 'round-count');
  });

  it('rejects a date carrying a clock time', () => {
    assertRejected(fixtureErrors((m) => { fooRecord(m).rounds[0].date = '2026-09-30T11:15:00Z'; }), 'date');
  });

  it('rejects a nothing-found round whose fingerprints differ', () => {
    assertRejected(fixtureErrors((m) => {
      const r = fooRecord(m).rounds;
      r[1].fingerprint_after = C;
      r[2].fingerprint_before = C;
      r[2].fingerprint_after = C;
    }), 'nothing-found');
  });

  it('rejects an applied finding whose fingerprints are equal', () => {
    assertRejected(fixtureErrors((m) => {
      const r = fooRecord(m).rounds;
      r[0].fingerprint_after = A;
      for (const k of [1, 2]) { r[k].fingerprint_before = A; r[k].fingerprint_after = A; }
    }), 'applied-vs-change');
  });

  it('rejects a round missing a required field', () => {
    assertRejected(fixtureErrors((m) => { delete fooRecord(m).rounds[0].sources; }), 'round-field');
  });

  it('rejects a record whose path is not in the inventory', () => {
    assertRejected(fixtureErrors((m) => {
      const p = 'skills/ai-quality/bar/SKILL.md';
      m.records.push({ loc: `${p}.json`, body: { schema: 1, path: p, prerequisite: null, rounds: [], late_corrections: [], held: null } });
    }), 'record-not-in-inventory');
  });

  it('rejects a record at the wrong mirrored location', () => {
    assertRejected(fixtureErrors((m) => {
      m.records.find((r) => r.body.path === FOO).loc = 'skills/ai-quality/foo.json';
    }), 'record-location');
  });

  it('rejects a late-correction list entry that disagrees with the file record', () => {
    assertRejected(fixtureErrors((m) => { m.late.entries[0].after = 'a different claim'; }), 'late-correction-mismatch');
  });

  it('rejects a reported-to-human finding with no list entry', () => {
    assertRejected(fixtureErrors((m) => { m.human.entries = []; }), 'for-the-human-missing');
  });

  it('rejects a critic tools line that names Write', () => {
    assertRejected(fixtureErrors((m) => {
      m.files[CRITIC] = m.files[CRITIC].replace('tools: Read, Grep, WebSearch, WebFetch', 'tools: Read, Grep, WebSearch, WebFetch, Write');
    }), 'tools');
  });

  it('rejects an inventory whose counts disagree with its entries', () => {
    assertRejected(fixtureErrors((m) => { m.inventory.counts.skills = 2; }), 'inventory-counts');
  });
});
