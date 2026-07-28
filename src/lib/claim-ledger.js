'use strict';

/**
 * src/lib/claim-ledger.js — plan 00137, the OFFLINE half of corpus claim verification.
 *
 * THE RULING: the fetch is scheduled, the VERDICT is gated. src/scripts/verify-claims.js
 * (plan 00136) touches the network on a schedule and writes a ledger. This module reads
 * that ledger OFF DISK, with NO network, on every `npm test`, and decides whether the
 * corpus verdict is trustworthy and clean. It has no `fetch`, no subprocess, no writes on
 * the gate path — so the temptation to write `if (networkFailed) pass` never arises,
 * because there is no network branch to write. That is the whole design: a build that
 * never depends on the open internet, and a verdict a human meets on every build.
 *
 * It MUST NOT require src/lib/claim-fetcher.js — that module contains `fetch`, and a
 * runtime require would put the network back into the `npm test` load graph. The verdict
 * shape crosses the boundary as a JSDoc typedef ONLY (`import('./claim-fetcher')` is a
 * type annotation, not a runtime require). Enforced by tests/claim-ledger-gate.test.js
 * case 15.
 *
 * ABSENT ≠ CORRUPT, and NEITHER is a silent pass. The exact discipline
 * src/scripts/test-gate.js uses for the coverage floor (return `null`, never `0`) and
 * the coverage-baseline slice 00098 established: an ABSENT ledger is a
 * legitimate state on a project that has never run the verifier (`problem: 'absent'`); a
 * PRESENT but unreadable/unparseable/wrong-shaped ledger is a broken instrument and is
 * REFUSED (`problem: 'corrupt'`). No path returns a clean verdict it did not read. The
 * announcement of an absent ledger belongs to the REPORTER (verify-claims.js / a future
 * menu), never to this library — 00098 Decision 10, the mistake not to repeat.
 *
 * FOUR RULES, applied by `gateLedger`, all offline:
 *   1. missing / corrupt / malformed  → REFUSE (ledger-absent | ledger-corrupt)
 *   2. any claim's verdict is REFUTED  → FAIL (refuted)
 *   3. lastVerifiedAt older than the staleness horizon → FAIL (stale) — a scheduled job
 *      that silently stopped running becomes a loud build failure
 *   4. the ledger's claim set drifted from the corpus → FAIL (drift-unverified) for a
 *      corpus claim with no matching entry (or an entry whose hash no longer matches, so
 *      editing a guide's expected value cannot silence a refutation); a ledger entry with
 *      no corpus claim is drift-orphan — REPORTED, but NOT build-failing.
 *
 * `lastVerifiedAt` vs `lastAttemptAt` is the load-bearing pair. An UNVERIFIABLE attempt
 * advances `lastAttemptAt` only; the horizon is measured against `lastVerifiedAt`. A
 * transient outage is absorbed (one failed fetch is not a finding); a persistently
 * unreachable source ages past the horizon and becomes a build failure. Transient and
 * permanent are separated by TIME, not by a guess, and nothing ever reports "verified"
 * about a page never fetched.
 *
 * Pure, total, degrade-never-throw — the same shape as src/lib/stale-detector.js's
 * `classifyStaleCandidate`. Given the same ledger and corpus it returns the same result.
 * Cross-platform: `path.join`, every filesystem touch through the audited `./safe-fs`
 * choke point, no shell.
 *
 * @typedef {import('./claim-fetcher').ClaimVerdict} ClaimVerdict  TYPE ONLY — no runtime require.
 * @typedef {import('./claim-extractor').ClaimRecord} ClaimRecord  TYPE ONLY.
 * @typedef {ClaimRecord & {file: string}} CorpusClaim  A corpus claim tagged with its guide path.
 *
 * @typedef {Object} LedgerRead
 * @property {boolean}          ok
 * @property {Object}          [ledger]   present iff ok
 * @property {('absent'|'corrupt')} [problem] present iff not ok
 *
 * @typedef {('ledger-absent'|'ledger-corrupt'|'refuted'|'stale'|'drift-unverified'|
 *            'drift-orphan')} GateFailureKind  CLOSED enum.
 *
 * @typedef {Object} GateFailure
 * @property {GateFailureKind} kind
 * @property {string}         [id]     The claim id, when the failure is about one claim.
 * @property {string}         [guide]  The repository-relative guide path, when applicable.
 * @property {string}          detail  A short, path-relative human string. Never the
 *                                       ledger contents.
 *
 * @typedef {Object} GateSummary
 * @property {number}      verified
 * @property {number}      refuted
 * @property {number}      unverifiable
 * @property {number|null} stalest      Age in ms of the oldest gated verification, or null.
 * @property {number}      claimCount
 *
 * @typedef {Object} GateResult
 * @property {boolean}       pass
 * @property {GateFailure[]} failures
 * @property {GateSummary}   summary
 */

const path = require('path');
const crypto = require('crypto');
const safeFs = require('./safe-fs');

/** The committed ledger, relative to the project root. Committed deliberately (unlike the
 *  git-ignored cache under `.ctoc/verification/cache/`) so a fresh clone's first `npm test`
 *  enforces a real verdict. */
const LEDGER_REL = path.join('.ctoc', 'verification', 'claims-ledger.json');

/** The schema this module reads and writes. A ledger of any other version is REFUSED
 *  rather than misread. */
const SCHEMA_VERSION = 1;

/** Default staleness horizon: 7 days. A verification older than this fails the build.
 *  A ledger may carry its own `horizonDays` so the policy travels with the artifact
 *  (Decision 6) — but it is a floor the gate READS, never a value the gate invents. */
const STALENESS_HORIZON_MS = 7 * 24 * 60 * 60 * 1000;

/** Size gate applied BEFORE the ledger is read into memory — a pathological ledger must
 *  never stall the build or balloon memory (Step 13; mirrors MAX_PLAN_BYTES). */
const MAX_LEDGER_BYTES = 4 << 20; // 4 MiB

const DAY_MS = 24 * 60 * 60 * 1000;

/** Longest offending key echoed in a failure detail (Step 13 — no unbounded content). */
const KEY_CAP = 32;

/**
 * The identity hash of a corpus claim: `source` + `select` + `expect`. If a guide's
 * expected value (or its source/selector) is edited, this hash changes and the ledger
 * entry no longer matches — the claim becomes drift-unverified. This is what stops
 * someone editing a version number in a guide to silence a refutation (Decision 5).
 *
 * @param {ClaimRecord} claim
 * @returns {string} hex sha256
 */
function claimHash(claim) {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify([claim.source, claim.select || null, claim.expect || null]))
    .digest('hex');
}

/**
 * The ledger key for a claim: `<repository-relative guide path>#<id>`.
 * @param {CorpusClaim} claim
 */
function claimKey(claim) {
  return `${claim.file}#${claim.id}`;
}

/** A short, safe key for a failure detail — capped, never the full ledger content. */
function safeKey(key) {
  const s = String(key);
  return s.length > KEY_CAP ? `${s.slice(0, KEY_CAP)}…` : s;
}

/**
 * Read the ledger off disk. ABSENT and CORRUPT are DIFFERENT facts and are reported
 * differently; no path returns `{ ok: true }` on input it did not fully read and validate.
 *
 * @param {string} root absolute project root
 * @returns {LedgerRead}
 */
function readLedger(root) {
  const file = path.join(root, LEDGER_REL);

  let exists;
  try {
    exists = safeFs.existsSync(file);
  } catch {
    // An unusable path is treated as absent — there is genuinely nothing to read.
    return { ok: false, problem: 'absent' };
  }
  if (!exists) return { ok: false, problem: 'absent' };

  // Everything from here on is a PRESENT ledger: ANY fault — an unstattable/unreadable
  // file, unparseable JSON, or a wrong shape — is a broken instrument, REFUSED as corrupt,
  // never a silent pass. One catch covers stat/read/parse; the size and shape checks
  // return corrupt explicitly. `claims` must be a non-array object; the array shape is the
  // subtle, likeliest-in-practice corruption (case 5), so it is shape-validated BEFORE any
  // property walk (Step 13).
  try {
    const st = safeFs.statSync(file);
    if (!st.isFile() || st.size > MAX_LEDGER_BYTES) return { ok: false, problem: 'corrupt' };
    const parsed = JSON.parse(safeFs.readFileSync(file, 'utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { ok: false, problem: 'corrupt' };
    if (parsed.schemaVersion !== SCHEMA_VERSION) return { ok: false, problem: 'corrupt' };
    if (!parsed.claims || typeof parsed.claims !== 'object' || Array.isArray(parsed.claims)) {
      return { ok: false, problem: 'corrupt' };
    }
    return { ok: true, ledger: parsed };
  } catch {
    return { ok: false, problem: 'corrupt' };
  }
}

/** The staleness horizon for a ledger: its own `horizonDays` when a positive finite
 *  number, else the default. A floor the gate reads, never invents. */
function resolveHorizonMs(ledger) {
  const d = ledger && ledger.horizonDays;
  if (typeof d === 'number' && Number.isFinite(d) && d > 0) return d * DAY_MS;
  return STALENESS_HORIZON_MS;
}

/** An all-zero summary — used when there is no readable ledger, so `unverifiable` (and
 *  every other count) is structurally impossible to omit from a report (case 14). */
function emptySummary() {
  return { verified: 0, refuted: 0, unverifiable: 0, stalest: null, claimCount: 0 };
}

/**
 * Decide, with NO network, whether the corpus verdict is trustworthy and clean. Pure and
 * total: given the same ledger on disk and the same corpus claims it returns the same
 * result, and it never throws on a malformed ledger.
 *
 * @param {string} root absolute project root
 * @param {CorpusClaim[]} corpusClaims the claims extracted from the corpus on disk (00135)
 * @param {{nowMs?: number}} [opts]
 * @returns {GateResult}
 */
function gateLedger(root, corpusClaims, opts = {}) {
  const now = typeof opts.nowMs === 'number' ? opts.nowMs : Date.now();
  const claims = Array.isArray(corpusClaims) ? corpusClaims : [];

  const read = readLedger(root);
  if (!read.ok) {
    const kind = read.problem === 'absent' ? 'ledger-absent' : 'ledger-corrupt';
    const detail = read.problem === 'absent'
      ? `no verification ledger at ${LEDGER_REL} — run the verifier`
      : `verification ledger at ${LEDGER_REL} is unreadable or malformed`;
    return { pass: false, failures: [{ kind, detail }], summary: emptySummary() };
  }

  const ledger = /** @type {{claims: Record<string, any>, horizonDays?: number}} */ (read.ledger);
  const horizonMs = resolveHorizonMs(ledger);
  const failures = /** @type {GateFailure[]} */ ([]);
  const summary = emptySummary();
  summary.claimCount = claims.length;
  let stalest = null;
  const seen = new Set();

  for (const c of claims) {
    const key = claimKey(c);
    seen.add(key);
    const e = Object.prototype.hasOwnProperty.call(ledger.claims, key) ? ledger.claims[key] : null;

    if (!e) {
      failures.push({ kind: 'drift-unverified', id: c.id, guide: c.file, detail: `${safeKey(key)} has no ledger entry` });
      continue;
    }
    if (e.expectedHash !== claimHash(c)) {
      failures.push({ kind: 'drift-unverified', id: c.id, guide: c.file, detail: `${safeKey(key)} changed since it was last verified` });
      continue;
    }

    if (e.state === 'VERIFIED') summary.verified += 1;
    else if (e.state === 'REFUTED') summary.refuted += 1;
    else summary.unverifiable += 1;

    if (e.state === 'REFUTED') {
      failures.push({ kind: 'refuted', id: c.id, guide: c.file, detail: `${safeKey(key)} was refuted by its source` });
    }

    const verifiedAt = Date.parse(e.lastVerifiedAt);
    const age = Number.isFinite(verifiedAt) ? now - verifiedAt : Infinity;
    if (stalest === null || age > stalest) stalest = age;
    if (!Number.isFinite(verifiedAt) || age > horizonMs) {
      failures.push({ kind: 'stale', id: c.id, guide: c.file, detail: `${safeKey(key)} has no fresh verification within the horizon` });
    }
  }

  for (const key of Object.keys(ledger.claims)) {
    if (!seen.has(key)) {
      failures.push({ kind: 'drift-orphan', detail: `${safeKey(key)} is in the ledger but not in the corpus` });
    }
  }

  summary.stalest = stalest === Infinity ? null : stalest;

  // Only drift-orphan is non-failing; every other failure kind fails the build.
  const pass = failures.every((f) => f.kind === 'drift-orphan');
  return { pass, failures, summary };
}

/**
 * Build the ledger to write from a set of fresh verdicts and the corpus claims,
 * MERGING with a prior ledger so an UNVERIFIABLE attempt RETAINS the prior verdict and
 * advances only `lastAttemptAt` (Decision 2). Pure — no IO.
 *
 * A verdict with `liveContact` (a fresh 200 or a 304 — the origin was asked and answered)
 * advances `lastVerifiedAt`. An UNVERIFIABLE verdict (no live contact) keeps the prior
 * `state` and `lastVerifiedAt`, and moves only the attempt fields; with no prior it is
 * recorded as UNVERIFIABLE with a null `lastVerifiedAt`, which the gate then calls stale.
 *
 * @param {ClaimVerdict[]} verdicts the fresh verdicts from the fetcher (00136)
 * @param {CorpusClaim[]} corpusClaims the claims those verdicts correspond to (carry `file`)
 * @param {{now?: number, prior?: any, horizonDays?: number}} [opts]
 * @returns {Object} the ledger object to write
 */
function buildLedger(verdicts, corpusClaims, opts = {}) {
  const now = typeof opts.now === 'number' ? opts.now : Date.now();
  const nowIso = new Date(now).toISOString();
  const priorClaims = opts.prior && opts.prior.claims && typeof opts.prior.claims === 'object' && !Array.isArray(opts.prior.claims)
    ? opts.prior.claims
    : {};

  // Match verdicts to corpus claims by (id, source) — robust to ordering.
  const byIdSource = new Map();
  for (const v of Array.isArray(verdicts) ? verdicts : []) {
    byIdSource.set(`${v.id}\x00${v.source}`, v);
  }

  const horizonDays = typeof opts.horizonDays === 'number' && Number.isFinite(opts.horizonDays) && opts.horizonDays > 0
    ? opts.horizonDays
    : (opts.prior && typeof opts.prior.horizonDays === 'number' && opts.prior.horizonDays > 0 ? opts.prior.horizonDays : 7);

  const claims = /** @type {Record<string, any>} */ ({});
  for (const c of Array.isArray(corpusClaims) ? corpusClaims : []) {
    const key = claimKey(c);
    const hash = claimHash(c);
    const prior = Object.prototype.hasOwnProperty.call(priorClaims, key) ? priorClaims[key] : null;
    const v = byIdSource.get(`${c.id}\x00${c.source}`);

    if (!v) {
      // No fresh attempt for this claim: carry the prior entry forward (re-hashed), or
      // record it as never-verified.
      claims[key] = prior
        ? { ...prior, kind: c.kind, expectedHash: hash }
        : { kind: c.kind, state: 'UNVERIFIABLE', reason: 'network-unreachable', expectedHash: hash, lastVerifiedAt: null, lastAttemptAt: nowIso, lastAttemptState: 'UNVERIFIABLE' };
      continue;
    }

    const checkedAt = typeof v.checkedAt === 'string' ? v.checkedAt : nowIso;
    if (v.liveContact) {
      claims[key] = {
        kind: c.kind,
        state: v.state,
        reason: v.reason || null,
        expectedHash: hash,
        lastVerifiedAt: checkedAt,
        lastAttemptAt: checkedAt,
        lastAttemptState: v.state,
      };
    } else {
      // UNVERIFIABLE: retain the prior verdict and its lastVerifiedAt; advance only the
      // attempt fields. Never reports "verified" about a page never fetched.
      claims[key] = {
        kind: c.kind,
        state: prior ? prior.state : 'UNVERIFIABLE',
        reason: v.reason || null,
        expectedHash: hash,
        lastVerifiedAt: prior ? prior.lastVerifiedAt : null,
        lastAttemptAt: checkedAt,
        lastAttemptState: 'UNVERIFIABLE',
      };
    }
  }

  return {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: nowIso,
    generator: 'src/scripts/verify-claims.js',
    horizonDays,
    claims,
  };
}

/**
 * Persist a ledger object to `.ctoc/verification/claims-ledger.json`, creating the
 * directory if needed. Returns the absolute path written.
 *
 * @param {string} root absolute project root
 * @param {Object} ledger the object from `buildLedger`
 * @returns {string} the file path written
 */
function writeLedgerFile(root, ledger) {
  const file = path.join(root, LEDGER_REL);
  const dir = path.dirname(file);
  if (!safeFs.existsSync(dir)) safeFs.mkdirSync(dir, { recursive: true });
  safeFs.writeFileSync(file, `${JSON.stringify(ledger, null, 2)}\n`);
  return file;
}

module.exports = {
  readLedger,
  gateLedger,
  buildLedger,
  writeLedgerFile,
  STALENESS_HORIZON_MS,
};
