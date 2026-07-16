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
 * WHERE THE DENY ACTUALLY LIVES (R3-A — the previous version of this header made
 * a promise the code did not keep, so read this one literally):
 *   - EDIT CHANNEL: `PreToolUse.Edit.js` denies every Edit/Write/MultiEdit/
 *     NotebookEdit tool call targeting `.ctoc/approvals/` (`isProtectedLedgerPath`).
 *   - BASH CHANNEL: `PreToolUse.Bash.js` (`isLedgerForgery`) denies, as its FIRST
 *     layer, any command that writes the ledger directory (redirect/tee/cp/mv/…),
 *     any INLINE EVAL (`node -e`/`--eval`/`-p`/stdin) referencing this module, the
 *     ledger directory, or a gate/ledger verb, and any inline eval that cannot be
 *     statically cleared. Until R3-A this deny did NOT exist and the header's
 *     "agent writes are denied" claim was FALSE: `node -e "require('./src/lib/
 *     approval-ledger').writeEntry(…)"` minted a human-kind entry at will.
 *   - NOT COVERED (stated honestly, because a false guarantee is worse than none):
 *     a checked-in `.js` file executed with `node file.js` is not an inline eval and
 *     is not string-matchable — it is a REVIEWABLE artifact, which is the point.
 *     `src/scripts/ledger-backfill.js` is the ONE sanctioned writer of that shape.
 *
 * Entries are otherwise written only by the trusted, non-tool-call `approvePlan()`
 * code path (`stampAndLedger`), by `stale-cleanup.js` (pipeline kind), and by the
 * sanctioned backfill script. Its ONLY intra-project dependency is the pure-constant
 * `gate-order.js` (the ONE gate-edge encoding, R6-B), which requires nothing — so
 * there is no require cycle and this module stays side-effect-free and fast on the
 * Bash-hook path. `human-gate-check.js` and `actions.js` build on it.
 *
 * All filesystem I/O routes through `./safe-fs` (the audited choke point) and
 * every path is composed with `path.join`, so the module is cross-platform and
 * never writes outside `.ctoc/approvals/`.
 *
 * THREE ENTRY KINDS (R2-F, extended by R3-A item 5). Every entry declares its
 * provenance, and `entryKind(entry)` reports it HONESTLY:
 *   - HUMAN kind (`writeEntry`, the default): a human crossed the gate via the
 *     menu (`approvePlan`/`stampAndLedger`).
 *   - BACKFILLED kind (`backfillEntry`): a human-authorized MIGRATION of a plan that
 *     crossed a gate BEFORE the ledger existed — a human-kind record additionally
 *     stamped `backfilled: true` + `backfill_reason`, hashing the plan's CURRENT
 *     on-disk content. The gate ACCEPTS it (the human ordered the migration) but
 *     `entryKind` returns `'backfilled'`, never `'human'`, so an audit can always
 *     tell a migrated entry from a live human approval. Acceptance is not weakened;
 *     the classification is truthful.
 *   - PIPELINE kind (`writePipelineEntry`, `writeVisionArchiveEntry`): the automated
 *     pipeline advanced a plan (stale reconciliation; a decomposed vision archived to
 *     `done/`). It carries `advanced_by: 'pipeline'` and a MANDATORY non-empty
 *     `evidence` string; a write with no evidence is refused loudly.
 *     `human-gate-check.js` accepts a pipeline entry ONLY at `done/` (never at the
 *     pre-done gate `todo/`, which stays human-only).
 *
 * CANONICAL LOWERCASE SLUGS (R2-F). `slugFromPlanPath` lowercases and every
 * boundary (`ledgerPath`, and thus every read/write) canonicalizes its slug to
 * lowercase BEFORE the `SLUG_RE` path-safety test — so a legacy mixed-case plan
 * (e.g. `CU1-Foo.md`) keys to `cu1-foo.json` consistently on both the write side
 * (`stampAndLedger`/`backfillEntry`) and the residency-sweep read side. `SLUG_RE`
 * itself is UNCHANGED: lowercasing never loosens the traversal guard (a `/`, `..`,
 * drive letter, or any non-`[a-z0-9-]` character is still rejected). Two plans
 * whose basenames differ only by case would collide on the canonical key; the
 * write path detects an existing entry recorded for a DIFFERENT original basename
 * and fails loudly rather than silently overwriting.
 */

const crypto = require('crypto');
const path = require('path');
const safeFs = require('./safe-fs');
// The ONE gate-edge encoding (R6-B). `sourceOf(to)` returns the gate SOURCE stage for
// a destination — the destination→source inverse of gate-order's forward `GATE_EDGES`
// — so a backfilled entry's `stage_from` (see `backfillEntry`) derives from that single
// encoding and can never diverge. gate-order is a pure constant module (zero requires)
// — no require cycle, no cost, side-effect-free on the Bash-hook path.
const { sourceOf } = require('./gate-order');

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
  // Canonicalize to lowercase at the boundary BEFORE the path-safety test, so a
  // legacy mixed-case slug keys consistently. SLUG_RE is unchanged: lowercasing
  // cannot introduce a `/`, `..`, or any other traversal character, so the guard
  // stays exactly as tight (`../../etc/passwd` still fails).
  const key = typeof slug === 'string' ? slug.toLowerCase() : slug;
  if (typeof key !== 'string' || !SLUG_RE.test(key)) {
    throw new Error('Invalid slug');
  }
  return path.join(ledgerDir(projectPath), `${key}.json`);
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
  // Canonical lowercase (R2-F): the ledger key for a plan is ALWAYS lowercase, so
  // a legacy mixed-case basename (e.g. `CU1-Foo.md`) keys to `cu1-foo`. The
  // original-cased basename is recovered separately (via `path.basename`) where a
  // human-readable form or a collision check needs it.
  return path.basename(planPath).replace(/\.md$/i, '').toLowerCase();
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
 * The union of all fields either entry kind may carry. Every field is optional
 * at the type level because the required-field enforcement is a RUNTIME guard in
 * {@link persistEntry} (which validates against `REQUIRED_FIELDS` before any
 * write) — the type only describes the accepted shape, not the contract.
 *
 * @typedef {object} LedgerEntryInput
 * @property {string} [content_sha256]
 * @property {string} [stage_from]
 * @property {string} [stage_to]
 * @property {string} [approved_at]
 * @property {string} [approved_by]
 * @property {string} [evidence]
 * @property {boolean} [backfilled]
 * @property {string} [backfill_reason]
 * @property {string} [plan_basename]
 */

/**
 * Record an approval entry for a plan. Creates the ledger directory if needed
 * and writes `{ content_sha256, stage_from, stage_to, approved_at, approved_by }`
 * as pretty-printed JSON to {@link ledgerPath}. `approved_at` defaults to the
 * current ISO timestamp when the caller omits it.
 *
 * @param {string} slug - the plan slug
 * @param {LedgerEntryInput} entry - the entry fields (required fields
 *   `content_sha256`, `stage_from`, `stage_to` are enforced at runtime); may
 *   also carry the optional R2-F provenance fields `backfilled`,
 *   `backfill_reason`, and `plan_basename`
 * @param {string} projectPath - the project root
 * @returns {object} the entry object as written
 * @throws {Error} `Invalid slug` for an unsafe slug; a descriptive error naming
 *   the first missing required field (`content_sha256`, `stage_from`, or
 *   `stage_to`). The guards run BEFORE any filesystem write, so a rejected
 *   write never leaves a partial file behind.
 */
function writeEntry(slug, entry, projectPath) {
  const src = /** @type {LedgerEntryInput} */ (entry || {});
  const record = {
    content_sha256: src.content_sha256,
    stage_from: src.stage_from,
    stage_to: src.stage_to,
    approved_at: src.approved_at || new Date().toISOString(),
    approved_by: src.approved_by !== undefined ? src.approved_by : 'human',
  };
  // Optional legacy-migration provenance (R2-F): a backfilled human-kind entry.
  if (src.backfilled !== undefined) record.backfilled = src.backfilled;
  if (src.backfill_reason !== undefined) record.backfill_reason = src.backfill_reason;
  // Optional original-cased basename, used for the case-collision guard.
  if (src.plan_basename !== undefined) record.plan_basename = src.plan_basename;
  return persistEntry(slug, record, projectPath);
}

/**
 * Record a PIPELINE-kind entry: the automated pipeline (not a human) advanced the
 * plan. Requires the human-kind required fields PLUS a non-empty `evidence`
 * string (e.g. `'stale-reconciliation'` or a verify-artifact path). Stamps
 * `advanced_by: 'pipeline'` and does NOT set `approved_by: human` — so
 * `entryKind` classifies it as `pipeline` and `human-gate-check.js` accepts it
 * only at `done/`, never at the human-only `todo/` gate.
 *
 * @param {string} slug - the plan slug
 * @param {LedgerEntryInput} entry - the entry fields; required fields
 *   `content_sha256`, `stage_from`, `stage_to`, and a non-empty `evidence`
 *   string are enforced at runtime
 * @param {string} projectPath - the project root
 * @returns {object} the entry object as written
 * @throws {Error} `Invalid slug`; a missing-required-field error; or a
 *   `pipeline entry requires non-empty "evidence"` error — all BEFORE any write.
 */
function writePipelineEntry(slug, entry, projectPath) {
  const src = /** @type {LedgerEntryInput} */ (entry || {});
  if (typeof src.evidence !== 'string' || src.evidence.trim() === '') {
    throw new Error('approval-ledger: pipeline entry requires non-empty "evidence"');
  }
  const record = {
    content_sha256: src.content_sha256,
    stage_from: src.stage_from,
    stage_to: src.stage_to,
    approved_at: src.approved_at || new Date().toISOString(),
    advanced_by: 'pipeline',
    evidence: src.evidence,
  };
  // R3-A: the case-collision guard is available on the pipeline path too — a vision
  // archive and a code plan whose basenames differ only by case must never silently
  // overwrite each other's provenance.
  if (src.plan_basename !== undefined) record.plan_basename = src.plan_basename;
  return persistEntry(slug, record, projectPath);
}

/**
 * Ledger a DECOMPOSED VISION archived to `plans/done/` as a PIPELINE-kind entry
 * (R3-A item 3). A vision crossed Gate 0 in `vision/`, never the review→done code
 * gate, and carries no approval marker — which is why `human-gate-check.js` used to
 * EXEMPT `type: vision` plans from the residency sweep. That exemption was a hole:
 * `plans/**.md` is Edit-whitelisted, so any agent could squat `done/` with a single
 * `type: vision` frontmatter line and no provenance at all. The exemption is gone;
 * `done/` residency is now UNIFORMLY ledger-driven, and a vision archive earns its
 * residency with this entry — `advanced_by: 'pipeline'`, `evidence:
 * 'vision-decomposed'`, `stage_from: 'vision'`, `stage_to: 'done'` — hashing the
 * archive's CURRENT on-disk bytes (so a later edit to the archived vision invalidates
 * it exactly as it does for any other done/ resident).
 *
 * Callers: `src/scripts/ledger-backfill.js --vision` (the migration for archives that
 * predate this slice, and the sanctioned writer the menu points at). The live archive
 * path, `vision-decomposer.completeVision`, must call this immediately BEFORE its
 * `movePlan(visionPath, 'done')` — see the R3-A report; that file was out of this
 * slice's file scope.
 *
 * @param {string} projectPath - the project root
 * @param {string} planPath - path to the vision file (in `plans/done/`, or the source
 *   path whose CONTENT is about to be moved there byte-identically)
 * @returns {object} the entry object as written
 * @throws {Error} when the plan cannot be read, the slug is un-keyable, or the
 *   canonical key collides with a different original basename (loud, never silent).
 */
function writeVisionArchiveEntry(projectPath, planPath) {
  const content = safeFs.readFileSync(planPath, 'utf8');
  const slug = slugFromPlanPath(planPath);
  return writePipelineEntry(slug, {
    content_sha256: computeContentHash(content),
    stage_from: 'vision',
    stage_to: 'done',
    evidence: 'vision-decomposed',
    plan_basename: path.basename(planPath).replace(/\.md$/i, ''),
  }, projectPath);
}

/**
 * Shared write path for both entry kinds: validates the slug (traversal guard),
 * validates the REQUIRED_FIELDS, runs the case-collision guard, then commits the
 * record ATOMICALLY (temp sibling + rename, as in task-registry.save) so a crash
 * mid-write can never truncate a committed approval. The guards all run BEFORE any
 * filesystem write, so a rejected write never leaves a partial file, and a failed
 * commit unlinks its temp and rethrows — the prior entry survives byte-identical.
 *
 * Case-collision guard: if an entry already exists at the canonical key AND both
 * the existing and incoming records carry a `plan_basename`, a DIFFERENCE means
 * two distinct original files (differing only by case) map to the same key — a
 * silent overwrite would erase one plan's provenance, so this throws loudly.
 * Re-writing the SAME original basename (idempotent re-approval) is allowed.
 *
 * @param {string} slug
 * @param {object} record - a fully-built record (required fields already set)
 * @param {string} projectPath
 * @returns {object} the record as written
 */
function persistEntry(slug, record, projectPath) {
  const target = ledgerPath(slug, projectPath); // validates + canonicalizes the slug
  for (const field of REQUIRED_FIELDS) {
    if (record[field] === undefined || record[field] === null || record[field] === '') {
      throw new Error(`approval-ledger: missing required field "${field}"`);
    }
  }
  if (record.plan_basename !== undefined) {
    const existing = readEntry(slug, projectPath);
    if (existing && existing.plan_basename !== undefined &&
        existing.plan_basename !== record.plan_basename) {
      throw new Error(
        `approval-ledger: slug collision on canonical key "${slug.toLowerCase()}" — ` +
        `existing plan_basename "${existing.plan_basename}" vs incoming "${record.plan_basename}"; ` +
        `two plans differ only by case. Refusing to overwrite provenance.`,
      );
    }
  }
  safeFs.mkdirSync(ledgerDir(projectPath), { recursive: true });
  // ATOMIC COMMIT (temp sibling + rename), mirroring task-registry.save. The
  // ledger is the single source of approval truth: a bare in-place writeFileSync
  // truncates a COMMITTED entry if a crash lands between open and full write, so
  // every re-write (re-approval, backfill, vision archive, idempotent re-write)
  // would be destructive-in-place. Writing a temp then renaming makes the commit
  // atomic — a reader sees either the whole old file or the whole new file, never
  // a truncation. On any failure the temp is unlinked and the error rethrown, so
  // a failed commit leaves the pre-existing entry byte-identical and no litter.
  const tmp = `${target}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  try {
    safeFs.writeFileSync(tmp, JSON.stringify(record, null, 2));
    safeFs.renameSync(tmp, target);
  } catch (err) {
    try { safeFs.unlinkSync(tmp); } catch { /* temp may not exist */ }
    throw err;
  }
  return record;
}

/**
 * Classify a ledger entry's provenance kind — HONESTLY (R3-A item 5).
 *
 * `'backfilled'` is a THIRD kind, not a flavour of `'human'`: the gate accepts it
 * (the human ordered the migration), but a migrated entry and a live human approval
 * are different facts and an audit must be able to tell them apart. Acceptance is
 * unchanged; only the classification became truthful.
 *
 * @param {object|null} entry - a parsed ledger entry
 * @returns {('human'|'backfilled'|'pipeline'|null)} `pipeline` when
 *   `advanced_by === 'pipeline'`; `backfilled` when the entry carries
 *   `backfilled: true`; `human` for any other real entry; `null` for no entry.
 */
function entryKind(entry) {
  if (!entry || typeof entry !== 'object') return null;
  if (entry.advanced_by === 'pipeline') return 'pipeline';
  if (entry.backfilled === true) return 'backfilled';
  return 'human';
}

/**
 * Read a plan's ledger entry WITH a discriminated status, so a caller (the
 * residency sweep) can tell an un-keyable slug and a corrupt file apart from a
 * plain absence and flag each distinctly — instead of collapsing all three to
 * `null` the way `readEntry` does. NEVER throws.
 *
 * @param {string} slug - the plan slug
 * @param {string} projectPath - the project root
 * @returns {{status: ('unkeyable'|'absent'|'corrupt'|'ok'), entry: (object|null)}}
 */
function readEntryResult(slug, projectPath) {
  let target;
  try {
    target = ledgerPath(slug, projectPath);
  } catch {
    return { status: 'unkeyable', entry: null };
  }
  if (!safeFs.existsSync(target)) return { status: 'absent', entry: null };
  let raw;
  try {
    raw = safeFs.readFileSync(target, 'utf8');
  } catch {
    // The file exists (existsSync passed) but cannot be read: treat as corrupt,
    // never as absent — flagging is the fail-SAFE direction.
    return { status: 'corrupt', entry: null };
  }
  try {
    return { status: 'ok', entry: JSON.parse(raw) };
  } catch {
    return { status: 'corrupt', entry: null };
  }
}

/**
 * Ledger an EXISTING plan file (R2-F backfill helper). Hashes the plan's CURRENT
 * on-disk content and writes a human-kind entry stamped `backfilled: true` +
 * `backfill_reason`, keyed to the canonical lowercase slug and carrying the
 * original-cased basename for the collision guard. This is the ONLY sanctioned
 * way to ledger a plan that crossed a human gate before the ledger existed.
 *
 * R3-A CORRECTION: it is driven by the checked-in, argv-driven
 * `src/scripts/ledger-backfill.js` — NOT by `node -e`, which the Bash hook now
 * DENIES (an inline eval referencing this module is exactly the forgery the deny
 * closes; the old "integrator drives it via node -e" instruction was the hole).
 * The entry it writes classifies as `'backfilled'`, never `'human'`.
 *
 * @param {string} projectPath - the project root
 * @param {string} planPath - absolute path to the existing plan file
 * @param {{stage_to?: string, reason?: string}} [opts] - destination stage the
 *   plan resides in, and the human-readable backfill reason (`stage_to` is
 *   required and enforced at runtime)
 * @returns {object} the entry object as written
 * @throws {Error} if the plan file cannot be read, the slug is un-keyable, or the
 *   canonical key collides with a different original basename (loud, never silent).
 */
function backfillEntry(projectPath, planPath, opts = {}) {
  const { stage_to, reason } = opts;
  if (typeof stage_to !== 'string' || stage_to === '') {
    throw new Error('approval-ledger: backfillEntry requires opts.stage_to');
  }
  const content = safeFs.readFileSync(planPath, 'utf8');
  const slug = slugFromPlanPath(planPath);
  const originalBasename = path.basename(planPath).replace(/\.md$/i, '');
  return writeEntry(slug, {
    content_sha256: computeContentHash(content),
    // The gate SOURCE for this destination, from the ONE encoding (R6-B). A stage
    // that is not a gate destination has no source → fall back to the 'backfill'
    // marker so the required field is never left empty.
    stage_from: sourceOf(stage_to) || 'backfill',
    stage_to,
    approved_by: 'human',
    backfilled: true,
    backfill_reason: reason !== undefined ? reason : '',
    plan_basename: originalBasename,
  }, projectPath);
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
  writePipelineEntry,
  writeVisionArchiveEntry,
  entryKind,
  readEntry,
  readEntryResult,
  backfillEntry,
  verify,
  removeEntry,
};
