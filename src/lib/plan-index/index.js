/**
 * PI1 — Plan-Index public barrel.
 *
 * The ONLY entry point other CTOC code imports for the plan index. Dependencies
 * flow inward (index → store); nothing else should require ./store directly.
 *
 * The store is a rebuildable, git-ignored CACHE persisted to a single JSON file
 * (.ctoc/index/plan-index.json). It is fail-open (a corrupt/absent index yields
 * an empty, usable store and a warn — never a throw into the caller), safe under
 * concurrent access (exclusive-lock + reload-under-lock + stale-steal; lock-free
 * reads), and has ZERO native dependencies (pure JS, cross-platform for free).
 *
 * IMPORTANT (Decision D9): `planPath` is an OPAQUE key. The store keys on the
 * exact string supplied at upsert and performs NO normalization. Callers (PI3
 * sync, PI6 conflict/getFilesForPlan) MUST normalize plan paths consistently so
 * lookups match — this contract is carried forward as a PI3/PI6 acceptance
 * criterion.
 *
 * See ./store for the full API and concurrency model.
 */

'use strict';

const { openStore, PLAN_SENTINEL } = require('./store');

module.exports = { openStore, PLAN_SENTINEL };

// PI0 composition-root re-exports (additive). PI4–PI6 consume `getWiring` /
// `kickBackfillBackground` through this single barrel surface.
//
// These are exposed as LAZY GETTERS, not eager requires, on purpose: `bootstrap`
// pulls in `reconcile → sync-unit → content-hash`, and `content-hash`/`reconcile`
// require THIS barrel back (for `PLAN_SENTINEL`). Eagerly requiring bootstrap at
// barrel-load time therefore forms a cycle that leaves a co-loading module's
// exports (e.g. `hashUnit`) transiently undefined — a real circular-dependency
// warning + broken PI3 tests. Deferring the require to first PROPERTY ACCESS breaks
// the cycle: PI1/PI3 consumers that only touch `openStore`/`PLAN_SENTINEL` never
// trigger it, and a PI4+ consumer reading `getWiring` loads a fully-initialized
// graph. Each getter is fail-open (returns undefined if the submodule cannot load)
// so a broken wiring/bootstrap can NEVER break the barrel for existing consumers.
// The require argument is a STRING LITERAL in every getter (no non-literal-require).
Object.defineProperties(module.exports, {
  getWiring: {
    enumerable: true,
    configurable: true,
    get() { try { return require('./wiring').getWiring; } catch { return undefined; } }
  },
  probeEmbeddingSource: {
    enumerable: true,
    configurable: true,
    get() { try { return require('./wiring').probeEmbeddingSource; } catch { return undefined; } }
  },
  kickBackfillBackground: {
    enumerable: true,
    configurable: true,
    get() { try { return require('./bootstrap').kickBackfillBackground; } catch { return undefined; } }
  },
  isBackfillNeeded: {
    enumerable: true,
    configurable: true,
    get() { try { return require('./bootstrap').isBackfillNeeded; } catch { return undefined; } }
  },
  // PI4 public surface (additive). `search` (s2) + `related` (s3) are the retrieval
  // API PI5/PI6 and the s4 UI consume through this single barrel. Exposed as the
  // SAME fail-open lazy getters as the getters above: a broken search.js/related.js
  // can never break the barrel for existing PI1/PI0 consumers (Barrel Integrity).
  // String-literal require in every getter (no non-literal-require).
  search: {
    enumerable: true,
    configurable: true,
    get() { try { return require('./search').search; } catch { return undefined; } }
  },
  related: {
    enumerable: true,
    configurable: true,
    get() { try { return require('./related').related; } catch { return undefined; } }
  },
  // PI6-s1 public surface (additive). `detectConflicts` (the AND of section-vector
  // similarity ∩ glob-aware `files:` overlap) is imported by the s2 overview panel
  // and s3 inbox surface through this single barrel — same fail-open lazy-getter
  // pattern as `search`/`related`: a broken conflict-detect.js resolves to
  // undefined and can never break the barrel for existing PI1/PI0/PI4 consumers.
  detectConflicts: {
    enumerable: true,
    configurable: true,
    get() { try { return require('./conflict-detect').detectConflicts; } catch { return undefined; } }
  }
});
