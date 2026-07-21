#!/usr/bin/env node
'use strict';

/**
 * CTOC approval-ledger backfill — the ONE sanctioned ledger writer on the Bash
 * channel (R3-A item 2).
 *
 * WHY THIS FILE EXISTS. The ledger (`.ctoc/approvals/`) is CTOC's only source of
 * human-approval truth. Until R3-A the legacy migration was performed with an ad-hoc
 * `node -e "require('./src/lib/approval-ledger').backfillEntry(…)"` one-liner — and
 * that same one-liner shape was the FORGERY: `PreToolUse.Bash.js` allowed any command
 * starting with `node `, so an agent could mint a human-kind approval entry for any
 * plan and cross Gate 2 or Gate 3 by itself. The Bash hook now DENIES inline
 * evaluation that touches the ledger, which leaves exactly one legitimate migration
 * channel: this checked-in, reviewable, argv-driven script. It parses `process.argv`
 * ONLY — it contains no `eval`, no `new Function`, and evaluates nothing it is given.
 *
 * REACHABILITY: referenced from `src/commands/start.md` (an instruction-surface root
 * the reachability fence honors), which is where a human is told to run it.
 *
 * IT DOES NOT CROSS A HUMAN GATE. It never moves a plan file and never imports
 * `approvePlan`. It records provenance for a plan that ALREADY resides where it
 * resides — a migration, not an approval:
 *
 *   --vision                   ledger every un-ledgered `type: vision` archive in
 *                              plans/done/ as a PIPELINE-kind entry
 *                              (`evidence: vision-decomposed`). This is the R3-A item-3
 *                              migration: the `type: vision` gate exemption is gone, so
 *                              archives that predate the ledger need real provenance or
 *                              the residency sweep (correctly) flags them.
 *
 *   --plan <path> --stage <s>  ledger ONE existing plan as a BACKFILLED human-kind
 *     [--reason <text>]        entry (`backfilled: true` + `backfill_reason`) — the
 *                              2026-07-14 legacy migration for plans that crossed a
 *                              human gate before the ledger existed. `entryKind`
 *                              reports `'backfilled'`, never `'human'`, so the record
 *                              stays auditable.
 *
 *   --mark-migrated [--force]  record that this project's approval provenance has been
 *                              migrated. THIS ARMS the residency sweep's revert for
 *                              `no-ledger-entry` violations (Z1): until the marker
 *                              exists, `src/hooks/human-gate-check.js` REPORTS those
 *                              instead of moving the plan archive. Self-verifying — it
 *                              REFUSES while any un-ledgered resident remains, so the
 *                              marker can never be written prematurely and re-arm a
 *                              bulk revert over legacy plans. `--force` overrides that
 *                              refusal and is recorded in the marker as `mode: forced`.
 *

 * Common flags: `--root <dir>` (defaults to cwd), `--dry-run`, `--help`.
 * Exit status: 0 on success, 1 on any error — a failure is LOUD, never a silent
 * no-op (`run()` returns `{ok:false, error}` and the CLI prints it to stderr).
 *
 * Cross-platform: `path.join` throughout, `safe-fs` for every read, no shell.
 */

const path = require('path');
const safeFs = require('../lib/safe-fs');
const ledger = require('../lib/approval-ledger');

/** Max bytes of a plan file we will read while scanning (mirrors stale-detector). */
const MAX_PLAN_BYTES = 1 << 20; // 1 MiB

const USAGE = `ctoc ledger-backfill — record approval provenance for plans that predate the ledger

  node src/scripts/ledger-backfill.js --vision [--root <dir>] [--dry-run]
      Ledger every un-ledgered "type: vision" archive in plans/done/ as a
      pipeline-kind entry (evidence: vision-decomposed). Idempotent.

  node src/scripts/ledger-backfill.js --plan <path> --stage <implementation|todo|done>
                                      [--reason <text>] [--root <dir>] [--dry-run]
      Ledger ONE existing plan as a backfilled human-kind entry.

  node src/scripts/ledger-backfill.js --mark-migrated [--force] [--root <dir>] [--dry-run]
      Record that this project's approval provenance is migrated. This ARMS the
      residency sweep's revert for plans with no ledger entry — until then the
      sweep REPORTS them instead of moving your plan archive. Refuses while any
      un-ledgered resident remains; --force overrides and is recorded in the marker.

  It NEVER moves a plan and NEVER crosses a human gate.`;

/**
 * Parse argv into an options object. Flags only — no positional operands, no eval.
 * An unknown flag is an ERROR (never silently ignored: a typo'd migration flag that
 * quietly did nothing is exactly the kind of silent no-op this script exists to avoid).
 *
 * @param {string[]} argv - argument list (WITHOUT node/script)
 * @returns {{vision?: boolean, plan?: string, stage?: string, reason?: string,
 *            root?: string, dryRun?: boolean, help?: boolean, error?: string,
 *            markMigrated?: boolean, force?: boolean}}
 */
function parseArgs(argv) {
  const opts = {};
  const list = Array.isArray(argv) ? argv : [];
  for (let i = 0; i < list.length; i++) {
    const arg = String(list[i]);
    switch (arg) {
      case '--vision': opts.vision = true; break;
      case '--mark-migrated': opts.markMigrated = true; break;
      case '--force': opts.force = true; break;
      case '--dry-run': opts.dryRun = true; break;
      case '--help': case '-h': opts.help = true; break;
      case '--plan': opts.plan = list[++i]; break;
      case '--stage': opts.stage = list[++i]; break;
      case '--reason': opts.reason = list[++i]; break;
      case '--root': opts.root = list[++i]; break;
      default:
        return { error: `unknown argument "${arg}"\n\n${USAGE}` };
    }
  }
  return opts;
}

/** The frontmatter region of a plan (everything up to the end of the LAST leading `---` block). */
function frontmatterRegion(content) {
  const { extractFrontmatterRegion } = require('../lib/stale-detector');
  return extractFrontmatterRegion(content);
}

/**
 * Is this plan an archived decomposed vision? Matches `type: vision` in the merged
 * frontmatter region — the same predicate the (now-deleted) gate exemption used, so
 * the migration covers exactly the set the exemption used to wave through.
 *
 * @param {string} content
 * @returns {boolean}
 */
function isVisionPlan(content) {
  return /^type:\s*vision\b/m.test(frontmatterRegion(content));
}

/**
 * --vision: ledger every un-ledgered `type: vision` archive in plans/done/.
 *
 * @param {string} root - project root
 * @param {boolean} dryRun
 * @returns {{ok: boolean, ledgered: string[], skipped: Array<{plan: string, reason: string}>, error?: string}}
 */
function backfillVisions(root, dryRun) {
  const doneDir = path.join(root, 'plans', 'done');
  const ledgered = [];
  const skipped = [];
  if (!safeFs.existsSync(doneDir)) {
    return { ok: false, ledgered, skipped, error: `no plans/done/ under ${root}` };
  }
  const files = safeFs.readdirSync(doneDir).filter((f) => f.endsWith('.md')).sort();
  for (const file of files) {
    const planPath = path.join(doneDir, file);
    const slug = ledger.slugFromPlanPath(planPath);
    let stat;
    try { stat = safeFs.lstatSync(planPath); } catch { skipped.push({ plan: slug, reason: 'unreadable' }); continue; }
    if (!stat.isFile()) { skipped.push({ plan: slug, reason: 'not-a-regular-file' }); continue; }
    if (stat.size > MAX_PLAN_BYTES) { skipped.push({ plan: slug, reason: 'oversized' }); continue; }

    let content;
    try { content = safeFs.readFileSync(planPath, 'utf8'); } catch { skipped.push({ plan: slug, reason: 'unreadable' }); continue; }
    if (!isVisionPlan(content)) { skipped.push({ plan: slug, reason: 'not-a-vision' }); continue; }

    // Idempotent: an archive that already has provenance is left EXACTLY as it is
    // (re-writing would move approved_at and, for a hand-approved entry, overwrite a
    // human record with a pipeline one).
    if (ledger.readEntryResult(slug, root).status !== 'absent') {
      skipped.push({ plan: slug, reason: 'already-ledgered' });
      continue;
    }
    if (dryRun) { ledgered.push(slug); continue; }
    try {
      ledger.writeVisionArchiveEntry(root, planPath);
      ledgered.push(slug);
    } catch (err) {
      // A collision (two archives differing only by case) is LOUD — reported, never
      // silently overwritten — and the sweep continues over the remaining archives.
      skipped.push({ plan: slug, reason: err && err.message ? err.message : String(err) });
    }
  }
  return { ok: true, ledgered, skipped };
}

/**
 * --plan/--stage: ledger ONE existing plan as a backfilled human-kind entry.
 *
 * @param {string} root
 * @param {{plan: string, stage: string, reason?: string, dryRun?: boolean}} opts
 * @returns {{ok: boolean, ledgered: string[], skipped: Array<object>, entry?: object, error?: string}}
 */
function backfillOnePlan(root, opts) {
  const VALID_STAGES = ['implementation', 'todo', 'done'];
  if (!VALID_STAGES.includes(opts.stage)) {
    return { ok: false, ledgered: [], skipped: [], error: `--stage must be one of ${VALID_STAGES.join('|')} (got "${opts.stage}")` };
  }
  const planPath = path.isAbsolute(opts.plan) ? opts.plan : path.join(root, opts.plan);
  if (!safeFs.existsSync(planPath)) {
    return { ok: false, ledgered: [], skipped: [], error: `plan not found: ${planPath}` };
  }
  const slug = ledger.slugFromPlanPath(planPath);
  if (opts.dryRun) return { ok: true, ledgered: [slug], skipped: [] };
  try {
    const entry = ledger.backfillEntry(root, planPath, {
      stage_to: opts.stage,
      reason: opts.reason !== undefined ? opts.reason : '',
    });
    return { ok: true, ledgered: [slug], skipped: [], entry };
  } catch (err) {
    return { ok: false, ledgered: [], skipped: [], error: err && err.message ? err.message : String(err) };
  }
}

/** Gate-destination folders the residency sweep enumerates. */
const GATE_DESTINATION_FOLDERS = ['implementation', 'todo', 'done'];

/** How many plan entries the ledger currently holds (dot-files, e.g. the marker, excluded). */
function countLedgerEntries(root) {
  try {
    const dir = ledger.ledgerDir(root);
    if (!safeFs.existsSync(dir)) return 0;
    return safeFs.readdirSync(dir).filter((f) => f.endsWith('.json') && !f.startsWith('.')).length;
  } catch {
    return 0;
  }
}

/**
 * --mark-migrated: record that this project's approval provenance has been migrated,
 * which ARMS the residency sweep's revert for `no-ledger-entry` violations (Z1).
 *
 * SELF-VERIFYING. It runs the LIVE residency sweep first and refuses unless the
 * withheld set is empty, so the marker can never be written prematurely and re-arm a
 * bulk revert over legacy plans — the exact hazard Z1 exists to prevent, one command
 * later. `--force` overrides the refusal and is recorded in the marker as
 * `mode: 'forced'`, an explicit human-typed act that stays auditable.
 *
 * Requiring the hook here is safe: `human-gate-check.js` is guarded by
 * `require.main === module`, so importing it never runs the sweep or calls
 * `process.exit` — only its exported `checkFolder` is driven, read-only.
 *
 * @param {string} root - project root
 * @param {{force?: boolean, dryRun?: boolean}} opts
 * @returns {{ok: boolean, ledgered: string[], skipped: Array<object>, error?: string, marker?: object}}
 */
function markMigrated(root, opts) {
  const gate = require('../hooks/human-gate-check');
  const gateMigration = require('../lib/gate-migration');

  const pending = [];
  for (const folder of GATE_DESTINATION_FOLDERS) {
    let violations;
    try {
      violations = gate.checkFolder(folder, root);
    } catch (err) {
      // FAIL SAFE: if the sweep cannot be read, the marker is NOT written. Arming a
      // bulk revert on an undeterminable state is exactly the wrong direction.
      return {
        ok: false, ledgered: [], skipped: [],
        error: `cannot verify ${folder}/: ${err && err.message ? err.message : String(err)}`,
      };
    }
    for (const v of violations) {
      if (gateMigration.WITHHELD_REASONS.has(v.reason || 'no-ledger-entry')) {
        pending.push(`${folder}/${v.file}`);
      }
    }
  }

  if (pending.length > 0 && opts.force !== true) {
    const shown = pending.slice(0, 20).map((p) => `    ${p}`).join('\n');
    const more = pending.length > 20 ? `\n    … and ${pending.length - 20} more` : '';
    return {
      ok: false, ledgered: [], skipped: pending.map((plan) => ({ plan, reason: 'no-ledger-entry' })),
      error:
        `refusing to mark migrated: ${pending.length} plan(s) still have no ledger entry.\n` +
        `Marking now would ARM the residency sweep to revert every one of them.\n\n${shown}${more}\n\n` +
        `Either ledger each one:\n` +
        `    node src/scripts/ledger-backfill.js --plan plans/<stage>/<plan>.md --stage <stage> --reason "<why>"\n` +
        `or, if you accept that these plans will be reverted, re-run with --force.`,
    };
  }

  const marker = {
    migrated: true,
    at: new Date().toISOString(),
    mode: opts.force === true ? 'forced' : 'verified',
    ledgered: countLedgerEntries(root),
    pending_at_mark: pending.length,
  };
  if (opts.dryRun === true) return { ok: true, ledgered: [], skipped: [], marker };
  try {
    gateMigration.writeMarker(root, marker);
  } catch (err) {
    return { ok: false, ledgered: [], skipped: [], error: err && err.message ? err.message : String(err) };
  }
  return { ok: true, ledgered: [], skipped: [], marker };
}

/**
 * The script's whole behavior, as a pure-ish function of argv (testable without a
 * subprocess). NEVER throws: every failure surfaces as `{ok:false, error}` so the
 * caller — and the CLI wrapper — can report it LOUDLY.
 *
 * @param {string[]} argv - arguments WITHOUT node/script
 * @param {string} [cwd] - default project root
 * @returns {{ok: boolean, ledgered: string[], skipped: Array<object>, error?: string, usage?: string, entry?: object, marker?: object}}
 */
function run(argv, cwd = process.cwd()) {
  const opts = parseArgs(argv);
  if (opts.error) return { ok: false, ledgered: [], skipped: [], error: opts.error };
  if (opts.help) return { ok: true, ledgered: [], skipped: [], usage: USAGE };

  const root = opts.root ? String(opts.root) : cwd;

  // The three modes are mutually exclusive; --force is meaningful ONLY with
  // --mark-migrated (a silently-ignored --force would be exactly the kind of quiet
  // no-op this script exists to refuse).
  const modes = [opts.vision, opts.plan, opts.markMigrated].filter(Boolean).length;
  if (modes > 1) {
    return { ok: false, ledgered: [], skipped: [], error: '--vision, --plan and --mark-migrated are mutually exclusive' };
  }
  if (opts.force && !opts.markMigrated) {
    return { ok: false, ledgered: [], skipped: [], error: '--force is only meaningful with --mark-migrated' };
  }
  if (opts.markMigrated) {
    return markMigrated(root, { force: opts.force === true, dryRun: opts.dryRun === true });
  }
  if (opts.vision) return backfillVisions(root, opts.dryRun === true);
  if (opts.plan) {
    if (!opts.stage) return { ok: false, ledgered: [], skipped: [], error: '--plan requires --stage' };
    return backfillOnePlan(root, { plan: String(opts.plan), stage: String(opts.stage), reason: opts.reason, dryRun: opts.dryRun === true });
  }
  return { ok: false, ledgered: [], skipped: [], error: `no mode selected\n\n${USAGE}` };
}

// Only `run` is exported: it is the single live entry (the CLI block below and the
// start.md recipe both drive it, and the test drives it too). The internal helpers
// (parseArgs / backfillVisions / backfillOnePlan / isVisionPlan) are reached only
// THROUGH run(), so exporting them would be dead exports ("a test is not a caller").
module.exports = { run };

if (require.main === module) {
  const result = run(process.argv.slice(2));
  if (result.usage) {
    process.stdout.write(result.usage + '\n');
    process.exit(0);
  }
  if (!result.ok) {
    process.stderr.write(`ledger-backfill: ${result.error}\n`);
    process.exit(1);
  }
  const report = { ledgered: result.ledgered, skipped: result.skipped };
  if (result.marker) report.marker = result.marker;
  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  process.exit(0);
}
