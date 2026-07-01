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
