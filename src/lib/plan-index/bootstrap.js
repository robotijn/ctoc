'use strict';

/**
 * PI0 — First-run / SessionStart backfill bootstrap.
 *
 * Runs the full `reconcileIndex` sweep over ALL existing plans plus first-run
 * `runCalibration` (30–90 s) in a DETACHED background child process, so the menu /
 * session-start render path NEVER blocks on calibration or the initial embed. The
 * parent-side `kickBackfillBackground` returns instantly; the child (`--backfill`
 * entry) does the work and writes a lightweight `.ctoc/index/build-status.json` the
 * overview tab reads.
 *
 * This is the composition-root counterpart to `wiring.js`: `wiring.js` supplies the
 * live singletons; `bootstrap.js` drives the one-time population + status.
 *
 * FAIL-OPEN at every layer (the pi1 / task-reconcile precedent):
 *   • `kickBackfillBackground` — a spawn error is logged and returns
 *     `{started:false, reason:'spawn-failed'}`; it NEVER throws into SessionStart/menu.
 *   • the child `runBackfill` — a calibration/reconcile error writes `state:'error'`
 *     and the child still exits 0; a failed background build never surfaces as a crash.
 *   • all fs is best-effort; a status/lock write failure is swallowed.
 *
 * Cross-platform: `spawn(process.execPath, [__filename, '--backfill', root],
 * {detached:true, stdio:'ignore'})` — an ARRAY argv (no shell → no command
 * injection), works on Windows/macOS/Linux; all paths via `path.join`; all fs via
 * safe-fs.
 */

const path = require('path');
const childProcess = require('child_process');
const safeFs = require('../safe-fs');
const { getWiring } = require('./wiring');
const { reconcileIndex } = require('./reconcile');
const { runCalibration } = require('./calibration');

/** Stale-lock TTL: a `.build.lock` older than this is assumed crashed and stolen. */
const LOCK_TTL_MS = 10 * 60 * 1000; // 10 minutes

function indexDir(root) { return path.join(root, '.ctoc', 'index'); }
function statusFile(root) { return path.join(indexDir(root), 'build-status.json'); }
function lockFile(root) { return path.join(indexDir(root), '.build.lock'); }
function logDirFor(root) { return path.join(root, '.ctoc', 'logs'); }

/**
 * Best-effort append to `.ctoc/logs/plan-index-sync.json`. Never throws.
 * @param {string} root
 * @param {string} note
 * @param {object} [detail]
 */
function logNote(root, note, detail = {}) {
  try {
    const dir = logDirFor(root);
    if (!safeFs.existsSync(dir)) safeFs.mkdirSync(dir, { recursive: true });
    const logPath = path.join(dir, 'plan-index-sync.json');
    let log = [];
    if (safeFs.existsSync(logPath)) {
      try { log = JSON.parse(safeFs.readFileSync(logPath, 'utf8')); } catch { log = []; }
    }
    if (!Array.isArray(log)) log = [];
    log.push({ timestamp: new Date().toISOString(), source: 'plan-index-bootstrap', note, ...detail });
    if (log.length > 500) log = log.slice(-500);
    safeFs.writeFileSync(logPath, JSON.stringify(log, null, 2));
  } catch {
    /* logging is best-effort; never propagate */
  }
}

/**
 * Best-effort write of the build-status channel the overview tab reads. Never throws.
 * @param {string} root
 * @param {object} status
 */
function writeStatus(root, status) {
  try {
    const dir = indexDir(root);
    if (!safeFs.existsSync(dir)) safeFs.mkdirSync(dir, { recursive: true });
    safeFs.writeFileSync(statusFile(root), JSON.stringify(status, null, 2));
  } catch {
    /* best-effort — a status write failure must never break the build */
  }
}

/**
 * Is a first-run / refresh backfill needed? True iff the index is missing or empty.
 * O(1)-ish — reads only `store.size` (never walks all plans; that is the child's
 * job). Fail-open: any error → false (do not kick a build we can't reason about).
 *
 * @param {string} root  Project root.
 * @param {{ getWiring?: Function }} [deps]  `getWiring` injectable for tests.
 * @returns {boolean}
 */
function isBackfillNeeded(root, deps = {}) {
  try {
    const gw = typeof deps.getWiring === 'function' ? deps.getWiring : getWiring;
    const w = gw({ projectPath: root });
    if (!w || !w.store) return false;
    return w.store.size === 0;
  } catch {
    return false; // fail-open
  }
}

/**
 * True iff a `.build.lock` exists and is FRESH (mtime within the TTL). A stale lock
 * (crashed child) returns false so a future build is never wedged. Never throws.
 * @param {string} root
 * @returns {boolean}
 */
function hasFreshLock(root) {
  try {
    const lp = lockFile(root);
    if (!safeFs.existsSync(lp)) return false;
    const st = safeFs.statSync(lp);
    return (Date.now() - st.mtimeMs) < LOCK_TTL_MS;
  } catch {
    return false;
  }
}

/**
 * Write/refresh the `.build.lock` marker. Best-effort; never throws.
 * @param {string} root
 */
function writeLock(root) {
  try {
    const dir = indexDir(root);
    if (!safeFs.existsSync(dir)) safeFs.mkdirSync(dir, { recursive: true });
    safeFs.writeFileSync(lockFile(root), JSON.stringify({ pid: process.pid, ts: Date.now() }));
  } catch {
    /* best-effort */
  }
}

/** Remove the `.build.lock` marker. Best-effort; never throws. */
function releaseLock(root) {
  try {
    const lp = lockFile(root);
    if (safeFs.existsSync(lp)) safeFs.unlinkSync(lp);
  } catch {
    /* already gone */
  }
}

/**
 * PARENT-side, NON-BLOCKING, fire-and-forget backfill trigger. Spawns THIS module
 * as a detached child (`--backfill`) and returns IMMEDIATELY — the child does all
 * the work. De-duped via a fresh `.build.lock` (a stale lock is ignored).
 *
 * FAIL-OPEN: any spawn failure is logged and returns `{started:false,
 * reason:'spawn-failed'}` — it NEVER throws into SessionStart or the menu.
 *
 * @param {string} root  Project root.
 * @param {{ spawn?: Function }} [deps]  `spawn` injectable for hermetic tests
 *   (no real child process).
 * @returns {{ started: boolean, reason?: string }}
 */
function kickBackfillBackground(root, deps = {}) {
  try {
    if (hasFreshLock(root)) {
      return { started: false, reason: 'already-running' };
    }
    const spawn = typeof deps.spawn === 'function' ? deps.spawn : childProcess.spawn;
    writeLock(root);
    const child = spawn(
      process.execPath,
      [__filename, '--backfill', root],
      { detached: true, stdio: 'ignore' }
    );
    if (child && typeof child.unref === 'function') child.unref();
    return { started: true };
  } catch (err) {
    logNote(root, 'kickBackfillBackground: spawn failed', { error: err && err.message });
    // A spawn failure must not wedge future kicks — drop the lock we just wrote.
    releaseLock(root);
    return { started: false, reason: 'spawn-failed' };
  }
}

/**
 * The CHILD body (also directly callable in tests with injected deps). Runs
 * calibration then the full reconcile sweep, writing the build-status lifecycle.
 * NEVER rejects — any error resolves after writing `state:'error'` + logging, so a
 * failed background build can never surface as a crash.
 *
 * @param {string} root  Project root.
 * @param {{
 *   reconcileIndex?: Function, runCalibration?: Function, getWiring?: Function,
 *   onStatus?: Function, now?: Function
 * }} [deps]  All injectable for hermetic tests (stub embedder, real tmp store, no child).
 * @returns {Promise<{ swept: number, reembedded: number, deleted: number, calibrated: boolean, state: string }>}
 */
async function runBackfill(root, deps = {}) {
  const _reconcile = typeof deps.reconcileIndex === 'function' ? deps.reconcileIndex : reconcileIndex;
  const _runCalibration = typeof deps.runCalibration === 'function' ? deps.runCalibration : runCalibration;
  const _getWiring = typeof deps.getWiring === 'function' ? deps.getWiring : getWiring;
  const now = typeof deps.now === 'function' ? deps.now : () => new Date().toISOString();
  const onStatus = typeof deps.onStatus === 'function' ? deps.onStatus : () => {};

  const emit = (status) => { onStatus(status); writeStatus(root, status); };

  try {
    emit({ state: 'building', started: now(), swept: 0 });

    // PI2 owns the benchmark; idempotent — returns fast if already calibrated,
    // pins in-process when Ollama is absent. PI0 OWNS the invocation.
    let calibrated = false;
    try {
      await _runCalibration({ projectPath: root });
      calibrated = true;
    } catch (err) {
      // Calibration failure is non-fatal: reconcile gates itself on calibrationReady
      // and defers cleanly. Log and continue.
      logNote(root, 'runBackfill: calibration failed', { error: err && err.message });
    }

    const { store, embedder, calibrationReady } = _getWiring({ projectPath: root });
    const r = await _reconcile(path.join(root, 'plans'), {
      store, embedder, calibrationReady, logDir: logDirFor(root)
    });

    const swept = (r && typeof r.swept === 'number') ? r.swept : 0;
    const reembedded = (r && typeof r.reembedded === 'number') ? r.reembedded : 0;
    const deleted = (r && typeof r.deleted === 'number') ? r.deleted : 0;
    const state = 'ready';
    emit({ state, swept, reembedded, deleted, at: now() });
    return { swept, reembedded, deleted, calibrated, state };
  } catch (err) {
    logNote(root, 'runBackfill: failed', { error: err && err.message });
    emit({ state: 'error', message: (err && err.message) || 'backfill failed', at: now() });
    return { swept: 0, reembedded: 0, deleted: 0, calibrated: false, state: 'error' };
  } finally {
    releaseLock(root);
  }
}

// CHILD ENTRY: `spawn(execPath, [__filename, '--backfill', root])` runs here and
// always exits 0 — a failed background build must never surface as a non-zero exit.
if (require.main === module && process.argv[2] === '--backfill') {
  const root = process.argv[3] || process.cwd();
  runBackfill(root).then(() => process.exit(0)).catch(() => process.exit(0));
}

module.exports = { isBackfillNeeded, kickBackfillBackground, runBackfill, LOCK_TTL_MS };
