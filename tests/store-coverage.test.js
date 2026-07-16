/**
 * PI1 — Plan-Index Store: DARK-BRANCH coverage tests.
 *
 * Companion to tests/plan-index-store.test.js (ST-01…ST-20 + F1…F9). That suite
 * drives the acceptance criteria; THIS suite pins the branches those leave dark —
 * every test here fails RED under a mutation of the exact line it names:
 *
 *   • decodeEmbedding throws (empty / non-4-multiple byte length) → whole-file
 *     fail-open on load                                                (137-138, 141-142)
 *   • openStore rejects a non-string/empty jsonPath                    (159-160)
 *   • releaseLock leaves a legacy/unparseable lock in place            (436 + branch)
 *   • acquireLock retries when the lock vanishes between create & stat (490-491)
 *   • validateUpsertInput throws BEFORE any state change               (549-578)
 *   • listPlanPaths returns DISTINCT paths                             (727-730)
 *   • listUnitSectionIds returns a plan's section ids incl. sentinel   (740-746)
 *   • search rejects a non-Float32Array query                          (757-758)
 *   • search k-cap / minScore-threshold / zero-query / zero-norm ranking edges
 *   • getUnit returns an isolated defensive copy (no aliasing the store)
 *
 * Real store, real tmp-dir file I/O. The only doubles are fault injections at the
 * fs boundary (safeFs.statSync) — never mocking the code under test.
 *
 * DOCUMENTED UNREACHABLE (honesty clause — no fabricated hit):
 *   • Lines 371-373 (atomicSave's `if (memoryOnly) { warn; return; }`). atomicSave
 *     is called ONLY from inside withLock (line ~532), and withLock returns early
 *     (`if (memoryOnly) return fn()`) BEFORE reaching atomicSave. So atomicSave is
 *     never invoked while memoryOnly is true; the guard is defensive dead code that
 *     the public API cannot emit. Covering it would require calling atomicSave
 *     directly, which is not exposed.
 *   • The `typeof str !== 'string'` operand of line 137. decodeEmbedding is
 *     module-private and its sole caller (loadFromDisk) runs validateLoadedUnit
 *     first, which throws unless `u.embedding` is a string. Only the `length === 0`
 *     operand is reachable from disk (empty-string embedding), which IS driven below.
 */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const { openStore, PLAN_SENTINEL } = require('../src/lib/plan-index');
const safeFs = require('../src/lib/safe-fs');

// ── helpers ─────────────────────────────────────────────────────────────────

function tmpIndex() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-idxcov-'));
  const jsonPath = path.join(dir, '.ctoc', 'index', 'plan-index.json');
  const logPath = path.join(dir, '.ctoc', 'logs', 'plan-index.json');
  return { dir, jsonPath, logPath, lockPath: `${jsonPath}.lock` };
}

function cleanup(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ }
}

function f32(arr) {
  return Float32Array.from(arr);
}

function randEmb(n, seed = 1) {
  const a = new Float32Array(n);
  for (let i = 0; i < n; i++) a[i] = Math.sin(seed * 0.7 + i * 0.13);
  return a;
}


function readLog(logPath) {
  if (!fs.existsSync(logPath)) return [];
  try { return JSON.parse(fs.readFileSync(logPath, 'utf8')); } catch { return []; }
}

/** A well-formed unit (3-dim by default) with overridable fields. */
function unit(over = {}) {
  return {
    planPath: 'plans/todo/x.md',
    sectionId: 's1',
    kind: 'section',
    text: 't',
    embedding: randEmb(3, 3),
    files: ['src/a.js'],
    parentVision: null,
    stepLabel: null,
    contentHash: 'h1',
    ...over
  };
}

/** Write a raw on-disk index file (version 1) carrying the given unit records. */
function writeDiskIndex(jsonPath, unitRecords) {
  fs.mkdirSync(path.dirname(jsonPath), { recursive: true });
  fs.writeFileSync(jsonPath, JSON.stringify({ version: 1, dimension: 3, units: unitRecords }));
}

/** Encode a Float32Array as base64 of its native-endian buffer (matches the
 *  store's on-disk embedding format). NaN/±Infinity survive the Float32 round-trip. */
function encodeEmb(arr) {
  const f = Float32Array.from(arr);
  return Buffer.from(f.buffer, f.byteOffset, f.byteLength).toString('base64');
}

// ── decodeEmbedding: a corrupt embedding on disk fails the WHOLE load open ──────
// (Not a partial load, not a crash, not a fabricated vector.) Lines 137-138, 141-142.

test('openStore_fails_open_when_a_persisted_embedding_is_an_empty_base64_string', () => {
  // Arrange — a unit that passes validateLoadedUnit (embedding IS a string) but
  // whose empty base64 makes decodeEmbedding throw (line 137-138).
  const { dir, jsonPath, logPath } = tmpIndex();
  writeDiskIndex(jsonPath, [{
    planPath: 'p.md', sectionId: 's1', kind: 'section', text: 't',
    files: [], parentVision: null, stepLabel: null, contentHash: 'h', embedding: ''
  }]);

  // Act
  const store = openStore(jsonPath);

  // Assert — empty, usable, warned; never a phantom unit from the bad record.
  assert.equal(store.size, 0, 'empty base64 embedding → whole store fails open (no partial/phantom unit)');
  assert.deepEqual(store.search(f32([1, 0, 0]), 5), [], 'store is still usable after fail-open');
  assert.ok(
    readLog(logPath).some(e => e.event === 'index_load_failed' && e.level === 'warn'),
    'fail-open is warned, not silent'
  );
  cleanup(dir);
});

test('openStore_fails_open_when_a_persisted_embedding_has_a_non_multiple_of_4_byte_length', () => {
  // Arrange — 'AA==' decodes to 1 byte; 1 % 4 !== 0 → decodeEmbedding throws (141-142).
  const { dir, jsonPath, logPath } = tmpIndex();
  writeDiskIndex(jsonPath, [{
    planPath: 'p.md', sectionId: 's1', kind: 'section', text: 't',
    files: [], parentVision: null, stepLabel: null, contentHash: 'h', embedding: 'AA=='
  }]);

  // Act
  const store = openStore(jsonPath);

  // Assert
  assert.equal(store.size, 0, 'a non-Float32-aligned embedding blob → fail-open, never a truncated vector');
  assert.ok(
    readLog(logPath).some(e => e.event === 'index_load_failed'),
    'the malformed byte length is warned'
  );
  cleanup(dir);
});

// ── loadFromDisk: a non-finite (NaN/±Infinity) embedding component is skipped ───
// The UPSERT path already rejects non-finite components (validateUpsertInput, F7),
// but the disk-load path (a fail-open cache rebuilt from foreign/corrupt files) is
// exactly where the same guard belongs: a poisoned _norm makes cosine scores — and
// therefore the search sort order — undefined (score NaN survives the `score <
// minScore` filter and returns NaN from the comparator). Per-unit skip+warn, mirroring
// the NUL-key skip precedent; the rest of the index still opens.

test('loadFromDisk_skips_a_persisted_unit_whose_embedding_has_a_non_finite_component', () => {
  // Arrange — one clean unit ([1,0,0]) and one poisoned unit ([NaN,1,0]) on disk.
  const { dir, jsonPath, logPath } = tmpIndex();
  writeDiskIndex(jsonPath, [
    {
      planPath: 'clean.md', sectionId: 's1', kind: 'section', text: 't',
      files: [], parentVision: null, stepLabel: null, contentHash: 'hc',
      embedding: encodeEmb([1, 0, 0])
    },
    {
      planPath: 'poison.md', sectionId: 's1', kind: 'section', text: 't',
      files: [], parentVision: null, stepLabel: null, contentHash: 'hp',
      embedding: encodeEmb([NaN, 1, 0])
    }
  ]);

  // Act
  const store = openStore(jsonPath);

  // Assert — the poisoned unit is NOT loaded; only the clean unit survives.
  assert.equal(store.size, 1, 'the non-finite unit is skipped on load; only the clean unit is kept');
  assert.equal(store.getUnit('poison.md', 's1'), null, 'the poisoned unit is absent from the store');
  assert.ok(store.getUnit('clean.md', 's1'), 'the clean unit loads normally alongside the skip');

  // Search returns only finite-scored hits (never a NaN score poisoning the sort).
  const res = store.search(f32([1, 0, 0]), 10);
  assert.equal(res.length, 1, 'search returns only the clean unit');
  assert.equal(res[0].planPath, 'clean.md', 'the surviving hit is the clean unit');
  assert.ok(Number.isFinite(res[0].score), 'no NaN-scored hit is ever returned');

  // The skip is warned, not silent.
  assert.ok(
    readLog(logPath).some(e => e.event === 'unit_skipped_non_finite' && e.level === 'warn'),
    'the non-finite skip is observable in the warn log'
  );
  cleanup(dir);
});

// ── openStore: a bad jsonPath is a caller bug and throws (159-160) ──────────────

test('openStore_throws_TypeError_for_an_empty_or_non_string_jsonPath', () => {
  for (const bad of [['empty', ''], ['null', null], ['number', 123], ['undefined', undefined]]) {
    assert.throws(
      () => openStore(bad[1]),
      (err) => err instanceof TypeError && /jsonPath/.test(err.message),
      `openStore(${bad[0]}) throws TypeError naming jsonPath`
    );
  }
});

// ── releaseLock: never deletes a lock it cannot prove is ours (436 + branch) ────

test('releaseLock_leaves_a_legacy_unparseable_lock_untouched', () => {
  // Arrange — a legacy plain-string lock ('pid:ts', not JSON). parseToken can't
  // parse it (JSON.parse throws → returns null, line 436), so releaseLock must
  // NOT delete it: deleting another owner's lock would break their critical section.
  const { dir, jsonPath, lockPath } = tmpIndex();
  const store = openStore(jsonPath);
  fs.writeFileSync(lockPath, '99999:0'); // legacy, unparseable-as-token

  // Act
  store.__test.releaseLock();

  // Assert
  assert.equal(fs.existsSync(lockPath), true, 'an unparseable/legacy lock is never blindly unlinked');
  cleanup(dir);
});

test('releaseLock_leaves_a_valid_json_lock_that_lacks_a_string_id_untouched', () => {
  // Arrange — valid JSON, but no string `id` field → parseToken returns null (436).
  const { dir, jsonPath, lockPath } = tmpIndex();
  const store = openStore(jsonPath);
  fs.writeFileSync(lockPath, JSON.stringify({ pid: 7, ts: 1 })); // no `id`

  // Act
  store.__test.releaseLock();

  // Assert
  assert.equal(fs.existsSync(lockPath), true, 'a token without a provable owner id is left in place');
  cleanup(dir);
});

// ── acquireLock: lock vanishes between the failed create and the stat (490-491) ─

test('acquireLock_retries_immediately_when_the_lock_vanishes_between_create_and_stat', () => {
  // Arrange — a foreign, FRESH lock exists so create('wx') fails EEXIST. We fault
  // -inject statSync to unlink the lock then throw ENOENT: this reproduces the real
  // race where a holder releases between our create-attempt and our staleness stat.
  // The `catch { continue; }` (490-491) must retry immediately and then succeed.
  const { dir, jsonPath, lockPath } = tmpIndex();
  const store = openStore(jsonPath, { staleLockMs: 100000, acquireTimeoutMs: 300000, acquireBackoffMs: 5 });
  fs.writeFileSync(lockPath, JSON.stringify({ id: 'foreign:holder', pid: 999, ts: Date.now() }));

  const origStat = safeFs.statSync;
  let statHits = 0;
  safeFs.statSync = function patchedStat(p, ...rest) {
    if (typeof p === 'string' && p === lockPath) {
      statHits += 1;
      try { fs.unlinkSync(lockPath); } catch { /* already gone */ }
      const e = new Error('ENOENT: lock vanished'); e.code = 'ENOENT';
      throw e;
    }
    return origStat.call(safeFs, p, ...rest);
  };

  try {
    // Act — create EEXIST → statSync unlinks+throws → catch continue → recreate wins.
    store.__test.acquireLock();

    // Assert — exactly one vanish was observed, and WE now own the lock.
    assert.equal(statHits, 1, 'the vanish path (create→stat race) was exercised exactly once');
    const tok = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
    assert.equal(tok.id, store.__test.ownerId, 'the retry acquired the lock for this handle');
  } finally {
    safeFs.statSync = origStat;
    try { store.__test.releaseLock(); } catch { /* best effort */ }
    cleanup(dir);
  }
});

// ── validateUpsertInput: throws BEFORE any state change (549-578) ───────────────
// Each row targets ONE validation line; every rejection must leave size unchanged.

test('upsertUnit_rejects_a_malformed_unit_before_any_mutation', () => {
  const { dir, jsonPath } = tmpIndex();
  const store = openStore(jsonPath);
  // Seed one good unit so we can prove rejections don't disturb existing state.
  store.upsertUnit(unit({ planPath: 'seed.md', sectionId: 's', embedding: randEmb(3, 1) }));
  const sizeBefore = store.size; // === 1

  const rows = [
    { id: 'not-an-object', input: null, re: /unit object/ },
    { id: 'planPath-empty', input: unit({ planPath: '' }), re: /planPath/ },
    { id: 'planPath-non-string', input: unit({ planPath: 123 }), re: /planPath/ },
    { id: 'sectionId-empty', input: unit({ sectionId: '' }), re: /sectionId/ },
    { id: 'sectionId-non-string', input: unit({ sectionId: null }), re: /sectionId/ },
    { id: 'embedding-not-float32', input: unit({ embedding: [1, 2, 3] }), re: /Float32Array/ },
    { id: 'embedding-empty', input: unit({ embedding: new Float32Array(0) }), re: /Float32Array/ },
    { id: 'contentHash-empty', input: unit({ contentHash: '' }), re: /contentHash/ },
    { id: 'contentHash-non-string', input: unit({ contentHash: 42 }), re: /contentHash/ },
    { id: 'files-not-array', input: unit({ files: 'src/a.js' }), re: /files/ }
  ];

  for (const row of rows) {
    assert.throws(() => store.upsertUnit(row.input), row.re, `row=${row.id} throws naming the bad field`);
    assert.equal(store.size, sizeBefore, `row=${row.id}: no state change on rejection`);
  }
  // The seed unit is intact and untouched by any rejected upsert.
  assert.ok(store.getUnit('seed.md', 's'), 'the pre-existing good unit survives every rejection');
  cleanup(dir);
});

// ── listPlanPaths: DISTINCT planPaths (727-730) ────────────────────────────────

test('listPlanPaths_returns_each_planPath_once_even_with_multiple_sections', () => {
  // Arrange — two sections + a plan-level unit under the SAME plan, plus one other
  // plan. A mutant that forgets to dedup (returns the raw list) would report 3 for
  // planA and go red here.
  const { dir, jsonPath } = tmpIndex();
  const store = openStore(jsonPath);
  store.upsertUnit(unit({ planPath: 'A.md', sectionId: PLAN_SENTINEL, kind: 'plan', embedding: randEmb(3, 1) }));
  store.upsertUnit(unit({ planPath: 'A.md', sectionId: 's1', embedding: randEmb(3, 2) }));
  store.upsertUnit(unit({ planPath: 'A.md', sectionId: 's2', embedding: randEmb(3, 3) }));
  store.upsertUnit(unit({ planPath: 'B.md', sectionId: 's1', embedding: randEmb(3, 4) }));

  // Act
  const paths = store.listPlanPaths().sort();

  // Assert — exactly the two DISTINCT plans, A collapsed from three units to one.
  assert.deepEqual(paths, ['A.md', 'B.md'], 'distinct planPaths only (A appears once despite 3 units)');
  cleanup(dir);
});

// ── listUnitSectionIds: a plan's section ids incl. the plan sentinel (740-746) ──

test('listUnitSectionIds_returns_only_the_given_plans_sections_including_the_sentinel', () => {
  // Arrange
  const { dir, jsonPath } = tmpIndex();
  const store = openStore(jsonPath);
  store.upsertUnit(unit({ planPath: 'A.md', sectionId: PLAN_SENTINEL, kind: 'plan', embedding: randEmb(3, 1) }));
  store.upsertUnit(unit({ planPath: 'A.md', sectionId: 's1', embedding: randEmb(3, 2) }));
  store.upsertUnit(unit({ planPath: 'A.md', sectionId: 's2', embedding: randEmb(3, 3) }));
  store.upsertUnit(unit({ planPath: 'B.md', sectionId: 'sX', embedding: randEmb(3, 4) })); // must NOT leak in

  // Act
  const ids = store.listUnitSectionIds('A.md').sort();

  // Assert — every section of A (sentinel + s1 + s2), and nothing from B.
  assert.deepEqual(ids, [PLAN_SENTINEL, 's1', 's2'].sort(), 'all of A\'s sections incl. sentinel, none of B\'s');
  cleanup(dir);
});

test('listUnitSectionIds_returns_empty_for_a_non_string_planPath', () => {
  // The `typeof planPath !== 'string'` guard (line 740) → [] instead of iterating.
  const { dir, jsonPath } = tmpIndex();
  const store = openStore(jsonPath);
  store.upsertUnit(unit({ planPath: 'A.md', sectionId: 's1', embedding: randEmb(3, 1) }));

  assert.deepEqual(store.listUnitSectionIds(undefined), [], 'non-string planPath → [] (guard, not a throw)');
  assert.deepEqual(store.listUnitSectionIds('missing.md'), [], 'unknown plan → []');
  cleanup(dir);
});

// ── search: query-type guard (757-758) ─────────────────────────────────────────

test('search_throws_TypeError_when_the_query_is_not_a_Float32Array', () => {
  const { dir, jsonPath } = tmpIndex();
  const store = openStore(jsonPath);
  store.upsertUnit(unit({ embedding: randEmb(3, 1) }));

  assert.throws(
    () => store.search([1, 0, 0], 5), // a plain array, not a Float32Array
    (err) => err instanceof TypeError && /Float32Array/.test(err.message),
    'a non-Float32Array query is a caller bug, not a silent empty result'
  );
  cleanup(dir);
});

// ── search: k-cap boundary — k<=0 or non-integer returns [] (764-765) ───────────

test('search_returns_empty_for_a_non_positive_or_non_integer_k', () => {
  const { dir, jsonPath } = tmpIndex();
  const store = openStore(jsonPath);
  store.upsertUnit(unit({ planPath: 'A.md', embedding: f32([1, 0, 0]) }));
  store.upsertUnit(unit({ planPath: 'B.md', embedding: f32([0, 1, 0]) }));
  const q = f32([1, 0, 0]);

  for (const k of [0, -1, 1.5, NaN]) {
    assert.deepEqual(store.search(q, k), [], `k=${k} → [] (no results despite matching units present)`);
  }
  // Sanity: a valid k DOES return, proving the [] above is the k-guard, not an empty store.
  assert.equal(store.search(q, 1).length, 1, 'k=1 caps to a single result');
  cleanup(dir);
});

// ── search: minScore threshold is STRICT `<` (equal is kept) (line 775) ─────────

test('search_minScore_keeps_a_result_scoring_exactly_at_the_threshold_and_drops_below', () => {
  // Arrange — X is identical to the query (cosine 1.0); Y is off-axis (cosine ~0.707).
  const { dir, jsonPath } = tmpIndex();
  const store = openStore(jsonPath);
  store.upsertUnit(unit({ planPath: 'X.md', embedding: f32([1, 0, 0]) }));
  store.upsertUnit(unit({ planPath: 'Y.md', embedding: f32([1, 1, 0]) }));

  // Act — threshold exactly at X's score. `score < minScore` is strict, so X (==1.0)
  // is KEPT and Y (0.707 < 1.0) is dropped. A `<`→`<=` mutant would drop X.
  const res = store.search(f32([1, 0, 0]), 10, { minScore: 1.0 });

  // Assert
  assert.equal(res.length, 1, 'exactly the at-threshold result survives');
  assert.equal(res[0].planPath, 'X.md', 'the score-==-minScore unit is kept (strict <, not <=)');
  assert.ok(Math.abs(res[0].score - 1.0) < 1e-6, 'kept score is at the threshold');
  cleanup(dir);
});

// ── search: a zero-magnitude query yields no ranking (line 767) ─────────────────

test('search_returns_empty_for_a_zero_vector_query_rather_than_fabricating_a_ranking', () => {
  const { dir, jsonPath } = tmpIndex();
  const store = openStore(jsonPath);
  store.upsertUnit(unit({ planPath: 'A.md', embedding: f32([1, 0, 0]) }));
  store.upsertUnit(unit({ planPath: 'B.md', embedding: f32([0, 1, 0]) }));

  // A zero query has no direction → cosine is undefined → [] (never NaN-scored hits).
  assert.deepEqual(store.search(f32([0, 0, 0]), 5), [], 'zero query → [], not a garbage/NaN ranking');
  cleanup(dir);
});

// ── search: a stored zero-norm unit scores exactly 0, never NaN (line 774) ──────

test('search_scores_a_zero_norm_stored_unit_as_exactly_zero_not_NaN', () => {
  // Arrange — an all-zero embedding is a valid (finite, non-empty) unit; its L2 norm
  // is 0, so denom = qNorm*0 = 0. The `denom === 0 ? 0 : dot/denom` guard must yield
  // 0 (not NaN from a divide-by-zero, which would corrupt the sort order).
  const { dir, jsonPath } = tmpIndex();
  const store = openStore(jsonPath);
  store.upsertUnit(unit({ planPath: 'ZERO.md', embedding: f32([0, 0, 0]) }));
  store.upsertUnit(unit({ planPath: 'REAL.md', embedding: f32([1, 0, 0]) }));

  // Act
  const res = store.search(f32([1, 0, 0]), 10);
  const zero = res.find(r => r.planPath === 'ZERO.md');
  const real = res.find(r => r.planPath === 'REAL.md');

  // Assert
  assert.ok(zero, 'the zero-norm unit is still returned');
  assert.equal(zero.score, 0, 'zero-norm unit scores exactly 0 (guard fired, no NaN)');
  assert.ok(real.score > zero.score, 'a real match outranks the zero-norm unit');
  assert.equal(res[0].planPath, 'REAL.md', 'sort order is not poisoned by a NaN score');
  cleanup(dir);
});

// ── view isolation: getUnit returns a defensive copy, not the stored record ─────

test('getUnit_returns_an_isolated_snapshot_that_cannot_mutate_the_store', () => {
  // Arrange
  const { dir, jsonPath } = tmpIndex();
  const store = openStore(jsonPath);
  store.upsertUnit(unit({ planPath: 'p.md', sectionId: 's1', embedding: f32([1, 2, 3]), files: ['a.js'] }));

  // Act — mutate the returned view aggressively.
  const view = store.getUnit('p.md', 's1');
  view.embedding[0] = 999;
  view.files.push('injected.js');

  // Assert — a fresh read is unaffected (the view was a copy, not an alias).
  const fresh = store.getUnit('p.md', 's1');
  assert.deepEqual(Array.from(fresh.embedding), [1, 2, 3], 'embedding is copied out; caller cannot corrupt it');
  assert.deepEqual(fresh.files, ['a.js'], 'files array is copied out; caller cannot corrupt it');
  cleanup(dir);
});
