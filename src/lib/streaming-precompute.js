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
 *      start.md prose (NOT this module); this module is the deterministic JS the
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
 *                     Question = { id, prompt, critical, important, options:[Option] }
 *                     Option   = { key, label, recommended?, pros?, cons?, description? }
 *                   `critical` and `important` are MANDATORY booleans — an undeclared
 *                   importance is treated as a fork (see isBlockingQuestion).
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
 * A producer-authored question id, made SAFE to echo into a validator error that
 * reaches a gate screen: control characters stripped (a hostile id must not inject
 * them into the screen) and length capped. Never echo an entire rejected question.
 */
function safeQuestionId(id) {
  return String(id).replace(/[\u0000-\u001f\u007f-\u009f]/g, '').slice(0, 80);
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
 * The question topics that always reach the human, whatever the flags say: the owner
 * named them as the questions of huge importance (2026-10-06). `data-model` means a
 * persisted data shape or an interface code outside this project depends on (a schema,
 * a file format, a public interface), never every exported function. `detail` is the
 * one topic that never reaches the human on its own account.
 */
const HIGH_STAKES_TOPICS = Object.freeze(['technology-stack', 'algorithm', 'data-model', 'security-posture', 'irreversible', 'cost']);
const QUESTION_TOPICS = Object.freeze([...HIGH_STAKES_TOPICS, 'detail']);

/**
 * Is `id` one of the two reserved questions that carry no topic — the gate ruling or the
 * coverage notice, bare or with a `-r<digits>` revision suffix?
 * @param {*} id
 * @returns {boolean}
 */
function isTopiclessId(id) {
  if (typeof id !== 'string') return false;
  for (const base of ['q98-critique-coverage', 'q99-gate-ruling']) {
    if (id === base) return true;
    if (id.startsWith(`${base}-r`) && /^[0-9]+$/.test(id.slice(base.length + 2))) return true;
  }
  return false;
}
// `q<NN>-<kebab>`; an optional `-r<digits>` revision suffix is itself kebab, so this one
// character class covers it. Option keys are the three the screen can show.
const QUESTION_ID = /^q[0-9]{2}-[a-z0-9-]+$/;
const OPTION_KEY = /^[1-3]$/;
// Zero-width and bidirectional-control characters: text that reads one way and says another.
const INVISIBLE = /[\u200B-\u200F\u202A-\u202E\u2060-\u2069\uFEFF]/;
const CONTROL = /[\u0000-\u001F\u007F-\u009F]/g;

/**
 * Is `c` the independent classification block — `{ by: "gate-critic", at: <ms> }`, exactly
 * those two keys? The owner's decision of 2026-10-07: the gate critic assigns every topic;
 * the plan's author never grades its own question. Anything else is "not classified".
 * @param {*} c
 * @returns {boolean}
 */
function isGateCriticClassification(c) {
  return Boolean(c) && typeof c === 'object' && !Array.isArray(c)
    && Object.keys(c).sort().join(',') === 'at,by'
    && c.by === 'gate-critic' && Number.isSafeInteger(c.at) && c.at > 0;
}

/** A label as the human tells it apart: control characters stripped, trimmed, lower-cased. */
function labelIdentity(label) {
  return label.replace(CONTROL, '').trim().toLowerCase();
}

/**
 * Validate a raw parsed value against the per-plan QUESTIONS contract. PURE and
 * NON-throwing: always returns `{ valid, errors }`. Aligned with
 * streaming-topics.validateTopics for the Question/Option shape, extended with the
 * optional per-option `pros` / `cons` / `description` strings the streaming screen
 * surfaces.
 *
 *   Question = { id, prompt, critical, important, topic, options: [Option] }
 *   Option   = { key, label, recommended?, pros?, cons?, description? }
 *
 * Rules: `id`/`prompt`/`key`/`label` are REQUIRED non-empty strings; a question id
 * matches `q<NN>-<kebab>` (an `-r<digits>` revision suffix included) and is UNIQUE across
 * the array; `options` is REQUIRED with one to three options whose keys are `"1"`, `"2"`
 * or `"3"` and unique — no key can carry a shell word into a typed command — and whose labels are unique once control characters are stripped,
 * the label trimmed and lower-cased; `critical` and `important` are REQUIRED booleans
 * (a missing flag is an undeclared fork); `topic` is REQUIRED and one of
 * QUESTION_TOPICS, except on the reserved gate ruling and coverage notice, which carry
 * none, so a topic can never turn the ruling into a decided detail;
 * `recommended` is an optional boolean; `pros`/`cons`/`description` are optional
 * strings. No human-visible text may carry a zero-width or bidirectional-control
 * character. A single option with no recommendation is a notice, so it is refused on a
 * high-stakes topic, where it would decide a weighty question with no answer at all.
 * `holds` is refused: a hold is the human's answer, recorded by CTOC in the answers
 * log, never a field a question file may set. A violation anywhere refuses the WHOLE
 * file, on write and (because `planQuestionsStatus` re-validates) on read.
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
  const visible = (where, text) => {
    if (typeof text === 'string' && INVISIBLE.test(text)) errors.push(`${where} carries an invisible or direction-changing character`);
  };

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
        errors.push(`duplicate question id ${JSON.stringify(safeQuestionId(question.id))}`);
      }
      seenQuestionIds.add(question.id);
      if (!QUESTION_ID.test(question.id)) {
        errors.push(`${where}.id must match q<NN>-<kebab-topic> with an optional -r<digits> suffix`);
      }
    }
    if (!isNonEmptyString(question.prompt)) {
      errors.push(`${where} is missing a non-empty string prompt`);
    }
    visible(`${where}.prompt`, question.prompt);
    // Both importance flags are MANDATORY booleans, not optional. A missing flag is
    // NOT a statement that the question is unimportant — it is the absence of a
    // statement, and `isBlockingQuestion` fails closed on it (the question BLOCKS).
    // Refusing a flagless payload HERE, at the write, surfaces the producer's defect
    // loudly at the producer instead of manifesting as an unexplained stuck gate
    // three layers downstream. The error names the question id so a payload holding
    // twelve is diagnosable; the id is sanitized (it is producer-authored).
    const idLabel = isNonEmptyString(question.id)
      ? `question ${JSON.stringify(safeQuestionId(question.id))}`
      : where;
    if (typeof question.critical !== 'boolean') {
      errors.push(`${idLabel} must declare a boolean "critical" flag (got ${question.critical === undefined ? 'no value' : typeof question.critical}); an undeclared importance is treated as a fork`);
    }
    if (typeof question.important !== 'boolean') {
      errors.push(`${idLabel} must declare a boolean "important" flag (got ${question.important === undefined ? 'no value' : typeof question.important}); an undeclared importance is treated as a fork`);
    }
    const topicless = isTopiclessId(question.id);
    if (topicless && question.topic !== undefined) {
      errors.push(`${idLabel} is the gate ruling or the coverage notice and carries no "topic"`);
    } else if (!topicless && !QUESTION_TOPICS.includes(question.topic)) {
      errors.push(`${idLabel} must declare a "topic"; allowed: ${QUESTION_TOPICS.join(', ')}`);
    }
    if (!Array.isArray(question.options)) {
      errors.push(`${where}.options must be an array`);
      return;
    }
    if (question.options.length === 0 || question.options.length > 3) {
      errors.push(`${where}.options must have one to three options`);
    }
    if (question.options.length === 1 && HIGH_STAKES_TOPICS.includes(question.topic)
        && !(question.options[0] && question.options[0].recommended === true)) {
      errors.push(`${idLabel} is a ${question.topic} question with one option and no recommendation; a weighty question is never a notice`);
    }
    const seenKeys = new Set();
    const seenLabels = new Set();
    question.options.forEach((option, oi) => {
      const owhere = `${where}.options[${oi}]`;
      if (!option || typeof option !== 'object' || Array.isArray(option)) {
        errors.push(`${owhere} must be an object`);
        return;
      }
      if (!isNonEmptyString(option.key) || !OPTION_KEY.test(option.key)) {
        errors.push(`${owhere}.key must be "1", "2" or "3"`);
      } else {
        if (seenKeys.has(option.key)) {
          errors.push(`duplicate option key ${JSON.stringify(option.key)} within ${where}`);
        }
        seenKeys.add(option.key);
      }
      if (!isNonEmptyString(option.label)) {
        errors.push(`${owhere} is missing a non-empty string label`);
      } else {
        const identity = labelIdentity(option.label);
        if (seenLabels.has(identity)) errors.push(`${owhere}.label repeats another label within ${where}`);
        seenLabels.add(identity);
      }
      if (option.recommended !== undefined && typeof option.recommended !== 'boolean') {
        errors.push(`${owhere}.recommended must be a boolean when present`);
      }
      if (option.holds !== undefined) {
        errors.push(`${owhere}.holds is not a question field: a hold is the human's answer, recorded by CTOC`);
      }
      for (const field of ['label', 'pros', 'cons', 'description']) {
        if (field !== 'label' && option[field] !== undefined && typeof option[field] !== 'string') {
          errors.push(`${owhere}.${field} must be a string when present`);
        }
        visible(`${owhere}.${field}`, option[field]);
      }
    });
  });

  return { valid: errors.length === 0, errors };
}

/**
 * The critique lenses this store EXPECTS, named by THIS module and never read from
 * the payload — mirroring agents/iron-loop/gate-critic.md's "match by EXPECTATION,
 * never by claim". Three PROSECUTION lenses (whose clean pass is evidence the plan
 * survived attack) and one DEFENSE lens (`advocate`, which argues FOR crossing).
 * A payload cannot add, remove, or rename an expected lens; an unrecognised extra
 * lens key is simply ignored.
 */
const PROSECUTION_LENSES = ['premortem', 'devils-advocate', 'red-team'];
const EXPECTED_LENSES = [...PROSECUTION_LENSES, 'advocate'];
/** Closed vocabularies, matched by EXACT string equality — never prefix/substring. */
const LENS_STATES = ['clean-pass', 'partial', 'failed', 'absent'];
const LENS_COVERAGES = ['full', 'partial', 'none'];

/**
 * Validate a per-plan questions file's optional `attestation` block — the
 * machine-consumable RECORD that a critique fleet ran, projected from the lenses'
 * own `self_assessment` vocabulary (agents/iron-loop/premortem-critic.md) and
 * gate-critic's clean/partial/failed classification. PURE and NON-throwing.
 *
 * The attestation is subagent-authored, therefore UNTRUSTED: every value is matched
 * by exact string equality against the module's closed vocabularies, and the four
 * expected lens names come from THIS module. FAIL TOWARD NOT-ATTESTED — any absent,
 * malformed, or unrecognised value makes the whole block invalid; nothing here reads
 * an unknown value as a known-good one.
 *
 * An attestation is VALID when it is an object carrying `generated_by` (a non-empty
 * string), `generated_at` (a finite number), and a `lenses` object that holds ALL
 * FOUR expected lenses, each an object with a `state` from LENS_STATES, a `coverage`
 * from LENS_COVERAGES, and a non-negative integer `findings`.
 *
 * NOTE ON SCOPE: this is the ADDITIVE half of plan 00182 — validity means "a
 * well-formed critique record is present". It does NOT decide whether the record is
 * a CLEAN PASS good enough to license a gate crossing; that enforcement (three
 * prosecution lenses clean-pass at full coverage) is deferred with an
 * attestation-producing path — see the plan's Decisions Taken Under Ambiguity.
 *
 * @param {*} attestation
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateAttestation(attestation) {
  const errors = [];
  if (!attestation || typeof attestation !== 'object' || Array.isArray(attestation)) {
    return { valid: false, errors: ['attestation must be an object'] };
  }
  if (!isNonEmptyString(attestation.generated_by)) {
    errors.push('attestation.generated_by must be a non-empty string');
  }
  if (!Number.isFinite(attestation.generated_at)) {
    errors.push('attestation.generated_at must be a finite number');
  }
  const lenses = attestation.lenses;
  if (!lenses || typeof lenses !== 'object' || Array.isArray(lenses)) {
    errors.push('attestation.lenses must be an object');
    return { valid: false, errors };
  }
  for (const name of EXPECTED_LENSES) {
    const lens = lenses[name];
    if (!lens || typeof lens !== 'object' || Array.isArray(lens)) {
      errors.push(`attestation.lenses.${name} must be an object`);
      continue;
    }
    if (!LENS_STATES.includes(lens.state)) {
      errors.push(`attestation.lenses.${name}.state must be one of ${LENS_STATES.join('|')}`);
    }
    if (!LENS_COVERAGES.includes(lens.coverage)) {
      errors.push(`attestation.lenses.${name}.coverage must be one of ${LENS_COVERAGES.join('|')}`);
    }
    if (!Number.isInteger(lens.findings) || lens.findings < 0) {
      errors.push(`attestation.lenses.${name}.findings must be a non-negative integer`);
    }
  }
  return { valid: errors.length === 0, errors };
}

/**
 * Atomically write the per-plan questions file for `ref`. Validates the questions
 * FIRST (a malformed set is refused and NO file is written), then commits via a
 * temp-file + rename so a reader never observes a half-written file. NEVER throws:
 * every failure path returns `{ ok:false, errors }`.
 *
 * ── The optional `attestation` (ADDITIVE) ──────────────────────────────────────
 * A fifth, OPTIONAL, positional parameter. When it is an object it is CARRIED and
 * RECORDED verbatim into the file as `attestation`, so a reader (the sufficiency
 * audit, the Doctor screen) can tell "a critique ran" from "no record either way".
 * It is deliberately NOT validated at the write — the reader is the single
 * validation authority (`validateAttestation`), so there is one encoding of the rule
 * and no drift, and even a malformed-but-present record stays visible to an audit of
 * a broken producer. A non-object fifth argument is IGNORED, and an omitted one
 * leaves the file's byte shape EXACTLY as before (`{ ref, planMtimeMs, questions }`),
 * so every existing four-argument caller is unchanged.
 *
 * @param {string} root project root
 * @param {string} ref plan reference ("stage/file.md")
 * @param {Array<object>} questions the decision questions (Question contract)
 * @param {number} planMtimeMs the plan file's mtime (ms) at generation time
 * ── The optional `classification` (sixth parameter) ───────────────────────────
 * The gate critic's record that IT assigned the topics. Carried verbatim when it is an
 * object, like the attestation; the reader (`isGateCriticClassification`) decides
 * whether it counts. Without a valid one, every question in the file blocks.
 *
 * @param {object} [attestation] optional critique-ran record (see validateAttestation)
 * @param {object} [classification] optional `{ by: "gate-critic", at }` record
 * @returns {{ ok: true } | { ok: false, errors: string[] }}
 */
function writePlanQuestions(root, ref, questions, planMtimeMs, attestation, classification) {
  const file = questionsPath(root, ref);
  if (file === null) {
    return { ok: false, errors: [`invalid ref: ${typeof ref === 'string' ? JSON.stringify(ref) : typeof ref}`] };
  }

  const { valid, errors } = validatePlanQuestions(questions);
  if (!valid) return { ok: false, errors };

  // An unusable mtime (non-finite) stamps as 0 → the file reads as STALE against
  // any real plan mtime, forcing regeneration. Safer than storing a bad stamp.
  const mtime = Number.isFinite(planMtimeMs) ? planMtimeMs : 0;
  const record = { ref, planMtimeMs: mtime, questions };
  // Carry the attestation ONLY when it is an object — never a stray string/number,
  // and never an `attestation` key at all for a four-arg call (byte-shape unchanged).
  if (attestation && typeof attestation === 'object' && !Array.isArray(attestation)) {
    record.attestation = attestation;
  }
  if (classification && typeof classification === 'object' && !Array.isArray(classification)) {
    record.classification = classification;
  }
  const payload = JSON.stringify(record, null, 2);

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
 *   planMtimeMs?:number, attested?:boolean, attestation?:(object|null), classified?:boolean,
 *   errors?:string[], reason:string}}
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

  // ATTESTATION (additive, read-only exposure). `attested` is the reader-facing
  // verdict — TRUE only when a well-formed critique record is present — so a consumer
  // can tell "a critique ran" from "no record either way" without re-encoding the
  // rule. FAIL TOWARD NOT-ATTESTED: an absent or malformed block is `attested:false`.
  // The raw `attestation` block is exposed for a reader to render, but it is
  // subagent-authored and UNTRUSTED — a renderer MUST stripCtl and length-cap
  // `generated_by`/lens names before displaying them. This does NOT gate: an
  // unattested empty set still reads 'ready' (enforcement is a separate, deferred
  // slice), so the empty→ready/enough contract is unchanged.
  const attested = validateAttestation(parsed.attestation).valid;
  return {
    status: 'ready',
    questions: parsed.questions,
    questionsRevisionMs: storedMtimeMs, // the stamp the question set was generated against
    planMtimeMs: currentMtimeMs,        // the plan file's CURRENT mtime
    attested,
    attestation: parsed.attestation === undefined ? null : parsed.attestation,
    // Did the independent gate critic assign these topics? Without it no topic decides.
    classified: isGateCriticClassification(parsed.classification),
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
 * (re)generate questions for. start.md prose iterates this list to spawn critique
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
 * A question is BLOCKING when it goes to the human: only questions of high
 * uncertainty or huge importance do (the owner, 2026-10-06). Every other open
 * question is decided by its recommended option and recorded in the plan as a
 * decision taken under ambiguity. It blocks when ANY of these holds, checked in order:
 *
 *   1. MALFORMED — not an object, `critical`/`important` missing or not boolean,
 *      `options` not an array, or a `topic` outside QUESTION_TOPICS. THE ABSENCE OF A DECLARATION IS NOT A DECLARATION OF
 *      UNIMPORTANCE: a flagless question that read as non-blocking is how twelve
 *      real forks once crossed a gate the human never saw. Fail closed.
 *   2. `critical === true` — unusable result, security hole, data loss, irreversible
 *      damage, a crossing on a false basis.
 *   3. `topic` is one of HIGH_STAKES_TOPICS — huge importance, named by the owner.
 *   4. `important === true` and NO `topic` — a question written before `topic`
 *      existed keeps its old meaning, so absence never waves anything through.
 *   5. two or more options and not EXACTLY ONE `recommended: true` — high
 *      uncertainty: nobody could say which answer is better. A single option is a
 *      notice (e.g. the critique-coverage question), never an uncertainty.
 *
 * This rule lives HERE, in one place, on purpose: a caller that re-derives the tiers
 * from a question list is where drift gets in. `hasEnoughInformation` returns the
 * blocking set so nobody has to. Pure: reads only the object it is given.
 *
 * @param {*} question
 * @returns {boolean}
 */
function isBlockingQuestion(question) {
  if (!question || typeof question !== 'object' || Array.isArray(question)) return true;
  if (typeof question.critical !== 'boolean' || typeof question.important !== 'boolean') return true;
  if (!Array.isArray(question.options)) return true;
  const topicless = isTopiclessId(question.id);
  if (topicless ? question.topic !== undefined : !QUESTION_TOPICS.includes(question.topic)) return true;
  if (question.critical) return true;
  if (HIGH_STAKES_TOPICS.includes(question.topic)) return true;
  if (question.important && question.topic === undefined) return true;
  const options = question.options;
  return options.length >= 2 && options.filter((o) => o && o.recommended === true).length !== 1;
}

/**
 * THE shared rule for whether an open question goes to the human, used by the gate
 * (`hasEnoughInformation`) and by the sufficiency audit alike, so the two never count
 * differently. In a file the gate critic classified, `isBlockingQuestion` decides; in any
 * other file every question goes to the human — the author's own topic decides nothing
 * (the owner's decision of 2026-10-07).
 * @param {*} question
 * @param {boolean} classified whether the file carries a valid gate-critic classification
 * @returns {boolean}
 */
function goesToHuman(question, classified) {
  return classified !== true || isBlockingQuestion(question);
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

/** The plan's file name — its identity across stage moves — or null for a non-string ref. */
function planFileOf(ref) {
  return typeof ref === 'string' ? ref.slice(ref.lastIndexOf('/') + 1) : null;
}

/**
 * Does this answers-log entry for the plan set or release a hold on its question? A hold is
 * `holds: true` with a recorded key (the human's answer, recorded by CTOC; the key may be a
 * CTOC-added option the question file does not list). A release is a LATER real answer to the
 * same question without a hold: a non-empty string key that, when the question is known, is one
 * of its option keys, and no `holds` field of any other shape. Anything else changes nothing.
 * @param {object} entry
 * @param {*} key the entry's chosen key (`chosenKey`)
 * @param {Map<string, Set<string>>|null} optionKeys the current questions' keys, when known
 * @returns {boolean}
 */
function isHoldOrRelease(entry, key, optionKeys) {
  if (typeof key !== 'string' || key === '') return false;
  if (entry.holds === true) return true;
  if (entry.holds !== undefined && entry.holds !== false) return false;
  const known = optionKeys !== null && optionKeys.has(entry.questionId) ? optionKeys.get(entry.questionId) : null;
  return known === null || known.has(key);
}

/**
 * The option key one answers-log entry chose: `optionKey` (what `streamAnswer`
 * writes), else `answer` (the older agent-written shape `entryRecordedAtMs` also
 * reads), else `undefined` — an entry that records no answer, which binds nothing and
 * neither sets nor releases a hold.
 */
function chosenKey(entry) {
  return entry.optionKey !== undefined ? entry.optionKey : entry.answer;
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
 * ── AN ANSWER NAMES ONE OF THE QUESTION'S OPTIONS ──────────────────────────────
 * When the questions are known (derived here, or passed as `revision.questions`), an
 * entry binds only when its recorded key is one of that question's option keys; any
 * other entry is counted in `unbound`. A caller that passes a revision WITHOUT the
 * questions keeps the older id-only binding.
 *
 * ── A HOLD IS THE HUMAN'S, RECORDED BY CTOC IN THIS LOG ────────────────────────
 * A hold is never read from a question file: an author could mark any option. It is
 * an entry carrying `holds: true` for this plan — matched by the plan's file name, so a
 * hold survives revisions and stage moves — and it lasts until a LATER entry for the
 * same plan and question records an answer without it. Entries that record no answer
 * neither set nor release a hold.
 *
 * @param {string} root project root
 * @param {string} ref plan reference ("stage/file.md")
 * @param {{questionsRevisionMs:number, planMtimeMs:number, questions?:Array<object>}}
 *   [revision] omitted ⇒ derived internally from `planQuestionsStatus`.
 *   `hasEnoughInformation` passes the one it already computed, with its questions,
 *   purely to avoid a redundant read.
 * @returns {{ok:boolean, ids:Set<string>, keys:Map<string,*>, held:string[],
 *   bound:{stamped:number, derived:number}, unbound:number}} `keys` maps every id in
 *   `ids` to the option key its bound answer chose (the later log line wins), so a
 *   caller can honour WHAT was answered, not only THAT it was. `held` lists the
 *   question ids whose latest answer for this plan holds it. Both are empty on every
 *   closed path. `unbound` counts entries for THIS ref that were read but bound
 *   to no revision (or named no option of the question), so a caller can say so out
 *   loud instead of silently re-asking.
 */
function readAnsweredQuestionIds(root, ref, revision) {
  const ids = new Set();
  const keys = new Map();
  const closed = { ok: false, ids, keys, held: [], bound: { stamped: 0, derived: 0 }, unbound: 0 };

  // 1. RESOLVE THE REVISION FIRST, before the file is read. An unestablished
  //    revision cannot bind anything, and saying so as `ok:false` rather than
  //    `ok:true` with an empty set is the fail-closed discipline: the caller must
  //    be able to tell "nothing was answered" from "I could not tell".
  let rev = revision;
  if (rev === undefined) {
    const st = planQuestionsStatus(root, ref);
    if (st.status !== 'ready') return closed;
    rev = { questionsRevisionMs: st.questionsRevisionMs, planMtimeMs: st.planMtimeMs, questions: st.questions };
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
  const optionKeys = Array.isArray(rev.questions)
    ? new Map(rev.questions.filter((q) => q && Array.isArray(q.options)).map((q) => [q.id, new Set(q.options.map((o) => o && o.key))]))
    : null;
  const planFile = planFileOf(ref);

  const file = path.join(root, '.ctoc', 'streaming', 'answers.jsonl');
  let raw;
  try {
    if (!safeFs.existsSync(file)) return { ok: true, ids, keys, held: [], bound: { stamped: 0, derived: 0 }, unbound: 0 };
    raw = safeFs.readFileSync(file, 'utf8');
  } catch {
    return closed; // unreadable → we do not KNOW what was answered
  }

  let stamped = 0;
  let derived = 0;
  let unbound = 0;
  const holdState = new Map();

  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let entry;
    try { entry = JSON.parse(trimmed); } catch { continue; }
    if (!entry || typeof entry !== 'object' || typeof entry.questionId !== 'string') continue;
    const key = chosenKey(entry);
    if (planFileOf(entry.ref) === planFile && isHoldOrRelease(entry, key, optionKeys)) {
      holdState.set(entry.questionId, entry.holds === true);
    }
    if (entry.ref !== ref) continue;
    if (optionKeys !== null && !(optionKeys.has(entry.questionId) && optionKeys.get(entry.questionId).has(key))) {
      unbound++;
      continue;
    }

    const stamp = Number(entry.planMtimeMs);
    if (Number.isFinite(stamp)) {
      // (a) STAMPED — strict numeric equality, never loose, never a range. The log
      //     is append-only and any process may write to it, so this comparison is
      //     the whole guard.
      if (stamp === rev.questionsRevisionMs) {
        ids.add(entry.questionId);
        keys.set(entry.questionId, key);
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
      keys.set(entry.questionId, key);
      derived++;
    } else {
      unbound++;
    }
  }

  const held = [...holdState].filter(([, holds]) => holds).map(([id]) => id);
  return { ok: true, ids, keys, held, bound: { stamped, derived }, unbound };
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
 *   'answers-unreadable' the plan has questions and the answers log could not be
 *                        read: an answer or a hold may be in it. Checked first.
 *   'held'               the human's latest answer for this plan, in the answers log,
 *                        carries `holds: true` — his Hold holds, across revisions;
 *                        `blocking` names the held questions. Checked before forks.
 *   'open-forks'         an unanswered question goes to the human: in a file the gate
 *                        critic classified, by isBlockingQuestion; in any other file,
 *                        EVERY unanswered question (the author's own topic decides
 *                        nothing — the owner's decision of 2026-10-07)
 * and `enough: true` with reason 'enough' in every other case — which means: the
 * questions are fresh, nothing the human answered holds the plan, and no unanswered
 * fork remains. Unanswered questions that are not forks do NOT block; each is decided
 * by its recommended option, and they are still reported honestly in `unanswered`.
 *
 * An unreadable answers log blocks every plan that has questions: the log is where a
 * human's Hold is recorded, so not reading it is not knowing whether he held the plan.
 * A plan with NO questions has nothing to answer or hold, so its log cannot change the
 * verdict.
 *
 * NEVER throws. Pure read — writes nothing, and crosses nothing. This is the
 * PREDICATE only: whether and how a gate consumes it is a separate decision.
 *
 * @param {string} root project root
 * @param {string} ref plan reference ("stage/file.md")
 * @returns {{enough: boolean, reason: string, unanswered: Array<object>,
 *   blocking: Array<object>, unboundAnswers: number, computed: (number|null),
 *   answered: string[]}} `unanswered` is EVERY still-open question (nothing hidden);
 *   `blocking` is the subset that is a fork and therefore fails the gate;
 *   `unboundAnswers` is how many recorded answers could not be tied to this revision
 *   of the plan, so a screen can say "3 recorded answers are being asked again"
 *   instead of silently re-asking. `computed` is HOW MANY questions the file held
 *   (`questions.length`) on the ready path and `null` — never `0` — on every
 *   fail-closed path, so an unavailable count is honestly distinct from an empty
 *   list. `answered` is the ids of the CURRENT questions whose answer bound, so
 *   `answered.length + unanswered.length === computed` always holds. Both are
 *   derived from the SAME single read this function already performs — no extra disk
 *   access, no second predicate — so a recorded audit trail can state the
 *   denominator (how much a plan was asked), not only the numerator (how much was
 *   answered).
 */
function hasEnoughInformation(root, ref) {
  const status = planQuestionsStatus(root, ref);

  // FAIL CLOSED: every not-ready state. We do not know what this plan needs, and
  // not-knowing is never a pass.
  if (status.status !== 'ready') {
    // Nothing was read, so nothing was evaluated against a revision — 0 unbound is
    // literally true here and never means "everything bound". `computed: null` (not
    // 0): the count is UNKNOWN here, and writing 0 would forge an empty-list record.
    return { enough: false, reason: status.status, unanswered: [], blocking: [], unboundAnswers: 0, computed: null, answered: [] };
  }

  const questions = status.questions;
  // The revision is passed through from the status this function already computed —
  // never re-derived, and never obtained anywhere but planQuestionsStatus.
  const answers = readAnsweredQuestionIds(root, ref, {
    questionsRevisionMs: status.questionsRevisionMs,
    planMtimeMs: status.planMtimeMs,
    questions,
  });

  // An unreadable log yields an EMPTY answered set and no holds; the fail-closed
  // return below keeps that ignorance from ever reading as a pass.
  const unanswered = questions.filter((q) => !answers.ids.has(q.id));
  // The author's own topic decides nothing: unless the gate critic classified this file,
  // every open question is treated as weighty and goes to the human.
  const blocking = unanswered.filter((q) => goesToHuman(q, status.classified));
  // The count that EXISTED, and the ids that bound — both from the read above, so
  // only ids of CURRENT questions count (answered.length + unanswered.length === computed).
  const computed = questions.length;
  const answered = questions.filter((q) => answers.ids.has(q.id)).map((q) => q.id);

  // FAIL CLOSED: the log could not be read, and the plan has questions an answer or a
  // hold could be about.
  if (!answers.ok && computed > 0) {
    return { enough: false, reason: 'answers-unreadable', unanswered, blocking, unboundAnswers: answers.unbound, computed, answered };
  }

  // A human's Hold holds, from the answers log only — never from the question file.
  if (answers.held.length > 0) {
    const heldQuestions = answers.held.map((id) => questions.find((q) => q.id === id) || { id });
    return { enough: false, reason: 'held', unanswered, blocking: heldQuestions, unboundAnswers: answers.unbound, computed, answered };
  }

  if (blocking.length > 0) {
    return {
      enough: false,
      reason: 'open-forks',
      unanswered,
      blocking,
      unboundAnswers: answers.unbound,
      computed,
      answered,
    };
  }

  return { enough: true, reason: 'enough', unanswered, blocking: [], unboundAnswers: answers.unbound, computed, answered };
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
  isBlockingQuestion,
  isGateCriticClassification,
  goesToHuman,
  isFresh,
  plansNeedingQuestions,
};
