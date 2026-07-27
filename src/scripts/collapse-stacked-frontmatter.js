#!/usr/bin/env node
'use strict';

/**
 * CTOC one-time migration — collapse stacked approval-marker frontmatter blocks.
 *
 * WHY THIS FILE EXISTS. Before the write path was fixed, every human-gate crossing
 * PREPENDED a fresh `---…---` block, so plans that crossed 2-4 gates accumulated
 * 2-4 stacked leading blocks. That hides the plan's own `title`/`type`/`files:`/
 * `depends_on` from the shared primitive `frontmatter.parseFrontmatter` (which
 * reads only the FIRST block). The write path now MERGES the marker into one block,
 * which makes new stacking impossible; this script repairs the plans already
 * corrupted, collapsing each to a single block that keeps the most-recent marker
 * AND all of the plan's own fields (`frontmatter-merge.mergeStackedFrontmatter`).
 *
 * REACHABILITY: declared in `.ctoc/reachability-roots.json` — a checked-in,
 * reviewable, argv-driven migration script a human runs by hand, exactly like
 * `src/scripts/ledger-backfill.js`. It parses `process.argv` only; it evaluates
 * nothing it is given.
 *
 * THE LEDGER-HASH SAFETY GUARD. It REFUSES to touch any plan resident in a
 * hash-swept folder (`todo/` or `done/` — `approval-residency.HASH_SENSITIVE_FOLDERS`).
 * Those folders' ledger entries bind to the plan's EXACT bytes; rewriting a plan
 * there without also rewriting its ledger entry would desync the stored hash and
 * the next residency sweep would revert a legitimately-approved plan as an apparent
 * forgery. The already-corrupted plans this migration targets all reside in
 * `review/`, which is NOT hash-swept, so no ledger update is required — but the
 * guard is explicit so the script can never be pointed at a hash-swept plan.
 *
 * IT DOES NOT CROSS A HUMAN GATE. It never moves a plan and never imports
 * `approvePlan`; it rewrites the frontmatter LAYOUT of a plan that stays exactly
 * where it resides. Every marker VALUE and every plan field VALUE is preserved.
 *
 * Usage:
 *   node src/scripts/collapse-stacked-frontmatter.js            # migrate plans/review/*.md
 *   node src/scripts/collapse-stacked-frontmatter.js <file>...  # migrate the named plan files
 */

const path = require('path');
const safeFs = require('../lib/safe-fs');
const { mergeStackedFrontmatter } = require('../lib/frontmatter-merge');
const { HASH_SENSITIVE_FOLDERS } = require('../lib/approval-residency');
const { findProjectRoot } = require('../lib/project-root');

/**
 * Commit `data` to `target` atomically (temp sibling + rename), so a crash
 * mid-write never truncates the only copy of a plan. Mirrors
 * `actions.atomicWriteFileSync`.
 * @param {string} target
 * @param {string} data
 */
function atomicWriteFileSync(target, data) {
  const tmp = `${target}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  try {
    safeFs.writeFileSync(tmp, data);
    safeFs.renameSync(tmp, target);
  } catch (err) {
    // Best-effort temp cleanup, then rethrow the REAL write error. A failed cleanup
    // is recorded on the thrown error (not swallowed silently) so the caller sees a
    // leftover temp file was left behind — the original write failure is the verdict.
    try { safeFs.unlinkSync(tmp); } catch (cleanupErr) { err.tempCleanupFailed = cleanupErr.message; }
    throw err;
  }
}

/**
 * The stage folder a plan resides in, from `plans/<stage>/<file>.md`.
 * @param {string} planPath
 * @returns {string} the stage folder name (the parent directory's basename)
 */
function residentStage(planPath) {
  return path.basename(path.dirname(planPath));
}

/**
 * Migrate ONE plan file: collapse its stacked leading frontmatter blocks into one.
 *
 * REFUSES (migrated:false) a plan resident in a hash-swept folder (`todo`/`done`),
 * leaving it byte-identical, because collapsing it without also rewriting its
 * ledger content-hash would trip the residency sweep's forgery check. A plan with
 * nothing to collapse returns `{ migrated:true, changed:false }` and is left
 * untouched.
 *
 * @param {string} planPath absolute path to the plan file
 * @param {string} [projectPath] project root (currently unused by the collapse,
 *   accepted so callers pass it uniformly and a future ledger-aware migration can
 *   use it without a signature change)
 * @returns {{ migrated: boolean, changed?: boolean, reason?: string }}
 */
function migrateFile(planPath, projectPath) {
  void projectPath; // reserved: a hash-swept migration would need the ledger here
  const stage = residentStage(planPath);
  if (HASH_SENSITIVE_FOLDERS.has(stage)) {
    return {
      migrated: false,
      reason:
        `refused: "${path.basename(planPath)}" is resident in the hash-swept folder ` +
        `"${stage}" — collapsing its frontmatter without rewriting its ledger content-hash ` +
        `would make the next residency sweep revert it as an apparent forgery. ` +
        `Only ${'`review`'}/pre-gate plans are safe to migrate here.`,
    };
  }

  let content;
  try {
    content = safeFs.readFileSync(planPath, 'utf8');
  } catch (err) {
    return { migrated: false, reason: `unreadable: ${err && err.message}` };
  }

  const { changed, content: collapsed } = mergeStackedFrontmatter(content);
  if (!changed) {
    return { migrated: true, changed: false };
  }
  atomicWriteFileSync(planPath, collapsed);
  return { migrated: true, changed: true };
}

/**
 * Migrate a set of plan files (default: every `*.md` in `plans/review/`).
 * Prints a per-file report and never throws on a single bad file.
 *
 * @param {string[]} argv `process.argv.slice(2)` — explicit file paths, or empty
 * @param {string} [projectPath] project root
 * @returns {{ migrated: string[], unchanged: string[], refused: Array<{file:string,reason:string}> }}
 */
function main(argv, projectPath) {
  const root = projectPath || findProjectRoot();
  let targets = Array.isArray(argv) ? argv.filter((a) => typeof a === 'string' && a.length > 0) : [];
  if (targets.length === 0) {
    const reviewDir = path.join(root, 'plans', 'review');
    let entries = [];
    try {
      entries = safeFs.readdirSync(reviewDir);
    } catch { entries = []; }
    targets = entries
      .filter((f) => f.endsWith('.md'))
      .map((f) => path.join(reviewDir, f));
  } else {
    targets = targets.map((f) => path.resolve(f));
  }

  const migrated = [];
  const unchanged = [];
  const refused = [];
  for (const file of targets) {
    const res = migrateFile(file, root);
    if (!res.migrated) {
      refused.push({ file, reason: res.reason });
      console.error(`  refused  ${path.basename(file)} — ${res.reason}`);
    } else if (res.changed) {
      migrated.push(file);
      console.log(`  collapsed ${path.basename(file)}`);
    } else {
      unchanged.push(file);
    }
  }
  console.log(
    `collapse-stacked-frontmatter: ${migrated.length} collapsed, ` +
    `${unchanged.length} already clean, ${refused.length} refused.`,
  );
  return { migrated, unchanged, refused };
}

if (require.main === module) {
  main(process.argv.slice(2));
}

module.exports = { migrateFile, main };
