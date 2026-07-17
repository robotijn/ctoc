'use strict';

/**
 * approval-ledger-coverage — mutation-hard tests for the DARK branches of the
 * tamper-evident approval ledger, complementing (never duplicating):
 *   - tests/ctoc-audit-w02-s1-approval-ledger.test.js  (verify accept/reject,
 *     traversal guard, fail-soft readEntry, required-field, removeEntry basic)
 *   - tests/approval-ledger-provenance.test.js          (backfill stage_from
 *     derivation for every gate edge, HUMAN_GATES, require acyclicity)
 *
 * Scoped baseline before this file: 86.14% line coverage of
 * src/lib/approval-ledger.js — uncovered lines 229-247 (writePipelineEntry),
 * 275-285 (writeVisionArchiveEntry), 315-320 (persistEntry collision guard),
 * 340-345 (entryKind), 357-378 (readEntryResult), 405-406 (backfillEntry
 * stage_to guard), 478-480 (removeEntry catch). Every test here pins one of
 * those branches so it goes RED under mutation. This is a gate-integrity
 * module: the load-bearing invariants are (a) a pipeline entry is NEVER stamped
 * as a human approval, (b) a backfilled entry is NEVER laundered as 'human',
 * (c) a pipeline write with no evidence is refused, (d) a case-collision never
 * silently overwrites provenance, (e) the discriminated read distinguishes
 * unkeyable / absent / corrupt / ok.
 *
 * Real os.tmpdir() sandboxes, real files, no test doubles. Filesystem error
 * paths (corrupt-on-read, unlink-of-directory) are provoked at the true fs
 * boundary by placing a DIRECTORY where a JSON leaf is expected — a genuine
 * EISDIR/EPERM, not a mock of the module's own logic. Each sandbox is removed
 * in the global `after`.
 *
 * Human-reviewed line-by-line before commit (AI-assist review clause): every
 * assertion checks a provenance/classification OUTCOME, not a call sequence.
 */

const { describe, it, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ledger = require('../src/lib/approval-ledger.js');

// ---------------------------------------------------------------------------
// Sandbox harness — a real project root under os.tmpdir(), all torn down once.
// ---------------------------------------------------------------------------

const sandboxes = [];

function makeSandbox() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-aledger-cov-'));
  sandboxes.push(dir);
  fs.mkdirSync(path.join(dir, '.ctoc', 'approvals'), { recursive: true });
  return dir;
}

/** Write a real plan file under plans/<stage>/ and return { filePath, content }. */
function writePlanFile(root, stage, basename, body) {
  const content = body !== undefined
    ? body
    : `---\ntitle: "${basename}"\ntype: feature\n---\n\n# ${basename}\n\nBody.\n`;
  const dir = path.join(root, 'plans', stage);
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, `${basename}.md`);
  fs.writeFileSync(filePath, content);
  return { filePath, content };
}

after(() => {
  while (sandboxes.length) {
    const dir = sandboxes.pop();
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ }
  }
});

// ===========================================================================
// writePipelineEntry — evidence is MANDATORY (the pipeline-vs-human firewall).
// Kills a mutant that admits a pipeline entry with no/blank evidence, or that
// short-circuits the guard. Lines 231-233.
// ===========================================================================

describe('writePipelineEntry rejects a missing or blank evidence string', () => {
  const badEvidence = [
    { id: 'evidence-absent', entry: { content_sha256: 'h', stage_from: 'review', stage_to: 'done' } },
    { id: 'evidence-empty-string', entry: { content_sha256: 'h', stage_from: 'review', stage_to: 'done', evidence: '' } },
    { id: 'evidence-whitespace-only', entry: { content_sha256: 'h', stage_from: 'review', stage_to: 'done', evidence: '   ' } },
    { id: 'evidence-non-string-number', entry: { content_sha256: 'h', stage_from: 'review', stage_to: 'done', evidence: 42 } },
  ];

  for (const { id, entry } of badEvidence) {
    it(`throws for [${id}] and writes no partial ledger file`, () => {
      const root = makeSandbox();

      assert.throws(() => ledger.writePipelineEntry('p', entry, root),
        /pipeline entry requires non-empty "evidence"/);

      assert.equal(fs.existsSync(path.join(root, '.ctoc', 'approvals', 'p.json')), false,
        'a refused pipeline write must leave no file');
    });
  }

  it('handles a null entry via the `entry || {}` fallback (no crash, evidence guard fires)', () => {
    // The `|| {}` second operand: a null entry must not throw on property access —
    // it falls through to the evidence guard.
    const root = makeSandbox();
    assert.throws(() => ledger.writePipelineEntry('p', null, root),
      /pipeline entry requires non-empty "evidence"/);
  });

  it('still enforces the required fields AFTER the evidence guard passes', () => {
    // Arrange — evidence present, but content_sha256 missing.
    const root = makeSandbox();

    // Act + Assert — the shared persistEntry required-field guard fires.
    assert.throws(
      () => ledger.writePipelineEntry('p', { stage_from: 'review', stage_to: 'done', evidence: 'stale-reconciliation' }, root),
      /missing required field "content_sha256"/);
  });
});

// ===========================================================================
// writePipelineEntry — happy path stamps advanced_by:'pipeline' and NO
// approved_by, so entryKind classifies it 'pipeline' and it can never be read
// as a human approval. Lines 234-247. This is the pipeline/human firewall on
// the accept side.
// ===========================================================================

describe('writePipelineEntry records a pipeline-kind entry that never reads as human', () => {
  it('stamps advanced_by pipeline, omits approved_by, and entryKind returns pipeline', () => {
    // Arrange
    const root = makeSandbox();
    const content = '---\ntitle: "x"\n---\n# body\n';

    // Act
    const written = ledger.writePipelineEntry('p', {
      content_sha256: ledger.computeContentHash(content),
      stage_from: 'review',
      stage_to: 'done',
      evidence: 'stale-reconciliation',
    }, root);

    // Assert — provenance is pipeline, not human, and it round-trips through disk.
    const read = ledger.readEntry('p', root);
    assert.equal(written.advanced_by, 'pipeline');
    assert.equal(read.advanced_by, 'pipeline');
    assert.equal(read.approved_by, undefined, 'a pipeline entry must carry no approved_by marker');
    assert.equal(read.evidence, 'stale-reconciliation');
    assert.equal(ledger.entryKind(read), 'pipeline');
    // Structurally it is still a valid ledger entry: verify accepts the matching edge.
    assert.equal(ledger.verify('p', content, 'done', root), true);
  });

  it('passes plan_basename through for the case-collision guard on the pipeline path', () => {
    const root = makeSandbox();

    const written = ledger.writePipelineEntry('cu1-foo', {
      content_sha256: 'h', stage_from: 'review', stage_to: 'done',
      evidence: 'vision-decomposed', plan_basename: 'CU1-Foo',
    }, root);

    assert.equal(written.plan_basename, 'CU1-Foo');
    assert.equal(ledger.readEntry('cu1-foo', root).plan_basename, 'CU1-Foo');
  });
});

// ===========================================================================
// X6 — writeSufficiencyEntry mirrors writePipelineEntry, with ONE extra guard:
// `approved_by` is FORBIDDEN, not stripped. Evidence is MANDATORY. The entry
// stamps advanced_by:'sufficiency' and NO approved_by, so a machine cross can
// never wear the human's marker (the exact forgery shape X5 removed).
// ===========================================================================

describe('X6 — writeSufficiencyEntry: evidence mandatory, approved_by REFUSED', () => {
  // Case 1: no evidence is refused LOUDLY, like the pipeline writer.
  const badEvidence = [
    { id: 'evidence-absent', entry: { content_sha256: 'h', stage_from: 'functional', stage_to: 'implementation' } },
    { id: 'evidence-empty', entry: { content_sha256: 'h', stage_from: 'functional', stage_to: 'implementation', evidence: '' } },
    { id: 'evidence-whitespace', entry: { content_sha256: 'h', stage_from: 'functional', stage_to: 'implementation', evidence: '  ' } },
    { id: 'evidence-non-string', entry: { content_sha256: 'h', stage_from: 'functional', stage_to: 'implementation', evidence: 7 } },
  ];
  for (const { id, entry } of badEvidence) {
    it(`case 1 — throws for [${id}] and writes no partial file`, () => {
      const root = makeSandbox();
      assert.throws(() => ledger.writeSufficiencyEntry('s', entry, root),
        /sufficiency entry requires non-empty "evidence"/);
      assert.equal(fs.existsSync(path.join(root, '.ctoc', 'approvals', 's.json')), false,
        'a refused sufficiency write must leave no file');
    });
  }

  it('case 1 — a null entry falls through to the evidence guard (no crash)', () => {
    const root = makeSandbox();
    assert.throws(() => ledger.writeSufficiencyEntry('s', null, root),
      /sufficiency entry requires non-empty "evidence"/);
  });

  // Case 2: THE FORGERY GUARD — approved_by is THROWN, never stripped. A caller
  // passing approved_by:'human' must crash loudly; silent sanitisation is how the
  // forgery becomes possible again (Decision 2).
  it('case 2 — REFUSES approved_by:human, it does not silently strip it', () => {
    const root = makeSandbox();
    assert.throws(
      () => ledger.writeSufficiencyEntry('s', {
        content_sha256: 'h', stage_from: 'functional', stage_to: 'implementation',
        evidence: 'sufficiency: functional/s.md — 1 answered (db)', approved_by: 'human',
      }, root),
      /must NOT carry "approved_by"|approved_by/,
      'a machine cross wearing the human marker is the forgery shape — REFUSE it',
    );
    assert.equal(fs.existsSync(path.join(root, '.ctoc', 'approvals', 's.json')), false,
      'the refused write leaves NO entry — nothing to later launder');
  });

  it('case 2 — the presence of the approved_by KEY decides, not its value', () => {
    const root = makeSandbox();
    // Even approved_by: undefined is a positive attempt to set the human marker on a
    // machine entry — the presence-guard refuses it (mirrors entryKind's presence rule).
    assert.throws(
      () => ledger.writeSufficiencyEntry('s', {
        content_sha256: 'h', stage_from: 'functional', stage_to: 'implementation',
        evidence: 'sufficiency: functional/s.md — 0 answered ()', approved_by: undefined,
      }, root),
      /approved_by/);
  });

  it('happy path — stamps advanced_by:sufficiency, NO approved_by, entryKind returns sufficiency', () => {
    const root = makeSandbox();
    const content = '---\ntitle: "x"\n---\n# body\n';
    const written = ledger.writeSufficiencyEntry('s', {
      content_sha256: ledger.computeContentHash(content),
      stage_from: 'functional',
      stage_to: 'implementation',
      evidence: 'sufficiency: functional/s.md — 2 answered (db, auth)',
      plan_basename: 's',
    }, root);
    const read = ledger.readEntry('s', root);
    assert.equal(written.advanced_by, 'sufficiency');
    assert.equal(read.advanced_by, 'sufficiency');
    assert.equal(read.approved_by, undefined, 'a sufficiency entry must carry NO approved_by marker');
    assert.equal(read.evidence, 'sufficiency: functional/s.md — 2 answered (db, auth)');
    assert.equal(ledger.entryKind(read), 'sufficiency');
    // Still a structurally valid ledger entry: verify accepts the matching edge.
    assert.equal(ledger.verify('s', content, 'implementation', root), true);
  });

  it('still enforces the required fields AFTER the evidence + approved_by guards pass', () => {
    const root = makeSandbox();
    assert.throws(
      () => ledger.writeSufficiencyEntry('s', { stage_from: 'functional', stage_to: 'implementation', evidence: 'e' }, root),
      /missing required field "content_sha256"/);
  });
});

// ===========================================================================
// writeVisionArchiveEntry — a decomposed vision archived to done/ earns its
// residency as a PIPELINE-kind entry hashing the file's CURRENT bytes. Lines
// 275-285. Kills mutants on the stage mapping (vision->done), the evidence
// constant, or the hash source.
// ===========================================================================

describe('writeVisionArchiveEntry ledgers a vision archive as a verifiable pipeline entry', () => {
  it('maps vision->done, stamps vision-decomposed evidence, and hashes the on-disk content', () => {
    // Arrange — a real vision file sitting in done/.
    const root = makeSandbox();
    const { filePath, content } = writePlanFile(root, 'done', 'my-vision',
      '---\ntitle: "My Vision"\ntype: vision\n---\n\n# My Vision\n');

    // Act
    const entry = ledger.writeVisionArchiveEntry(root, filePath);

    // Assert — the gate edge, evidence, and provenance are all pipeline-vision.
    assert.equal(entry.stage_from, 'vision');
    assert.equal(entry.stage_to, 'done');
    assert.equal(entry.evidence, 'vision-decomposed');
    assert.equal(entry.advanced_by, 'pipeline');
    assert.equal(entry.plan_basename, 'my-vision');
    assert.equal(ledger.entryKind(entry), 'pipeline');
    // The recorded hash is the file's live content, so verify accepts done/ residency.
    assert.equal(entry.content_sha256, ledger.computeContentHash(content));
    assert.equal(ledger.verify('my-vision', content, 'done', root), true);
    // ...and a later edit to the archived vision invalidates it, like any done/ resident.
    assert.equal(ledger.verify('my-vision', content + '\nedited', 'done', root), false);
  });

  it('throws (never silently records) when the vision file cannot be read', () => {
    const root = makeSandbox();
    const missing = path.join(root, 'plans', 'done', 'does-not-exist.md');

    assert.throws(() => ledger.writeVisionArchiveEntry(root, missing), /ENOENT|no such file/i);
  });
});

// ===========================================================================
// entryKind — the HONEST classification. This is the anti-laundering core:
// a backfilled entry must NOT report 'human'. Lines 340-345. Table-driven so
// each row pins a distinct branch and precedence rule.
// ===========================================================================

describe('entryKind classifies provenance honestly and never launders a backfill as human', () => {
  const rows = [
    { id: 'null-entry', entry: null, expected: null },
    { id: 'undefined-entry', entry: undefined, expected: null },
    { id: 'truthy-non-object', entry: 42, expected: null },
    { id: 'pipeline-by-advanced_by', entry: { advanced_by: 'pipeline' }, expected: 'pipeline' },
    { id: 'backfilled-true', entry: { backfilled: true, approved_by: 'human' }, expected: 'backfilled' },
    { id: 'plain-human', entry: { approved_by: 'human' }, expected: 'human' },
    // A truthy-but-not-strictly-true backfilled value must NOT classify as backfilled
    // (kills a `=== true` -> truthy mutant): it rests on its explicit approved_by
    // marker and classifies 'human'.
    { id: 'backfilled-truthy-not-true', entry: { backfilled: 'yes', approved_by: 'human' }, expected: 'human' },
    // Precedence: pipeline is checked before backfilled.
    { id: 'pipeline-wins-over-backfilled', entry: { advanced_by: 'pipeline', backfilled: true }, expected: 'pipeline' },

    // --- X5: provenance is a POSITIVE claim, never a fallthrough -------------
    // An entry with NO positive marker is 'unknown' — NOT 'human'. Until X5 this
    // returned 'human' and the gate hook accepted it at every gate: `'human'` was
    // the ABSENCE of evidence. This row kills the `return 'human'` default.
    { id: 'no-marker-at-all', entry: {}, expected: 'unknown' },
    { id: 'approved_by-not-human', entry: { approved_by: 'claude' }, expected: 'unknown' },
    // An unrecognised machine provenance is 'unknown', never 'human'. This is the
    // exact shape (`advanced_by: 'sufficiency-gate'`) that was waved through.
    { id: 'unrecognised-advanced_by', entry: { advanced_by: 'sufficiency-gate' }, expected: 'unknown' },
    // THE FORGERY SHAPE (Decision 3, the whole fix): a machine cross WEARING the
    // human's marker. `advanced_by` is checked BEFORE `approved_by`; reverse the
    // order and this launders back to 'human' and the plan is a no-op.
    { id: 'machine-wearing-the-human-marker',
      entry: { advanced_by: 'sufficiency-gate', approved_by: 'human' }, expected: 'unknown' },
    // ...and it beats a backfilled marker too — order is advanced_by, then backfilled.
    { id: 'machine-wearing-the-backfill-marker',
      entry: { advanced_by: 'sufficiency-gate', backfilled: true }, expected: 'unknown' },
    // Recognition is EXACT: a near-miss on the one recognised value fails CLOSED
    // rather than being normalised into acceptance (kills a loosened-match mutant).
    { id: 'pipeline-wrong-case', entry: { advanced_by: 'PIPELINE' }, expected: 'unknown' },
    { id: 'pipeline-padded', entry: { advanced_by: ' pipeline ' }, expected: 'unknown' },
    // TIGHTENED after X5 (owner's call): the KEY'S PRESENCE decides, not its type.
    //
    // These three rows previously expected 'human' / 'backfilled' — they encoded a
    // type-guard (`typeof advanced_by === 'string' && trim() !== ''`) under which a
    // MALFORMED advanced_by fell through to the approved_by check and was accepted
    // as a clicked approval. That is a fallthrough, and a fallthrough is the exact
    // defect class X5 exists to kill, one level down: "the machine's provenance
    // claim is malformed, therefore trust the human marker sitting next to it."
    //
    // An entry carrying `advanced_by` AT ALL is claiming a machine crossed this
    // gate. A malformed claim is still a claim. Only the exact string 'pipeline'
    // names a provenance this system recognises; everything else fails closed,
    // EVEN beside an explicit approved_by:'human'. That pairing — a machine cross
    // wearing the human's marker — is the precise shape of the 26 forgeries removed
    // from this repo on 2026-07-17.
    //
    // Verified free: 0 of the 263 real ledger entries carry an `advanced_by` key of
    // any type, so this reclassifies nothing on disk. Verified non-vacuous: all 8
    // malformed shapes ('', '   ', null, 123, 0, false, {}, []) paired with
    // approved_by:'human' classified 'human' under the old guard and 'unknown' now.
    { id: 'empty-advanced_by-no-marker', entry: { advanced_by: '' }, expected: 'unknown' },
    { id: 'empty-advanced_by-with-human', entry: { advanced_by: '', approved_by: 'human' }, expected: 'unknown' },
    { id: 'whitespace-advanced_by-backfilled',
      entry: { advanced_by: '   ', backfilled: true }, expected: 'unknown' },
    // A non-string advanced_by is a claim too — the key is present. These rows kill
    // any attempt to reintroduce a `typeof` or truthiness guard on the value.
    { id: 'numeric-advanced_by-no-marker', entry: { advanced_by: 123 }, expected: 'unknown' },
    { id: 'numeric-advanced_by-with-human',
      entry: { advanced_by: 123, approved_by: 'human' }, expected: 'unknown' },
    { id: 'null-advanced_by-with-human',
      entry: { advanced_by: null, approved_by: 'human' }, expected: 'unknown' },
    { id: 'object-advanced_by-with-human',
      entry: { advanced_by: {}, approved_by: 'human' }, expected: 'unknown' },
    { id: 'false-advanced_by-with-backfill',
      entry: { advanced_by: false, backfilled: true }, expected: 'unknown' },

    // --- X6: the recognised set grows by EXACTLY ONE — 'sufficiency' ----------
    // Case 3: the new provenance is recognised. RED before X6 (returned 'unknown').
    { id: 'sufficiency-recognised', entry: { advanced_by: 'sufficiency' }, expected: 'sufficiency' },
    // Case 4: the no-WIDENING guard. Recognition stays EXACT — the near-misses of
    // the new value must ALL keep failing closed to 'unknown', exactly like the
    // pipeline near-misses above. This is the guard that the X6 fix did not widen
    // into the hole X5 just closed; these rows are GREEN before X6 and MUST stay green.
    { id: 'sufficiency-gate-still-unknown', entry: { advanced_by: 'sufficiency-gate' }, expected: 'unknown' },
    { id: 'sufficiency-capitalized', entry: { advanced_by: 'Sufficiency' }, expected: 'unknown' },
    { id: 'sufficiency-padded', entry: { advanced_by: ' sufficiency ' }, expected: 'unknown' },
    // ...and the forgery shape on the NEW provenance: a sufficiency-ish claim wearing
    // the human's marker is still 'unknown' — advanced_by is checked before approved_by.
    { id: 'sufficiency-near-miss-wearing-human',
      entry: { advanced_by: 'Sufficiency', approved_by: 'human' }, expected: 'unknown' },
  ];

  for (const { id, entry, expected } of rows) {
    it(`returns ${JSON.stringify(expected)} for [${id}]`, () => {
      assert.equal(ledger.entryKind(entry), expected);
    });
  }
});

// ===========================================================================
// backfillEntry — the recorded entry classifies 'backfilled', NOT 'human',
// even though it carries approved_by:'human'. Drives the real writer end to
// end. Also pins the backfill_reason default. (Complements the provenance
// test, which only checks stage_from derivation.)
// ===========================================================================

describe('backfillEntry writes a backfilled-kind entry that an audit can tell from a live human approval', () => {
  it('marks backfilled:true and entryKind reports backfilled despite approved_by human', () => {
    // Arrange
    const root = makeSandbox();
    const { filePath, content } = writePlanFile(root, 'done', 'legacy-plan');

    // Act
    const entry = ledger.backfillEntry(root, filePath, { stage_to: 'done', reason: 'pre-ledger migration' });

    // Assert — accepted as human-authorized, but classified backfilled (truthful audit).
    const read = ledger.readEntry('legacy-plan', root);
    assert.equal(read.backfilled, true);
    assert.equal(read.approved_by, 'human');
    assert.equal(read.backfill_reason, 'pre-ledger migration');
    assert.equal(ledger.entryKind(read), 'backfilled',
      'a backfilled entry must never launder as a live human approval');
    // It still verifies the done/ edge for the current bytes.
    assert.equal(entry.content_sha256, ledger.computeContentHash(content));
    assert.equal(ledger.verify('legacy-plan', content, 'done', root), true);
  });

  it('defaults backfill_reason to an empty string when the caller omits it', () => {
    const root = makeSandbox();
    const { filePath } = writePlanFile(root, 'done', 'no-reason-plan');

    const entry = ledger.backfillEntry(root, filePath, { stage_to: 'done' });

    assert.equal(entry.backfill_reason, '', 'omitted reason must record as "" not undefined');
  });
});

// ===========================================================================
// backfillEntry — refuses without a destination stage. Lines 404-406. A
// backfill with no stage_to would record an entry that can validate any edge.
// ===========================================================================

describe('backfillEntry refuses a missing destination stage', () => {
  const badOpts = [
    { id: 'opts-omitted', opts: undefined },
    { id: 'stage_to-missing', opts: { reason: 'x' } },
    { id: 'stage_to-empty', opts: { stage_to: '' } },
    { id: 'stage_to-non-string', opts: { stage_to: 5 } },
  ];

  for (const { id, opts } of badOpts) {
    it(`throws for [${id}]`, () => {
      const root = makeSandbox();
      const { filePath } = writePlanFile(root, 'done', 'needs-stage');

      const call = opts === undefined
        ? () => ledger.backfillEntry(root, filePath)
        : () => ledger.backfillEntry(root, filePath, opts);
      assert.throws(call, /backfillEntry requires opts\.stage_to/);
    });
  }
});

// ===========================================================================
// persistEntry — the case-collision guard. Two plans differing only by case
// key to the same canonical slug; a silent overwrite would erase one plan's
// provenance. Lines 311-321. Kills a mutant that drops the guard or the
// `existing.plan_basename !== undefined` leg.
// ===========================================================================

describe('persistEntry refuses to overwrite provenance across a case-only slug collision', () => {
  it('throws when a different original basename maps to an existing canonical key', () => {
    // Arrange — first plan claims the canonical key cu1-foo.
    const root = makeSandbox();
    ledger.writeEntry('cu1-foo',
      { content_sha256: 'h1', stage_from: 'review', stage_to: 'done', plan_basename: 'CU1-Foo' }, root);

    // Act + Assert — a differently-cased original basename collides and is refused loudly.
    assert.throws(
      () => ledger.writeEntry('cu1-foo',
        { content_sha256: 'h2', stage_from: 'review', stage_to: 'done', plan_basename: 'Cu1-FOO' }, root),
      /slug collision on canonical key "cu1-foo"/);

    // The original provenance survived untouched.
    assert.equal(ledger.readEntry('cu1-foo', root).plan_basename, 'CU1-Foo');
  });

  it('allows an idempotent re-write of the SAME original basename', () => {
    const root = makeSandbox();
    ledger.writeEntry('cu1-foo',
      { content_sha256: 'h1', stage_from: 'review', stage_to: 'done', plan_basename: 'CU1-Foo' }, root);

    assert.doesNotThrow(() => ledger.writeEntry('cu1-foo',
      { content_sha256: 'h2', stage_from: 'review', stage_to: 'done', plan_basename: 'CU1-Foo' }, root));
    assert.equal(ledger.readEntry('cu1-foo', root).content_sha256, 'h2', 're-approval updated the hash');
  });

  it('allows a write when the existing entry carries no plan_basename to collide with', () => {
    // Existing entry lacks plan_basename → the guard's first leg is false → no throw.
    const root = makeSandbox();
    ledger.writeEntry('cu1-foo', { content_sha256: 'h1', stage_from: 'review', stage_to: 'done' }, root);

    assert.doesNotThrow(() => ledger.writeEntry('cu1-foo',
      { content_sha256: 'h2', stage_from: 'review', stage_to: 'done', plan_basename: 'CU1-Foo' }, root));
  });
});

// ===========================================================================
// persistEntry — a required field that is present-but-BLANK (null or "") is
// rejected exactly like an absent one. Pins the second/third operands of the
// `=== undefined || === null || === ''` guard (line 307): a blank-hash or
// blank-edge entry must never be minted.
// ===========================================================================

describe('persistEntry rejects a required field that is explicitly null or empty', () => {
  const blanks = [
    { id: 'content_sha256-null', entry: { content_sha256: null, stage_from: 'review', stage_to: 'done' }, re: /content_sha256/ },
    { id: 'content_sha256-empty', entry: { content_sha256: '', stage_from: 'review', stage_to: 'done' }, re: /content_sha256/ },
    { id: 'stage_from-empty', entry: { content_sha256: 'h', stage_from: '', stage_to: 'done' }, re: /stage_from/ },
    { id: 'stage_to-null', entry: { content_sha256: 'h', stage_from: 'review', stage_to: null }, re: /stage_to/ },
  ];

  for (const { id, entry, re } of blanks) {
    it(`throws for [${id}] and writes no file`, () => {
      const root = makeSandbox();
      assert.throws(() => ledger.writeEntry('p', entry, root), re);
      assert.equal(fs.existsSync(path.join(root, '.ctoc', 'approvals', 'p.json')), false);
    });
  }
});

// ===========================================================================
// readEntryResult — discriminated status so the residency sweep can tell an
// un-keyable slug and a corrupt file apart from a plain absence. Lines 357-378.
// Each status is a distinct fail-safe branch.
// ===========================================================================

describe('readEntryResult discriminates unkeyable / absent / corrupt / ok', () => {
  it('reports unkeyable for a traversal slug WITHOUT throwing', () => {
    const root = makeSandbox();
    let result;
    assert.doesNotThrow(() => { result = ledger.readEntryResult('../../etc/passwd', root); });
    assert.deepEqual(result, { status: 'unkeyable', entry: null });
  });

  it('reports absent when no entry file exists', () => {
    const root = makeSandbox();
    assert.deepEqual(ledger.readEntryResult('never-written', root), { status: 'absent', entry: null });
  });

  it('reports ok with the parsed entry when the file is valid JSON', () => {
    const root = makeSandbox();
    ledger.writeEntry('p', { content_sha256: 'abc', stage_from: 'review', stage_to: 'done' }, root);

    const result = ledger.readEntryResult('p', root);
    assert.equal(result.status, 'ok');
    assert.equal(result.entry.content_sha256, 'abc');
  });

  it('reports corrupt (parse failure) for unparseable JSON, never absent', () => {
    const root = makeSandbox();
    fs.writeFileSync(path.join(root, '.ctoc', 'approvals', 'p.json'), '{ not json');

    assert.deepEqual(ledger.readEntryResult('p', root), { status: 'corrupt', entry: null });
  });

  it('reports corrupt (read failure) when the entry path exists but cannot be read', () => {
    // A DIRECTORY at the entry path: existsSync passes, readFileSync throws EISDIR.
    // This is the fail-SAFE direction — flag corrupt, never mistake it for absent.
    const root = makeSandbox();
    fs.mkdirSync(path.join(root, '.ctoc', 'approvals', 'p.json'), { recursive: true });

    let result;
    assert.doesNotThrow(() => { result = ledger.readEntryResult('p', root); });
    assert.deepEqual(result, { status: 'corrupt', entry: null });
  });
});

// ===========================================================================
// ledgerPath — the slug guard rejects a NON-STRING slug (malformed input), not
// just a traversal string. Pins the false leg of the `typeof slug === 'string'`
// coercion ternary. Kills a mutant that drops the type check.
// ===========================================================================

describe('ledgerPath rejects a non-string slug before touching the filesystem', () => {
  const nonStringSlugs = [
    { id: 'number', slug: 123 },
    { id: 'null', slug: null },
    { id: 'object', slug: {} },
  ];

  for (const { id, slug } of nonStringSlugs) {
    it(`throws Invalid slug for a [${id}] slug`, () => {
      const root = makeSandbox();
      assert.throws(() => ledger.ledgerPath(slug, root), /Invalid slug/);
    });
  }

  it('surfaces a non-string slug as unkeyable through readEntryResult (no throw)', () => {
    const root = makeSandbox();
    let result;
    assert.doesNotThrow(() => { result = ledger.readEntryResult(123, root); });
    assert.deepEqual(result, { status: 'unkeyable', entry: null });
  });
});

// ===========================================================================
// removeEntry — best-effort catch. When the target exists but unlink fails
// (a directory sits at the path), removeEntry must swallow and NOT throw out
// of the rollback path. Lines 478-480.
// ===========================================================================

describe('removeEntry swallows an unlink failure on a present-but-unremovable target', () => {
  it('does not throw when the ledger path exists but unlinkSync fails', () => {
    // Arrange — a directory where a JSON leaf is expected: existsSync true,
    // unlinkSync throws EPERM/EISDIR.
    const root = makeSandbox();
    fs.mkdirSync(path.join(root, '.ctoc', 'approvals', 'p.json'), { recursive: true });

    // Act + Assert — the rollback path stays quiet.
    assert.doesNotThrow(() => ledger.removeEntry('p', root));
  });
});

// ===========================================================================
// writeEntry — the optional/passthrough branches whose SECOND operand stays
// dark when callers rely on defaults. Pins the ternary/`||` fallbacks.
// ===========================================================================

describe('writeEntry preserves explicitly-supplied optional fields', () => {
  it('passes a caller-supplied approved_at and non-default approved_by through verbatim', () => {
    // Arrange — both fields explicitly set (the truthy legs of the || / ternary).
    const root = makeSandbox();
    const fixedTs = '2020-01-02T03:04:05.000Z';

    // Act
    const written = ledger.writeEntry('p', {
      content_sha256: 'abc', stage_from: 'review', stage_to: 'done',
      approved_at: fixedTs, approved_by: 'stale-cleanup',
    }, root);

    // Assert — no defaulting overrode the supplied values.
    assert.equal(written.approved_at, fixedTs);
    assert.equal(written.approved_by, 'stale-cleanup');
    const read = ledger.readEntry('p', root);
    assert.equal(read.approved_at, fixedTs);
    assert.equal(read.approved_by, 'stale-cleanup');
  });

  it('handles a null entry via the `entry || {}` fallback (missing-field guard fires, no crash)', () => {
    // The `|| {}` second operand in writeEntry: a null entry defaults to {} and
    // reaches the required-field guard rather than throwing on property access.
    const root = makeSandbox();
    assert.throws(() => ledger.writeEntry('p', null, root), /missing required field "content_sha256"/);
  });

  it('records approved_by as a literal empty string when the caller passes "" (distinct from omission→human)', () => {
    // approved_by !== undefined is the guard; '' is defined, so it passes through
    // rather than defaulting to 'human'. Kills a `!== undefined` -> truthy mutant.
    const root = makeSandbox();

    const written = ledger.writeEntry('p',
      { content_sha256: 'abc', stage_from: 'review', stage_to: 'done', approved_by: '' }, root);

    assert.equal(written.approved_by, '', 'an explicit empty approved_by must not default to human');
  });
});
