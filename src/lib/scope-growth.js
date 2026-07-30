'use strict';

/**
 * THE SCOPE-GROWTH THIRD DOOR (plan 00123).
 *
 * An approved plan's declared `files:` list IS its write permission: the PreToolUse
 * enforcement hook allows an edit only when an approved plan's declaration covers the
 * target. So an executor that discovers mid-build it must touch ONE MORE FILE than its
 * plan declared is in a genuine bind, and the two obvious ways out both arm an
 * auto-revert of the plan out from under the running build:
 *
 *   - amending `files:` in place moves the frontmatter, which is hashed byte-for-byte
 *     by `approval-ledger.computeSpecHash` → `contentMatches` fails → the residency
 *     sweep classifies it `hash-mismatch` (a live attack signature) → REVERT;
 *   - moving the plan back to `implementation/` to re-ask records the wrong gate edge →
 *     `wrong-edge` (also a live attack signature) → REVERT.
 *
 * THE THIRD DOOR is to STOP AND ASK without touching the plan file at all: file the
 * scope growth as a structured question in CTOC's EXISTING inbox questions stream
 * (`inbox.createQuestion`), which already has a count the dashboard prints, a door, and
 * a reader screen — nothing new is invented — and register the continuation FORK so the
 * Stop hook legitimately permits the halt (otherwise the very gate that stops an
 * executor drifting would force it to keep going). The plan's approval stays valid, no
 * revert is armed, and the in-scope work already on disk stays covered by the
 * declaration that already exists.
 *
 * WHY THE INBOX, NOT THE STREAMING QUESTION STORE. The streaming store is gate-scoped
 * (`pendingGateDecisions` iterates gate SOURCE stages); a plan being built sits in
 * `todo`/`in-progress`, a DESTINATION, so a question written there would be read by
 * nothing, and making it readable would expose it to `crossBySufficiency`'s
 * auto-crossing. The inbox is stage-agnostic and already agent-written.
 *
 * TELLING A REAL DISCOVERY FROM A WANDERING EXECUTOR. A request is REFUSED at write
 * time unless all seven fields are non-empty strings, so "I need this file" cannot pass
 * as a shrug. `forced_by` must name a file the plan ALREADY declares; that is checked
 * mechanically and reported as a three-valued `forced_by_declared` (true / false /
 * null). A weak request (forced_by naming nothing declared) is FLAGGED, not refused —
 * an executor may describe a real consequence in prose the matcher cannot parse, and
 * silently dropping a real discovery is worse than showing a weak one to a reviewer.
 * `forced_by_declared` is NEVER `false` on a read failure — "could not look" ≠ "found
 * nothing"; that would be the false-green shape this repository fences.
 *
 * Cross-platform: every path via `path.join`, all I/O through the existing
 * `inbox`/`safe-fs` choke points; nothing here shells out.
 */

const path = require('path');
const safeFs = require('./safe-fs');
const inbox = require('./inbox');
const continuation = require('./continuation');
const { readPlanFiles, globToRegex } = require('./plan-coverage');

/** The seven mandatory fields — each must be a non-empty string or the request is refused. */
const REQUIRED_FIELDS = Object.freeze([
  'plan', 'step', 'file', 'blocked_write', 'forced_by', 'acceptance_criterion', 'if_refused',
]);

/** The stages a building plan can reside in, searched for its declaration. */
const DECLARATION_STAGES = Object.freeze(['in-progress', 'todo', 'implementation']);

/**
 * The body heading that DISCRIMINATES a scope-growth question from an ordinary inbox
 * question. `inbox.createQuestion` writes a FIXED frontmatter with no custom type
 * field, so the sentinel lives in the body and `isScopeGrowthRequest` reads for it.
 */
const SENTINEL = '## Scope-Growth Request';

/**
 * Resolve a plan's declared `files:`, distinguishing "found nothing" from "could not
 * look". Returns `{ files: string[], readable: true }` when the plan file was located
 * and read, or `{ files: null, readable: false }` when it exists nowhere searchable or
 * could not be read — the latter is what makes `forced_by_declared` three-valued.
 *
 * @param {string} plan - the plan slug or a `stage/slug` ref
 * @param {string} root - project root
 * @returns {{files: (string[]|null), readable: boolean}}
 */
function planDeclaredFiles(plan, root) {
  const slug = String(plan).split('/').pop().replace(/\.md$/i, '');
  for (const stage of DECLARATION_STAGES) {
    const planPath = path.join(root, 'plans', stage, `${slug}.md`);
    let content;
    try {
      if (!safeFs.existsSync(planPath)) continue;
      content = safeFs.readFileSync(planPath, 'utf8');
    } catch {
      // The plan file exists but cannot be read: "could not look" — never "no files".
      return { files: null, readable: false };
    }
    return { files: readPlanFiles(planPath, content), readable: true };
  }
  // Located in no searchable stage → cannot determine the declaration → cannot look.
  return { files: null, readable: false };
}

/** Whether `target` is covered by any declared glob/literal in `declared`. */
function declarationCovers(declared, target) {
  return declared.some((g) => {
    try { return globToRegex(g).test(target); } catch { return false; }
  });
}

/**
 * File a scope-growth request: turn a refused write into a structured question the
 * human already has a door to, and register the fork that makes stopping legitimate.
 *
 * @param {object} request - the seven fields: `plan`, `step`, `file`, `blocked_write`,
 *   `forced_by`, `acceptance_criterion`, `if_refused`
 * @param {string} root - project root
 * @returns {{ok: true, id: string, path: string, forced_by_declared: (boolean|null)}
 *   | {ok: false, errors: string[]}} On any refusal NO file is written and NO fork is
 *   registered.
 */
function requestScopeGrowth(request, root) {
  const req = request && typeof request === 'object' ? request : {};

  // 1. Seven-field validation. A request that cannot state its cause is not a request.
  const errors = [];
  for (const field of REQUIRED_FIELDS) {
    const v = req[field];
    if (typeof v !== 'string' || v.trim() === '') {
      errors.push(`scope-growth: field "${field}" must be a non-empty string`);
    }
  }
  if (errors.length > 0) return { ok: false, errors };

  // 2. Resolve the declaration ONCE — used for both the already-declared refusal and
  //    the three-valued forced_by_declared.
  const declaration = planDeclaredFiles(req.plan, root);

  // 3. An already-declared file is not growth — the executor misread its refusal.
  if (declaration.readable && declarationCovers(declaration.files, req.file)) {
    return {
      ok: false,
      errors: [`scope-growth: "${req.file}" is ALREADY declared by plan "${req.plan}" — there is no growth to request`],
    };
  }

  // 4. forced_by_declared: true iff forced_by names a declared file (full entry or its
  //    basename); false iff it names none; NULL when the declaration could not be read.
  let forcedByDeclared;
  if (!declaration.readable) {
    forcedByDeclared = null;
  } else {
    forcedByDeclared = declaration.files.some(
      (f) => req.forced_by.includes(f) || req.forced_by.includes(path.basename(f))
    );
  }

  // 5. A second request against the same plan is itself a finding (mis-sizing). Count
  //    prior requests so the written question and the reviewer can see it. Fail-soft:
  //    a fault here must not lose the request.
  let priorForThisPlan = 0;
  try {
    const prior = listScopeGrowthRequests(root);
    if (prior.ok) priorForThisPlan = prior.byPlan[req.plan] || 0;
  } catch { priorForThisPlan = 0; }

  // 6. Write through the existing choke point. Pack every field under fixed headings so
  //    the body is both human-readable and parseable, behind the sentinel heading.
  const context = [
    SENTINEL,
    '',
    `- plan: ${req.plan}`,
    `- step: ${req.step}`,
    `- file: ${req.file}`,
    `- blocked_write: ${req.blocked_write}`,
    `- forced_by: ${req.forced_by}`,
    `- acceptance_criterion: ${req.acceptance_criterion}`,
    `- if_refused: ${req.if_refused}`,
    `- forced_by_declared: ${String(forcedByDeclared)}`,
    `- prior_requests_for_this_plan: ${priorForThisPlan}`,
  ].join('\n');

  let written;
  try {
    written = inbox.createQuestion({
      source_plan: req.plan,
      source_step: req.step,
      question: `Scope-growth: build needs undeclared file "${req.file}" (${req.plan}, step ${req.step})`,
      context,
    }, root);
  } catch (err) {
    // createQuestion's write is unguarded; a failure returns errors and registers NO
    // fork — an executor whose request did not land must not stop quietly.
    return { ok: false, errors: [`scope-growth: failed to write the request (${err && err.message})`] };
  }

  // 7. Register the fork AFTER a successful write, so the Stop hook permits the halt.
  //    `registerFork` is TOTAL — it fail-opens on any read/write fault and never throws
  //    (see continuation.js) — so the request that already landed cannot be undone by a
  //    continuation fault, and no swallowing catch is needed here.
  continuation.registerFork(root, `scope-growth: ${req.plan} step ${req.step} needs "${req.file}"`);

  return { ok: true, id: written.id, path: written.path, forced_by_declared: forcedByDeclared };
}

/**
 * Whether one inbox item is a scope-growth request. Reads the item file at `item.path`
 * and returns true iff the body carries the sentinel heading. Total — a read failure is
 * `false`, never a throw.
 *
 * @param {{path?: string}} item
 * @returns {boolean}
 */
function isScopeGrowthRequest(item) {
  if (!item || typeof item.path !== 'string') return false;
  try {
    return safeFs.readFileSync(item.path, 'utf8').includes(SENTINEL);
  } catch {
    return false;
  }
}

/**
 * List every scope-growth request, grouped by plan, distinguishing "no requests" from
 * "I could not read some".
 *
 * @param {string} root - project root
 * @returns {{ok: boolean, requests: object[], byPlan: {[plan: string]: number}, unreadable: number}}
 *   `ok: false` when the questions directory itself cannot be listed (loud, not an
 *   empty list); `unreadable` counts items whose frontmatter could not be read.
 */
function listScopeGrowthRequests(root) {
  const dir = path.join(root, '.ctoc', 'inbox', 'questions');
  let files;
  try {
    files = safeFs.existsSync(dir)
      ? safeFs.readdirSync(dir).filter((f) => f.endsWith('.md') && f !== '.gitkeep')
      : [];
  } catch {
    // The directory exists but cannot be listed — a loud failure, never "no requests".
    return { ok: false, requests: [], byPlan: {}, unreadable: 0 };
  }

  const requests = [];
  /** @type {{[plan: string]: number}} */
  const byPlan = {};
  let unreadable = 0;
  for (const f of files) {
    const p = path.join(dir, f);
    let content;
    try {
      content = safeFs.readFileSync(p, 'utf8');
    } catch {
      // An item that cannot be read is COUNTED, never silently dropped.
      unreadable++;
      continue;
    }
    const item = { path: p };
    if (!isScopeGrowthRequest(item)) continue;
    requests.push(item);
    // The grouping key is the item's `source_plan` frontmatter field. This is INBOX
    // frontmatter, not a plan file — read the single field with a targeted match rather
    // than a general frontmatter parser (scope-growth delegates all PLAN-file parsing to
    // the canonical reader `plan-coverage.readPlanFiles`, and parses no plan frontmatter
    // of its own).
    const m = content.match(/^source_plan:\s*(.*)$/m);
    const plan = (m && m[1].trim()) || '(unknown)';
    byPlan[plan] = (byPlan[plan] || 0) + 1;
  }
  return { ok: true, requests, byPlan, unreadable };
}

module.exports = {
  requestScopeGrowth,
  listScopeGrowthRequests,
  isScopeGrowthRequest,
  SENTINEL,
};
