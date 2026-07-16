#!/usr/bin/env node
'use strict';
/**
 * Human Gate Checker - Pre-tool hook
 * Runs before EVERY tool call to detect human gate violations.
 *
 * Human gates (destination folder ← source folder for revert):
 *   functional → implementation
 *   implementation → todo
 *   review → done
 *
 * Acceptance provenance (finding C4). A plan resident in a gate-destination
 * folder is accepted as human-approved ONLY when the content-hashed approval
 * ledger at `.ctoc/approvals/<slug>.json` vouches for it — NEVER by parsing the
 * `approved_by: human` marker out of the plan's own frontmatter, which any agent
 * can write with an ordinary tool call. The ledger directory is agent-write-
 * denied at the enforcement layer, so it is a provenance source an agent cannot
 * forge. Acceptance is folder-sensitive, and this is FORCED by C4: because the
 * ledger is agent-write-denied, an agent that legitimately edits a plan in
 * `implementation/` cannot refresh the hash, so acceptance there binds to the
 * FACT of the Gate-1 crossing (a ledger entry whose `stage_to === 'implementation'`
 * exists) rather than a frozen hash; the tamper-sensitive terminal folders
 * `todo/` and `done/`, where no legitimate agent editing occurs, additionally
 * require a live-content hash match (invalidate-on-edit).
 *
 * SIP1 exemption (finding H7). A freshly-authored SIP1 slice sits in
 * `implementation/` carrying `parent_plan`, was never moved across a gate, and
 * was never meant to carry an approval marker — so it has no ledger entry. It is
 * exempt from the residency revert in `implementation/` only. The exemption is
 * NOT a blanket bypass: a plan lacking `parent_plan` (or one that already has a
 * ledger entry) is still evaluated normally, and the exemption can never be
 * triggered from `todo/` or `done/`.
 *
 * Fault-isolated revert (finding C5). The revert of each violation is wrapped in
 * its OWN try/catch (`revertAll`): a throw from one revert is recorded in a
 * returned `failures[]` and the loop CONTINUES to the next violation, so one
 * filesystem error can never abandon the revert of every other outstanding
 * violation (including a Gate 3 violation). When any revert fails the sweep
 * records an INCOMPLETE outcome rather than a silent clean pass.
 *
 * Migration open-decision (flagged for the maintainer, not silently resolved):
 * plans approved before the ledger existed have no ledger entry, so on first run
 * the strict `todo`/`done` rule would flag them. This module does NOT auto-
 * backfill (the ledger is trusted-write-only) and does NOT grandfather the
 * forgeable in-plan marker (that would reopen C4). The recommended path is a
 * one-time TRUSTED maintainer-run backfill converting each legacy in-plan marker
 * into a ledger entry at adoption — run through the sanctioned, checked-in
 * `node src/scripts/ledger-backfill.js` (R3-A; the old "`node -e` at the wave
 * boundary" instruction is now DENIED by the Bash hook, because that one-liner
 * shape WAS the forgery) — a scheduling call for the maintainer.
 *
 * PER-PLAN FAULT ISOLATION (R2-F). Historically a single legacy uppercase-slug
 * plan in `done/` made `ledger.verify` throw `Invalid slug`, which propagated out
 * of `checkFolder`, was swallowed by `main()`'s outer catch, and exited 0 — so
 * the hook enforced NOTHING. Now every per-plan classification is wrapped: an
 * un-keyable slug or a corrupt ledger entry flags ONLY that plan (with reason
 * `ledger-unkeyable` / `ledger-corrupt`) and the sweep CONTINUES. The fail-SAFE
 * direction is toward FLAGGING — an unreadable provenance is never accepted, and
 * a silent exit 0 (how the hook died) is eliminated: the outer catch keeps
 * fail-open ONLY for genuine infrastructure errors (e.g. the filesystem down) and
 * MUST log WHICH error it swallowed to the gate-violations log.
 *
 * THREE ENTRY KINDS (R2-F, extended by R3-A). `done/` residency is accepted for a
 * human-kind entry (`writeEntry`), a BACKFILLED entry (`backfillEntry` — the
 * human-ordered legacy migration; accepted, but `classifyResidency` reports its real
 * kind `'backfilled'` so an audit can never mistake it for a live human approval),
 * or a pipeline-kind entry (`writePipelineEntry`, `advanced_by: 'pipeline'`) that
 * carries `evidence`. The pre-done human gate `todo/` stays human-only and rejects a
 * pipeline entry.
 *
 * UNIFORM LEDGER ACCEPTANCE — THE VISION EXEMPTION IS GONE (R3-A item 3). This hook
 * used to EXEMPT any `done/` plan whose frontmatter said `type: vision`, on the
 * theory that a decomposed vision crossed Gate 0 and carries no approval marker. The
 * exemption was a forgery hole, not a nicety: `plans/**.md` is Edit-whitelisted, so
 * ANY agent could write `plans/done/anything.md` containing the single line
 * `type: vision` and squat the terminal folder with zero provenance — and the
 * predicate tested only `type: vision`, not the `status: decomposed` its own header
 * claimed. There is now NO exemption and NO special case: EVERY resident of a
 * gate-destination folder must be vouched for by the agent-write-denied ledger.
 * A legitimately decomposed vision earns its `done/` residency with a PIPELINE-kind
 * entry (`approval-ledger.writeVisionArchiveEntry`, `evidence: 'vision-decomposed'`),
 * written by the archiving code path; archives that predate this slice are migrated
 * by `node src/scripts/ledger-backfill.js --vision`.
 *
 * (`iron-loop-enforcer.js` still carries its OWN duplicate `type: vision` check — a
 * separate module, out of this slice's file scope. It is a DIFFERENT enforcement
 * surface, not this sweep's acceptance path; removing that duplicate is tracked as
 * the R3-A follow-up.)
 */

const path = require('path');

const safeFs = require('../lib/safe-fs');
const durableLog = require('../lib/durable-log');

const LOG_DIR = path.join(process.cwd(), '.ctoc', 'logs');
// The gate-violations store is an append-only JSONL file managed through the
// shared `durable-log` primitive (W11-s4), and is SHARED with the other writer
// `src/lib/violation-tracker.js` — both append via the identical JSONL format.
// `logViolation` is a single lossless O_APPEND (no read-modify-write, no lost
// updates under concurrency); a corrupt file is quarantined, never reset to `[]`.
const VIOLATIONS_FILE = path.join(LOG_DIR, 'gate-violations.json');

// Human gates: destination folder → source folder (for revert). Derived from the ONE
// gate-edge encoding in `gate-order.js` (`GATE_SOURCE` is the inverse of `GATE_EDGES`),
// so this revert map can never diverge from the canonical edges (R6-B). `gate-order`
// is a pure constant module (zero requires) — no require cycle, safe and fast on the
// hook path. The keys are the three gate destinations `implementation, todo, done`,
// in that order (Object.keys drives the folder sweep in `main()`), byte-identical to
// the former local literal.
const { GATE_SOURCE: HUMAN_GATES } = require('../lib/gate-order');

// Terminal gate-destination folders where no legitimate agent editing occurs, so
// acceptance additionally requires a live-content hash match (invalidate-on-edit).
const HASH_SENSITIVE_FOLDERS = new Set(['todo', 'done']);

function plansDir(projectPath) {
  return path.join(projectPath, 'plans');
}

function ensureDir(dir) {
  if (!safeFs.existsSync(dir)) {
    safeFs.mkdirSync(dir, { recursive: true });
  }
}

function loadViolations() {
  return durableLog.readEntries(VIOLATIONS_FILE);
}

function logViolation(entry) {
  // Lossless O_APPEND via the shared durable-log; the "keep last 100" cap is
  // preserved by the primitive's rotation (a rare atomic temp+rename boundary op).
  durableLog.appendEntry(VIOLATIONS_FILE, entry, { maxEntries: 100 });
}

/**
 * Read a plan's full file content, or `null` if it cannot be read. Fail-soft so
 * a transient read error is treated as "not approved / not exempt" (a violation)
 * rather than throwing out of the sweep.
 *
 * @param {string} filePath - absolute path to the plan file
 * @returns {string|null}
 */
function readPlan(filePath) {
  try {
    return safeFs.readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
}

/**
 * Classify a resident plan against the agent-write-denied ledger, per-plan fault-
 * isolated (R2-F). NEVER throws: an un-keyable slug or a corrupt entry returns a
 * NON-accepted result with the matching reason rather than propagating out and
 * killing the sweep. Folder-sensitive, and kind-sensitive:
 *   - `todo` / `done` (tamper-sensitive): the entry's `content_sha256` must match
 *     the live content (invalidate-on-edit);
 *   - `implementation` (active editing expected): acceptance binds to entry
 *     existence for this gate edge, NOT a frozen hash;
 *   - `done` accepts a human OR a pipeline (`advanced_by: 'pipeline'` + evidence)
 *     entry; every pre-done gate stays human-only.
 * Never trusts the plan-body `approved_by: human` marker.
 *
 * HONEST KIND (R3-A item 5). Every verdict — accepted or not — carries the entry's
 * REAL `kind` (`human` | `backfilled` | `pipeline` | `null`). A backfilled entry is
 * still ACCEPTED (the human ordered the migration): acceptance is not weakened. But
 * it is reported as `'backfilled'`, never laundered into `'human'`, so a later audit
 * can always separate a migrated record from a live human approval.
 *
 * @param {string} filePath - absolute path to the plan file
 * @param {string} folderName - the gate-destination folder the plan resides in
 * @param {string} [projectPath] - project root (defaults to cwd)
 * @param {string|null} [content] - pre-read file content, to avoid a re-read
 * @returns {{accepted: boolean, reason: (string|null), kind: ('human'|'backfilled'|'pipeline'|null)}}
 *   accepted (with the entry's real kind), or a reason: `ledger-unkeyable` |
 *   `ledger-corrupt` | `no-ledger-entry` | `wrong-edge` | `hash-mismatch` |
 *   `unreadable` | `pipeline-no-evidence` | `pipeline-not-allowed`
 */
function classifyResidency(filePath, folderName, projectPath = process.cwd(), content = null) {
  const ledger = require('../lib/approval-ledger');
  const slug = ledger.slugFromPlanPath(filePath);
  const res = ledger.readEntryResult(slug, projectPath);

  if (res.status === 'unkeyable') return { accepted: false, reason: 'ledger-unkeyable', kind: null };
  if (res.status === 'corrupt') return { accepted: false, reason: 'ledger-corrupt', kind: null };
  if (res.status === 'absent') return { accepted: false, reason: 'no-ledger-entry', kind: null };

  const entry = res.entry;
  const kind = ledger.entryKind(entry);
  if (entry.stage_to !== folderName) return { accepted: false, reason: 'wrong-edge', kind };

  if (HASH_SENSITIVE_FOLDERS.has(folderName)) {
    const text = content != null ? content : readPlan(filePath);
    if (text == null) return { accepted: false, reason: 'unreadable', kind };
    if (entry.content_sha256 !== ledger.computeContentHash(text)) {
      return { accepted: false, reason: 'hash-mismatch', kind };
    }
  }

  if (kind === 'pipeline') {
    // Pipeline provenance is accepted ONLY at the terminal `done/` gate, and only
    // with evidence; every pre-done gate (todo) stays human-only. A decomposed
    // vision archived to done/ arrives on exactly this path (evidence:
    // 'vision-decomposed') — there is no longer any `type: vision` exemption.
    if (folderName !== 'done') return { accepted: false, reason: 'pipeline-not-allowed', kind };
    if (typeof entry.evidence !== 'string' || entry.evidence.trim() === '') {
      return { accepted: false, reason: 'pipeline-no-evidence', kind };
    }
  }
  return { accepted: true, reason: null, kind };
}

/**
 * Boolean facade over {@link classifyResidency}, preserving the historical
 * `hasLedgerApproval` contract for any external caller.
 *
 * @param {string} filePath
 * @param {string} folderName
 * @param {string} [projectPath]
 * @param {string|null} [content]
 * @returns {boolean}
 */
function hasLedgerApproval(filePath, folderName, projectPath = process.cwd(), content = null) {
  return classifyResidency(filePath, folderName, projectPath, content).accepted;
}

/**
 * Is a plan a freshly-authored SIP1 slice exempt from the residency revert
 * (finding H7)? True iff ALL hold:
 *   - the plan is in `implementation/`;
 *   - its MERGED frontmatter region carries a non-empty `parent_plan` (read via
 *     `extractFrontmatterRegion` so a stamped plan's second block is still seen,
 *     exactly as `actions.js:listSubplans` does — independent of any
 *     `parseMetadata` fix);
 *   - it has NEVER appeared in the ledger (`readEntry === null`), the operational
 *     proxy for "never resided downstream / never crossed a gate".
 * The exemption cannot fire outside `implementation/`.
 *
 * @param {string} filePath - absolute path to the plan file
 * @param {string} folderName - the folder the plan resides in
 * @param {string} [projectPath] - project root (defaults to cwd)
 * @param {string|null} [content] - pre-read file content, to avoid a re-read
 * @returns {boolean} whether the plan is a fresh SIP1 slice
 */
function isFreshSip1Slice(filePath, folderName, projectPath = process.cwd(), content = null) {
  if (folderName !== 'implementation') return false;
  const text = content != null ? content : readPlan(filePath);
  if (text == null) return false;
  const { extractFrontmatterRegion } = require('../lib/stale-detector');
  const region = extractFrontmatterRegion(text);
  const m = region.match(/^\s*parent_plan\s*:\s*(.+?)\s*$/m);
  if (!m) return false;
  const parentPlan = m[1].replace(/^["']|["']$/g, '').trim();
  if (parentPlan === '') return false;
  const ledger = require('../lib/approval-ledger');
  // "Never appeared in the ledger" means a TRUE absence — an un-keyable or corrupt
  // entry must NOT be laundered into an exemption (fail SAFE toward evaluation).
  return ledger.readEntryResult(ledger.slugFromPlanPath(filePath), projectPath).status === 'absent';
}

/**
 * Collect residency violations in one gate-destination folder. A resident plan is
 * a violation iff it is NOT a fresh SIP1 slice AND NOT ledger-approved into the
 * folder. Reads each file's content ONCE and reuses it across both predicates.
 *
 * @param {string} folderName - a gate-destination folder (`implementation`|`todo`|`done`)
 * @param {string} [projectPath] - project root (defaults to cwd)
 * @returns {Array<{file:string, path:string, folder:string, revertTo:string, reason:(string|null)}>}
 */
function checkFolder(folderName, projectPath = process.cwd()) {
  const folderPath = path.join(plansDir(projectPath), folderName);
  if (!safeFs.existsSync(folderPath)) return [];

  const violations = [];
  const files = safeFs.readdirSync(folderPath).filter(f => f.endsWith('.md'));

  for (const file of files) {
    const filePath = path.join(folderPath, file);
    const content = readPlan(filePath); // one read per file per sweep
    if (isFreshSip1Slice(filePath, folderName, projectPath, content)) continue;
    // R3-A: NO vision exemption. `done/` residency is uniformly ledger-driven — a
    // decomposed vision is accepted only on its PIPELINE-kind ledger entry
    // (evidence: 'vision-decomposed'), exactly like every other resident. The old
    // `type: vision` bypass let any agent squat done/ with one frontmatter line.
    const verdict = classifyResidency(filePath, folderName, projectPath, content);
    if (verdict.accepted) continue;
    violations.push({
      file,
      path: filePath,
      folder: folderName,
      revertTo: HUMAN_GATES[folderName],
      reason: verdict.reason,
    });
  }

  return violations;
}

/**
 * Revert one violating plan to its source folder, appending a violation note.
 * The plans directory is derived from the violation's OWN path (its grandparent
 * directory), so a revert is correct regardless of the process working directory
 * — required for isolated testing and for any non-cwd project root.
 *
 * @param {{path:string, folder:string, revertTo:string}} violation
 * @returns {string} the destination path the plan was reverted to
 */
function revertPlan(violation) {
  const plans = path.dirname(path.dirname(violation.path));
  const destDir = path.join(plans, violation.revertTo);
  const destPath = path.join(destDir, path.basename(violation.path));

  // Destination-collision guard (mirrors actions.movePlan:92-97). This hand-rolled
  // move bypasses movePlan's own guard, so without this check a same-basename plan
  // reverted from a downstream folder (e.g. an unapproved todo/foo.md → implementation)
  // would OVERWRITE a DIFFERENT legitimate implementation/foo.md and unlink the source
  // — destroying real in-flight work while reporting a clean reverted:1. Refuse loudly
  // instead: the throw is captured in revertAll's per-violation failures[], turning a
  // silent clobber into a surfaced INCOMPLETE outcome. A self-path revert (dest === the
  // plan's own file) is exempt — it is a legitimate in-place rewrite, destroys nothing.
  const sameAsSource = path.resolve(destPath) === path.resolve(violation.path);
  if (safeFs.existsSync(destPath) && !sameAsSource) {
    throw new Error(
      `refusing to revert onto existing ${violation.revertTo}/${path.basename(violation.path)} ` +
      `(would destroy a resident plan)`
    );
  }

  // Read content and add violation note
  let content = safeFs.readFileSync(violation.path, 'utf8');
  const note = `\n\n---\n**⚠️ HUMAN GATE VIOLATION**\nThis plan was moved to ${violation.folder}/ without human approval.\nAutomatically reverted to ${violation.revertTo}/ at ${new Date().toISOString()}\n---\n`;
  content += note;

  // Move file
  ensureDir(destDir);
  safeFs.writeFileSync(destPath, content);
  // Skip the unlink on a self-path revert: writeFileSync already rewrote the plan in
  // place, so unlinking violation.path would delete the very file we just wrote.
  if (!sameAsSource) safeFs.unlinkSync(violation.path);

  return destPath;
}

/**
 * Revert every violation, isolating each in its OWN try/catch (finding C5). A
 * throw from one revert is captured in `failures[]` and the loop continues, so a
 * single filesystem error can never abandon the remaining reverts. The caller
 * treats a non-empty `failures[]` as an INCOMPLETE outcome (never a clean pass).
 *
 * @param {Array<object>} violations
 * @param {{revertPlan?: (v:object)=>string}} [deps] - injectable revert (defaults
 *   to the real {@link revertPlan}); the injection point exists so a throwing
 *   revert can be exercised with the REAL move for the surviving violations.
 * @returns {{reverted: Array<{violation:object, dest:string}>, failures: Array<{violation:object, error:string}>}}
 */
function revertAll(violations, deps = {}) {
  const revert = (deps && deps.revertPlan) || revertPlan;
  const reverted = [];
  const failures = [];
  for (const v of violations) {
    try {
      const dest = revert(v);
      reverted.push({ violation: v, dest });
    } catch (err) {
      failures.push({ violation: v, error: err && err.message ? err.message : String(err) });
    }
  }
  return { reverted, failures };
}

function main() {
  const projectPath = process.cwd();
  try {
    // Check all human gate destinations
    const allViolations = [];

    for (const folder of Object.keys(HUMAN_GATES)) {
      allViolations.push(...checkFolder(folder, projectPath));
    }

    if (allViolations.length > 0) {
      console.error('\n⛔ HUMAN GATE VIOLATION DETECTED\n');

      for (const v of allViolations) {
        console.error(`  Plan: ${v.file}`);
        console.error(`  Location: ${v.folder}/`);
        console.error(`  Issue: No ledger-verified human approval (${v.reason || 'no-ledger-entry'})`);
      }

      // Fault-isolated revert (C5): one throw never abandons the rest.
      const { reverted, failures } = revertAll(allViolations);

      for (const r of reverted) {
        const v = r.violation;
        logViolation({
          id: `v-${Date.now()}`,
          timestamp: new Date().toISOString(),
          plan: v.file,
          violation: `Moved to ${v.folder}/ without approval`,
          action: `REVERTED to ${v.revertTo}/`,
          status: 'pending_reapproval',
          resolvedAt: null
        });
        console.error(`  Action: REVERTED ${v.file} to ${v.revertTo}/`);
      }

      if (failures.length > 0) {
        // Do NOT report a clean pass while a violation stands: record each failed
        // revert as an unresolved, incomplete outcome.
        for (const f of failures) {
          const v = f.violation;
          logViolation({
            id: `v-${Date.now()}`,
            timestamp: new Date().toISOString(),
            plan: v.file,
            violation: `Moved to ${v.folder}/ without approval`,
            action: `REVERT FAILED (${f.error})`,
            status: 'revert_failed',
            resolvedAt: null
          });
          console.error(`  ⚠️ REVERT FAILED for ${v.file}: ${f.error} — violation UNRESOLVED`);
        }
        console.error(`⚠️  Revert sweep INCOMPLETE: ${failures.length} violation(s) remain unresolved.\n`);
      }

      console.error('⚠️  Plans must be approved by human via menu to cross human gates\n');
    }
  } catch (err) {
    // Fail open ONLY for genuine infrastructure errors (e.g. the filesystem down):
    // per-plan faults (un-keyable slug, corrupt entry) are already isolated inside
    // checkFolder and can never reach here. A silent exit 0 is how this hook died
    // unnoticed, so the swallowed error is ALWAYS logged to the durable gate-
    // violations store — never merely printed and forgotten.
    const message = err && err.message ? err.message : String(err);
    console.error(`Warning: Gate check infrastructure error (fail-open): ${message}`);
    try {
      logViolation({
        id: `v-${Date.now()}`,
        timestamp: new Date().toISOString(),
        plan: null,
        violation: `Gate sweep infrastructure error: ${message}`,
        action: 'FAIL-OPEN (sweep did not complete)',
        status: 'sweep_error',
        resolvedAt: null,
      });
    } catch { /* durable-log itself is down; the console.error above still stands */ }
  }

  // Exit 0 to allow tool call to proceed (fail-open on the tool call itself).
  process.exit(0);
}

module.exports = {
  HUMAN_GATES,
  hasLedgerApproval,
  classifyResidency,
  isFreshSip1Slice,
  checkFolder,
  revertPlan,
  revertAll,
  loadViolations,
  logViolation,
  main
};

// Direct invocation only: importing this module (from a sibling or a test) must
// never run the residency sweep or call process.exit. Guarded exactly as
// PreToolUse.Edit.js guards its enforce() entry point.
if (require.main === module) {
  main();
}
