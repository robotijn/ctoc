'use strict';

/**
 * tests/claim-verdict-surface.test.js — plan 00138.
 *
 * Proves a human actually SEES the corpus claim-verification verdict on the
 * tools/Doctor screen — including the two states a display usually swallows
 * (ABSENT and CORRUPT) — reading the ledger OFF DISK with no network.
 *
 * Load-bearing cases are 2, 3 and 4: the three states a display naturally
 * collapses into "looks fine", the exact debt stale-detector.js documents about
 * its own unreadCount.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const tools = require('../src/tabs/tools');
const claimLedger = require('../src/lib/claim-ledger');

const DAY_MS = 24 * 60 * 60 * 1000;

/** Make a throwaway project root under os.tmpdir(); never the real ledger. */
function tmpRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-claim-verdict-'));
}

/** Write a ledger object to <root>/.ctoc/verification/claims-ledger.json. */
function writeLedger(root, ledger) {
  const dir = path.join(root, '.ctoc', 'verification');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'claims-ledger.json'), typeof ledger === 'string' ? ledger : JSON.stringify(ledger, null, 2));
}

function isoAgo(nowMs, days) {
  return new Date(nowMs - days * DAY_MS).toISOString();
}

/** A well-formed ledger with the given per-state counts, verified `agoDays` ago. */
function cleanLedger(nowMs, { verified = 0, refuted = 0, unverifiable = 0, agoDays = 2, horizonDays = 7 } = {}) {
  const claims = {};
  for (let i = 0; i < verified; i += 1) {
    claims[`skills/frameworks/data/v${i}.md#v-${i}`] = { kind: 'url-live', state: 'VERIFIED', expectedHash: 'x', lastVerifiedAt: isoAgo(nowMs, agoDays) };
  }
  for (let i = 0; i < refuted; i += 1) {
    claims[`skills/frameworks/data/duckdb.md#duckdb-python-version-${i}`] = { kind: 'registry-version', state: 'REFUTED', expectedHash: 'x', lastVerifiedAt: isoAgo(nowMs, agoDays) };
  }
  for (let i = 0; i < unverifiable; i += 1) {
    claims[`skills/frameworks/data/u${i}.md#u-${i}`] = { kind: 'url-live', state: 'UNVERIFIABLE', expectedHash: 'x', lastVerifiedAt: isoAgo(nowMs, agoDays) };
  }
  return { schemaVersion: 1, generatedAt: isoAgo(nowMs, agoDays), generator: 'src/scripts/verify-claims.js', horizonDays, claims };
}

// 1 — clean fresh ledger renders all three counts, zeros included.
test('clean fresh ledger renders all three counts including zeros', () => {
  const now = Date.now();
  const root = tmpRoot();
  writeLedger(root, cleanLedger(now, { verified: 5, refuted: 0, unverifiable: 0, agoDays: 2 }));
  const row = tools.renderClaimVerdict(root, { nowMs: now });
  assert.match(row, /verified 5/);
  assert.match(row, /refuted 0/, 'the refuted ZERO must be visible, never omitted');
  assert.match(row, /unverifiable 0/, 'the unverifiable ZERO must be visible, never omitted');
});

// 2 — unverifiable > 0 is VISIBLE in the rendered row (not only in the data).
test('unverifiable > 0 appears in the rendered row', () => {
  const now = Date.now();
  const root = tmpRoot();
  writeLedger(root, cleanLedger(now, { verified: 10, refuted: 0, unverifiable: 3, agoDays: 1 }));
  const row = tools.renderClaimVerdict(root, { nowMs: now });
  assert.match(row, /unverifiable 3/);
});

// 3 — ABSENT ledger renders "never verified", NOT a clean row.
test('absent ledger renders "never verified", not a clean row', () => {
  const now = Date.now();
  const root = tmpRoot(); // no ledger written
  const row = tools.renderClaimVerdict(root, { nowMs: now });
  assert.match(row, /never verified/);
  assert.ok(!/last verified/.test(row), 'absent must NOT render the clean-row "last verified" text');
});

// 4 — CORRUPT ledger renders "unreadable", distinct from both clean and absent.
test('corrupt ledger renders "unreadable", distinct from clean and absent', () => {
  const now = Date.now();
  const corruptRoot = tmpRoot();
  writeLedger(corruptRoot, '{ this is not json');
  const absentRoot = tmpRoot();
  const cleanRoot = tmpRoot();
  writeLedger(cleanRoot, cleanLedger(now, { verified: 2, agoDays: 1 }));

  const corrupt = tools.renderClaimVerdict(corruptRoot, { nowMs: now });
  const absent = tools.renderClaimVerdict(absentRoot, { nowMs: now });
  const clean = tools.renderClaimVerdict(cleanRoot, { nowMs: now });

  assert.match(corrupt, /unreadable/);
  // three genuinely distinct rendered strings for three states
  assert.notStrictEqual(corrupt, absent);
  assert.notStrictEqual(corrupt, clean);
  assert.notStrictEqual(absent, clean);
  assert.ok(!/never verified/.test(corrupt), 'corrupt must not read as absent');
  assert.ok(!/last verified/.test(corrupt), 'corrupt must not read as clean');
});

// 5 — refuted > 0 renders prominently and names a guide path.
test('refuted > 0 renders prominently and names a guide path', () => {
  const now = Date.now();
  const root = tmpRoot();
  writeLedger(root, cleanLedger(now, { verified: 1, refuted: 1, unverifiable: 0, agoDays: 1 }));
  const row = tools.renderClaimVerdict(root, { nowMs: now });
  assert.match(row, /refuted 1/);
  assert.match(row, /skills\/frameworks\/data\/duckdb\.md/, 'the refuted guide path must be named');
});

// 6 — age renders against the horizon; inside vs outside produce different text.
test('age renders against the horizon; inside and outside differ', () => {
  const now = Date.now();
  const inside = tmpRoot();
  writeLedger(inside, cleanLedger(now, { verified: 1, agoDays: 2, horizonDays: 7 }));
  const outside = tmpRoot();
  writeLedger(outside, cleanLedger(now, { verified: 1, agoDays: 12, horizonDays: 7 }));

  const insideRow = tools.renderClaimVerdict(inside, { nowMs: now });
  const outsideRow = tools.renderClaimVerdict(outside, { nowMs: now });
  assert.match(insideRow, /horizon 7d/);
  assert.match(outsideRow, /horizon 7d/);
  assert.notStrictEqual(insideRow, outsideRow, 'a stale ledger must read differently from a fresh one');
  assert.match(outsideRow, /STALE/, 'past the horizon must read as a warning');
  assert.ok(!/STALE/.test(insideRow), 'within the horizon must NOT read as stale');
});

// 7 — the row renders without a network call (network primitives patched to throw).
test('the row renders without a network call', () => {
  const now = Date.now();
  const root = tmpRoot();
  writeLedger(root, cleanLedger(now, { verified: 3, unverifiable: 1, agoDays: 1 }));

  const https = require('node:https');
  const http = require('node:http');
  const origHttps = https.request;
  const origHttp = http.request;
  const origFetch = global.fetch;
  const boom = () => { throw new Error('network access is forbidden on the render path'); };
  https.request = boom;
  http.request = boom;
  global.fetch = boom;
  try {
    const row = tools.renderClaimVerdict(root, { nowMs: now });
    assert.equal(typeof row, 'string');
    assert.match(row, /verified 3/);
  } finally {
    https.request = origHttps;
    http.request = origHttp;
    global.fetch = origFetch;
  }
});

// 8 — the action is dispatched in the background, not awaited inline.
test('the verify action is dispatched in the background, not awaited inline', () => {
  const root = tmpRoot();
  const calls = [];
  let finished = false;
  const fakeSpawn = (cmd, args, opts) => {
    calls.push({ cmd, args, opts });
    // A real child completes on a later tick; the dispatch must return before that.
    setImmediate(() => { finished = true; });
    return { unref() {} };
  };
  const ret = tools.dispatchClaimVerification(root, fakeSpawn);
  assert.equal(finished, false, 'dispatch must return before the command completes');
  assert.ok(!ret || typeof ret.then !== 'function', 'dispatch must not return a promise it awaits');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].cmd, process.execPath);
  assert.ok(Array.isArray(calls[0].args), 'the command must be an argument array, never a shell string');
  assert.notEqual(calls[0].opts && calls[0].opts.shell, true, 'never spawn through a shell');
  assert.ok(calls[0].args.some((a) => /verify-claims\.js$/.test(a)), 'must run verify-claims.js');
});

// 9 — rendering degrades rather than throwing on a malformed summary.
test('rendering degrades rather than throwing on a malformed ledger body', () => {
  const now = Date.now();
  const root = tmpRoot();
  // shape-valid (claims is an object) but each entry is malformed — a null entry
  // would make `entry.state` throw if counted carelessly.
  writeLedger(root, { schemaVersion: 1, generatedAt: isoAgo(now, 1), horizonDays: 7, claims: { 'a.md#x': null, 'b.md#y': 42 } });
  let row;
  assert.doesNotThrow(() => { row = tools.renderClaimVerdict(root, { nowMs: now }); });
  assert.equal(typeof row, 'string');
  assert.ok(row.length > 0, 'a data fault renders a line, never a blank');
});

// 11 — TOTAL render: even a throw out of the ledger reader renders a line, never a blank.
test('a throw out of the ledger reader still renders a line', () => {
  const now = Date.now();
  const orig = claimLedger.readLedger;
  claimLedger.readLedger = () => { throw new Error('disk fault'); };
  try {
    const row = tools.renderClaimVerdict('/nonexistent', { nowMs: now });
    assert.equal(typeof row, 'string');
    assert.match(row, /unreadable/, 'a reader fault must render the unreadable line, never a blank');
  } finally {
    claimLedger.readLedger = orig;
  }
});

// 10 — no absolute path reaches the rendered row.
test('no absolute path reaches the rendered row', () => {
  const now = Date.now();
  const root = tmpRoot();
  writeLedger(root, cleanLedger(now, { verified: 1, refuted: 1, agoDays: 1 }));
  const row = tools.renderClaimVerdict(root, { nowMs: now });
  assert.ok(!row.includes(root), 'the absolute project root must never appear in the row');
  assert.ok(!/\/(Users|home|tmp|var|private)\//.test(row), 'no absolute filesystem path in the row');
});
