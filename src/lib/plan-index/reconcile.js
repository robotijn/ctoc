'use strict';

/**
 * PI3 — `reconcileIndex`: the full content-hash reconciliation sweep.
 *
 * Enumerates every `plans/**\/*.md`, computes what changed, then applies ALL writes
 * inside a single `store.withBatch` (ONE lock acquire, ONE atomic save for the whole
 * pass), and `deleteUnit`s any stored unit whose `planPath` no longer exists on disk
 * — the self-healing orphan removal that keeps the index a faithful mirror of the
 * plan files after any external change (editor save, `git pull`, CLI move).
 *
 * Two phases, because PI1's `withBatch` is SYNCHRONOUS (it runs `fn`, then saves
 * atomically — it does NOT await an async callback):
 *   1. ASYNC pre-compute (lock-free): walk the tree, read each file fresh, hash each
 *      unit, diff against the store's current `contentHash` (via lock-free
 *      `getUnit`), and embed ONLY the changed units (one embed per changed unit).
 *   2. SYNC apply (`withBatch`, one lock): upsert every pre-computed changed unit
 *      and delete every orphan planPath's units, then ONE atomic save.
 * The embeds — the only async work — happen in phase 1, so the sync `withBatch`
 * never races its save against a pending await.
 *
 * Named `reconcileIndex` (not `reconcile`) to avoid collision with the existing
 * `reconcile()` in `src/lib/reconciliation.js`.
 *
 * Orphan enumeration (Decision — option (a), the clean design): PI3 adds read-only
 * `listPlanPaths()` + `listUnitSectionIds()` accessors to PI1's store + withBatch
 * façade (O(n) over the private units Map). The sweep compares `listPlanPaths()`
 * against the on-disk set to find orphans. Additive-only to PI1 — no existing store
 * behavior changes.
 *
 * Cross-platform: `walkPlans` uses `fs.promises.readdir(dir,{withFileTypes:true})`
 * + `path.join`; no hardcoded separators; no shell.
 */

const path = require('path');
const safeFs = require('../safe-fs');
const { normalizePath, parseUnits } = require('./sync-unit');
const { hashUnit } = require('./content-hash');
const { PLAN_SENTINEL } = require('./index');

/**
 * Recursively collect every `*.md` file under `dir`. Cross-platform (fs.promises +
 * path.join). A missing root yields `[]` (data, not an error).
 *
 * @param {string} dir
 * @returns {Promise<string[]>} absolute .md file paths
 */
async function walkPlans(dir) {
  const out = [];
  let entries;
  try {
    entries = await safeFs.promises.readdir(dir, { withFileTypes: true });
  } catch {
    return out; // missing/unreadable dir → nothing to sweep
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const nested = await walkPlans(full);
      for (const n of nested) out.push(n);
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Best-effort diagnostic-note log to `.ctoc/logs/plan-index-sync.json`. Never throws.
 * @param {string|undefined} logDir
 * @param {string} note
 * @param {object} [detail]
 */
function logNote(logDir, note, detail = {}) {
  if (!logDir) return;
  try {
    if (!safeFs.existsSync(logDir)) safeFs.mkdirSync(logDir, { recursive: true });
    const logPath = path.join(logDir, 'plan-index-sync.json');
    let log = [];
    if (safeFs.existsSync(logPath)) {
      try { log = JSON.parse(safeFs.readFileSync(logPath, 'utf8')); } catch { log = []; }
    }
    if (!Array.isArray(log)) log = [];
    log.push({ timestamp: new Date().toISOString(), note, ...detail });
    if (log.length > 500) log = log.slice(-500);
    safeFs.writeFileSync(logPath, JSON.stringify(log, null, 2));
  } catch {
    /* best-effort */
  }
}

/**
 * Run the full reconciliation sweep.
 *
 * @param {string} plansRoot  Absolute path to the `plans/` root.
 * @param {{
 *   store?: object,
 *   embedder?: (texts: string[]) => Promise<Float32Array[]|{vectors: Float32Array[]}>,
 *   calibrationReady?: () => boolean,
 *   logDir?: string
 * }} [deps]  Required at runtime: `store` (with `withBatch`/`listPlanPaths`) and
 *   `embedder` (validated below).
 * @returns {Promise<{ swept: number, reembedded: number, deleted: number, skipped: boolean }>}
 */
async function reconcileIndex(plansRoot, deps = {}) {
  const { store, embedder, calibrationReady, logDir } = deps;
  if (!store) throw new TypeError('reconcileIndex: a store is required');
  if (typeof embedder !== 'function') throw new TypeError('reconcileIndex: an embedder function is required');
  if (typeof store.withBatch !== 'function') throw new TypeError('reconcileIndex: store must support withBatch');
  if (typeof store.listPlanPaths !== 'function') throw new TypeError('reconcileIndex: store must support listPlanPaths');

  // Gate the whole sweep on calibration readiness.
  if (typeof calibrationReady === 'function' && !calibrationReady()) {
    logNote(logDir, 'reconcileIndex: calibration not ready — sweep deferred', { plansRoot });
    return { swept: 0, reembedded: 0, deleted: 0, skipped: true };
  }

  const files = await walkPlans(plansRoot);
  const present = new Set(files.map((f) => normalizePath(f, plansRoot)));

  // ── PHASE 1 (async, lock-free): read fresh, diff, embed only changed units. ──
  /** @type {Array<object>} */
  const pendingUpserts = [];
  for (const f of files) {
    let content;
    try {
      content = await safeFs.promises.readFile(f, 'utf8');
    } catch (err) {
      if (err && err.code === 'ENOENT') continue; // vanished mid-sweep — data, not error
      throw err;
    }
    const normPath = normalizePath(f, plansRoot);
    for (const u of parseUnits(content)) {
      const h = hashUnit(u.text, { files: u.files, parentVision: u.parentVision, status: u.status });
      const prior = store.getUnit(normPath, u.sectionId);
      if (prior && prior.contentHash === h) continue; // unchanged → no re-embed
      const embedded = await embedder([u.text]);
      const vectors = Array.isArray(embedded) ? embedded : (embedded && embedded.vectors);
      const vector = vectors && vectors[0];
      if (!(vector instanceof Float32Array)) {
        throw new Error(`reconcileIndex: embedder did not return a Float32Array for ${normPath}#${u.sectionId}`);
      }
      pendingUpserts.push({
        planPath: normPath,
        sectionId: u.sectionId,
        kind: u.kind,
        text: u.text,
        files: u.files,
        parentVision: u.parentVision,
        stepLabel: null,
        contentHash: h,
        embedding: vector
      });
    }
  }

  // ── PHASE 2 (sync, one lock, one save): apply upserts + orphan deletions. ──
  const result = store.withBatch((api) => {
    let reembedded = 0;
    for (const unit of pendingUpserts) {
      api.upsertUnit(unit);
      reembedded++;
    }
    // Orphan removal: any stored planPath no longer on disk → delete all its units
    // (plan-level `__plan__` + every section unit). `listUnitSectionIds` gives the
    // full set so a deleted plan is fully purged from the index (SY-04 / SY-12).
    let deleted = 0;
    const stored = typeof api.listPlanPaths === 'function' ? api.listPlanPaths() : store.listPlanPaths();
    const listSections = typeof api.listUnitSectionIds === 'function'
      ? api.listUnitSectionIds
      : (typeof store.listUnitSectionIds === 'function' ? store.listUnitSectionIds : null);
    for (const planPath of stored) {
      if (present.has(planPath)) continue;
      const sectionIds = listSections ? listSections(planPath) : [PLAN_SENTINEL];
      let removedAny = false;
      for (const sid of sectionIds) {
        if (api.deleteUnit(planPath, sid)) removedAny = true;
      }
      if (api.deleteUnit(planPath, PLAN_SENTINEL)) removedAny = true; // belt-and-braces
      if (removedAny) deleted++;
    }
    return { reembedded, deleted };
  });

  return { swept: files.length, reembedded: result.reembedded, deleted: result.deleted, skipped: false };
}

module.exports = { reconcileIndex, walkPlans };
