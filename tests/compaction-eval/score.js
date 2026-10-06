'use strict';

/**
 * Scores a compaction smoke check: one dispatch per fixture plan for each version of an
 * agent (the original and the compacted), the same brief for both.
 *
 *   node tests/compaction-eval/score.js --expectations <expectations.json> --runs <dir>
 *        [--transcripts <subagents dir> | --headless <claude -p json dir>] [--benchmark-label "<label>"]
 *
 * --transcripts first collects each run from Claude Code's subagent transcripts: a transcript
 * whose meta `description` is `compaction-eval <fixture> <original|compacted>[ rerun]` becomes
 * `<runs>/<fixture>__<version>[__rerun].json` = { output, tokens, duration_ms, transcript }.
 * Then every run is scored, one row per plan is printed with the verdict, and `summary.json`
 * is written beside the runs. Exit code: 0 PASS, 1 FAIL, 3 a rerun is needed before deciding.
 *
 * The smoke check has low statistical power: one run per version cannot tell a small real drop
 * from run-to-run noise, and a PASS is not evidence that adherence held.
 */

const fs = require('node:fs');
const path = require('node:path');

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

/**
 * The shared lens contract (`contract: "lens"` in the expectations).
 * @param {object} p  the parsed payload
 * @param {{ ref: string, lens: string }} expect
 * @returns {{ valid: boolean, errors: string[] }}
 */
function checkLensContract(p, expect) {
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
  if (cond.min_severity !== undefined && (SEVERITY_RANK[f.severity] || 0) < SEVERITY_RANK[cond.min_severity]) return false;
  if (cond.evidence_contains !== undefined && !String(f.evidence || '').includes(cond.evidence_contains)) return false;
  if (cond.evidence_cites !== undefined && !citesWithin(f.evidence, cond.evidence_cites)) return false;
  return true;
}

const dig = (obj, dotted) => dotted.split('.').reduce((v, k) => (isObject(v) ? v[k] : undefined), obj);

/**
 * A parsed payload against one fixture's expectation.
 * @returns {{ found: boolean|null, seriousFalse: boolean|null, missing: object[], fieldMismatches: string[], forbidden: string[] }}
 */
function evaluate(payload, fx) {
  const findings = Array.isArray(payload && payload.findings) ? payload.findings.filter(isObject) : [];
  if (fx.kind === 'clean') {
    return { found: null, seriousFalse: findings.some((f) => (SEVERITY_RANK[f.severity] || 0) >= 2), missing: [], fieldMismatches: [], forbidden: [] };
  }
  const missing = (fx.require || []).filter((c) => !findings.some((f) => matchCondition(f, c)));
  const fieldMismatches = Object.entries(fx.fields || {}).filter(([k, v]) => dig(payload, k) !== v).map(([k]) => k);
  const forbidden = (fx.forbid || []).filter((id) => findings.some((f) => f.id === id));
  return { found: !missing.length && !fieldMismatches.length && !forbidden.length, seriousFalse: null, missing, fieldMismatches, forbidden };
}

/** One dispatch's final message, scored. An invalid output also counts as a miss. */
function scoreOutput(text, fx, exp) {
  const parsed = parseFinalMessage(text);
  const contract = parsed.ok ? checkLensContract(parsed.value, { ref: fx.ref, lens: exp.lens }) : { valid: false, errors: [parsed.error] };
  const ev = parsed.ok ? evaluate(parsed.value, fx) : evaluate({}, fx);
  const blind = parsed.ok && isObject(parsed.value.self_assessment) && Array.isArray(parsed.value.self_assessment.blind_spots)
    ? parsed.value.self_assessment.blind_spots : [];
  return {
    valid: contract.valid,
    fenced: parsed.fenced,
    errors: contract.errors,
    found: ev.found === null ? null : ev.found && contract.valid,
    seriousFalse: ev.seriousFalse,
    missing: ev.missing,
    fieldMismatches: ev.fieldMismatches,
    forbidden: ev.forbidden,
    ids: parsed.ok && Array.isArray(parsed.value.findings) ? parsed.value.findings.map((f) => f && f.id) : [],
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
    return { fixture: r.fixture, kind: r.kind, shortfalls: s, notes, status };
  });
  const verdict = out.some((r) => r.status === 'confirmed') ? 'FAIL'
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
 * A target that would resolve outside runsDir is refused.
 * @param {string[]} fixtures  the fixture names (and token-reading names) to accept
 */
function collectTranscripts(subagentsDir, runsDir, fixtures) {
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
    const run = { ...readTranscript(transcript), transcript: path.basename(transcript) };
    fs.writeFileSync(target, JSON.stringify(run, null, 2) + '\n');
    written.push({ file, transcript });
  }
  return written;
}

const HEADLESS_FILE = /^([a-z0-9][a-z0-9-]*)__(original|compacted)(__rerun)?\.json$/;

/**
 * Converts headless `claude -p --output-format json` outputs named `<name>__<version>[__rerun].json`
 * into run files: the result text, the summed usage tokens, the duration, the cost and the error
 * flag. Session ids and every other field are dropped. Unknown names and any target outside
 * runsDir are refused. When stripRoot is given, that absolute repository root is removed from
 * the output text (`<root>/x` becomes `x`, a bare `<root>` becomes `.`), so no home-directory
 * path reaches a committed run file.
 * @param {string[]} names  the fixture names (and token-reading names) to accept
 * @param {string} [stripRoot]
 */
function collectHeadless(rawDir, runsDir, names, stripRoot) {
  const known = new Set(names);
  fs.mkdirSync(runsDir, { recursive: true });
  const written = [];
  for (const file of fs.readdirSync(rawDir).sort()) {
    const m = HEADLESS_FILE.exec(file);
    if (!m || !known.has(m[1])) continue;
    const target = path.join(runsDir, file);
    if (path.relative(runsDir, target).startsWith('..')) throw new Error(`refused run file outside ${runsDir}: ${file}`);
    const j = JSON.parse(fs.readFileSync(path.join(rawDir, file), 'utf8'));
    const u = j.usage || {};
    const run = {
      output: stripRoot ? String(j.result || '').split(stripRoot + '/').join('').split(stripRoot).join('.') : String(j.result || ''),
      tokens: (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.output_tokens || 0),
      duration_ms: Number.isFinite(j.duration_ms) ? j.duration_ms : null,
      cost_usd: Number.isFinite(j.total_cost_usd) ? j.total_cost_usd : null,
      is_error: Boolean(j.is_error)
    };
    fs.writeFileSync(target, JSON.stringify(run, null, 2) + '\n');
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

/** Scores every run in a directory against the expectations; a missing run is reported, never guessed. */
function scoreRuns(exp, runsDir) {
  const rows = [];
  const missingRuns = [];
  const usage = { original: [], compacted: [] };
  for (const fx of exp.fixtures) {
    const get = (version, suffix = '') => {
      const run = readRun(runsDir, `${fx.name}__${version}${suffix}.json`);
      if (!run) { if (!suffix) missingRuns.push(`${fx.name}__${version}`); return null; }
      if (!suffix) usage[version].push(run);
      return scoreOutput(run.output, fx, exp);
    };
    const original = get('original');
    const compacted = get('compacted');
    if (!original || !compacted) continue;
    const ro = get('original', '__rerun');
    const rc = get('compacted', '__rerun');
    rows.push({ fixture: fx.name, kind: fx.kind, original, compacted, rerun: ro && rc ? { original: ro, compacted: rc } : undefined });
  }
  const verdict = missingRuns.length ? { verdict: 'INCOMPLETE', rows: [], note: NOTE } : smokeVerdict(rows);
  const stats = (runs) => ({ median_tokens: median(runs.map((r) => r.tokens)), median_duration_ms: median(runs.map((r) => r.duration_ms)) });
  return { ...verdict, missingRuns, scored: rows, usage: { original: stats(usage.original), compacted: stats(usage.compacted) } };
}

const cell = (s, kind) => (kind === 'clean' ? `valid=${s.valid} serious-false=${s.seriousFalse}` : `valid=${s.valid} found=${s.found}`);

function main(argv) {
  const arg = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
  const expPath = arg('--expectations');
  const runsDir = arg('--runs');
  if (!expPath || !runsDir) {
    process.stderr.write('usage: score.js --expectations <file> --runs <dir> [--transcripts <dir> | --headless <dir>] [--benchmark-label <label>]\n');
    process.exitCode = 2;
    return;
  }
  const exp = JSON.parse(fs.readFileSync(expPath, 'utf8'));
  const transcripts = arg('--transcripts');
  const headless = arg('--headless');
  if (headless) {
    const names = exp.fixtures.map((f) => f.name).concat(exp.token_readings || []);
    for (const w of collectHeadless(headless, runsDir, names, process.cwd())) process.stdout.write(`collected ${w.file}\n`);
  }
  if (transcripts) {
    const names = exp.fixtures.map((f) => f.name).concat(exp.token_readings || []);
    for (const w of collectTranscripts(transcripts, runsDir, names)) process.stdout.write(`collected ${w.file}\n`);
  }
  const result = scoreRuns(exp, runsDir);
  for (const r of result.scored) {
    const row = result.rows.find((x) => x.fixture === r.fixture) || {};
    process.stdout.write(`${r.fixture}  original[${cell(r.original, r.kind)}]  compacted[${cell(r.compacted, r.kind)}]  ${row.status || ''} ${(row.shortfalls || []).join(',')} ${(row.notes || []).join(',')}\n`);
  }
  if (result.missingRuns.length) process.stdout.write(`missing runs: ${result.missingRuns.join(', ')}\n`);
  process.stdout.write(`VERDICT ${result.verdict} — ${NOTE}\n`);
  const summary = { expectations: expPath, ...result };
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

module.exports = {
  parseFinalMessage, checkLensContract, matchCondition, evaluate, scoreOutput,
  smokeVerdict, collectTranscripts, collectHeadless, readTranscript, scoreRuns
};

if (require.main === module) main(process.argv.slice(2));
