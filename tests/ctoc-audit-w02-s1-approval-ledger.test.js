'use strict';

// W02-s1 — Content-hashed approval-ledger module (finding C4).
//
// The ledger at `.ctoc/approvals/<slug>.json` is the single source of approval
// truth: provenance keyed to the plan's content hash and the exact gate edge,
// written only by the trusted approvePlan() path — never by an agent tool call.
// These tests assert BEHAVIOR — what `verify` accepts and rejects, and the
// path-traversal guard — not a bare return shape. Cases 3, 4, 5 (no-entry,
// edited, cross-edge) are the C4 forgery/replay guarantees and MUST be red
// before the module exists.
//
// Real files in real os.tmpdir() sandboxes; no test doubles. Each case tears
// down its sandbox in afterEach.

const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ledger = require('../src/lib/approval-ledger.js');

// ---------------------------------------------------------------------------
// Sandbox harness — a real project root under os.tmpdir(), torn down per test.
// ---------------------------------------------------------------------------

const sandboxes = [];

function makeSandbox() {
  const dir = path.join(
    os.tmpdir(),
    'ctoc-w02s1-' + process.pid + '-' + Date.now() + '-' + Math.random().toString(36).slice(2)
  );
  fs.mkdirSync(dir, { recursive: true });
  sandboxes.push(dir);
  return dir;
}

afterEach(() => {
  while (sandboxes.length) {
    const dir = sandboxes.pop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ===========================================================================
// Case 1 — write → read round-trips the entry (with a defaulted approved_at)
// ===========================================================================

describe('Case 1 — writeEntry then readEntry round-trips the recorded fields', () => {
  it('reads back content_sha256, stage_from, stage_to, plus a defaulted approved_at', () => {
    const root = makeSandbox();
    const written = ledger.writeEntry(
      'p',
      { content_sha256: 'abc', stage_from: 'review', stage_to: 'done' },
      root
    );

    // The file landed strictly under .ctoc/approvals/.
    const onDisk = path.join(root, '.ctoc', 'approvals', 'p.json');
    assert.ok(fs.existsSync(onDisk), 'ledger entry written to .ctoc/approvals/p.json');

    const read = ledger.readEntry('p', root);
    assert.equal(read.content_sha256, 'abc');
    assert.equal(read.stage_from, 'review');
    assert.equal(read.stage_to, 'done');
    assert.ok(typeof read.approved_at === 'string' && read.approved_at.length > 0,
      'approved_at defaulted to a non-empty ISO timestamp when absent');

    // writeEntry returns the written entry object.
    assert.equal(written.content_sha256, 'abc');
    assert.equal(written.stage_to, 'done');
  });
});

// ===========================================================================
// Case 2 — verify ACCEPTS a matching entry (hash + stage_to both agree)
// ===========================================================================

describe('Case 2 — verify accepts an entry whose hash and stage_to both match', () => {
  it('returns true for a content-hash + stage_to match', () => {
    const root = makeSandbox();
    const content = '---\ntitle: "x"\n---\n# body\n';
    ledger.writeEntry(
      'p',
      { content_sha256: ledger.computeContentHash(content), stage_from: 'review', stage_to: 'done' },
      root
    );
    assert.equal(ledger.verify('p', content, 'done', root), true);
  });
});

// ===========================================================================
// Case 3 (C4 forgery) — verify REJECTS a missing entry
// ===========================================================================

describe('Case 3 (C4) — verify rejects a self-authored marker with no ledger entry', () => {
  it('returns false when no entry was ever written', () => {
    const root = makeSandbox();
    const content = '---\ntitle: "x"\napproved_by: human\n---\n# body\n';
    // No writeEntry: an agent-authored marker with no ledger backing.
    assert.equal(ledger.verify('p', content, 'done', root), false);
  });
});

// ===========================================================================
// Case 4 (C4 post-approval edit) — verify REJECTS a hash mismatch
// ===========================================================================

describe('Case 4 (C4) — verify rejects a post-approval edit (hash mismatch)', () => {
  it('returns false once the live content no longer matches the recorded hash', () => {
    const root = makeSandbox();
    const content = '---\ntitle: "x"\n---\n# body\n';
    ledger.writeEntry(
      'p',
      { content_sha256: ledger.computeContentHash(content), stage_from: 'review', stage_to: 'done' },
      root
    );
    // The plan is edited after approval; the live hash diverges from the entry.
    assert.equal(ledger.verify('p', content + '\nedited', 'done', root), false);
  });
});

// ===========================================================================
// Case 5 (C4 replay) — verify REJECTS a stage_to mismatch (no cross-edge replay)
// ===========================================================================

describe('Case 5 (C4) — verify rejects a stage_to mismatch (no cross-edge replay)', () => {
  it('an entry recorded for implementation cannot validate a done residency', () => {
    const root = makeSandbox();
    const content = '---\ntitle: "x"\n---\n# body\n';
    ledger.writeEntry(
      'p',
      { content_sha256: ledger.computeContentHash(content), stage_from: 'functional', stage_to: 'implementation' },
      root
    );
    assert.equal(ledger.verify('p', content, 'done', root), false);
    // ...and it still validates the edge it WAS recorded for (positive control).
    assert.equal(ledger.verify('p', content, 'implementation', root), true);
  });
});

// ===========================================================================
// Case 6 (traversal guard) — ledgerPath rejects a crafted traversal slug
// ===========================================================================

describe('Case 6 — ledgerPath blocks a path-traversal slug; a valid slug stays under .ctoc/approvals/', () => {
  it('throws on a traversal slug and confines a valid slug to the ledger directory', () => {
    const root = makeSandbox();
    assert.throws(() => ledger.ledgerPath('../../etc/passwd', root), /invalid slug/i,
      'a crafted slug must not escape .ctoc/approvals/');

    const valid = ledger.ledgerPath('ctoc-audit-w02-s1', root);
    const approvalsDir = path.join(root, '.ctoc', 'approvals');
    assert.ok(valid.startsWith(approvalsDir + path.sep),
      'a valid slug resolves strictly under .ctoc/approvals/');
    assert.equal(valid, path.join(approvalsDir, 'ctoc-audit-w02-s1.json'));
  });
});

// ===========================================================================
// Case 7 (fail-soft read) — readEntry returns null on a corrupt file, no throw
// ===========================================================================

describe('Case 7 — readEntry is fail-soft on a corrupt ledger file', () => {
  it('returns null and does not throw when the ledger JSON is unparseable', () => {
    const root = makeSandbox();
    const approvalsDir = path.join(root, '.ctoc', 'approvals');
    fs.mkdirSync(approvalsDir, { recursive: true });
    fs.writeFileSync(path.join(approvalsDir, 'p.json'), '{ not json');

    let result;
    assert.doesNotThrow(() => {
      result = ledger.readEntry('p', root);
    });
    assert.equal(result, null, 'a corrupt ledger file reads as null, never a thrown stack trace');
    // A likewise-absent entry reads as null.
    assert.equal(ledger.readEntry('nope', root), null);
    // ...and verify on that corrupt/absent entry rejects.
    assert.equal(ledger.verify('p', 'anything', 'done', root), false);
  });
});

// ===========================================================================
// Supporting behavior — slugFromPlanPath is stage-stable (basename only)
// and writeEntry throws loudly on a missing required field.
// ===========================================================================

describe('Supporting — slugFromPlanPath strips .md and ignores the stage folder', () => {
  it('derives the same slug regardless of which stage folder the plan sits in', () => {
    const inReview = ledger.slugFromPlanPath(path.join('plans', 'review', 'ctoc-audit-w02-s1.md'));
    const inDone = ledger.slugFromPlanPath(path.join('plans', 'done', 'ctoc-audit-w02-s1.md'));
    assert.equal(inReview, 'ctoc-audit-w02-s1');
    assert.equal(inReview, inDone, 'slug is stable across a stage move (basename never changes)');
  });
});

describe('Supporting — writeEntry rejects a missing required field (no silent half-entry)', () => {
  it('throws when content_sha256, stage_from, or stage_to is absent', () => {
    const root = makeSandbox();
    assert.throws(() => ledger.writeEntry('p', { stage_from: 'review', stage_to: 'done' }, root),
      /content_sha256/);
    assert.throws(() => ledger.writeEntry('p', { content_sha256: 'abc', stage_to: 'done' }, root),
      /stage_from/);
    assert.throws(() => ledger.writeEntry('p', { content_sha256: 'abc', stage_from: 'review' }, root),
      /stage_to/);
    // None of the failed writes left a file behind.
    assert.ok(!fs.existsSync(path.join(root, '.ctoc', 'approvals', 'p.json')),
      'a rejected write leaves no partial ledger file');
  });
});

describe('Supporting — removeEntry is best-effort (no throw when absent)', () => {
  it('removes an existing entry and no-ops on an absent one', () => {
    const root = makeSandbox();
    ledger.writeEntry('p', { content_sha256: 'abc', stage_from: 'review', stage_to: 'done' }, root);
    assert.ok(fs.existsSync(path.join(root, '.ctoc', 'approvals', 'p.json')));
    ledger.removeEntry('p', root);
    assert.ok(!fs.existsSync(path.join(root, '.ctoc', 'approvals', 'p.json')), 'entry removed');
    assert.doesNotThrow(() => ledger.removeEntry('p', root), 'removing an absent entry does not throw');
  });
});
