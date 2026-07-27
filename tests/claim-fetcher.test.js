'use strict';

/**
 * tests/claim-fetcher.test.js — the specification for src/lib/claim-fetcher.js
 * (plan 00136), proven OFFLINE against a loopback http server bound to 127.0.0.1:0.
 *
 * NOT ONE CASE TOUCHES THE REAL INTERNET. Every request goes to an ephemeral-port
 * server started in the test and torn down in `finally`. A suite that fetched real
 * registries would be flaky by construction and would eventually be weakened to make
 * red go green — the precise failure Operating Lesson 14 forbids. Loopback is
 * permitted only under the explicit test-only option `allowLoopback`, which is off in
 * every production path (asserted here too).
 *
 * The load-bearing cases the whole slice exists for:
 *   • case 3  — an unreachable source must be UNVERIFIABLE, NEVER VERIFIED;
 *   • case 11 — a cache hit with no live contact is a MEMORY of a check, not a check;
 *   • case 8  — a moved field is selector-missing, not REFUTED.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');

const {
  verifyClaim,
  verifyClaims,
} = require('../src/lib/claim-fetcher');

const { runVerification } = require('../src/scripts/verify-claims');

// ── loopback server + tmp cache helpers ──────────────────────────────────────

/**
 * Start an http server on 127.0.0.1:0 with `handler`, hand `{ url, port, hits,
 * close }` to `fn` (async), and always tear the server down.
 */
async function withServer(handler, fn) {
  const state = { hits: 0, conditionalHits: 0, aborted: false, sentAll: false };
  const server = http.createServer((req, res) => {
    state.hits += 1;
    if (req.headers['if-none-match'] || req.headers['if-modified-since']) {
      state.conditionalHits += 1;
    }
    handler(req, res, state);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const url = `http://127.0.0.1:${port}`;
  try {
    return await fn({ url, port, state });
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
}

/** A fresh throwaway cache directory, removed after `fn`. */
async function withCacheDir(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-claim-cache-'));
  try {
    return await fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function versionClaim(source, expect = '1.5.4') {
  return {
    id: 'pkg-version',
    kind: 'registry-version',
    source,
    select: 'info.version',
    expect,
    retrieved: '2026-07-10',
  };
}

function urlLiveClaim(source) {
  return { id: 'pkg-doc', kind: 'url-live', source, retrieved: '2026-07-10' };
}

const OPTS = (cacheDir, extra = {}) => ({ allowLoopback: true, cacheDir, timeoutMs: 3000, ...extra });

/** Await a boolean-returning condition, polling briefly. Deterministic: the awaited
 *  event (a socket close) fires reliably; this only bridges the async gap. */
async function waitFor(condition, ms = 1000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (condition()) return true;
    await new Promise((r) => setTimeout(r, 5));
  }
  return condition();
}

function versionBody(v) {
  return JSON.stringify({ info: { version: v } });
}

// ── the sixteen cases ─────────────────────────────────────────────────────────

describe('verifyClaim — the three-state contract (offline, loopback)', () => {
  it('(1) matching version ⇒ VERIFIED with liveContact true', () =>
    withCacheDir((cacheDir) =>
      withServer((req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/json', ETag: '"v1"' });
        res.end(versionBody('1.5.4'));
      }, async ({ url }) => {
        const v = await verifyClaim(versionClaim(`${url}/pkg.json`), OPTS(cacheDir));
        assert.equal(v.state, 'VERIFIED');
        assert.equal(v.reason, null);
        assert.equal(v.liveContact, true);
        assert.equal(v.observed, '1.5.4');
        assert.equal(v.expected, '1.5.4');
        assert.equal(v.kind, 'registry-version');
      })));

  it('(2) differing version ⇒ REFUTED, with both observed and expected present', () =>
    withCacheDir((cacheDir) =>
      withServer((req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(versionBody('9.9.9'));
      }, async ({ url }) => {
        const v = await verifyClaim(versionClaim(`${url}/pkg.json`, '1.5.4'), OPTS(cacheDir));
        assert.equal(v.state, 'REFUTED');
        assert.equal(v.reason, null);
        assert.equal(v.observed, '9.9.9');
        assert.equal(v.expected, '1.5.4');
        assert.equal(v.liveContact, true);
      })));

  it('(3) THE LOAD-BEARING CASE — connection refused ⇒ UNVERIFIABLE network-unreachable, NOT VERIFIED', () =>
    withCacheDir(async (cacheDir) => {
      // Bind then immediately release a port so nothing is listening on it.
      const dead = await withServer(() => {}, async ({ url }) => url);
      const v = await verifyClaim(versionClaim(`${dead}/pkg.json`), OPTS(cacheDir));
      assert.notEqual(v.state, 'VERIFIED');
      assert.equal(v.state, 'UNVERIFIABLE');
      assert.equal(v.reason, 'network-unreachable');
      assert.equal(v.liveContact, false);
    }));

  it('(4) server hangs past the timeout ⇒ UNVERIFIABLE timeout (real slow handler)', () =>
    withCacheDir((cacheDir) =>
      withServer((/* req, res */) => {
        // never responds — the AbortController must fire.
      }, async ({ url }) => {
        const v = await verifyClaim(versionClaim(`${url}/pkg.json`), OPTS(cacheDir, { timeoutMs: 150 }));
        assert.equal(v.state, 'UNVERIFIABLE');
        assert.equal(v.reason, 'timeout');
        assert.equal(v.liveContact, false);
      })));

  it('(5) 500 ⇒ UNVERIFIABLE http-error, status recorded, body absent', () =>
    withCacheDir((cacheDir) =>
      withServer((req, res) => {
        res.writeHead(500);
        res.end('a detailed internal error page that must NEVER reach the verdict');
      }, async ({ url }) => {
        const v = await verifyClaim(versionClaim(`${url}/pkg.json`), OPTS(cacheDir));
        assert.equal(v.state, 'UNVERIFIABLE');
        assert.equal(v.reason, 'http-error');
        assert.equal(v.status, 500);
        assert.equal(v.observed, null);
        assert.ok(!JSON.stringify(v).includes('internal error page'), 'the body must never appear in a verdict');
      })));

  it('(6) 429 ⇒ UNVERIFIABLE rate-limited, and EXACTLY ONE request is made (no retry)', () =>
    withCacheDir((cacheDir) =>
      withServer((req, res) => {
        res.writeHead(429, { 'Retry-After': '3600' });
        res.end('slow down');
      }, async ({ url, state }) => {
        const v = await verifyClaim(versionClaim(`${url}/pkg.json`), OPTS(cacheDir));
        assert.equal(v.state, 'UNVERIFIABLE');
        assert.equal(v.reason, 'rate-limited');
        assert.equal(state.hits, 1, 'a retry loop would make more than one request');
      })));

  it('(7) non-JSON body ⇒ UNVERIFIABLE parse-failed', () =>
    withCacheDir((cacheDir) =>
      withServer((req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('<html>not json</html>');
      }, async ({ url }) => {
        const v = await verifyClaim(versionClaim(`${url}/pkg.json`), OPTS(cacheDir));
        assert.equal(v.state, 'UNVERIFIABLE');
        assert.equal(v.reason, 'parse-failed');
      })));

  it('(8) LOAD-BEARING — select path absent ⇒ UNVERIFIABLE selector-missing, NOT REFUTED', () =>
    withCacheDir((cacheDir) =>
      withServer((req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ info: { moved_the_field: '1.5.4' } }));
      }, async ({ url }) => {
        const v = await verifyClaim(versionClaim(`${url}/pkg.json`), OPTS(cacheDir));
        assert.notEqual(v.state, 'REFUTED');
        assert.equal(v.state, 'UNVERIFIABLE');
        assert.equal(v.reason, 'selector-missing');
      })));

  it('(9) oversized body ⇒ UNVERIFIABLE body-too-large, abandoned mid-stream (client disconnects)', () =>
    withCacheDir((cacheDir) =>
      withServer((req, res, state) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        const chunk = 'a'.repeat(64 * 1024);
        let written = 0;
        const pump = () => {
          // Keep writing well past the (small, per-call) cap; when the client cancels,
          // the write errors.
          if (written >= 4 * 1024 * 1024) { state.sentAll = true; res.end(); return; }
          const ok = res.write(chunk, (err) => { if (err) state.aborted = true; });
          written += chunk.length;
          if (ok) setImmediate(pump);
          else res.once('drain', pump);
        };
        res.on('close', () => { if (!state.sentAll) state.aborted = true; });
        pump();
      }, async ({ url, state }) => {
        const v = await verifyClaim(versionClaim(`${url}/pkg.json`), OPTS(cacheDir, { maxBodyBytes: 256 * 1024 }));
        assert.equal(v.state, 'UNVERIFIABLE');
        assert.equal(v.reason, 'body-too-large');
        assert.equal(state.sentAll, false, 'the client must abandon before the server finishes');
        // The connection close is async on the server side; await it deterministically.
        await waitFor(() => state.aborted);
        assert.equal(state.aborted, true, 'the server must observe the client disconnect');
      })));

  it('(10) 304 Not Modified ⇒ VERIFIED with liveContact true (revalidation IS live contact)', () =>
    withCacheDir((cacheDir) =>
      withServer((req, res) => {
        if (req.headers['if-none-match'] === '"etag-1"') {
          res.writeHead(304);
          res.end();
          return;
        }
        res.writeHead(200, { 'Content-Type': 'application/json', ETag: '"etag-1"' });
        res.end(versionBody('1.5.4'));
      }, async ({ url, state }) => {
        const claim = versionClaim(`${url}/pkg.json`, '1.5.4');
        const first = await verifyClaim(claim, OPTS(cacheDir));
        assert.equal(first.state, 'VERIFIED');
        assert.equal(first.liveContact, true);
        const second = await verifyClaim(claim, OPTS(cacheDir));
        assert.equal(second.state, 'VERIFIED', 'the cached body verifies the claim on a 304');
        assert.equal(second.liveContact, true, 'a 304 is genuine live contact');
        assert.equal(second.observed, '1.5.4');
        assert.ok(state.conditionalHits >= 1, 'the second request carried a conditional header');
      })));

  it('(11) ANTI-FALSE-GREEN — a cache hit with no request ⇒ UNVERIFIABLE cache-only, liveContact false', () =>
    withCacheDir((cacheDir) =>
      withServer((req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/json', ETag: '"e"' });
        res.end(versionBody('1.5.4'));
      }, async ({ url, state }) => {
        const claim = versionClaim(`${url}/pkg.json`, '1.5.4');
        const primed = await verifyClaim(claim, OPTS(cacheDir));
        assert.equal(primed.state, 'VERIFIED');
        const hitsAfterPrime = state.hits;
        const offline = await verifyClaim(claim, OPTS(cacheDir, { noNetwork: true }));
        assert.equal(offline.state, 'UNVERIFIABLE');
        assert.equal(offline.reason, 'cache-only');
        assert.equal(offline.liveContact, false, 'a silent cache read is not contact with the origin');
        assert.equal(state.hits, hitsAfterPrime, 'no request may be made in cache-only mode');
      })));

  it('(14) observed is truncated to 128 chars; the response body never appears in a verdict', () =>
    withCacheDir((cacheDir) =>
      withServer((req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ info: { version: 'X'.repeat(10 * 1024) } }));
      }, async ({ url }) => {
        const v = await verifyClaim(versionClaim(`${url}/pkg.json`, '1.5.4'), OPTS(cacheDir));
        assert.equal(v.state, 'REFUTED');
        assert.ok(v.observed.length <= 128, `observed must be ≤128 chars, was ${v.observed.length}`);
        assert.ok(!JSON.stringify(v).includes('X'.repeat(200)), 'the full 10 KB value must never reach the verdict');
      })));
});

// ── url-live is a WEAKER, separately-counted verdict ─────────────────────────

describe('verifyClaim — url-live', () => {
  it('200 ⇒ VERIFIED, kind carried so a report never sums it with a version verdict', () =>
    withCacheDir((cacheDir) =>
      withServer((req, res) => { res.writeHead(200); res.end('<html>docs</html>'); },
        async ({ url }) => {
          const v = await verifyClaim(urlLiveClaim(`${url}/docs`), OPTS(cacheDir));
          assert.equal(v.state, 'VERIFIED');
          assert.equal(v.kind, 'url-live');
          assert.equal(v.liveContact, true);
        })));

  it('404 ⇒ UNVERIFIABLE http-error', () =>
    withCacheDir((cacheDir) =>
      withServer((req, res) => { res.writeHead(404); res.end(); },
        async ({ url }) => {
          const v = await verifyClaim(urlLiveClaim(`${url}/docs`), OPTS(cacheDir));
          assert.equal(v.state, 'UNVERIFIABLE');
          assert.equal(v.reason, 'http-error');
          assert.equal(v.status, 404);
        })));
});

// ── server-side request forgery guard ────────────────────────────────────────

describe('verifyClaim — SSRF host policy (cases 15, 16)', () => {
  it('(15a) http:// ⇒ blocked-host', async () => {
    const v = await verifyClaim(versionClaim('http://example.com/pkg.json'), { cacheDir: null });
    assert.equal(v.state, 'UNVERIFIABLE');
    assert.equal(v.reason, 'blocked-host');
  });

  it('(15b) loopback WITHOUT the test flag ⇒ blocked-host', async () => {
    const v = await verifyClaim(versionClaim('https://127.0.0.1:9/pkg.json'), { cacheDir: null });
    assert.equal(v.reason, 'blocked-host');
  });

  it('(15c) a private-range host ⇒ blocked-host', async () => {
    const v = await verifyClaim(versionClaim('https://10.0.0.1/pkg.json'), { cacheDir: null });
    assert.equal(v.reason, 'blocked-host');
  });

  it('(15d) userinfo in the URL ⇒ blocked-host', async () => {
    const v = await verifyClaim(versionClaim('https://user:pass@127.0.0.1/pkg.json'), { allowLoopback: true, cacheDir: null });
    assert.equal(v.reason, 'blocked-host');
  });

  it('(15e) an unparseable source ⇒ blocked-host', async () => {
    const v = await verifyClaim(versionClaim('not a url at all'), { cacheDir: null });
    assert.equal(v.reason, 'blocked-host');
  });

  it('(16) a redirect is refused, never followed ⇒ blocked-host', () =>
    withCacheDir((cacheDir) =>
      withServer((req, res) => {
        res.writeHead(302, { Location: 'https://10.0.0.1/elsewhere' });
        res.end();
      }, async ({ url }) => {
        const v = await verifyClaim(versionClaim(`${url}/pkg.json`), OPTS(cacheDir));
        assert.equal(v.state, 'UNVERIFIABLE');
        assert.equal(v.reason, 'blocked-host');
      })));
});

// ── cache correctness ────────────────────────────────────────────────────────

describe('verifyClaim — cache handling', () => {
  it('cache-only mode with NO cache ⇒ network-unreachable (never a false cache-only)', () =>
    withCacheDir(async (cacheDir) => {
      const v = await verifyClaim(versionClaim('https://127.0.0.1:9/pkg.json'), OPTS(cacheDir, { noNetwork: true }));
      assert.equal(v.state, 'UNVERIFIABLE');
      assert.equal(v.reason, 'network-unreachable');
    }));

  it('an OVERSIZED cache file is size-gated out and treated as no cache', () =>
    withCacheDir(async (cacheDir) => {
      const claim = versionClaim('https://127.0.0.1:9/pkg.json', '1.5.4');
      // Write a pathological cache entry directly, exceeding the (per-call) read gate.
      const crypto = require('node:crypto');
      const key = crypto.createHash('sha256').update(claim.source).digest('hex');
      fs.writeFileSync(path.join(cacheDir, `${key}.json`), 'a'.repeat(512 * 1024));
      const v = await verifyClaim(claim, OPTS(cacheDir, { noNetwork: true, maxBodyBytes: 256 * 1024 }));
      assert.equal(v.reason, 'network-unreachable', 'an oversized cache file must not be served');
    }));
});

// ── verifyClaims — the aggregate contract ────────────────────────────────────

describe('verifyClaims — counts and the header contract (cases 12, 13)', () => {
  it('(12) a mixed set gives exact verified / refuted / unverifiable and byReason', () =>
    withCacheDir((cacheDir) =>
      withServer((req, res) => {
        if (req.url === '/good.json') { res.writeHead(200); res.end(versionBody('1.5.4')); return; }
        if (req.url === '/bad.json') { res.writeHead(200); res.end(versionBody('0.0.0')); return; }
        res.writeHead(500); res.end();
      }, async ({ url }) => {
        const claims = [
          versionClaim(`${url}/good.json`, '1.5.4'),
          { ...versionClaim(`${url}/bad.json`, '1.5.4'), id: 'bad' },
          { ...versionClaim(`${url}/boom.json`, '1.5.4'), id: 'boom' },
        ];
        const { verdicts, counts } = await verifyClaims(claims, OPTS(cacheDir));
        assert.equal(verdicts.length, 3);
        assert.equal(counts.verified, 1);
        assert.equal(counts.refuted, 1);
        assert.equal(counts.unverifiable, 1);
        assert.equal(counts.byReason['http-error'], 1);
      })));

  it('(13) refuted === 0 with unverifiable > 0 is NOT clean — both numbers are forced', () =>
    withCacheDir((cacheDir) =>
      withServer((req, res) => { res.writeHead(500); res.end(); }, async ({ url }) => {
        const { counts } = await verifyClaims([versionClaim(`${url}/x.json`, '1.5.4')], OPTS(cacheDir));
        assert.equal(counts.refuted, 0);
        assert.ok(counts.unverifiable > 0);
        // The corpus holds ONLY when refuted === 0 AND unverifiable === 0.
        const corpusHolds = counts.refuted === 0 && counts.unverifiable === 0;
        assert.equal(corpusHolds, false, 'unverifiable > 0 must never read as a clean corpus');
      })));

  it('none of a batch to a dead port is EVER VERIFIED (Step 8: server never started)', () =>
    withCacheDir(async (cacheDir) => {
      const dead = await withServer(() => {}, async ({ url }) => url);
      const claims = [1, 2, 3, 4, 5].map((n) => ({ ...versionClaim(`${dead}/p${n}.json`), id: `p${n}` }));
      const { verdicts, counts } = await verifyClaims(claims, OPTS(cacheDir));
      assert.equal(counts.verified, 0, 'a network-down run must produce ZERO verified');
      assert.ok(verdicts.every((v) => v.state === 'UNVERIFIABLE'));
    }));

  it('per-host requests are SERIALIZED — no unbounded parallel fan-out to one host', () =>
    withCacheDir((cacheDir) =>
      withServer((req, res) => {
        // Track concurrency: a serialized client never has >1 in flight per host.
        res._state = res.socket;
      }, async ({ url }) => {
        let inFlight = 0;
        let maxInFlight = 0;
        const server = http.createServer((req, res) => {
          inFlight += 1;
          maxInFlight = Math.max(maxInFlight, inFlight);
          setTimeout(() => {
            res.writeHead(200);
            res.end(versionBody('1.5.4'));
            inFlight -= 1;
          }, 20);
        });
        await new Promise((r) => server.listen(0, '127.0.0.1', r));
        const p = server.address().port;
        try {
          const claims = [1, 2, 3, 4, 5, 6].map((n) => ({ ...versionClaim(`http://127.0.0.1:${p}/p${n}.json`), id: `p${n}` }));
          await verifyClaims(claims, OPTS(cacheDir));
          assert.equal(maxInFlight, 1, `same-host requests must be serialized, saw ${maxInFlight} concurrent`);
        } finally {
          server.closeAllConnections();
          await new Promise((r) => server.close(r));
        }
        void url;
      })));
});

// ── argument misuse throws (the degrade-vs-throw split) ───────────────────────

describe('verifyClaim — throws on argument misuse only', () => {
  it('throws TypeError on a non-object claim', async () => {
    await assert.rejects(() => verifyClaim(null), TypeError);
    await assert.rejects(() => verifyClaim(42), TypeError);
  });

  it('throws TypeError on a claim missing a source', async () => {
    await assert.rejects(() => verifyClaim({ id: 'x', kind: 'url-live' }), TypeError);
  });

  it('throws TypeError on an unknown kind', async () => {
    await assert.rejects(() => verifyClaim({ id: 'x', kind: 'bogus', source: 'https://example.com/x' }), TypeError);
  });
});

// ── the live call site: verify-claims.js runVerification ─────────────────────

describe('runVerification — the human-run report (offline)', () => {
  function withRoot(fn) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-verify-claims-'));
    try { return fn(root); } finally { fs.rmSync(root, { recursive: true, force: true }); }
  }

  it('extracts corpus claims and prints the three counts always — even at zero, offline', () =>
    withRoot(async (root) => {
      // A real declared guide with a PUBLIC-URL claim; noNetwork keeps it offline.
      const guide = `# DuckDB\n\n<!-- ctoc:claims\n` +
        `- id: duckdb-python-version\n  kind: registry-version\n` +
        `  source: https://pypi.org/pypi/duckdb/json\n  select: info.version\n` +
        `  expect: 1.5.4\n  retrieved: 2026-07-10\n-->\n`;
      const full = path.join(root, 'skills', 'frameworks', 'data', 'duckdb.md');
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, guide);

      const r = await runVerification(root, {
        fetcher: { noNetwork: true, cacheDir: path.join(root, '.ctoc', 'verification', 'cache') },
        print: false,
      });
      assert.equal(r.counts.verified, 0);
      assert.equal(r.counts.refuted, 0);
      assert.equal(r.counts.unverifiable, 1, 'offline ⇒ the one claim is unverifiable, never verified');
      assert.equal(r.exitCode, 0, 'no refutation ⇒ clean exit');
      assert.match(r.lines[0], /verified 0 {2}refuted 0 {2}unverifiable 1/);
      assert.match(r.lines[0], /registry-version 1, url-live 0/);
      // The ledger the offline gate (00137) will read was written.
      const ledger = JSON.parse(fs.readFileSync(path.join(root, '.ctoc', 'verification', 'ledger.json'), 'utf8'));
      assert.equal(ledger.counts.unverifiable, 1);
      assert.equal(ledger.verdicts.length, 1);
      assert.ok(!JSON.stringify(ledger).includes('"body"'), 'no response body may reach the ledger');
    }));

  it('an UNREADABLE (oversized) guide is reported honestly, never silently skipped', () =>
    withRoot(async (root) => {
      const good = `# Ok\n\n<!-- ctoc:claims\n- id: v\n  kind: registry-version\n` +
        `  source: https://pypi.org/pypi/duckdb/json\n  select: info.version\n` +
        `  expect: 1.5.4\n  retrieved: 2026-07-10\n-->\n`;
      const okFull = path.join(root, 'skills', 'ok.md');
      const bigFull = path.join(root, 'skills', 'oversized.md');
      fs.mkdirSync(path.dirname(okFull), { recursive: true });
      fs.writeFileSync(okFull, good);
      fs.writeFileSync(bigFull, 'a'.repeat((1 << 20) + 64)); // > MAX_GUIDE_BYTES
      const r = await runVerification(root, {
        fetcher: { noNetwork: true, cacheDir: path.join(root, 'cache') },
        print: false,
      });
      assert.equal(r.unreadable.length, 1);
      assert.equal(r.unreadable[0].reason, 'oversized');
      assert.ok(r.lines.some((l) => /UNREADABLE GUIDE: skills\/oversized\.md — oversized/.test(l)));
    }));

  it('a REFUTED claim makes the run exit NON-ZERO (the finding a human must see)', () =>
    withRoot((root) =>
      withServer((req, res) => { res.writeHead(200); res.end(versionBody('9.9.9')); },
        async ({ url }) => {
          const claims = [versionClaim(`${url}/pkg.json`, '1.5.4')];
          const r = await runVerification(root, {
            claims,
            fetcher: OPTS(path.join(root, 'cache')),
            print: false,
          });
          assert.equal(r.counts.refuted, 1);
          assert.equal(r.exitCode, 1, 'a refutation exits non-zero');
          assert.ok(r.lines.some((l) => /REFUTED:.*observed 9\.9\.9 expected 1\.5\.4/.test(l)));
        })));
});
