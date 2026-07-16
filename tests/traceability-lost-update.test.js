'use strict';

/**
 * traceability-lost-update — upsert() must not silently drop a concurrently-written
 * row. The matrix save is already ATOMIC (temp+rename, so a crashed write never leaves
 * a torn file), but atomicity does NOT prevent a LOST UPDATE: two upserts each
 * load() → add row → temp+rename, the last rename wins, and the first writer's row
 * silently vanishes (the module comment admitted this).
 *
 * The fix mirrors task-registry.js: a `generation` compare-and-swap. `load` stamps the
 * on-disk generation onto the value; `save` re-reads the on-disk generation and REFUSES
 * (StaleMatrixError) when it moved since the value was loaded; `upsert` reloads and
 * re-applies on that refusal (bounded retry) instead of clobbering. The atomic write is
 * kept; the CAS sits on top.
 *
 * The interleave is driven deterministically by making the SECOND upsert's internal
 * load read the pre-first-write (empty, generation 0) state exactly once — mirroring a
 * writer that loaded before the first committed — then letting it see real disk again
 * (the save's generation re-read and the retry reload). Against today's no-CAS code the
 * second writer clobbers the first → REQ-A is lost → RED. Real temp trees under
 * os.tmpdir(); the only seam is a one-shot pass-through readFileSync, restored in finally.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const traceability = require('../src/lib/traceability-matrix');
const safeFs = require('../src/lib/safe-fs');

const sandboxes = [];

function mkSandbox() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'trace-lostupd-'));
  sandboxes.push(root);
  return root;
}

test.after(() => {
  while (sandboxes.length) {
    try { fs.rmSync(sandboxes.pop(), { recursive: true, force: true }); } catch { /* best effort */ }
  }
});

test('[lost-update] two interleaved upserts both survive — CAS retries instead of dropping a row', () => {
  const root = mkSandbox();

  // First writer commits REQ-A (real).
  traceability.upsert(root, {
    id: 'REQ-A', description: 'first', satisfied_by_files: ['src/a.js'], covered_by_tests: ['t'],
  });

  // Simulate a SECOND writer that loaded the matrix BEFORE REQ-A committed: its internal
  // load reads the pre-REQ-A (empty, generation 0) state exactly ONCE.
  const STALE_BYTES = [
    'generated_at: null',
    'generation: 0',
    'requirement_count: 0',
    '',
    'requirements:',
    '',
  ].join('\n');
  let served = false;
  const origRead = safeFs.readFileSync;
  safeFs.readFileSync = (p, opts) => {
    if (!served) { served = true; return STALE_BYTES; }
    return origRead(p, opts);
  };

  try {
    traceability.upsert(root, {
      id: 'REQ-B', description: 'second', satisfied_by_files: ['src/b.js'], covered_by_tests: ['t'],
    });
  } finally {
    safeFs.readFileSync = origRead;
  }

  const ids = traceability.load(root).requirements.map((r) => r.id).sort();
  assert.deepEqual(
    ids,
    ['REQ-A', 'REQ-B'],
    'both interleaved upserts must survive — neither row may be silently lost',
  );
});

test('[lost-update regression] a single upsert still inserts and stamps last_updated', () => {
  const root = mkSandbox();
  const req = traceability.upsert(root, {
    id: 'REQ-1', description: 'd', satisfied_by_files: ['x'], covered_by_tests: ['t'],
  });
  assert.equal(req.id, 'REQ-1');
  assert.ok(req.last_updated, 'last_updated is stamped');
  assert.equal(traceability.load(root).requirements.length, 1);
});

test('[lost-update regression] findOrphans and summary are unchanged by the CAS wrapper', () => {
  const root = mkSandbox();
  traceability.upsert(root, { id: 'OK', verification_status: 'covered', satisfied_by_files: ['x'], covered_by_tests: ['t'] });
  traceability.upsert(root, { id: 'NO-FILE', satisfied_by_files: [], covered_by_tests: ['t'] });
  traceability.upsert(root, { id: 'NO-TEST', satisfied_by_files: ['x'], covered_by_tests: [] });

  assert.deepEqual(
    traceability.findOrphans(root).map((r) => r.id).sort(),
    ['NO-FILE', 'NO-TEST'],
    'findOrphans still flags a requirement with no file OR no test',
  );
  const s = traceability.summary(root);
  assert.equal(s.total_requirements, 3);
  assert.equal(s.verified, 1);
  assert.equal(s.orphans, 2);
});
