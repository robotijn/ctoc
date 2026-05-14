/**
 * Lightweight in-process TTL cache.
 *
 * Used to memoize filesystem-heavy operations (plan-counts, vision-counts,
 * inbox-counts) across the menu render and its immediate drill-ins. The cache
 * lives for the lifetime of the Node process; each /ctoc:menu invocation
 * spawns a fresh process, so the cache effectively scopes to one menu session.
 *
 * Design goal: make the dashboard render in O(1) after first call, even when
 * the user navigates 3-4 menu levels deep. Total speedup is dominated by
 * skipping repeated readdir + readFile + YAML parse across plan stages.
 *
 * Cache is keyed by (function, args-signature). TTL is per-key. Default 5
 * seconds — long enough to span a menu navigation, short enough that state
 * changes feel immediate on the next /ctoc:menu invocation.
 */

const DEFAULT_TTL_MS = 5000;

const _store = new Map();

function _now() { return Date.now(); }

/**
 * Memoize a function with a TTL. Returns a wrapped function with the same
 * signature; first call computes, subsequent calls within TTL return cached.
 *
 * @param {Function} fn - The function to memoize. Must be deterministic
 *                        for the given args (heavy I/O is fine).
 * @param {string}   key - Stable key prefix (typically the function name).
 * @param {number}   [ttlMs] - Time-to-live in ms. Default 5000.
 * @returns {Function} Wrapped function.
 */
function memoize(fn, key, ttlMs = DEFAULT_TTL_MS) {
  return function memoized(...args) {
    const argsKey = args.map(a => {
      if (a === undefined) return 'undef';
      if (a === null) return 'null';
      if (typeof a === 'string') return a;
      try { return JSON.stringify(a); } catch { return String(a); }
    }).join('|');
    const cacheKey = `${key}::${argsKey}`;
    const cached = _store.get(cacheKey);
    if (cached && cached.expiresAt > _now()) {
      return cached.value;
    }
    const value = fn(...args);
    _store.set(cacheKey, { value, expiresAt: _now() + ttlMs });
    return value;
  };
}

/**
 * Invalidate all cache entries (or a subset by key prefix).
 * Useful when an operation writes state we know invalidates cached reads.
 */
function invalidate(keyPrefix) {
  if (!keyPrefix) {
    _store.clear();
    return;
  }
  for (const k of _store.keys()) {
    if (k.startsWith(keyPrefix + '::') || k === keyPrefix) {
      _store.delete(k);
    }
  }
}

/**
 * Inspect cache state (for tests / diagnostics).
 */
function _debug() {
  return {
    size: _store.size,
    keys: Array.from(_store.keys()),
  };
}

module.exports = {
  memoize,
  invalidate,
  _debug,
  DEFAULT_TTL_MS,
};
