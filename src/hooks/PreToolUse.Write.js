#!/usr/bin/env node
'use strict';
/**
 * CTOC PreToolUse Enforcement Hook — Write (PI5-s2)
 *
 * TWO responsibilities, layered so the second is byte-for-byte unchanged:
 *
 *   1. ADVISORY duplicate guard (PI5-s2 — this slice).
 *      For a `plans/**\/*.md` Write target it derives the draft plan's summary from
 *      `tool_input.content`, `await`s `checkDuplicate(summary, { projectPath,
 *      selfPlanPath })` (PI5-s1, async + fail-open), and surfaces any near-duplicate
 *      as an ADVISORY warning — one line per match, naming the plan slug + similarity
 *      score — to BOTH stderr (the active session) and `.ctoc/logs/plan-index.log`
 *      (the sink for agent-created plans). It WARNS, it NEVER BLOCKS: it never exits
 *      non-zero, never emits a deny/block decision, and any error (checkDuplicate
 *      throws, no index, bad payload) fails open silently. The guard's block/allow
 *      authority is exactly zero.
 *
 *   2. ENFORCEMENT delegation (UNCHANGED).
 *      Production `main()` then delegates to `./PreToolUse.Edit.js` — the same
 *      plan-coverage enforcement used for Edit/Write/MultiEdit/NotebookEdit. That
 *      module reads `tool_name` from stdin (so logs distinguish which tool fired) and
 *      owns 100% of the block/allow decision. The advisory guard runs FIRST so a human
 *      always sees the duplicate note regardless of the enforcement outcome, and the
 *      guard is strictly additive — it does not weaken or alter enforcement.
 *
 * stdin handling (PI5-s2 CRITICAL FIX): a pipe is SINGLE-CONSUMER — fd 0 can be
 * drained exactly ONCE. The previous design read stdin here AND let the Edit
 * delegate's require-time IIFE read stdin AGAIN — the second read hit an empty
 * pipe, so enforcement saw target `(unknown)`, matched nothing in the plan
 * whitelist, and BLOCKED every plan-file write (exit 1); the escape-phrase bypass
 * broke too. The fix: `main()` reads + parses stdin exactly ONCE, runs the
 * advisory guard on that payload, then calls the delegate's exported
 * `enforce(parsed)` with the SAME parsed payload. `PreToolUse.Edit.js` no longer
 * reads stdin when imported (its stdin read is guarded by `require.main ===
 * module`), so there is NO second fd-0 read anywhere. Enforcement fires on the
 * real target: plan writes ALLOW, unplanned writes BLOCK, escape phrases work.
 *
 * The test imports the module and drives `run(payload, deps)` directly (never
 * touching stdin), plus a spawned-subprocess integration test drives the REAL
 * hook end-to-end (the PI4 lesson: unit tests on run() alone never exercised the
 * production stdin/delegate path that shipped broken).
 *
 * Exit codes: the advisory guard never exits; the delegated enforcement owns exit
 * (0 = allowed, 1 = blocked).
 *
 * Cross-platform: `path`-based normalization, forward-slash glob input, no shell.
 */

const fs = require('fs');
const path = require('path');
const safeFs = require('../lib/safe-fs');

/** Max chars of plan content folded into the summary query. */
const SUMMARY_CHAR_CAP = 2000;

/** The advisory warning line prefix (also the log/stderr marker the tests key on). */
const WARN_PREFIX = '⚠ possible duplicate:';

/**
 * Repo-relative, forward-slash-normalized plan path — used for glob matching and as
 * `selfPlanPath`. Absolute paths are relativized against `process.cwd()`; the result
 * is always forward-slash so the `plans/**\/*.md` glob matches on Windows and POSIX.
 *
 * @param {string} filePath
 * @returns {string}
 */
function normalizeRel(filePath) {
  if (typeof filePath !== 'string' || filePath === '') return '';
  let norm = filePath;
  if (path.isAbsolute(norm)) {
    norm = path.relative(process.cwd(), norm);
  }
  return norm.replace(/\\/g, '/').replace(/^\.\//, '');
}

/**
 * Is this Write target a plan file (`plans/**\/*.md`)? Uses the authoritative
 * `globToRegex` from `src/lib/plan-coverage.js` — the SAME glob the enforcement hook
 * uses — lazily required and fail-open (a missing lib → false, guard simply skips).
 *
 * @param {string} filePath
 * @param {(glob: string) => RegExp} [globToRegex] - injectable for tests
 * @returns {boolean}
 */
function isPlanTarget(filePath, globToRegex) {
  const rel = normalizeRel(filePath);
  if (!rel || !rel.endsWith('.md')) return false;
  let toRegex = globToRegex;
  if (typeof toRegex !== 'function') {
    try {
      toRegex = require('../lib/plan-coverage').globToRegex;
    } catch {
      return false;
    }
  }
  if (typeof toRegex !== 'function') return false;
  try {
    return toRegex('plans/**/*.md').test(rel);
  } catch {
    return false;
  }
}

/**
 * Derive the draft plan's summary query from its markdown content. Deliberately
 * simple + bounded (see the plan's `## Decisions Taken Under Ambiguity`): the
 * `title:` frontmatter value (if present) plus a `SUMMARY_CHAR_CAP` plain-text prefix
 * of the content. `checkDuplicate` treats this as opaque query text.
 *
 * @param {*} content - `tool_input.content` (only a non-empty string yields a summary)
 * @returns {string} '' for non-string / empty content (→ guard skips, no warning)
 */
function deriveSummary(content) {
  if (typeof content !== 'string' || content.trim() === '') return '';
  let title = '';
  const m = content.match(/^\s*title:\s*["']?(.+?)["']?\s*$/m);
  if (m && m[1]) title = m[1].trim();
  const body = content.slice(0, SUMMARY_CHAR_CAP);
  const summary = title ? `${title}\n${body}` : body;
  return summary.trim();
}

/**
 * Best-effort append to the advisory log. A log-write failure is swallowed — a
 * logging problem must never break a plan write.
 *
 * @param {string[]} lines
 * @param {string} projectPath
 */
function appendLog(lines, projectPath) {
  try {
    const logDir = path.join(projectPath, '.ctoc', 'logs');
    safeFs.mkdirSync(logDir, { recursive: true });
    const logFile = path.join(logDir, 'plan-index.log');
    const stamp = new Date().toISOString();
    const body = lines.map((l) => `${stamp} ${l}`).join('\n') + '\n';
    safeFs.appendFileSync(logFile, body);
  } catch {
    /* best-effort; never break the write */
  }
}

/**
 * Format + emit advisory warnings to stderr and the log. One line per near-duplicate.
 *
 * @param {Array<{ plan: string, similarity: number }>} warnings
 * @param {{ stderr?: { write: (s: string) => void }, projectPath?: string }} deps
 */
function emitWarnings(warnings, deps) {
  const stderr = deps.stderr && typeof deps.stderr.write === 'function' ? deps.stderr : process.stderr;
  const lines = warnings.map((w) => {
    const sim = Number.isFinite(w.similarity) ? w.similarity : 'n/a';
    return `${WARN_PREFIX} ${w.plan} (similarity: ${sim})`;
  });
  for (const line of lines) {
    try { stderr.write(`${line}\n`); } catch { /* never break on a stderr fault */ }
  }
  appendLog(lines, deps.projectPath || process.cwd());
}

/**
 * Resolve the `checkDuplicate` implementation used by the production path (no
 * injected `deps.checkDuplicate`).
 *
 * PRODUCTION: lazy-requires the real `../lib/plan-index/duplicate-guard`.
 *
 * TEST SEAM (spawned-subprocess integration test only): if
 * `process.env.CTOC_DUPLICATE_GUARD_TEST_FIXTURE` is set, it names a JSON file
 * containing a pre-scored warnings array (`[{ plan, similarity }]`). This lets the
 * spawned REAL hook surface a deterministic advisory warning WITHOUT an embedded
 * index / Ollama — proving the warning reaches a human through the production
 * `main()`/stdin/`enforce` path (the PI4 "measure is the human" lesson), while the
 * real duplicate logic stays byte-for-byte untouched. Production never sets this
 * env var; if the fixture is missing/unreadable/invalid the seam falls through to
 * the real guard (fail-open). The returned function is async + fail-open, matching
 * the real `checkDuplicate` contract.
 *
 * @returns {(summary: string, options: object) => Promise<Array<{plan:string,similarity:number}>>}
 */
function resolveCheckDuplicate() {
  const fixturePath = process.env.CTOC_DUPLICATE_GUARD_TEST_FIXTURE;
  if (fixturePath) {
    return async () => {
      try {
        const raw = safeFs.readFileSync(fixturePath, 'utf8');
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return []; // fail-open: a bad fixture never breaks a write
      }
    };
  }
  try {
    return require('../lib/plan-index/duplicate-guard').checkDuplicate;
  } catch {
    return () => Promise.resolve([]);
  }
}

/**
 * The advisory-guard entry, decoupled from stdin/exit so a test can drive it directly.
 * Accepts an ALREADY-PARSED PreToolUse payload and optional injected `deps`. Detects a
 * `plans/**\/*.md` target, derives the summary, `await`s `checkDuplicate`, emits + logs
 * any warnings, and RESOLVES (never rejects, never exits). WARNS, never blocks.
 *
 * @param {{ tool_input?: { file_path?: string, content?: string } }} payload
 * @param {object} [deps]
 * @param {(summary: string, options: object) => Promise<Array<{plan:string,similarity:number}>>} [deps.checkDuplicate]
 * @param {(glob: string) => RegExp} [deps.globToRegex]
 * @param {{ write: (s: string) => void }} [deps.stderr]
 * @param {string} [deps.projectPath]
 * @returns {Promise<{ warned: boolean, warnings: Array<{plan:string,similarity:number}> }>}
 */
async function run(payload, deps = {}) {
  try {
    const toolInput = (payload && payload.tool_input) || {};
    const filePath = toolInput.file_path;
    const content = toolInput.content;

    if (!isPlanTarget(filePath, deps.globToRegex)) {
      return { warned: false, warnings: [] };
    }

    const summary = deriveSummary(content);
    if (!summary) {
      return { warned: false, warnings: [] };
    }

    const checkDuplicate =
      typeof deps.checkDuplicate === 'function'
        ? deps.checkDuplicate
        : resolveCheckDuplicate();

    if (typeof checkDuplicate !== 'function') {
      return { warned: false, warnings: [] };
    }

    const projectPath = deps.projectPath || process.cwd();
    const selfPlanPath = normalizeRel(filePath);

    const warnings = await checkDuplicate(summary, { projectPath, selfPlanPath });

    if (Array.isArray(warnings) && warnings.length > 0) {
      emitWarnings(warnings, { ...deps, projectPath });
      return { warned: true, warnings };
    }
    return { warned: false, warnings: [] };
  } catch {
    // Fail-open: the advisory guard must never break a plan write.
    return { warned: false, warnings: [] };
  }
}

/**
 * Read the raw PreToolUse payload from stdin (fd 0) once, as a string. Returns '' on
 * any read failure (→ guard skips; enforcement still delegates and reads for itself).
 *
 * @returns {string}
 */
function readStdinRaw() {
  try {
    return fs.readFileSync(0, 'utf8') || '';
  } catch {
    return '';
  }
}

/**
 * Production entry. Reads + parses stdin exactly ONCE (a pipe is single-consumer),
 * runs the advisory guard on that parsed payload, then hands the SAME parsed
 * payload to the enforcement delegate's exported `enforce(parsed)`. There is NO
 * second fd-0 read: `PreToolUse.Edit.js` guards its own stdin read behind
 * `require.main === module`, so importing it here does not touch stdin. The
 * delegate owns the block/allow decision and the exit; the advisory guard never
 * blocks and never exits.
 *
 * @returns {Promise<void>}
 */
async function main() {
  const raw = readStdinRaw();
  let parsed = null;
  try {
    parsed = raw ? JSON.parse(raw) : null;
  } catch {
    parsed = null; // malformed payload → skip guard, STILL delegate enforcement
  }
  if (parsed) {
    try {
      await run(parsed);
    } catch {
      /* advisory guard is fail-open; never let it suppress enforcement */
    }
  }
  // Delegate enforcement with the SAME parsed payload we already read (single
  // read, then hand off). Importing the delegate does NOT run its IIFE or read
  // stdin (guarded by require.main === module), so no second fd-0 read occurs —
  // this is the fix for the drained-pipe → target '(unknown)' → block-everything
  // bug. Failing to load/run the delegate must NOT block the write: fail OPEN
  // (exit 0) so an advisory-hook fault never suppresses a legitimate write.
  let enforce;
  try {
    ({ enforce } = require('./PreToolUse.Edit.js'));
  } catch (err) {
    process.stderr.write(`[CTOC] Write hook: enforcement delegate failed to load (failing open): ${err.message}\n`);
    process.exit(0);
    return;
  }
  if (typeof enforce !== 'function') {
    process.stderr.write('[CTOC] Write hook: enforcement delegate has no enforce() (failing open)\n');
    process.exit(0);
    return;
  }
  // enforce() owns the exit (0 = allowed, 1 = blocked). It runs the real
  // whitelist/coverage/escape-phrase decision on the real target from `parsed`.
  await enforce(parsed);
}

module.exports = { run, main, isPlanTarget, deriveSummary, normalizeRel, SUMMARY_CHAR_CAP };

// Hook entry: run only when executed directly, so importing the module in a test
// never triggers stdin consumption / enforcement / process.exit.
if (require.main === module) {
  main();
}
