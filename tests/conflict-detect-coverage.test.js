'use strict';

/**
 * conflict-detect coverage — the DARK branches of
 * src/lib/plan-index/conflict-detect.js that tests/plan-index-conflict.test.js
 * does not reach.
 *
 * Every test here pins a branch that goes RED under mutation. The sibling file
 * already proves the AND (similar ∧ file-overlap), the two hard-fails, the
 * fixture-driven happy paths, and most fail-open guards. This file deliberately
 * targets the remaining unlit branches and catch blocks:
 *
 *   • line 152  `matches / literals.length > 0.5`  — the EXACT-50% broad-glob
 *     boundary (`>` not `>=`): a glob matching exactly half the index literals is
 *     NOT "broad overlap".
 *   • line 264  `score >= threshold`               — EXACT equality is INCLUDED
 *     (`>=` not `>`): a candidate whose cosine equals the threshold is flagged.
 *   • line 248  `s > prev`                         — MAX-score grouping keeps the
 *     higher of two section scores for one candidate (not the first / lower).
 *   • line 169  `typeof v === 'number' && Number.isFinite(v)` — a non-number /
 *     non-finite `conflict_threshold` setting falls back to the 0.78 default.
 *   • line 139  `literals.length === 0`            — an all-glob index is never
 *     "broad".
 *   • line 97   `else matched.add(t)`              — both sides globs → the
 *     target glob is the surfaced overlap entry.
 *   • lines 82/84 second operands                  — empty-string files entries
 *     are skipped, real entries still match.
 *   • line 79 second operand                       — a similar candidate with an
 *     EMPTY files list is NOT a false positive.
 *   • line 212 second operand                      — a store whose `size` is not a
 *     number fails open to [].
 *   • line 215 `: []` / line 216 first operand     — a store with no
 *     getFilesForPlan, and a target whose files read is a non-array, fail open.
 *   • lines 236-237                                — `related` REJECTING (its
 *     seed read throws) degrades to [].
 *   • lines 122-123                                — a throwing index enumeration
 *     during the broad-glob check degrades the downgrade to "not broad", no throw.
 *   • lines 202-203                                — a throwing `getWiring`
 *     (uninjected store) fails open to [].
 *
 * Store construction is a REAL PI1 openStore over an os.tmpdir() temp JSON for the
 * data-driven cases; the fail-open-fault cases use minimal in-memory FAKE stores at
 * the store boundary (never a real Ollama / network backend). AI-authored; every
 * assertion read line-by-line against the production source before commit.
 */

const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');

const {
  detectConflicts,
  DEFAULT_CONFLICT_THRESHOLD,
} = require('../src/lib/plan-index/conflict-detect');
const { openStore, PLAN_SENTINEL } = require('../src/lib/plan-index/store');

let tmpDirs = [];

/**
 * A REAL PI1 store over a throwaway temp dir. Each plan is seeded as BOTH a
 * `__plan__` unit (the seed vector + files read by getFilesForPlan) and a
 * `section` unit (the vector detectConflicts scans via related(kind:'section')).
 * @param {Array<{planSlug:string, files:Array<*>, sectionVec:number[]}>} plans
 */
function buildStore(plans) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cd-cov-'));
  tmpDirs.push(dir);
  const store = openStore(path.join(dir, 'plan-index.json'));
  for (const p of plans) {
    store.upsertUnit({
      planPath: p.planSlug,
      sectionId: PLAN_SENTINEL,
      kind: 'plan',
      text: p.planSlug,
      files: (p.files || []).slice(),
      contentHash: `${p.planSlug}::plan`,
      embedding: Float32Array.from(p.sectionVec),
    });
    store.upsertUnit({
      planPath: p.planSlug,
      sectionId: 'goals',
      kind: 'section',
      text: p.planSlug,
      files: (p.files || []).slice(),
      contentHash: `${p.planSlug}::goals`,
      embedding: Float32Array.from(p.sectionVec),
    });
  }
  return store;
}

/** A spy embedder — must never run on the seeded path; asserts nothing here. */
function spyEmbedder() {
  const embedder = async (texts) => ({
    vectors: texts.map(() => Float32Array.from([1, 0, 0, 0, 0, 0, 0, 0])),
    source: 'spy',
  });
  return embedder;
}

const AXIS_X = [1, 0, 0, 0, 0, 0, 0, 0]; // cosine 1.0 against itself
const AXIS_Z = [0, 0, 0, 0, 0, 0, 0, 1]; // orthogonal to AXIS_X → cosine 0

after(() => {
  for (const d of tmpDirs) {
    try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* best-effort */ }
  }
  tmpDirs = [];
});

// ═══════════════════════════════════════════════════════════════════════════════
//  Boundary — the broad-glob downgrade uses `> 0.5`, so EXACTLY 50% is NOT broad.
// ═══════════════════════════════════════════════════════════════════════════════

test('broad-glob downgrade excludes a glob matching exactly 50% of index literals', async () => {
  // Arrange — index distinct literals: src/lib/auth.js (target) + other/x.js (2).
  // Candidate glob src/lib/** matches ONLY src/lib/auth.js → 1/2 = 0.50, not > 0.50.
  const store = buildStore([
    { planSlug: 't', files: ['src/lib/auth.js'], sectionVec: AXIS_X },
    { planSlug: 'cand-glob', files: ['src/lib/**'], sectionVec: AXIS_X }, // cos 1.0
    { planSlug: 'other-lit', files: ['other/x.js'], sectionVec: AXIS_Z }, // orthogonal, unflagged literal
  ]);

  // Act
  const rows = await detectConflicts('t', { store, embedder: spyEmbedder(), getSetting: () => 0.78 });

  // Assert — flagged, but NOT downgraded (0.50 is not > 0.50). Mutation `>`→`>=` reds this.
  const cand = rows.find((r) => r.conflictingPlan === 'cand-glob');
  assert.ok(cand, 'the glob candidate is flagged (similar + overlaps the literal)');
  assert.equal(cand.severity, 'potential conflict or dependency',
    'exactly 50% index-literal coverage is NOT "broad overlap"');
});

// ═══════════════════════════════════════════════════════════════════════════════
//  Boundary — the similarity half uses `score >= threshold`, so EXACT equality passes.
// ═══════════════════════════════════════════════════════════════════════════════

test('candidate whose cosine exactly equals the threshold is flagged (>= not >)', async () => {
  // Arrange — identical unit vectors → cosine is exactly 1.0; threshold set to 1.0.
  const store = buildStore([
    { planSlug: 't', files: ['src/lib/auth.js'], sectionVec: AXIS_X },
    { planSlug: 'twin', files: ['src/lib/auth.js'], sectionVec: AXIS_X },
  ]);

  // Act
  const rows = await detectConflicts('t', { store, embedder: spyEmbedder(), getSetting: () => 1.0 });

  // Assert — 1.0 >= 1.0 flags it; mutation `>=`→`>` would drop it (1.0 > 1.0 is false).
  assert.ok(rows.some((r) => r.conflictingPlan === 'twin'),
    'cosine == threshold must be INCLUDED (>= boundary)');
});

// ═══════════════════════════════════════════════════════════════════════════════
//  Grouping — two section scores for one candidate → the MAX is kept, not the first.
// ═══════════════════════════════════════════════════════════════════════════════

test('duplicate candidate sections keep the maximum section score after grouping', async () => {
  // Arrange — a FAKE store whose search returns two section hits for one candidate
  // in ASCENDING order (0.80 then 0.95). The lower arrives first, so `s > prev`
  // must REPLACE it with the higher. A naive first-wins / `s < prev` keeps 0.80.
  const store = {
    size: 2,
    getUnit: (p, s) => (p === 'target' && s === PLAN_SENTINEL
      ? { planPath: 'target', sectionId: PLAN_SENTINEL, kind: 'plan', embedding: Float32Array.from(AXIS_X), files: ['src/lib/auth.js'] }
      : null),
    search: () => ([
      { planPath: 'cand', sectionId: 's-lo', kind: 'section', score: 0.80, files: ['src/lib/auth.js'] },
      { planPath: 'cand', sectionId: 's-hi', kind: 'section', score: 0.95, files: ['src/lib/auth.js'] },
    ]),
    getFilesForPlan: (s) => (s === 'target' || s === 'cand' ? ['src/lib/auth.js'] : []),
    listPlanPaths: () => ['target', 'cand'],
  };

  // Act
  const rows = await detectConflicts('target', { store, embedder: spyEmbedder(), getSetting: () => 0.78 });

  // Assert — exactly one row for the candidate, carrying the MAX (0.95) score.
  assert.equal(rows.length, 1, 'the candidate is deduplicated to a single row');
  assert.equal(rows[0].conflictingPlan, 'cand');
  assert.equal(rows[0].score, 0.95, 'grouping keeps the higher section score, not the first-seen lower one');
});

// ═══════════════════════════════════════════════════════════════════════════════
//  Threshold fallback — a non-number / non-finite setting falls back to 0.78.
// ═══════════════════════════════════════════════════════════════════════════════

for (const { id, value } of [
  { id: 'NaN', value: NaN },
  { id: 'Infinity', value: Infinity },
  { id: 'negative-Infinity', value: -Infinity },
  { id: 'string', value: 'high' },
  { id: 'null', value: null },
  { id: 'undefined', value: undefined },
  { id: 'object', value: {} },
]) {
  test(`non-numeric conflict_threshold (${id}) falls back to the 0.78 default and still flags`, async () => {
    // Arrange — cand cosine 1.0. If the bad value were used directly as the
    // threshold, `1.0 >= NaN` / `1.0 >= 'high'` etc. is false → nothing flagged.
    // Only the 0.78 fallback flags it. Pins BOTH operands of line 169.
    const store = buildStore([
      { planSlug: 't', files: ['src/lib/auth.js'], sectionVec: AXIS_X },
      { planSlug: 'cand', files: ['src/lib/auth.js'], sectionVec: AXIS_X },
    ]);

    // Act
    const rows = await detectConflicts('t', { store, embedder: spyEmbedder(), getSetting: () => value });

    // Assert
    assert.equal(DEFAULT_CONFLICT_THRESHOLD, 0.78, 'default constant is 0.78');
    assert.ok(rows.some((r) => r.conflictingPlan === 'cand'),
      `a ${id} threshold setting must fall back to 0.78, not be used as the comparison operand`);
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
//  Glob semantics — all-glob index is never broad; both-glob overlap names target.
// ═══════════════════════════════════════════════════════════════════════════════

test('both-sides-glob overlap surfaces the target glob and is never "broad" in an all-glob index', async () => {
  // Arrange — target and candidate are BOTH globs that overlap. The index has NO
  // literal entries, so isBroadGlob short-circuits on literals.length === 0.
  const store = buildStore([
    { planSlug: 't', files: ['src/lib/**'], sectionVec: AXIS_X },
    { planSlug: 'cand', files: ['src/lib/auth/**'], sectionVec: AXIS_X }, // cos 1.0
  ]);

  // Act
  const rows = await detectConflicts('t', { store, embedder: spyEmbedder(), getSetting: () => 0.78 });

  // Assert — both globs → the TARGET glob is the surfaced overlap; no literals → not broad.
  const cand = rows.find((r) => r.conflictingPlan === 'cand');
  assert.ok(cand, 'overlapping glob candidate is flagged');
  assert.deepEqual(cand.overlappingFiles, ['src/lib/**'],
    'both-glob overlap lists the target glob (line 97 else branch)');
  assert.equal(cand.severity, 'potential conflict or dependency',
    'an index with zero literals is never downgraded to broad (line 139)');
});

test('empty-string files entries are skipped while a real shared entry still flags', async () => {
  // Arrange — an empty string on BOTH sides must be skipped (lines 82/84), the
  // real shared literal still matched.
  const store = buildStore([
    { planSlug: 't', files: ['', 'src/lib/auth.js'], sectionVec: AXIS_X },
    { planSlug: 'cand', files: ['src/lib/auth.js', ''], sectionVec: AXIS_X },
  ]);

  // Act
  const rows = await detectConflicts('t', { store, embedder: spyEmbedder(), getSetting: () => 0.78 });

  // Assert
  const cand = rows.find((r) => r.conflictingPlan === 'cand');
  assert.ok(cand, 'candidate flagged on the real shared literal');
  assert.deepEqual(cand.overlappingFiles, ['src/lib/auth.js'],
    'empty-string entries never enter the overlap set');
});

test('a similar candidate with an EMPTY files list is not a false positive', async () => {
  // Arrange — cand is above threshold (cos 1.0) but declares no files. The AND's
  // overlap half can never hold → it must not be flagged (line 79 second operand).
  const store = buildStore([
    { planSlug: 't', files: ['src/lib/auth.js'], sectionVec: AXIS_X },
    { planSlug: 'cand', files: [], sectionVec: AXIS_X },
  ]);

  // Act
  const rows = await detectConflicts('t', { store, embedder: spyEmbedder(), getSetting: () => 0.78 });

  // Assert
  assert.ok(!rows.some((r) => r.conflictingPlan === 'cand'),
    'similarity alone (no files) must never flag — no false positive');
});

// ═══════════════════════════════════════════════════════════════════════════════
//  Store guards — non-number size, missing getFilesForPlan, non-array target files.
// ═══════════════════════════════════════════════════════════════════════════════

test('a store whose size is not a number fails open to []', async () => {
  // Arrange — line 212 second operand: `typeof store.size !== 'number'`.
  const store = { size: 'lots', getFilesForPlan: () => ['src/lib/auth.js'] };

  // Act
  const rows = await detectConflicts('t', { store, embedder: spyEmbedder() });

  // Assert
  assert.deepEqual(rows, [], 'non-number size → [] (never a throw into the caller)');
});

test('a store missing getFilesForPlan fails open to [] before any similarity work', async () => {
  // Arrange — line 215 `: []` false branch → targetFiles empty → line 216 returns.
  const store = { size: 3, listPlanPaths: () => [], search: () => [] }; // no getFilesForPlan

  // Act
  const rows = await detectConflicts('t', { store, embedder: spyEmbedder() });

  // Assert
  assert.deepEqual(rows, [], 'no getFilesForPlan → no target files → []');
});

test('a target whose files read is a non-array fails open to []', async () => {
  // Arrange — line 216 first operand: `!Array.isArray(targetFiles)`.
  const store = { size: 3, getFilesForPlan: () => null, listPlanPaths: () => [], search: () => [] };

  // Act
  const rows = await detectConflicts('t', { store, embedder: spyEmbedder() });

  // Assert
  assert.deepEqual(rows, [], 'non-array target files → [] (overlap half can never hold)');
});

// ═══════════════════════════════════════════════════════════════════════════════
//  Fail-open catches — related rejects, index enumeration throws, getWiring throws.
// ═══════════════════════════════════════════════════════════════════════════════

test('related() REJECTING (its seed read throws) degrades to [] without rejecting', async () => {
  // Arrange — getUnit throws OUTSIDE related's internal try (it runs before the
  // try), so related() rejects; detectConflicts must catch it (lines 236-237).
  const store = {
    size: 1,
    getFilesForPlan: (s) => (s === 't' ? ['src/lib/auth.js'] : []),
    getUnit: () => { throw new Error('seed read boom'); },
    listPlanPaths: () => ['t'],
  };

  // Act + Assert
  let rows;
  await assert.doesNotReject(
    async () => { rows = await detectConflicts('t', { store, embedder: spyEmbedder(), getSetting: () => 0.78 }); },
    'a rejecting related() must never propagate out of detectConflicts',
  );
  assert.deepEqual(rows, [], 'related rejection degrades to []');
});

test('a throwing index enumeration during the broad-glob check degrades to "not broad", no throw', async () => {
  // Arrange — a REAL store, but listPlanPaths patched to throw. The flagged
  // candidate carries a glob, so indexFiles() → collectAllIndexFiles() runs and
  // hits the throw (lines 122-123). The row is still emitted, non-broad.
  const store = buildStore([
    { planSlug: 't', files: ['src/lib/auth.js'], sectionVec: AXIS_X },
    { planSlug: 'cand', files: ['src/lib/**'], sectionVec: AXIS_X }, // glob → triggers indexFiles()
  ]);
  store.listPlanPaths = () => { throw new Error('enumeration boom'); };

  // Act + Assert
  let rows;
  await assert.doesNotReject(
    async () => { rows = await detectConflicts('t', { store, embedder: spyEmbedder(), getSetting: () => 0.78 }); },
    'a throwing enumeration must not crash detectConflicts',
  );
  const cand = rows.find((r) => r.conflictingPlan === 'cand');
  assert.ok(cand, 'candidate still flagged despite the enumeration fault');
  assert.equal(cand.severity, 'potential conflict or dependency',
    'a broken enumeration disables the downgrade (fails to "not broad"), never throws');
});

test('a throwing getWiring (uninjected store) fails open to []', async () => {
  // Arrange — inject only the embedder so store === undefined enters the wiring
  // block; poison ./wiring at the module boundary so getWiring throws (lines
  // 202-203). Restore the cache afterwards.
  const wiringPath = require.resolve('../src/lib/plan-index/wiring');
  const prev = require.cache[wiringPath];
  require.cache[wiringPath] = {
    id: wiringPath,
    filename: wiringPath,
    loaded: true,
    exports: { getWiring: () => { throw new Error('wiring boom'); } },
  };

  try {
    // Act + Assert
    let rows;
    await assert.doesNotReject(
      async () => { rows = await detectConflicts('some-plan', { embedder: spyEmbedder(), getSetting: () => 0.78 }); },
      'a throwing getWiring must be caught (fail-open)',
    );
    assert.deepEqual(rows, [], 'wiring throw → no store → []');
  } finally {
    if (prev) require.cache[wiringPath] = prev;
    else delete require.cache[wiringPath];
  }
});
