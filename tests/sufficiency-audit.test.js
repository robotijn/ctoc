'use strict';

/**
 * tests/sufficiency-audit.test.js — plan 00180.
 *
 * Proves the auditor can answer "has a human gate ever been crossed WITHOUT a
 * human, and on what evidence?" — or say honestly that it cannot be determined —
 * by reading the real approval ledger off disk (no network), and proves a human
 * SEES that verdict on the tools/Doctor screen.
 *
 * The three load-bearing cases are 2, 5 and 6: the three ways this auditor could
 * itself commit the very defect it audits (collapsing "I could not look" into
 * "I found nothing", or rendering an unknown count as 0).
 *
 * Fixtures write ledger entries through approval-ledger's PUBLIC writers and
 * questions files through streaming-precompute.writePlanQuestions — never
 * hand-rolled entry JSON, so the entry shape can never drift from production.
 * (A deliberately CORRUPT questions file / a stray non-JSON ledger file ARE
 * written raw, because their whole purpose is to be malformed — there is no
 * production writer for a malformed artifact.)
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  auditSufficiencyCrossings,
  formatAuditReport,
} = require('../src/lib/sufficiency-audit');
const ledger = require('../src/lib/approval-ledger');
const precompute = require('../src/lib/streaming-precompute');
const tools = require('../src/tabs/tools');

const REPO = path.join(__dirname, '..');
const ANSI = /\x1b\[[0-9;]*m/g;
const strip = (s) => s.replace(ANSI, '');

const roots = [];
function tmpRoot() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-suff-audit-'));
  roots.push(d);
  return d;
}
function cleanup() {
  for (const r of roots.splice(0)) {
    try { fs.rmSync(r, { recursive: true, force: true }); } catch { /* best effort */ }
  }
}

/** A sha256-shaped hex digest fixture (never a real secret). */
const HASH = 'a'.repeat(64);

/** Build the exact evidence string crossBySufficiency writes, for a given ref. */
function evidenceFor(ref, ids) {
  const answered = ids || [];
  return (
    `sufficiency: ${ref} — ${answered.length} question(s) answered` +
    `${answered.length ? ` (${answered.join(', ')})` : ''}; enough (no unanswered fork)`
  );
}

/** A minimal valid streaming Question. */
function q(id, { critical = false, important = false } = {}) {
  return { id, prompt: `prompt ${id}`, critical, important, options: [{ key: 'a', label: 'A' }] };
}

// ── 1 — populated ledger, no sufficiency entries → never-crossed ───────────────
test('populated ledger with no sufficiency entries is never-crossed', () => {
  const root = tmpRoot();
  try {
    ledger.writeEntry('a-human-plan', { content_sha256: HASH, stage_from: 'todo', stage_to: 'review', approved_by: 'human' }, root);
    ledger.writePipelineEntry('a-pipeline-plan', { content_sha256: HASH, stage_from: 'review', stage_to: 'done', evidence: 'stale-reconciliation' }, root);
    const res = auditSufficiencyCrossings(root);
    assert.equal(res.verdict, 'never-crossed');
    assert.equal(res.ledgerPresent, true);
    assert.ok(res.scanned > 0, 'a real scan examined entries');
    assert.deepEqual(res.crossings, []);
    assert.deepEqual(res.unreadable, []);
  } finally { cleanup(); }
});

// ── 2 — absent ledger directory → undetermined, NOT never-crossed ──────────────
test('absent ledger directory is undetermined, never never-crossed', () => {
  const root = tmpRoot(); // no .ctoc/approvals created
  try {
    const res = auditSufficiencyCrossings(root);
    assert.equal(res.verdict, 'undetermined');
    assert.equal(res.ledgerPresent, false);
    assert.equal(res.scanned, 0);
    assert.notEqual(res.verdict, 'never-crossed');
  } finally { cleanup(); }
});

// ── 3 — one entry unparseable → undetermined, good crossings kept, bad file named
test('an unparseable entry degrades the verdict but keeps the crossings it found', () => {
  const root = tmpRoot();
  try {
    // A real sufficiency crossing that MUST still be reported.
    const ref = 'todo/00042-real-crossing.md';
    ledger.writeSufficiencyEntry('a-suff', { content_sha256: HASH, stage_from: 'implementation', stage_to: 'todo', evidence: evidenceFor(ref, ['q10']) }, root);
    precompute.writePlanQuestions(root, ref, [q('q10', { critical: true })], 1000);
    // A corrupt sibling file in the ledger directory.
    fs.writeFileSync(path.join(ledger.ledgerDir(root), 'b-corrupt.json'), '{ not json');
    const res = auditSufficiencyCrossings(root);
    assert.equal(res.verdict, 'undetermined');
    assert.equal(res.crossings.length, 1, 'the parseable crossing is still reported');
    assert.equal(res.crossings[0].slug, 'a-suff');
    const bad = res.unreadable.find((u) => u.file === 'b-corrupt.json');
    assert.ok(bad, 'the bad file is named');
    assert.equal(bad.reason, 'corrupt');
  } finally { cleanup(); }
});

// ── 4 — sufficiency entry, questions file present with 3 questions → crossed ────
test('a sufficiency crossing backed by 3 questions is crossed and attested', () => {
  const root = tmpRoot();
  try {
    const ref = 'todo/00043-attested.md';
    ledger.writeSufficiencyEntry('c-attested', { content_sha256: HASH, stage_from: 'implementation', stage_to: 'todo', evidence: evidenceFor(ref, ['q10', 'q11', 'q12']) }, root);
    precompute.writePlanQuestions(root, ref, [q('q10', { critical: true }), q('q11', { important: true }), q('q12')], 2000);
    const res = auditSufficiencyCrossings(root);
    assert.equal(res.verdict, 'crossed');
    const cr = res.crossings[0];
    assert.equal(cr.ref, ref);
    assert.equal(cr.questions.present, true);
    assert.equal(cr.questions.total, 3);
    assert.equal(cr.questions.blocking, 2);
    assert.equal(cr.questions.empty, false);
    assert.equal(cr.questions.unattested, false);
  } finally { cleanup(); }
});

// ── 5 — sufficiency entry, questions file holds an EMPTY array → unattested ─────
test('a sufficiency crossing backed by an EMPTY question set is unattested', () => {
  const root = tmpRoot();
  try {
    const ref = 'todo/00044-empty.md';
    ledger.writeSufficiencyEntry('d-empty', { content_sha256: HASH, stage_from: 'implementation', stage_to: 'todo', evidence: evidenceFor(ref, []) }, root);
    precompute.writePlanQuestions(root, ref, [], 3000);
    const res = auditSufficiencyCrossings(root);
    assert.equal(res.verdict, 'crossed');
    const cr = res.crossings[0];
    assert.equal(cr.questions.present, true);
    assert.equal(cr.questions.total, 0);
    assert.equal(cr.questions.empty, true);
    assert.equal(cr.questions.unattested, true);
  } finally { cleanup(); }
});

// ── 6 — sufficiency entry, questions file absent → present false, total null ────
test('a sufficiency crossing whose questions file is gone is unattested with null counts', () => {
  const root = tmpRoot();
  try {
    const ref = 'todo/00045-missing-questions.md';
    ledger.writeSufficiencyEntry('e-missing', { content_sha256: HASH, stage_from: 'implementation', stage_to: 'todo', evidence: evidenceFor(ref, ['q10']) }, root);
    // deliberately DO NOT write the questions file
    const res = auditSufficiencyCrossings(root);
    const cr = res.crossings[0];
    assert.equal(cr.questions.present, false);
    assert.equal(cr.questions.total, null, 'an unknown count is null, never 0');
    assert.equal(cr.questions.unattested, true);
  } finally { cleanup(); }
});

// ── 7 — a human-approved entry is never counted as a crossing ──────────────────
test('a human-approved entry never appears in crossings', () => {
  const root = tmpRoot();
  try {
    ledger.writeEntry('f-human', { content_sha256: HASH, stage_from: 'todo', stage_to: 'review', approved_by: 'human' }, root);
    const res = auditSufficiencyCrossings(root);
    assert.equal(res.crossings.length, 0);
    assert.equal(res.verdict, 'never-crossed');
  } finally { cleanup(); }
});

// ── 8 — an entry with unrecognised provenance → unknown, reported, not counted ──
test('an entry classified unknown is reported in unreadable, never counted as a crossing', () => {
  const root = tmpRoot();
  try {
    // approved_by:'' carries NO positive provenance marker → entryKind() === 'unknown'
    // (public writer, no hand-rolled JSON; it is the classifier branch under test).
    ledger.writeEntry('g-unknown', { content_sha256: HASH, stage_from: 'todo', stage_to: 'review', approved_by: '' }, root);
    assert.equal(ledger.entryKind(ledger.readEntry('g-unknown', root)), 'unknown', 'precondition: entry classifies as unknown');
    const res = auditSufficiencyCrossings(root);
    assert.equal(res.crossings.length, 0, 'unknown is never a sufficiency crossing');
    const u = res.unreadable.find((x) => x.file === 'g-unknown.json');
    assert.ok(u, 'the unknown entry is named, never silently skipped');
    assert.equal(u.reason, 'unknown-provenance');
    assert.equal(res.verdict, 'undetermined');
  } finally { cleanup(); }
});

// ── 9 — the real repository: a defined verdict on real data ────────────────────
test('runs against the live repository and returns a defined verdict', () => {
  const res = auditSufficiencyCrossings(REPO);
  assert.equal(res.ledgerPresent, true, 'the real ledger directory exists and was read');
  assert.ok(['never-crossed', 'crossed', 'undetermined'].includes(res.verdict), `verdict is defined (got ${res.verdict})`);
  assert.ok(res.scanned > 0, 'the real scan examined entries');
});

// ── 10 — report formatting distinguishes the two empties ───────────────────────
test('the report renders never-crossed and undetermined as DISTINCT, non-interchangeable strings', () => {
  const root1 = tmpRoot();
  try {
    ledger.writeEntry('h-human', { content_sha256: HASH, stage_from: 'todo', stage_to: 'review', approved_by: 'human' }, root1);
    const neverReport = formatAuditReport(auditSufficiencyCrossings(root1));
    const undeterminedReport = formatAuditReport(auditSufficiencyCrossings(tmpRoot()));
    assert.notEqual(neverReport, undeterminedReport);
    assert.match(neverReport, /none/i);
    assert.match(undeterminedReport, /undetermined/i);
    assert.doesNotMatch(neverReport, /undetermined/i, 'never-crossed must not read as undetermined');
    assert.doesNotMatch(undeterminedReport, /\bnone\b/i, 'undetermined must not read as a clean history');
  } finally { cleanup(); }
});

// ── 11 — an unresolvable ref (freeform evidence) is a gap the auditor NAMES ─────
test('a crossing whose evidence does not encode a ref reports ref null and stays unattested', () => {
  const root = tmpRoot();
  try {
    ledger.writeSufficiencyEntry('i-freeform', { content_sha256: HASH, stage_from: 'implementation', stage_to: 'todo', evidence: 'hand-written evidence with no parseable ref' }, root);
    const res = auditSufficiencyCrossings(root);
    const cr = res.crossings[0];
    assert.equal(cr.ref, null, 'an unresolvable ref is null, never fabricated');
    assert.equal(cr.questions.present, null, 'no questions file could be resolved');
    assert.equal(cr.questions.unattested, true);
    assert.equal(res.verdict, 'crossed', 'the crossing is still reported');
  } finally { cleanup(); }
});

// ── 12 — a corrupt questions file → present true, counts null, unattested ───────
test('a corrupt questions file reports present-but-unusable with null counts', () => {
  const root = tmpRoot();
  try {
    const ref = 'todo/00046-corrupt-questions.md';
    ledger.writeSufficiencyEntry('j-corruptq', { content_sha256: HASH, stage_from: 'implementation', stage_to: 'todo', evidence: evidenceFor(ref, ['q10']) }, root);
    const qp = precompute.questionsPath(root, ref);
    fs.mkdirSync(path.dirname(qp), { recursive: true });
    fs.writeFileSync(qp, '{ not valid json');
    const res = auditSufficiencyCrossings(root);
    const cr = res.crossings[0];
    assert.equal(cr.questions.present, true, 'the file exists');
    assert.equal(cr.questions.total, null, 'an unreadable set yields a null count, never 0');
    assert.equal(cr.questions.unattested, true);
  } finally { cleanup(); }
});

// ── 13 — a questions file missing its questions array → counts null ─────────────
test('a questions file with no questions array reports null counts', () => {
  const root = tmpRoot();
  try {
    const ref = 'todo/00047-no-array.md';
    ledger.writeSufficiencyEntry('k-noarray', { content_sha256: HASH, stage_from: 'implementation', stage_to: 'todo', evidence: evidenceFor(ref, ['q10']) }, root);
    const qp = precompute.questionsPath(root, ref);
    fs.mkdirSync(path.dirname(qp), { recursive: true });
    fs.writeFileSync(qp, JSON.stringify({ ref, planMtimeMs: 1 }));
    const res = auditSufficiencyCrossings(root);
    assert.equal(res.crossings[0].questions.total, null);
    assert.equal(res.crossings[0].questions.unattested, true);
  } finally { cleanup(); }
});

// ── 15 — drive a REAL captured ledger entry (golden corpus), not only synthetic ──
// A module that reads a persisted contract must be proven against a REAL sample the
// pipeline actually wrote, never only hand-built fixtures (golden-corpus fence).
test('classifies a REAL captured ledger entry (golden corpus) without miscounting it', () => {
  const root = tmpRoot();
  try {
    const sampleAbs = path.join(REPO, 'tests/fixtures/golden-corpus/approvals/ctoc-audit-w02-s1-approval-ledger.json');
    const dir = ledger.ledgerDir(root);
    fs.mkdirSync(dir, { recursive: true });
    // Staged under a clean slug; the auditor derives the slug from the filename.
    fs.copyFileSync(sampleAbs, path.join(dir, 'w02-real-sample.json'));
    const res = auditSufficiencyCrossings(root);
    assert.equal(res.ledgerPresent, true, 'the real entry was read off disk');
    assert.equal(res.scanned, 1);
    // The captured entry is a backfilled HUMAN approval — never a sufficiency crossing.
    assert.deepEqual(res.crossings, []);
    assert.deepEqual(res.unreadable, []);
    assert.equal(res.verdict, 'never-crossed');
  } finally { cleanup(); }
});

// ── 14 — the Doctor screen RENDERS the verdict a human can read ─────────────────
test('the Doctor screen renders the audit verdict for each of the three states', () => {
  // never-crossed (green), a real crossing (crossed/red), and undetermined (yellow)
  const neverRoot = tmpRoot();
  try {
    ledger.writeEntry('l-human', { content_sha256: HASH, stage_from: 'todo', stage_to: 'review', approved_by: 'human' }, neverRoot);
    const neverRow = strip(tools.renderSufficiencyAudit(neverRoot));
    assert.match(neverRow, /none/i);

    const crossRoot = tmpRoot();
    const ref = 'todo/00048-shown.md';
    ledger.writeSufficiencyEntry('m-suff', { content_sha256: HASH, stage_from: 'implementation', stage_to: 'todo', evidence: evidenceFor(ref, []) }, crossRoot);
    precompute.writePlanQuestions(crossRoot, ref, [], 1);
    const crossRow = strip(tools.renderSufficiencyAudit(crossRoot));
    assert.match(crossRow, /UNATTESTED/);

    const undeterminedRow = strip(tools.renderSufficiencyAudit(tmpRoot()));
    assert.match(undeterminedRow, /UNDETERMINED/i);

    // A non-string project path is the one input that throws — the render must
    // degrade to a legible line, never propagate.
    const badRow = strip(tools.renderSufficiencyAudit(123));
    assert.match(badRow, /unreadable/i);
  } finally { cleanup(); }
});
