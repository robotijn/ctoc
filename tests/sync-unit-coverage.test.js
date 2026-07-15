'use strict';

/**
 * Coverage + mutation hardening for `src/lib/plan-index/sync-unit.js`.
 *
 * `syncUnit` is the single idempotent write path for the semantic plan index: read a
 * plan FRESH from disk, split it into units (one `__plan__` unit whose text is the whole
 * body + one unit per `## ` section), hash each unit against the retrieval-affecting
 * frontmatter, compare to the stored `contentHash`, and re-embed + upsert ONLY the units
 * whose hash changed. The behaviour under test is the DECISION for each unit:
 *
 *   - NEW unit (no prior)                 → embed + upsert, sectionId returned in `changed`
 *   - CHANGED unit (prior hash != new)    → re-embed + upsert, sectionId returned
 *   - UNCHANGED unit (prior hash == new)  → skip: NO embed, NO upsert, NOT in `changed`
 *
 * Every test below pins a branch that goes RED under the obvious mutation. A mutant that
 * re-embeds an unchanged unit, skips a changed one, drops metadata from the hash, mangles
 * the calibration/ENOENT/embedder-shape fallbacks, or keys the store by the wrong path
 * must fail at least one assertion here.
 *
 * Boundaries only: the store and the embedder are in-memory FAKES at the true seam (the
 * module injects both as params — it never requires a real store or a live embedder). The
 * filesystem is real: plan files are written under os.tmpdir() and removed in `finally`,
 * so the read-fresh path exercises genuine byte-for-byte I/O.
 *
 * Does NOT duplicate tests/w07-crlf-syncunit-metrics.test.js, which already pins
 * `splitFrontmatter` and the `parseFrontmatterFields` block-list / parentVision / status
 * paths under CRLF. This file targets the DARK branches: syncUnit's whole decision engine,
 * normalizePath, splitSections, parseUnits, the inline `files:` forms, and logNote.
 *
 * AI-authored (unit-test-writer skill); every assertion read line-by-line by a human.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');

const {
  syncUnit,
  normalizePath,
  parseUnits,
  splitSections,
  parseFrontmatterFields,
} = require('../src/lib/plan-index/sync-unit');

// ── boundary fakes ────────────────────────────────────────────────────────────

// In-memory store: a real working implementation of the getUnit/upsertUnit contract,
// keyed exactly as syncUnit keys it (`${planPath}#${sectionId}`). NOT a mock — it stores
// what upsertUnit is handed and returns it on getUnit, so the module's real hash-diff
// logic drives the add/update/skip decision.
function makeStore() {
  const units = new Map();
  return {
    units,
    getUnit(planPath, sectionId) {
      return units.get(`${planPath}#${sectionId}`) || null;
    },
    upsertUnit(rec) {
      units.set(`${rec.planPath}#${rec.sectionId}`, { ...rec });
    },
  };
}

// Embedder fake at the boundary: records each call and returns the array form by default.
function makeEmbedder({ form = 'array', vector } = {}) {
  const calls = [];
  const fn = async (texts) => {
    calls.push(texts);
    const v = vector !== undefined ? vector : new Float32Array([0.11, 0.22, 0.33]);
    if (form === 'object') return { vectors: [v] };
    if (form === 'raw') return v; // deliberately malformed: not array, no .vectors
    if (form === 'emptyVectors') return { vectors: [] };
    return [v]; // 'array'
  };
  fn.calls = calls;
  return fn;
}

// Write a plan file into a fresh tmp dir. Returns { dir, planPath }.
function writePlan(content, { subdir = 'plans/todo', name = 'x.md' } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sync-unit-'));
  const full = path.join(dir, ...subdir.split('/'));
  fs.mkdirSync(full, { recursive: true });
  const planPath = path.join(full, name);
  fs.writeFileSync(planPath, content);
  return { dir, planPath };
}
function rmDir(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best-effort */ }
}

const PLAN_SENTINEL = '__plan__';

// A canonical two-section plan reused across the decision tests.
const TWO_SECTION_PLAN = [
  '---',
  'status: todo',
  'files:',
  '  - src/a.js',
  '---',
  '',
  '## Alpha',
  '',
  'aaa',
  '',
  '## Beta',
  '',
  'bbb',
  '',
].join('\n');

// ─────────────────────────────────────────────────────────────────────────────
// Cluster 1 — the add / update / skip DECISION (the core of syncUnit).
// ─────────────────────────────────────────────────────────────────────────────

test('syncUnit_inserts_every_unit_on_first_sync_of_a_new_plan [kills: skipping a NEW unit]', async () => {
  // Arrange
  const { dir, planPath } = writePlan(TWO_SECTION_PLAN);
  const store = makeStore();
  const embedder = makeEmbedder();
  try {
    // Act
    const res = await syncUnit(planPath, { store, embedder, calibrationReady: () => true, plansRoot: path.join(dir, 'plans') });

    // Assert — plan unit + both sections embedded and returned; three stored records.
    assert.deepEqual(res, {
      changed: [PLAN_SENTINEL, 'sec-1-alpha', 'sec-2-beta'],
      skipped: false,
    });
    assert.equal(embedder.calls.length, 3, 'one embed per new unit');
    assert.equal(store.units.size, 3, 'plan unit + two section units persisted');
  } finally { rmDir(dir); }
});

test('syncUnit_resync_of_unchanged_plan_skips_every_unit [kills: dropping the prior.contentHash===h skip]', async () => {
  // Arrange — sync once to populate the store, then sync the identical bytes again.
  const { dir, planPath } = writePlan(TWO_SECTION_PLAN);
  const store = makeStore();
  const embedder = makeEmbedder();
  const deps = { store, embedder, calibrationReady: () => true, plansRoot: path.join(dir, 'plans') };
  try {
    await syncUnit(planPath, deps);
    const afterFirst = embedder.calls.length;

    // Act — nothing on disk changed.
    const res = await syncUnit(planPath, deps);

    // Assert — no re-embed, no change list. A mutant that re-embeds unchanged units
    // (drops the `continue`) makes `changed` non-empty and bumps the embed count.
    assert.deepEqual(res, { changed: [], skipped: false });
    assert.equal(embedder.calls.length, afterFirst, 'NOT one further embed happened for an unchanged plan');
  } finally { rmDir(dir); }
});

test('syncUnit_reembeds_only_the_changed_units_not_the_whole_plan [kills: re-embedding all units on any edit]', async () => {
  // Arrange — first sync, then edit only section Beta's body.
  const { dir, planPath } = writePlan(TWO_SECTION_PLAN);
  const store = makeStore();
  const embedder = makeEmbedder();
  const deps = { store, embedder, calibrationReady: () => true, plansRoot: path.join(dir, 'plans') };
  try {
    await syncUnit(planPath, deps);
    const afterFirst = embedder.calls.length; // 3
    fs.writeFileSync(planPath, TWO_SECTION_PLAN.replace('bbb', 'bbb-CHANGED'));

    // Act
    const res = await syncUnit(planPath, deps);

    // Assert — the plan-level unit (whole body changed) AND Beta re-embed; Alpha is
    // untouched, so it must NOT appear. Kills a mutant that ignores the per-unit diff.
    assert.deepEqual(res.changed, [PLAN_SENTINEL, 'sec-2-beta']);
    assert.equal(res.changed.includes('sec-1-alpha'), false, 'the unedited section must be skipped');
    assert.equal(embedder.calls.length - afterFirst, 2, 'exactly two units re-embedded');
  } finally { rmDir(dir); }
});

test('syncUnit_reembeds_on_metadata_only_change_with_identical_body [kills: dropping files/status from the hash]', async () => {
  // Arrange — same body, but the `files:` frontmatter changes. The body text of the
  // __plan__ unit is byte-identical, so ONLY the metadata folded into the hash differs.
  const base = ['---', 'status: todo', 'files:', '  - src/a.js', '---', '', 'body text', ''].join('\n');
  const metaChanged = ['---', 'status: todo', 'files:', '  - src/DIFFERENT.js', '---', '', 'body text', ''].join('\n');
  const { dir, planPath } = writePlan(base);
  const store = makeStore();
  const embedder = makeEmbedder();
  const deps = { store, embedder, calibrationReady: () => true, plansRoot: path.join(dir, 'plans') };
  try {
    await syncUnit(planPath, deps);
    const afterFirst = embedder.calls.length; // 1 (plan unit only; no ## sections)
    fs.writeFileSync(planPath, metaChanged);

    // Act
    const res = await syncUnit(planPath, deps);

    // Assert — a metadata-only edit still shifts the hash → re-embed. A mutant that
    // stops feeding {files,...} into hashUnit sees an identical hash and wrongly skips.
    assert.deepEqual(res.changed, [PLAN_SENTINEL]);
    assert.equal(embedder.calls.length - afterFirst, 1, 'the metadata change forced a re-embed');
  } finally { rmDir(dir); }
});

// ─────────────────────────────────────────────────────────────────────────────
// Cluster 2 — the embedder return-shape fallbacks (line 256/258).
// ─────────────────────────────────────────────────────────────────────────────

test('syncUnit_accepts_the_object_vectors_return_shape [kills: dropping the `embedded.vectors` branch]', async () => {
  // Arrange — embedder returns `{ vectors: [Float32Array] }` (batch-API form), not a bare array.
  const { dir, planPath } = writePlan('---\nstatus: todo\n---\n\nonly a body\n');
  const store = makeStore();
  const embedder = makeEmbedder({ form: 'object' });
  try {
    // Act
    const res = await syncUnit(planPath, { store, embedder, calibrationReady: () => true, plansRoot: path.join(dir, 'plans') });

    // Assert — the object form resolves to a stored Float32Array. Kills a mutant that
    // only handles the array form (would leave `vectors` undefined → throw).
    assert.deepEqual(res.changed, [PLAN_SENTINEL]);
    const stored = [...store.units.values()][0];
    assert.ok(stored.embedding instanceof Float32Array, 'the vector from {vectors:[…]} was persisted');
  } finally { rmDir(dir); }
});

test('syncUnit_throws_when_embedder_returns_a_non_Float32Array [kills: dropping the instanceof guard]', async () => {
  // Arrange — embedder returns a raw value that is neither an array nor {vectors}.
  const { dir, planPath } = writePlan('---\nstatus: todo\n---\n\nbody\n');
  const store = makeStore();
  const embedder = makeEmbedder({ form: 'raw' });
  try {
    // Act + Assert — the guard converts a bad embedder result into a loud throw.
    await assert.rejects(
      syncUnit(planPath, { store, embedder, calibrationReady: () => true, plansRoot: path.join(dir, 'plans') }),
      /embedder did not return a Float32Array/,
    );
    assert.equal(store.units.size, 0, 'nothing is upserted when the vector is invalid');
  } finally { rmDir(dir); }
});

test('syncUnit_throws_when_vectors_array_is_empty [kills: not checking vectors[0]]', async () => {
  // Arrange — `{ vectors: [] }` → vectors[0] is undefined, not a Float32Array.
  const { dir, planPath } = writePlan('---\nstatus: todo\n---\n\nbody\n');
  const store = makeStore();
  const embedder = makeEmbedder({ form: 'emptyVectors' });
  try {
    // Act + Assert
    await assert.rejects(
      syncUnit(planPath, { store, embedder, calibrationReady: () => true, plansRoot: path.join(dir, 'plans') }),
      /embedder did not return a Float32Array/,
    );
  } finally { rmDir(dir); }
});

// ─────────────────────────────────────────────────────────────────────────────
// Cluster 3 — dependency validation (lines 224-225).
// ─────────────────────────────────────────────────────────────────────────────

test('syncUnit_rejects_when_store_is_absent [kills: dropping the store guard]', async () => {
  // Act + Assert — no store → a typed error, not a later null-deref.
  await assert.rejects(
    syncUnit('/does/not/matter.md', { embedder: makeEmbedder(), calibrationReady: () => true }),
    { name: 'TypeError', message: /a store is required/ },
  );
});

test('syncUnit_rejects_when_embedder_is_not_a_function [kills: dropping the embedder typeof guard]', async () => {
  // Act + Assert — a non-function embedder is rejected before any I/O.
  await assert.rejects(
    syncUnit('/does/not/matter.md', { store: makeStore(), embedder: {}, calibrationReady: () => true }),
    { name: 'TypeError', message: /embedder function is required/ },
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Cluster 4 — the calibration gate (line 229, both operands).
// ─────────────────────────────────────────────────────────────────────────────

test('syncUnit_defers_all_work_when_calibration_is_not_ready [kills: inverting or dropping !calibrationReady()]', async () => {
  // Arrange
  const { dir, planPath } = writePlan(TWO_SECTION_PLAN);
  const store = makeStore();
  const embedder = makeEmbedder();
  try {
    // Act — calibration explicitly not ready.
    const res = await syncUnit(planPath, { store, embedder, calibrationReady: () => false, plansRoot: path.join(dir, 'plans') });

    // Assert — deferred: nothing read/embedded/stored. Kills a mutant that inverts the gate.
    assert.deepEqual(res, { changed: [], skipped: true, reason: 'calibration-not-ready' });
    assert.equal(embedder.calls.length, 0, 'no embed work before the dimension is settled');
    assert.equal(store.units.size, 0, 'no writes while deferred');
  } finally { rmDir(dir); }
});

test('syncUnit_proceeds_when_calibrationReady_is_omitted [kills: dropping the typeof===function guard]', async () => {
  // Arrange — no calibrationReady param at all: the `typeof … === 'function'` first
  // operand must short-circuit the gate OFF, so the sync proceeds normally.
  const { dir, planPath } = writePlan('---\nstatus: todo\n---\n\nbody\n');
  const store = makeStore();
  const embedder = makeEmbedder();
  try {
    // Act
    const res = await syncUnit(planPath, { store, embedder, plansRoot: path.join(dir, 'plans') });

    // Assert — a mutant that drops the typeof-guard would call `undefined()` and crash;
    // a mutant that treats "no gate" as "not ready" would skip. Both die here.
    assert.deepEqual(res.changed, [PLAN_SENTINEL]);
    assert.equal(res.skipped, false);
  } finally { rmDir(dir); }
});

// ─────────────────────────────────────────────────────────────────────────────
// Cluster 5 — read-fresh error policy: ENOENT is DATA, other errors RETHROW (239-243).
// ─────────────────────────────────────────────────────────────────────────────

test('syncUnit_treats_a_missing_file_as_skip_not_error [kills: rethrowing ENOENT]', async () => {
  // Arrange — a path that does not exist.
  const store = makeStore();
  const embedder = makeEmbedder();
  const missing = path.join(os.tmpdir(), `sync-unit-absent-${Date.now()}`, 'gone.md');
  try {
    // Act
    const res = await syncUnit(missing, { store, embedder, calibrationReady: () => true });

    // Assert — a vanished file is a clean skip, never a throw.
    assert.deepEqual(res, { changed: [], skipped: true, reason: 'file-missing' });
    assert.equal(embedder.calls.length, 0);
  } finally { /* nothing created */ }
});

test('syncUnit_rethrows_a_non_ENOENT_read_error [kills: treating every read error as file-missing]', async () => {
  // Arrange — pointing at a DIRECTORY makes readFile fail with EISDIR (code !== ENOENT).
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sync-unit-dir-'));
  const store = makeStore();
  const embedder = makeEmbedder();
  try {
    // Act + Assert — the error must propagate, NOT be swallowed into a file-missing skip.
    await assert.rejects(
      syncUnit(dir, { store, embedder, calibrationReady: () => true }),
      (err) => err && err.code !== 'ENOENT',
    );
  } finally { rmDir(dir); }
});

// ─────────────────────────────────────────────────────────────────────────────
// Cluster 6 — batchApi routing: `api = batchApi || store` (line 226, second operand).
// ─────────────────────────────────────────────────────────────────────────────

test('syncUnit_routes_reads_and_writes_through_batchApi_when_supplied [kills: `api = store` mutant]', async () => {
  // Arrange — a real recording batch API and a `store` whose methods would THROW if used.
  const { dir, planPath } = writePlan('---\nstatus: todo\n---\n\nbody\n');
  const batchApi = makeStore();
  const store = {
    getUnit() { throw new Error('store.getUnit must not be called when batchApi is supplied'); },
    upsertUnit() { throw new Error('store.upsertUnit must not be called when batchApi is supplied'); },
  };
  const embedder = makeEmbedder();
  try {
    // Act
    const res = await syncUnit(planPath, { store, batchApi, embedder, calibrationReady: () => true, plansRoot: path.join(dir, 'plans') });

    // Assert — the write landed in batchApi; store was never touched (its throwing
    // methods prove it). Kills a mutant that ignores batchApi and keys `store`.
    assert.deepEqual(res.changed, [PLAN_SENTINEL]);
    assert.equal(batchApi.units.size, 1, 'the unit was persisted via batchApi');
  } finally { rmDir(dir); }
});

// ─────────────────────────────────────────────────────────────────────────────
// Cluster 7 — normalizePath: the store-key canonical form (lines 40-52).
// ─────────────────────────────────────────────────────────────────────────────

const NORM_ROWS = [
  {
    id: 'with-plansRoot',
    planPath: '/repo/plans/todo/slug.md',
    plansRoot: '/repo/plans',
    expected: 'plans/todo/slug.md',
    kills: 'the path.relative(dirname(plansRoot), …) branch',
  },
  {
    id: 'no-plansRoot-contains-plans',
    planPath: '/abs/work/plans/functional/x.md',
    plansRoot: undefined,
    expected: 'plans/functional/x.md',
    kills: 'the lastIndexOf("plans/") slice when idx>=0',
  },
  {
    id: 'no-plansRoot-no-plans-segment',
    planPath: '/tmp/loose/note.md',
    plansRoot: undefined,
    expected: '/tmp/loose/note.md',
    kills: 'the idx<0 fallthrough (returns the posix path unchanged)',
  },
  {
    id: 'backslashes-normalized',
    planPath: 'plans\\todo\\x.md',
    plansRoot: undefined,
    expected: 'plans/todo/x.md',
    kills: 'the .replace(/\\\\/g,"/") backslash normalization',
  },
];

for (const row of NORM_ROWS) {
  test(`normalizePath_${row.id}_yields_${row.expected} [kills: ${row.kills}]`, () => {
    // Act
    const actual = normalizePath(row.planPath, row.plansRoot);

    // Assert — one subject: the canonical store key for this input.
    assert.equal(actual, row.expected);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Cluster 8 — splitSections: ordinal uniqueness, slug fallback, truncation (130-149).
// ─────────────────────────────────────────────────────────────────────────────

test('splitSections_gives_duplicate_headings_distinct_ordinal_ids [kills: dropping the ordinal]', () => {
  // Arrange — two identically-named headings.
  const body = '## Repeat\n\nfirst\n\n## Repeat\n\nsecond\n';

  // Act
  const secs = splitSections(body);

  // Assert — the ordinal disambiguates; a mutant that drops it collides both to sec-repeat.
  assert.deepEqual(secs.map((s) => s.sectionId), ['sec-1-repeat', 'sec-2-repeat']);
});

test('splitSections_falls_back_to_section_when_heading_slug_is_empty [kills: dropping the ||"section" default]', () => {
  // Arrange — a heading of only punctuation slugifies to '' → the `|| 'section'` default fires.
  const body = '## !!!\n\ntext\n';

  // Act
  const secs = splitSections(body);

  // Assert
  assert.equal(secs.length, 1);
  assert.equal(secs[0].sectionId, 'sec-1-section');
});

test('splitSections_truncates_a_long_heading_slug_to_60_chars [kills: dropping slice(0,60)]', () => {
  // Arrange — a 70-char heading; the slug must be capped at 60.
  const heading = 'a'.repeat(70);
  const body = `## ${heading}\n\nbody\n`;

  // Act
  const secs = splitSections(body);

  // Assert — id is `sec-1-` + 60 'a's.
  assert.equal(secs[0].sectionId, `sec-1-${'a'.repeat(60)}`);
});

test('splitSections_ignores_body_lines_before_the_first_heading [kills: emitting a preamble section]', () => {
  // Arrange — prose precedes any `## ` heading; those lines belong to no section.
  const body = 'preamble line\nmore preamble\n\n## Only\n\ncontent\n';

  // Act
  const secs = splitSections(body);

  // Assert — exactly one section, and its trimmed text starts at the heading.
  assert.equal(secs.length, 1);
  assert.equal(secs[0].sectionId, 'sec-1-only');
  assert.ok(secs[0].text.startsWith('## Only'), 'preamble is not folded into the section text');
});

// ─────────────────────────────────────────────────────────────────────────────
// Cluster 9 — parseUnits: the plan-level unit + per-section units + meta propagation.
// ─────────────────────────────────────────────────────────────────────────────

test('parseUnits_emits_a_plan_unit_plus_one_unit_per_section_with_shared_meta [kills: dropping the plan sentinel or meta fan-out]', () => {
  // Act
  const units = parseUnits(TWO_SECTION_PLAN);

  // Assert — first unit is the whole-body plan unit; sections follow; every unit carries
  // the frontmatter meta. A mutant that skips the sentinel unit, or fails to propagate
  // `files`, changes this shape.
  assert.equal(units.length, 3);
  assert.equal(units[0].sectionId, PLAN_SENTINEL);
  assert.equal(units[0].kind, 'plan');
  assert.deepEqual(units.map((u) => u.sectionId), [PLAN_SENTINEL, 'sec-1-alpha', 'sec-2-beta']);
  for (const u of units) {
    assert.deepEqual(u.files, ['src/a.js'], `unit ${u.sectionId} inherits files meta`);
    assert.equal(u.status, 'todo');
  }
});

test('parseUnits_on_a_plan_with_no_frontmatter_uses_whole_content_as_body_and_empty_files [kills: mis-splitting no-frontmatter input]', () => {
  // Arrange — no `---` fence at all.
  const content = '# Title\n\njust a body, no frontmatter\n';

  // Act
  const units = parseUnits(content);

  // Assert — a single plan unit whose text is the trimmed content; files defaults to [].
  assert.equal(units.length, 1);
  assert.equal(units[0].sectionId, PLAN_SENTINEL);
  assert.equal(units[0].text, content.trim());
  assert.deepEqual(units[0].files, []);
  assert.equal(units[0].parentVision, null);
});

// ─────────────────────────────────────────────────────────────────────────────
// Cluster 10 — parseFrontmatterFields: the inline `files:` forms (lines 97-102).
// (w07 already covers the block-list form; these are the DARK inline branches.)
// ─────────────────────────────────────────────────────────────────────────────

const FILES_ROWS = [
  { id: 'inline-list',  fm: 'files: [src/a.js, "src/b.js"]', expected: ['src/a.js', 'src/b.js'], kills: 'the `[…]` inline-list split branch' },
  { id: 'scalar',       fm: 'files: src/single.js',          expected: ['src/single.js'],         kills: 'the scalar `[unquote(inline)]` branch' },
  { id: 'empty-list',   fm: 'files: []',                     expected: [],                        kills: 'treating `[]` as a real value instead of empty' },
];

for (const row of FILES_ROWS) {
  test(`parseFrontmatterFields_${row.id}_yields_${JSON.stringify(row.expected)} [kills: ${row.kills}]`, () => {
    // Act
    const { files } = parseFrontmatterFields(row.fm);

    // Assert — one subject: the parsed `files` array for this frontmatter shape.
    assert.deepEqual(files, row.expected);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Cluster 11 — logNote, reached through the calibration-not-ready branch (190-206).
// ─────────────────────────────────────────────────────────────────────────────

function readLogArray(logDir) {
  const p = path.join(logDir, 'plan-index-sync.json');
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

test('logNote_writes_a_deferral_note_when_a_logDir_is_supplied [kills: dropping the logNote write]', async () => {
  // Arrange — calibration not ready + a logDir → logNote must persist the note.
  const { dir, planPath } = writePlan('---\nstatus: todo\n---\n\nbody\n');
  const logDir = path.join(dir, '.ctoc', 'logs');
  try {
    // Act
    const res = await syncUnit(planPath, { store: makeStore(), embedder: makeEmbedder(), calibrationReady: () => false, logDir });

    // Assert — the deferral is recorded with the plan path.
    assert.equal(res.reason, 'calibration-not-ready');
    const log = readLogArray(logDir);
    assert.equal(log.length, 1);
    assert.match(log[0].note, /calibration not ready/);
    assert.equal(log[0].planPath, planPath);
  } finally { rmDir(dir); }
});

test('logNote_appends_to_an_existing_log_across_two_deferrals [kills: overwriting instead of appending]', async () => {
  // Arrange
  const { dir, planPath } = writePlan('---\nstatus: todo\n---\n\nbody\n');
  const logDir = path.join(dir, '.ctoc', 'logs');
  const deps = { store: makeStore(), embedder: makeEmbedder(), calibrationReady: () => false, logDir };
  try {
    await syncUnit(planPath, deps);

    // Act — a second deferral must not clobber the first entry.
    await syncUnit(planPath, deps);

    // Assert
    assert.equal(readLogArray(logDir).length, 2, 'both deferral notes are retained');
  } finally { rmDir(dir); }
});

test('logNote_resets_a_corrupt_log_file_to_a_fresh_array [kills: dropping the JSON.parse catch / array guard]', async () => {
  // Arrange — a non-JSON log file must not crash logNote; it resets to [] then appends.
  const { dir, planPath } = writePlan('---\nstatus: todo\n---\n\nbody\n');
  const logDir = path.join(dir, '.ctoc', 'logs');
  fs.mkdirSync(logDir, { recursive: true });
  fs.writeFileSync(path.join(logDir, 'plan-index-sync.json'), 'not valid json {{{');
  try {
    // Act
    await syncUnit(planPath, { store: makeStore(), embedder: makeEmbedder(), calibrationReady: () => false, logDir });

    // Assert — unparseable prior content dropped; exactly the fresh note remains.
    const log = readLogArray(logDir);
    assert.ok(Array.isArray(log));
    assert.equal(log.length, 1);
  } finally { rmDir(dir); }
});

test('logNote_coerces_a_nonarray_log_to_empty_before_appending [kills: dropping the !Array.isArray reset]', async () => {
  // Arrange — valid JSON that is an OBJECT, not an array. Without the coercion `.push`
  // would throw; logNote swallows and never persists, so the file stays the object.
  const { dir, planPath } = writePlan('---\nstatus: todo\n---\n\nbody\n');
  const logDir = path.join(dir, '.ctoc', 'logs');
  fs.mkdirSync(logDir, { recursive: true });
  fs.writeFileSync(path.join(logDir, 'plan-index-sync.json'), '{"not":"an array"}');
  try {
    // Act
    await syncUnit(planPath, { store: makeStore(), embedder: makeEmbedder(), calibrationReady: () => false, logDir });

    // Assert — coerced to a fresh array holding exactly the new note.
    const log = readLogArray(logDir);
    assert.ok(Array.isArray(log), 'object prior content coerced to an array');
    assert.equal(log.length, 1);
  } finally { rmDir(dir); }
});

test('logNote_trims_the_log_to_the_last_500_entries [kills: dropping the length>500 slice]', async () => {
  // Arrange — pre-seed 501 entries; one more push → 502 → slice(-500) → 500.
  const { dir, planPath } = writePlan('---\nstatus: todo\n---\n\nbody\n');
  const logDir = path.join(dir, '.ctoc', 'logs');
  fs.mkdirSync(logDir, { recursive: true });
  const seed = Array.from({ length: 501 }, (_, i) => ({ note: `seed-${i}` }));
  fs.writeFileSync(path.join(logDir, 'plan-index-sync.json'), JSON.stringify(seed));
  try {
    // Act
    await syncUnit(planPath, { store: makeStore(), embedder: makeEmbedder(), calibrationReady: () => false, logDir });

    // Assert — capped at 500, and the oldest seed entry (seed-0) was evicted.
    const log = readLogArray(logDir);
    assert.equal(log.length, 500, 'the ring buffer holds the newest 500 entries');
    assert.equal(log.some((e) => e.note === 'seed-0'), false, 'the oldest entry was dropped');
  } finally { rmDir(dir); }
});

test('logNote_swallows_its_own_write_failure_and_the_deferral_still_returns [kills: dropping the logNote outer catch]', async () => {
  // Arrange — point logDir at a path whose PARENT is a regular file, so mkdirSync throws
  // (ENOTDIR) inside logNote. The outer catch must swallow it: logging is best-effort and
  // must never propagate. A mutant that removes that catch turns this into a rejection.
  const { dir, planPath } = writePlan('---\nstatus: todo\n---\n\nbody\n');
  const blocker = path.join(dir, 'blocker-file');
  fs.writeFileSync(blocker, 'i am a file, not a directory');
  const logDir = path.join(blocker, 'logs'); // parent is a file → mkdir fails
  try {
    // Act — must resolve, not reject.
    const res = await syncUnit(planPath, { store: makeStore(), embedder: makeEmbedder(), calibrationReady: () => false, logDir });

    // Assert — the deferral result is intact despite the logging fault.
    assert.deepEqual(res, { changed: [], skipped: true, reason: 'calibration-not-ready' });
    assert.equal(fs.existsSync(logDir), false, 'no log dir was created (the write faulted)');
  } finally { rmDir(dir); }
});

// ─────────────────────────────────────────────────────────────────────────────
// Cluster 12 — logNote no-op guard: no logDir → no file, deferral still clean (191).
// ─────────────────────────────────────────────────────────────────────────────

test('syncUnit_defers_without_writing_a_log_when_no_logDir_is_supplied [kills: dropping the `if (!logDir) return` guard]', async () => {
  // Arrange — calibration not ready, NO logDir. logNote must early-return; the deferral
  // result is unchanged. (A mutant dropping the guard would try to write to `undefined`.)
  const { dir, planPath } = writePlan('---\nstatus: todo\n---\n\nbody\n');
  try {
    // Act
    const res = await syncUnit(planPath, { store: makeStore(), embedder: makeEmbedder(), calibrationReady: () => false });

    // Assert
    assert.deepEqual(res, { changed: [], skipped: true, reason: 'calibration-not-ready' });
  } finally { rmDir(dir); }
});
