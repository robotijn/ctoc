'use strict';

/**
 * Streaming PRE-COMPUTE core — the FILE LAYER behind the ahead-of-time streaming
 * questions model.
 *
 * The owner's requirement, in three parts:
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
 *   3. THE GATE CONDITION — is there ENOUGH INFORMATION to build this plan without
 *      guessing? `planQuestionsStatus` names WHY the questions are or are not
 *      usable ('ready' | 'not-computed' | 'stale' | 'invalid' | 'unknown-plan'),
 *      and `hasEnoughInformation` answers the predicate itself by cross-referencing
 *      those questions against the human's recorded answers. It FAILS CLOSED on
 *      every state where the answer is not known. This module ships the PREDICATE
 *      only — it wires into no gate, crosses nothing, and stamps no approval.
 *
 * Everything here is pure/near-pure, FAIL-SOFT (never throws to the caller — a
 * bad/absent/stale file degrades to `null` / `{ok:false}` / a closed verdict), and
 * cross-platform (path.join, safeFs, os-agnostic).
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
 *
 * ── An ANSWER binds to the revision it was GIVEN FOR ───────────────────────────
 * The staleness rule above protects the QUESTIONS. Its companion protects the
 * ANSWERS, and it is the same idea pointed the other way. Question ids are
 * POSITIONAL (agents/iron-loop/gate-critic.md: finding questions start at `q10` and
 * increase in emission order), so a regenerated question set REUSES ids for
 * DIFFERENT questions. Matching a recorded answer on `(ref, questionId)` alone is
 * therefore evidence of nothing across a revision, and it silently suppressed
 * questions the human had never been shown — a verdict reported on input that was
 * never received, the exact shape `src/lib/false-green-scan.js` fences.
 *
 * `readAnsweredQuestionIds` is the ONE encoding of "what counts as answered", and
 * it binds an answer two ways: STAMPED (the entry's own `planMtimeMs` equals the
 * question set's stamp) or DERIVED (no stamp, but the answer was recorded at or
 * after the plan's current mtime — if the plan has not changed since the answer,
 * the answer was given against the current text). The binding is DERIVED from two
 * facts already on disk; nothing is asserted that was not observed.
 *
 * An answer that binds neither way NEVER suppresses its question — the question is
 * asked again. The known cost, stated plainly: a plan touched for a purely cosmetic
 * reason (a typo, a reflow) loses its answers even though the meaning never
 * changed. There is no way to tell a cosmetic edit from a substantive one without
 * reading meaning, so the rule errs toward re-asking — the correct direction for a
 * fail-closed rule, and the same direction the questions' own staleness rule takes.
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
 * The absolute path of the QUARANTINE (pending) questions file for `ref`, under
 * `<root>/.ctoc/streaming/questions/pending/`.
 *
 * ── What the quarantine directory is for ───────────────────────────────────────
 * `pending/` is the ONE path family the `gate-critic` agent may write. That agent
 * holds UNTRUSTED input (plan text, and the lens critics' payloads), so it must
 * never be able to author the file a human reads at a gate. It drops its
 * synthesized `{ref, planMtimeMs, questions}` object here instead. NO gate screen
 * ever reads this directory. A file becomes visible to a human only after
 * `src/lib/streaming-questions-sweeper.js` VALIDATES it — filename↔ref binding,
 * plan existence, supersession, and then the full Question/Option contract via
 * `writePlanQuestions` — and promotes it into the live questions path. Anything
 * malformed or hostile is discarded and nothing is written.
 *
 * Traversal-proof by construction: this reuses the SAME `sanitizeRef` as
 * `questionsPath`, so an adversarial `functional/../../etc/passwd` collapses to one
 * inert filename segment inside `pending/`. There is deliberately no second
 * sanitiser.
 *
 * @param {string} root project root
 * @param {*} ref plan reference ("stage/file.md")
 * @returns {string|null} null on a fundamentally invalid root/ref (callers fail soft)
 */
function pendingQuestionsPath(root, ref) {
  if (!isNonEmptyString(root)) return null;
  const base = sanitizeRef(ref);
  if (base === null) return null;
  return path.join(root, '.ctoc', 'streaming', 'questions', 'pending', `${base}.json`);
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
 * The per-plan questions' STATE — a discriminated result that names WHY the
 * questions are or are not usable. This is the read `loadPlanQuestions` is built
 * on, and the one the ENOUGH-INFORMATION gate needs: the gate must fail closed on
 * every not-ready state, but "never computed" (→ the dispatcher should generate
 * them) is a different instruction from "corrupt" (→ repair) or "the plan is gone"
 * (→ nothing to do). One `null` cannot carry that.
 *
 *   { status: 'ready',        questions, questionsRevisionMs, planMtimeMs, reason }
 *                                                  computed AND fresh. `questions`
 *                                                  MAY be [] — the honest "the
 *                                                  critique ran and found nothing
 *                                                  to ask". That is a REAL state.
 *   { status: 'not-computed', reason }             no questions file — never generated.
 *   { status: 'stale',        reason }             computed, but the plan changed since.
 *   { status: 'invalid',      errors, reason }     the file exists but is unreadable,
 *                                                  unparseable, structurally wrong,
 *                                                  carries invalid questions, or has an
 *                                                  unevaluable freshness stamp.
 *   { status: 'unknown-plan', reason }             the ref is malformed, or no plan file.
 *
 * Every status carries a plain-language `reason` so a caller never has to invent
 * the explanation it shows a human. PURE-ish and NEVER throws: every failure path
 * returns a status.
 *
 * ── Order of checks (deliberate) ───────────────────────────────────────────────
 * The PLAN is resolved and stat-ed BEFORE the questions file is read, so a ref
 * that names no plan reports 'unknown-plan' rather than 'not-computed' — the
 * latter would tell the dispatcher to go generate questions for a plan that does
 * not exist. This order is unobservable through `loadPlanQuestions`, whose every
 * non-ready branch collapses to the same `null`.
 *
 * ── The two revision values on 'ready' (they answer different questions) ───────
 * `questionsRevisionMs` identifies THE EXACT QUESTION SET the human was shown — it
 * is the stamp stored in the questions file. `planMtimeMs` is the plan file's
 * CURRENT modification time and answers "has the plan changed since a given
 * moment?". They are equal in the normal case and diverge only when a plan is
 * reverted to older text (a stored stamp NEWER than the current mtime, which the
 * staleness check permits). Both are needed by `readAnsweredQuestionIds`: the first
 * drives the STAMPED binding, the second the DERIVED one.
 *
 * @param {string} root project root
 * @param {string} ref plan reference ("stage/file.md")
 * @returns {{status:string, questions?:Array<object>, questionsRevisionMs?:number,
 *   planMtimeMs?:number, errors?:string[], reason:string}}
 */
function planQuestionsStatus(root, ref) {
  const shownRef = typeof ref === 'string' ? ref : typeof ref;

  // 1. The ref must name a plan that EXISTS. A questions file for a plan that is
  //    gone (or a ref that escapes plans/) describes nothing.
  const file = questionsPath(root, ref);
  const planPath = refToPlanPath(root, ref);
  if (file === null || planPath === null) {
    return { status: 'unknown-plan', reason: `${shownRef} is not a valid plan reference` };
  }
  let currentMtimeMs;
  try {
    currentMtimeMs = safeFs.statSync(planPath).mtimeMs;
  } catch {
    return { status: 'unknown-plan', reason: `there is no plan file at ${shownRef}` };
  }

  // 2. The questions file: absent is NOT-COMPUTED (generate it); anything present
  //    but unreadable is INVALID (repair it). These are different instructions.
  let raw;
  try {
    if (!safeFs.existsSync(file)) {
      return { status: 'not-computed', reason: `no questions have been generated for ${shownRef} yet` };
    }
    raw = safeFs.readFileSync(file, 'utf8');
  } catch (err) {
    return {
      status: 'invalid',
      errors: [(err && err.message) || String(err)],
      reason: `the questions file for ${shownRef} could not be read`,
    };
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    return {
      status: 'invalid',
      errors: [(err && err.message) || String(err)],
      reason: `the questions file for ${shownRef} is not valid JSON`,
    };
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {
      status: 'invalid',
      errors: [`the questions file must contain an object; got ${parsed === null ? 'null' : Array.isArray(parsed) ? 'an array' : typeof parsed}`],
      reason: `the questions file for ${shownRef} has the wrong shape`,
    };
  }

  const { valid, errors } = validatePlanQuestions(parsed.questions);
  if (!valid) {
    return { status: 'invalid', errors, reason: `the questions stored for ${shownRef} do not meet the questions contract` };
  }

  // 3. STALENESS: the stored generation stamp must not be older than the plan's
  //    CURRENT mtime. A stamp that is not a finite number makes freshness
  //    unevaluable — that is a corrupt file, not merely an outdated one.
  const storedMtimeMs = Number(parsed.planMtimeMs);
  if (!Number.isFinite(storedMtimeMs)) {
    return {
      status: 'invalid',
      errors: [`planMtimeMs must be a finite number; got ${JSON.stringify(parsed.planMtimeMs)}`],
      reason: `the questions file for ${shownRef} has no usable freshness stamp`,
    };
  }
  if (storedMtimeMs < currentMtimeMs) {
    return {
      status: 'stale',
      reason: `${shownRef} changed after its questions were generated (generated against mtime ${storedMtimeMs}, the plan is now ${currentMtimeMs})`,
    };
  }

  return {
    status: 'ready',
    questions: parsed.questions,
    questionsRevisionMs: storedMtimeMs, // the stamp the question set was generated against
    planMtimeMs: currentMtimeMs,        // the plan file's CURRENT mtime
    reason: `${shownRef} has fresh precomputed questions`,
  };
}

/**
 * Read the per-plan questions for `ref` and return the `questions[]` array ONLY
 * when the file is present, parseable, valid, AND FRESH. Returns `null` — NEVER
 * throws — for every not-ready case: absent, unreadable, unparseable, structurally
 * wrong, questions invalid, or STALE (the stored planMtimeMs is older than the
 * plan file's current mtime, or the plan file is gone).
 *
 * A THIN WRAPPER over `planQuestionsStatus` — deliberately, so the staleness rule
 * and the questions contract have exactly ONE implementation and cannot drift
 * apart. The `Array|null` contract is unchanged: `ready` yields its questions
 * (INCLUDING the empty array for a computed set with nothing to ask — that has
 * always been `[]`, never `null`), every other status yields `null`.
 *
 * @param {string} root project root
 * @param {string} ref plan reference ("stage/file.md")
 * @returns {Array<object>|null}
 */
function loadPlanQuestions(root, ref) {
  const st = planQuestionsStatus(root, ref);
  return st.status === 'ready' ? st.questions : null;
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

/**
 * A question is BLOCKING when it is a real FORK — a load-bearing decision that is
 * the human's to make and that the implementer must never guess. That is exactly
 * the `critical` and `important` tiers. A `normal` question is a small detail that
 * can be resolved while building, so it never blocks.
 *
 * This rule lives HERE, in one place, on purpose: a caller that re-derives
 * "critical or important" from a question list is where drift gets in (forget
 * `important` and half the forks silently stop blocking). `hasEnoughInformation`
 * returns the blocking set so nobody has to.
 *
 * Strict `=== true` matches validatePlanQuestions, which requires a boolean when
 * the flag is present — a truthy non-boolean is a contract violation, not a fork.
 *
 * @param {object} question
 * @returns {boolean}
 */
function isBlockingQuestion(question) {
  return !!question && (question.critical === true || question.important === true);
}

/**
 * The recorded time of one answers-log entry, in milliseconds since the epoch, or
 * `null` when it has none that can be parsed.
 *
 * TWO SHAPES exist in the log, deliberately read rather than normalised away:
 * `{ts, ref, questionId, optionKey}` is what `streaming-gate.streamAnswer` writes,
 * and `{ref, questionId, answer, at}` is what an ad-hoc agent-driven writer has
 * appended (no JavaScript in src/ produces it). The second shape is DATA THIS
 * FUNCTION MUST READ CORRECTLY; it is not the contract, and nothing here is built
 * around it. An unparseable time yields null, which binds nothing.
 */
function entryRecordedAtMs(entry) {
  for (const field of ['ts', 'at']) {
    const raw = entry[field];
    if (typeof raw !== 'string' && typeof raw !== 'number') continue;
    const ms = typeof raw === 'number' ? raw : Date.parse(raw);
    if (Number.isFinite(ms)) return ms;
  }
  return null;
}

/**
 * The set of question ids already answered for `ref` THAT BIND TO THE CURRENT
 * REVISION of the plan — read from the append-only answers log
 * (`.ctoc/streaming/answers.jsonl`).
 *
 * THE SINGLE ENCODING of "what counts as an answered question". `streaming-gate`
 * calls this, never its own copy: two encodings of this rule is how a revision rule
 * gets added to one of them and not the other, and gets half-applied forever.
 *
 * ── AN ANSWER BINDS TO THE TEXT THE HUMAN WAS READING ─────────────────────────
 * Question ids are POSITIONAL (agents/iron-loop/gate-critic.md) and are reused
 * across regenerations, so an id match ACROSS revisions is evidence of nothing. An
 * entry counts when EITHER:
 *
 *   (a) STAMPED — its recorded `planMtimeMs` equals `questionsRevisionMs`. It was
 *       written against this exact question set. Direct evidence.
 *
 *   (b) DERIVED — it carries no usable stamp, but its recorded TIME is at or after
 *       the plan's current modification time. If the plan has not changed since the
 *       answer was given, the answer was given against the current text. Derived
 *       from two facts already on disk, never asserted.
 *
 * Anything else — an older unstamped answer, a MISMATCHED stamp, an unparseable
 * time — does NOT count, and its question is asked again. A present-but-mismatched
 * stamp is never re-evaluated by the derived rule: an explicit stamp is the
 * stronger evidence and it says no, and letting the weaker rule override it would
 * make a stamp worth less than its absence.
 *
 * ── IT FAILS CLOSED ────────────────────────────────────────────────────────────
 * Not knowing which text an answer was about is NOT a pass. The failure mode is
 * asking a question the human may already have answered — never hiding a question
 * they never saw.
 *
 * `ok:false` means the log could not be read, OR the revision could not be
 * established — IGNORANCE, which a caller must not read as "nothing was answered".
 * `ok:true` with an empty set is knowledge (an ABSENT log is this case: nothing has
 * been answered yet, the normal starting state).
 *
 * A malformed line is skipped rather than fatal: skipping can only ever REMOVE an
 * answer from the set, never add one, so it can only push a verdict toward "not
 * enough". Failing hard on one bad line would let a single junk append deadlock the
 * gate forever, since the log is never pruned.
 *
 * @param {string} root project root
 * @param {string} ref plan reference ("stage/file.md")
 * @param {{questionsRevisionMs:number, planMtimeMs:number}} [revision] omitted ⇒
 *   derived internally from `planQuestionsStatus`. `hasEnoughInformation` passes the
 *   one it already computed, purely to avoid a redundant stat.
 * @returns {{ok:boolean, ids:Set<string>, bound:{stamped:number, derived:number},
 *   unbound:number}} `unbound` counts entries for THIS ref that were read but bound
 *   to no revision, so a caller can say so out loud instead of silently re-asking.
 */
function readAnsweredQuestionIds(root, ref, revision) {
  const ids = new Set();
  const closed = { ok: false, ids, bound: { stamped: 0, derived: 0 }, unbound: 0 };

  // 1. RESOLVE THE REVISION FIRST, before the file is read. An unestablished
  //    revision cannot bind anything, and saying so as `ok:false` rather than
  //    `ok:true` with an empty set is the fail-closed discipline: the caller must
  //    be able to tell "nothing was answered" from "I could not tell".
  let rev = revision;
  if (rev === undefined) {
    const st = planQuestionsStatus(root, ref);
    if (st.status !== 'ready') return closed;
    rev = { questionsRevisionMs: st.questionsRevisionMs, planMtimeMs: st.planMtimeMs };
  }
  if (!rev || typeof rev !== 'object'
      || !Number.isFinite(rev.questionsRevisionMs)
      || !Number.isFinite(rev.planMtimeMs)) {
    return closed;
  }

  // The two clocks carry different precision: a recorded time comes from an ISO
  // string (whole milliseconds) while `mtimeMs` carries a sub-millisecond fraction.
  // Comparing the truncated value against the untruncated one would systematically
  // reject an answer recorded in the SAME millisecond as the plan write, so the
  // plan's mtime is floored to align the precisions. This is precision alignment,
  // not tolerance: the comparison stays a plain numeric at-or-after.
  const planFloorMs = Math.floor(rev.planMtimeMs);

  const file = path.join(root, '.ctoc', 'streaming', 'answers.jsonl');
  let raw;
  try {
    if (!safeFs.existsSync(file)) return { ok: true, ids, bound: { stamped: 0, derived: 0 }, unbound: 0 };
    raw = safeFs.readFileSync(file, 'utf8');
  } catch {
    return closed; // unreadable → we do not KNOW what was answered
  }

  let stamped = 0;
  let derived = 0;
  let unbound = 0;

  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let entry;
    try { entry = JSON.parse(trimmed); } catch { continue; }
    if (!entry || typeof entry !== 'object') continue;
    if (entry.ref !== ref || typeof entry.questionId !== 'string') continue;

    const stamp = Number(entry.planMtimeMs);
    if (Number.isFinite(stamp)) {
      // (a) STAMPED — strict numeric equality, never loose, never a range. The log
      //     is append-only and any process may write to it, so this comparison is
      //     the whole guard.
      if (stamp === rev.questionsRevisionMs) {
        ids.add(entry.questionId);
        stamped++;
      } else {
        unbound++;
      }
      continue;
    }

    // (b) DERIVED — no usable stamp. Bind only when the plan has not changed since
    //     the answer was recorded.
    const at = entryRecordedAtMs(entry);
    if (at !== null && at >= planFloorMs) {
      ids.add(entry.questionId);
      derived++;
    } else {
      unbound++;
    }
  }

  return { ok: true, ids, bound: { stamped, derived }, unbound };
}

/**
 * ENOUGH INFORMATION? — the gate predicate. True when `ref` can be built WITHOUT
 * GUESSING: its decision questions were computed against the CURRENT plan, and
 * every real fork among them has been answered by the human.
 *
 * This is CTOC's Pipeline Philosophy #1 inverted into a computable condition: "the
 * implementer never guesses; if the implementer would have to guess, upstream
 * context is incomplete." A plan has enough information exactly when no unanswered
 * fork remains.
 *
 * ── IT FAILS CLOSED. This is the load-bearing property. ────────────────────────
 * `not-computed`, `stale`, `invalid` and `unknown-plan` ALL return `enough: false`,
 * carrying that status as the `reason`. ABSENCE OF EVIDENCE IS NOT EVIDENCE OF
 * ABSENCE: a plan whose questions were never computed does not thereby have
 * "enough information" — we simply do not KNOW, and not-knowing is not a pass.
 * The same discipline applies to the answers log: it is never trusted into a pass,
 * only ever out of one.
 *
 * ── What makes it return false ─────────────────────────────────────────────────
 *   'not-computed'       the questions were never generated — nothing is known
 *   'stale'              the questions predate the plan's current text
 *   'invalid'            the questions file is corrupt
 *   'unknown-plan'       the ref is malformed, or the plan file is gone
 *   'open-forks'         a critical/important question is unanswered
 *   'answers-unreadable' a fork exists and the answers log could not be read
 * and `enough: true` with reason 'enough' in every other case — which means: the
 * questions are fresh, and no unanswered fork remains. Unanswered NORMAL questions
 * do NOT block; they are details resolvable during implementation, and they are
 * still reported honestly in `unanswered`.
 *
 * An unreadable answers log deliberately does NOT block a plan with no forks: no
 * critical/important question exists, so the log cannot change the verdict, and
 * blocking there would be a false negative that answering could never clear.
 *
 * NEVER throws. Pure read — writes nothing, and crosses nothing. This is the
 * PREDICATE only: whether and how a gate consumes it is a separate decision.
 *
 * @param {string} root project root
 * @param {string} ref plan reference ("stage/file.md")
 * @returns {{enough: boolean, reason: string, unanswered: Array<object>,
 *   blocking: Array<object>, unboundAnswers: number}} `unanswered` is EVERY
 *   still-open question (nothing hidden); `blocking` is the subset that is a fork
 *   and therefore fails the gate; `unboundAnswers` is how many recorded answers
 *   could not be tied to this revision of the plan, so a screen can say "3 recorded
 *   answers are being asked again" instead of silently re-asking.
 */
function hasEnoughInformation(root, ref) {
  const status = planQuestionsStatus(root, ref);

  // FAIL CLOSED: every not-ready state. We do not know what this plan needs, and
  // not-knowing is never a pass.
  if (status.status !== 'ready') {
    // Nothing was read, so nothing was evaluated against a revision — 0 unbound is
    // literally true here and never means "everything bound".
    return { enough: false, reason: status.status, unanswered: [], blocking: [], unboundAnswers: 0 };
  }

  const questions = status.questions;
  // The revision is passed through from the status this function already computed —
  // never re-derived, and never obtained anywhere but planQuestionsStatus.
  const answers = readAnsweredQuestionIds(root, ref, {
    questionsRevisionMs: status.questionsRevisionMs,
    planMtimeMs: status.planMtimeMs,
  });

  // An unreadable log yields an EMPTY answered set, so nothing can read as
  // answered — the ignorance can only ever move the verdict toward false.
  const unanswered = questions.filter((q) => !answers.ids.has(q.id));
  const blocking = unanswered.filter(isBlockingQuestion);

  if (blocking.length > 0) {
    return {
      enough: false,
      reason: answers.ok ? 'open-forks' : 'answers-unreadable',
      unanswered,
      blocking,
      unboundAnswers: answers.unbound,
    };
  }

  return { enough: true, reason: 'enough', unanswered, blocking: [], unboundAnswers: answers.unbound };
}

module.exports = {
  questionsPath,
  pendingQuestionsPath,
  refToPlanPath,
  validatePlanQuestions,
  writePlanQuestions,
  planQuestionsStatus,
  loadPlanQuestions,
  readAnsweredQuestionIds,
  hasEnoughInformation,
  isFresh,
  plansNeedingQuestions,
};
