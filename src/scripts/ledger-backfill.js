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
 * REACHABILITY: referenced from `src/commands/menu.md` (an instruction-surface root
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

  It NEVER moves a plan and NEVER crosses a human gate.`;

/**
 * Parse argv into an options object. Flags only — no positional operands, no eval.
 * An unknown flag is an ERROR (never silently ignored: a typo'd migration flag that
 * quietly did nothing is exactly the kind of silent no-op this script exists to avoid).
 *
 * @param {string[]} argv - argument list (WITHOUT node/script)
 * @returns {{vision?: boolean, plan?: string, stage?: string, reason?: string,
 *            root?: string, dryRun?: boolean, help?: boolean, error?: string}}
 */
function parseArgs(argv) {
  const opts = {};
  const list = Array.isArray(argv) ? argv : [];
  for (let i = 0; i < list.length; i++) {
    const arg = String(list[i]);
    switch (arg) {
      case '--vision': opts.vision = true; break;
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

/**
 * The script's whole behavior, as a pure-ish function of argv (testable without a
 * subprocess). NEVER throws: every failure surfaces as `{ok:false, error}` so the
 * caller — and the CLI wrapper — can report it LOUDLY.
 *
 * @param {string[]} argv - arguments WITHOUT node/script
 * @param {string} [cwd] - default project root
 * @returns {{ok: boolean, ledgered: string[], skipped: Array<object>, error?: string, usage?: string, entry?: object}}
 */
function run(argv, cwd = process.cwd()) {
  const opts = parseArgs(argv);
  if (opts.error) return { ok: false, ledgered: [], skipped: [], error: opts.error };
  if (opts.help) return { ok: true, ledgered: [], skipped: [], usage: USAGE };

  const root = opts.root ? String(opts.root) : cwd;

  if (opts.vision && opts.plan) {
    return { ok: false, ledgered: [], skipped: [], error: '--vision and --plan are mutually exclusive' };
  }
  if (opts.vision) return backfillVisions(root, opts.dryRun === true);
  if (opts.plan) {
    if (!opts.stage) return { ok: false, ledgered: [], skipped: [], error: '--plan requires --stage' };
    return backfillOnePlan(root, { plan: String(opts.plan), stage: String(opts.stage), reason: opts.reason, dryRun: opts.dryRun === true });
  }
  return { ok: false, ledgered: [], skipped: [], error: `no mode selected\n\n${USAGE}` };
}

// Only `run` is exported: it is the single live entry (the CLI block below and the
// menu.md recipe both drive it, and the test drives it too). The internal helpers
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
  process.stdout.write(JSON.stringify({ ledgered: result.ledgered, skipped: result.skipped }, null, 2) + '\n');
  process.exit(0);
}
