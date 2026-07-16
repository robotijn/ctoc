'use strict';

/**
 * approval-ledger-atomicity — the SINGLE SOURCE OF APPROVAL TRUTH must survive a
 * crash DURING a re-write. `persistEntry` is the shared leaf writer for every
 * entry kind (writeEntry, writePipelineEntry, writeVisionArchiveEntry,
 * backfillEntry, idempotent re-approval). A bare `writeFileSync(target, …)` is
 * destructive-in-place: a crash mid-write truncates the pretty-printed JSON and a
 * COMMITTED human approval reads back corrupt (verify → false). The fix mirrors
 * the reference-correct atomic writer in task-registry.save: write a sibling temp,
 * then rename over the target; on any error unlink the temp and rethrow. Rename is
 * the atomic commit — the reader sees either the whole old file or the whole new
 * file, never a truncation.
 *
 * These tests provoke the crash at the true commit point by making
 * `safeFs.renameSync` throw AFTER the temp is written, and assert the pre-existing
 * committed entry is left byte-for-byte intact with no temp litter. Real
 * os.tmpdir() sandboxes, real files; the only stub is renameSync (the crash
 * point), restored in finally.
 */

const { describe, it, after, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ledger = require('../src/lib/approval-ledger.js');
const safeFs = require('../src/lib/safe-fs.js');

const sandboxes = [];

function makeSandbox() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-aledger-atom-'));
  sandboxes.push(dir);
  fs.mkdirSync(path.join(dir, '.ctoc', 'approvals'), { recursive: true });
  return dir;
}

/** List the *.tmp* litter left behind in the approvals dir (must always be empty). */
function tmpLitter(root) {
  const dir = path.join(root, '.ctoc', 'approvals');
  return fs.readdirSync(dir).filter((f) => f.includes('.tmp'));
}

const origRename = safeFs.renameSync;
afterEach(() => {
  // Always restore the real rename, whatever a test did to it.
  safeFs.renameSync = origRename;
});

after(() => {
  while (sandboxes.length) {
    const dir = sandboxes.pop();
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ }
  }
});

describe('persistEntry commits atomically — a crash during re-write cannot corrupt a committed approval', () => {
  it('a rename failure during re-approval leaves the pre-existing entry byte-identical and un-truncated', () => {
    const root = makeSandbox();

    // Commit a real human approval, then snapshot its exact on-disk bytes.
    ledger.writeEntry('p', {
      content_sha256: 'a'.repeat(64), stage_from: 'todo', stage_to: 'review',
      approved_at: '2026-01-01T00:00:00.000Z', approved_by: 'human',
    }, root);
    const target = ledger.ledgerPath('p', root);
    const before = fs.readFileSync(target);
    assert.equal(ledger.verify('p', 'ignored', 'review', root) === false, true); // hash differs → false, but the entry IS present
    assert.ok(ledger.readEntry('p', root), 'entry present before the crash');

    // Simulate a crash at the atomic commit point: the temp is written, the
    // rename throws (power loss between write and rename).
    let tmpSeenAtCrash = null;
    safeFs.renameSync = () => {
      tmpSeenAtCrash = tmpLitter(root); // the temp must exist at this instant
      throw new Error('ENOSPC: simulated crash during rename');
    };

    // Re-approve with DIFFERENT content — the destructive in-place write path.
    assert.throws(
      () => ledger.writeEntry('p', {
        content_sha256: 'b'.repeat(64), stage_from: 'todo', stage_to: 'review',
        approved_by: 'human',
      }, root),
      /simulated crash during rename/,
      'a commit failure must propagate, never be swallowed',
    );

    safeFs.renameSync = origRename;

    // The committed approval is UNCHANGED — not truncated, not partially rewritten.
    const after = fs.readFileSync(target);
    assert.deepEqual(after, before, 'the pre-existing entry must be byte-identical after a failed re-write');

    // The entry still parses and still carries the ORIGINAL committed content hash.
    const read = ledger.readEntry('p', root);
    assert.ok(read, 'the committed entry must still be readable after the crash');
    assert.equal(read.content_sha256, 'a'.repeat(64), 'the original committed hash must survive');
    assert.equal(ledger.readEntryResult('p', root).status, 'ok', 'the entry must read back OK, never corrupt');

    // The failed write left a temp behind that was then cleaned up (no litter).
    assert.ok(tmpSeenAtCrash && tmpSeenAtCrash.length >= 1, 'a temp sibling must exist at the crash point (proves temp+rename)');
    assert.deepEqual(tmpLitter(root), [], 'a failed commit must not leak a temp file');
  });

  it('a successful persistEntry leaves a valid, readable entry and no temp litter', () => {
    const root = makeSandbox();
    ledger.writeEntry('q', {
      content_sha256: 'c'.repeat(64), stage_from: 'review', stage_to: 'done', approved_by: 'human',
    }, root);
    assert.equal(ledger.readEntryResult('q', root).status, 'ok');
    assert.equal(ledger.readEntry('q', root).content_sha256, 'c'.repeat(64));
    assert.deepEqual(tmpLitter(root), [], 'a successful write must not leave a temp behind');
  });

  it('an overwrite (idempotent re-approval) of an existing entry stays atomic and readable', () => {
    const root = makeSandbox();
    ledger.writeEntry('r', {
      content_sha256: 'd'.repeat(64), stage_from: 'todo', stage_to: 'review', approved_by: 'human',
    }, root);
    ledger.writeEntry('r', {
      content_sha256: 'e'.repeat(64), stage_from: 'todo', stage_to: 'review', approved_by: 'human',
    }, root);
    assert.equal(ledger.readEntry('r', root).content_sha256, 'e'.repeat(64), 're-approval must land the new content');
    assert.deepEqual(tmpLitter(root), [], 'the overwrite must not leave a temp behind');
  });
});
