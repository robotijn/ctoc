'use strict';

/**
 * Streaming topic/question CONTRACT + fail-soft LOADER (streaming interaction
 * model, slice 1 — REAL DATA).
 *
 * This module is the seam between the pure streaming flow (`./streaming-flow`,
 * which consumes an in-memory `topics[]`) and REAL, on-disk question data. It does
 * two things and nothing else:
 *
 *   1. `validateTopics(raw)` — a PURE, NON-throwing structural validator that
 *      decides whether a parsed value is a well-formed topic list the flow can
 *      safely consume. Strict enough that a malformed file can never feed a broken
 *      flow; lenient on the genuinely-optional fields.
 *
 *   2. `loadTopics(projectRoot)` — a FAIL-SOFT reader for
 *      `<projectRoot>/.ctoc/streaming/topics.json`. Returns the `topics[]` array
 *      when the file exists, parses, and validates; returns `null` (NEVER throws)
 *      when the file is absent, unreadable, unparseable, or invalid. The streaming
 *      flow must never crash because a topics file is bad — a bad file simply
 *      means "fall back to the example seed".
 *
 * THE CONTRACT (the exact shapes the flow consumes)
 * -------------------------------------------------
 *   Topic    = { id, label, critical?, questions: [Question] }
 *   Question = { id, prompt, critical?, important?, options: [Option] }
 *   Option   = { key, label, recommended? }
 *
 * Field rules:
 *   - `id`, `label`, `prompt`, `key` are REQUIRED non-empty strings.
 *   - `questions` is a REQUIRED array (may be empty — an empty topic is legal; the
 *     flow skips topics with no questions). `options` is a REQUIRED array with AT
 *     LEAST ONE option (a question with zero options cannot be answered).
 *   - `critical` (on a topic or question), `important` (on a question), and
 *     `recommended` (on an option) are OPTIONAL booleans — present or absent, both
 *     well-formed. They are the tier/recommendation flags `./streaming-flow` reads.
 *   - Topic ids must be UNIQUE across the list; question ids must be UNIQUE WITHIN a
 *     topic (the flow keys answers by "<topicId>/<questionId>", so a collision would
 *     silently overwrite an answer). The SAME question id across DIFFERENT topics is
 *     fine.
 *
 * Cross-platform: path.join, safeFs (the audited fs choke point). No shell, no
 * OS-specific assumptions.
 */

const path = require('path');
const safeFs = require('./safe-fs');

/** A non-empty string. */
function isNonEmptyString(v) {
  return typeof v === 'string' && v.length > 0;
}

/**
 * Validate a raw parsed value against the topic/question CONTRACT. PURE and
 * NON-throwing: always returns `{ valid: boolean, errors: string[] }`. `errors`
 * accumulates a human-readable reason for every violation found (validation does
 * not short-circuit, so a bad file reports all of its problems at once).
 *
 * @param {*} raw the value to validate (typically a JSON.parse result)
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateTopics(raw) {
  const errors = [];

  if (!Array.isArray(raw)) {
    return { valid: false, errors: [`topics must be an array; got ${raw === null ? 'null' : typeof raw}`] };
  }

  const seenTopicIds = new Set();

  raw.forEach((topic, ti) => {
    if (!topic || typeof topic !== 'object' || Array.isArray(topic)) {
      errors.push(`topic[${ti}] must be an object`);
      return;
    }
    if (!isNonEmptyString(topic.id)) {
      errors.push(`topic[${ti}] is missing a non-empty string id`);
    } else {
      if (seenTopicIds.has(topic.id)) errors.push(`duplicate topic id ${JSON.stringify(topic.id)}`);
      seenTopicIds.add(topic.id);
    }
    if (!isNonEmptyString(topic.label)) {
      errors.push(`topic[${ti}] is missing a non-empty string label`);
    }
    if (topic.critical !== undefined && typeof topic.critical !== 'boolean') {
      errors.push(`topic[${ti}].critical must be a boolean when present`);
    }
    if (!Array.isArray(topic.questions)) {
      errors.push(`topic[${ti}].questions must be an array`);
      return;
    }

    const seenQuestionIds = new Set();
    topic.questions.forEach((question, qi) => {
      const where = `topic[${ti}].questions[${qi}]`;
      if (!question || typeof question !== 'object' || Array.isArray(question)) {
        errors.push(`${where} must be an object`);
        return;
      }
      if (!isNonEmptyString(question.id)) {
        errors.push(`${where} is missing a non-empty string id`);
      } else {
        if (seenQuestionIds.has(question.id)) {
          errors.push(`duplicate question id ${JSON.stringify(question.id)} within topic ${JSON.stringify(topic.id)}`);
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
      question.options.forEach((option, oi) => {
        const owhere = `${where}.options[${oi}]`;
        if (!option || typeof option !== 'object' || Array.isArray(option)) {
          errors.push(`${owhere} must be an object`);
          return;
        }
        if (!isNonEmptyString(option.key)) {
          errors.push(`${owhere} is missing a non-empty string key`);
        }
        if (!isNonEmptyString(option.label)) {
          errors.push(`${owhere} is missing a non-empty string label`);
        }
        if (option.recommended !== undefined && typeof option.recommended !== 'boolean') {
          errors.push(`${owhere}.recommended must be a boolean when present`);
        }
      });
    });
  });

  return { valid: errors.length === 0, errors };
}

/**
 * Read `<projectRoot>/.ctoc/streaming/topics.json`, JSON.parse it, validate it, and
 * return the `topics[]` array when it is a NON-EMPTY, well-formed structure. Returns
 * `null` — NEVER throws — when the file is absent, unreadable, unparseable, invalid,
 * or an empty array (nothing to seed). An invalid/unparseable file emits a brief
 * stderr warning (matching the codebase's fail-open warn style); an absent file is
 * silent (the common, expected case before the vision-decomposer writes one).
 *
 * @param {string} projectRoot absolute path to the project root
 * @returns {Array<object>|null} the validated topics array, or null (fail-soft)
 */
function loadTopics(projectRoot) {
  if (!isNonEmptyString(projectRoot)) return null;

  const file = path.join(projectRoot, '.ctoc', 'streaming', 'topics.json');

  let content;
  try {
    if (!safeFs.existsSync(file)) return null; // absent → silent fall-back
    content = safeFs.readFileSync(file, 'utf8');
  } catch (err) {
    console.warn(`Warning: Could not read streaming topics ${file}: ${err.message}`);
    return null;
  }

  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch (err) {
    console.warn(`Warning: streaming topics ${file} is not valid JSON: ${err.message}`);
    return null;
  }

  const { valid, errors } = validateTopics(parsed);
  if (!valid) {
    console.warn(`Warning: streaming topics ${file} is invalid: ${errors.join('; ')}`);
    return null;
  }

  // A valid-but-empty list means "no real topics" → fall back to the example seed.
  if (parsed.length === 0) return null;

  return parsed;
}

/**
 * Write a validated topics ARRAY to `<projectRoot>/.ctoc/streaming/topics.json`
 * ATOMICALLY: validate first (a malformed structure writes NOTHING), then write a temp
 * file in the same directory and rename it over the target so a concurrent reader never
 * sees a half-written file. The on-disk shape is the bare array `loadTopics` reads (NOT
 * `{ topics: [...] }`). NEVER throws for a bad argument — returns a discriminated result.
 *
 * This is the canonical WRITER for the topics store, moved here (X8) from the deleted
 * `streaming-decompose` so the topics module owns BOTH read and write. The
 * `vision-decomposer` agent writes real, model-decomposed topics through this function
 * (see agents/planning/vision-decomposer.md), replacing the old cold-start Claude CLI
 * spawn on the idea-submit path with a warm, model-dispatched decomposition.
 *
 * @param {string} projectRoot absolute path to the project root (write target parent)
 * @param {Array<object>} topics the topics array to persist
 * @returns {{ ok: boolean, errors?: string[] }} `{ok:true}` on a written file;
 *   `{ok:false, errors}` when the root is invalid or the topics fail validation (no write)
 */
function writeTopics(projectRoot, topics) {
  if (!isNonEmptyString(projectRoot)) {
    return { ok: false, errors: ['projectRoot must be a non-empty string'] };
  }
  const { valid, errors } = validateTopics(topics);
  if (!valid) return { ok: false, errors };

  const dir = path.join(projectRoot, '.ctoc', 'streaming');
  safeFs.mkdirSync(dir, { recursive: true });
  const target = path.join(dir, 'topics.json');
  const tmp = path.join(dir, `.topics.${process.pid}.${Date.now()}.tmp`);
  safeFs.writeFileSync(tmp, JSON.stringify(topics, null, 2), 'utf8');
  safeFs.renameSync(tmp, target);
  return { ok: true };
}

module.exports = { validateTopics, loadTopics, writeTopics };
