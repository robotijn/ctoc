'use strict';

/**
 * Content-hashed approval-provenance ledger (finding C4).
 *
 * This module is the SINGLE SOURCE OF APPROVAL TRUTH for CTOC's human gates.
 * Provenance for a plan lives in `.ctoc/approvals/<slug>.json`, keyed to the
 * plan's content hash and the exact gate edge it was approved for — NOT to the
 * `approved_by: human` marker text in the plan body, which any agent can write
 * with an ordinary tool call. The ledger closes that self-approval forgery at
 * its root:
 *
 *   - no ledger entry            ⇒ NOT approved (a self-authored marker alone
 *                                   never counts);
 *   - live content hash differs  ⇒ NOT approved (any post-approval edit,
 *                                   including a re-stamped marker, invalidates
 *                                   the entry);
 *   - `stage_to` differs         ⇒ NOT approved (an entry recorded for one gate
 *                                   edge cannot be replayed to justify another).
 *
 * The ledger directory is agent-write-denied at the enforcement layer (slice
 * s2, `PreToolUse.Edit.js`): no Edit/Write/MultiEdit/NotebookEdit tool call may
 * create or modify anything under `.ctoc/approvals/`. Entries are written ONLY
 * by the trusted, non-tool-call `approvePlan()` code path (slice s5). This
 * leaf module has no dependency on any other W02 file; both `human-gate-check.js`
 * (s3) and `actions.js` (s5) build on it.
 *
 * All filesystem I/O routes through `./safe-fs` (the audited choke point) and
 * every path is composed with `path.join`, so the module is cross-platform and
 * never writes outside `.ctoc/approvals/`.
 */

const crypto = require('crypto');
const path = require('path');
const safeFs = require('./safe-fs');

/**
 * A plan slug is a lowercase-alphanumeric-plus-hyphen token that must start
 * with an alphanumeric. This mirrors the slug guard used by `createCanvas` in
 * `actions.js` and guarantees a slug can never contain a path separator, a
 * `..` segment, a drive letter, or any other character that would let a
 * crafted value escape `.ctoc/approvals/`.
 */
const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;

/** Fields a ledger entry MUST carry; a write missing any of them is rejected. */
const REQUIRED_FIELDS = ['content_sha256', 'stage_from', 'stage_to'];

/**
 * Absolute path to the ledger directory under a project root.
 *
 * @param {string} projectPath - the project root
 * @returns {string} `<projectPath>/.ctoc/approvals`
 */
function ledgerDir(projectPath) {
  return path.join(projectPath, '.ctoc', 'approvals');
}

/**
 * Absolute path to a single plan's ledger entry, with a hard slug guard so a
 * crafted slug (e.g. `../../etc/passwd`) can never escape `.ctoc/approvals/`.
 *
 * @param {string} slug - the plan slug (validated against {@link SLUG_RE})
 * @param {string} projectPath - the project root
 * @returns {string} `<projectPath>/.ctoc/approvals/<slug>.json`
 * @throws {Error} `Invalid slug` when `slug` is not a safe token
 */
function ledgerPath(slug, projectPath) {
  if (typeof slug !== 'string' || !SLUG_RE.test(slug)) {
    throw new Error('Invalid slug');
  }
  return path.join(ledgerDir(projectPath), `${slug}.json`);
}

/**
 * Derive a plan's slug from its file path. The slug is the basename with the
 * trailing `.md` removed — stable across a stage move, because `movePlan`
 * keeps the basename identical when it relocates a plan between stage folders.
 *
 * @param {string} planPath - a path ending in `<slug>.md`
 * @returns {string} the slug
 */
function slugFromPlanPath(planPath) {
  return path.basename(planPath).replace(/\.md$/, '');
}

/**
 * SHA-256 (hex) of a plan's FULL file content — frontmatter plus body, exactly
 * as written to disk. Hashing the whole file means ANY later edit (including a
 * re-stamped approval marker) changes the hash and invalidates the entry.
 *
 * @param {string} content - the plan's full file content
 * @returns {string} the lowercase hex SHA-256 digest
 */
function computeContentHash(content) {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}

/**
 * Record an approval entry for a plan. Creates the ledger directory if needed
 * and writes `{ content_sha256, stage_from, stage_to, approved_at, approved_by }`
 * as pretty-printed JSON to {@link ledgerPath}. `approved_at` defaults to the
 * current ISO timestamp when the caller omits it.
 *
 * @param {string} slug - the plan slug
 * @param {{content_sha256: string, stage_from: string, stage_to: string,
 *          approved_at?: string, approved_by?: string}} entry - the entry fields
 * @param {string} projectPath - the project root
 * @returns {object} the entry object as written
 * @throws {Error} `Invalid slug` for an unsafe slug; a descriptive error naming
 *   the first missing required field (`content_sha256`, `stage_from`, or
 *   `stage_to`). The guards run BEFORE any filesystem write, so a rejected
 *   write never leaves a partial file behind.
 */
function writeEntry(slug, entry, projectPath) {
  const target = ledgerPath(slug, projectPath); // validates the slug first
  const src = entry || {};
  for (const field of REQUIRED_FIELDS) {
    if (src[field] === undefined || src[field] === null || src[field] === '') {
      throw new Error(`approval-ledger: missing required field "${field}"`);
    }
  }
  const record = {
    content_sha256: src.content_sha256,
    stage_from: src.stage_from,
    stage_to: src.stage_to,
    approved_at: src.approved_at || new Date().toISOString(),
    approved_by: src.approved_by !== undefined ? src.approved_by : 'human',
  };
  safeFs.mkdirSync(ledgerDir(projectPath), { recursive: true });
  safeFs.writeFileSync(target, JSON.stringify(record, null, 2));
  return record;
}

/**
 * Read a plan's ledger entry. Fail-soft: returns `null` when the entry file is
 * absent or its contents are unparseable — never throws on a corrupt ledger
 * file and never leaks a stack trace to the caller.
 *
 * @param {string} slug - the plan slug
 * @param {string} projectPath - the project root
 * @returns {object|null} the parsed entry, or `null` if absent/corrupt
 * @throws {Error} `Invalid slug` for an unsafe slug (the traversal guard still
 *   applies to reads)
 */
function readEntry(slug, projectPath) {
  const target = ledgerPath(slug, projectPath);
  if (!safeFs.existsSync(target)) return null;
  try {
    return JSON.parse(safeFs.readFileSync(target, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * The single predicate encoding C4. Returns `true` iff an entry exists AND its
 * `stage_to` equals `currentStage` AND its `content_sha256` equals the hash of
 * the live `content`. Any of the three legs failing — no entry, wrong edge, or
 * a post-approval edit — yields `false`.
 *
 * @param {string} slug - the plan slug
 * @param {string} content - the plan's current full file content
 * @param {string} currentStage - the stage the plan currently resides in
 * @param {string} projectPath - the project root
 * @returns {boolean} whether the plan is genuinely, currently ledger-approved
 */
function verify(slug, content, currentStage, projectPath) {
  const entry = readEntry(slug, projectPath);
  if (!entry) return false;
  if (entry.stage_to !== currentStage) return false;
  return entry.content_sha256 === computeContentHash(content);
}

/**
 * Best-effort removal of a plan's ledger entry. Used by s5's atomic-stamp
 * rollback. Never throws when the entry is already absent.
 *
 * @param {string} slug - the plan slug
 * @param {string} projectPath - the project root
 * @throws {Error} `Invalid slug` for an unsafe slug
 */
function removeEntry(slug, projectPath) {
  const target = ledgerPath(slug, projectPath);
  if (safeFs.existsSync(target)) {
    try {
      safeFs.unlinkSync(target);
    } catch {
      // Best-effort: a concurrent removal or a transient error must not throw
      // out of a rollback path. The absence of the file is the desired state.
    }
  }
}

module.exports = {
  ledgerDir,
  ledgerPath,
  slugFromPlanPath,
  computeContentHash,
  writeEntry,
  readEntry,
  verify,
  removeEntry,
};
