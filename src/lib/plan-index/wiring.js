'use strict';

/**
 * PI0 — Plan-Index composition root + capability gate (`getWiring`).
 *
 * This is the single seam that turns the shipped-but-INERT PI1/PI2/PI3 vector
 * system LIVE. Both hot-path consumers already lazy-require this exact module and
 * call `getWiring()`:
 *   • `src/lib/actions.js` movePlan guard → `require('./plan-index/wiring').getWiring()`,
 *     uses `w.store.moveUnit`.
 *   • `src/hooks/PostToolUse.plan-index-sync.js` → `require('../lib/plan-index/wiring').getWiring()`,
 *     requires `w.store && typeof w.embedder === 'function'`.
 * Creating this file (with no edits to those two consumers) makes both go live.
 *
 * FAIL-OPEN is the load-bearing invariant. A semantic-feature failure must NEVER
 * break the menu, a plan mutation, or session start ("the measure is the human").
 * Fail-open is layered:
 *   • store-level — intrinsic to PI1 `openStore` (F3 in-memory-only degrade);
 *   • wiring-level — any construction error here yields a SAFE no-op wiring
 *     (`store:null`, `embedder` resolves `{vectors:[]}`, `isIndexAvailable()` false);
 *   • the adapter never rejects — PI2 `embed` is itself fail-open, and the adapter
 *     defensively resolves `{vectors:[]}` on any thrown error.
 *
 * CAPABILITY GATE (retargeted by the PI1 pivot). There is NO native-binary /
 * node:sqlite / vec0 / full-text-engine / extension-load probe — the store is pure
 * JS and always constructs. The only runtime that can be absent is the EMBEDDING
 * SOURCE, so `probeEmbeddingSource` gates on Ollama reachability, falling back to the
 * always-available in-process engine. `isIndexAvailable()` reflects the synchronous
 * signal callers gate on: did the store construct.
 *
 * Cross-platform: `path.join` only; no native deps, no child_process, no shell.
 */

const path = require('path');
// Require the store module DIRECTLY (not the `./index` barrel) to avoid a require
// cycle: the barrel re-exports `getWiring` from this module, so importing the barrel
// here would form `index → wiring → index` and yield a partially-initialized barrel
// (an `undefined` re-export + a circular-dependency warning). `openStore` lives in
// `./store`; the barrel is a pure re-export of it, so this is contract-equivalent.
const { openStore } = require('./store');
const { embed } = require('./embedder');
const { loadCalibration } = require('./calibration');
const { probeOllama } = require('./hardware-probe');
const { getSetting } = require('../settings');
const { findProjectRoot } = require('../project-root');

/**
 * Module-level singleton cache, keyed on the RESOLVED (absolute) project path so a
 * process operating on multiple roots (tests) gets one wiring per root.
 * @type {Map<string, object>}
 */
const CACHE = new Map();

/**
 * Resolve the caller's projectPath to an absolute root. Arg wins; else the shared
 * project-root finder; else `process.cwd()`. Never throws.
 * @param {string} [projectPath]
 * @returns {string}
 */
function resolveRoot(projectPath) {
  try {
    if (typeof projectPath === 'string' && projectPath.length > 0) {
      return path.resolve(projectPath);
    }
    return path.resolve(findProjectRoot(process.cwd()));
  } catch {
    return process.cwd();
  }
}

/**
 * Build a safe NO-OP wiring used when store construction fails. Its `embedder`
 * resolves `{vectors:[]}` (never rejects), `isIndexAvailable()` is false, and
 * `degradedReason()` names the fault. This is what keeps `movePlan` / the hook alive
 * when the index cannot be constructed at all.
 * @param {string} root
 * @param {string} reason
 * @returns {object}
 */
function noopWiring(root, reason) {
  return Object.freeze({
    store: null,
    embedder: async () => ({ vectors: [] }),
    calibrationReady: () => false,
    isIndexAvailable: () => false,
    degradedReason: () => reason,
    projectPath: root
  });
}

/**
 * Construct (or return the cached) wired composition root for a project.
 *
 * @param {{ projectPath?: string, openStore?: Function, embed?: Function, getSetting?: Function, loadCalibration?: Function }} [opts]
 *   `openStore` / `embed` / `getSetting` / `loadCalibration` are injectable ONLY for
 *   hermetic tests; production passes nothing and uses the real PI1/PI2 functions.
 * @returns {{ store: object|null, embedder: (texts: string[]) => Promise<{vectors: Float32Array[], source?: string}>,
 *   calibrationReady: () => boolean, isIndexAvailable: () => boolean,
 *   degradedReason: () => (string|null), projectPath: string }}
 *   The wiring both dormant consumers hard-require. NEVER throws.
 */
function getWiring(opts = {}) {
  const root = resolveRoot(opts && opts.projectPath);

  // Injected deps force a fresh (uncached) construction so a test can exercise a
  // throwing `openStore` or a stubbed `embed` without polluting the singleton.
  const injected = !!(opts && (opts.openStore || opts.embed || opts.getSetting || opts.loadCalibration));
  if (!injected && CACHE.has(root)) return CACHE.get(root);

  const _openStore = typeof opts.openStore === 'function' ? opts.openStore : openStore;
  const _embed = typeof opts.embed === 'function' ? opts.embed : embed;
  const _getSetting = typeof opts.getSetting === 'function' ? opts.getSetting : getSetting;
  const _loadCalibration = typeof opts.loadCalibration === 'function' ? opts.loadCalibration : loadCalibration;

  let store = null;
  let degraded = null;
  try {
    // ALWAYS construct — fail-open is intrinsic to openStore; this catch is
    // defensive so a pathological throw can never reach movePlan / the hook.
    store = _openStore(path.join(root, '.ctoc', 'index', 'plan-index.json'));
  } catch {
    store = null;
    degraded = 'store-unavailable';
  }

  if (!store) {
    const w = noopWiring(root, degraded || 'store-unavailable');
    // Do not cache an injected/failed construction.
    if (!injected) CACHE.set(root, w);
    return w;
  }

  // The BARE ONE-ARG adapter reconcile/sync call as `embedder([text])`. It unwraps
  // to PI2's `{vectors, source}` shape (which both consumers already unwrap) and
  // NEVER rejects — any thrown error resolves to `{vectors:[]}` (fail-open).
  const embedder = (texts) =>
    Promise.resolve()
      .then(() => _embed(texts, { projectPath: root, getSetting: _getSetting }))
      .catch(() => ({ vectors: [] }));

  const calibrationReady = () => {
    try { return _loadCalibration({ projectPath: root }) != null; } catch { return false; }
  };

  // The synchronous availability signal callers gate on: the store constructed.
  // Embedding-source availability is the async, quality-tier signal surfaced by
  // `probeEmbeddingSource` + `degradedReason`; it never flips the store off.
  const isIndexAvailable = () => !!store;
  const degradedReason = () => degraded;

  const wiring = Object.freeze({
    store,
    embedder,
    calibrationReady,
    isIndexAvailable,
    degradedReason,
    projectPath: root
  });
  if (!injected) CACHE.set(root, wiring);
  return wiring;
}

/**
 * Reset the singleton cache. A TESTING SEAM ONLY — defined non-enumerable so it is
 * never part of the public `getWiring` surface. Callers in production never invoke it.
 */
Object.defineProperty(getWiring, '__reset', {
  enumerable: false,
  value: function __reset() { CACHE.clear(); }
});

/**
 * The capability gate proper: is an EMBEDDING SOURCE available?
 *
 * Probes Ollama reachability; if reachable → `{available:true, source:'ollama'}`.
 * Otherwise the in-process fallback is ALWAYS usable on a supported Node →
 * `{available:true, source:'in-process'}`. It returns `available:false` only in the
 * pathological branch where even the in-process engine cannot be constructed
 * (defensive; effectively never). Async because `probeOllama` is async.
 *
 * @param {{ projectPath?: string, probe?: Function }} [opts]
 *   `probe` is injectable for hermetic tests (no live fetch).
 * @returns {Promise<{ available: boolean, source: 'ollama'|'in-process'|null }>}
 */
async function probeEmbeddingSource(opts = {}) {
  const root = resolveRoot(opts && opts.projectPath);
  const probe = typeof opts.probe === 'function' ? opts.probe : probeOllama;
  let reachable = false;
  try {
    reachable = await probe({ projectPath: root });
  } catch {
    reachable = false; // fail-open
  }
  if (reachable) return { available: true, source: 'ollama' };
  // In-process is always available (pure JS); the index degrades to reduced quality,
  // not to "off". `available:false` would require the in-process engine itself to be
  // unconstructable — outside any supported Node.
  return { available: true, source: 'in-process' };
}

module.exports = { getWiring, probeEmbeddingSource };
