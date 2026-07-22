#!/usr/bin/env node
'use strict';

/**
 * PI3 — PostToolUse hook: awaited (bounded) plan-index sync.
 *
 * When a Claude tool (Write/Edit/MultiEdit) writes a `plans/**\/*.md` file, this
 * hook runs `syncUnit` for JUST that plan so the semantic index reflects the change
 * within the same interaction. It AWAITS that single-unit sync before exiting — a
 * bare `process.exit(0)` would kill an un-awaited microtask before Node ran it, so
 * the earlier fire-and-forget form made the sync a silent no-op. It is BOUNDED and
 * FAIL-OPEN:
 *   • reads the hook stdin JSON (`{ tool_input: { file_path } }`);
 *   • no-ops for any non-`plans/**\/*.md` path (SY-11);
 *   • awaits the sync but races it against a finite `unref`'d timeout so a slow or
 *     hung embedder never blocks the tool flow; never throws to the user; ALWAYS
 *     exits 0 (SY-10);
 *   • logs any sync error or budget overrun to `.ctoc/logs/` (logged, not swallowed).
 *
 * It does NOT construct the store/embedder itself — PI0's composition root owns the
 * singleton wiring and supplies `{ store, embedder, calibrationReady }`. Until PI0
 * is integrated the wiring module is absent; the hook then exits 0 silently
 * (fail-open). The existing `PostToolUse.status-check.js` is NOT modified.
 *
 * Cross-platform: `path`-based matching, `fs.promises` via safe-fs, no shell.
 */

const path = require('path');
const safeFs = require('../lib/safe-fs');

/**
 * Resolve the sync log's destination for a project root — and NEVER manufacture it.
 * Returns `path.join(root, '.ctoc', 'logs')` ONLY when `.ctoc/` already exists;
 * otherwise `undefined`, which `sync-unit.js`'s `logNote` treats as "no destination"
 * (its `if (!logDir) return;` guard). This is slice 00177's rule at site two: a
 * best-effort log must not create the `.ctoc/` marker that gates setup. `sync-unit.js`
 * itself is unchanged — the seam it already exposes (a falsy `logDir`) is exactly the
 * one needed, so the guard lives here at the caller that decides the destination.
 *
 * @param {string} root - the plan's resolved project root
 * @returns {string|undefined} the `.ctoc/logs` path when `.ctoc/` exists, else undefined
 */
function resolveSyncLogDir(root) {
  if (!root || typeof root !== 'string') return undefined;
  const ctocDir = path.join(root, '.ctoc');
  return safeFs.existsSync(ctocDir) ? path.join(ctocDir, 'logs') : undefined;
}

/**
 * True iff `fp` is a Markdown file under a `plans/` directory (at any depth) and
 * does NOT escape the plans tree via `..`. Cross-platform: normalizes native
 * separators to POSIX before matching.
 *
 * @param {*} fp
 * @returns {boolean}
 */
function isPlanMd(fp) {
  if (typeof fp !== 'string' || fp.length === 0) return false;
  const posix = fp.split(path.sep).join('/').replace(/\\/g, '/');
  if (posix.includes('..')) return false;          // reject traversal
  if (!posix.endsWith('.md')) return false;
  // `plans/` at the start or after a `/` boundary.
  return /(^|\/)plans\/.+\.md$/.test(posix);
}

/**
 * Read the hook payload from stdin (best-effort). Resolves to a parsed object or {}.
 * @returns {Promise<object>}
 */
function readStdin() {
  return new Promise((resolve) => {
    let data = '';
    try {
      if (process.stdin.isTTY) { resolve({}); return; }
      process.stdin.setEncoding('utf8');
      process.stdin.on('data', (chunk) => { data += chunk; });
      process.stdin.on('end', () => {
        try { resolve(JSON.parse(data)); } catch { resolve({}); }
      });
      process.stdin.on('error', () => resolve({}));
      // Guard: if nothing arrives promptly, do not hang the tool flow.
      setTimeout(() => resolve(data ? safeParse(data) : {}), 50).unref?.();
    } catch {
      resolve({});
    }
  });
}

function safeParse(s) { try { return JSON.parse(s); } catch { return {}; } }

/**
 * Resolve the project root of the plan file being synced, so the wiring, the
 * `plansRoot`/`logDir`, and `syncUnit`'s key-normalization all anchor on ONE root.
 * Derived from the written plan's own project (climb from its directory) — NOT blindly
 * `process.cwd()`, which can differ from the plan's project on a symlinked checkout or
 * a multi-root session and would key syncUnit against a DIFFERENT store than getWiring
 * opened (the F1 dormancy bug). Fail-open: falls back to `process.cwd()`.
 * @param {string} planFilePath  Absolute (or relative) path to the written plan .md.
 * @returns {string}
 */
function resolveRootForPlan(planFilePath) {
  try {
    const { findProjectRoot } = require('../lib/project-root');
    const start = path.dirname(path.resolve(planFilePath));
    return findProjectRoot(start);
  } catch {
    return process.cwd();
  }
}

/**
 * Best-effort load of PI0's composition-root wiring. Returns
 * `{ store, embedder, calibrationReady }` or null if PI0 is not yet integrated.
 *
 * @param {string} [root] The plan's project root. Passed through so `getWiring` opens
 *   the store keyed IDENTICALLY to the root `syncUnit` normalizes its keys against
 *   (F1). getWiring realpath-canonicalizes it (F2) so a symlinked root and its
 *   realpath share ONE store. Omitted → getWiring falls back to its own resolution.
 * @returns {object|null}
 */
function loadWiring(root) {
  try {
    // PI0 owns this module; absent until PI0 integration lands (fail-open). The
    // require goes through an aliased binding so the static typechecker does not
    // treat the not-yet-existing PI0 seam as a missing-module error, while the
    // argument stays a string literal (no non-literal-require lint finding).
    const req = require;
    const wiring = req('../lib/plan-index/wiring');
    if (wiring && typeof wiring.getWiring === 'function') {
      const w = typeof root === 'string' && root.length > 0
        ? wiring.getWiring({ projectPath: root })
        : wiring.getWiring();
      if (w && w.store && typeof w.embedder === 'function') return w;
    }
  } catch {
    /* PI0 wiring not present — fail-open */
  }
  return null;
}

/**
 * Best-effort error log to `.ctoc/logs/plan-index-sync.json`. Never throws.
 *
 * This is the FOURTH of the four best-effort log producers slice 00177 identified
 * (the sync ERROR path; 00177 fixed the sync DESTINATION and the two on the Write
 * hook path). A best-effort diagnostic must NEVER manufacture the `.ctoc/` marker:
 * a fabricated `.ctoc/` is read by setup and by the private root resolvers as proof
 * a project exists, leaving it permanently half-initialised (a live user hit this).
 * So write only into a `.ctoc/` that ALREADY exists; create only the `logs/` leaf
 * beneath it, never the parent marker.
 *
 * The `process.cwd()` base is deliberately KEPT and made harmless by the existence
 * guard, following 00177's own precedent for the sibling `appendLog` fallback —
 * re-routing this to the plan's resolved root (correct on a symlinked/multi-root
 * session) is a separate, unshipped improvement, not this marker-manufacturing fix.
 *
 * @param {Error} err
 */
function logError(err) {
  try {
    const safeFs = require('../lib/safe-fs');
    // Never manufacture the marker that gates setup: write only into an existing
    // `.ctoc/`, and return WITHOUT touching the filesystem when it is absent.
    const ctocDir = path.join(process.cwd(), '.ctoc');
    if (!safeFs.existsSync(ctocDir)) return;      // nothing to log INTO — never CREATE
    const logDir = path.join(ctocDir, 'logs');
    if (!safeFs.existsSync(logDir)) safeFs.mkdirSync(logDir, { recursive: true }); // LEAF only
    const logPath = path.join(logDir, 'plan-index-sync.json');
    let log = [];
    if (safeFs.existsSync(logPath)) {
      try { log = JSON.parse(safeFs.readFileSync(logPath, 'utf8')); } catch { log = []; }
    }
    if (!Array.isArray(log)) log = [];
    log.push({ timestamp: new Date().toISOString(), source: 'PostToolUse.plan-index-sync', error: err && err.message });
    if (log.length > 500) log = log.slice(-500);
    safeFs.writeFileSync(logPath, JSON.stringify(log, null, 2));
  } catch {
    /* logging is best-effort */
  }
}

/**
 * Hook entry point. Always exits 0.
 */
async function main() {
  try {
    const payload = await readStdin();
    const fp = payload && payload.tool_input && payload.tool_input.file_path;
    if (!isPlanMd(fp)) { process.exit(0); return; }

    // Derive ONE root from the written plan's own project and use it for BOTH the
    // wiring (store keying) and syncUnit's plansRoot/logDir (key normalization), so the
    // hook can never silently diverge onto a different store than the one getWiring
    // opened (F1). getWiring realpath-canonicalizes the root (F2).
    const root = resolveRootForPlan(fp);

    const wiring = loadWiring(root);
    if (!wiring) { process.exit(0); return; } // PI0 not integrated → fail-open

    const { syncUnit } = require('../lib/plan-index/sync-unit');
    // Name a log destination ONLY when `.ctoc/` already exists — never create it
    // (slice 00177). `undefined` flows through to `logNote`'s falsy-`logDir` guard.
    const logDir = resolveSyncLogDir(root);
    const plansRoot = path.join(root, 'plans');
    // AWAIT the sync so the index reflects the write BEFORE we exit. A bare
    // `process.exit(0)` kills an un-awaited microtask before Node ever runs it (the
    // index-sync no-op defect): the process terminates before the current unit of
    // work hands control back to the event loop, so the scheduled `.then` callback
    // never fires. Bound the await with a timeout race so a pathologically slow or
    // hung embedder still never blocks the tool flow; fail-open on BOTH rejection
    // and timeout (the process ALWAYS exits 0 below).
    const SYNC_BUDGET_MS = 2000;
    let timer;
    const timeout = new Promise((resolve) => {
      timer = setTimeout(() => resolve('timeout'), SYNC_BUDGET_MS);
      timer.unref?.();
    });
    try {
      const outcome = await Promise.race([
        syncUnit(fp, {
          store: wiring.store,
          embedder: wiring.embedder,
          calibrationReady: wiring.calibrationReady,
          plansRoot,
          logDir
        }).then(() => 'synced', (err) => { logError(err); return 'error'; }),
        timeout
      ]);
      if (outcome === 'timeout') {
        logError(new Error('plan-index sync exceeded ' + SYNC_BUDGET_MS + 'ms budget; exiting fail-open'));
      }
    } finally {
      clearTimeout(timer);
    }
  } catch (err) {
    logError(err);
  }
  process.exit(0);
}

// Only run as a hook when invoked directly (not when required by a test).
if (require.main === module) {
  main();
}

module.exports = { isPlanMd, resolveSyncLogDir, logError };
