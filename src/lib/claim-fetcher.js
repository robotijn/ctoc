'use strict';

/**
 * src/lib/claim-fetcher.js — plan 00136, the network half of corpus claim
 * verification.
 *
 * Fetches ONE cited source and returns a three-state verdict that can NEVER say
 * "verified" about a page it did not receive. That single property is the reason
 * this module exists: a verification suite that went green because the network was
 * down would be the worst instance of the false-green defect class this repository
 * fences (`src/lib/false-green-scan.js`). An unreachable source FAILS LOUDLY here —
 * as `UNVERIFIABLE`, never as `VERIFIED`.
 *
 * THE THREE STATES.
 *   VERIFIED     — fetched (fresh 200, or a revalidating 304), parsed, the claim holds.
 *   REFUTED      — fetched, parsed, the claim does NOT hold. The finding the whole
 *                  mechanism exists to produce.
 *   UNVERIFIABLE — I COULD NOT LOOK. Everything else, and NEVER folded into the other
 *                  two. Carries a CLOSED-enum `reason` (below), deliberately closed for
 *                  the same reason `stale-detector.js`'s UnreadReason is: a verdict is
 *                  rendered to a human, and a raw error string carries host names,
 *                  absolute paths and occasionally credentials.
 *
 * `liveContact` IS AN EXPLICIT FIELD, not inferred from `state`. It is true ONLY on a
 * fresh 200 or a 304 — genuine contact with the origin. 00137 reads it to decide
 * whether a claim's `lastVerifiedAt` advances; a boolean a downstream gate depends on
 * gets STORED, never recomputed from a convention.
 *
 * WHY A CACHE HIT ALONE IS `cache-only`, NOT `VERIFIED`. A cached body served with no
 * contact with the origin is a MEMORY of a check, not a check. If a silent cache read
 * could return VERIFIED, a permanently dead source would report verified forever — "a
 * verdict on input never received" wearing an optimisation's clothes. So a cache hit
 * with no live contact is `UNVERIFIABLE: cache-only` and does not advance anything.
 * Only live contact counts: a fresh 200, or a 304 Not Modified answering a conditional
 * request (the origin WAS asked and answered).
 *
 * NO RETRIES, AT ALL. A retry turns a flaky check into a slow check that lies, and it
 * multiplies rate-limit pressure. One attempt, honest verdict — the same no-retry rule
 * `CLAUDE.md` states for the last-mile entry-point check.
 *
 * THE AGGREGATE CONTRACT, and it is the only thing that licenses reading a zero:
 * `counts.refuted === 0` means "the corpus holds" ONLY WHEN `counts.unverifiable === 0`.
 * Mirrors `stale-detector.js`: a clean count is meaningful only when nothing went
 * unread.
 *
 * Transport is Node's global `fetch` (Node ≥ 18, the declared `engines` floor), with
 * an `AbortController` timeout and a STREAMING body cap that abandons mid-stream on
 * exceed — never buffer-then-measure, which is the `unbounded-capture` false-green
 * signature. Zero new dependencies (this project has none). `src/lib/version.js` uses
 * the older `https.get` shape; per Decision 8 that is age, not load-bearing convention
 * — `fetch` gives AbortController timeouts and streaming caps directly, so it is the
 * right tool here.
 *
 * Cross-platform: `path.join`, hashed cache filenames (a URL is not a safe filename on
 * Windows), every filesystem touch through the audited `./safe-fs` choke point, no
 * shell, no subprocess.
 *
 * @typedef {import('./claim-extractor').ClaimRecord} ClaimRecord
 *
 * @typedef {('VERIFIED'|'REFUTED'|'UNVERIFIABLE')} ClaimState
 *
 * @typedef {('network-unreachable'|'timeout'|'http-error'|'rate-limited'|
 *            'parse-failed'|'selector-missing'|'body-too-large'|'cache-only'|
 *            'blocked-host')} UnverifiableReason
 *   CLOSED enum. A raw error/host/body string is never returned in its place.
 *
 * @typedef {Object} ClaimVerdict
 * @property {string}      id          The claim id, echoed back.
 * @property {string}      kind        `registry-version` | `url-live`. Carried so a
 *                                       report never sums a strong version verdict with
 *                                       a weak url-live one.
 * @property {string}      source      The claim source URL.
 * @property {ClaimState}  state       VERIFIED | REFUTED | UNVERIFIABLE.
 * @property {UnverifiableReason|null} reason  null unless state is UNVERIFIABLE.
 * @property {string|null} observed    The selected value, truncated to 128 chars, or
 *                                       null. NEVER the response body.
 * @property {string|null} expected    The claim's `expect`, or null (url-live).
 * @property {string}      checkedAt   ISO-8601 timestamp of the check.
 * @property {boolean}     liveContact true ONLY on a fresh 200 or a 304.
 * @property {number}     [status]     The HTTP status, on an http-error verdict.
 */

const path = require('path');
const crypto = require('crypto');
const safeFs = require('./safe-fs');

/** Default upper bound on a fetched (or cached) body held in memory, abandoned
 *  mid-stream as `body-too-large` on exceed. 16 MiB, NOT the 1 MiB the plan first
 *  specified: pypi's full `/pypi/<pkg>/json` — the endpoint Decision 4 REQUIRES for
 *  version-drift detection, because its `info.version` is the LATEST release — is 3.44
 *  MiB for duckdb and 7.77 MiB for clickhouse-connect (measured live 2026-07-27), so a
 *  1 MiB cap made the plan's own headline capability (REFUTE when a version moves)
 *  impossible against its own chosen sources. 16 MiB fits real registry JSON with
 *  margin while still fencing a pathological body; peak memory is bounded at
 *  cap × concurrency (≈64 MiB). Overridable per call via `opts.maxBodyBytes` (the cap
 *  tests use a small value; a human can tune it — see the surfaced fork in the plan).
 *  KNOWN CEILING: no fixed cap fits every package (a registry with tens of thousands
 *  of releases exceeds any bound); the durable fix is a streaming extractor that pulls
 *  only `info.version` without buffering, deferred to the human's scheduling. */
const DEFAULT_MAX_BODY_BYTES = 16 << 20; // 16 MiB

/** The selected value is truncated to this many characters before it reaches a
 *  verdict — a documentation page can contain anything, and only a short, bounded
 *  `observed` may ever be rendered. */
const OBSERVED_MAX = 128;

/** Per-request timeout, in milliseconds. A source that has not answered by then is
 *  `timeout`, not retried. */
const DEFAULT_TIMEOUT_MS = 10000;

/** Global concurrency cap across all hosts. Sixty-one guides' worth of claims is a
 *  lot of fetches; this bounds the fan-out so a corpus run stays polite. */
const DEFAULT_CONCURRENCY = 4;

/** The two verifiable kinds. Anything else is argument misuse (a throw), never a
 *  degraded verdict — a claim of an unknown kind is a caller bug, not a network fault. */
const KINDS = new Set(['registry-version', 'url-live']);

/** Prototype-chain segments a selector may never resolve through — the second layer
 *  after `claim-extractor.js` already rejected them at parse time. */
const FORBIDDEN_SEGMENTS = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * Classify a source URL against the server-side-request-forgery policy.
 *
 * PRODUCTION: https only; no userinfo; no explicit port; the host may not be a
 * loopback / private / link-local IP literal (those are the SSRF targets — a URL that
 * resolves inward reaches this machine's own services). PUBLIC hosts are allowed;
 * DNS-rebinding is a known ceiling (see the note on `isPrivateOrLinkLocalLiteral`).
 *
 * TEST-ONLY: when `allowLoopback` is set (off by default, and never set in a
 * production path), a loopback host is permitted — including plain http and an
 * explicit ephemeral port — so the specification can be proven against a local server
 * without the real internet. This is the single seam the suite uses; everything else
 * is the real code path.
 *
 * @param {string} source
 * @param {{allowLoopback?: boolean}} [opts]
 * @returns {'blocked-host'|null} the reason when blocked, else null.
 */
function classifyHost(source, opts = {}) {
  let url;
  try {
    url = new URL(source);
  } catch {
    return 'blocked-host';
  }
  if (url.username !== '' || url.password !== '') return 'blocked-host';
  const host = url.hostname;
  const loopback = isLoopbackHost(host);
  if (opts.allowLoopback === true && loopback) return null;
  if (url.protocol !== 'https:') return 'blocked-host';
  if (url.port !== '') return 'blocked-host';
  if (loopback) return 'blocked-host';
  if (isPrivateOrLinkLocalLiteral(host)) return 'blocked-host';
  return null;
}

/**
 * True for a loopback host: `localhost`, `127.0.0.0/8`, or `::1`.
 * @param {string} host
 * @returns {boolean}
 */
function isLoopbackHost(host) {
  if (host === 'localhost') return true;
  if (host === '::1' || host === '[::1]') return true;
  return /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host);
}

/**
 * True for an IPv4/IPv6 LITERAL in a private or link-local range. Operates on literals
 * only — a hostname is NOT resolved here, because a DNS lookup on the hot path is both
 * a network dependency the offline suite cannot exercise and an SSRF surface of its own
 * (a resolver can be steered). The corpus sources are declared public https registry
 * endpoints; DNS-rebinding to an internal address is the acknowledged ceiling of a
 * literal-only check.
 * ponytail: literal IP ranges only, no DNS resolution — the declared-source model makes
 * a resolver unnecessary and the offline suite makes it untestable.
 *
 * @param {string} host
 * @returns {boolean}
 */
function isPrivateOrLinkLocalLiteral(host) {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.\d{1,3}$/.exec(host);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (a === 10) return true;                       // 10.0.0.0/8
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
    if (a === 192 && b === 168) return true;          // 192.168.0.0/16
    if (a === 169 && b === 254) return true;          // 169.254.0.0/16 link-local
    return false;
  }
  const lower = host.toLowerCase();
  if (lower.startsWith('fe80:') || lower.startsWith('[fe80:')) return true; // link-local
  if (/^\[?f[cd][0-9a-f]{2}:/.test(lower)) return true;                     // fc00::/7 unique-local
  return false;
}

/** The hashed cache-file path for a URL. A URL is not a safe filename on Windows, so
 *  the key is a sha256 hex digest. */
function cacheFileFor(cacheDir, source) {
  const key = crypto.createHash('sha256').update(source).digest('hex');
  return path.join(cacheDir, `${key}.json`);
}

/**
 * Read a cache entry for `source`, or null. Size-gated BEFORE the read (a pathological
 * cache file must not stall the caller or balloon memory), and any read/parse fault
 * yields null — a broken cache is simply "no cache", never a crash.
 *
 * @param {string|null} cacheDir
 * @param {string} source
 * @param {number} maxBytes size gate
 * @returns {{body: string, etag: string|null, lastModified: string|null, fetchedAt: number}|null}
 */
function readCache(cacheDir, source, maxBytes) {
  if (!cacheDir) return null;
  const file = cacheFileFor(cacheDir, source);
  try {
    if (!safeFs.existsSync(file)) return null;
    const st = safeFs.statSync(file);
    if (st.size > maxBytes) return null; // size-gated out, treated as no cache
    const parsed = JSON.parse(safeFs.readFileSync(file, 'utf8'));
    if (!parsed || typeof parsed.body !== 'string') return null;
    return {
      body: parsed.body,
      etag: typeof parsed.etag === 'string' ? parsed.etag : null,
      lastModified: typeof parsed.lastModified === 'string' ? parsed.lastModified : null,
      fetchedAt: typeof parsed.fetchedAt === 'number' ? parsed.fetchedAt : 0,
    };
  } catch {
    // A corrupt or unreadable cache entry is "no cache", never a fault: the fetcher
    // still makes a live request. This is the ONE swallow in the module and it maps
    // to a defined outcome (fall through to the network), not to a verdict.
    return null;
  }
}

/**
 * Write a cache entry. Best-effort: a cache-write failure must never change a verdict,
 * so it is swallowed after the verdict is already decided.
 *
 * @param {string|null} cacheDir
 * @param {string} source
 * @param {{body: string, etag: string|null, lastModified: string|null, fetchedAt: number}} entry
 */
function writeCache(cacheDir, source, entry) {
  if (!cacheDir) return;
  try {
    if (!safeFs.existsSync(cacheDir)) safeFs.mkdirSync(cacheDir, { recursive: true });
    safeFs.writeFileSync(cacheFileFor(cacheDir, source), JSON.stringify(entry));
  } catch {
    // A cache is an optimisation; failing to persist it is not a verification fault.
    // The verdict is already computed and returned regardless.
    void 0;
  }
}

/**
 * Perform ONE conditional GET against `source`, streaming the body under a hard cap.
 * Returns a normalized shape or throws a TAGGED error the caller maps to a reason.
 * No retries.
 *
 * @param {string} source
 * @param {{timeoutMs: number, etag: string|null, lastModified: string|null,
 *          accept?: string, maxBytes: number}} opts
 * @returns {Promise<{status: number, notModified: boolean, body: string|null,
 *   etag: string|null, lastModified: string|null}>}
 */
async function conditionalGet(source, opts) {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, opts.timeoutMs);

  /** @type {Record<string,string>} */
  const headers = {};
  if (opts.accept) headers.Accept = opts.accept;
  if (opts.etag) headers['If-None-Match'] = opts.etag;
  if (opts.lastModified) headers['If-Modified-Since'] = opts.lastModified;

  try {
    const res = await fetch(source, {
      method: 'GET',
      headers,
      redirect: 'manual', // a redirect is NEVER followed — see the tagged throw below.
      signal: controller.signal,
    });

    const etag = res.headers.get('etag');
    const lastModified = res.headers.get('last-modified');

    // A redirect points somewhere the guide did not declare. It is refused, not
    // followed: `redirect: 'manual'` yields an opaque redirect the request cannot
    // read, and following one would be an SSRF primitive. This is the strongest form
    // of "re-validate, never follow blindly" — do not follow at all. 304 (Not
    // Modified) shares the 3xx band but is a REVALIDATION, not a redirect, so it is
    // excluded and handled below.
    if (res.type === 'opaqueredirect'
        || (res.status >= 300 && res.status < 400 && res.status !== 304)) {
      if (res.body) { try { await res.body.cancel(); } catch { void 0; } }
      throw tagged('blocked-host');
    }

    if (res.status === 304) {
      // A revalidation carries no body; the caller supplies the cached one.
      if (res.body) { try { await res.body.cancel(); } catch { void 0; } }
      return { status: 304, notModified: true, body: null, etag, lastModified };
    }

    if (res.status !== 200) {
      if (res.body) { try { await res.body.cancel(); } catch { void 0; } }
      return { status: res.status, notModified: false, body: null, etag, lastModified };
    }

    const body = await readCapped(res, opts.maxBytes);
    return { status: 200, notModified: false, body, etag, lastModified };
  } catch (err) {
    if (err && err.__reason) throw err;               // an already-tagged reason (blocked-host / body-too-large)
    if (timedOut || (err && err.name === 'AbortError')) throw tagged('timeout');
    throw tagged('network-unreachable');
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Read a 200 response body, abandoning MID-STREAM the instant it exceeds the cap.
 * Never buffer-then-measure (the `unbounded-capture` false-green signature): the reader
 * is cancelled as soon as the running total crosses `MAX_BODY_BYTES`, which disconnects
 * from the origin, and `body-too-large` is the honest verdict.
 *
 * @param {Response} res
 * @param {number} maxBytes
 * @returns {Promise<string>}
 */
async function readCapped(res, maxBytes) {
  if (!res.body) return '';
  const reader = res.body.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > maxBytes) {
      try { await reader.cancel(); } catch { void 0; }
      throw tagged('body-too-large');
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
}

/**
 * Build a tagged error carrying a closed-enum reason. Thrown out of the transport and
 * mapped straight to a verdict by the caller — never surfaced raw.
 * @param {UnverifiableReason} reason
 * @returns {Error & {__reason: UnverifiableReason}}
 */
function tagged(reason) {
  const e = /** @type {Error & {__reason: UnverifiableReason}} */ (new Error(reason));
  e.__reason = reason;
  return e;
}

/**
 * Resolve a dotted `select` path against a parsed object, using `hasOwnProperty` at
 * each step so a prototype segment can never be traversed. Returns `{ found, value }`.
 *
 * @param {*} root parsed JSON
 * @param {string} select dotted path
 * @returns {{found: boolean, value: *}}
 */
function resolveSelector(root, select) {
  let node = root;
  for (const segment of select.split('.')) {
    if (segment.length === 0 || FORBIDDEN_SEGMENTS.has(segment)) return { found: false, value: null };
    if (node === null || typeof node !== 'object') return { found: false, value: null };
    if (!Object.prototype.hasOwnProperty.call(node, segment)) return { found: false, value: null };
    node = node[segment];
  }
  return { found: true, value: node };
}

/** Truncate a selected value to the observed cap. Never returns the raw body. */
function toObserved(value) {
  return String(value).slice(0, OBSERVED_MAX);
}

/**
 * Build a verdict object with consistent shape.
 * @param {ClaimRecord} claim
 * @param {Partial<ClaimVerdict>} fields
 * @returns {ClaimVerdict}
 */
function verdict(claim, fields) {
  return /** @type {ClaimVerdict} */ ({
    id: claim.id,
    kind: claim.kind,
    source: claim.source,
    state: 'UNVERIFIABLE',
    reason: null,
    observed: null,
    expected: claim.kind === 'registry-version' ? (claim.expect ?? null) : null,
    checkedAt: fields.checkedAt || new Date().toISOString(),
    liveContact: false,
    ...fields,
  });
}

/**
 * Evaluate a registry-version body against the claim. Pure — no IO. The distinction
 * between `selector-missing` and `REFUTED` is load-bearing: a moved field is a source
 * SHAPE change, not a falsified claim, and conflating them produces findings that are
 * wrong and therefore ignored.
 *
 * @param {ClaimRecord} claim
 * @param {string} body
 * @param {boolean} liveContact
 * @param {string} checkedAt
 * @returns {ClaimVerdict}
 */
function evaluateVersion(claim, body, liveContact, checkedAt) {
  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch {
    return verdict(claim, { reason: 'parse-failed', liveContact, checkedAt });
  }
  const { found, value } = resolveSelector(parsed, /** @type {string} */ (claim.select));
  if (!found) {
    return verdict(claim, { reason: 'selector-missing', liveContact, checkedAt });
  }
  const observed = toObserved(value);
  const holds = String(value).trim() === String(claim.expect).trim();
  return verdict(claim, {
    state: holds ? 'VERIFIED' : 'REFUTED',
    reason: null,
    observed,
    liveContact,
    checkedAt,
  });
}

/**
 * Verify ONE cited source. Degrades to an UNVERIFIABLE verdict on any network or data
 * fault; throws `TypeError` ONLY on argument misuse (a non-object claim, a missing
 * source, an unknown kind) — the same split as `stale-detector.js`.
 *
 * @param {ClaimRecord} claim
 * @param {{timeoutMs?: number, allowLoopback?: boolean, noNetwork?: boolean,
 *          cacheDir?: string|null, now?: number, maxBodyBytes?: number}} [opts]
 * @returns {Promise<ClaimVerdict>}
 */
async function verifyClaim(claim, opts = {}) {
  if (claim === null || typeof claim !== 'object') {
    throw new TypeError('verifyClaim: claim must be an object');
  }
  if (typeof claim.source !== 'string' || claim.source.length === 0) {
    throw new TypeError('verifyClaim: claim.source must be a non-empty string');
  }
  if (!KINDS.has(claim.kind)) {
    throw new TypeError(`verifyClaim: unknown kind ${JSON.stringify(claim.kind)}`);
  }

  const timeoutMs = typeof opts.timeoutMs === 'number' ? opts.timeoutMs : DEFAULT_TIMEOUT_MS;
  const cacheDir = opts.cacheDir === undefined ? defaultCacheDir() : opts.cacheDir;
  const maxBytes = typeof opts.maxBodyBytes === 'number' ? opts.maxBodyBytes : DEFAULT_MAX_BODY_BYTES;
  const checkedAt = new Date(typeof opts.now === 'number' ? opts.now : Date.now()).toISOString();

  const hostReason = classifyHost(claim.source, { allowLoopback: opts.allowLoopback === true });
  if (hostReason) return verdict(claim, { reason: hostReason, checkedAt });

  const cached = readCache(cacheDir, claim.source, maxBytes);

  // Cache-only mode: no request may be made. A cache hit is a MEMORY of a check, never
  // a check — cache-only, liveContact false. No cache ⇒ we genuinely could not look.
  if (opts.noNetwork === true) {
    if (cached) return verdict(claim, { reason: 'cache-only', checkedAt });
    return verdict(claim, { reason: 'network-unreachable', checkedAt });
  }

  let res;
  try {
    res = await conditionalGet(claim.source, {
      timeoutMs,
      maxBytes,
      etag: cached ? cached.etag : null,
      lastModified: cached ? cached.lastModified : null,
      accept: claim.kind === 'registry-version' ? 'application/json' : undefined,
    });
  } catch (err) {
    const reason = err && err.__reason ? err.__reason : 'network-unreachable';
    return verdict(claim, { reason, checkedAt });
  }

  if (res.status === 429) {
    // Honour the origin's back-off by recording rate-limited; NEVER loop on Retry-After.
    return verdict(claim, { reason: 'rate-limited', checkedAt });
  }

  // A 304 is live contact: verify against the cached body. A fresh 200 updates the
  // cache. Either way liveContact is true — the origin was asked and answered.
  let body;
  if (res.notModified) {
    if (!cached) return verdict(claim, { reason: 'network-unreachable', checkedAt });
    body = cached.body;
  } else if (res.status === 200) {
    body = res.body || '';
    writeCache(cacheDir, claim.source, {
      body,
      etag: res.etag || null,
      lastModified: res.lastModified || null,
      fetchedAt: Date.now(),
    });
  } else {
    return verdict(claim, { reason: 'http-error', status: res.status, checkedAt });
  }

  if (claim.kind === 'url-live') {
    // A url-live VERIFIED is deliberately WEAKER: it proves the page resolves, not
    // that the guide's claim about it holds. It is never presented as equal, which is
    // why `kind` rides on every verdict.
    return verdict(claim, { state: 'VERIFIED', reason: null, liveContact: true, checkedAt });
  }
  return evaluateVersion(claim, body, true, checkedAt);
}

/** The default cache directory, under the repository's git-ignored verification area. */
function defaultCacheDir() {
  return path.join(process.cwd(), '.ctoc', 'verification', 'cache');
}

/**
 * Verify MANY claims, serialized per host (politeness) and bounded by a global
 * concurrency cap (no unbounded fan-out at corpus scale). Returns every verdict plus
 * counts.
 *
 * THE HEADER CONTRACT: `counts.refuted === 0` means "the corpus holds" ONLY WHEN
 * `counts.unverifiable === 0`. Both numbers are always present so a caller cannot read
 * a clean `refuted` without seeing the `unverifiable` beside it.
 *
 * @param {ClaimRecord[]} claims
 * @param {{timeoutMs?: number, allowLoopback?: boolean, noNetwork?: boolean,
 *          cacheDir?: string|null, now?: number, concurrency?: number,
 *          maxBodyBytes?: number}} [opts]
 * @returns {Promise<{verdicts: ClaimVerdict[], counts: {verified: number, refuted: number,
 *   unverifiable: number, byReason: Record<string, number>}}>}
 */
async function verifyClaims(claims, opts = {}) {
  if (!Array.isArray(claims)) {
    throw new TypeError('verifyClaims: claims must be an array');
  }
  const concurrency = Math.max(1, typeof opts.concurrency === 'number' ? opts.concurrency : DEFAULT_CONCURRENCY);

  // Per-host serialization: a chain of promises keyed by host, so two claims to the
  // same origin never run concurrently, while different hosts proceed in parallel up
  // to the global cap.
  /** @type {Map<string, Promise<void>>} */
  const hostChains = new Map();
  const verdicts = new Array(claims.length);
  let cursor = 0;

  const hostOf = (source) => { try { return new URL(source).host; } catch { return source; } };

  const worker = async () => {
    for (;;) {
      const index = cursor;
      cursor += 1;
      if (index >= claims.length) return;
      const claim = claims[index];
      const host = hostOf(claim.source);
      const prior = hostChains.get(host) || Promise.resolve();
      /** @type {(value?: unknown) => void} */
      let release = () => {};
      const gate = new Promise((resolve) => { release = resolve; });
      hostChains.set(host, prior.then(() => gate));
      await prior; // wait for the previous same-host request to finish
      try {
        verdicts[index] = await verifyClaim(claim, opts);
      } finally {
        release();
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(concurrency, claims.length || 1) }, worker));

  const counts = { verified: 0, refuted: 0, unverifiable: 0, byReason: /** @type {Record<string,number>} */ ({}) };
  for (const v of verdicts) {
    if (v.state === 'VERIFIED') counts.verified += 1;
    else if (v.state === 'REFUTED') counts.refuted += 1;
    else {
      counts.unverifiable += 1;
      if (v.reason) counts.byReason[v.reason] = (counts.byReason[v.reason] || 0) + 1;
    }
  }

  return { verdicts, counts };
}

module.exports = {
  verifyClaim,
  verifyClaims,
};
