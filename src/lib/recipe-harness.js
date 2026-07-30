'use strict';

/**
 * 00186 — recipe-harness: extract and EXECUTE the shipped `node` recipes out of a
 * CTOC instruction surface (`src/commands/start.md`), so a state-changing recipe
 * can be proven by RUNNING it against a fixture rather than by reading it.
 *
 * Why execution and not a static check: the 00185 defect passed a string where a
 * proposal object belonged — three arguments to `executeCleanup(proposal, root,
 * deps = {})`, `Function.prototype.length === 2`. That is arity-legal in every
 * sense a static checker can measure; the call was wrong in the MEANING of an
 * argument, and JavaScript carries no type at that boundary to compare against.
 * The only mechanism that catches it is to run the recipe against a fixture seeded
 * so a specific observable change MUST occur, then assert it occurred.
 *
 * This module is an INSTRUMENT, in the same class as `false-green-scan.js` and
 * `reachability.js`: its legitimate caller is a test. It commits none of the five
 * false-green signatures — no silent catch, no truncate-then-parse, no unbounded
 * capture (maxBuffer is explicit and an overflow is a reported FAILURE), no
 * parse-default-to-success, no exit-with-pending-writes. A missing target file is
 * a LOUD throw naming the path, never a silent zero-recipe result.
 */

const safeFs = require('./safe-fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

// The placeholder prefixes that both resolve to the project root. Stripped to
// repository-relative module paths so this module needs no root of its own.
const ROOT_PLACEHOLDERS = ['{{CTOC_ROOT}}', '${CLAUDE_PLUGIN_ROOT}'];

/**
 * State-changing library calls (module basename → function). Executing one mutates
 * durable state: a plan move, a setting write, a ledger entry, a `.ctoc/` write, a
 * delete. This is the scope predicate — enumerated from the plan, not inferred from
 * a name. A read-only recipe (findNumberCollisions, scanCheapCandidates as the read
 * half, plansNeedingQuestions, plan-index.related/detectConflicts) is out of scope:
 * its failure is visible on the screen the moment a human uses it.
 */
const STATE_CHANGING_CALLS = new Set([
  'plan-numbering.allocatePlanNumber',
  'plan-numbering.renumberImplementationPlans',
  'stale-cleanup.executeCleanup',
  'settings.setSetting',
  'stale-detector.dismissStale',
  'compliance-regime.writeActiveProfiles',
  'compliance-regime.declineComplianceRegime',
]);

/** State-changing scripts (basename). The ledger-backfill maintainer script writes
 *  the approval ledger. The dashboard launcher (start.js) is a different surface —
 *  render + task-scheduling — that the plan does not enumerate, so it is not here. */
const STATE_CHANGING_SCRIPTS = new Set(['ledger-backfill.js']);

/** Unambiguous placeholder SHAPES — never valid JS in these programs — used to
 *  refuse a run over an unsubstituted placeholder (guessing a substitution is how
 *  the broken recipe survived). Single-brace `{word}` is deliberately NOT here: it
 *  is ambiguous with JS destructuring/object literals, so it is only substituted
 *  when the caller names it, never flagged. */
const LEFTOVER_PLACEHOLDER_RE = /\{\{[^}]+\}\}|\$\{[A-Za-z_][\w]*\}|<[a-z][a-z-]*>/;

/** Strip a leading root placeholder to get a repository-relative path. */
function stripRootPrefix(p) {
  for (const ph of ROOT_PLACEHOLDERS) {
    if (p.startsWith(ph + '/')) return p.slice(ph.length + 1);
  }
  return p;
}

/** Basename of a module path without the `.js` extension, e.g.
 *  `src/lib/plan-numbering` → `plan-numbering`. */
function moduleBasename(modPath) {
  return path.basename(modPath).replace(/\.js$/, '');
}

/**
 * Parse the `require(...).fn` and `const NAME = require(...); NAME.fn` call graph
 * out of a single `node -e` program. Returns `{ staticCalls, calls }` where
 * staticCalls is `[{ module, fn }]` (module repo-relative) and calls is the
 * normalized `basename.fn` id list used by the scope predicate and the recipe id.
 */
function parseCalls(program) {
  const staticCalls = [];
  const seen = new Set();
  const add = (modPath, fn) => {
    const module = stripRootPrefix(modPath);
    const key = module + '::' + fn;
    if (seen.has(key)) return;
    seen.add(key);
    staticCalls.push({ module, fn });
  };

  // Bind `const NAME = require('PATH')`.
  const binds = {};
  for (const m of program.matchAll(
    /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*require\((["'])([^"']+)\2\)/g
  )) {
    binds[m[1]] = m[3];
  }
  // Inline `require('PATH').fn`.
  for (const m of program.matchAll(/require\((["'])([^"']+)\1\)\.([A-Za-z_$][\w$]*)/g)) {
    add(m[2], m[3]);
  }
  // `NAME.fn` (call OR property access) where NAME is a require binding. Property
  // access counts: the plan-index diagnostics do `const f = pi.related`, and the
  // named export must still exist. Scanned with indexOf + a STATIC regex (never a
  // dynamic RegExp built from extracted text — the repo forbids those).
  const ID_HEAD = /^([A-Za-z_$][\w$]*)/;
  const ID_CHAR = /[\w$]/;
  for (const [name, modPath] of Object.entries(binds)) {
    const needle = name + '.';
    let idx = 0;
    while ((idx = program.indexOf(needle, idx)) !== -1) {
      const prev = idx > 0 ? program[idx - 1] : ' ';
      if (!ID_CHAR.test(prev)) {
        const m = program.slice(idx + needle.length).match(ID_HEAD);
        if (m) add(modPath, m[1]);
      }
      idx += needle.length;
    }
  }

  const calls = staticCalls.map((c) => moduleBasename(c.module) + '.' + c.fn);
  return { staticCalls, calls: [...new Set(calls)] };
}

/** Trailing argv tokens after a `node -e "..."` program: only placeholder-shaped
 *  tokens (`<slug>`) are kept, so markdown prose after the recipe is never mistaken
 *  for an argument. */
function parseTrailingArgs(tail) {
  return tail
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => /^<[a-z][a-z-]*>$/.test(t));
}

/**
 * Extract every `node -e "<program>"` and `node "<path>.js" <args>` recipe from a
 * shipped instruction file.
 *
 * @param {string} markdownPath - absolute path to the instruction surface
 * @returns {Array<object>} recipe objects: `{ row, kind, program?|scriptPath?, args,
 *   calls, staticCalls, placeholders }`
 * @throws {Error} naming the missing path when `markdownPath` does not exist — a
 *   moved or renamed target is a LOUD throw, NEVER a silent empty result.
 */
function extractRecipes(markdownPath) {
  if (typeof markdownPath !== 'string' || markdownPath.length === 0) {
    throw new Error('recipe-harness.extractRecipes: markdownPath must be a non-empty string');
  }
  if (!safeFs.existsSync(markdownPath)) {
    throw new Error(
      'recipe-harness.extractRecipes: instruction surface does not exist: ' + markdownPath +
      ' — a moved or renamed target is a loud failure, never a silent zero-recipe result'
    );
  }
  const md = safeFs.readFileSync(markdownPath, 'utf8');
  const lines = md.split('\n');
  const recipes = [];

  lines.forEach((line, i) => {
    const row = i + 1;

    // node -e "<program>"<trailing args up to a backtick or end-of-line>
    for (const m of line.matchAll(/node -e "([^"]*)"([^\n`]*)/g)) {
      const program = m[1];
      const { staticCalls, calls } = parseCalls(program);
      const placeholders = [...new Set(
        (program.match(/\{\{[^}]+\}\}|\$\{[A-Za-z_][\w]*\}|\{[a-z]+\}/g) || [])
      )];
      recipes.push({
        row,
        kind: 'node-e',
        program,
        args: parseTrailingArgs(m[2] || ''),
        calls,
        staticCalls,
        placeholders,
      });
    }

    // node "<...>/<name>.js" <args>
    for (const m of line.matchAll(/node "([^"]*\.js)"([^\n`]*)/g)) {
      const scriptPath = stripRootPrefix(m[1]);
      const args = (m[2] || '').trim().split(/\s+/).filter(Boolean);
      recipes.push({
        row,
        kind: 'node-script',
        scriptPath,
        args,
        calls: [],
        staticCalls: [],
        placeholders: [...new Set((m[1].match(/\{\{[^}]+\}\}|\$\{[A-Za-z_][\w]*\}/g) || []))],
      });
    }
  });

  return recipes;
}

/** True when a recipe mutates durable state (in scope for the execution fence). */
function isStateChanging(recipe) {
  if (!recipe) return false;
  if (recipe.kind === 'node-script') {
    return STATE_CHANGING_SCRIPTS.has(path.basename(recipe.scriptPath || ''));
  }
  return (recipe.calls || []).some((c) => STATE_CHANGING_CALLS.has(c));
}

/** A stable identity for a recipe: a hash of its normalized program (root
 *  placeholders stripped, whitespace collapsed) for node -e, or the script path +
 *  args for node-script. A real code change to a state-changing recipe changes its
 *  id — which is correct: a changed receiver must be re-examined. */
function recipeId(recipe) {
  let basis;
  if (recipe.kind === 'node-script') {
    basis = 's:' + recipe.scriptPath + ' ' + (recipe.args || []).join(' ');
  } else {
    let norm = recipe.program || '';
    for (const ph of ROOT_PLACEHOLDERS) norm = norm.split(ph).join('');
    norm = norm.replace(/\s+/g, ' ').trim();
    basis = 'e:' + norm;
  }
  return crypto.createHash('sha1').update(basis).digest('hex').slice(0, 12);
}

/** Apply literal (non-regex) substitutions to a string. Keys such as
 *  `${CLAUDE_PLUGIN_ROOT}` carry regex-special characters, so split/join is used. */
function applySubstitutions(str, subs) {
  let out = str;
  for (const [k, v] of Object.entries(subs || {})) out = out.split(k).join(String(v));
  return out;
}

/**
 * Execute a `node -e` recipe program against a fixture root and return a structured
 * result. No shell (argument array), bounded timeout, EXPLICIT maxBuffer, and an
 * overflow/timeout is REPORTED, never swallowed into a pass.
 *
 * @param {string} program - the `-e` program (with placeholders)
 * @param {object} [opts]
 * @param {string} [opts.root] - fixture cwd (required at runtime)
 * @param {object} [opts.substitutions] - placeholder → value (literal replace)
 * @param {string[]} [opts.args] - trailing argv tokens (also substituted)
 * @param {number} [opts.timeoutMs] - bounded, default 20000
 * @param {number} [opts.maxBuffer] - explicit, default 4 MiB
 * @returns {{code:number|null, stdout:string, stderr:string, json:*|null,
 *   error:string|null, overflow:boolean, timedOut:boolean}}
 * @throws {Error} on an unsubstituted unambiguous placeholder (a guessed
 *   substitution is how the broken recipe survived)
 */
function runRecipe(program, opts = {}) {
  const { root, substitutions = {}, args = [], timeoutMs = 20000, maxBuffer = 4 * 1024 * 1024 } = opts;
  if (typeof program !== 'string') throw new Error('recipe-harness.runRecipe: program must be a string');
  if (typeof root !== 'string' || root.length === 0) throw new Error('recipe-harness.runRecipe: root is required');

  const prog = applySubstitutions(program, substitutions);
  const argv = (args || []).map((a) => applySubstitutions(a, substitutions));

  for (const s of [prog, ...argv]) {
    const leftover = s.match(LEFTOVER_PLACEHOLDER_RE);
    if (leftover) {
      throw new Error(
        'recipe-harness.runRecipe: unsubstituted placeholder ' + JSON.stringify(leftover[0]) +
        ' — refusing to run rather than guess a substitution'
      );
    }
  }

  const res = spawnSync(process.execPath, ['-e', prog, ...argv], {
    cwd: root,
    encoding: 'utf8',
    timeout: timeoutMs,
    maxBuffer: maxBuffer, // explicit (bounded): overflow surfaces as res.error below, never a silent pass
  });

  const err = /** @type {NodeJS.ErrnoException|null} */ (res.error || null);
  const overflow = !!(err && (err.code === 'ENOBUFS' || /maxBuffer|max buffer/i.test(err.message || '')));
  const timedOut = !!(err && (err.code === 'ETIMEDOUT' || res.signal === 'SIGTERM'));
  const stdout = res.stdout || '';
  const stderr = res.stderr || '';

  let json = null;
  if (!err) {
    const trimmed = stdout.trim();
    if (trimmed) {
      try {
        json = JSON.parse(trimmed);
      } catch {
        json = null; // bare non-JSON stdout (e.g. a "00001" plan number) — not an error
      }
    }
  }

  // An overflow/timeout must never read as success. code is null in that case; the
  // caller gates on code === 0, so the failure surfaces loudly.
  return {
    code: err ? null : (typeof res.status === 'number' ? res.status : null),
    stdout,
    stderr,
    json,
    error: err ? err.message : null,
    overflow,
    timedOut,
  };
}

module.exports = {
  extractRecipes,
  runRecipe,
  isStateChanging,
  recipeId,
  applySubstitutions,
  STATE_CHANGING_CALLS,
  STATE_CHANGING_SCRIPTS,
};
