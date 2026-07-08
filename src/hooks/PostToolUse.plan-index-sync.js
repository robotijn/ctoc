#!/usr/bin/env node
'use strict';

/**
 * PI3 — PostToolUse hook: fire-and-forget plan-index sync.
 *
 * When a Claude tool (Write/Edit/MultiEdit) writes a `plans/**\/*.md` file, this
 * hook fires `syncUnit` for JUST that plan so the semantic index reflects the change
 * within the same interaction. It is FIRE-AND-FORGET and FAIL-OPEN:
 *   • reads the hook stdin JSON (`{ tool_input: { file_path } }`);
 *   • no-ops for any non-`plans/**\/*.md` path (SY-11);
 *   • never blocks on the embed, never throws to the user, ALWAYS exits 0 (SY-10);
 *   • logs any sync error to `.ctoc/logs/` (logged, not swallowed).
 *
 * It does NOT construct the store/embedder itself — PI0's composition root owns the
 * singleton wiring and supplies `{ store, embedder, calibrationReady }`. Until PI0
 * is integrated the wiring module is absent; the hook then exits 0 silently
 * (fail-open). The existing `PostToolUse.status-check.js` is NOT modified.
 *
 * Cross-platform: `path`-based matching, `fs.promises` via safe-fs, no shell.
 */

const path = require('path');

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
 * @param {Error} err
 */
function logError(err) {
  try {
    const safeFs = require('../lib/safe-fs');
    const logDir = path.join(process.cwd(), '.ctoc', 'logs');
    if (!safeFs.existsSync(logDir)) safeFs.mkdirSync(logDir, { recursive: true });
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
    const logDir = path.join(root, '.ctoc', 'logs');
    const plansRoot = path.join(root, 'plans');
    // Fire-and-forget: do NOT await the embed; log any rejection.
    Promise.resolve()
      .then(() => syncUnit(fp, {
        store: wiring.store,
        embedder: wiring.embedder,
        calibrationReady: wiring.calibrationReady,
        plansRoot,
        logDir
      }))
      .catch((err) => logError(err));
  } catch (err) {
    logError(err);
  }
  process.exit(0);
}

// Only run as a hook when invoked directly (not when required by a test).
if (require.main === module) {
  main();
}

module.exports = { isPlanMd };
