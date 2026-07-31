'use strict';

/**
 * X9 — the PENDING-QUESTIONS SWEEPER: the validating promoter that lets the gate
 * critic persist its questions without the human waiting in the foreground.
 *
 * ── The quarantine model, and why the critic may write here and nowhere else ────
 * `agents/iron-loop/gate-critic.md` synthesizes the decision questions a human is
 * asked at a gate. It holds UNTRUSTED input: the plan's own text plus the payloads
 * of the three lens critics. Before this module existed, the only way its questions
 * could leave the subagent was its RETURN VALUE — which lands in the dispatching
 * session model's context, where a human then had to wait while the file was
 * hand-written. The persistence step was the one step the whole never-wait streaming
 * design exists to precompute, and it was the one step that still blocked a person.
 *
 * A subagent's `Write` tool writes a FILE; it cannot CALL a JavaScript function. So
 * "give the critic Write and point it at the live questions path" is not available
 * either: an unvalidated file at the live path would be read straight onto the
 * human's gate screen, which is exactly the capability the critic must not have.
 *
 * The shape that works is a quarantine directory plus a separate validating
 * promoter. The critic writes ONE path family —
 * `.ctoc/streaming/questions/pending/<sanitized-ref>.json` — which NO gate screen
 * reads. This module, running in a different process at menu render time, validates
 * each pending file and promotes it through
 * `streaming-precompute.writePlanQuestions`, which independently re-checks the full
 * Question/Option contract. The critic therefore gains no capability it did not
 * already have through its return value: it can PROPOSE questions; it can never
 * AUTHOR the file a human reads.
 *
 * ── The promoted path, and what a ref names ────────────────────────────────────
 * A `ref` is a plan reference of the form `stage/file.md`, naming the plan file at
 * `plans/<stage>/<file>.md` inside the project root. On promotion the questions land
 * at `.ctoc/streaming/questions/<sanitized-ref>.json` — written only ever by
 * `writePlanQuestions`, never by this module directly and never by the critic.
 *
 * ── This module writes ONLY under `.ctoc/` ─────────────────────────────────────
 * Its three writes are: the promotion (via `writePlanQuestions`, into
 * `.ctoc/streaming/questions/`), the deletion of the consumed quarantine file under
 * `.ctoc/streaming/questions/pending/`, and an append to
 * `.ctoc/logs/streaming-sweeper.jsonl`. It NEVER writes a counted plan, vision, or
 * inbox `*.md` file — no plan-stage, vision, or inbox count can change as a result
 * of a sweep, so there is no memoized count to invalidate. (This is the fact the
 * `tests/cache-freshness.test.js` whitelist entry for this file cites.)
 *
 * ── Every failure path is fail-soft ───────────────────────────────────────────
 * Neither exported operation ever throws. `promotePendingFile` returns
 * `{ok:false, reason}` with a reason drawn from a CLOSED SET of literals;
 * `sweepPendingQuestions` returns a report. An absent quarantine directory is the
 * NORMAL case and reports nothing at all. This matters because the single live call
 * site is inside `streaming-gate.nextUnansweredQuestion`, on the render path: a
 * sweeper defect must degrade the human's screen to the plain Approve question, never
 * break it.
 *
 * ── Who reads the discard log ─────────────────────────────────────────────────
 * `.ctoc/logs/streaming-sweeper.jsonl` is read by a HUMAN debugging "the critic ran
 * but no question ever appeared for my plan". Each line is `{ts, file, reason}` where
 * `file` is a BASENAME and `reason` is one of the closed-set literals below. No
 * payload-derived string is ever placed in the log, the report, or a rendered screen:
 * content authored by an agent holding untrusted input does not travel outward.
 */

const path = require('path');
const safeFs = require('./safe-fs');
const precompute = require('./streaming-precompute');

/** The quarantine directory's name inside `.ctoc/streaming/questions/`. */
const PENDING_DIRNAME = 'pending';

/**
 * A single pending file larger than this is discarded without being parsed. A gate
 * question set is a few kilobytes; half a megabyte is already an attack or a bug.
 */
const MAX_PENDING_BYTES = 512 * 1024;

/**
 * A flooded quarantine directory can never stall a render. Files beyond this count
 * are left for the next sweep and reported as `deferred` — never silently dropped.
 */
const MAX_FILES_PER_SWEEP = 50;

/** The discard log is truncated (not rotated) once it exceeds this size. */
const MAX_LOG_BYTES = 256 * 1024;

/**
 * The quarantine directory for `root`.
 *
 * @param {*} root project root
 * @returns {string|null} null when `root` is not a usable non-empty string
 */
function pendingDir(root) {
  if (typeof root !== 'string' || root.length === 0) return null;
  return path.join(root, '.ctoc', 'streaming', 'questions', PENDING_DIRNAME);
}

/**
 * Validate and promote ONE quarantine file into the live questions store.
 *
 * NEVER throws, and NEVER unlinks: deletion belongs to the caller, so the decision
 * to delete stays testable in isolation from the decision to promote.
 *
 * The validation ladder stops at the first failure, in this exact order:
 *   1. must be a regular file (a symlink or directory is refused, never followed)
 *   2. size within MAX_PENDING_BYTES
 *   3. readable
 *   4. parseable JSON
 *   5. a non-array object
 *   6. `ref` is a non-empty string
 *   7. the FILENAME↔REF BINDING: `pendingQuestionsPath(root, payload.ref)` must
 *      resolve to this very file. This is the traversal and confusion guard — a
 *      pending file can only ever promote to the questions file its own name
 *      already implies.
 *   8. the ref resolves to a plan path
 *   9. that plan file exists (its CURRENT mtime is captured here)
 *  10. SUPERSESSION: a payload whose own `planMtimeMs` is strictly older than the
 *      plan's current mtime is refused — promoting it would stamp a critique written
 *      against an older revision as fresh and hide that from the human. A missing or
 *      non-finite `planMtimeMs` is NOT a failure (plan decision D-3).
 *  11. `writePlanQuestions` re-validates the full Question/Option contract.
 *
 * THE FRESHNESS STAMP IS THE SWEEPER'S, NEVER THE PAYLOAD'S. Step 11 passes the
 * `currentMtimeMs` read at step 9. A file stamped with anything else reads
 * permanently stale and the human is served the bare Approve screen forever.
 *
 * @param {string} root project root
 * @param {string} absFile absolute path of the quarantine file
 * @returns {{ok: true, ref: string} | {ok: false, reason: string, errors?: string[]}}
 */
function promotePendingFile(root, absFile) {
  // 1. A regular file, and nothing else. lstat does not follow a symlink.
  let st;
  try {
    st = safeFs.lstatSync(absFile);
  } catch {
    return { ok: false, reason: 'not-a-regular-file' };
  }
  if (!st.isFile()) return { ok: false, reason: 'not-a-regular-file' };

  // 2. Size cap — checked before any read, so an oversize file is never loaded.
  if (st.size > MAX_PENDING_BYTES) return { ok: false, reason: 'oversize' };

  // 3. Readable.
  let raw;
  try {
    raw = safeFs.readFileSync(absFile, 'utf8');
  } catch {
    return { ok: false, reason: 'unreadable' };
  }

  // 4. Parseable JSON.
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    return { ok: false, reason: 'unparseable' };
  }

  // 5. A plain object. Fields are read one by one below — never merged, never
  //    spread into a shared object, so no prototype pollution path exists.
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { ok: false, reason: 'wrong-shape' };
  }

  // 6. A usable ref.
  const ref = payload.ref;
  if (typeof ref !== 'string' || ref.length === 0) return { ok: false, reason: 'missing-ref' };

  // 7. The filename↔ref binding.
  const expected = precompute.pendingQuestionsPath(root, ref);
  if (expected === null || path.resolve(expected) !== path.resolve(absFile)) {
    return { ok: false, reason: 'ref-filename-mismatch' };
  }

  // 8. The ref must resolve to a plan path inside plans/.
  const planPath = precompute.refToPlanPath(root, ref);
  if (planPath === null) return { ok: false, reason: 'unknown-plan' };

  // 9. The plan must exist; its CURRENT mtime is the stamp we will write.
  let currentMtimeMs;
  try {
    currentMtimeMs = safeFs.statSync(planPath).mtimeMs;
  } catch {
    return { ok: false, reason: 'plan-gone' };
  }

  // 10. Supersession — never launder a stale critique as fresh.
  const stamped = payload.planMtimeMs;
  if (typeof stamped === 'number' && Number.isFinite(stamped) && stamped < currentMtimeMs) {
    return { ok: false, reason: 'superseded' };
  }

  // 11. The real writer re-validates the whole contract independently.
  // The `=== true` test (rather than a bare truthiness check) is what lets the
  // discriminated-union return type narrow under `tsc --checkJs`.
  //
  // AUDIT-ONLY attestation pass-through (plan 00183): forward the quarantined
  // object's `attestation` as the fifth argument so the critique fleet's
  // machine-consumable "we ran, and in what state" RECORD rides through into the
  // live store, where the sufficiency auditor and the Doctor screen read it via
  // `planQuestionsStatus.attested` / `.attestation`. This carries a RECORD; it does
  // NOT change any crossing behaviour and does NOT gate an empty list.
  //
  // The sweeper VALIDATES nothing about it and FABRICATES nothing: `writePlanQuestions`
  // is the single validation authority (`validateAttestation`), so a second check
  // here would be two rules about one field waiting to disagree, and synthesising a
  // missing block would forge the very evidence this record exists to require. An
  // absent `attestation` is `undefined` and passes straight through — the writer then
  // leaves the file byte-identical to a four-argument call, so the record reads
  // honestly NOT-ATTESTED rather than clean.
  const written = precompute.writePlanQuestions(
    root, ref, payload.questions, currentMtimeMs, payload.attestation,
  );
  if (written.ok === true) return { ok: true, ref };
  return { ok: false, reason: 'invalid-questions', errors: written.errors };
}

/**
 * Append one discard record to `.ctoc/logs/streaming-sweeper.jsonl`. Best-effort:
 * a logging failure is never a sweep failure, and never propagates.
 *
 * @param {string} root project root
 * @param {string} file the quarantine file's BASENAME (never a full path)
 * @param {string} reason a closed-set reason literal (never payload-derived text)
 * @returns {void}
 */
function logDiscard(root, file, reason) {
  try {
    const dir = path.join(root, '.ctoc', 'logs');
    const logPath = path.join(dir, 'streaming-sweeper.jsonl');
    if (!safeFs.existsSync(dir)) safeFs.mkdirSync(dir, { recursive: true });
    try {
      if (safeFs.existsSync(logPath) && safeFs.statSync(logPath).size > MAX_LOG_BYTES) {
        safeFs.writeFileSync(logPath, '');
      }
    } catch { /* a stat/truncate failure must not stop the record being written */ }
    safeFs.appendFileSync(logPath, `${JSON.stringify({ ts: new Date().toISOString(), file, reason })}\n`);
  } catch { /* best-effort: logging never fails a sweep */ }
}

/**
 * Sweep the quarantine directory: promote every valid pending file into the live
 * questions store, discard everything else, and consume both.
 *
 * A rejected file is DELETED as surely as a promoted one (plan decision D-4):
 * leaving it behind would make every later render re-read, re-reject and re-log the
 * same file forever. The discard log preserves the fact; the fleet regenerates the
 * critique from `plansNeedingQuestions`.
 *
 * Directory and symlink entries are reported as discarded but are NEVER unlinked —
 * this module does not delete through a link it did not create.
 *
 * NEVER throws. An absent quarantine directory is the normal case: the empty report,
 * with no error.
 *
 * @param {*} root project root
 * @returns {{promoted: string[], discarded: Array<{file: string, reason: string}>,
 *   deferred: number, errors: string[]}} `promoted` holds refs; `discarded` and the
 *   log hold BASENAMES and closed-set reasons only — no payload text travels out.
 */
function sweepPendingQuestions(root) {
  /** @type {{promoted: string[], discarded: Array<{file: string, reason: string}>, deferred: number, errors: string[]}} */
  const report = { promoted: [], discarded: [], deferred: 0, errors: [] };

  const dir = pendingDir(root);
  if (dir === null) return report;
  try {
    if (!safeFs.existsSync(dir)) return report;
  } catch {
    return report;
  }

  let entries;
  try {
    entries = safeFs.readdirSync(dir, { withFileTypes: true });
  } catch (err) {
    report.errors.push((err && err.message) || String(err));
    return report;
  }

  // Non-file entries are refused up front (and never unlinked); non-JSON files are
  // simply not ours and are left entirely alone.
  const candidates = [];
  for (const entry of entries) {
    if (!entry.isFile()) {
      report.discarded.push({ file: entry.name, reason: 'not-a-regular-file' });
      logDiscard(root, entry.name, 'not-a-regular-file');
      continue;
    }
    if (!entry.name.endsWith('.json')) continue;
    candidates.push(entry.name);
  }

  // Deterministic across platforms, so a capped sweep processes the same prefix
  // everywhere.
  candidates.sort((a, b) => a.localeCompare(b));
  if (candidates.length > MAX_FILES_PER_SWEEP) {
    report.deferred = candidates.length - MAX_FILES_PER_SWEEP;
    candidates.length = MAX_FILES_PER_SWEEP;
  }

  for (const name of candidates) {
    const absFile = path.join(dir, name);
    const result = promotePendingFile(root, absFile);
    // `=== true` narrows the discriminated union for `tsc --checkJs`.
    if (result.ok === true) {
      report.promoted.push(result.ref);
    } else {
      report.discarded.push({ file: name, reason: result.reason });
      logDiscard(root, name, result.reason);
    }
    // Consumed either way — a quarantine file is never re-processed.
    try {
      safeFs.unlinkSync(absFile);
    } catch (err) {
      report.errors.push((err && err.message) || String(err));
    }
  }

  return report;
}

module.exports = {
  PENDING_DIRNAME,
  MAX_PENDING_BYTES,
  MAX_FILES_PER_SWEEP,
  MAX_LOG_BYTES,
  pendingDir,
  promotePendingFile,
  sweepPendingQuestions,
};
