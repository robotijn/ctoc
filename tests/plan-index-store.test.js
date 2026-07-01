/**
 * PI1 — Pure-JS Plan-Index Store: behavioral tests (ST-01 … ST-20).
 *
 * Covers the 20 acceptance criteria of plans/todo/pi1-index-store-and-schema.md.
 * Pure JS, zero native binaries, zero network. Every index lives in an isolated
 * tmp dir created with fs.mkdtempSync(os.tmpdir()) and is removed afterward.
 *
 * The tests exercise the real store and its real file I/O — no core logic is
 * mocked. ST-17 injects a genuine temp-write failure at the fs boundary (exactly
 * the "temp write throws" fault the AC specifies), which is fault injection, not
 * mocking away the code under test.
 */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const { openStore } = require('../src/lib/plan-index');
const safeFs = require('../src/lib/safe-fs');

// ── helpers ─────────────────────────────────────────────────────────────────

function tmpIndex() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-idx-'));
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

function bytesOf(embedding) {
  return Buffer.from(embedding.buffer, embedding.byteOffset, embedding.byteLength);
}

function base64Of(embedding) {
  return bytesOf(embedding).toString('base64');
}

function fullUnit(over = {}) {
  return {
    planPath: 'plans/todo/x.md',
    sectionId: 's1',
    kind: 'section',
    text: 'some section text',
    embedding: randEmb(384, 3),
    files: ['src/lib/a.js', 'src/lib/b/**'],
    parentVision: 'vision/ci.md',
    stepLabel: 'IMPLEMENT',
    contentHash: 'sha256:abc123',
    ...over
  };
}

function readLog(logPath) {
  if (!fs.existsSync(logPath)) return [];
  try { return JSON.parse(fs.readFileSync(logPath, 'utf8')); } catch { return []; }
}

// ── ST-01 (AC1): openStore on absent file yields an empty, usable store ───────

test('ST-01 openStore on an absent file yields an empty, usable store', () => {
  const { dir, jsonPath } = tmpIndex();
  try {
    const store = openStore(jsonPath);
    assert.deepEqual(store.search(f32([1, 0, 0]), 5), [], 'search returns [] on empty store');
    assert.equal(store.dimension, null, 'dimension null on empty store');
    assert.equal(store.size, 0, 'size 0 on empty store');
    assert.equal(fs.existsSync(jsonPath), false, 'no file written until save()');
  } finally {
    cleanup(dir);
  }
});

// ── ST-02 (AC2): openStore loads a persisted index losslessly ─────────────────

test('ST-02 openStore loads a persisted index losslessly', () => {
  const { dir, jsonPath } = tmpIndex();
  try {
    const a = openStore(jsonPath);
    const u1 = fullUnit({ planPath: 'plans/todo/a.md', sectionId: 's1', embedding: randEmb(384, 11) });
    const u2 = fullUnit({ planPath: 'plans/todo/a.md', sectionId: '__plan__', kind: 'plan', embedding: randEmb(384, 22) });
    a.upsertUnit(u1);
    a.upsertUnit(u2);
    a.save();

    const b = openStore(jsonPath);
    const got1 = b.getUnit('plans/todo/a.md', 's1');
    const got2 = b.getUnit('plans/todo/a.md', '__plan__');
    assert.ok(got1 && got2, 'both units reloaded');
    assert.equal(got1.contentHash, u1.contentHash);
    assert.equal(got1.kind, 'section');
    assert.deepEqual(got1.files, u1.files);
    assert.equal(got1.parentVision, u1.parentVision);
    assert.equal(got2.kind, 'plan');
    assert.equal(Buffer.compare(bytesOf(got1.embedding), bytesOf(u1.embedding)), 0, 'embedding bytes equal (u1)');
    assert.equal(Buffer.compare(bytesOf(got2.embedding), bytesOf(u2.embedding)), 0, 'embedding bytes equal (u2)');
  } finally {
    cleanup(dir);
  }
});

// ── ST-03 (AC3): corrupt/invalid index file → fail-open rebuild ───────────────

test('ST-03 corrupt/invalid index file fails open (never throws) and warns', () => {
  const { dir, jsonPath, logPath } = tmpIndex();
  try {
    fs.mkdirSync(path.dirname(jsonPath), { recursive: true });

    // (a) malformed JSON
    fs.writeFileSync(jsonPath, '{ this is not json ');
    const s1 = openStore(jsonPath);
    assert.equal(s1.size, 0, 'malformed JSON → empty store');
    assert.deepEqual(s1.search(f32([1, 2, 3]), 5), [], 'usable after malformed JSON');

    // (b) valid JSON, wrong shape (non-array units, wrong version)
    fs.writeFileSync(jsonPath, JSON.stringify({ version: 99, units: 'not-an-array' }));
    const s2 = openStore(jsonPath);
    assert.equal(s2.size, 0, 'wrong-shape JSON → empty store');

    const log = readLog(logPath);
    assert.ok(log.length >= 2, 'a warn logged for each fail-open');
    assert.ok(log.some(e => e.event === 'index_load_failed' && e.level === 'warn'), 'index_load_failed warn present');
  } finally {
    cleanup(dir);
  }
});

// ── ST-04 (AC4): upsertUnit + getUnit round-trip ──────────────────────────────

test('ST-04 upsertUnit + getUnit round-trip preserves every field and float bytes', () => {
  const { dir, jsonPath } = tmpIndex();
  try {
    const store = openStore(jsonPath);
    const u = fullUnit({ embedding: randEmb(384, 7) });
    store.upsertUnit(u);
    const got = store.getUnit(u.planPath, u.sectionId);
    assert.ok(got, 'unit retrieved');
    assert.equal(got.kind, 'section');
    assert.equal(got.contentHash, 'sha256:abc123');
    assert.ok(Array.isArray(got.files), 'files is an array');
    assert.deepEqual(got.files, ['src/lib/a.js', 'src/lib/b/**']);
    assert.equal(got.parentVision, 'vision/ci.md');
    assert.equal(got.stepLabel, 'IMPLEMENT');
    assert.deepEqual(Array.from(got.embedding), Array.from(u.embedding), 'embedding float-for-float equal');
    assert.equal(Buffer.compare(bytesOf(got.embedding), bytesOf(u.embedding)), 0, 'embedding byte-for-byte equal');
  } finally {
    cleanup(dir);
  }
});

// ── ST-05 (AC5): idempotent replace keyed on (planPath, sectionId) ────────────

test('ST-05 upsertUnit is an idempotent replace keyed on (planPath, sectionId)', () => {
  const { dir, jsonPath } = tmpIndex();
  try {
    const store = openStore(jsonPath);
    store.upsertUnit(fullUnit({ text: 'v1', embedding: randEmb(384, 1), contentHash: 'h1' }));
    assert.equal(store.size, 1);
    store.upsertUnit(fullUnit({ text: 'v2', embedding: randEmb(384, 2), contentHash: 'h2' }));
    assert.equal(store.size, 1, 'count unchanged after re-upsert on same key');
    const got = store.getUnit('plans/todo/x.md', 's1');
    assert.equal(got.text, 'v2', 'new text stored');
    assert.equal(got.contentHash, 'h2', 'new contentHash stored');
    assert.deepEqual(Array.from(got.embedding), Array.from(randEmb(384, 2)), 'new embedding stored');
  } finally {
    cleanup(dir);
  }
});

// ── ST-06 (AC6): getUnit on a miss returns null ───────────────────────────────

test('ST-06 getUnit on a miss returns null and never throws', () => {
  const { dir, jsonPath } = tmpIndex();
  try {
    const store = openStore(jsonPath);
    assert.equal(store.getUnit('plans/todo/nope.md', 's1'), null);
    store.upsertUnit(fullUnit());
    assert.equal(store.getUnit('plans/todo/x.md', 'other'), null, 'wrong section → null');
  } finally {
    cleanup(dir);
  }
});

// ── ST-07 (AC7): deleteUnit + no-op delete ────────────────────────────────────

test('ST-07 deleteUnit removes a unit; absent delete is a no-op', () => {
  const { dir, jsonPath } = tmpIndex();
  try {
    const store = openStore(jsonPath);
    store.upsertUnit(fullUnit());
    assert.equal(store.deleteUnit('plans/todo/x.md', 's1'), true, 'first delete → true');
    assert.equal(store.getUnit('plans/todo/x.md', 's1'), null, 'unit gone');
    assert.equal(store.deleteUnit('plans/todo/x.md', 's1'), false, 'second delete → false');
  } finally {
    cleanup(dir);
  }
});

// ── ST-08 (AC8): moveUnit re-paths without re-embedding ────────────────────────

test('ST-08 moveUnit re-paths a plan\'s units without re-embedding', () => {
  const { dir, jsonPath } = tmpIndex();
  try {
    const store = openStore(jsonPath);
    const planUnit = fullUnit({ planPath: 'plans/todo/x.md', sectionId: '__plan__', kind: 'plan', embedding: randEmb(384, 4), contentHash: 'hp' });
    const secUnit = fullUnit({ planPath: 'plans/todo/x.md', sectionId: 's1', embedding: randEmb(384, 5), contentHash: 'hs' });
    store.upsertUnit(planUnit);
    store.upsertUnit(secUnit);
    const planBytes = bytesOf(store.getUnit('plans/todo/x.md', '__plan__').embedding);
    const secBytes = bytesOf(store.getUnit('plans/todo/x.md', 's1').embedding);

    const count = store.moveUnit('plans/todo/x.md', 'plans/in-progress/x.md');
    assert.equal(count, 2, 'returns count re-pathed');
    assert.equal(store.getUnit('plans/todo/x.md', 's1'), null, 'old path gone');
    assert.equal(store.getUnit('plans/todo/x.md', '__plan__'), null, 'old plan path gone');

    const movedPlan = store.getUnit('plans/in-progress/x.md', '__plan__');
    const movedSec = store.getUnit('plans/in-progress/x.md', 's1');
    assert.ok(movedPlan && movedSec, 'units re-pathed');
    assert.equal(movedPlan.contentHash, 'hp', 'contentHash unchanged (plan)');
    assert.equal(movedSec.contentHash, 'hs', 'contentHash unchanged (section)');
    assert.equal(Buffer.compare(bytesOf(movedPlan.embedding), planBytes), 0, 'embedding unchanged byte-for-byte (plan)');
    assert.equal(Buffer.compare(bytesOf(movedSec.embedding), secBytes), 0, 'embedding unchanged byte-for-byte (section)');

    assert.equal(store.moveUnit('plans/todo/absent.md', 'plans/x.md'), 0, 'missing fromPath → 0');
  } finally {
    cleanup(dir);
  }
});

// ── ST-09 (AC9): getFilesForPlan ──────────────────────────────────────────────

test('ST-09 getFilesForPlan returns a plan\'s declared files', () => {
  const { dir, jsonPath } = tmpIndex();
  try {
    const store = openStore(jsonPath);
    store.upsertUnit(fullUnit({
      planPath: 'pi6-conflict.md', sectionId: '__plan__', kind: 'plan',
      files: ['src/lib/a.js', 'src/lib/b/**'], embedding: randEmb(384, 9)
    }));
    assert.deepEqual(store.getFilesForPlan('pi6-conflict.md'), ['src/lib/a.js', 'src/lib/b/**']);
    assert.deepEqual(store.getFilesForPlan('no-such-plan.md'), [], 'no plan-level unit → []');
    // A section-only plan (no plan-level unit) also returns [].
    store.upsertUnit(fullUnit({ planPath: 'only-section.md', sectionId: 's1', embedding: randEmb(384, 8) }));
    assert.deepEqual(store.getFilesForPlan('only-section.md'), [], 'section only → []');
  } finally {
    cleanup(dir);
  }
});

// ── ST-10 (AC10): kind separability + bad kind rejected ───────────────────────

test('ST-10 kind separates plan/section units; bad kind rejected before mutation', () => {
  const { dir, jsonPath } = tmpIndex();
  try {
    const store = openStore(jsonPath);
    store.upsertUnit(fullUnit({ planPath: 'p.md', sectionId: '__plan__', kind: 'plan', embedding: randEmb(384, 1) }));
    store.upsertUnit(fullUnit({ planPath: 'p.md', sectionId: 's1', kind: 'section', embedding: randEmb(384, 2) }));
    assert.equal(store.getUnit('p.md', '__plan__').kind, 'plan');
    assert.equal(store.getUnit('p.md', 's1').kind, 'section');
    assert.equal(store.size, 2, 'both coexist');

    const sizeBefore = store.size;
    assert.throws(
      () => store.upsertUnit(fullUnit({ planPath: 'p.md', sectionId: 'bad', kind: 'unknown', embedding: randEmb(384, 3) })),
      /kind/,
      'invalid kind throws'
    );
    assert.equal(store.size, sizeBefore, 'no state change on invalid kind');
    assert.equal(store.getUnit('p.md', 'bad'), null, 'bad unit not stored');
  } finally {
    cleanup(dir);
  }
});

// ── ST-11 (AC11): cosine ranks by angle, not magnitude ────────────────────────

test('ST-11 search ranks by cosine angle, not magnitude', () => {
  const { dir, jsonPath } = tmpIndex();
  try {
    const store = openStore(jsonPath);
    store.upsertUnit(fullUnit({ planPath: 'A.md', sectionId: 's', embedding: f32([10, 1, 0]) }));
    store.upsertUnit(fullUnit({ planPath: 'B.md', sectionId: 's', embedding: f32([0.1, 0.995, 0]) }));
    const res = store.search(f32([1, 0, 0]), 2);
    assert.equal(res.length, 2);
    assert.equal(res[0].planPath, 'A.md', 'A (cosine ~0.995) ranks above B (cosine ~0.100)');
    assert.ok(res[0].score > res[1].score, 'scores strictly ordered');
    assert.ok(res[0].score > 0.9 && res[1].score < 0.2, 'cosine values as expected (not L2)');
  } finally {
    cleanup(dir);
  }
});

// ── ST-12 (AC12): search honours k, kind filter, self-exclusion ───────────────

test('ST-12 search honours k and opts (kind filter, self-exclusion)', () => {
  const { dir, jsonPath } = tmpIndex();
  try {
    const store = openStore(jsonPath);
    store.upsertUnit(fullUnit({ planPath: 'p1.md', sectionId: '__plan__', kind: 'plan', embedding: f32([1, 0, 0]) }));
    store.upsertUnit(fullUnit({ planPath: 'p1.md', sectionId: 's1', kind: 'section', embedding: f32([0.9, 0.1, 0]) }));
    store.upsertUnit(fullUnit({ planPath: 'p2.md', sectionId: 's1', kind: 'section', embedding: f32([0.8, 0.2, 0]) }));
    store.upsertUnit(fullUnit({ planPath: 'p3.md', sectionId: 's1', kind: 'section', embedding: f32([0.7, 0.3, 0]) }));

    const q = f32([1, 0, 0]);
    const sectionRes = store.search(q, 2, { kind: 'section' });
    assert.ok(sectionRes.length <= 2, 'at most k results');
    assert.ok(sectionRes.every(r => r.kind === 'section'), 'all results are sections');
    for (let i = 0; i + 1 < sectionRes.length; i++) {
      assert.ok(sectionRes[i].score >= sectionRes[i + 1].score, 'sorted descending');
    }

    const excludeRes = store.search(q, 10, { excludePlanPath: 'p1.md' });
    assert.ok(excludeRes.every(r => r.planPath !== 'p1.md'), 'excluded planPath absent');
  } finally {
    cleanup(dir);
  }
});

// ── ST-13 (AC13): search validates query dimension ────────────────────────────

test('ST-13 search validates query dimension and names expected + received', () => {
  const { dir, jsonPath } = tmpIndex();
  try {
    const store = openStore(jsonPath);
    store.upsertUnit(fullUnit({ embedding: randEmb(384, 1) }));
    assert.equal(store.dimension, 384);
    assert.throws(
      () => store.search(new Float32Array(512), 5),
      (err) => err instanceof Error && /384/.test(err.message) && /512/.test(err.message),
      'throws naming expected (384) and received (512)'
    );
  } finally {
    cleanup(dir);
  }
});

// ── ST-14 (AC14): dimension inferred from the first embedding ──────────────────

test('ST-14 dimension is inferred from the first embedding and persists', () => {
  const { dir, jsonPath } = tmpIndex();
  try {
    const store = openStore(jsonPath);
    assert.equal(store.dimension, null, 'null before first upsert');
    store.upsertUnit(fullUnit({ embedding: randEmb(384, 1) }));
    assert.equal(store.dimension, 384, 'inferred 384');
    store.save();
    const reopened = openStore(jsonPath);
    assert.equal(reopened.dimension, 384, 'dimension persists across save/open');
  } finally {
    cleanup(dir);
  }
});

// ── ST-15 (AC15): dimension mismatch on upsert → full reset + warn ────────────

test('ST-15 dimension mismatch on upsert triggers a full reset + warn (no throw)', () => {
  const { dir, jsonPath, logPath } = tmpIndex();
  try {
    const store = openStore(jsonPath);
    store.upsertUnit(fullUnit({ planPath: 'a.md', sectionId: 's1', embedding: randEmb(384, 1) }));
    store.upsertUnit(fullUnit({ planPath: 'a.md', sectionId: 's2', embedding: randEmb(384, 2) }));
    store.upsertUnit(fullUnit({ planPath: 'b.md', sectionId: 's1', embedding: randEmb(384, 3) }));
    assert.equal(store.dimension, 384);
    assert.equal(store.size, 3);

    // model changed → 512-dim embedding
    store.upsertUnit(fullUnit({ planPath: 'c.md', sectionId: 's1', embedding: randEmb(512, 9) }));
    assert.equal(store.dimension, 512, 'dimension adopts new length');
    assert.equal(store.size, 1, 'exactly the new unit remains');
    assert.ok(store.getUnit('c.md', 's1'), 'new unit present');
    assert.equal(store.getUnit('a.md', 's1'), null, 'old units cleared');

    const log = readLog(logPath);
    assert.ok(log.some(e => e.event === 'dimension_reset' && e.level === 'warn'), 'dimension_reset warn logged');
  } finally {
    cleanup(dir);
  }
});

// ── ST-16 (AC16): save() persists canonical shape + disk round-trip ───────────

test('ST-16 save() persists the canonical base64 shape and round-trips through disk', () => {
  const { dir, jsonPath } = tmpIndex();
  try {
    const store = openStore(jsonPath);
    const u1 = fullUnit({ planPath: 'a.md', sectionId: 's1', embedding: randEmb(384, 1) });
    const u2 = fullUnit({ planPath: 'a.md', sectionId: '__plan__', kind: 'plan', embedding: randEmb(384, 2) });
    store.upsertUnit(u1);
    store.upsertUnit(u2);
    store.save();

    const raw = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    assert.equal(raw.version, 1);
    assert.equal(raw.dimension, 384);
    assert.ok(Array.isArray(raw.units) && raw.units.length === 2, 'units array present');
    for (const u of raw.units) {
      assert.equal(typeof u.embedding, 'string', 'embedding is a base64 string, not a number array');
    }
    const leftover = fs.readdirSync(path.dirname(jsonPath)).filter(f => f.includes('.tmp-'));
    assert.equal(leftover.length, 0, 'no *.tmp-* sidecar left behind');

    const reopened = openStore(jsonPath);
    const got = reopened.getUnit('a.md', 's1');
    assert.equal(Buffer.compare(bytesOf(got.embedding), bytesOf(u1.embedding)), 0, 'embedding bytes survive disk round-trip');
    assert.equal(got.contentHash, u1.contentHash);
  } finally {
    cleanup(dir);
  }
});

// ── ST-17 (AC17): atomic write leaves the prior file intact on failure ─────────

test('ST-17 atomic write leaves the prior file intact when the temp write fails', () => {
  const { dir, jsonPath } = tmpIndex();
  const origWrite = safeFs.writeFileSync;
  try {
    const store = openStore(jsonPath);
    store.upsertUnit(fullUnit({ embedding: randEmb(384, 1) }));
    store.save();
    const before = fs.readFileSync(jsonPath);

    // Inject a genuine temp-write failure at the fs boundary (the AC's fault).
    safeFs.writeFileSync = function patchedWrite(p, data, options) {
      if (typeof p === 'string' && p.includes('.tmp-')) {
        throw new Error('injected temp write failure');
      }
      return origWrite.call(safeFs, p, data, options);
    };

    // The mutation's atomic save must fail loudly (throw), not silently corrupt
    // the file: temp write throws → temp is unlinked → the error propagates.
    assert.throws(
      () => store.upsertUnit(fullUnit({ sectionId: 's2', embedding: randEmb(384, 2) })),
      /injected temp write failure/,
      'the failed temp write surfaces as a thrown error'
    );

    const after = fs.readFileSync(jsonPath);
    assert.equal(Buffer.compare(before, after), 0, 'original file byte-for-byte unchanged after failed temp write');
    const leftover = fs.readdirSync(path.dirname(jsonPath)).filter(f => f.includes('.tmp-'));
    assert.equal(leftover.length, 0, 'temp file cleaned up on failure');
  } finally {
    safeFs.writeFileSync = origWrite;
    cleanup(dir);
  }
});

// ── ST-18 (AC18): reload-under-lock prevents lost updates (clobber) ───────────

test('ST-18 reload-under-lock prevents clobbering a concurrent external write', () => {
  const { dir, jsonPath } = tmpIndex();
  try {
    const a = openStore(jsonPath);
    a.upsertUnit(fullUnit({ planPath: 'x.md', sectionId: '__plan__', kind: 'plan', embedding: f32([1, 0, 0]) }));

    // A separate writer appends unit Y directly to the JSON file on disk.
    const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    data.units.push({
      planPath: 'y.md', sectionId: '__plan__', kind: 'plan', text: 'Y',
      files: [], parentVision: null, stepLabel: null, contentHash: 'hy',
      embedding: base64Of(f32([0, 1, 0]))
    });
    fs.writeFileSync(jsonPath, JSON.stringify(data));

    // Handle A performs a locked RMW that must reload Y before mutating.
    a.upsertUnit(fullUnit({ planPath: 'z.md', sectionId: '__plan__', kind: 'plan', embedding: f32([0, 0, 1]) }));

    const finalData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    const paths = finalData.units.map(u => u.planPath).sort();
    assert.deepEqual(paths, ['x.md', 'y.md', 'z.md'], 'X, Y and Z all survive (no clobber)');
  } finally {
    cleanup(dir);
  }
});

// ── ST-19 (AC19): a stale lock is stolen (writes never hang) ──────────────────

test('ST-19 a stale lock is stolen so writes never hang', () => {
  const { dir, jsonPath, lockPath } = tmpIndex();
  try {
    const store = openStore(jsonPath, { staleLockMs: 10000, acquireTimeoutMs: 5000 });
    store.upsertUnit(fullUnit({ planPath: 'a.md', sectionId: 's1', embedding: randEmb(3, 1) }));

    // Create a lock and backdate its mtime past the stale threshold.
    fs.writeFileSync(lockPath, '99999:0');
    const past = new Date(Date.now() - 20000);
    fs.utimesSync(lockPath, past, past);

    const started = Date.now();
    store.upsertUnit(fullUnit({ planPath: 'b.md', sectionId: 's1', embedding: randEmb(3, 2) }));
    const elapsed = Date.now() - started;

    assert.ok(store.getUnit('b.md', 's1'), 'write completed by stealing the stale lock');
    assert.ok(elapsed < 5000, 'completed well within the acquire timeout');
  } finally {
    cleanup(dir);
  }
});

// ── ST-20 (AC20): writes serialized; reads lock-free ──────────────────────────

test('ST-20 a held lock serializes writes while reads stay lock-free', () => {
  const { dir, jsonPath, lockPath } = tmpIndex();
  try {
    const seed = openStore(jsonPath);
    seed.upsertUnit(fullUnit({ planPath: 'a.md', sectionId: 's1', embedding: f32([1, 0, 0]) }));

    // A fresh (non-stale) lock is held by "another process".
    fs.writeFileSync(lockPath, `${process.pid}:${Date.now()}`);

    const store = openStore(jsonPath, { staleLockMs: 60000, acquireTimeoutMs: 150, acquireBackoffMs: 10 });

    // Reads never take the lock — they return immediately from the snapshot.
    assert.ok(store.getUnit('a.md', 's1'), 'lock-free getUnit returns while lock held');
    assert.equal(store.search(f32([1, 0, 0]), 5).length, 1, 'lock-free search returns while lock held');

    // A fresh (non-stale) held lock blocks a second acquire until the timeout.
    assert.throws(
      () => store.upsertUnit(fullUnit({ planPath: 'b.md', sectionId: 's1', embedding: f32([0, 1, 0]) })),
      /lock acquire timeout/,
      'write blocks (bounded) on a held lock'
    );

    // Release the lock → the write now succeeds.
    fs.unlinkSync(lockPath);
    store.upsertUnit(fullUnit({ planPath: 'b.md', sectionId: 's1', embedding: f32([0, 1, 0]) }));
    assert.ok(store.getUnit('b.md', 's1'), 'write succeeds once the lock is released');
  } finally {
    cleanup(dir);
  }
});
