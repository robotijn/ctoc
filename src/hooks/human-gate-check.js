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
 * MIGRATION — RESOLVED (Z1). Plans approved before the ledger existed have no
 * ledger entry, so the strict rule classifies EVERY one of them `no-ledger-entry`.
 * Because this hook is registered under `PreToolUse` with matcher `"*"` and used to
 * call `revertAll` unconditionally, a user's FIRST tool call after a plugin update
 * would have moved and rewritten their entire plan archive — on every installed
 * project at once, un-recallable, since CTOC ships from the marketplace. It no
 * longer does. The sweep now REPORTS until the project is migrated:
 *
 *   | project state          | `no-ledger-entry`          | every other reason |
 *   |------------------------|----------------------------|--------------------|
 *   | unmigrated (no marker) | REPORT (file untouched)    | REVERT (unchanged) |
 *   | migrated (marker)      | REVERT (unchanged)         | REVERT (unchanged) |
 *
 * Migration is a POSITIVE RECORDED FACT — a marker written ONLY by the sanctioned
 * `node src/scripts/ledger-backfill.js --mark-migrated` into the agent-write-denied
 * `.ctoc/approvals/` directory, so an agent can neither forge it (arming a bulk
 * revert of a human's archive) nor delete it (disarming enforcement). A marker that
 * is absent, unreadable, corrupt, or not strictly `migrated === true` means
 * UNMIGRATED: fail SAFE toward reporting, never fail open. After migration the
 * marker is what ARMS the revert — the project is known clean as of that moment, so
 * a NEW `no-ledger-entry` is a forgery, not a legacy resident.
 *
 * THIS IS NOT A GATE WEAKENING, on three independent legs (see
 * `src/lib/gate-migration.js` for the full argument, and the tests that PROVE it):
 *   1. Exactly ONE reason is withheld, `no-ledger-entry`. Every other reason —
 *      `hash-mismatch`, `wrong-edge`, `unknown-provenance`, `ledger-corrupt`,
 *      `ledger-unkeyable`, `pipeline-not-allowed`, `pipeline-no-evidence`,
 *      `sufficiency-not-allowed`, `sufficiency-no-evidence`, `unreadable` — means
 *      provenance EXISTS and is WRONG (a live attack signature) and still reverts on
 *      EVERY project, migrated or not. Enforcement is unchanged where provenance exists.
 *   2. `no-ledger-entry` is precisely and only the "provenance was never recorded"
 *      signature. Under that genuine ambiguity the fail-safe direction for a
 *      destructive, irreversible, BULK action is to report, not to move the archive.
 *   3. Detection is NEVER withheld: the violation is still computed, still printed,
 *      still durably logged, and additionally surfaced in the human's menu inbox
 *      (`inbox migration`) carrying the exact command that migrates the project.
 * The action withheld is a MIGRATION action on an UNMIGRATED project, not a gate.
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
// Z1: the migration guard. Requires only `path` + `safe-fs` — deliberately no
// ledger, settings, or YAML parsing on the every-tool-call hook path.
const gateMigration = require('../lib/gate-migration');

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

// THE ONE ENCODING OF APPROVED RESIDENCY, now in `lib/` (see
// `src/lib/approval-residency.js` for the full argument). It was MOVED, not copied:
// `src/lib/plan-coverage.js` — the oracle that decides whether an edit is permitted
// at all — must consult the same predicate, and a library may not require a hook.
// Writing a second predicate there would be two encodings of an approval predicate,
// which this codebase names a forgery surface. This hook's behaviour is unchanged;
// `classifyResidency` and `hasLedgerApproval` are re-exported below under their
// existing names so every existing call site keeps working.
const approvalResidency = require('../lib/approval-residency');
const { classifyResidency, hasLedgerApproval, readPlan } = approvalResidency;

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
 * Is a plan a freshly-authored SIP1 slice exempt from the residency revert
 * (finding H7)? True iff ALL hold:
 *   - the plan is in `implementation/`;
 *   - its MERGED frontmatter region carries a non-empty `parent_plan` (read via
 *     `extractFrontmatterRegion` so a stamped plan's second block is still seen,
 *     exactly as `actions.js:listSubplans` does — independent of any
 *     `parseMetadata` fix);
 *   - it has NEVER appeared in the ledger (`readEntry === null`), the operational
 *     proxy for "never resided downstream / never crossed a gate";
 *   - its `parent_plan` resolves to a parent that would ITSELF be ACCEPTED as a
 *     legitimate resident of `implementation/` by `approval-residency.classifyResidency`
 *     — the SAME single predicate the residency sweep applies to a normal resident. That
 *     accepts a human, backfilled, or sufficiency crossing INTO `implementation/` and
 *     rejects a pipeline entry (valid only at `done/`), an unknown provenance, a
 *     wrong-edge entry, and a missing / corrupt / un-keyable one. A bare
 *     `readEntryResult(...).status === 'ok'` — "has ANY entry" — was NOT that claim: it
 *     was the last place in this codebase where "has a ledger entry" stood in for "has
 *     THIS approval", and it DIVERGED from the kind- and edge-sensitive predicate the
 *     sweep actually uses. Without this leg the exemption was a Gate-1 residency HOLE:
 *     because `plans/**.md` is Edit-whitelisted, an agent could Write
 *     `plans/implementation/x.md` carrying a lone `parent_plan:` line pointing at any
 *     ledgered parent and squat the Gate-1 destination. A dangling / unapproved /
 *     nonexistent parent is NOT a valid provenance root, so the slice is NOT exempt
 *     (fail toward flagging).
 *
 *     The parent's CONTENT HASH is deliberately NOT checked: `implementation` is not a
 *     `HASH_SENSITIVE_FOLDER`, and a plan legitimately edited in `implementation/` cannot
 *     refresh its own hash (the ledger is agent-write-denied). Delegating to
 *     `classifyResidency` preserves that rule through the one encoding; do not "complete"
 *     the check by adding a hash comparison here.
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
  if (ledger.readEntryResult(ledger.slugFromPlanPath(filePath), projectPath).status !== 'absent') {
    return false;
  }
  // The parent is a valid provenance root iff classifyResidency — THE single
  // encoding the sweep uses for a normal resident — would accept it as a legitimate
  // resident of implementation/, i.e. it genuinely crossed Gate 1 into implementation/.
  // classifyResidency derives the parent slug internally (slugFromPlanPath — robust to a
  // bare slug, a `<slug>.md`, or a path value), so the normalization is preserved.
  // Accepts a human / backfilled / sufficiency crossing into implementation/; rejects a
  // pipeline entry (valid only at done/), an unknown provenance, a wrong-edge entry, and
  // a missing / corrupt / un-keyable one. No content-hash check, because implementation
  // is not a HASH_SENSITIVE_FOLDER — the deliberate no-hash rule (a plan legitimately
  // edited in implementation/ cannot refresh its own hash), preserved through the one
  // encoding. A bare `readEntryResult(...).status === 'ok'` — "has ANY entry" — was NOT
  // that claim, and diverged from this predicate: the last place "has a ledger entry"
  // stood in for "has THIS approval". classifyResidency never throws.
  return classifyResidency(parentPlan, 'implementation', projectPath).accepted;
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

    // Z1: withhold the DESTRUCTIVE bulk revert on a project whose approval
    // provenance was never recorded. Detection above is untouched; only the
    // `no-ledger-entry` revert is deferred until the project is migrated.
    const migrated = gateMigration.isMigrated(projectPath);
    const { revert: toRevert, withheld } =
      gateMigration.partitionViolations(allViolations, migrated);

    // The notice is a SNAPSHOT rewritten on every sweep (compare-then-write, so it
    // writes zero bytes in the steady state), which means it self-clears the moment
    // the project is migrated or the residents are ledgered.
    const noticeChanged = gateMigration.writePendingNotice(projectPath, withheld);

    if (allViolations.length > 0) {
      console.error('\n⛔ HUMAN GATE VIOLATION DETECTED\n');

      const withheldSet = new Set(withheld);
      for (const v of allViolations) {
        console.error(`  Plan: ${v.file}`);
        console.error(`  Location: ${v.folder}/`);
        console.error(`  Issue: No ledger-verified human approval (${v.reason || 'no-ledger-entry'})`);
        console.error(withheldSet.has(v)
          ? `  Disposition: REPORTED (project not migrated to the approval ledger — plan left untouched)`
          : `  Disposition: reverting to ${v.revertTo}/`);
      }

      // Fault-isolated revert (C5): one throw never abandons the rest.
      const { reverted, failures } = revertAll(toRevert);

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

      if (withheld.length > 0) {
        console.error(
          `\n⚠️  ${withheld.length} plan(s) REPORTED, NOT reverted: this project's approval\n` +
          `    provenance was never recorded in the ledger, so CTOC will not move your plan\n` +
          `    archive. Enforcement is fully active for every other violation kind.\n` +
          `    Review them:  /ctoc:start → inbox migration\n` +
          `    Migrate:      ${gateMigration.MIGRATION_COMMAND}\n`);
        // The hook fires on EVERY tool call and logViolation APPENDS, so the withheld
        // set is recorded only when it actually CHANGED. That is the difference
        // between one durable entry per real change and one per keystroke.
        if (noticeChanged) {
          for (const v of withheld) {
            logViolation({
              id: `v-${Date.now()}`,
              timestamp: new Date().toISOString(),
              plan: v.file,
              violation: `Resident in ${v.folder}/ with no ledger entry`,
              action: 'REPORTED (project not migrated to the approval ledger)',
              status: 'migration_pending',
              resolvedAt: null,
            });
          }
        }
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
