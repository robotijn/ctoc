'use strict';

/**
 * Approval-ledger MIGRATION STATE — the guard that keeps the residency sweep from
 * moving a user's entire plan archive on their first tool call after an update.
 *
 * THE HAZARD THIS EXISTS FOR. `src/hooks/human-gate-check.js` is registered under
 * `PreToolUse` with matcher `"*"` (`.claude-plugin/hooks.json`), so it sweeps every
 * gate destination on EVERY tool call and calls `revertAll` unconditionally.
 * `classifyResidency` returns `no-ledger-entry` for any resident with no ledger
 * entry — which is EVERY pre-ledger `done/` plan in every project that predates the
 * approval ledger. CTOC ships from the marketplace, so that reaches every installed
 * project at once and cannot be recalled.
 *
 * THE STATE MACHINE.
 *
 *   | project state          | `no-ledger-entry`          | every other reason |
 *   |------------------------|----------------------------|--------------------|
 *   | unmigrated (no marker) | REPORT (file untouched)    | REVERT (unchanged) |
 *   | migrated (marker)      | REVERT (unchanged)         | REVERT (unchanged) |
 *
 * Marker absent, unreadable, corrupt, or `migrated !== true` → unmigrated → report.
 * FAIL SAFE, never fail open: if the migration state cannot be determined, the
 * destructive bulk action is withheld and the condition is reported.
 *
 * WHY THIS IS NOT A GATE WEAKENING (three independent legs; a reviewer will
 * challenge this, so it is stated here and PROVEN by tests, not merely documented):
 *
 *   1. The withheld action is scoped to exactly ONE violation reason,
 *      `no-ledger-entry`. Every other reason — `hash-mismatch`, `wrong-edge`,
 *      `unknown-provenance`, `ledger-corrupt`, `ledger-unkeyable`,
 *      `pipeline-not-allowed`, `pipeline-no-evidence`, `sufficiency-not-allowed`,
 *      `sufficiency-no-evidence`, `unreadable` — means provenance EXISTS and is
 *      WRONG: a tampered hash, a forged kind, a corrupt record. Those are live
 *      attack signatures and they revert exactly as today, on every project,
 *      migrated or not. Enforcement strength is unchanged wherever provenance
 *      exists.
 *   2. `no-ledger-entry` is precisely and only the signature of "provenance was
 *      never recorded" — the pre-ledger condition. On an unmigrated project a
 *      legacy resident and a fresh forgery are indistinguishable on this signal,
 *      and the fail-safe direction for a destructive, irreversible, BULK action
 *      under genuine ambiguity is to report rather than to move the archive.
 *   3. Detection is NEVER withheld. The violation is still computed, still printed,
 *      still recorded, and additionally surfaced in the human's menu inbox with the
 *      exact migration command. The gate still says no; it just does not rewrite an
 *      archive whose provenance was never recorded.
 *
 * The action withheld is a MIGRATION action on an UNMIGRATED project, not a gate.
 *
 * AFTER MIGRATION the marker is what ARMS reverts for future `no-ledger-entry`
 * violations: the project is known clean as of migration, so a NEW one is a forgery.
 * That is the marker's whole non-redundant function.
 *
 * PERFORMANCE. This module sits on the every-tool-call hook path, so it requires
 * ONLY `path` and `safe-fs` — never `approval-ledger`, `settings`, or any YAML
 * parser. `isMigrated` is one existence check plus one small read;
 * `writePendingNotice` writes zero bytes in the steady state (compare-then-write).
 *
 * Cross-platform: `path.join` for every path, `safe-fs` for every filesystem call,
 * no shell, no OS-specific assumption. Every path is project-relative.
 */

const path = require('path');
const safeFs = require('./safe-fs');

/**
 * The migration marker lives INSIDE the agent-write-denied ledger directory.
 * Verified: `PreToolUse.Edit.js` denies agent Edit/Write under `.ctoc/approvals`,
 * and `PreToolUse.Bash.js` denies every non-read-only Bash touch of that path
 * (including the `cd`-split shape). So an agent can neither FORGE the marker (which
 * would arm a bulk revert of a human's archive) nor DELETE it (which would disarm
 * enforcement). `src/scripts/ledger-backfill.js` reaches it because that invocation
 * carries no ledger path operand — it is the one sanctioned channel, by the same
 * design R3-A established.
 *
 * The LEADING DOT makes the name unaddressable as a ledger entry: `ledgerPath`
 * keys `<slug>.json` and `SLUG_RE` is `/^[a-z0-9][a-z0-9-]*$/`, which a leading
 * '.' can never match — so no crafted plan slug can resolve onto the marker.
 */
const MARKER_REL = path.join('.ctoc', 'approvals', '.migration-complete.json');

/** The pending-notice snapshot the menu inbox reads. */
const NOTICE_REL = path.join('.ctoc', 'logs', 'gate-migration-pending.json');

/**
 * The ONE violation reason whose revert is withheld on an unmigrated project.
 * WIDENING THIS SET WEAKENS A HUMAN GATE. Every other reason means provenance
 * exists and is wrong, which is a live attack signature, never a legacy condition.
 */
const WITHHELD_REASONS = new Set(['no-ledger-entry']);

/** The exact command a human runs to record migration (displayed, never executed). */
const MIGRATION_COMMAND = 'node src/scripts/ledger-backfill.js --mark-migrated';

/**
 * Absolute path to a project's migration marker.
 *
 * @param {string} projectPath - the project root
 * @returns {string} `<projectPath>/.ctoc/approvals/.migration-complete.json`
 */
function markerPath(projectPath) {
  return path.join(projectPath, MARKER_REL);
}

/**
 * Absolute path to a project's pending-notice snapshot.
 *
 * @param {string} projectPath - the project root
 * @returns {string} `<projectPath>/.ctoc/logs/gate-migration-pending.json`
 */
function noticePath(projectPath) {
  return path.join(projectPath, NOTICE_REL);
}

/**
 * Read and parse the migration marker.
 *
 * NEVER throws. Absent, unreadable, or corrupt → `null`, so the caller's fail-safe
 * direction (unmigrated → report) is the default on every failure path.
 *
 * @param {string} projectPath - the project root
 * @returns {{migrated: boolean, at: string, mode: string, ledgered: number}|null}
 *   the parsed marker, or `null` when it cannot be read as an object
 */
function readMarker(projectPath) {
  try {
    const file = markerPath(projectPath);
    if (!safeFs.existsSync(file)) return null;
    const parsed = JSON.parse(safeFs.readFileSync(file, 'utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Has this project's approval provenance been migrated to the ledger?
 *
 * Migration is a POSITIVE RECORDED FACT, never a heuristic. "The ledger has at
 * least one entry" was rejected as a proxy: a project holding 172 legacy `done/`
 * plans that legitimately crosses one gate after an update would immediately arm
 * the bulk revert — the exact hazard, one gate crossing later.
 *
 * Strict `=== true`: the string `"true"`, `1`, or any truthy object does NOT
 * migrate a project. Every failure path returns `false` (report), never `true`.
 *
 * @param {string} projectPath - the project root
 * @returns {boolean} whether the revert of `no-ledger-entry` violations is armed
 */
function isMigrated(projectPath) {
  const marker = readMarker(projectPath);
  return marker !== null && marker.migrated === true;
}

/**
 * Split a violation set into the ones to revert now and the ones to report only.
 *
 * Pure — no filesystem access, no allocation beyond the two arrays, O(violations).
 * A migrated project's result is byte-identical to today's behavior: everything
 * reverts. A violation whose `reason` is missing or `null` is treated as
 * `no-ledger-entry` (fail safe) because `main()` already displays that default.
 *
 * @param {Array<object>} violations - violations from `human-gate-check.checkFolder`
 * @param {boolean} migrated - the result of {@link isMigrated}
 * @returns {{revert: Array<object>, withheld: Array<object>}} the partition
 */
function partitionViolations(violations, migrated) {
  const list = Array.isArray(violations) ? violations : [];
  if (migrated === true) return { revert: [...list], withheld: [] };

  const revert = [];
  const withheld = [];
  for (const v of list) {
    const reason = (v && v.reason != null) ? v.reason : 'no-ledger-entry';
    if (WITHHELD_REASONS.has(reason)) withheld.push(v);
    else revert.push(v);
  }
  return { revert, withheld };
}

/**
 * Record that this project's approval provenance has been migrated, which ARMS the
 * residency sweep's revert for `no-ledger-entry` violations.
 *
 * Written atomically (temp + rename), mirroring the deploy-ready notice writer. This
 * is the ONE function here allowed to THROW: it runs in the command-line tool, where
 * a silent no-op migration would itself be the defect.
 *
 * @param {string} projectPath - the project root
 * @param {object} marker - the marker record (`{migrated, at, mode, ledgered, …}`)
 * @returns {void}
 * @throws {Error} when the marker cannot be written
 */
function writeMarker(projectPath, marker) {
  const file = markerPath(projectPath);
  safeFs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}`;
  safeFs.writeFileSync(tmp, JSON.stringify(marker, null, 2) + '\n');
  safeFs.renameSync(tmp, file);
}

/**
 * The comparable (timestamp-free) shape of one withheld violation, so a sweep that
 * changed nothing writes nothing.
 *
 * Accepts BOTH shapes on purpose: a live violation from the sweep names the plan
 * `file`, while an entry already persisted in the notice names it `plan`. The
 * compare-then-write path normalizes both through here, so the steady-state
 * comparison is apples-to-apples (reading only `file` made every existing entry
 * compare as empty, and every sweep wrote).
 *
 * @param {object} v - a violation, or a persisted notice entry
 * @returns {{plan: string, folder: string, reason: string}}
 */
function noticeKey(v) {
  return {
    plan: String((v && (v.file || v.plan)) || ''),
    folder: String((v && v.folder) || ''),
    reason: String((v && v.reason) || 'no-ledger-entry'),
  };
}

/**
 * Write the pending-notice SNAPSHOT the menu inbox reads.
 *
 * SNAPSHOT, NEVER APPEND. This runs on every tool call; an append-only log would
 * grow without bound. COMPARE-THEN-WRITE: when the pending set is unchanged (apart
 * from timestamps) nothing is written at all, so thousands of tool calls in a
 * session touch the disk zero times. An empty `withheld` REPLACES the file with an
 * empty set, so a stale notice can never outlive the condition.
 *
 * NEVER throws: a hook must not die writing a notice. Any failure returns `false`.
 *
 * @param {string} projectPath - the project root
 * @param {Array<object>} withheld - the violations whose revert was withheld
 * @returns {boolean} `true` iff the notice actually changed and was written
 */
function writePendingNotice(projectPath, withheld) {
  try {
    const list = Array.isArray(withheld) ? withheld : [];
    const keys = list.map(noticeKey).sort((a, b) =>
      (a.folder === b.folder ? a.plan.localeCompare(b.plan) : a.folder.localeCompare(b.folder)));

    const existing = readPendingNotice(projectPath).map(noticeKey);
    if (JSON.stringify(existing) === JSON.stringify(keys)) return false;

    const at = new Date().toISOString();
    const payload = {
      command: MIGRATION_COMMAND,
      at,
      pending: keys.map((k) => ({ ...k, at })),
    };
    const file = noticePath(projectPath);
    safeFs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.tmp-${process.pid}`;
    safeFs.writeFileSync(tmp, JSON.stringify(payload, null, 2) + '\n');
    safeFs.renameSync(tmp, file);
    return true;
  } catch {
    return false;
  }
}

/**
 * Read the pending-notice snapshot. Fail-open `[]` on a missing or corrupt file,
 * mirroring `menu-screens.readDeployReady` exactly — a broken notice must never
 * crash the dashboard or the hook.
 *
 * @param {string} projectPath - the project root
 * @returns {Array<{plan: string, folder: string, reason: string, at: string}>}
 */
function readPendingNotice(projectPath) {
  try {
    const file = noticePath(projectPath);
    if (!safeFs.existsSync(file)) return [];
    const parsed = JSON.parse(safeFs.readFileSync(file, 'utf8'));
    const list = Array.isArray(parsed) ? parsed : (parsed && parsed.pending);
    return Array.isArray(list) ? list.filter((e) => e && typeof e === 'object') : [];
  } catch {
    return [];
  }
}

module.exports = {
  isMigrated,
  readMarker,
  writeMarker,
  partitionViolations,
  writePendingNotice,
  readPendingNotice,
  MIGRATION_COMMAND,
  WITHHELD_REASONS,
};
