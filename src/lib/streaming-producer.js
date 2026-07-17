'use strict';

/**
 * Streaming PRODUCER — the BACKGROUND GENERATION half of "precompute questions, never
 * wait" ([[feedback_precompute_questions_never_wait]]).
 *
 * The streaming human loop is built end to end EXCEPT its SOURCE. Everything downstream
 * exists and is verified: the screen shows the app-questions (`richQuestionScreen`), the
 * human answers (`streamAnswer`), sufficiency is computed (`hasEnoughInformation`), and a
 * pre-build gate crosses itself on enough information (X6). The ONE missing pipe: nothing
 * dispatched a CTOC agent to PRODUCE questions and write them into the store. This module
 * IS that pipe.
 *
 * ── WHAT IT IS ──────────────────────────────────────────────────────────────────
 * Generation is DECOUPLED from answering. This module GENERATES — the human never waits
 * for it. It dispatches a CTOC producer agent for a plan, validates what comes back
 * against the REAL `streaming-precompute.validatePlanQuestions`, and writes it through the
 * REAL `streaming-precompute.writePlanQuestions`. The foreground reads that store with
 * zero wait.
 *
 * ── WHAT IT MUST NEVER DO — FABRICATE A QUESTION ────────────────────────────────
 * This module is a PIPE, not an author. The AGENT does the thinking; this module does the
 * plumbing: dispatch → validate → write. There is NO code path that synthesizes,
 * augments, or back-fills a question. The ONLY value ever handed to `writePlanQuestions`
 * is the exact array `dispatch` returned. A fabricated question would ask the human about
 * a fork that does not exist — strictly worse than silence. If dispatch returns nothing
 * usable, the store entry is EMPTY (`[]`) — the honest "asked, nothing to ask" — never an
 * invented question ([[user_role_and_collaboration.md]]: no invented content).
 *
 * ── THE INJECTED-DISPATCH SEAM ──────────────────────────────────────────────────
 *   dispatch(ref, planText, stage) -> Promise<questions[]>
 * is INJECTED. Tests pass a deterministic fake (no spawn, no model, no network).
 * `defaultDispatch` is the shipped default: it spawns the stage-appropriate CTOC producer
 * agent through the Claude command-line interface (`claude -p --output-format json` — the
 * CTOC runtime is the Claude CLI; no raw API key exists in the session,
 * [[project_ctoc_runtime_is_claude_cli]]) and parses the model's JSON. Its spawn boundary
 * is itself injectable (`opts.spawn`) so it can be exercised without a live model.
 *
 * ── FAIL-SOFT, ALWAYS ───────────────────────────────────────────────────────────
 * The generation loop is BACKGROUND. A dispatch that throws, times out, returns garbage,
 * or hits a missing `claude` binary skips that plan with a logged reason and returns
 * cleanly — it never crashes the session, never blocks the menu, and never writes a
 * partial or fabricated file. `produceForPlan` and `produceAllNeeded` NEVER throw.
 *
 * Cross-platform: `path.join`, `safeFs`, `process.platform` for the `.cmd` launcher; no
 * shell (execFile-style array argv, so a crafted plan filename cannot inject a command).
 */

const path = require('path');
const safeFs = require('./safe-fs');
const { getPlansDir } = require('./state');
const { MAX_CONCURRENT } = require('./task-registry');
const {
  validatePlanQuestions,
  writePlanQuestions,
  plansNeedingQuestions,
} = require('./streaming-precompute');

/** Max CLI stdout we buffer (10 MiB). A question set is small; this is a guard. */
const MAX_BUFFER = 10 * 1024 * 1024;

/**
 * The stage → CTOC producer agent map. Each value MUST resolve to a real agent file
 * under `agents/planning/<agent>.md` (asserted by the test suite so a rename can never
 * leave this pointing at a ghost). A stage NOT in this map has no producer agent and is
 * a clean skip — never a generic or invented substitute
 * ([[feedback_dont_touch_global_skills]] sibling rule: use CTOC's own agents).
 *
 * Only stages that can hold a pre-build gate plan needing questions appear here. `review`
 * (Gate 3) is deliberately ABSENT: whether built code is correct is not a question an
 * up-front critique can author, so no producer maps to it.
 */
const STAGE_AGENTS = Object.freeze({
  vision: 'vision-advisor',
  functional: 'product-owner',
  implementation: 'implementation-planner',
});

/** A non-empty string. */
function isNonEmptyString(v) {
  return typeof v === 'string' && v.length > 0;
}

/**
 * Parse a `stage/file.md` ref into `{ stage, file }`, or null when malformed. The file
 * part must be a bare filename (no separator, no "..", no NUL, not absolute), mirroring
 * the traversal guard in streaming-precompute / streaming-gate so a hostile ref can never
 * escape the plans directory.
 * @param {*} ref
 * @returns {{stage:string, file:string}|null}
 */
function parseRef(ref) {
  if (typeof ref !== 'string') return null;
  const slash = ref.indexOf('/');
  if (slash === -1) return null;
  const stage = ref.slice(0, slash);
  const file = ref.slice(slash + 1);
  if (!isNonEmptyString(stage) || stage === '..' || stage.includes('\\') || stage.includes('\0')) return null;
  if (!isNonEmptyString(file)
    || file.includes('/')
    || file.includes('\\')
    || file.includes('\0')
    || file.includes('..')
    || path.isAbsolute(file)) return null;
  return { stage, file };
}

/**
 * GENERATE questions for ONE plan and, on a valid result, WRITE them to the store.
 *
 * Reads the plan text and its current mtime from disk, calls the INJECTED
 * `dispatch(ref, planText, stage)`, validates the result against the REAL
 * `validatePlanQuestions`, and — only when valid — persists it through the REAL
 * `writePlanQuestions`, stamped with the plan's current mtime so the store entry is FRESH.
 *
 * The ONLY value passed to `writePlanQuestions` is the exact array `dispatch` returned —
 * there is no synthesis path. An empty array is a VALID, written result (Decision 2: a
 * computed set with nothing to ask records "asked, nothing needed" and reads as ENOUGH
 * information; NOT writing would leave the plan forever pending). An invalid result, a
 * thrown dispatch, a missing plan, or a write failure all return `{written:false, reason}`
 * and write NOTHING. NEVER throws.
 *
 * @param {string} root project root
 * @param {string} ref plan reference ("stage/file.md")
 * @param {(ref:string, planText:string, stage:string)=>Promise<Array<object>>} dispatch
 *   the injected producer seam
 * @returns {Promise<{written:boolean, count?:number, reason?:string}>}
 */
async function produceForPlan(root, ref, dispatch) {
  try {
    if (!isNonEmptyString(root)) return { written: false, reason: 'invalid root' };
    if (typeof dispatch !== 'function') return { written: false, reason: 'dispatch is not a function' };

    const parsed = parseRef(ref);
    if (parsed === null) return { written: false, reason: `invalid ref: ${typeof ref === 'string' ? JSON.stringify(ref) : typeof ref}` };

    const planPath = path.join(getPlansDir(root), parsed.stage, parsed.file);
    let planText;
    let planMtimeMs;
    try {
      planMtimeMs = safeFs.statSync(planPath).mtimeMs;
      planText = safeFs.readFileSync(planPath, 'utf8');
    } catch (err) {
      return { written: false, reason: `plan unreadable: ${(err && err.message) || String(err)}` };
    }

    // The ONE call to the producer. Its return is the ONLY source of written questions.
    let questions;
    try {
      questions = await dispatch(ref, planText, parsed.stage);
    } catch (err) {
      return { written: false, reason: `dispatch threw: ${(err && err.message) || String(err)}` };
    }

    // Validate against the REAL store schema — a fabricated or malformed set is refused
    // here and NOTHING is written. `[]` is valid and passes through as the empty set.
    const { valid, errors } = validatePlanQuestions(questions);
    if (!valid) {
      return { written: false, reason: `invalid questions: ${errors.join('; ')}` };
    }

    const res = writePlanQuestions(root, ref, questions, planMtimeMs);
    if (!res.ok) {
      const errs = /** @type {string[]} */ (/** @type {any} */ (res).errors) || [];
      return { written: false, reason: `write failed: ${errs.join('; ')}` };
    }
    return { written: true, count: questions.length };
  } catch (err) {
    // Belt-and-suspenders: the loop is background and must never crash the session.
    return { written: false, reason: `unexpected: ${(err && err.message) || String(err)}` };
  }
}

/**
 * Drain the plans that currently need questions and produce for each, up to `max`.
 *
 * `plansNeedingQuestions(root)` already filters to plans at a gate whose store entry is
 * missing or stale (idempotent + fresh-aware — a fresh plan is not re-produced). This
 * takes the first `max` of them (default = `task-registry.MAX_CONCURRENT`, IMPORTED, never
 * re-hardcoded — Decision 3) and runs one `produceForPlan` per plan, sequentially. A
 * failure on one plan NEVER stops the others: each is recorded in `skipped` and the drain
 * continues. NEVER throws.
 *
 * @param {string} root project root
 * @param {(ref:string, planText:string, stage:string)=>Promise<Array<object>>} dispatch
 *   the injected producer seam
 * @param {{max?:number}} [opts] `max` caps how many plans are produced this pass
 * @returns {Promise<{attempted:number, written:number, skipped:Array<{ref:string, reason:string}>}>}
 */
async function produceAllNeeded(root, dispatch, opts = {}) {
  const max = (Number.isInteger(opts.max) && opts.max > 0) ? opts.max : MAX_CONCURRENT;

  let needing;
  try {
    needing = plansNeedingQuestions(root);
  } catch {
    needing = [];
  }
  if (!Array.isArray(needing)) needing = [];

  const slice = needing.slice(0, max);
  let written = 0;
  const skipped = [];

  for (const d of slice) {
    const ref = d && d.ref;
    const res = await produceForPlan(root, ref, dispatch); // never throws
    if (res.written) written += 1;
    else skipped.push({ ref, reason: res.reason });
  }

  return { attempted: slice.length, written, skipped };
}

/**
 * Default spawn: the real `child_process.spawnSync`. Isolated so `opts.spawn` can replace
 * the entire process invocation in tests without a real CLI on the box. Lazy-required so
 * importing this module stays side-effect free and cheap.
 * @param {string} bin
 * @param {string[]} args
 * @param {object} options
 * @returns {{status?:number, stdout?:string, stderr?:string, error?:Error}}
 */
function defaultSpawn(bin, args, options) {
  return require('child_process').spawnSync(bin, args, options);
}

/**
 * Build the producer prompt: the plan text + the EXACT question/option contract the store
 * consumes, in the voice of the named CTOC agent, instructing it to emit ONLY the JSON
 * object `{ "questions": [...] }`. The agent NAME is embedded here (and thus appears in
 * the argv element that carries this prompt), so the spawn provably targets the mapped
 * CTOC agent and never a generic substitute.
 * @param {string} agent the CTOC producer agent name
 * @param {string} ref the plan reference
 * @param {string} planText the plan's current text
 * @returns {string}
 */
function buildPrompt(agent, ref, planText) {
  return [
    `You are the CTOC ${agent} agent. Read the plan below and produce the DECISION`,
    'QUESTIONS a human must answer before this plan can be built without guessing — the',
    'load-bearing FORKS only. If the plan has no real fork, return an EMPTY questions',
    'array; never invent a question.',
    '',
    `PLAN REFERENCE: ${ref}`,
    'PLAN:',
    planText,
    '',
    'Output ONLY a single JSON object of this exact shape — no prose, no markdown fences:',
    '',
    '{ "questions": [ Question, ... ] }',
    '',
    'CONTRACT (the exact shapes; extra fields are ignored):',
    '  Question = { "id": string, "prompt": string, "critical"?: boolean,',
    '               "important"?: boolean, "options": [ Option, ... ] }',
    '  Option   = { "key": string, "label": string, "recommended"?: boolean,',
    '               "pros"?: string, "cons"?: string, "description"?: string }',
    '',
    'RULES:',
    '  - "id" / "prompt" / "key" / "label" are non-empty strings; question ids are unique;',
    '    option keys are unique within their question; every question has >= 1 option.',
    '  - Mark a fork the builder must confront "critical": true; a strong-preference fork',
    '    "important": true; a detail resolvable while building, neither.',
    '  - Give each option pros/cons and mark exactly one "recommended": true per question.',
    '',
    'Return the JSON object now.',
  ].join('\n');
}

/**
 * Pull the model's TEXT out of the CLI's `--output-format json` envelope. Accepts the
 * `result` string form (what `claude -p --output-format json` emits), the bare `text`
 * form, and the messages-API `content:[{text}]` array form. Returns null when absent.
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
 * Extract the outermost `{ ... }` object substring from model text, tolerating prose or a
 * fenced block around it. When no braces are present, returns the text unchanged so the
 * caller's `JSON.parse` fails (→ an empty, non-fabricated result).
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
 * The SHIPPED default dispatch: spawn the stage-appropriate CTOC producer agent through
 * the Claude CLI and parse its questions. Matches the injected-dispatch contract
 * `(ref, planText, stage) -> Promise<questions[]>` so it is a drop-in for the seam; a
 * fourth `opts` argument (default `{}`) carries test injection.
 *
 * ALWAYS returns an ARRAY, NEVER throws, NEVER fabricates:
 *   - a stage with no producer agent (not in STAGE_AGENTS) → `[]` + logged reason, no spawn.
 *   - a MISSING `claude` binary (spawn ENOENT) → `[]` + logged reason (a LOUD SKIP).
 *   - a spawn error, empty output, non-JSON envelope, missing model text, non-JSON model
 *     output, or a set that fails `validatePlanQuestions` → `[]` + logged reason.
 *   - a valid set → that set, verbatim.
 * Because the return is fed straight to `produceForPlan`'s validation, a `[]` here writes
 * an empty (never a fabricated) store entry.
 *
 * SECURITY (Step 13): the prompt — which embeds the plan text and ref — is passed as a
 * single execFile-style ARGV element to `spawnSync` with NO shell, so a crafted plan
 * filename or body can never inject a command. The binary NAME is resolved
 * cross-platform (`claude.cmd` on Windows) and never assumes a POSIX path.
 *
 * @param {string} ref plan reference ("stage/file.md")
 * @param {string} planText the plan's text
 * @param {string} stage the plan's stage
 * @param {{spawn?:Function, bin?:string, log?:(reason:string)=>void}} [opts]
 * @returns {Promise<Array<object>>}
 */
async function defaultDispatch(ref, planText, stage, opts = {}) {
  const log = typeof opts.log === 'function' ? opts.log : ((reason) => { try { console.warn(`[streaming-producer] ${reason}`); } catch { /* never fatal */ } });

  const agent = STAGE_AGENTS[stage];
  if (!agent) {
    log(`no CTOC producer agent for stage ${JSON.stringify(stage)} — skipping ${ref}`);
    return [];
  }

  try {
    const spawn = typeof opts.spawn === 'function' ? opts.spawn : defaultSpawn;
    const bin = isNonEmptyString(opts.bin)
      ? opts.bin
      : (process.platform === 'win32' ? 'claude.cmd' : 'claude');
    const prompt = buildPrompt(agent, ref, typeof planText === 'string' ? planText : '');

    // execFile-style array argv, no shell: the prompt (with ref + plan text) is ONE inert
    // argv element and cannot inject a command regardless of its contents.
    const result = spawn(bin, ['-p', prompt, '--output-format', 'json'], {
      encoding: 'utf8',
      maxBuffer: MAX_BUFFER,
    });

    if (result && result.error) {
      if (result.error.code === 'ENOENT') {
        log(`the claude CLI binary is absent (ENOENT) — skipping ${ref}`);
        return [];
      }
      log(`spawn error for ${ref}: ${result.error.message || String(result.error)}`);
      return [];
    }

    const stdout = result && typeof result.stdout === 'string' ? result.stdout : '';
    if (stdout.trim().length === 0) {
      log(`the claude CLI produced no output for ${ref}`);
      return [];
    }

    let envelope;
    try {
      envelope = JSON.parse(stdout);
    } catch (e) {
      log(`CLI envelope is not JSON for ${ref}: ${e.message}`);
      return [];
    }

    const text = extractText(envelope);
    if (typeof text !== 'string' || text.trim().length === 0) {
      log(`no model text in the CLI envelope for ${ref}`);
      return [];
    }

    let payload;
    try {
      payload = JSON.parse(extractJsonObject(text));
    } catch (e) {
      log(`model output is not JSON for ${ref}: ${e.message}`);
      return [];
    }

    const questions = payload && payload.questions;
    const { valid, errors } = validatePlanQuestions(questions);
    if (!valid) {
      log(`model questions failed validation for ${ref}: ${errors.join('; ')}`);
      return [];
    }
    return questions;
  } catch (err) {
    log(`unexpected dispatch failure for ${ref}: ${(err && err.message) || String(err)}`);
    return [];
  }
}

module.exports = {
  produceForPlan,
  produceAllNeeded,
  defaultDispatch,
  STAGE_AGENTS,
};
