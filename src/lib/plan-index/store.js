/**
 * PI1 — Pure-JS Plan-Index Store (in-memory + single-file JSON persistence).
 *
 * A cross-platform, zero-native-dependency store mapping (planPath, sectionId) →
 * dense embedding + metadata, with brute-force cosine nearest-neighbour search.
 * It is a rebuildable CACHE: a corrupt or absent index fails open (empty, usable
 * store + a warn) and is repopulated by PI3 reconciliation — it never throws into
 * the live menu.
 *
 * Design (see plans/todo/pi1-index-store-and-schema.md, decisions D1–D10):
 *   • In-memory source of truth: Map<"planPath\x00sectionId", UnitRecord>.
 *   • Each record holds the raw Float32Array embedding (lossless) plus a derived,
 *     in-memory-only `_norm` (L2 norm) recomputed on load — NEVER persisted.
 *   • Persistence: one JSON file { version, dimension, units:[] }; each embedding
 *     is base64 of the Float32Array little-endian buffer (byte-exact + compact).
 *   • search: brute-force cosine over map.values(), O(N·dim) — right-sized for
 *     CTOC's ~1,720-unit corpus (Decision D2).
 *   • Concurrency (Decision D6): every read-modify-write takes an exclusive
 *     create lockfile, RELOADS the file under the lock (so a concurrent external
 *     write is merged, not clobbered), atomically saves (temp-sibling + rename),
 *     then releases. A stale lock (mtime older than staleLockMs) is stolen so a
 *     crashed holder never hangs the menu. Reads take NO lock.
 *
 * ALL filesystem access routes through src/lib/safe-fs.js — the audited choke
 * point (LH1). There is no raw `fs` in this module.
 */

'use strict';

const path = require('path');
const safeFs = require('../safe-fs');

/** Reserved sectionId for the plan-level unit of a plan (Decision D10). */
const PLAN_SENTINEL = '__plan__';
/** NUL composite-key separator — never valid inside a path or section id. */
const KEY_SEP = '\x00';
/** Warn-log rotation cap. */
const MAX_LOG_ENTRIES = 500;

const DEFAULTS = Object.freeze({
  version: 1,
  staleLockMs: 10000,
  acquireTimeoutMs: 5000,
  acquireBackoffMs: 25
});

/**
 * @typedef {Object} Unit
 * @property {string} planPath   Opaque key; callers must normalize consistently (D9).
 * @property {string} sectionId  Section id, or '__plan__' for a plan-level unit.
 * @property {'plan'|'section'} kind
 * @property {string} [text]
 * @property {Float32Array} embedding
 * @property {string[]} [files]
 * @property {string|null} [parentVision]
 * @property {string|null} [stepLabel]
 * @property {string} contentHash
 */

/**
 * @typedef {Object} SearchOpts
 * @property {'plan'|'section'} [kind]           Restrict to a kind.
 * @property {string} [excludePlanPath]         Drop units of this planPath (self-exclusion).
 * @property {number} [minScore]                Drop results below this cosine score.
 */

/**
 * @typedef {Object} OpenOpts
 * @property {number} [version]           Expected persisted schema version (default 1).
 * @property {number} [staleLockMs]       Lock steal threshold in ms (default 10000).
 * @property {number} [acquireTimeoutMs]  Bounded lock-acquire timeout (default 5000).
 * @property {number} [acquireBackoffMs]  Backoff between acquire attempts (default 25).
 */

// ── vector math ───────────────────────────────────────────────────────────────

/**
 * Dot product of two equal-length Float32Arrays.
 * @param {Float32Array} a
 * @param {Float32Array} b
 * @returns {number}
 */
function dot(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

/**
 * L2 (Euclidean) norm of a vector.
 * @param {Float32Array} v
 * @returns {number}
 */
function l2norm(v) {
  let s = 0;
  for (let i = 0; i < v.length; i++) s += v[i] * v[i];
  return Math.sqrt(s);
}

// ── embedding (de)serialization ────────────────────────────────────────────────

/**
 * Encode a Float32Array as base64 of its little-endian byte buffer (byte-exact).
 * @param {Float32Array} f
 * @returns {string}
 */
function encodeEmbedding(f) {
  return Buffer.from(f.buffer, f.byteOffset, f.byteLength).toString('base64');
}

/**
 * Decode a base64 embedding back to a fresh Float32Array (copied out of Node's
 * shared Buffer pool so the result never aliases pooled memory).
 * @param {string} str
 * @returns {Float32Array}
 */
function decodeEmbedding(str) {
  if (typeof str !== 'string' || str.length === 0) {
    throw new Error('plan-index: embedding must be a non-empty base64 string');
  }
  const b = Buffer.from(str, 'base64');
  if (b.byteLength === 0 || b.byteLength % 4 !== 0) {
    throw new Error(`plan-index: embedding base64 has an invalid byte length (${b.byteLength})`);
  }
  // slice() copies the exact bytes into a standalone ArrayBuffer.
  return new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
}

/**
 * Open (or create the handle for) a plan-index store at `jsonPath`.
 *
 * Fail-open: an absent, unparseable, or wrong-shaped file yields an empty, usable
 * store (a warn is logged for the latter two). NEVER throws on a bad/absent file.
 *
 * @param {string} jsonPath  Absolute or relative path to the index JSON file.
 * @param {OpenOpts} [opts]
 * @returns {object} A PlanIndexStore handle.
 */
function openStore(jsonPath, opts = {}) {
  if (typeof jsonPath !== 'string' || jsonPath.length === 0) {
    throw new TypeError('plan-index: openStore requires a non-empty jsonPath string');
  }

  const version = opts.version ?? DEFAULTS.version;
  const staleLockMs = opts.staleLockMs ?? DEFAULTS.staleLockMs;
  const acquireTimeoutMs = opts.acquireTimeoutMs ?? DEFAULTS.acquireTimeoutMs;
  const acquireBackoffMs = opts.acquireBackoffMs ?? DEFAULTS.acquireBackoffMs;

  const dir = path.dirname(jsonPath);
  const lockPath = `${jsonPath}.lock`;
  // .ctoc/index/plan-index.json → .ctoc/logs
  const logDir = path.resolve(dir, '..', 'logs');

  // Ensure the index directory exists (a directory, not the index file — AC1
  // requires no index FILE until save()).
  safeFs.mkdirSync(dir, { recursive: true });

  /** @type {Map<string, any>} */
  let units = new Map();
  /** @type {number | null} */
  let dimension = null;

  // ── warn logger (mirrors src/lib/enforcement-log.js; never throws) ───────────

  /**
   * Append a warn entry to .ctoc/logs/plan-index.json. Logging failures are
   * swallowed — a broken log must never break the store.
   * @param {string} event
   * @param {object} [detail]
   */
  function warnLog(event, detail = {}) {
    try {
      if (!safeFs.existsSync(logDir)) safeFs.mkdirSync(logDir, { recursive: true });
      const logPath = path.join(logDir, 'plan-index.json');
      let log = [];
      if (safeFs.existsSync(logPath)) {
        try { log = JSON.parse(safeFs.readFileSync(logPath, 'utf8')); } catch { log = []; }
      }
      if (!Array.isArray(log)) log = [];
      log.push({ timestamp: new Date().toISOString(), level: 'warn', event, ...detail });
      if (log.length > MAX_LOG_ENTRIES) log = log.slice(-MAX_LOG_ENTRIES);
      safeFs.writeFileSync(logPath, JSON.stringify(log, null, 2));
    } catch {
      /* logging is best-effort; never propagate into the caller */
    }
  }

  // ── key + record helpers ─────────────────────────────────────────────────────

  /**
   * @param {string} p
   * @param {string} s
   * @returns {string}
   */
  function key(p, s) {
    return `${p}${KEY_SEP}${s}`;
  }

  /**
   * A fresh, caller-safe view of a record: embedding copied to a new
   * Float32Array, files copied, `_norm` omitted.
   * @param {any} rec
   * @returns {object}
   */
  function unitView(rec) {
    return {
      planPath: rec.planPath,
      sectionId: rec.sectionId,
      kind: rec.kind,
      text: rec.text,
      files: rec.files.slice(),
      parentVision: rec.parentVision,
      stepLabel: rec.stepLabel,
      contentHash: rec.contentHash,
      embedding: new Float32Array(rec.embedding)
    };
  }

  // ── persistence ──────────────────────────────────────────────────────────────

  /**
   * Serialize the current in-memory state to the canonical JSON string.
   * @returns {string}
   */
  function serialize() {
    const arr = [];
    for (const rec of units.values()) {
      arr.push({
        planPath: rec.planPath,
        sectionId: rec.sectionId,
        kind: rec.kind,
        text: rec.text,
        files: rec.files,
        parentVision: rec.parentVision,
        stepLabel: rec.stepLabel,
        contentHash: rec.contentHash,
        embedding: encodeEmbedding(rec.embedding)
      });
    }
    return JSON.stringify({ version, dimension, units: arr }, null, 2);
  }

  /**
   * Validate a unit object loaded from disk. Throws (→ fail-open) on any missing
   * or malformed required field.
   * @param {any} u
   */
  function validateLoadedUnit(u) {
    if (!u || typeof u !== 'object') throw new Error('plan-index: unit is not an object');
    if (typeof u.planPath !== 'string' || u.planPath.length === 0) throw new Error('plan-index: unit missing planPath');
    if (typeof u.sectionId !== 'string' || u.sectionId.length === 0) throw new Error('plan-index: unit missing sectionId');
    if (u.kind !== 'plan' && u.kind !== 'section') throw new Error('plan-index: unit has invalid kind');
    if (typeof u.contentHash !== 'string' || u.contentHash.length === 0) throw new Error('plan-index: unit missing contentHash');
    if (typeof u.embedding !== 'string') throw new Error('plan-index: unit missing base64 embedding');
    if (u.files != null && !Array.isArray(u.files)) throw new Error('plan-index: unit files must be an array');
  }

  /**
   * (Re)load the store from disk, replacing the in-memory Map + dimension.
   * Fail-open: absent → empty; unparseable / wrong-shape / inconsistent → empty
   * + a warn. Never throws.
   */
  function loadFromDisk() {
    if (!safeFs.existsSync(jsonPath)) {
      units = new Map();
      dimension = null;
      return;
    }
    try {
      const raw = safeFs.readFileSync(jsonPath, 'utf8');
      const data = JSON.parse(raw);
      if (!data || typeof data !== 'object' || data.version !== version || !Array.isArray(data.units)) {
        throw new Error('plan-index: index file has an unexpected shape');
      }
      const next = new Map();
      let dim = null;
      for (const u of data.units) {
        validateLoadedUnit(u);
        const emb = decodeEmbedding(u.embedding);
        if (dim === null) dim = emb.length;
        else if (emb.length !== dim) throw new Error('plan-index: inconsistent embedding dimensions in file');
        next.set(key(u.planPath, u.sectionId), {
          planPath: u.planPath,
          sectionId: u.sectionId,
          kind: u.kind,
          text: typeof u.text === 'string' ? u.text : '',
          files: Array.isArray(u.files) ? u.files.slice() : [],
          parentVision: u.parentVision ?? null,
          stepLabel: u.stepLabel ?? null,
          contentHash: u.contentHash,
          embedding: emb,
          _norm: l2norm(emb)
        });
      }
      units = next;
      dimension = dim;
    } catch (err) {
      units = new Map();
      dimension = null;
      warnLog('index_load_failed', { message: err && err.message ? err.message : String(err) });
    }
  }

  /**
   * Atomically persist the in-memory state: write a temp sibling (same directory
   * → same volume) then rename over the target. On any failure the temp file is
   * unlinked and the error is rethrown, leaving the prior file intact (AC17).
   */
  function atomicSave() {
    const tmpPath = `${jsonPath}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const payload = serialize();
    try {
      safeFs.writeFileSync(tmpPath, payload);
      safeFs.renameSync(tmpPath, jsonPath);
    } catch (err) {
      try { safeFs.unlinkSync(tmpPath); } catch { /* temp may not exist */ }
      throw err;
    }
  }

  // ── locking ──────────────────────────────────────────────────────────────────

  /**
   * Bounded synchronous sleep (Atomics.wait on a throwaway buffer — cross-platform,
   * dependency-free, keeps the store API synchronous like the rest of CTOC).
   * @param {number} ms
   */
  function sleep(ms) {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
  }

  /**
   * Acquire the exclusive lock via atomic create ('wx'). Steals a lock whose mtime
   * exceeds staleLockMs (crashed holder). Bounded by acquireTimeoutMs.
   */
  function acquireLock() {
    const deadline = Date.now() + acquireTimeoutMs;
    for (;;) {
      try {
        safeFs.writeFileSync(lockPath, `${process.pid}:${Date.now()}`, { flag: 'wx' });
        return;
      } catch (err) {
        if (!err || err.code !== 'EEXIST') throw err;
        // Lock is held — steal it if stale, otherwise back off (bounded).
        try {
          const st = safeFs.statSync(lockPath);
          if (Date.now() - st.mtimeMs > staleLockMs) {
            try { safeFs.unlinkSync(lockPath); } catch { /* raced; retry create */ }
            continue;
          }
        } catch {
          continue; // lock vanished between create and stat — retry immediately
        }
        if (Date.now() >= deadline) {
          throw new Error(`plan-index: lock acquire timeout after ${acquireTimeoutMs}ms (${lockPath})`);
        }
        sleep(acquireBackoffMs);
      }
    }
  }

  /** Release the lock (tolerates the lock already being gone — e.g. stolen). */
  function releaseLock() {
    try { safeFs.unlinkSync(lockPath); } catch { /* already gone */ }
  }

  /**
   * Run a mutation under the exclusive lock with reload-under-lock semantics:
   * acquire → reload from disk (merge concurrent external writes) → mutate →
   * atomically save → release. This is what makes concurrent writes lossless.
   * @template T
   * @param {() => T} fn
   * @returns {T}
   */
  function withLock(fn) {
    acquireLock();
    try {
      loadFromDisk();
      const r = fn();
      atomicSave();
      return r;
    } finally {
      releaseLock();
    }
  }

  // ── mutation cores (lock-free; called inside withLock / withBatch) ────────────

  /**
   * Validate an upsert input. Throws BEFORE any state change (AC10).
   * @param {any} unit
   */
  function validateUpsertInput(unit) {
    if (!unit || typeof unit !== 'object') throw new TypeError('plan-index: upsertUnit requires a unit object');
    if (typeof unit.planPath !== 'string' || unit.planPath.length === 0) {
      throw new Error('plan-index: upsertUnit requires a non-empty planPath');
    }
    if (typeof unit.sectionId !== 'string' || unit.sectionId.length === 0) {
      throw new Error('plan-index: upsertUnit requires a non-empty sectionId');
    }
    if (unit.kind !== 'plan' && unit.kind !== 'section') {
      throw new Error(`plan-index: upsertUnit invalid kind ${JSON.stringify(unit.kind)} (expected 'plan' or 'section')`);
    }
    if (!(unit.embedding instanceof Float32Array) || unit.embedding.length === 0) {
      throw new Error('plan-index: upsertUnit requires a non-empty Float32Array embedding');
    }
    if (typeof unit.contentHash !== 'string' || unit.contentHash.length === 0) {
      throw new Error('plan-index: upsertUnit requires a non-empty contentHash');
    }
    if (unit.files != null && !Array.isArray(unit.files)) {
      throw new Error('plan-index: upsertUnit files must be an array');
    }
  }

  /**
   * Apply an upsert to the in-memory Map (dimension policy included). Assumes the
   * input was already validated. Returns a view of the stored unit.
   * @param {Unit} unit
   * @returns {object}
   */
  function applyUpsert(unit) {
    const emb = new Float32Array(unit.embedding); // own copy — caller can't mutate ours
    if (dimension === null) {
      dimension = emb.length; // infer (AC14)
    } else if (emb.length !== dimension) {
      // Model changed: every stored vector is now incomparable — full reset (AC15).
      const cleared = units.size;
      const from = dimension;
      units.clear();
      dimension = emb.length;
      warnLog('dimension_reset', { from, to: dimension, cleared });
    }
    const rec = {
      planPath: unit.planPath,
      sectionId: unit.sectionId,
      kind: unit.kind,
      text: typeof unit.text === 'string' ? unit.text : '',
      files: Array.isArray(unit.files) ? unit.files.slice() : [],
      parentVision: unit.parentVision ?? null,
      stepLabel: unit.stepLabel ?? null,
      contentHash: unit.contentHash,
      embedding: emb,
      _norm: l2norm(emb)
    };
    units.set(key(unit.planPath, unit.sectionId), rec);
    return unitView(rec);
  }

  /**
   * Re-path every unit whose planPath === fromPath to toPath (no re-embed).
   * @param {string} fromPath
   * @param {string} toPath
   * @returns {number} count re-pathed
   */
  function applyMove(fromPath, toPath) {
    const matched = [];
    for (const rec of units.values()) {
      if (rec.planPath === fromPath) matched.push(rec);
    }
    for (const rec of matched) {
      units.delete(key(rec.planPath, rec.sectionId));
    }
    for (const rec of matched) {
      rec.planPath = toPath; // embedding, _norm, contentHash untouched
      units.set(key(toPath, rec.sectionId), rec);
    }
    return matched.length;
  }

  // ── public API ────────────────────────────────────────────────────────────────

  /**
   * Insert or replace a unit (idempotent on (planPath, sectionId)). Locked RMW.
   * @param {Unit} unit
   * @returns {object} the stored unit view
   */
  function upsertUnit(unit) {
    validateUpsertInput(unit); // before lock / any mutation
    return withLock(() => applyUpsert(unit));
  }

  /**
   * Look up a unit. Lock-free; returns a fresh view or null (never throws).
   * @param {string} planPath
   * @param {string} sectionId
   * @returns {object|null}
   */
  function getUnit(planPath, sectionId) {
    if (typeof planPath !== 'string' || typeof sectionId !== 'string') return null;
    const rec = units.get(key(planPath, sectionId));
    return rec ? unitView(rec) : null;
  }

  /**
   * Delete a unit. Locked RMW. Returns true if it existed, false otherwise.
   * @param {string} planPath
   * @param {string} sectionId
   * @returns {boolean}
   */
  function deleteUnit(planPath, sectionId) {
    if (typeof planPath !== 'string' || typeof sectionId !== 'string') return false;
    return withLock(() => units.delete(key(planPath, sectionId)));
  }

  /**
   * Re-path all of a plan's units from fromPath to toPath (no re-embed). Locked RMW.
   * @param {string} fromPath
   * @param {string} toPath
   * @returns {number} count re-pathed (0 if none matched)
   */
  function moveUnit(fromPath, toPath) {
    if (typeof fromPath !== 'string' || fromPath.length === 0) {
      throw new Error('plan-index: moveUnit requires a non-empty fromPath');
    }
    if (typeof toPath !== 'string' || toPath.length === 0) {
      throw new Error('plan-index: moveUnit requires a non-empty toPath');
    }
    return withLock(() => applyMove(fromPath, toPath));
  }

  /**
   * The declared file globs of a plan's plan-level unit. Lock-free; [] when there
   * is no plan-level unit or its files are empty. Never throws. Keyed on plan
   * path/slug — planPath is an opaque key; callers must normalize consistently (D9).
   * @param {string} planPath
   * @returns {string[]}
   */
  function getFilesForPlan(planPath) {
    if (typeof planPath !== 'string') return [];
    const rec = units.get(key(planPath, PLAN_SENTINEL));
    return rec && Array.isArray(rec.files) ? rec.files.slice() : [];
  }

  /**
   * Brute-force cosine nearest-neighbour search. Lock-free.
   * @param {Float32Array} queryEmbedding
   * @param {number} k
   * @param {SearchOpts} [opts]
   * @returns {Array<object & { score: number }>} ≤ k results, cosine-desc
   */
  function search(queryEmbedding, k, opts = {}) {
    if (!(queryEmbedding instanceof Float32Array)) {
      throw new TypeError('plan-index: search queryEmbedding must be a Float32Array');
    }
    if (dimension !== null && queryEmbedding.length !== dimension) {
      throw new Error(
        `plan-index: search query dimension ${queryEmbedding.length} does not match store dimension ${dimension}`
      );
    }
    const limit = Number.isInteger(k) && k > 0 ? k : 0;
    if (limit === 0) return [];
    const qNorm = l2norm(queryEmbedding);
    if (qNorm === 0) return []; // a zero query has no meaningful ranking

    const results = [];
    for (const rec of units.values()) {
      if (opts.kind && rec.kind !== opts.kind) continue;
      if (opts.excludePlanPath && rec.planPath === opts.excludePlanPath) continue;
      const denom = qNorm * rec._norm;
      const score = denom === 0 ? 0 : dot(queryEmbedding, rec.embedding) / denom;
      if (opts.minScore != null && score < opts.minScore) continue;
      const view = unitView(rec);
      view.score = score;
      results.push(view);
    }
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, limit);
  }

  /**
   * Persist the current state (locked reload-merge + atomic write).
   * @returns {void}
   */
  function save() {
    withLock(() => undefined);
  }

  /**
   * Run many mutations under a single lock acquire (PI3's reconciliation sweep):
   * one reload-under-lock, `fn` mutates via the provided lock-free API, one atomic
   * save at the end.
   * @param {(api: object) => any} fn
   * @returns {any}
   */
  function withBatch(fn) {
    if (typeof fn !== 'function') throw new TypeError('plan-index: withBatch requires a function');
    return withLock(() => fn({
      upsertUnit: (u) => { validateUpsertInput(u); return applyUpsert(u); },
      deleteUnit: (p, s) => (typeof p === 'string' && typeof s === 'string' ? units.delete(key(p, s)) : false),
      moveUnit: (f, t) => applyMove(f, t),
      getUnit,
      getFilesForPlan,
      search
    }));
  }

  // Initial fail-open load.
  loadFromDisk();

  const store = {
    upsertUnit,
    getUnit,
    deleteUnit,
    moveUnit,
    getFilesForPlan,
    search,
    save,
    withBatch
  };
  Object.defineProperty(store, 'dimension', { get: () => dimension, enumerable: true });
  Object.defineProperty(store, 'size', { get: () => units.size, enumerable: true });
  return store;
}

module.exports = { openStore, PLAN_SENTINEL };
