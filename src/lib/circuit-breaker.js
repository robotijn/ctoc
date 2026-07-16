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
 * Persistence: the counter lives in the plan file's first YAML frontmatter block
 * (per the parent decision — it travels with the plan, is visible on open, and
 * needs no separate state directory). The module is STATELESS: every call does a
 * read-modify-write against disk, so a "process restart" is indistinguishable
 * from any two sequential calls — the count lives only on disk (satisfies M9).
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

// Matches a leading YAML frontmatter block, tolerant of CRLF line endings.
const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---/;

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
 * Split a plan's raw text into `{ fmText, rest }` where `fmText` is the YAML of
 * the first frontmatter block (or null when there is no leading block) and
 * `rest` is everything after it (the block delimiters included in the boundary).
 *
 * @param {string} raw - the full plan file text
 * @returns {{ fmText: string|null, rest: string, hadBlock: boolean }}
 */
function splitFrontmatter(raw) {
  const match = raw.match(FRONTMATTER_RE);
  if (!match) {
    return { fmText: null, rest: raw, hadBlock: false };
  }
  const fmText = match[1];
  const rest = raw.slice(match[0].length); // text after the closing `---`
  return { fmText, rest, hadBlock: true };
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
 * Read the persisted kickback counts from a plan file. Never throws — a plan
 * with no counter, no frontmatter, or a malformed counter reads as all zeros.
 * Robust to human-gate block-prepend: scans every leading frontmatter block and
 * returns the max per-step count and max total (see maxCountsAcrossBlocks).
 *
 * @param {string} planPath - absolute path to the plan `.md` file
 * @returns {{ by_step: Object<string,number>, total: number }}
 */
function readKickbackCounts(planPath) {
  let raw;
  try {
    raw = safeFs.readFileSync(planPath, 'utf8');
  } catch {
    return { by_step: {}, total: 0 };
  }
  const counts = maxCountsAcrossBlocks(raw);
  // Return a plain object (drop the null prototype) for ergonomic caller use.
  return { by_step: Object.assign({}, counts.by_step), total: counts.total };
}

/**
 * Serialize the updated frontmatter (with kickback_counts) back into the plan
 * text, preserving every other key and the body byte-for-byte.
 *
 * @param {string} raw - original plan text
 * @param {{ by_step: Object<string,number>, total: number }} counts - new counts
 * @returns {string} the rewritten plan text
 * @throws {Error} if the frontmatter cannot be re-serialized (throws BEFORE any write)
 */
function writeCountsIntoText(raw, counts) {
  const { fmText, rest, hadBlock } = splitFrontmatter(raw);

  // Plain-object counts for a clean YAML dump (no null-prototype artifacts).
  const cleanCounts = {
    by_step: Object.assign({}, counts.by_step),
    total: counts.total
  };

  if (!hadBlock) {
    // No leading frontmatter: create a block containing only the counter and
    // prepend it, keeping the original body untouched.
    const block = yaml.dump({ kickback_counts: cleanCounts });
    return `---\n${block}---\n${raw}`;
  }

  // The WRITE path must tolerate EXACTLY what the READ path (readKickbackCounts /
  // recordKickback's read) already tolerates: malformed YAML (unterminated quote →
  // yaml.load THROWS) and valid-but-scalar frontmatter (a bare string → assigning
  // `.kickback_counts` throws "Cannot create property on string" in strict mode).
  // If either happens we DISCARD the unparseable/non-object frontmatter and rebuild
  // a minimal valid block carrying only the counter. Tradeoff (deliberate): a
  // tripping circuit breaker OUTRANKS preserving a user's already-broken YAML — the
  // breaker keeps counting so an overnight loop can still escalate to the human,
  // instead of throwing here (which froze the counter at 0 and suppressed every
  // escalation forever). Preserving broken frontmatter is worthless if it costs the
  // safety mechanism.
  let fmObject;
  try {
    const parsed = yaml.load(fmText);
    fmObject = (parsed && typeof parsed === 'object' && !Array.isArray(parsed))
      ? parsed
      : { kickback_counts: cleanCounts };
  } catch {
    fmObject = { kickback_counts: cleanCounts };
  }
  fmObject.kickback_counts = cleanCounts;
  // yaml.dump throws before we write, so a serialize failure never leaves a
  // half-written plan on disk.
  const newFmText = yaml.dump(fmObject);
  // yaml.dump ends with a trailing newline; the block is `---\n<yaml>---<rest>`.
  return `---\n${newFmText}---${rest}`;
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
 * counters, persist them into the plan's first frontmatter block, and compute an
 * escalation signal when a documented maximum is exceeded.
 *
 * @param {string} planPath - absolute path to the plan `.md` file
 * @param {string|number} step - the Iron Loop step being kicked back to
 * @param {string} projectPath - project root (for the escalations log)
 * @returns {{ recorded: true, byStep: number, total: number, escalation: Object|null }}
 * @throws {Error} `step required` on a falsy or prototype-polluting step
 */
function recordKickback(planPath, step, projectPath) {
  const stepKey = normalizeStep(step); // throws before any file read/write

  const raw = safeFs.readFileSync(planPath, 'utf8');
  // Read the MAX across every leading frontmatter block, not just the first —
  // otherwise a human-gate prepend of a counter-less block resets the running
  // total and the per-plan escalation is silently defeated. Incrementing from the
  // true max keeps the (first-block) write >= any stale deeper value, so a later
  // max-across read never regresses.
  const counts = maxCountsAcrossBlocks(raw);

  const nextByStep = (counts.by_step[stepKey] || 0) + 1;
  counts.by_step[stepKey] = nextByStep;
  counts.total += 1;

  // Serialize BEFORE writing (throws leave the plan untouched).
  const newText = writeCountsIntoText(raw, counts);
  safeFs.writeFileSync(planPath, newText, 'utf8');

  let escalation = null;
  if (nextByStep > SAME_STEP_MAX) {
    // Same-step takes precedence when both thresholds trip on one call.
    escalation = {
      type: 'same-step',
      plan: planSlug(planPath),
      step: stepKey,
      count: nextByStep
    };
  } else if (counts.total > PER_PLAN_MAX) {
    escalation = {
      type: 'per-plan',
      plan: planSlug(planPath),
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
