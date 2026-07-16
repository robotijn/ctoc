'use strict';

/**
 * Streaming PRE-COMPUTE core — the FILE LAYER behind the ahead-of-time streaming
 * questions model.
 *
 * The owner's requirement, in two halves:
 *
 *   1. BACKGROUND, ahead of time — a critique subagent pre-critiques each plan
 *      sitting at a gate and writes its decision QUESTIONS (each with pros, cons,
 *      and a recommendation) to a per-plan FILE. That subagent is dispatched by
 *      menu.md prose (NOT this module); this module is the deterministic JS the
 *      subagent writes THROUGH: `writePlanQuestions`.
 *
 *   2. FOREGROUND, instant — the streaming gate screen reads the ALREADY-WRITTEN
 *      questions with zero wait: `loadPlanQuestions`. A plan whose questions are
 *      not ready yet simply isn't asked the rich questions yet (the screen falls
 *      back to the simple Approve question). The human NEVER waits for a critique
 *      to run.
 *
 * Everything here is pure/near-pure, FAIL-SOFT (never throws to the caller — a
 * bad/absent/stale file degrades to `null` / `{ok:false}`), and cross-platform
 * (path.join, safeFs, os-agnostic).
 *
 * ── The per-plan questions file ────────────────────────────────────────────────
 * Path:    <root>/.ctoc/streaming/questions/<sanitized-ref>.json
 * Shape:   { ref, planMtimeMs, questions: [Question] }
 *   - `ref`         the plan reference the questions belong to ("stage/file.md").
 *   - `planMtimeMs` the plan file's mtime (ms) AT THE MOMENT the questions were
 *                   generated. This is the freshness stamp (see STALENESS below).
 *   - `questions`   the decision questions, in the streaming Question contract:
 *                     Question = { id, prompt, critical?, important?, options:[Option] }
 *                     Option   = { key, label, recommended?, pros?, cons?, description? }
 *
 * ── STALENESS rule ─────────────────────────────────────────────────────────────
 * Questions are generated from a SNAPSHOT of the plan. If the plan file changes
 * after generation, those questions may no longer match the plan — so they are
 * treated as NOT-READY. STALE ≡ the stored `planMtimeMs` is OLDER than the plan
 * file's CURRENT mtime. `loadPlanQuestions` returns `null` for a stale file (as it
 * does for absent / unreadable / unparseable / invalid), and the background
 * dispatcher (via `plansNeedingQuestions`) regenerates it.
 */

const path = require('path');
const safeFs = require('./safe-fs');
const { getPlansDir } = require('./state');

/** A non-empty string. */
function isNonEmptyString(v) {
  return typeof v === 'string' && v.length > 0;
}

/**
 * Sanitize a plan ref ("stage/file.md") into a SAFE, FLAT filename base. Path
 * separators are encoded (never traversed): `/` and `\` become `__`, then every
 * character outside the conservative whitelist `[A-Za-z0-9._-]` becomes `_`. The
 * result has no path separator, so it can never escape the questions directory —
 * even an adversarial `functional/../../etc/passwd` collapses to a single inert
 * filename segment.
 *
 * @param {*} ref
 * @returns {string|null} the sanitized base (no extension), or null when the ref
 *   is fundamentally invalid (non-string / empty / NUL / all-dots).
 */
function sanitizeRef(ref) {
  if (typeof ref !== 'string' || ref.length === 0) return null;
  if (ref.indexOf('\0') !== -1) return null;
  const flat = ref.replace(/[\\/]/g, '__');
  const safe = flat.replace(/[^A-Za-z0-9._-]/g, '_');
  if (safe === '' || safe === '.' || safe === '..') return null;
  return safe;
}

/**
 * The absolute path of the per-plan questions file for `ref`, under
 * `<root>/.ctoc/streaming/questions/`. Returns null for a fundamentally invalid
 * ref (so callers fail soft). The returned path is ALWAYS inside the questions
 * directory (traversal-proof — see sanitizeRef).
 *
 * @param {string} root project root
 * @param {*} ref plan reference ("stage/file.md")
 * @returns {string|null}
 */
function questionsPath(root, ref) {
  if (!isNonEmptyString(root)) return null;
  const base = sanitizeRef(ref);
  if (base === null) return null;
  return path.join(root, '.ctoc', 'streaming', 'questions', `${base}.json`);
}

/**
 * A plan ref's file part must be a bare filename inside a stage folder (no path
 * separator, no "..", no NUL, not absolute). Mirrors streaming-gate /
 * menu-screens.isUnsafePlanFile — duplicated locally to keep this module's guard
 * self-contained.
 */
function isUnsafePlanFile(file) {
  return typeof file !== 'string'
    || file === ''
    || file.includes('/')
    || file.includes('\\')
    || file.includes('\0')
    || file.split(/[\\/]/).includes('..')
    || file.includes('..')
    || path.isAbsolute(file);
}

/** A stage segment must be a simple folder name (no separator / traversal / NUL). */
function isUnsafeStage(stage) {
  return typeof stage !== 'string'
    || stage === ''
    || stage === '..'
    || stage.includes('/')
    || stage.includes('\\')
    || stage.includes('\0');
}

/**
 * Resolve `ref` ("stage/file.md") to the plan file's absolute path, or null when
 * the ref is malformed / unsafe. Used to read the plan's CURRENT mtime for the
 * staleness check.
 */
function refToPlanPath(root, ref) {
  if (!isNonEmptyString(root) || typeof ref !== 'string') return null;
  const slash = ref.indexOf('/');
  if (slash === -1) return null;
  const stage = ref.slice(0, slash);
  const file = ref.slice(slash + 1);
  if (isUnsafeStage(stage) || isUnsafePlanFile(file)) return null;
  return path.join(getPlansDir(root), stage, file);
}

/**
 * Validate a raw parsed value against the per-plan QUESTIONS contract. PURE and
 * NON-throwing: always returns `{ valid, errors }`. Aligned with
 * streaming-topics.validateTopics for the Question/Option shape, extended with the
 * optional per-option `pros` / `cons` / `description` strings the streaming screen
 * surfaces.
 *
 *   Question = { id, prompt, critical?, important?, options: [Option] }
 *   Option   = { key, label, recommended?, pros?, cons?, description? }
 *
 * Rules: `id`/`prompt`/`key`/`label` are REQUIRED non-empty strings; question ids
 * are UNIQUE across the array; `options` is REQUIRED with AT LEAST ONE option;
 * `critical`/`important`/`recommended` are optional booleans; `pros`/`cons`/
 * `description` are optional strings.
 *
 * @param {*} raw
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validatePlanQuestions(raw) {
  const errors = [];

  if (!Array.isArray(raw)) {
    return { valid: false, errors: [`questions must be an array; got ${raw === null ? 'null' : typeof raw}`] };
  }

  const seenQuestionIds = new Set();

  raw.forEach((question, qi) => {
    const where = `questions[${qi}]`;
    if (!question || typeof question !== 'object' || Array.isArray(question)) {
      errors.push(`${where} must be an object`);
      return;
    }
    if (!isNonEmptyString(question.id)) {
      errors.push(`${where} is missing a non-empty string id`);
    } else {
      if (seenQuestionIds.has(question.id)) {
        errors.push(`duplicate question id ${JSON.stringify(question.id)}`);
      }
      seenQuestionIds.add(question.id);
    }
    if (!isNonEmptyString(question.prompt)) {
      errors.push(`${where} is missing a non-empty string prompt`);
    }
    if (question.critical !== undefined && typeof question.critical !== 'boolean') {
      errors.push(`${where}.critical must be a boolean when present`);
    }
    if (question.important !== undefined && typeof question.important !== 'boolean') {
      errors.push(`${where}.important must be a boolean when present`);
    }
    if (!Array.isArray(question.options)) {
      errors.push(`${where}.options must be an array`);
      return;
    }
    if (question.options.length === 0) {
      errors.push(`${where}.options must have at least one option`);
    }
    const seenKeys = new Set();
    question.options.forEach((option, oi) => {
      const owhere = `${where}.options[${oi}]`;
      if (!option || typeof option !== 'object' || Array.isArray(option)) {
        errors.push(`${owhere} must be an object`);
        return;
      }
      if (!isNonEmptyString(option.key)) {
        errors.push(`${owhere} is missing a non-empty string key`);
      } else {
        if (seenKeys.has(option.key)) {
          errors.push(`duplicate option key ${JSON.stringify(option.key)} within ${where}`);
        }
        seenKeys.add(option.key);
      }
      if (!isNonEmptyString(option.label)) {
        errors.push(`${owhere} is missing a non-empty string label`);
      }
      if (option.recommended !== undefined && typeof option.recommended !== 'boolean') {
        errors.push(`${owhere}.recommended must be a boolean when present`);
      }
      for (const field of ['pros', 'cons', 'description']) {
        if (option[field] !== undefined && typeof option[field] !== 'string') {
          errors.push(`${owhere}.${field} must be a string when present`);
        }
      }
    });
  });

  return { valid: errors.length === 0, errors };
}

/**
 * Atomically write the per-plan questions file for `ref`. Validates the questions
 * FIRST (a malformed set is refused and NO file is written), then commits via a
 * temp-file + rename so a reader never observes a half-written file. NEVER throws:
 * every failure path returns `{ ok:false, errors }`.
 *
 * @param {string} root project root
 * @param {string} ref plan reference ("stage/file.md")
 * @param {Array<object>} questions the decision questions (Question contract)
 * @param {number} planMtimeMs the plan file's mtime (ms) at generation time
 * @returns {{ ok: true } | { ok: false, errors: string[] }}
 */
function writePlanQuestions(root, ref, questions, planMtimeMs) {
  const file = questionsPath(root, ref);
  if (file === null) {
    return { ok: false, errors: [`invalid ref: ${typeof ref === 'string' ? JSON.stringify(ref) : typeof ref}`] };
  }

  const { valid, errors } = validatePlanQuestions(questions);
  if (!valid) return { ok: false, errors };

  // An unusable mtime (non-finite) stamps as 0 → the file reads as STALE against
  // any real plan mtime, forcing regeneration. Safer than storing a bad stamp.
  const mtime = Number.isFinite(planMtimeMs) ? planMtimeMs : 0;
  const payload = JSON.stringify({ ref, planMtimeMs: mtime, questions }, null, 2);

  const tmp = `${file}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  try {
    const dir = path.dirname(file);
    if (!safeFs.existsSync(dir)) safeFs.mkdirSync(dir, { recursive: true });
    safeFs.writeFileSync(tmp, payload);
    safeFs.renameSync(tmp, file);
    return { ok: true };
  } catch (err) {
    try { safeFs.unlinkSync(tmp); } catch { /* temp may not exist */ }
    return { ok: false, errors: [(err && err.message) || String(err)] };
  }
}

/**
 * Read the per-plan questions for `ref` and return the `questions[]` array ONLY
 * when the file is present, parseable, valid, AND FRESH. Returns `null` — NEVER
 * throws — for every not-ready case: absent, unreadable, unparseable, structurally
 * wrong, questions invalid, or STALE (the stored planMtimeMs is older than the
 * plan file's current mtime, or the plan file is gone).
 *
 * @param {string} root project root
 * @param {string} ref plan reference ("stage/file.md")
 * @returns {Array<object>|null}
 */
function loadPlanQuestions(root, ref) {
  const file = questionsPath(root, ref);
  if (file === null) return null;

  let raw;
  try {
    if (!safeFs.existsSync(file)) return null; // absent → not ready
    raw = safeFs.readFileSync(file, 'utf8');
  } catch {
    return null; // unreadable → not ready
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null; // unparseable → not ready
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;

  const { valid } = validatePlanQuestions(parsed.questions);
  if (!valid) return null;

  // STALENESS: the plan's CURRENT mtime must not be newer than the generation
  // stamp. A missing plan file (statSync throws) is treated as stale (not ready).
  const planPath = refToPlanPath(root, ref);
  if (planPath === null) return null;
  let currentMtimeMs;
  try {
    currentMtimeMs = safeFs.statSync(planPath).mtimeMs;
  } catch {
    return null; // plan gone → nothing to ask about
  }
  const storedMtimeMs = Number(parsed.planMtimeMs);
  if (!Number.isFinite(storedMtimeMs)) return null;
  if (storedMtimeMs < currentMtimeMs) return null; // stale

  return parsed.questions;
}

/**
 * True iff fresh precomputed questions exist for `ref`. Convenience over
 * `loadPlanQuestions` for callers that only need the boolean.
 * @param {string} root
 * @param {string} ref
 * @returns {boolean}
 */
function isFresh(root, ref) {
  return loadPlanQuestions(root, ref) !== null;
}

/**
 * The subset of plans currently at a human gate whose precomputed questions are
 * NOT ready (absent or stale) — i.e. the plans the BACKGROUND dispatcher must
 * (re)generate questions for. menu.md prose iterates this list to spawn critique
 * subagents. Pure read, FAIL-SOFT: any failure yields an empty list.
 *
 * (streaming-gate is required lazily to avoid a load-time circular dependency —
 * streaming-gate itself requires this module at call time.)
 *
 * @param {string} root project root
 * @returns {Array<{ref:string, slug:string}>} full pending-decision descriptors
 */
function plansNeedingQuestions(root) {
  let decisions;
  try {
    const { pendingGateDecisions } = require('./streaming-gate');
    decisions = pendingGateDecisions(root);
  } catch {
    return [];
  }
  if (!Array.isArray(decisions)) return [];
  return decisions.filter((d) => d && !isFresh(root, d.ref));
}

module.exports = {
  questionsPath,
  validatePlanQuestions,
  writePlanQuestions,
  loadPlanQuestions,
  isFresh,
  plansNeedingQuestions,
};
