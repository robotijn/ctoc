'use strict';

/**
 * tests/claim-ledger-gate.test.js — plan 00137. The offline verification gate's
 * specification, including every path that could make it report a verdict on input it
 * never received.
 *
 * OFFLINE BY CONSTRUCTION. Every case here runs against a ledger built in a temp
 * directory; nothing in this file reaches the network, and case 16 proves it by running
 * the gate with the network primitives monkey-patched to throw. The gate reads a ledger
 * OFF DISK; a networked check writes that ledger elsewhere (src/scripts/verify-claims.js,
 * plan 00136), on a schedule — never here.
 *
 * Time is INJECTED (`nowMs`), never manipulated with `utimes` — the injection-seam
 * precedent is src/lib/stale-detector.js. Fixtures live under os.tmpdir() and are removed
 * in `finally`.
 *
 * A NOTE ON CASE 13. The plan specified `CACHE_TTL_MS < STALENESS_HORIZON_MS`, reading
 * both constants from their real modules. The shipped fetcher (src/lib/claim-fetcher.js,
 * plan 00136) has NO time-based cache TTL constant to read — its cache is revalidated by
 * a conditional GET on every run, and a cache hit WITHOUT live contact is UNVERIFIABLE
 * (`cache-only`), never VERIFIED. THE CODE WINS: case 13 asserts the real anti-false-green
 * property that exists — a cached body can never advance a verdict without live contact —
 * which is the exact substitution the TTL inequality was a proxy for. See the plan's
 * "Decisions Taken Under Ambiguity".
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const {
  readLedger,
  gateLedger,
  buildLedger,
  writeLedgerFile,
  STALENESS_HORIZON_MS,
} = require('../src/lib/claim-ledger');

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse('2026-07-20T00:00:00.000Z');
const LEDGER_REL = path.join('.ctoc', 'verification', 'claims-ledger.json');

/** A corpus claim as 00135's extractor emits it, tagged with its guide file. */
function claim(over = {}) {
  return {
    id: 'duckdb-python-version',
    kind: 'registry-version',
    source: 'https://pypi.org/pypi/duckdb/json',
    select: 'info.version',
    expect: '1.5.4',
    file: 'skills/frameworks/data/duckdb.md',
    ...over,
  };
}

/** The same hash the module computes over a claim's identity (source+select+expect). */
function hashOf(c) {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify([c.source, c.select || null, c.expect || null]))
    .digest('hex');
}

/** A ledger entry in the committed schema. */
function entry(c, over = {}) {
  const iso = new Date(NOW).toISOString();
  return {
    kind: c.kind,
    state: 'VERIFIED',
    reason: null,
    expectedHash: hashOf(c),
    lastVerifiedAt: iso,
    lastAttemptAt: iso,
    lastAttemptState: 'VERIFIED',
    ...over,
  };
}

/** Build a full ledger object from {key: entry} pairs. */
function ledgerOf(claims, over = {}) {
  return {
    schemaVersion: 1,
    generatedAt: new Date(NOW).toISOString(),
    generator: 'src/scripts/verify-claims.js',
    horizonDays: 7,
    claims,
    ...over,
  };
}

function keyOf(c) {
  return `${c.file}#${c.id}`;
}

/** Run `fn` with a temp root; write `content` (string, or object → JSON) to the ledger
 *  path first when provided. */
function withRoot(content, fn) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-claim-ledger-'));
  try {
    if (content !== undefined) {
      const file = path.join(root, LEDGER_REL);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, typeof content === 'string' ? content : JSON.stringify(content, null, 2));
    }
    return fn(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

describe('claim-ledger — the offline verification gate (plan 00137)', () => {
  // 1 ─────────────────────────────────────────────────────────────────────────
  it('case 1: a clean, fresh, complete ledger passes', () => {
    const a = claim();
    const b = claim({ id: 'clickhouse-connect-version', source: 'https://pypi.org/pypi/clickhouse-connect/json', expect: '1.4.2', file: 'skills/frameworks/data/clickhouse.md' });
    const led = ledgerOf({ [keyOf(a)]: entry(a), [keyOf(b)]: entry(b) });
    withRoot(led, (root) => {
      const r = gateLedger(root, [a, b], { nowMs: NOW });
      assert.equal(r.pass, true);
      assert.deepEqual(r.failures, []);
      assert.equal(r.summary.verified, 2);
      assert.equal(r.summary.claimCount, 2);
    });
  });

  // 2 ─────────────────────────────────────────────────────────────────────────
  it('case 2: one REFUTED claim fails with kind "refuted", naming the claim id and guide path', () => {
    const a = claim();
    const led = ledgerOf({ [keyOf(a)]: entry(a, { state: 'REFUTED', lastAttemptState: 'REFUTED' }) });
    withRoot(led, (root) => {
      const r = gateLedger(root, [a], { nowMs: NOW });
      assert.equal(r.pass, false);
      const f = r.failures.find((x) => x.kind === 'refuted');
      assert.ok(f, 'a refuted failure is present');
      assert.equal(f.id, a.id);
      assert.equal(f.guide, a.file);
      assert.equal(r.summary.refuted, 1);
    });
  });

  // 3 ─────────────────────────────────────────────────────────────────────────
  it('case 3: an ABSENT ledger fails with kind "ledger-absent", announced, and does not throw', () => {
    withRoot(undefined, (root) => {
      const read = readLedger(root);
      assert.equal(read.ok, false);
      assert.equal(read.problem, 'absent');
      let r;
      assert.doesNotThrow(() => { r = gateLedger(root, [claim()], { nowMs: NOW }); });
      assert.equal(r.pass, false);
      assert.equal(r.failures[0].kind, 'ledger-absent');
      // Announced structurally — the summary is present with all zero counts.
      assert.equal(r.summary.verified, 0);
      assert.equal(r.summary.refuted, 0);
      assert.equal(r.summary.unverifiable, 0);
    });
  });

  // 4 ─────────────────────────────────────────────────────────────────────────
  it('case 4: a CORRUPT ledger ("{not json") REFUSES — kind "ledger-corrupt", never a passing result', () => {
    withRoot('{not json', (root) => {
      const read = readLedger(root);
      assert.equal(read.ok, false);
      assert.equal(read.problem, 'corrupt');
      const r = gateLedger(root, [claim()], { nowMs: NOW });
      assert.equal(r.pass, false);
      assert.equal(r.failures[0].kind, 'ledger-corrupt');
      // The offending content is NEVER echoed back.
      assert.ok(!JSON.stringify(r).includes('not json'));
    });
  });

  // 5 ─────────────────────────────────────────────────────────────────────────
  it('case 5: a wrong-shaped ledger (claims is an array) REFUSES', () => {
    const led = ledgerOf([]);
    led.claims = [{ id: 'x' }]; // claims must be a non-array object
    withRoot(led, (root) => {
      const read = readLedger(root);
      assert.equal(read.ok, false);
      assert.equal(read.problem, 'corrupt');
      const r = gateLedger(root, [claim()], { nowMs: NOW });
      assert.equal(r.pass, false);
      assert.equal(r.failures[0].kind, 'ledger-corrupt');
    });
  });

  // 6 ─────────────────────────────────────────────────────────────────────────
  it('case 6: lastVerifiedAt older than the horizon fails with kind "stale" (the dead-scheduler case)', () => {
    const a = claim();
    const old = new Date(NOW - 8 * DAY).toISOString(); // horizon is 7 days
    const led = ledgerOf({ [keyOf(a)]: entry(a, { lastVerifiedAt: old, lastAttemptAt: old }) });
    withRoot(led, (root) => {
      const r = gateLedger(root, [a], { nowMs: NOW });
      assert.equal(r.pass, false);
      assert.ok(r.failures.some((f) => f.kind === 'stale'));
    });
  });

  // 7 ─────────────────────────────────────────────────────────────────────────
  it('case 7: an UNVERIFIABLE attempt retains the prior verdict and does NOT advance lastVerifiedAt', () => {
    const a = claim();
    const t0 = NOW - 2 * DAY;
    const t1 = NOW;
    const prior = ledgerOf({
      [keyOf(a)]: entry(a, { lastVerifiedAt: new Date(t0).toISOString(), lastAttemptAt: new Date(t0).toISOString() }),
    });
    // A fresh run where the source is UNVERIFIABLE (no live contact).
    const verdict = { id: a.id, source: a.source, kind: a.kind, state: 'UNVERIFIABLE', reason: 'timeout', liveContact: false, checkedAt: new Date(t1).toISOString() };
    const merged = buildLedger([verdict], [a], { now: t1, prior });
    const e = merged.claims[keyOf(a)];
    assert.equal(e.state, 'VERIFIED', 'prior verdict is retained');
    assert.equal(e.lastVerifiedAt, new Date(t0).toISOString(), 'lastVerifiedAt is frozen');
    assert.equal(e.lastAttemptAt, new Date(t1).toISOString(), 'lastAttemptAt advances');
    assert.equal(e.lastAttemptState, 'UNVERIFIABLE');
  });

  // 8 ─────────────────────────────────────────────────────────────────────────
  it('case 8: a claim UNVERIFIABLE since before the horizon is stale (permanent unreachability becomes loud)', () => {
    const a = claim();
    const old = new Date(NOW - 10 * DAY).toISOString();
    const led = ledgerOf({
      [keyOf(a)]: entry(a, { state: 'VERIFIED', lastVerifiedAt: old, lastAttemptAt: new Date(NOW).toISOString(), lastAttemptState: 'UNVERIFIABLE' }),
    });
    withRoot(led, (root) => {
      const r = gateLedger(root, [a], { nowMs: NOW });
      assert.equal(r.pass, false);
      assert.ok(r.failures.some((f) => f.kind === 'stale'));
    });
  });

  // 9 ─────────────────────────────────────────────────────────────────────────
  it('case 9: a claim UNVERIFIABLE once but verified inside the horizon passes (transient blip absorbed)', () => {
    const a = claim();
    const recent = new Date(NOW - 1 * DAY).toISOString();
    const led = ledgerOf({
      [keyOf(a)]: entry(a, { lastVerifiedAt: recent, lastAttemptAt: new Date(NOW).toISOString(), lastAttemptState: 'UNVERIFIABLE' }),
    });
    withRoot(led, (root) => {
      const r = gateLedger(root, [a], { nowMs: NOW });
      assert.equal(r.pass, true);
    });
  });

  // 10 ────────────────────────────────────────────────────────────────────────
  it('case 10: a corpus claim with no ledger entry is drift-unverified and the build FAILS', () => {
    const a = claim();
    const b = claim({ id: 'clickhouse-connect-version', source: 'https://pypi.org/pypi/clickhouse-connect/json', expect: '1.4.2', file: 'skills/frameworks/data/clickhouse.md' });
    const led = ledgerOf({ [keyOf(a)]: entry(a) }); // b is missing
    withRoot(led, (root) => {
      const r = gateLedger(root, [a, b], { nowMs: NOW });
      assert.equal(r.pass, false);
      const f = r.failures.find((x) => x.kind === 'drift-unverified');
      assert.ok(f);
      assert.equal(f.id, b.id);
    });
  });

  // 11 ────────────────────────────────────────────────────────────────────────
  it('case 11: an edited expect changes the hash and is drift-unverified — editing a guide cannot silence a refutation', () => {
    const original = claim({ expect: '1.5.4' });
    const led = ledgerOf({ [keyOf(original)]: entry(original) });
    const edited = claim({ expect: '9.9.9' }); // someone edited the guide's expected value
    withRoot(led, (root) => {
      const r = gateLedger(root, [edited], { nowMs: NOW });
      assert.equal(r.pass, false);
      assert.ok(r.failures.some((f) => f.kind === 'drift-unverified'));
    });
  });

  // 12 ────────────────────────────────────────────────────────────────────────
  it('case 12: a ledger entry with no corpus claim is drift-orphan — reported, does NOT fail', () => {
    const a = claim();
    const orphan = claim({ id: 'deleted-guide-claim', file: 'skills/deleted.md' });
    const led = ledgerOf({ [keyOf(a)]: entry(a), [keyOf(orphan)]: entry(orphan) });
    withRoot(led, (root) => {
      const r = gateLedger(root, [a], { nowMs: NOW });
      assert.equal(r.pass, true, 'an orphan does not fail the build');
      assert.ok(r.failures.some((f) => f.kind === 'drift-orphan'), 'but it IS reported');
    });
  });

  // 13 ────────────────────────────────────────────────────────────────────────
  it('case 13: the anti-false-green property — a cached body never advances a verdict without live contact', () => {
    // THE CODE WINS: the fetcher exposes no CACHE_TTL_MS. The real property the TTL
    // inequality proxied is that a cache hit with no live contact is UNVERIFIABLE, so a
    // stale cache can never keep the ledger fresh. Proven offline against the real fetcher.
    const { verifyClaim } = require('../src/lib/claim-fetcher');
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-claim-cache-'));
    try {
      const cacheDir = path.join(root, 'cache');
      fs.mkdirSync(cacheDir, { recursive: true });
      const c = claim();
      const key = crypto.createHash('sha256').update(c.source).digest('hex');
      fs.writeFileSync(
        path.join(cacheDir, `${key}.json`),
        JSON.stringify({ body: JSON.stringify({ info: { version: '1.5.4' } }), etag: 'x', lastModified: null, fetchedAt: Date.now() }),
      );
      return verifyClaim(c, { cacheDir, noNetwork: true }).then((v) => {
        assert.equal(v.state, 'UNVERIFIABLE', 'a cached body without live contact is never VERIFIED');
        assert.equal(v.reason, 'cache-only');
        assert.equal(v.liveContact, false);
        assert.ok(Number.isFinite(STALENESS_HORIZON_MS) && STALENESS_HORIZON_MS > 0);
      });
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  // 14 ────────────────────────────────────────────────────────────────────────
  it('case 14: summary always carries verified/refuted/unverifiable, including zeros', () => {
    const a = claim();
    const led = ledgerOf({ [keyOf(a)]: entry(a) });
    withRoot(led, (root) => {
      const r = gateLedger(root, [a], { nowMs: NOW });
      for (const k of ['verified', 'refuted', 'unverifiable', 'stalest', 'claimCount']) {
        assert.ok(Object.prototype.hasOwnProperty.call(r.summary, k), `summary has ${k}`);
      }
      assert.equal(r.summary.refuted, 0);
      assert.equal(r.summary.unverifiable, 0);
    });
  });

  // 15 ────────────────────────────────────────────────────────────────────────
  it('case 15: require("claim-ledger") does not pull claim-fetcher into the module graph', () => {
    const script =
      "require('./src/lib/claim-ledger');" +
      "const loaded = Object.keys(require.cache).some(k => k.includes('claim-fetcher'));" +
      "if (loaded) { console.error('LOADED'); process.exit(3); }" +
      "process.exit(0);";
    const out = execFileSync(process.execPath, ['-e', script], {
      cwd: path.join(__dirname, '..'),
      encoding: 'utf8',
    });
    assert.equal(out, '', 'no network module is loaded by the gate');
  });

  // 16 ────────────────────────────────────────────────────────────────────────
  it('case 16: the gate performs zero network calls (primitives patched to throw)', () => {
    const http = require('http');
    const https = require('https');
    const origFetch = global.fetch;
    const origHttp = http.request;
    const origHttps = https.request;
    const boom = () => { throw new Error('network access is forbidden in the gated suite'); };
    global.fetch = boom;
    http.request = boom;
    https.request = boom;
    try {
      const a = claim();
      const led = ledgerOf({ [keyOf(a)]: entry(a) });
      withRoot(led, (root) => {
        const r = gateLedger(root, [a], { nowMs: NOW });
        assert.equal(r.pass, true, 'the gate completes with the network disabled');
      });
    } finally {
      global.fetch = origFetch;
      http.request = origHttp;
      https.request = origHttps;
    }
  });

  // extra: writeLedgerFile round-trips through readLedger (build → write → gate) ───────
  it('build → write → read round-trips a valid ledger the gate accepts', () => {
    const a = claim();
    const verdict = { id: a.id, source: a.source, kind: a.kind, state: 'VERIFIED', reason: null, liveContact: true, checkedAt: new Date(NOW).toISOString() };
    withRoot(undefined, (root) => {
      const led = buildLedger([verdict], [a], { now: NOW });
      writeLedgerFile(root, led);
      const read = readLedger(root);
      assert.equal(read.ok, true);
      const r = gateLedger(root, [a], { nowMs: NOW });
      assert.equal(r.pass, true);
    });
  });

  // extra: a REFUTED live verdict is recorded and advances lastVerifiedAt ───────────────
  it('buildLedger records a REFUTED live verdict and advances its clock', () => {
    const a = claim();
    const verdict = { id: a.id, source: a.source, kind: a.kind, state: 'REFUTED', reason: null, observed: '1.5.5', liveContact: true, checkedAt: new Date(NOW).toISOString() };
    const led = buildLedger([verdict], [a], { now: NOW });
    const e = led.claims[keyOf(a)];
    assert.equal(e.state, 'REFUTED');
    assert.equal(e.lastVerifiedAt, new Date(NOW).toISOString());
    assert.equal(e.lastAttemptState, 'REFUTED');
  });

  // extra: an UNVERIFIABLE verdict with NO prior yields a null lastVerifiedAt (stale) ───
  it('buildLedger with an UNVERIFIABLE verdict and no prior leaves lastVerifiedAt null', () => {
    const a = claim();
    const verdict = { id: a.id, source: a.source, kind: a.kind, state: 'UNVERIFIABLE', reason: 'network-unreachable', liveContact: false, checkedAt: new Date(NOW).toISOString() };
    const led = buildLedger([verdict], [a], { now: NOW });
    const e = led.claims[keyOf(a)];
    assert.equal(e.lastVerifiedAt, null);
    assert.equal(e.state, 'UNVERIFIABLE');
    // and the gate calls that stale, because it was never verified
    withRoot(led, (root) => {
      const r = gateLedger(root, [a], { nowMs: NOW });
      assert.equal(r.pass, false);
      assert.ok(r.failures.some((f) => f.kind === 'stale'));
    });
  });

  // extra: an oversized ledger is size-gated out as corrupt, never read into memory ─────
  it('an oversized ledger file is refused as corrupt', () => {
    const big = 'x'.repeat((4 << 20) + 64);
    withRoot(big, (root) => {
      const read = readLedger(root);
      assert.equal(read.ok, false);
      assert.equal(read.problem, 'corrupt');
    });
  });

  // extra: a ledger whose path is a directory is refused as corrupt (not a crash) ───────
  it('a ledger path that is a directory is refused as corrupt', () => {
    withRoot(undefined, (root) => {
      fs.mkdirSync(path.join(root, LEDGER_REL), { recursive: true });
      const read = readLedger(root);
      assert.equal(read.ok, false);
      assert.equal(read.problem, 'corrupt');
    });
  });

  // extra: a top-level non-object ledger ("[]") is refused as corrupt ──────────────────
  it('a top-level array ledger is refused as corrupt', () => {
    withRoot('[]', (root) => {
      assert.equal(readLedger(root).problem, 'corrupt');
    });
  });

  // extra: a wrong schemaVersion is refused as corrupt (never misread) ──────────────────
  it('a ledger with an unknown schemaVersion is refused as corrupt', () => {
    const led = ledgerOf({}, { schemaVersion: 999 });
    withRoot(led, (root) => {
      assert.equal(readLedger(root).problem, 'corrupt');
    });
  });

  // extra: an unusable path (embedded NUL) reads as ABSENT, never a crash ───────────────
  it('an unusable ledger path reads as absent, never throwing', () => {
    const read = readLedger(`${os.tmpdir()}/ctoc-\0-nope`);
    assert.equal(read.ok, false);
    assert.equal(read.problem, 'absent');
  });

  // extra: buildLedger carries a prior entry forward when there is no fresh verdict ─────
  it('buildLedger carries a prior verdict forward when a claim has no fresh attempt', () => {
    const a = claim();
    const prior = ledgerOf({ [keyOf(a)]: entry(a) });
    const merged = buildLedger([], [a], { now: NOW, prior });
    const e = merged.claims[keyOf(a)];
    assert.equal(e.state, 'VERIFIED', 'the prior verdict survives a run that did not attempt it');
    assert.equal(e.lastVerifiedAt, entry(a).lastVerifiedAt);
    // horizonDays is inherited from the prior ledger when not given
    assert.equal(merged.horizonDays, 7);
  });

  // extra: buildLedger records a never-attempted claim as unverifiable with a null clock ─
  it('buildLedger records a claim with no verdict and no prior as never-verified', () => {
    const a = claim();
    const merged = buildLedger([], [a], { now: NOW });
    const e = merged.claims[keyOf(a)];
    assert.equal(e.state, 'UNVERIFIABLE');
    assert.equal(e.lastVerifiedAt, null);
  });

  // extra: with no horizonDays the gate falls back to the 7-day default ────────────────
  it('a ledger without horizonDays uses the default horizon', () => {
    const a = claim();
    const led = ledgerOf({ [keyOf(a)]: entry(a) });
    delete led.horizonDays; // exercise the STALENESS_HORIZON_MS default
    withRoot(led, (root) => {
      const r = gateLedger(root, [a], { nowMs: NOW }); // verified today ⇒ fresh under 7 days
      assert.equal(r.pass, true);
      // and a verification 8 days old is stale under that same default
      const stale = ledgerOf({ [keyOf(a)]: entry(a, { lastVerifiedAt: new Date(NOW - 8 * DAY).toISOString() }) });
      delete stale.horizonDays;
      withRoot(stale, (root2) => {
        assert.equal(gateLedger(root2, [a], { nowMs: NOW }).pass, false);
      });
    });
  });

  // extra: horizonDays travels in the ledger and overrides the default ─────────────────
  it('the horizon comes from the ledger horizonDays when present', () => {
    const a = claim();
    const twoDaysOld = new Date(NOW - 2 * DAY).toISOString();
    // a 1-day horizon makes a 2-day-old verification stale
    const led = ledgerOf({ [keyOf(a)]: entry(a, { lastVerifiedAt: twoDaysOld, lastAttemptAt: twoDaysOld }) }, { horizonDays: 1 });
    withRoot(led, (root) => {
      const r = gateLedger(root, [a], { nowMs: NOW });
      assert.equal(r.pass, false);
      assert.ok(r.failures.some((f) => f.kind === 'stale'));
    });
  });
});
