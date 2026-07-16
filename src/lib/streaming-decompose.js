'use strict';

/**
 * AI-integration entry for the streaming build flow (streaming interaction model,
 * slice 2 — REAL DATA, in-flow idea dump).
 *
 * `decomposeIdea(idea, projectRoot, opts)` turns a human's free-text idea into REAL
 * streaming topics by asking the model, through CTOC's runtime, to DECOMPOSE the idea
 * against the exact topic/question CONTRACT that `./streaming-topics` and
 * `./streaming-flow` consume. It is the seam between "a sentence a human typed" and the
 * on-disk `topics.json` the streaming screen drives.
 *
 * CTOC RUNTIME — no raw Anthropic key exists in the session. Model-calling features
 * spawn the Claude command-line interface as `claude -p --output-format json` (the CLI
 * carries the session's own auth). There is no dedicated CLI helper in src/lib today, so
 * this module owns the invocation directly, mirroring the cross-platform + fail-soft
 * pattern the other shell-outs use (e.g. `sca-runner.js`: the Windows launcher is a
 * `.cmd` shim, and a missing binary — spawnSync's `ENOENT` — is a LOUD SKIP, never a
 * crash). The spawn is injectable via `opts.spawn` for hermetic tests; the default is
 * `child_process.spawnSync`.
 *
 * RESULT CONTRACT (discriminated; NEVER throws — fail-soft always):
 *   { ok: true,  topics }                          decomposition succeeded + WRITTEN
 *   { ok: false, reason: 'empty-idea' }            blank idea (spawn short-circuited)
 *   { ok: false, reason: 'no-cli' }                the `claude` binary is absent
 *   { ok: false, reason: 'invalid-output', errors} CLI/model output failed parse/validate
 *   { ok: false, reason: 'error', message }         any other failure (spawn threw, etc.)
 *
 * On success the validated topics ARRAY (the on-disk shape `loadTopics` reads — the
 * array itself, NOT `{ topics: [...] }`) is written ATOMICALLY to
 * `<projectRoot>/.ctoc/streaming/topics.json` via a temp-file + rename through
 * `./safe-fs` (the audited fs choke point). A parse/validation failure writes NOTHING.
 *
 * Cross-platform: `path.join`, `safeFs`, `process.platform` for the `.cmd` launcher; no
 * shell, no OS-specific assumptions.
 */

const path = require('path');
const safeFs = require('./safe-fs');
const streamingTopics = require('./streaming-topics');

/** Max CLI stdout we will buffer (10 MiB) — a decomposition is small; this is a guard. */
const MAX_BUFFER = 10 * 1024 * 1024;

/**
 * Default spawn: the real `child_process.spawnSync`. Isolated so `opts.spawn` can
 * replace the entire process invocation in tests without a real CLI on the box.
 * @param {string} bin
 * @param {string[]} args
 * @param {object} options
 * @returns {{status?:number, stdout?:string, stderr?:string, error?:Error}}
 */
function defaultSpawn(bin, args, options) {
  // Lazy require keeps the module import side-effect free and cheap.
  return require('child_process').spawnSync(bin, args, options);
}

/**
 * Build the decomposition prompt: the idea text + the exact CONTRACT the flow consumes,
 * with an explicit instruction to emit ONLY the JSON object `{ "topics": [...] }`.
 * @param {string} idea
 * @returns {string}
 */
function buildPrompt(idea) {
  return [
    'You are the CTOC vision-decomposer. Decompose the following product idea into a',
    'guided, tiered question flow a builder answers to lock every decision.',
    '',
    'IDEA:',
    idea,
    '',
    'Output ONLY a single JSON object of this exact shape — no prose, no markdown fences:',
    '',
    '{ "topics": [ Topic, ... ] }',
    '',
    'CONTRACT (the exact shapes; extra fields are ignored):',
    '  Topic    = { "id": string, "label": string, "critical"?: boolean,',
    '               "questions": [ Question, ... ] }',
    '  Question = { "id": string, "prompt": string, "critical"?: boolean,',
    '               "important"?: boolean, "options": [ Option, ... ] }',
    '  Option   = { "key": string, "label": string, "recommended"?: boolean }',
    '',
    'RULES:',
    '  - Topics are the PARTS of the system, ordered MOST-CRITICAL FIRST; mark the',
    '    load-bearing ones "critical": true.',
    '  - Within a topic, give each question a tier: "critical" (a decision the builder',
    '    must confront first), "important", or neither (normal). "critical" outranks',
    '    "important".',
    '  - Every question has at least one option, and exactly one option per question is',
    '    marked "recommended": true (the highest-quality default).',
    '  - "id" / "label" / "prompt" / "key" are non-empty strings; topic ids are unique;',
    '    question ids are unique within their topic.',
    '',
    'Return the JSON object now.',
  ].join('\n');
}

/**
 * Pull the model's TEXT out of the CLI's `--output-format json` envelope. The CLI wraps
 * the assistant's final message; we accept the `result` string form (what
 * `claude -p --output-format json` emits), the bare `text` form, and the messages-API
 * `content: [{ text }]` array form. Returns null when no text is present.
 * @param {*} envelope parsed CLI JSON
 * @returns {string|null}
 */
function extractText(envelope) {
  if (!envelope || typeof envelope !== 'object') return null;
  if (typeof envelope.result === 'string') return envelope.result;
  if (typeof envelope.text === 'string') return envelope.text;
  if (Array.isArray(envelope.content)) {
    const joined = envelope.content
      .map(block => (block && typeof block.text === 'string') ? block.text : '')
      .join('');
    return joined.length > 0 ? joined : null;
  }
  return null;
}

/**
 * Extract the outermost `{ ... }` object substring from model text, tolerating prose or
 * a ```json fence around it. When no braces are present, returns the text unchanged so
 * the caller's `JSON.parse` fails loudly (→ invalid-output).
 * @param {string} text
 * @returns {string}
 */
function extractJsonObject(text) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) return text;
  return text.slice(start, end + 1);
}

/**
 * Write the validated topics ARRAY to `<projectRoot>/.ctoc/streaming/topics.json`
 * ATOMICALLY: write a temp file in the same directory, then rename over the target so a
 * reader never sees a half-written file. Uses safeFs (the audited fs choke point).
 * @param {string} projectRoot
 * @param {Array<object>} topics
 */
function writeTopicsAtomic(projectRoot, topics) {
  const dir = path.join(projectRoot, '.ctoc', 'streaming');
  safeFs.mkdirSync(dir, { recursive: true });
  const target = path.join(dir, 'topics.json');
  const tmp = path.join(dir, `.topics.${process.pid}.${Date.now()}.tmp`);
  safeFs.writeFileSync(tmp, JSON.stringify(topics, null, 2), 'utf8');
  safeFs.renameSync(tmp, target);
}

/**
 * Decompose a free-text idea into real streaming topics and, on success, persist them.
 * See the module header for the full result contract. NEVER throws.
 *
 * @param {string} idea the human's free-text idea
 * @param {string} projectRoot absolute path to the project root (write target parent)
 * @param {{ spawn?: Function, bin?: string }} [opts] `spawn` replaces the whole CLI
 *   invocation for tests; `bin` overrides the binary NAME (default: the platform's
 *   `claude` / `claude.cmd`) so a test can exercise the REAL spawn against a
 *   guaranteed-absent command (a fast ENOENT) without invoking a live model.
 * @returns {{ ok: boolean, topics?: Array<object>, reason?: string, errors?: string[], message?: string }}
 */
function decomposeIdea(idea, projectRoot, opts = {}) {
  try {
    if (typeof idea !== 'string' || idea.trim().length === 0) {
      return { ok: false, reason: 'empty-idea' };
    }

    const spawn = typeof opts.spawn === 'function' ? opts.spawn : defaultSpawn;
    const bin = (typeof opts.bin === 'string' && opts.bin.length > 0)
      ? opts.bin
      : (process.platform === 'win32' ? 'claude.cmd' : 'claude');
    const prompt = buildPrompt(idea);
    const result = spawn(bin, ['-p', '--output-format', 'json'], {
      input: prompt,
      encoding: 'utf8',
      maxBuffer: MAX_BUFFER,
    });

    // Spawn-level failure. A missing binary is a LOUD SKIP (no-cli); anything else is a
    // generic error. spawnSync reports both via `result.error`.
    if (result && result.error) {
      if (result.error.code === 'ENOENT') return { ok: false, reason: 'no-cli' };
      return { ok: false, reason: 'error', message: result.error.message || String(result.error) };
    }

    const stdout = result && typeof result.stdout === 'string' ? result.stdout : '';
    if (stdout.trim().length === 0) {
      return { ok: false, reason: 'invalid-output', errors: ['the Claude CLI produced no output'] };
    }

    let envelope;
    try {
      envelope = JSON.parse(stdout);
    } catch (e) {
      return { ok: false, reason: 'invalid-output', errors: [`CLI envelope is not JSON: ${e.message}`] };
    }

    const text = extractText(envelope);
    if (typeof text !== 'string' || text.trim().length === 0) {
      return { ok: false, reason: 'invalid-output', errors: ['no model text in the CLI envelope'] };
    }

    let payload;
    try {
      payload = JSON.parse(extractJsonObject(text));
    } catch (e) {
      return { ok: false, reason: 'invalid-output', errors: [`model output is not JSON: ${e.message}`] };
    }

    const topics = payload && payload.topics;
    const { valid, errors } = streamingTopics.validateTopics(topics);
    if (!valid) {
      return { ok: false, reason: 'invalid-output', errors };
    }

    writeTopicsAtomic(projectRoot, topics);
    return { ok: true, topics };
  } catch (err) {
    return { ok: false, reason: 'error', message: err && err.message ? err.message : String(err) };
  }
}

module.exports = { decomposeIdea };
