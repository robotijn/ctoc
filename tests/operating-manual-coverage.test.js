'use strict';

/**
 * OM1 coverage — DARK-BRANCH tests for src/lib/operating-manual.js.
 *
 * The sibling suite (tests/operating-manual.test.js) drives the happy paths:
 * create / insert / update / unchanged, idempotency, the malformed lone-marker
 * fail-open, and invalid projectRoot. This file targets ONLY the branches that
 * suite leaves dark (measured uncovered lines 47-48, 51, 100-112, 144-149,
 * 165-170, 224-231), each pinned so a trivially-wrong implementation goes RED:
 *
 *   - resolveTemplate's __dirname primary ALWAYS resolves in-repo, so the
 *     ctocRoot-fallback branch (and the `: null` second operand) is unreachable
 *     without suppressing the primary. We do that at the ONLY true boundary:
 *     safe-fs (the audited fs choke point the module imports). We lie about the
 *     single primary path and delegate every other path to the real existsSync —
 *     a pass-through fake, restored in finally.
 *   - atomicWrite's EXDEV retry and its non-EXDEV rethrow are reached by stubbing
 *     safeFs.renameSync at that same boundary.
 *   - The 2 MiB cap is a REAL oversized fixture (no stub) with a boundary pair
 *     that kills the `>`-vs-`>=` mutant.
 *
 * safe-fs is a mutable module singleton shared by require cache, so the module
 * under test sees our stub. node's test runner isolates each test FILE in its
 * own process, so the sibling suite is unaffected; within this file every stub
 * is restored in finally.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const om = require('../src/lib/operating-manual');
const {
  mergeOperatingManual,
  resolveTemplate,
  BEGIN_MARKER,
  END_MARKER,
  MAX_CLAUDE_MD_BYTES
} = om;

// Same singleton instance the module under test holds (module cache).
const safeFs = require('../src/lib/safe-fs');

const CTOC_ROOT = path.resolve(__dirname, '..');
// The exact path resolveTemplate computes for its __dirname-relative primary.
const PRIMARY_TEMPLATE = path.join(
  CTOC_ROOT, '.ctoc', 'templates', 'operating-manual.md'
);

// ── helpers ─────────────────────────────────────────────────────────────────

function mkTmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-omc-'));
}
function rmTmp(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) { /* ignore */ }
}
function claudeMd(dir) {
  return path.join(dir, 'CLAUDE.md');
}
function occurrences(haystack, needle) {
  if (needle.length === 0) return 0;
  let n = 0;
  let i = haystack.indexOf(needle);
  while (i !== -1) { n++; i = haystack.indexOf(needle, i + needle.length); }
  return n;
}

/**
 * Run `body` with the primary template made to look ABSENT to resolveTemplate,
 * while every other path answers through the real safeFs.existsSync. Boundary
 * fake only (fs), restored unconditionally.
 */
function withPrimarySuppressed(body) {
  const realExists = safeFs.existsSync;
  safeFs.existsSync = (p) => (p === PRIMARY_TEMPLATE ? false : realExists(p));
  try { body(); } finally { safeFs.existsSync = realExists; }
}

// ── resolveTemplate: ctocRoot fallback branch (lines 47-48, 51) ──────────────

test('resolveTemplate_returns_ctocRoot_fallback_when_primary_absent_and_fallback_exists', () => {
  const ctoc = mkTmp();
  try {
    // Arrange — a REAL fallback template under a throwaway ctocRoot.
    const tplDir = path.join(ctoc, '.ctoc', 'templates');
    fs.mkdirSync(tplDir, { recursive: true });
    const fallbackPath = path.join(tplDir, 'operating-manual.md');
    fs.writeFileSync(fallbackPath, '# fallback body\n', 'utf8');

    // Act + Assert — primary suppressed, so resolution MUST fall through to it.
    withPrimarySuppressed(() => {
      const resolved = resolveTemplate(ctoc);
      assert.equal(resolved, fallbackPath,
        'must return the ctocRoot fallback path, not the primary');
    });
  } finally { rmTmp(ctoc); }
});

test('resolveTemplate_returns_null_when_primary_absent_and_ctocRoot_fallback_missing', () => {
  // Arrange — a ctocRoot that has no template file at all.
  const ctoc = mkTmp();
  try {
    withPrimarySuppressed(() => {
      // Act
      const resolved = resolveTemplate(ctoc);
      // Assert — fallback computed but nonexistent ⇒ null (not a bogus path).
      assert.equal(resolved, null);
    });
  } finally { rmTmp(ctoc); }
});

test('resolveTemplate_returns_null_when_primary_absent_and_ctocRoot_omitted', () => {
  // Pins the `: null` SECOND operand of the `ctocRoot ? … : null` ternary:
  // with no ctocRoot, fallback is null and resolution returns null — it must
  // NOT throw on path.join(undefined, …) or fabricate a path.
  withPrimarySuppressed(() => {
    // Act
    const resolved = resolveTemplate(undefined);
    // Assert
    assert.equal(resolved, null);
  });
});

// ── mergeOperatingManual: template-not-found fail-open (lines 144-149) ───────

test('merge_returns_unchanged_with_target_path_when_template_unresolvable', () => {
  const dir = mkTmp();
  try {
    // Arrange — no CLAUDE.md yet; make BOTH primary and fallback unresolvable.
    assert.ok(!fs.existsSync(claudeMd(dir)), 'precondition: no CLAUDE.md');

    withPrimarySuppressed(() => {
      // Act — ctocRoot points nowhere real, primary suppressed ⇒ null template.
      const res = mergeOperatingManual(dir, { ctocRoot: '/no/such/ctoc/root' });

      // Assert — this branch returns the TARGET path (distinguishing it from the
      // invalid-projectRoot branch, which returns path:null), and writes nothing.
      assert.equal(res.action, 'unchanged');
      assert.equal(res.path, claudeMd(dir),
        'template-not-found reports the target path, not null');
    });
    assert.ok(!fs.existsSync(claudeMd(dir)),
      'no template ⇒ CLAUDE.md must NOT be created');
  } finally { rmTmp(dir); }
});

// ── atomicWrite: EXDEV cross-device retry succeeds (lines 100, 104-112) ──────

test('merge_completes_via_same_dir_retry_when_first_rename_raises_EXDEV', () => {
  const dir = mkTmp();
  const realRename = safeFs.renameSync;
  let renameCalls = 0;
  safeFs.renameSync = (from, to) => {
    renameCalls += 1;
    if (renameCalls === 1) {
      // First rename is tmp(os.tmpdir) → target: simulate cross-device move.
      const e = new Error('simulated cross-device link');
      e.code = 'EXDEV';
      throw e;
    }
    return realRename(from, to); // same-dir retry runs for real
  };
  try {
    // Act — create path: template real, target absent ⇒ atomicWrite invoked.
    const res = mergeOperatingManual(dir, { ctocRoot: CTOC_ROOT });

    // Assert — the EXDEV branch recovered: file written exactly once, cleanly.
    assert.equal(res.action, 'created');
    assert.equal(renameCalls, 2, 'must retry rename exactly once after EXDEV');
    const content = fs.readFileSync(claudeMd(dir), 'utf8');
    assert.equal(occurrences(content, BEGIN_MARKER), 1, 'exactly one block written');
    const leftovers = fs.readdirSync(dir).filter((f) => f !== 'CLAUDE.md');
    assert.deepEqual(leftovers, [], 'same-dir temp file must be renamed away, none left');
  } finally {
    safeFs.renameSync = realRename;
    rmTmp(dir);
  }
});

// ── atomicWrite: non-EXDEV rethrow → outer catch fail-open (100-102, 224-231) ─

test('merge_returns_unchanged_without_throwing_when_rename_raises_non_EXDEV', () => {
  const dir = mkTmp();
  const realRename = safeFs.renameSync;
  const realUnlink = safeFs.unlinkSync;
  let unlinked = 0;
  safeFs.unlinkSync = (p) => { unlinked += 1; return realUnlink(p); };
  safeFs.renameSync = () => {
    const e = new Error('simulated permission denied');
    e.code = 'EACCES'; // NOT EXDEV ⇒ cleanup tmp + rethrow, caught fail-open
    throw e;
  };
  try {
    let res;
    // Act — must NOT throw despite the boundary raising a hard error.
    assert.doesNotThrow(() => {
      res = mergeOperatingManual(dir, { ctocRoot: CTOC_ROOT });
    });

    // Assert — fail-open contract: unchanged, target path reported, nothing written,
    // and the orphaned temp file was cleaned up before the rethrow.
    assert.equal(res.action, 'unchanged');
    assert.equal(res.path, claudeMd(dir));
    assert.ok(!fs.existsSync(claudeMd(dir)), 'no partial file on write failure');
    assert.ok(unlinked >= 1, 'temp file must be unlinked on the non-EXDEV path');
  } finally {
    safeFs.renameSync = realRename;
    safeFs.unlinkSync = realUnlink;
    rmTmp(dir);
  }
});

// ── size cap: `>` not `>=` boundary pair (lines 164-170) ─────────────────────

test('merge_skips_file_that_is_one_byte_over_the_size_cap', () => {
  const dir = mkTmp();
  try {
    // Arrange — a CLAUDE.md exactly one byte past the cap (no block inside).
    const oversized = 'a'.repeat(MAX_CLAUDE_MD_BYTES + 1);
    fs.writeFileSync(claudeMd(dir), oversized, 'utf8');
    const before = fs.readFileSync(claudeMd(dir), 'utf8');

    // Act
    const res = mergeOperatingManual(dir, { ctocRoot: CTOC_ROOT });

    // Assert — oversized ⇒ left byte-for-byte untouched, no block appended.
    assert.equal(res.action, 'unchanged');
    const after = fs.readFileSync(claudeMd(dir), 'utf8');
    assert.equal(after, before, 'oversized file must not be rewritten');
    assert.equal(occurrences(after, BEGIN_MARKER), 0, 'no block appended to oversized file');
  } finally { rmTmp(dir); }
});

test('merge_processes_file_that_is_exactly_at_the_size_cap', () => {
  const dir = mkTmp();
  try {
    // Arrange — exactly at the cap: `size > MAX` is FALSE, so it must proceed.
    // (Kills the `>=` mutant, which would wrongly skip this file.)
    const atCap = 'a'.repeat(MAX_CLAUDE_MD_BYTES);
    fs.writeFileSync(claudeMd(dir), atCap, 'utf8');

    // Act
    const res = mergeOperatingManual(dir, { ctocRoot: CTOC_ROOT });

    // Assert — at-cap file is processed and gets exactly one block inserted.
    assert.equal(res.action, 'inserted');
    const after = fs.readFileSync(claudeMd(dir), 'utf8');
    assert.equal(occurrences(after, BEGIN_MARKER), 1, 'at-cap file must receive the block');
  } finally { rmTmp(dir); }
});

// ── outer catch: non-Error throw defensive stringify (line 227 `|| err`) ─────

// A truthy string exercises `(err && err.message) || err` → `|| err`; a falsy
// null exercises the `err &&` short-circuit's false side (String(null)). Both
// must fail-open WITHOUT a secondary TypeError — the module's absolute contract.
for (const { id, thrown } of [
  { id: 'string', thrown: 'boundary blew up as a string' },
  { id: 'null', thrown: null }
]) {
  test(`merge_fails_open_when_boundary_throws_a_non_Error_${id}`, () => {
    const dir = mkTmp();
    const realRename = safeFs.renameSync;
    const realUnlink = safeFs.unlinkSync;
    safeFs.unlinkSync = () => {}; // swallow tmp cleanup; the raw throw propagates
    safeFs.renameSync = () => { throw thrown; };
    try {
      let res;
      // Act
      assert.doesNotThrow(() => {
        res = mergeOperatingManual(dir, { ctocRoot: CTOC_ROOT });
      });
      // Assert — unchanged, target reported, nothing written.
      assert.equal(res.action, 'unchanged');
      assert.equal(res.path, claudeMd(dir));
      assert.ok(!fs.existsSync(claudeMd(dir)), `no file written on a non-Error throw [${id}]`);
    } finally {
      safeFs.renameSync = realRename;
      safeFs.unlinkSync = realUnlink;
      rmTmp(dir);
    }
  });
}

// ── statSync race: catch → stat=null → proceed (lines 163-164 `stat &&`) ─────

test('merge_proceeds_when_statSync_throws_between_existsSync_and_stat', () => {
  const dir = mkTmp();
  const realStat = safeFs.statSync;
  // Simulate the existsSync→statSync race (file removed in between): statSync
  // throws, the caught branch sets stat=null, `stat &&` short-circuits false,
  // and the size-cap check is skipped so merge still processes the file.
  safeFs.statSync = () => { const e = new Error('ENOENT (raced away)'); e.code = 'ENOENT'; throw e; };
  try {
    // Arrange — an existing, block-less CLAUDE.md.
    fs.writeFileSync(claudeMd(dir), '# Project\n\nnotes\n', 'utf8');

    // Act
    const res = mergeOperatingManual(dir, { ctocRoot: CTOC_ROOT });

    // Assert — stat failure did NOT crash and did NOT wrongly skip: block inserted.
    assert.equal(res.action, 'inserted');
    const after = fs.readFileSync(claudeMd(dir), 'utf8');
    assert.equal(occurrences(after, BEGIN_MARKER), 1, 'block inserted despite stat failure');
  } finally {
    safeFs.statSync = realStat;
    rmTmp(dir);
  }
});

// ── CRLF update-splice branch (line 215 `l + '\r'` on the update path) ────────

test('merge_updates_mutated_block_with_CRLF_line_endings_on_a_CRLF_file', () => {
  const dir = mkTmp();
  try {
    // Arrange — seed a CRLF file, let merge insert the block, then corrupt the
    // block body so the next merge takes the UPDATE (splice) path, not insert.
    const crlfSeed = '# Windows Project\r\n\r\nnotes\r\n';
    fs.writeFileSync(claudeMd(dir), crlfSeed, 'utf8');
    mergeOperatingManual(dir, { ctocRoot: CTOC_ROOT });

    const seeded = fs.readFileSync(claudeMd(dir), 'utf8');
    const beginIdx = seeded.indexOf(BEGIN_MARKER);
    const endIdx = seeded.indexOf(END_MARKER);
    const bodyStart = beginIdx + BEGIN_MARKER.length;
    const mutated = seeded.slice(0, bodyStart) + '\r\nTAMPERED\r\n' + seeded.slice(endIdx);
    fs.writeFileSync(claudeMd(dir), mutated, 'utf8');

    // Act
    const res = mergeOperatingManual(dir, { ctocRoot: CTOC_ROOT });

    // Assert — updated, tamper gone, and the re-spliced block carries CRLF
    // (the marker line ends with \r\n, proving the update-path EOL branch fired).
    assert.equal(res.action, 'updated');
    const restored = fs.readFileSync(claudeMd(dir), 'utf8');
    assert.ok(!restored.includes('TAMPERED'), 'tampered body replaced');
    assert.ok(restored.includes(BEGIN_MARKER + '\r\n'),
      'spliced block lines must carry the file\'s CRLF ending');
    assert.ok(restored.includes('notes\r\n'), 'CRLF prose outside the block preserved');
    assert.equal(occurrences(restored, BEGIN_MARKER), 1, 'still exactly one block');
  } finally { rmTmp(dir); }
});
