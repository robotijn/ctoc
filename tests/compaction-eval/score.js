'use strict';

/**
 * Scores a compaction smoke check: one dispatch per fixture plan for each version of an
 * agent (the original and the compacted), the same brief for both.
 *
 *   node tests/compaction-eval/score.js --expectations <expectations.json> --runs <dir>
 *        [--transcripts <subagents dir> | --headless <claude -p json dir> [--run-plan <file>]]
 *        [--benchmark-label "<label>"]
 *
 * Each run is checked by the expectations' `contract`: "lens" (the default, the pre-mortem
 * critic's JSON contract) or an adapter module beside the expectations exporting
 * `check({ output, files }, fx, exp)` → `{ valid, errors, findings, payload }`. Adapters may use
 * parseFinalMessage, parseYamlSubset and checkLensFindings from this module. Matchers: per
 * finding `id`, `id_prefix`, `min_severity`, `evidence_contains`, `evidence_cites`; per fixture
 * `require`, `forbid`, `fields` (equality at a dotted payload path), `fields_contain`.
 *
 * --transcripts first collects each run from Claude Code's subagent transcripts: a transcript
 * whose meta `description` is `compaction-eval <fixture> <original|compacted>[ rerun]` becomes
 * `<runs>/<fixture>__<version>[__rerun].json` = { output, tokens, duration_ms, transcript }.
 * Then every run is scored, one row per plan is printed with the verdict, and `summary.json`
 * is written beside the runs. Exit code: 0 PASS, 1 FAIL, 2 usage, 3 a rerun is needed before
 * deciding, 4 INCOMPLETE, 5 a harness error.
 *
 * The smoke check has low statistical power: one run per version cannot tell a small real drop
 * from run-to-run noise, and a PASS is not evidence that adherence held.
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { listFiles, sha256, realPathOf, within, FILE_CAP } = require('./prepare');
const { SECRET_PATTERNS } = require('../../src/lib/secrets-scanner');

const SEVERITY_RANK = { normal: 1, important: 2, critical: 3 };
const CONFIDENCES = new Set(['HIGH', 'MEDIUM', 'LOW']);
const GATES = new Set(['Gate 0', 'Gate 1', 'Gate 2', 'Gate 3', '']);
const GATE_SOURCES = new Set(['named-in-brief', 'derived-from-ref-stage', 'none']);
const COVERAGES = new Set(['full', 'partial', 'none']);
const STABILITIES = new Set(['stable', 'variable']);
const REASONS = new Set([
  'pre-mortem-not-performed', 'instruction-injection-in-plan', 'attempted-exfiltration-through-critic',
  'corpus-row-addresses-reader', 'plan-unfit-for-gate', 'unresolved-across-rounds'
]);
const STRING_LISTS = ['ancestry_read', 'ancestry_missing', 'inputs_unsupplied', 'source_grepped', 'blind_spots'];
const DESCRIPTION = /^compaction-eval ([a-z0-9][a-z0-9-]*) (original|compacted)( rerun)?$/;
const NOTE = 'smoke check, one run per version, low statistical power, not proof';

const nonEmpty = (v) => typeof v === 'string' && v.trim().length > 0;
const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/**
 * The final message as ONE JSON object: the whole trimmed text, or exactly one fenced block.
 * @returns {{ ok: boolean, value?: object, fenced: boolean, error?: string }}
 */
function parseFinalMessage(text) {
  const t = String(text || '').trim();
  let body = t;
  let fenced = false;
  const fence = /^```[a-zA-Z]*\n([\s\S]*?)\n```$/.exec(t);
  if (fence && !fence[1].includes('\n```')) {
    body = fence[1];
    fenced = true;
  }
  if (!body.startsWith('{')) return { ok: false, fenced, error: 'prose outside the object' };
  try {
    const value = JSON.parse(body);
    return isObject(value) ? { ok: true, value, fenced } : { ok: false, fenced, error: 'not an object' };
  } catch (err) {
    return { ok: false, fenced, error: `does not parse: ${err.message}` };
  }
}

// ── A narrow YAML reader ─────────────────────────────────────────────────────────────

class YamlRefused extends Error {}
const refuse = (why) => { throw new YamlRefused(why); };
const REFUSED_START = /^[&*!{}>%@`?\]]/;
const QUOTE_OPENERS = new Set([undefined, ' ', '[', ',']);

/** Every index of s that lies outside a quoted scalar (a quote opens only at a token start). */
function* outsideQuotes(s) {
  let quote = null;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (quote === '"') { if (ch === '\\') i++; else if (ch === '"') quote = null; }
    else if (quote === "'") { if (ch === "'") quote = null; }
    else if ((ch === '"' || ch === "'") && QUOTE_OPENERS.has(s[i - 1])) quote = ch;
    else yield i;
  }
}

/** The text before a `#` that starts a comment (at the start or after a space, outside quotes). */
function stripComment(s) {
  for (const i of outsideQuotes(s)) if (s[i] === '#' && (i === 0 || s[i - 1] === ' ')) return s.slice(0, i);
  return s;
}

/** The index of the `:` that ends a mapping key (followed by a space or the end), or -1. */
function keyColon(s) {
  if (s[0] === '[' || s[0] === '{') return -1;
  for (const i of outsideQuotes(s)) if (s[i] === ':' && (i + 1 === s.length || s[i + 1] === ' ')) return i;
  return -1;
}

/** Splits a flow sequence's inner text at commas outside quotes. */
function splitFlow(inner) {
  const items = [];
  let start = 0;
  for (const i of outsideQuotes(inner)) if (inner[i] === ',') { items.push(inner.slice(start, i).trim()); start = i + 1; }
  items.push(inner.slice(start).trim());
  return items;
}

/** One inline value: a quoted scalar, a flow sequence of scalars, or a typed plain scalar. */
function yamlScalar(s, inFlow = false) {
  if (s[0] === '"') {
    if (!/^"(?:[^"\\]|\\.)*"$/.test(s)) refuse('double-quoted scalar');
    try { return JSON.parse(s); } catch { return refuse('escape outside the JSON subset'); }
  }
  if (s[0] === "'") {
    if (!/^'(?:[^']|'')*'$/.test(s)) refuse('single-quoted scalar');
    return s.slice(1, -1).replace(/''/g, "'");
  }
  if (s[0] === '[') {
    if (inFlow || !s.endsWith(']')) refuse('flow sequence');
    const inner = s.slice(1, -1);
    if (inner.trim() === '') return [];
    return splitFlow(inner).map((item) => (item === '' ? refuse('empty flow item') : yamlScalar(item, true)));
  }
  if (s === '' || REFUSED_START.test(s) || s[0] === '|' || s === '-' || s.startsWith('- ')) refuse(`plain scalar ${s}`);
  if (/: /.test(s) || s.endsWith(':') || (inFlow && /[[\]{}]/.test(s))) refuse(`plain scalar ${s}`);
  if (s === 'true' || s === 'false') return s === 'true';
  if (s === 'null' || s === '~') return null;
  if (/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(s)) return Number(s);
  return s;
}

const isSeqItem = (c) => c === '-' || c.startsWith('- ');

/** The next significant line (blank and comment-only lines skipped), not consumed. */
function peekLine(P) {
  if (P.virtual) return P.virtual;
  for (let j = P.i; j < P.lines.length; j++) {
    const raw = P.lines[j];
    const lead = /^[ \t]*/.exec(raw)[0];
    const content = stripComment(raw.slice(lead.length)).trimEnd();
    if (content === '') continue;
    if (lead.includes('\t')) refuse('tab in indentation');
    if (P.started && lead === '' && /^(?:---|\.\.\.)(?:\s|$)/.test(content)) refuse('a second document');
    return { indent: lead.length, content, idx: j };
  }
  return null;
}

function advance(P, l) {
  if (l === P.virtual) P.virtual = null;
  else P.i = l.idx + 1;
}

function nested(P, indent) {
  if (++P.depth > 64) refuse('nesting too deep');
  const v = isSeqItem(peekLine(P).content) ? yamlSeq(P, indent) : yamlMap(P, indent);
  P.depth--;
  return v;
}

/** A literal block scalar under a parent at indent n; chomp is '', '-' or '+'. */
function yamlLiteral(P, n, chomp) {
  const out = [];
  let blockIndent = null;
  let j = P.i;
  for (; j < P.lines.length; j++) {
    const raw = P.lines[j];
    if (raw.trim() === '') { out.push(''); continue; }
    const ind = /^ */.exec(raw)[0].length;
    if (blockIndent === null) { if (ind <= n) break; blockIndent = ind; }
    if (ind < blockIndent) break;
    out.push(raw.slice(blockIndent));
  }
  P.i = j;
  const core = out.slice();
  while (core.length && core[core.length - 1] === '') core.pop();
  if (chomp === '+') return out.length ? out.join('\n') + '\n' : '';
  if (chomp === '-') return core.join('\n');
  return core.length ? core.join('\n') + '\n' : '';
}

/** The value after `key:` or `- ` at indent n. */
function yamlValue(P, n, rest, inMap) {
  if (rest === '') {
    const nx = peekLine(P);
    if (nx && nx.indent > n) return nested(P, nx.indent);
    if (inMap && nx && nx.indent === n && isSeqItem(nx.content)) return yamlSeq(P, n);
    return null;
  }
  const lit = /^\|([-+]?)$/.exec(rest);
  if (lit) return yamlLiteral(P, n, lit[1]);
  return yamlScalar(rest);
}

function yamlMap(P, n) {
  const obj = {};
  for (;;) {
    const l = peekLine(P);
    if (!l || l.indent < n) return obj;
    if (l.indent > n || isSeqItem(l.content)) refuse('unexpected indentation');
    const at = keyColon(l.content);
    if (at < 0) refuse('a line that is not a key');
    const rawKey = l.content.slice(0, at).trim();
    if (rawKey === '' || (REFUSED_START.test(rawKey) && rawKey[0] !== '"')) refuse(`key ${rawKey}`);
    const key = rawKey[0] === '"' || rawKey[0] === "'" ? yamlScalar(rawKey) : rawKey;
    if (key === '__proto__' || Object.prototype.hasOwnProperty.call(obj, key)) refuse(`key ${key}`);
    advance(P, l);
    obj[key] = yamlValue(P, n, l.content.slice(at + 1).trim(), true);
  }
}

function yamlSeq(P, n) {
  const arr = [];
  for (;;) {
    const l = peekLine(P);
    if (!l || l.indent < n) return arr;
    if (l.indent > n) refuse('unexpected indentation');
    if (!isSeqItem(l.content)) return arr;
    const after = l.content.slice(1).replace(/^ +/, '');
    advance(P, l);
    if (after !== '' && (isSeqItem(after) || keyColon(after) >= 0)) {
      P.virtual = { indent: n + l.content.length - after.length, content: after };
      arr.push(nested(P, P.virtual.indent));
    } else {
      arr.push(yamlValue(P, n, after, false));
    }
  }
}

/**
 * Reads the narrow YAML the rollout's agents answer in — block mappings, block sequences
 * (including sequences of mappings), plain (typed: true/false, null/~, integers, decimals),
 * single- and double-quoted scalars, literal block scalars (`|`, `|-`, `|+`), flow sequences of
 * scalars and `#` comments — from the whole text, or from exactly one fenced block (prose
 * around it is ignored). Anything else — anchors, aliases, tags, flow mappings, folded scalars,
 * a second document, a tab in indentation, a duplicate or `__proto__` key — returns null, never
 * a partial object, so an answer it cannot read counts as invalid in both versions alike.
 * @param {string} text
 * @returns {object|any[]|null}
 */
function parseYamlSubset(text) {
  const all = String(text == null ? '' : text).replace(/\r\n/g, '\n').split('\n');
  const fences = all.map((l, i) => (/^\s*```/.test(l) ? i : -1)).filter((i) => i >= 0);
  if (fences.length !== 0 && fences.length !== 2) return null;
  const lines = fences.length ? all.slice(fences[0] + 1, fences[1]) : all;
  const P = { lines, i: 0, virtual: null, started: false, depth: 0 };
  try {
    let first = peekLine(P);
    if (first && first.indent === 0 && first.content === '---') { advance(P, first); }
    P.started = true;
    first = peekLine(P);
    if (!first) return null;
    const doc = nested(P, first.indent);
    return peekLine(P) ? null : doc;
  } catch (err) {
    if (err instanceof YamlRefused) return null;
    throw err;
  }
}

/**
 * The first half of the lens contract — `ref`, `lens`, and every finding with its options —
 * which the gate-critique lenses share. Agent adapters for other lenses call it directly.
 * @param {object} p  the parsed payload
 * @param {{ ref: string, lens: string }} expect
 * @returns {{ valid: boolean, errors: string[] }}
 */
function checkLensFindings(p, expect) {
  const errors = [];
  const err = (m) => errors.push(m);
  if (!isObject(p)) return { valid: false, errors: ['payload is not an object'] };
  if (p.lens !== expect.lens) err(`lens is ${JSON.stringify(p.lens)}, expected ${expect.lens}`);
  if (p.ref !== expect.ref) err(`ref is ${JSON.stringify(p.ref)}, expected ${expect.ref}`);
  if (!Array.isArray(p.findings)) err('findings is not a list');
  const ids = new Set();
  for (const [i, f] of (Array.isArray(p.findings) ? p.findings : []).entries()) {
    const at = `findings[${i}]`;
    if (!isObject(f)) { err(`${at} is not an object`); continue; }
    if (!nonEmpty(f.id)) err(`${at}.id missing`);
    else if (ids.has(f.id)) err(`duplicate id ${f.id}`);
    else ids.add(f.id);
    if (!SEVERITY_RANK[f.severity]) err(`${at}.severity ${JSON.stringify(f.severity)}`);
    if (!CONFIDENCES.has(f.confidence)) err(`${at}.confidence ${JSON.stringify(f.confidence)}`);
    for (const k of ['claim', 'evidence', 'decision']) if (!nonEmpty(f[k])) err(`${at}.${k} missing`);
    const opts = Array.isArray(f.options) ? f.options : [];
    if (opts.length < 2) err(`${at} has ${opts.length} option(s)`);
    const keys = new Set();
    let recommended = 0;
    for (const [j, o] of opts.entries()) {
      if (!isObject(o)) { err(`${at}.options[${j}] is not an object`); continue; }
      for (const k of ['key', 'label', 'pros', 'cons']) if (!nonEmpty(o[k])) err(`${at}.options[${j}].${k} missing`);
      if ('pro' in o || 'con' in o) err(`${at}.options[${j}] carries a singular pro/con`);
      if (keys.has(o.key)) err(`${at} repeats option key ${o.key}`);
      keys.add(o.key);
      if (o.recommended === true) recommended++;
    }
    if (recommended !== 1) err(`${at} has ${recommended} recommended options`);
  }
  return { valid: errors.length === 0, errors };
}

/**
 * The pre-mortem critic's full lens contract (`contract: "lens"`): checkLensFindings, then its
 * self-assessment and its escalation block.
 * @param {object} p  the parsed payload
 * @param {{ ref: string, lens: string }} expect
 * @returns {{ valid: boolean, errors: string[] }}
 */
function checkLensContract(p, expect) {
  const first = checkLensFindings(p, expect);
  if (!isObject(p)) return first;
  const errors = first.errors;
  const err = (m) => errors.push(m);
  const sa = p.self_assessment;
  if (!isObject(sa)) err('self_assessment missing');
  else {
    for (const k of STRING_LISTS) if (!Array.isArray(sa[k])) err(`self_assessment.${k} is not a list`);
    if (Array.isArray(sa.blind_spots) && sa.blind_spots.length === 0) err('self_assessment.blind_spots is empty');
    if (!GATES.has(sa.gate)) err(`self_assessment.gate ${JSON.stringify(sa.gate)}`);
    if (!GATE_SOURCES.has(sa.gate_source)) err(`self_assessment.gate_source ${JSON.stringify(sa.gate_source)}`);
    if ((sa.gate === '') !== (sa.gate_source === 'none')) err('gate is empty exactly when gate_source is none — violated');
    if (!COVERAGES.has(sa.coverage)) err(`self_assessment.coverage ${JSON.stringify(sa.coverage)}`);
    if (!STABILITIES.has(sa.rerun_stability)) err(`self_assessment.rerun_stability ${JSON.stringify(sa.rerun_stability)}`);
    for (const k of ['stories_generated', 'stories_kept']) {
      if (!Number.isInteger(sa[k]) || sa[k] < 0) err(`self_assessment.${k} is not a non-negative integer`);
    }
    if (typeof sa.budget_exhausted !== 'boolean') err('self_assessment.budget_exhausted is not a boolean');
  }
  if ('escalate' in p) {
    const e = p.escalate;
    if (!isObject(e)) err('escalate is not an object');
    else {
      if (e.to !== 'cto-chief') err(`escalate.to ${JSON.stringify(e.to)}`);
      if (!REASONS.has(e.reason)) err(`escalate.reason ${JSON.stringify(e.reason)}`);
      if (!nonEmpty(e.detail)) err('escalate.detail missing');
    }
  }
  return { valid: errors.length === 0, errors };
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** True when `path:N` or `path:N-M` in the evidence overlaps the window (any line, if none). */
function citesWithin(evidence, cite) {
  const re = new RegExp(`(?:^|[^\\w./-])${escapeRe(cite.path)}(?::(\\d+)(?:-(\\d+))?)?`, 'g');
  for (const m of String(evidence || '').matchAll(re)) {
    if (cite.from === undefined) return true;
    if (m[1] === undefined) continue;
    const a = Number(m[1]);
    const b = m[2] === undefined ? a : Number(m[2]);
    if (a <= cite.to && b >= cite.from) return true;
  }
  return false;
}

/** One finding against one finding-level condition. */
function matchCondition(f, cond) {
  if (cond.id !== undefined && f.id !== cond.id) return false;
  if (cond.id_prefix !== undefined) {
    if (!nonEmpty(cond.id_prefix)) throw new Error(`id_prefix must be non-empty text, got ${JSON.stringify(cond.id_prefix)}`);
    if (!String(f.id || '').startsWith(cond.id_prefix)) return false;
  }
  if (cond.min_severity !== undefined && (SEVERITY_RANK[f.severity] || 0) < SEVERITY_RANK[cond.min_severity]) return false;
  if (cond.evidence_contains !== undefined && !String(f.evidence || '').includes(cond.evidence_contains)) return false;
  if (cond.evidence_cites !== undefined && !citesWithin(f.evidence, cond.evidence_cites)) return false;
  return true;
}

const dig = (obj, dotted) => dotted.split('.').reduce((v, k) => (isObject(v) ? v[k] : undefined), obj);

/** True when the list or text at `dotted` in payload contains `text`. */
function fieldContains(payload, dotted, text) {
  if (!nonEmpty(text)) throw new Error(`fields_contain ${dotted} must be non-empty text, got ${JSON.stringify(text)}`);
  const v = dig(payload, dotted);
  if (typeof v === 'string') return v.includes(text);
  return Array.isArray(v) && v.some((x) => typeof x === 'string' && x.includes(text));
}

/**
 * A payload against one fixture's expectation. `findings` defaults to the payload's own list;
 * a contract adapter passes the findings it derived.
 * @returns {{ found: boolean|null, seriousFalse: boolean|null, missing: object[], fieldMismatches: string[], forbidden: string[] }}
 */
function evaluate(payload, fx, findingsIn) {
  const list = findingsIn !== undefined ? findingsIn : payload && payload.findings;
  const findings = Array.isArray(list) ? list.filter(isObject) : [];
  if (fx.kind === 'clean') {
    return { found: null, seriousFalse: findings.some((f) => (SEVERITY_RANK[f.severity] || 0) >= 2), missing: [], fieldMismatches: [], forbidden: [] };
  }
  const missing = (fx.require || []).filter((c) => !findings.some((f) => matchCondition(f, c)));
  const fieldMismatches = Object.entries(fx.fields || {}).filter(([k, v]) => dig(payload, k) !== v).map(([k]) => k)
    .concat(Object.entries(fx.fields_contain || {}).filter(([k, v]) => !fieldContains(payload, k, v)).map(([k]) => k));
  const forbidden = (fx.forbid || []).filter((id) => findings.some((f) => f.id === id));
  return { found: !missing.length && !fieldMismatches.length && !forbidden.length, seriousFalse: null, missing, fieldMismatches, forbidden };
}

/**
 * The default contract adapter: the final message as one JSON object, held to checkLensContract.
 * @param {{ output: string, files?: object }} run
 * @returns {{ valid: boolean, errors: string[], findings: object[], payload: object, fenced: boolean }}
 */
function lensCheck(run, fx, exp) {
  const parsed = parseFinalMessage(run.output);
  if (!parsed.ok) return { valid: false, errors: [parsed.error], findings: [], payload: {}, fenced: parsed.fenced };
  const c = checkLensContract(parsed.value, { ref: fx.ref, lens: exp.lens });
  const findings = Array.isArray(parsed.value.findings) ? parsed.value.findings : [];
  return { valid: c.valid, errors: c.errors, findings, payload: parsed.value, fenced: parsed.fenced };
}

/**
 * The contract adapter an expectations file names: `"lens"` (the default) or a path, relative to
 * the expectations file, to a module exporting `check(run, fx, exp)` that returns
 * `{ valid, errors, findings, payload }` — findings in this harness's vocabulary (`id`,
 * `severity` of critical|important|normal, `evidence`), payload what the `fields` matchers read.
 * @returns {Function}
 */
function loadContract(exp, expectationsPath, root = process.cwd()) {
  if (exp.contract === undefined || exp.contract === 'lens') return lensCheck;
  const real = fs.realpathSync(path.resolve(path.dirname(expectationsPath), String(exp.contract)));
  if (!within(real, fs.realpathSync(root))) throw new Error(`refused contract ${exp.contract}: it is outside the repository`);
  const mod = require(real);
  if (typeof mod.check !== 'function') throw new Error(`contract ${exp.contract} exports no check(run, fx, exp)`);
  return mod.check;
}

/**
 * One run (or its final message alone) scored with a contract adapter. An invalid output also
 * counts as a miss. A malformed adapter result throws: it is a bug, never a verdict.
 */
function scoreOutput(runOrText, fx, exp, check = lensCheck) {
  const run = typeof runOrText === 'string' ? { output: runOrText, files: {} } : { output: runOrText.output, files: runOrText.files || {} };
  const c = check(run, fx, exp);
  if (!isObject(c) || typeof c.valid !== 'boolean' || !Array.isArray(c.errors) || !Array.isArray(c.findings)) {
    throw new Error(`the contract adapter returned a malformed result for ${fx.name}: ${JSON.stringify(c)}`);
  }
  const payload = c.payload === undefined ? {} : c.payload;
  const ev = evaluate(payload, fx, c.findings);
  const sa = isObject(payload) && isObject(payload.self_assessment) ? payload.self_assessment : {};
  const blind = Array.isArray(sa.blind_spots) ? sa.blind_spots : [];
  return {
    valid: c.valid,
    fenced: Boolean(c.fenced),
    errors: c.errors,
    found: ev.found === null ? null : ev.found && c.valid,
    seriousFalse: ev.seriousFalse,
    missing: ev.missing,
    fieldMismatches: ev.fieldMismatches,
    forbidden: ev.forbidden,
    ids: c.findings.map((f) => f && f.id),
    standingBlindSpot: exp.standing_blind_spot ? blind.some((l) => String(l).includes(exp.standing_blind_spot)) : null
  };
}

/** The shortfalls of the compacted version against the original on one plan. */
function shortfalls(kind, original, compacted) {
  const out = [];
  if (kind === 'planted' && original.found && !compacted.found) out.push('missed-planted-defect');
  if (original.valid && !compacted.valid) out.push('invalid-output');
  if (kind === 'clean' && compacted.seriousFalse && !original.seriousFalse) out.push('serious-false-finding');
  return out;
}

/**
 * The pass rule. A shortfall on a plan stands only when that plan's single rerun repeats it.
 * @param {{ fixture: string, kind: string, original: object, compacted: object, rerun?: { original: object, compacted: object } }[]} rows
 * @returns {{ verdict: 'PASS'|'FAIL'|'RERUN', rows: object[], note: string }}
 */
function smokeVerdict(rows) {
  const out = rows.map((r) => {
    const s = shortfalls(r.kind, r.original, r.compacted);
    const notes = [];
    if (r.kind === 'planted' && !r.original.found && !r.compacted.found) notes.push('both-missed-planted-defect');
    let status = s.length ? 'needs-rerun' : 'ok';
    if (s.length && r.rerun) {
      const again = shortfalls(r.kind, r.rerun.original, r.rerun.compacted);
      status = s.some((x) => again.includes(x)) ? 'confirmed' : 'cleared-by-rerun';
    }
    if (!r.original.valid && !(r.rerun && r.rerun.original.valid)) status = 'baseline-invalid';
    return { fixture: r.fixture, kind: r.kind, shortfalls: s, notes, status };
  });
  const verdict = out.some((r) => r.status === 'baseline-invalid') ? 'INCOMPLETE'
    : out.some((r) => r.status === 'confirmed') ? 'FAIL'
    : out.some((r) => r.status === 'needs-rerun') ? 'RERUN' : 'PASS';
  return { verdict, rows: out, note: NOTE };
}

/** The final assistant text of a transcript, its context tokens, and its wall time. */
function readTranscript(file) {
  const records = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const times = records.map((r) => Date.parse(r.timestamp)).filter(Number.isFinite);
  const finals = records.filter((r) => r.type === 'assistant' && r.message && Array.isArray(r.message.content)
    && r.message.content.some((c) => c.type === 'text'));
  const last = finals[finals.length - 1];
  if (!last) throw new Error(`no assistant text in ${file}`);
  const u = last.message.usage || {};
  return {
    output: last.message.content.filter((c) => c.type === 'text').map((c) => c.text).join(''),
    tokens: (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.output_tokens || 0),
    duration_ms: times.length ? Math.max(...times) - Math.min(...times) : null
  };
}

/**
 * Writes one run file per transcript whose description names a known fixture and a version.
 * The latest transcript wins when two carry the same description; the other is reported.
 * A target that would resolve outside runsDir is refused. stripRoot (the repository root) is
 * removed from the output, and a run still holding a private path or a credential-shaped string
 * is refused before it is written.
 * @param {string[]} fixtures  the fixture names (and token-reading names) to accept
 * @param {string} [stripRoot]
 */
function collectTranscripts(subagentsDir, runsDir, fixtures, stripRoot) {
  const known = new Set(fixtures);
  const picked = new Map();
  for (const name of fs.readdirSync(subagentsDir).filter((n) => n.endsWith('.meta.json'))) {
    const meta = JSON.parse(fs.readFileSync(path.join(subagentsDir, name), 'utf8'));
    const m = DESCRIPTION.exec(String(meta.description || '').trim());
    if (!m || !known.has(m[1])) continue;
    const transcript = path.join(subagentsDir, name.replace(/\.meta\.json$/, '.jsonl'));
    const file = `${m[1]}__${m[2]}${m[3] ? '__rerun' : ''}.json`;
    const mtime = fs.statSync(transcript).mtimeMs;
    const prev = picked.get(file);
    if (prev && prev.mtime >= mtime) { process.stderr.write(`superseded: ${transcript}\n`); continue; }
    if (prev) process.stderr.write(`superseded: ${prev.transcript}\n`);
    picked.set(file, { file, transcript, mtime });
  }
  fs.mkdirSync(runsDir, { recursive: true });
  const written = [];
  for (const { file, transcript } of [...picked.values()].sort((a, b) => a.file.localeCompare(b.file))) {
    const target = path.join(runsDir, file);
    if (path.relative(runsDir, target).startsWith('..')) throw new Error(`refused run file outside ${runsDir}: ${file}`);
    const read = readTranscript(transcript);
    const run = { ...read, output: stripRoot ? stripPaths(read.output, [stripRoot]) : read.output, transcript: path.basename(transcript) };
    const text = JSON.stringify(run, null, 2) + '\n';
    refuseUnsafe(file, text);
    fs.writeFileSync(target, text);
    written.push({ file, transcript });
  }
  return written;
}

const HEADLESS_FILE = /^([a-z0-9][a-z0-9-]*)__(original|compacted)(__rerun)?\.json$/;
const RUN_CAP = 1024 * 1024;

/** Removes every given absolute prefix from text: `<p>/x` becomes `x`, a bare `<p>` becomes `.`. */
function stripPaths(text, prefixes) {
  let out = String(text || '');
  for (const p of prefixes) out = out.split(p + '/').join('').split(p).join('.');
  return out;
}

/** The credential types (never the values) found in text, by the repository's secret patterns. */
function credentialTypes(text) {
  const hits = [];
  for (const p of SECRET_PATTERNS) {
    const flags = p.pattern.flags.includes('g') ? p.pattern.flags : p.pattern.flags + 'g';
    const context = p.context ? new RegExp(p.context.source, p.context.flags.replace('g', '')) : null;
    for (const m of text.matchAll(new RegExp(p.pattern.source, flags))) {
      if (context && !context.test(text.slice(Math.max(0, m.index - 100), m.index + m[0].length + 100))) continue;
      hits.push(p.type);
      break;
    }
  }
  return hits;
}

/**
 * Which private things remain in text after stripping: the scratch path, the home path, the user
 * name — as written, and as JSON escapes them (a serialized run doubles a Windows backslash).
 */
function privateLeaks(text, scratch) {
  const user = os.userInfo().username;
  const has = (p) => text.includes(p) || text.includes(JSON.stringify(p).slice(1, -1));
  const leaks = [];
  if (scratch && has(scratch)) leaks.push('the scratch directory');
  if (has(os.homedir())) leaks.push('the home directory');
  if (user && new RegExp(`(?<![A-Za-z0-9_])${user.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![A-Za-z0-9_])`).test(text)) leaks.push('the user name');
  return leaks;
}

/**
 * Throws, naming the run but never the value, when a serialized run — its output, its captured
 * files and their NAMES — would commit a private path or a credential-shaped string.
 */
function refuseUnsafe(file, text, scratch) {
  const leaks = privateLeaks(text, scratch);
  if (leaks.length) throw new Error(`run ${file} still holds a private path (${leaks.join(', ')})`);
  const creds = credentialTypes(text);
  if (creds.length) throw new Error(`run ${file} holds a credential-shaped string (${creds.join(', ')})`);
}

/**
 * The files a scratch run created or changed: every regular file under cwd, `.claude/` excluded,
 * whose sha256 differs from the seeded one (or that was not seeded). Above 256 KiB a file is
 * recorded as `{ truncated: true, bytes }`. A symbolic link anywhere is refused.
 */
function captureFiles(cwd, seeded, prefixes) {
  const files = {};
  for (const rel of listFiles(cwd, (r) => r === '.claude' || r.startsWith('.claude/'))) {
    const file = path.join(cwd, rel);
    const bytes = fs.statSync(file).size;
    // Never read above the cap; no seeded file is that large (prepare refuses one), so it changed.
    if (bytes > FILE_CAP) { files[rel] = { truncated: true, bytes }; continue; }
    const buf = fs.readFileSync(file);
    if (seeded[rel] === sha256(buf)) continue;
    files[rel] = stripPaths(buf.toString('utf8'), prefixes);
  }
  return files;
}

/**
 * Converts headless `claude -p --output-format json` outputs named `<name>__<version>[__rerun].json`
 * into run files: the result text, the summed usage tokens, the duration, the cost and the error
 * flag. Session ids and every other field are dropped. Unknown names and any target outside
 * runsDir are refused. When stripRoot is given, that absolute repository root is removed from
 * the output text (`<root>/x` becomes `x`, a bare `<root>` becomes `.`), so no home-directory
 * path reaches a committed run file.
 *
 * With a scratch-mode run plan, a run whose dispatch has a `cwd` also stores `files` (see
 * captureFiles) and has that copy's path stripped from its output and files. The cwd must be the
 * `<fixture>__<version>` folder of the plan's scratch directory, outside the repository; a run
 * file above one megabyte in total fails, naming the run.
 * @param {string[]} names  the fixture names (and token-reading names) to accept
 * @param {string} [stripRoot]
 * @param {{ scratch: string, dispatches: object[] }} [runPlan]
 */
function collectHeadless(rawDir, runsDir, names, stripRoot, runPlan) {
  const known = new Set(names);
  if (stripRoot && fs.existsSync(stripRoot) && within(fs.realpathSync(rawDir), fs.realpathSync(stripRoot))) {
    throw new Error(`refused raw folder ${rawDir}: it is inside the repository (a raw output carries a session id)`);
  }
  fs.mkdirSync(runsDir, { recursive: true });
  const written = [];
  for (const file of fs.readdirSync(rawDir).sort()) {
    const m = HEADLESS_FILE.exec(file);
    if (!m || !known.has(m[1])) continue;
    const target = path.join(runsDir, file);
    if (path.relative(runsDir, target).startsWith('..')) throw new Error(`refused run file outside ${runsDir}: ${file}`);
    const j = JSON.parse(fs.readFileSync(path.join(rawDir, file), 'utf8'));
    const u = j.usage || {};
    const d = runPlan && runPlan.dispatches.find((x) => x.fixture === m[1] && x.version === m[2] && x.cwd);
    const prefixes = [];
    if (d) {
      const expected = path.join(String(runPlan.scratch), `${m[1]}__${m[2]}`);
      if (d.cwd !== expected || !fs.existsSync(d.cwd) || fs.realpathSync(d.cwd) !== expected) throw new Error(`refused cwd ${d.cwd}: not the copy ${expected}`);
      if (stripRoot) {
        const rel = path.relative(fs.realpathSync(stripRoot), expected);
        if (!rel.startsWith('..') && !path.isAbsolute(rel)) throw new Error(`refused cwd ${d.cwd}: it is inside the repository`);
      }
      prefixes.push(expected);
    }
    if (stripRoot) prefixes.push(stripRoot);
    const run = {
      output: stripPaths(j.result, prefixes),
      tokens: (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.output_tokens || 0),
      duration_ms: Number.isFinite(j.duration_ms) ? j.duration_ms : null,
      cost_usd: Number.isFinite(j.total_cost_usd) ? j.total_cost_usd : null,
      is_error: Boolean(j.is_error)
    };
    if (d) run.files = captureFiles(d.cwd, d.seeded || {}, prefixes);
    const text = JSON.stringify(run, null, 2) + '\n';
    refuseUnsafe(file, text, runPlan && runPlan.scratch);
    if (Buffer.byteLength(text) > RUN_CAP) throw new Error(`run ${file} is ${Buffer.byteLength(text)} bytes, above the one megabyte cap`);
    fs.writeFileSync(target, text);
    written.push({ file });
  }
  return written;
}

function readRun(dir, file) {
  const p = path.join(dir, file);
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null;
}

const median = (xs) => {
  const v = xs.filter(Number.isFinite).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
};

/**
 * Scores every run in a directory against the expectations with a contract adapter (the lens by
 * default); a missing run is reported, never guessed.
 */
function scoreRuns(exp, runsDir, check = lensCheck) {
  const rows = [];
  const missingRuns = [];
  const usage = { original: [], compacted: [] };
  for (const fx of exp.fixtures) {
    const get = (version, suffix = '') => {
      const run = readRun(runsDir, `${fx.name}__${version}${suffix}.json`);
      if (!run) { if (!suffix) missingRuns.push(`${fx.name}__${version}`); return null; }
      if (!suffix) usage[version].push(run);
      return scoreOutput(run, fx, exp, check);
    };
    const original = get('original');
    const compacted = get('compacted');
    if (!original || !compacted) continue;
    const ro = get('original', '__rerun');
    const rc = get('compacted', '__rerun');
    rows.push({ fixture: fx.name, kind: fx.kind, original, compacted, rerun: ro && rc ? { original: ro, compacted: rc } : undefined });
  }
  if (!exp.fixtures.length) missingRuns.push('no fixture is listed: nothing was checked');
  const verdict = missingRuns.length ? { verdict: 'INCOMPLETE', rows: [], note: NOTE } : smokeVerdict(rows);
  const stats = (runs) => ({ median_tokens: median(runs.map((r) => r.tokens)), median_duration_ms: median(runs.map((r) => r.duration_ms)) });
  return { ...verdict, missingRuns, scored: rows, usage: { original: stats(usage.original), compacted: stats(usage.compacted) } };
}

const cell = (s, kind) => (kind === 'clean' ? `valid=${s.valid} serious-false=${s.seriousFalse}` : `valid=${s.valid} found=${s.found}`);

function run(argv) {
  const arg = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
  const expPath = arg('--expectations');
  const runsDir = arg('--runs');
  if (!expPath || !runsDir) {
    process.stderr.write('usage: score.js --expectations <file> --runs <dir> [--transcripts <dir> | --headless <dir> [--run-plan <file>]] [--benchmark-label <label>]\n');
    process.exitCode = 2;
    return;
  }
  if (!within(realPathOf(runsDir), realPathOf(path.join(process.cwd(), '.ctoc', 'eval')))) {
    process.stderr.write(`--runs must be under .ctoc/eval/, got ${runsDir}\n`);
    process.exitCode = 2;
    return;
  }
  const exp = JSON.parse(fs.readFileSync(expPath, 'utf8'));
  const transcripts = arg('--transcripts');
  const headless = arg('--headless');
  if (headless && exp.run_in === 'scratch' && !arg('--run-plan')) {
    process.stderr.write('a scratch-mode expectations file is collected with --headless <raw dir> --run-plan <scratch>/<agent>/run-plan.json\n');
    process.exitCode = 2;
    return;
  }
  if (headless) {
    const names = exp.fixtures.map((f) => f.name).concat(exp.token_readings || []);
    const planFile = arg('--run-plan');
    const runPlan = planFile ? JSON.parse(fs.readFileSync(planFile, 'utf8')) : undefined;
    for (const w of collectHeadless(headless, runsDir, names, process.cwd(), runPlan)) process.stdout.write(`collected ${w.file}\n`);
  }
  if (transcripts) {
    const names = exp.fixtures.map((f) => f.name).concat(exp.token_readings || []);
    for (const w of collectTranscripts(transcripts, runsDir, names, process.cwd())) process.stdout.write(`collected ${w.file}\n`);
  }
  const result = scoreRuns(exp, runsDir, loadContract(exp, expPath));
  for (const r of result.scored) {
    const row = result.rows.find((x) => x.fixture === r.fixture) || {};
    process.stdout.write(`${r.fixture}  original[${cell(r.original, r.kind)}]  compacted[${cell(r.compacted, r.kind)}]  ${row.status || ''} ${(row.shortfalls || []).join(',')} ${(row.notes || []).join(',')}\n`);
  }
  if (result.missingRuns.length) process.stdout.write(`missing runs: ${result.missingRuns.join(', ')}\n`);
  process.stdout.write(`VERDICT ${result.verdict} — ${NOTE}\n`);
  const relExp = path.relative(process.cwd(), path.resolve(expPath));
  const shownExp = relExp.startsWith('..') || path.isAbsolute(relExp) ? `<outside the repository>/${path.basename(expPath)}` : expPath;
  const summary = { expectations: shownExp, ...result };
  fs.writeFileSync(path.join(runsDir, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
  const label = arg('--benchmark-label');
  if (label) {
    const smoke = {
      label, note: NOTE, verdict: result.verdict,
      plans: result.scored.map((r) => ({
        fixture: r.fixture, kind: r.kind,
        original: { valid: r.original.valid, found: r.original.found, serious_false: r.original.seriousFalse, fenced: r.original.fenced },
        compacted: { valid: r.compacted.valid, found: r.compacted.found, serious_false: r.compacted.seriousFalse, fenced: r.compacted.fenced },
        rerun: Boolean(r.rerun)
      })),
      real_brief: result.usage
    };
    process.stdout.write(JSON.stringify(smoke, null, 2) + '\n');
  }
  process.exitCode = { PASS: 0, FAIL: 1, RERUN: 3, INCOMPLETE: 4 }[result.verdict];
}

/** Exit codes: 0 PASS, 1 FAIL, 2 usage, 3 RERUN, 4 INCOMPLETE, 5 a harness error (never a verdict). */
function main(argv) {
  try {
    run(argv);
  } catch (err) {
    process.stderr.write(`harness error: ${err.message}\n`);
    process.exitCode = 5;
  }
}

module.exports = {
  parseFinalMessage, parseYamlSubset, checkLensFindings, checkLensContract, matchCondition, evaluate,
  lensCheck, loadContract, scoreOutput, smokeVerdict, collectTranscripts, collectHeadless, readTranscript, scoreRuns
};

if (require.main === module) main(process.argv.slice(2));
