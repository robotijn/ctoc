'use strict';

/**
 * Circuit breaker — persisted, escalating kickback counters (W05-s5, finding C9).
 *
 * CLAUDE.md and docs/IRON_LOOP.md promise: "Max 3 kickbacks to the same step,
 * max 5 total kickbacks per plan. If exceeded, escalate to the user." Prior to
 * this module NO code under src/lib/ defined, incremented, persisted, or
 * escalated on a kickback count. This module is that mechanism.
 *
 * Threshold rule (resolves an internal contradiction in the parent plan in favor
 * of M7/M8, both dedicated "4th"/"6th" scenarios, CLAUDE.md, and docs/IRON_LOOP.md):
 * escalate on EXCEEDING the documented maximum —
 *   - same-step escalation fires when by_step[step] > 3  (the 4th same-step kickback)
 *   - per-plan escalation fires when total > 5           (the 6th total kickback)
 * Same-step takes precedence when both trip on a single call.
 *
 * Persistence: the counter lives in a SIDECAR, `.ctoc/state/kickbacks/<slug>.json`,
 * written atomically (temp file + rename) — the same pattern and residency as the
 * Step-14 verify evidence beside it. THE PLAN FILE IS NEVER WRITTEN.
 *
 * Why the counter left the plan file. It used to live in the plan's first YAML
 * frontmatter block, and the approval ledger hashes that frontmatter IN FULL —
 * deliberately, because it carries `files:`, the write-surface grant. So every
 * kickback moved the hashed bytes, `approval-ledger.contentMatches` read
 * `hash-mismatch`, and `approval-residency.isApprovedForCoverage` answered NOT
 * approved: the build's own quality gate revoked the build's own write permission
 * and the plan read as forged to every audit. A counter that must change during a
 * build cannot live inside the region whose whole purpose is to prove the build
 * changed nothing.
 *
 * Migration: an existing frontmatter `kickback_counts` is still READ, folded in as
 * an element-wise MAXIMUM (see maxCounts) — so no live count is lost — but it is
 * never written back, and the stale block is left in place on existing plans
 * because deleting it would itself change their hash. Nothing can raise that
 * frontmatter value again, so once the sidecar passes it the fold is a no-op;
 * while the sidecar is missing or corrupt it is a FLOOR that stops a silent reset
 * to zero.
 *
 * The module is STATELESS: every call does a read-modify-write against disk, so a
 * "process restart" is indistinguishable from any two sequential calls — the count
 * lives only on disk (satisfies M9).
 *
 * Concurrency: CLAUDE.md mandates plans are processed SEQUENTIALLY ("Never
 * parallelize plan implementation"). The plan currently executing is the sole
 * writer of its own counter, so no locking is required here.
 *
 * LIVE CALL SITE: `recordKickback` is wired into the executor's step-failure path
 * via actions.completeExecution → actions.recordStepKickback (a blocked pre-review
 * completion, and a failing Step 14 VERIFY, each record a kickback against the
 * failing step). Covered end-to-end by tests/circuit-breaker-wiring.test.js, which
 * drives the real completeExecution path — not a simulation.
 *
 * Cross-platform: path.join, safe-fs, and a `\r?\n`-tolerant frontmatter regex.
 *
 * js-yaml note: `yaml.load` here uses js-yaml's DEFAULT_SCHEMA, which is safe —
 * js-yaml 4.x removed the unsafe `!!js/*` constructors from the default schema,
 * so `load` does not execute arbitrary code. Input is a CTOC-authored plan file.
 */

const path = require('path');
const yaml = require('js-yaml');
const safeFs = require('./safe-fs');

// Same-step escalates when the count EXCEEDS this (i.e. on the 4th).
const SAME_STEP_MAX = 3;
// Per-plan escalates when the total EXCEEDS this (i.e. on the 6th).
const PER_PLAN_MAX = 5;

/**
 * Step keys that would pollute Object.prototype if used as map keys. Rejected.
 */
const FORBIDDEN_STEP_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

/**
 * Coerce and validate a step identifier into a safe string map key.
 *
 * @param {*} step - the raw step (number or string)
 * @returns {string} the coerced step key
 * @throws {Error} `step required` on a falsy step, or on a prototype-polluting key
 */
function normalizeStep(step) {
  if (step === undefined || step === null || step === '') {
    throw new Error('step required');
  }
  const key = String(step);
  if (key === '' || FORBIDDEN_STEP_KEYS.has(key)) {
    throw new Error(`step required: invalid step identifier ${JSON.stringify(key)}`);
  }
  return key;
}

/**
 * Normalize any parsed `kickback_counts` value into the zeroed-and-clean shape
 * `{ by_step: Object<string,number>, total: number }`. Fails to zero on absent
 * or malformed input — never throws — so a corrupted count can never silently
 * suppress an escalation by throwing.
 *
 * @param {*} raw - a parsed kickback_counts value (may be undefined/malformed)
 * @returns {{ by_step: Object<string,number>, total: number }}
 */
function normalizeCounts(raw) {
  const bySource = raw && typeof raw === 'object' && raw.by_step && typeof raw.by_step === 'object'
    ? raw.by_step
    : {};
  // Object.create(null) so no inherited keys leak into the map.
  const byStep = Object.create(null);
  for (const k of Object.keys(bySource)) {
    if (FORBIDDEN_STEP_KEYS.has(k)) continue;
    const n = Number(bySource[k]);
    if (Number.isFinite(n) && n > 0) byStep[k] = Math.floor(n);
  }
  let total = raw && typeof raw === 'object' ? Number(raw.total) : 0;
  if (!Number.isFinite(total) || total < 0) total = 0;
  return { by_step: byStep, total: Math.floor(total) };
}

/**
 * Extract the YAML text of EVERY stacked leading frontmatter block. Human-gate
 * crossings PREPEND a fresh first `---…---` block (actions.addApprovalMarker /
 * stampAndLedger), so over a fail→revert→re-approve cycle the block that carries
 * `kickback_counts` is pushed DEEPER while a new counter-less block sits on top.
 * Reading only the first block therefore orphaned the real count and silently
 * reset the per-plan escalation to zero every cycle. We peel every consecutive
 * leading block (separated only by whitespace) so no prepend can hide the count.
 *
 * Only LEADING blocks are scanned: prepended approval markers always stack at the
 * very top, and stopping at the first non-frontmatter text avoids mistaking a
 * `---` thematic break inside the plan BODY for a frontmatter block.
 *
 * @param {string} raw - the full plan file text
 * @returns {Array<string>} the YAML text of each leading block, top-first
 */
function frontmatterBlocks(raw) {
  const blocks = [];
  let rest = raw;
  for (;;) {
    // `^\s*` swallows only whitespace before the next `---`; a body line stops it.
    const m = rest.match(/^\s*---\r?\n([\s\S]*?)\r?\n---/);
    if (!m) break;
    blocks.push(m[1]);
    rest = rest.slice(m[0].length);
  }
  return blocks;
}

/**
 * Read `kickback_counts` across ALL leading frontmatter blocks and fold them into
 * the MAX per-step count and MAX total found in any block. Max (not first, not
 * last, not sum) is the correct fold: a prepended counter-less block contributes
 * zeros and cannot lower the result, while the true prior count — wherever it now
 * lives — is always surfaced. Never throws; a block with malformed YAML or no
 * counter contributes zeros.
 *
 * @param {string} raw - the full plan file text
 * @returns {{ by_step: Object<string,number>, total: number }} null-proto by_step
 */
function maxCountsAcrossBlocks(raw) {
  const merged = Object.create(null);
  let total = 0;
  for (const fmText of frontmatterBlocks(raw)) {
    let parsed;
    try {
      parsed = yaml.load(fmText);
    } catch {
      continue; // malformed block contributes nothing
    }
    const counts = normalizeCounts(parsed && parsed.kickback_counts);
    if (counts.total > total) total = counts.total;
    for (const k of Object.keys(counts.by_step)) {
      const v = counts.by_step[k];
      if (!(k in merged) || v > merged[k]) merged[k] = v;
    }
  }
  return { by_step: merged, total };
}

/**
 * Fold two count records into their element-wise MAXIMUM. Max (not sum, not
 * "whichever is newer") is the correct fold across the sidecar and the legacy
 * frontmatter: neither source can ever lower the other, so a missing or corrupt
 * sidecar cannot silently reset a plan's running total, and a stale frontmatter
 * value is a no-op the moment the sidecar overtakes it. Monotone, one rule, no
 * migration flag and no extra state.
 *
 * @param {{ by_step: Object<string,number>, total: number }} a
 * @param {{ by_step: Object<string,number>, total: number }} b
 * @returns {{ by_step: Object<string,number>, total: number }} null-proto by_step
 */
function maxCounts(a, b) {
  const merged = Object.create(null);
  for (const source of [a.by_step, b.by_step]) {
    for (const k of Object.keys(source)) {
      const v = source[k];
      if (!(k in merged) || v > merged[k]) merged[k] = v;
    }
  }
  return { by_step: merged, total: Math.max(a.total, b.total) };
}

/**
 * Absolute path of a plan's kickback sidecar.
 *
 * `planSlug` MUST be a BARE slug (`planSlug()` returns `path.basename(p, '.md')`,
 * so no path separator can survive) — the directory root is fixed here, so a bare
 * key cannot escape `.ctoc/state/kickbacks/`. Pure: touches no filesystem.
 *
 * @param {string} projectPath - project root
 * @param {string} planSlugValue - the plan's bare slug, no separators
 * @returns {string}
 */
function kickbackStatePath(projectPath, planSlugValue) {
  return path.join(projectPath, '.ctoc', 'state', 'kickbacks', `${planSlugValue}.json`);
}

/**
 * Read a plan's kickback sidecar.
 *
 * The three statuses are DISTINCT facts and callers act on the difference:
 * `absent` (nothing has been counted yet) is not `unreadable` (a record we cannot
 * trust). A malformed-but-parseable record classifies `unreadable`, never
 * `ok`-with-zeros — reporting a count of zero for input we never actually read is
 * the false-green shape this repository fences, and here it would suppress every
 * future escalation for that plan. Never throws.
 *
 * @param {string} projectPath - project root
 * @param {string} planSlugValue - the plan's bare slug
 * @returns {{ status: 'ok'|'absent'|'unreadable', counts: { by_step: Object<string,number>, total: number } }}
 */
function readKickbackState(projectPath, planSlugValue) {
  const zeros = { by_step: Object.create(null), total: 0 };
  let raw;
  try {
    raw = safeFs.readFileSync(kickbackStatePath(projectPath, planSlugValue), 'utf8');
  } catch (err) {
    // A file that is not there has nothing wrong with it; anything else is a
    // record we could not read, and that difference is reported, not flattened.
    if (err && err.code === 'ENOENT') return { status: 'absent', counts: zeros };
    return { status: 'unreadable', counts: zeros };
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { status: 'unreadable', counts: zeros };
  }
  const wellFormed = parsed && typeof parsed === 'object' && !Array.isArray(parsed)
    && parsed.by_step && typeof parsed.by_step === 'object' && !Array.isArray(parsed.by_step)
    && Number.isFinite(Number(parsed.total)) && Number(parsed.total) >= 0;
  if (!wellFormed) return { status: 'unreadable', counts: zeros };
  return { status: 'ok', counts: normalizeCounts(parsed) };
}

/**
 * Persist a plan's kickback counts atomically: write a uniquely-named temp file
 * beside the target, then rename it over the target (a rename within one directory
 * is atomic, so no reader ever sees a half-written count).
 *
 * RETHROWS on failure, deliberately. The throw propagates to
 * `actions.recordStepKickback`, which reports `{ recorded: false }`, prints the
 * loud console error and appends a durable `breaker-failure` escalation. A breaker
 * that cannot persist its count must never report success.
 *
 * @param {string} projectPath - project root
 * @param {string} planSlugValue - the plan's bare slug
 * @param {{ by_step: Object<string,number>, total: number }} counts
 * @throws {Error} a wrapped persist error naming the plan (`cause` carries the
 *   original filesystem error), after a best-effort cleanup of the temp file
 */
function writeKickbackState(projectPath, planSlugValue, counts) {
  const target = kickbackStatePath(projectPath, planSlugValue);
  const tmp = `${target}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const record = {
    plan: planSlugValue,
    // Plain objects so the JSON carries no null-prototype artifacts.
    by_step: Object.assign({}, counts.by_step),
    total: counts.total,
    updated_at: new Date().toISOString()
  };
  try {
    safeFs.mkdirSync(path.dirname(target), { recursive: true });
    safeFs.writeFileSync(tmp, JSON.stringify(record, null, 2) + '\n', 'utf8');
    safeFs.renameSync(tmp, target);
  } catch (err) {
    // Best-effort cleanup of the temp file. A cleanup failure is NOT a verdict about
    // the count — the persist failure is what the caller must act on — so it is
    // RECORDED into the rethrown message rather than discarded. Swallowing it would
    // hide a directory quietly filling with orphaned temp files.
    let cleanupNote = '';
    try {
      safeFs.unlinkSync(tmp);
    } catch (cleanupErr) {
      const code = cleanupErr && cleanupErr.code ? cleanupErr.code : 'unknown error';
      cleanupNote = ` (the temp file could not be removed either: ${code})`;
    }
    const cause = err && err.message ? err.message : String(err);
    throw new Error(`could not persist the kickback counter for ${planSlugValue}: ${cause}${cleanupNote}`, { cause: err });
  }
}

/**
 * Read the persisted kickback counts for a plan: the sidecar when it is readable,
 * otherwise the legacy frontmatter counter as a floor (see maxCounts).
 *
 * `projectPath` is REQUIRED. Without a root the sidecar cannot be located, and
 * answering `0` for a plan that has been kicked back six times is a number we did
 * not read — the false-zero class `src/scripts/test-gate.js` documents against. A
 * missing argument is a PROGRAMMING error and throws; the module's "never throws
 * on bad DATA" contract is untouched (an absent, unreadable or malformed plan file
 * still reads as zeros, and a malformed sidecar still falls back to the plan).
 *
 * @param {string} planPath - absolute path to the plan `.md` file
 * @param {string} projectPath - project root (REQUIRED — locates the sidecar)
 * @returns {{ by_step: Object<string,number>, total: number }}
 * @throws {Error} `projectPath required` when no project root is supplied
 */
function readKickbackCounts(planPath, projectPath) {
  if (typeof projectPath !== 'string' || projectPath === '') {
    throw new Error('projectPath required: the kickback counter lives in a sidecar under the project root');
  }
  const state = readKickbackState(projectPath, planSlug(planPath));
  if (state.status === 'ok') {
    return { by_step: Object.assign({}, state.counts.by_step), total: state.counts.total };
  }
  // No trustworthy sidecar: fall back to the legacy frontmatter counter so a plan
  // mid-migration (or one whose sidecar is corrupt) never reads as a false zero.
  let raw;
  try {
    raw = safeFs.readFileSync(planPath, 'utf8');
  } catch {
    return { by_step: {}, total: 0 };
  }
  const counts = maxCounts(state.counts, maxCountsAcrossBlocks(raw));
  // Return a plain object (drop the null prototype) for ergonomic caller use.
  return { by_step: Object.assign({}, counts.by_step), total: counts.total };
}

/**
 * Append a human-facing escalation record to `.ctoc/logs/escalations.json`.
 * The return value of `recordKickback` is the primary observable the tests
 * assert; this log is the durable human record.
 *
 * @param {string} projectPath - project root
 * @param {Object} entry - the escalation entry to append
 */
function appendEscalation(projectPath, entry) {
  const logsDir = path.join(projectPath, '.ctoc', 'logs');
  const logPath = path.join(logsDir, 'escalations.json');
  let existing = [];
  try {
    const rawLog = safeFs.readFileSync(logPath, 'utf8');
    const parsed = JSON.parse(rawLog);
    if (Array.isArray(parsed)) existing = parsed;
  } catch {
    existing = [];
  }
  existing.push(entry);
  try {
    safeFs.mkdirSync(logsDir, { recursive: true });
  } catch {
    // best-effort: if the dir already exists, mkdir with recursive is a no-op
  }
  safeFs.writeFileSync(logPath, JSON.stringify(existing, null, 2) + '\n', 'utf8');
}

/**
 * Derive a plan slug from its file path (basename without the `.md` extension).
 *
 * @param {string} planPath
 * @returns {string}
 */
function planSlug(planPath) {
  return path.basename(planPath, '.md');
}

/**
 * Record one kickback for `(plan, step)`: increment the per-step and per-plan
 * counters, persist them to the plan's SIDECAR, and compute an escalation signal
 * when a documented maximum is exceeded. THE PLAN FILE IS NEVER WRITTEN — see the
 * module header for why the counter cannot live in the hashed frontmatter.
 *
 * @param {string} planPath - absolute path to the plan `.md` file
 * @param {string|number} step - the Iron Loop step being kicked back to
 * @param {string} projectPath - project root (holds the sidecar + escalations log)
 * @returns {{ recorded: true, byStep: number, total: number, escalation: Object|null }}
 * @throws {Error} `step required` on a falsy or prototype-polluting step
 * @throws {Error} when the plan cannot be read or the sidecar cannot be persisted
 */
function recordKickback(planPath, step, projectPath) {
  const stepKey = normalizeStep(step); // throws before any file read/write
  const slug = planSlug(planPath);

  const state = readKickbackState(projectPath, slug);

  // The plan read is UNGUARDED and happens on every call, deliberately: a plan
  // file that does not exist must throw and hard-escalate through
  // actions.recordStepKickback. Dropping this read would turn a ghost plan into a
  // silent, permanently-quiet success.
  const raw = safeFs.readFileSync(planPath, 'utf8');
  // The MIGRATION read: an existing frontmatter counter is honoured, in whichever
  // leading block it now sits (a human-gate crossing PREPENDS a counter-less block,
  // which would otherwise orphan the real count and reset the per-plan escalation).
  const counts = maxCounts(state.counts, maxCountsAcrossBlocks(raw));

  const nextByStep = (counts.by_step[stepKey] || 0) + 1;
  counts.by_step[stepKey] = nextByStep;
  counts.total += 1;

  // Throws on failure — a breaker that cannot persist must not report success.
  writeKickbackState(projectPath, slug, counts);

  if (state.status === 'unreadable') {
    // The breaker keeps counting AND says it was degraded. Returning zeros quietly
    // would suppress every future escalation for this plan; counting silently from
    // the frontmatter floor would hide that the real count may be low.
    recordBreakerFailure(projectPath, {
      plan: slug,
      step: stepKey,
      error: 'kickback state unreadable — the count was rebuilt from the plan file and may be low'
    });
  }

  let escalation = null;
  if (nextByStep > SAME_STEP_MAX) {
    // Same-step takes precedence when both thresholds trip on one call.
    escalation = {
      type: 'same-step',
      plan: slug,
      step: stepKey,
      count: nextByStep
    };
  } else if (counts.total > PER_PLAN_MAX) {
    escalation = {
      type: 'per-plan',
      plan: slug,
      total: counts.total
    };
  }

  if (escalation) {
    appendEscalation(projectPath, Object.assign({}, escalation, { at: new Date().toISOString() }));
  }

  return {
    recorded: true,
    byStep: nextByStep,
    total: counts.total,
    escalation
  };
}

/**
 * Record a HARD escalation for a breaker that could not record its own count.
 * When `recordKickback` itself fails (e.g. the plan file cannot be read), the
 * counter cannot advance — so the loop could retry forever, unseen. That failure
 * must ITSELF reach the human: this appends a durable `breaker-failure` entry to
 * the same escalations log the menu/inbox reads, so a breaker that cannot count
 * escalates rather than silently continuing.
 *
 * Never throws — a logging failure here must not mask the original error.
 *
 * @param {string} projectPath - project root
 * @param {{plan: string, step?: (string|number), error?: string}} info
 */
function recordBreakerFailure(projectPath, info) {
  try {
    appendEscalation(projectPath, {
      type: 'breaker-failure',
      plan: info && info.plan,
      step: info && info.step !== undefined ? String(info.step) : undefined,
      error: info && info.error,
      at: new Date().toISOString()
    });
  } catch {
    // best-effort: the caller already surfaces the original error to the console.
  }
}

/**
 * Read the human-facing escalation records for a project.
 *
 * @param {string} projectPath - project root
 * @returns {Array<Object>} the logged escalations, or `[]` when none exist
 */
function getEscalations(projectPath) {
  const logPath = path.join(projectPath, '.ctoc', 'logs', 'escalations.json');
  try {
    const raw = safeFs.readFileSync(logPath, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

module.exports = {
  readKickbackCounts,
  recordKickback,
  recordBreakerFailure,
  getEscalations,
  // Exposed thresholds for callers/tests that want the documented maxima.
  SAME_STEP_MAX,
  PER_PLAN_MAX
};
