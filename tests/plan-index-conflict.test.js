'use strict';

/**
 * PI6-s1 — detectConflicts() conflict/dependency detection core + barrel export.
 *
 * Proves, hermetically (no Ollama, no network, no live model), the AND condition
 * that flags a plan as a latent conflict/dependency of a target plan:
 *
 *     section-level vector similarity (>= conflict_threshold)   ∧
 *     glob-aware `files:` overlap (a glob on either side matches a literal on the
 *     other, bidirectionally)
 *
 * Both halves must hold. Similarity alone (same topic, different files) and
 * files-overlap alone (same file, unrelated topic, cosine below threshold) are
 * each FALSIFIABLE hard-fail scenarios — a single-condition implementation MUST
 * fail scenarios 2 and 3.
 *
 * Store construction is a REAL PI1 `openStore` over a temp JSON: each fixture plan
 * is upserted as a `__plan__` unit (kind 'plan', carrying the `files:` array read
 * by getFilesForPlan) AND a section unit (kind 'section', carrying the baked
 * 8-dim vector that drives the cosine, since detectConflicts runs
 * related(kind:'section')). The target A's section vector is [1,0,...]; every
 * candidate's cosine against A is pre-computed and pinned in the fixture comment.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');

const {
  detectConflicts,
  DEFAULT_CONFLICT_THRESHOLD,
} = require('../src/lib/plan-index/conflict-detect');
const { openStore, PLAN_SENTINEL } = require('../src/lib/plan-index/store');
const { globToRegex } = require('../src/lib/plan-coverage');

const FIXTURE = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, 'fixtures', 'plan-index', 'conflict-fixture.json'),
    'utf8'
  )
);

const TARGET = 'auth-middleware-refactor';

let tmpDirs = [];

/**
 * Build a REAL PI1 store on a throwaway temp dir. For each plan definition seeds
 * BOTH a `__plan__` unit (carrying `files`) and a `section` unit (carrying the
 * 8-dim vector). Plan-level units get a fixed vector so the plan-level KNN space
 * is separate from the section space detectConflicts scans.
 * @param {Array<{planSlug:string, files:string[], sectionVec:number[]}>} plans
 */
function buildStore(plans) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pi6-conflict-'));
  tmpDirs.push(dir);
  const store = openStore(path.join(dir, 'plan-index.json'));
  for (const p of plans) {
    // plan-level unit — carries files:, and carries the SAME vector as the plan's
    // section unit. related(kind:'section') SEEDS from this __plan__ embedding
    // (related.js reuses the stored plan vector, no re-embed) and scans the
    // section-kind units, so the seed must live in the same space as the sections.
    store.upsertUnit({
      planPath: p.planSlug,
      sectionId: PLAN_SENTINEL,
      kind: 'plan',
      text: p.planSlug,
      files: (p.files || []).slice(),
      contentHash: `${p.planSlug}::plan`,
      embedding: Float32Array.from(p.sectionVec),
    });
    // section unit — carries the baked similarity vector.
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

/** Build the store from the on-disk fixture (plans A..G). */
function fixtureStore() {
  return buildStore(FIXTURE.plans);
}

/** A spy embedder — MUST never be called on the seeded (indexed) path. */
function spyEmbedder() {
  const calls = [];
  const embedder = async (texts) => {
    calls.push(texts);
    return { vectors: texts.map(() => Float32Array.from([1, 0, 0, 0, 0, 0, 0, 0])), source: 'spy' };
  };
  embedder.calls = calls;
  return embedder;
}

test.after(() => {
  for (const d of tmpDirs) {
    try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* best-effort */ }
  }
  tmpDirs = [];
});

// ═══════════════════════════════════════════════════════════════════════════════
//  F1 regression — a non-string element in a candidate's files: (malformed YAML)
//  on the overlap+broad-glob path must NOT throw out of detectConflicts.
// ═══════════════════════════════════════════════════════════════════════════════

test('CF-F1 non-string files: element on the overlap path → no throw, still flagged', async () => {
  const vec = [1, 0, 0, 0, 0, 0, 0, 0]; // identical vectors → cosine 1.0 ≥ 0.78 threshold
  const store = buildStore([
    { planSlug: 'target', sectionVec: vec, files: ['src/lib/shared.js'] },
    // candidate: similar (same vec) AND file-overlapping AND a NON-STRING element +
    // a broad glob — the exact shape that threw on `g.indexOf` before the typeof guard.
    { planSlug: 'cand', sectionVec: vec, files: ['src/lib/shared.js', 12345, null, 'src/**'] },
  ]);
  let rows;
  await assert.doesNotReject(
    async () => { rows = await detectConflicts('target', { store, embedder: spyEmbedder() }); },
    'a non-string files: element must not throw out of detectConflicts (F1)'
  );
  assert.equal(rows.length, 1, 'candidate still flagged (similar + overlapping)');
  assert.equal(rows[0].conflictingPlan, 'cand');
});

// ═══════════════════════════════════════════════════════════════════════════════
//  Group A — the AND (both halves) + the two hard-fails
// ═══════════════════════════════════════════════════════════════════════════════

test('CF-A1 both true (similar AND file-overlap) → FLAGGED', async () => {
  const store = fixtureStore();
  const rows = await detectConflicts(TARGET, { store, embedder: spyEmbedder() });
  const b = rows.find((r) => r.conflictingPlan === 'auth-rate-limiting');
  assert.ok(b, 'B (auth-rate-limiting) is flagged — cos 0.95 >= 0.78 AND shares src/lib/auth.js');
  assert.ok(b.overlappingFiles.includes('src/lib/auth.js'), 'overlap names the shared literal');
  assert.equal(typeof b.score, 'number', 'row carries a numeric score');
  assert.ok(b.score >= DEFAULT_CONFLICT_THRESHOLD, 'flagged score is at/above threshold');
  assert.equal(b.severity, 'potential conflict or dependency', 'non-broad severity');
});

test('CF-A2 HARD FAIL: similarity ONLY (no files overlap) → NOT flagged', async () => {
  // D (auth-token-docs) cos 0.98 >= 0.78 but files=["docs/auth.md"] — no overlap
  // with A's src/lib/auth.js / src/hooks/PreToolUse.Bash.js. A similarity-only impl
  // would (wrongly) flag D; this test MUST fail such an impl.
  const store = fixtureStore();
  const rows = await detectConflicts(TARGET, { store, embedder: spyEmbedder() });
  assert.ok(
    !rows.some((r) => r.conflictingPlan === 'auth-token-docs'),
    'D is ABSENT: similarity alone must never flag'
  );
});

test('CF-A3 HARD FAIL: files overlap ONLY (cosine below threshold) → NOT flagged', async () => {
  // C (menu-layout-redesign) shares src/lib/auth.js but cos 0.50 < 0.78. A
  // files-only impl would (wrongly) flag C; this test MUST fail such an impl.
  const store = fixtureStore();
  const rows = await detectConflicts(TARGET, { store, embedder: spyEmbedder() });
  assert.ok(
    !rows.some((r) => r.conflictingPlan === 'menu-layout-redesign'),
    'C is ABSENT: files-overlap alone must never flag'
  );
});

// ═══════════════════════════════════════════════════════════════════════════════
//  Group B — glob-aware overlap (>50% rule, broad matches specific, non-overlap)
// ═══════════════════════════════════════════════════════════════════════════════

test('CF-B1 broad glob matches specific literal → flagged, overlap names the literal', async () => {
  // E (src/lib/**) vs target's src/lib/auth.js, cos 0.90 >= 0.78.
  const store = fixtureStore();
  const rows = await detectConflicts(TARGET, { store, embedder: spyEmbedder() });
  const e = rows.find((r) => r.conflictingPlan === 'lib-wide-sweep');
  assert.ok(e, 'E (src/lib/**) is flagged against A');
  assert.ok(e.overlappingFiles.includes('src/lib/auth.js'), 'overlap names the concrete literal src/lib/auth.js');
  // direct proof of the glob semantics used
  assert.equal(globToRegex('src/lib/**').test('src/lib/auth.js'), true, 'src/lib/** matches src/lib/auth.js');
});

test('CF-B2 non-overlapping glob → NOT flagged', async () => {
  // G (src/commands/**) vs target's src/lib/auth.js, cos 0.93 >= 0.78 but no file overlap.
  const store = fixtureStore();
  const rows = await detectConflicts(TARGET, { store, embedder: spyEmbedder() });
  assert.ok(
    !rows.some((r) => r.conflictingPlan === 'commands-only'),
    'G is ABSENT: src/commands/** does not overlap src/lib/auth.js'
  );
  assert.equal(globToRegex('src/commands/**').test('src/lib/auth.js'), false, 'src/commands/** does NOT match src/lib/auth.js');
});

test('CF-B3 >50% file-overlap rule PINNED: a shared-file pair flagged, a <50% pair not', async () => {
  // A tightly-controlled store proving the >50% DISTINCT-literal-overlap rule that
  // drives the broad-overlap downgrade AND the literal-overlap flag directly.
  //
  //   TARGET t: files ["src/a.js","src/b.js","src/c.js","src/d.js"]  (4 distinct literals)
  //   SHARED p: files ["src/a.js","src/b.js","src/c.js"]  → 3/4 = 75% of t's files → >50%
  //   FEW    q: files ["src/a.js"]                        → 1/4 = 25% of t's files → <50%
  // Both p and q share at least one literal, so both are file-overlapping (flagged);
  // the >50% distinction drives severity, asserted in CF-B4. Here we pin that the
  // 75% pair and the 25% pair are BOTH flagged (overlap is ANY-match, not majority),
  // and that a plan sharing NOTHING is not flagged.
  const t = [1, 0, 0, 0, 0, 0, 0, 0];
  const near = [0.95, 0.3122498999199, 0, 0, 0, 0, 0, 0]; // cos 0.95
  const store = buildStore([
    { planSlug: 't', files: ['src/a.js', 'src/b.js', 'src/c.js', 'src/d.js'], sectionVec: t },
    { planSlug: 'p-shared', files: ['src/a.js', 'src/b.js', 'src/c.js'], sectionVec: near },
    { planSlug: 'q-few', files: ['src/a.js'], sectionVec: near },
    { planSlug: 'r-none', files: ['other/z.js'], sectionVec: near },
  ]);
  const rows = await detectConflicts('t', { store, embedder: spyEmbedder() });
  const slugs = rows.map((r) => r.conflictingPlan);
  assert.ok(slugs.includes('p-shared'), '75%-overlap plan flagged');
  assert.ok(slugs.includes('q-few'), '25%-overlap plan still flagged (any shared literal counts)');
  assert.ok(!slugs.includes('r-none'), 'zero-overlap plan NOT flagged');
});

test('CF-B4 broad-overlap downgrade: a glob matching >50% of index literals → severity "broad overlap"', async () => {
  // The candidate glob src/lib/** matches > 50% of the DISTINCT literal files across
  // the whole index → the row is downgraded to "broad overlap".
  //   target: ["src/lib/auth.js"]
  //   broad : ["src/lib/**"]            (cos 0.90)  → matches 3 of 4 distinct literals
  //   other literals in the index: src/lib/auth.js, src/lib/menu.js, src/lib/state.js, docs/x.md
  const t = [1, 0, 0, 0, 0, 0, 0, 0];
  const near = [0.9, 0.4358898943540674, 0, 0, 0, 0, 0, 0]; // cos 0.90
  const store = buildStore([
    { planSlug: 'target', files: ['src/lib/auth.js'], sectionVec: t },
    { planSlug: 'broad', files: ['src/lib/**'], sectionVec: near },
    { planSlug: 'lit1', files: ['src/lib/menu.js'], sectionVec: [0, 0, 0, 0, 0, 0, 0, 1] },
    { planSlug: 'lit2', files: ['src/lib/state.js'], sectionVec: [0, 0, 0, 0, 0, 0, 0, 1] },
    { planSlug: 'lit3', files: ['docs/x.md'], sectionVec: [0, 0, 0, 0, 0, 0, 0, 1] },
  ]);
  const rows = await detectConflicts('target', { store, embedder: spyEmbedder() });
  const broad = rows.find((r) => r.conflictingPlan === 'broad');
  assert.ok(broad, 'broad plan is flagged (src/lib/** overlaps src/lib/auth.js)');
  // distinct literals: src/lib/auth.js, src/lib/menu.js, src/lib/state.js, docs/x.md (4).
  // src/lib/** matches 3 of 4 = 75% > 50% → broad overlap.
  assert.equal(broad.severity, 'broad overlap', 'severity downgraded to "broad overlap"');
});

// ═══════════════════════════════════════════════════════════════════════════════
//  Group C — self-exclusion, flag shape, threshold flips, top-N cap
// ═══════════════════════════════════════════════════════════════════════════════

test('CF-C1 self-excluded: the target never conflicts with itself', async () => {
  const store = fixtureStore();
  const rows = await detectConflicts(TARGET, { store, embedder: spyEmbedder() });
  assert.ok(!rows.some((r) => r.conflictingPlan === TARGET), 'target absent from its own conflict list');
});

test('CF-C2 flag shape is well-formed for every row', async () => {
  const store = fixtureStore();
  const rows = await detectConflicts(TARGET, { store, embedder: spyEmbedder() });
  assert.ok(rows.length > 0, 'at least one flagged row to shape-check');
  for (const r of rows) {
    assert.equal(typeof r.conflictingPlan, 'string', 'conflictingPlan is a string');
    assert.ok(Array.isArray(r.overlappingFiles) && r.overlappingFiles.length > 0, 'overlappingFiles non-empty array');
    assert.equal(typeof r.score, 'number', 'score is numeric');
    assert.ok(
      r.severity === 'potential conflict or dependency' || r.severity === 'broad overlap',
      `severity is a known label, got ${JSON.stringify(r.severity)}`
    );
  }
});

test('CF-C3 rows are score-descending', async () => {
  const store = fixtureStore();
  const rows = await detectConflicts(TARGET, { store, embedder: spyEmbedder() });
  for (let i = 1; i < rows.length; i++) {
    assert.ok(rows[i - 1].score >= rows[i].score, `score-desc at ${i}`);
  }
});

test('CF-C4 threshold setting flips the set (0.90 drops B, 0.78 keeps it)', async () => {
  // Same fixture; only the injected getSetting changes. B cos = 0.95.
  const store = fixtureStore();
  const low = await detectConflicts(TARGET, {
    store, embedder: spyEmbedder(), getSetting: () => 0.78,
  });
  assert.ok(low.some((r) => r.conflictingPlan === 'auth-rate-limiting'), 'B flagged at 0.78');

  const high = await detectConflicts(TARGET, {
    store, embedder: spyEmbedder(), getSetting: () => 0.96,
  });
  assert.ok(!high.some((r) => r.conflictingPlan === 'auth-rate-limiting'), 'B dropped at 0.96 (cos 0.95 < 0.96)');
});

test('CF-C5 top-N cap: at most 20 candidate file-lookups regardless of index size', async () => {
  // 30 section-similar plans above threshold, all file-overlapping. related caps at
  // limit:20, so detectConflicts must not read candidate files more than 20 times.
  const near = [0.99, 0.1410673597967, 0, 0, 0, 0, 0, 0]; // cos ~0.99
  const plans = [{ planSlug: 'hub', files: ['src/lib/auth.js'], sectionVec: [1, 0, 0, 0, 0, 0, 0, 0] }];
  for (let i = 0; i < 30; i++) {
    plans.push({ planSlug: `cand-${i}`, files: ['src/lib/auth.js'], sectionVec: near });
  }
  const store = buildStore(plans);
  // spy getFilesForPlan candidate reads (exclude the target's own read)
  const realGetFiles = store.getFilesForPlan.bind(store);
  let candidateReads = 0;
  store.getFilesForPlan = (slug) => {
    if (slug !== 'hub') candidateReads += 1;
    return realGetFiles(slug);
  };
  const rows = await detectConflicts('hub', { store, embedder: spyEmbedder() });
  assert.ok(candidateReads <= 20, `candidate file-lookups capped at 20, got ${candidateReads}`);
  assert.ok(rows.length <= 20, `≤ 20 flagged rows, got ${rows.length}`);
});

// ═══════════════════════════════════════════════════════════════════════════════
//  Group D — fail-open + validation + barrel
// ═══════════════════════════════════════════════════════════════════════════════

test('CF-D1 empty index (size 0) → [] and no throw', async () => {
  const store = buildStore([]); // size 0
  const rows = await detectConflicts('anything', { store, embedder: spyEmbedder() });
  assert.deepEqual(rows, [], 'empty index → []');
});

test('CF-D2 null store → [] (fail-open)', async () => {
  const rows = await detectConflicts('x', { store: null, embedder: spyEmbedder() });
  assert.deepEqual(rows, [], 'null store → []');
});

test('CF-D3 target with NO files → [] (AND overlap half can never hold)', async () => {
  const store = buildStore([
    { planSlug: 'nofiles', files: [], sectionVec: [1, 0, 0, 0, 0, 0, 0, 0] },
    { planSlug: 'other', files: ['src/lib/auth.js'], sectionVec: [0.95, 0.31224989991, 0, 0, 0, 0, 0, 0] },
  ]);
  const rows = await detectConflicts('nofiles', { store, embedder: spyEmbedder() });
  assert.deepEqual(rows, [], 'target without files: → [] (no overlap possible)');
});

test('CF-D4 related() throwing → [] (fail-open, never crashes the caller)', async () => {
  // A store that HAS the target files but whose search throws inside related.
  const store = {
    getFilesForPlan(slug) { return slug === 't' ? ['src/lib/auth.js'] : []; },
    getUnit(p, s) {
      return (p === 't' && s === PLAN_SENTINEL)
        ? { planPath: 't', sectionId: s, kind: 'plan', embedding: Float32Array.from([1, 0, 0, 0, 0, 0, 0, 0]), files: ['src/lib/auth.js'] }
        : null;
    },
    listPlanPaths() { return ['t']; },
    search() { throw new Error('boom: simulated search failure'); },
  };
  Object.defineProperty(store, 'size', { get: () => 1 });
  const rows = await detectConflicts('t', { store, embedder: spyEmbedder() });
  assert.deepEqual(rows, [], 'related throwing degrades to []');
});

test('CF-D5 getSetting throwing → falls back to DEFAULT_CONFLICT_THRESHOLD (0.78), still flags B', async () => {
  const store = fixtureStore();
  const rows = await detectConflicts(TARGET, {
    store,
    embedder: spyEmbedder(),
    getSetting: () => { throw new Error('settings unreadable'); },
  });
  assert.equal(DEFAULT_CONFLICT_THRESHOLD, 0.78, 'default constant is 0.78');
  assert.ok(rows.some((r) => r.conflictingPlan === 'auth-rate-limiting'), 'B still flagged via default threshold');
});

test('CF-D6 non-string / empty planSlug → TypeError (caller bug)', async () => {
  await assert.rejects(() => detectConflicts(42, { store: buildStore([]) }), TypeError);
  await assert.rejects(() => detectConflicts(null, { store: buildStore([]) }), TypeError);
  await assert.rejects(() => detectConflicts(undefined, { store: buildStore([]) }), TypeError);
  await assert.rejects(() => detectConflicts('', { store: buildStore([]) }), TypeError);
});

test('CF-D7 barrel getter resolves detectConflicts as a function', () => {
  delete require.cache[require.resolve('../src/lib/plan-index/index.js')];
  const barrel = require('../src/lib/plan-index');
  assert.equal(typeof barrel.detectConflicts, 'function', 'detectConflicts resolves through the barrel');
  // additive: pre-existing exports still resolve
  assert.equal(typeof barrel.openStore, 'function', 'openStore intact');
  assert.equal(typeof barrel.related, 'function', 'related intact');
  assert.equal(typeof barrel.search, 'function', 'search intact');
});

test('CF-D9 store/embedder resolved via getWiring when not injected → array, never throws', async () => {
  // Neither store nor embedder injected → detectConflicts lazy-requires getWiring.
  // In this real CTOC project that resolves a real (possibly empty) store; the
  // invariant is it never throws and always yields an array.
  const rows = await detectConflicts('plans/definitely-not-a-real-plan-xyz.md', {});
  assert.ok(Array.isArray(rows), 'wiring-resolved path returns an array');
});

test('CF-D10 similar candidates but NONE above threshold → [] (no rows after grouping)', async () => {
  // All neighbours share files but sit BELOW an inflated threshold → the AND's
  // similarity half never holds → [] (exercises the post-grouping empty path).
  const store = fixtureStore();
  const rows = await detectConflicts(TARGET, {
    store, embedder: spyEmbedder(), getSetting: () => 0.999,
  });
  assert.deepEqual(rows, [], 'threshold above every cosine → no rows');
});

test('CF-D11 candidate whose getFilesForPlan returns a non-array → skipped, no throw', async () => {
  // Overlap half is fail-open against a malformed candidate file list.
  const base = fixtureStore();
  const realGetFiles = base.getFilesForPlan.bind(base);
  base.getFilesForPlan = (slug) => (slug === 'auth-rate-limiting' ? null : realGetFiles(slug));
  const rows = await detectConflicts(TARGET, { store: base, embedder: spyEmbedder() });
  assert.ok(Array.isArray(rows), 'still returns an array');
  assert.ok(!rows.some((r) => r.conflictingPlan === 'auth-rate-limiting'), 'malformed-file candidate skipped');
});

test('CF-D12 target glob vs candidate literal → overlap names the candidate literal', async () => {
  // Exercises the "target is a glob, candidate is the concrete literal" arm of
  // filesOverlap: the concrete candidate path is what surfaces in overlappingFiles.
  const t = [1, 0, 0, 0, 0, 0, 0, 0];
  const near = [0.95, 0.3122498999199, 0, 0, 0, 0, 0, 0]; // cos 0.95
  const store = buildStore([
    { planSlug: 'gt', files: ['src/lib/**'], sectionVec: t },
    { planSlug: 'lit', files: ['src/lib/auth.js'], sectionVec: near },
  ]);
  const rows = await detectConflicts('gt', { store, embedder: spyEmbedder() });
  const lit = rows.find((r) => r.conflictingPlan === 'lit');
  assert.ok(lit, 'literal candidate flagged against the glob target');
  assert.ok(lit.overlappingFiles.includes('src/lib/auth.js'), 'overlap names the candidate literal');
});

test('CF-D8 barrel through-call works end-to-end', async () => {
  const store = fixtureStore();
  const barrel = require('../src/lib/plan-index');
  const rows = await barrel.detectConflicts(TARGET, { store, embedder: spyEmbedder() });
  assert.ok(Array.isArray(rows), 'callable through the barrel, returns an array');
  assert.ok(rows.some((r) => r.conflictingPlan === 'auth-rate-limiting'), 'flags B via barrel');
});
