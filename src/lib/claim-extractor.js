'use strict';

/**
 * src/lib/claim-extractor.js — plan 00135, the foundation slice of corpus claim
 * verification.
 *
 * Turns the DECLARED claim blocks in the skill/guide corpus into structured claim
 * records, and reports HONESTLY how much of the corpus declares nothing. It does
 * not fetch anything over the network (that is slice 00136) and it does not enforce
 * any verdict (00137) — it makes claims extractable and counts coverage.
 *
 * Leaf module: depends only on the Node built-ins `path`/`os`-free code plus the
 * audited `./safe-fs` choke point, mirroring `src/lib/stale-detector.js`. Zero
 * runtime dependencies added (package.json has none, and a hand-rolled line parser
 * follows the existing `parseFilesField` precedent).
 *
 * WHY GUIDES DECLARE CLAIMS RATHER THAN HAVING THEM INFERRED. Extracting
 * `duckdb == 1.5.4` from prose by regular expression is guessing, and a mis-parsed
 * claim produces a FALSE REFUTATION — worse than no check, because it teaches a
 * human to ignore the report. So a claim is declared explicitly, in an HTML comment
 * block that is invisible when the markdown is rendered or fed to an agent:
 *
 *   <!-- ctoc:claims
 *   - id: duckdb-python-version
 *     kind: registry-version
 *     source: https://pypi.org/pypi/duckdb/json
 *     select: info.version
 *     expect: 1.5.4
 *     retrieved: 2026-07-10
 *   - id: duckdb-concurrency-doc
 *     kind: url-live
 *     source: https://duckdb.org/docs/stable/connect/concurrency
 *     retrieved: 2026-07-10
 *   -->
 *
 * A MALFORMED RECORD IS NEVER SILENTLY DROPPED. It is returned in `malformed` with
 * a CLOSED-enum reason. Silent-drop is exactly the false-green `silent-catch`
 * signature this repository fences (`src/lib/false-green-scan.js`): a claim that
 * fails to parse and vanishes is a claim reported as absent that was actually
 * present-and-broken. The returned reason is a closed enum plus at most the
 * offending field NAME (a fixed identifier, never echoed user content), so a hostile
 * block cannot smuggle text onto a dashboard.
 *
 * "DECLARED" vs "EMPTY BLOCK" ARE DIFFERENT FACTS. A file with NO block at all is
 * `declared: false` (nobody looked); a file with an EMPTY block is `declared: true`
 * with zero claims (an author looked and found nothing mechanically checkable).
 * Collapsing them would let an empty block launder an unexamined guide into the
 * covered column — the same substitution of a success value for absent input that
 * the coverage floor removed. This is the "found nothing" vs "did not look"
 * distinction `stale-detector.js` draws for its own skips.
 *
 * THE CENSUS SAYS WHEN IT COULD NOT LOOK — copied from `stale-detector.js`, not
 * reinvented. `censusCorpus` reports `unreadable`/`unreadableCount`, and
 * `undeclaredFiles === 0` means "the whole corpus declares claims" ONLY WHEN
 * `unreadableCount === 0`. A walk that could not read part of skills/ must never
 * render as a clean corpus.
 *
 * Cross-platform: `path.join` throughout; the returned relative paths are
 * POSIX-separated; no shell; every read routes through `safe-fs`.
 *
 * @typedef {('registry-version'|'url-live')} ClaimKind
 *
 * @typedef {Object} ClaimRecord
 * @property {string}    id        Unique WITHIN a file. Global identity is
 *                                  `path + '#' + id` (used by 00137 for drift).
 * @property {ClaimKind} kind      Closed enum.
 * @property {string}    source    Absolute https:// URL, no userinfo, no port.
 * @property {string}    retrieved `YYYY-MM-DD`.
 * @property {string}   [select]   registry-version only: dotted path into JSON.
 * @property {string}   [expect]   registry-version only: expected value.
 *
 * @typedef {('unknown-kind'|'missing-field'|'duplicate-id'|'insecure-source'|
 *            'unsafe-source'|'unsafe-selector'|'bad-date')} MalformedReason
 *   CLOSED enum. A raw error/content string is never returned — the value is bound
 *   for a dashboard.
 *
 * @typedef {Object} MalformedEntry
 * @property {string}          [id]    The record's declared id, when it had one.
 * @property {MalformedReason} reason  Why the record was rejected.
 * @property {string}          [field] For `missing-field`: the field name missing.
 *
 * @typedef {Object} FileClaims
 * @property {string}           path      Repository-relative, POSIX-separated.
 * @property {ClaimRecord[]}    claims    Valid records.
 * @property {MalformedEntry[]} malformed Rejected records, never dropped.
 * @property {boolean}          declared  true iff the file carries ≥1 claim block
 *                                          (even an empty one).
 *
 * @typedef {('dir-unreadable'|'oversized'|'read-failed')} UnreadReason
 *   CLOSED enum — the corpus analog of `stale-detector.js`'s set. `stage-unreadable`
 *   becomes `dir-unreadable` (a subdirectory of skills/ whose `readdir` failed —
 *   ONE entry standing for the whole subtree, since the scan cannot know how many
 *   guides it failed to read). `stat-failed` and `read-failed` are MERGED into
 *   `read-failed`: the size gate needs one `stat` immediately before the `read`, so
 *   both live under a single try whose only failure exit is "could not read this
 *   file" — splitting them would mint a stat-only branch reachable by no portable
 *   test, an uncoverable line pretending to be a distinct fact.
 *
 * @typedef {Object} UnreadInput
 * @property {string}       path   Repository-relative, POSIX-separated, never
 *                                   absolute (an absolute path carries a user name
 *                                   onto a dashboard).
 * @property {UnreadReason} reason Closed enum; never a raw error message.
 *
 * @typedef {Object} CorpusCensus
 * @property {number}        totalFiles      Every `.md` guide enumerated (readable
 *                                             or not).
 * @property {number}        declaredFiles   Files carrying a claim block.
 * @property {number}        undeclaredFiles Readable files carrying none — the gap.
 * @property {{'registry-version': number, 'url-live': number}} claimsByKind
 * @property {number}        malformedCount  Malformed records across the corpus.
 * @property {UnreadInput[]} unreadable      Inputs the walk could not read.
 * @property {number}        unreadableCount === unreadable.length. 0 ⇒ complete walk.
 */

const path = require('path');
const safeFs = require('./safe-fs');

/** Upper bound on a guide we will read into memory. 1 MiB is generous for a
 *  markdown guide; a larger file is size-gated out BEFORE the read. Mirrors
 *  `stale-detector.js`'s MAX_PLAN_BYTES. */
const MAX_GUIDE_BYTES = 1 << 20; // 1 MiB

/** The two verifiable claim kinds. An unknown kind is `malformed`, never skipped. */
const CLAIM_KINDS = Object.freeze(new Set(['registry-version', 'url-live']));

/** Prototype-chain segments a `select` path may never contain — rejected at PARSE
 *  time so a hostile block cannot reach a prototype when 00136 walks parsed JSON. */
const FORBIDDEN_SELECTOR_SEGMENTS = Object.freeze(new Set(['__proto__', 'constructor', 'prototype']));

/** Matches the OPENING of a claim block; used to answer "declared?" cheaply. */
const HAS_BLOCK_RE = /<!--\s*ctoc:claims\b/;

/** Captures the body of every `<!-- ctoc:claims … -->` block. Non-greedy, bounded
 *  by the closing `-->`; linear. */
const BLOCK_RE = /<!--\s*ctoc:claims\b([\s\S]*?)-->/g;

/** A dash-item line that STARTS a record: `- key: value`. */
const RECORD_START_RE = /^\s*-\s*([A-Za-z][\w-]*)\s*:\s*(.*)$/;
/** A continuation line that adds a field to the current record: `  key: value`. */
const FIELD_RE = /^\s*([A-Za-z][\w-]*)\s*:\s*(.*)$/;
/** A calendar date in `YYYY-MM-DD` form (range-checked further below). */
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Parse the raw `key: value` records out of one block body into plain objects.
 * No validation yet — that is `validateRawRecord`. A record is a `- key:` line
 * plus the indented `key:` lines that follow it, up to the next `- ` or the end.
 *
 * @param {string} body one block's interior text
 * @returns {Object[]} raw records, fields as strings
 */
function parseRawRecords(body) {
  const records = [];
  let current = null;
  for (const line of body.split(/\r?\n/)) {
    if (line.trim().length === 0) continue;
    const start = line.match(RECORD_START_RE);
    if (start) {
      current = {};
      current[start[1]] = start[2].trim();
      records.push(current);
      continue;
    }
    const field = line.match(FIELD_RE);
    if (field && current) {
      current[field[1]] = field[2].trim();
    }
    // A line that is neither a record-start nor a continuation (and any field line
    // before the first record) is ignored: block bodies are hand-authored and a
    // stray line must not crash the parse. It is not a claim, so it is not counted.
  }
  return records;
}

/**
 * Validate one `source` value. Returns null when acceptable, else the reason.
 * https only, no userinfo, no explicit port — corpus files are in-repo, but a
 * fetcher driven by these URLs (00136) is a server-side-request-forgery primitive,
 * so the narrowing starts at extraction.
 *
 * @param {string} source
 * @returns {('insecure-source'|'unsafe-source'|null)}
 */
function checkSource(source) {
  let url;
  try {
    url = new URL(source);
  } catch {
    // Not a parseable absolute URL ⇒ treat as unsafe (never as acceptable).
    return 'unsafe-source';
  }
  if (url.protocol !== 'https:') return 'insecure-source';
  if (url.username !== '' || url.password !== '') return 'unsafe-source';
  if (url.port !== '') return 'unsafe-source';
  return null;
}

/**
 * Validate a registry-version `select` path. Rejects a prototype-chain segment and
 * any empty segment. Returns true when safe.
 *
 * @param {string} select dotted path
 * @returns {boolean}
 */
function isSafeSelector(select) {
  const segments = select.split('.');
  for (const seg of segments) {
    if (seg.length === 0) return false;
    if (FORBIDDEN_SELECTOR_SEGMENTS.has(seg)) return false;
  }
  return true;
}

/**
 * True iff `value` is a real `YYYY-MM-DD` calendar date.
 * @param {string} value
 * @returns {boolean}
 */
function isValidDate(value) {
  const m = DATE_RE.exec(value);
  if (!m) return false;
  const [, y, mo, d] = m;
  const year = Number(y);
  const month = Number(mo);
  const day = Number(d);
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const dt = new Date(Date.UTC(year, month - 1, day));
  return (
    dt.getUTCFullYear() === year &&
    dt.getUTCMonth() === month - 1 &&
    dt.getUTCDate() === day
  );
}

/**
 * Validate one raw record into a ClaimRecord or a MalformedEntry. `seenIds` carries
 * the ids already accepted in this FILE so a duplicate is caught (drift detection in
 * 00137 is meaningless without unique identity).
 *
 * @param {Object} raw fields as strings
 * @param {Set<string>} seenIds ids already claimed in this file
 * @returns {{ claim: ClaimRecord|null, malformed: MalformedEntry|null }} exactly one
 *   of the two is non-null.
 */
function validateRawRecord(raw, seenIds) {
  /** @param {MalformedEntry} m @returns {{claim: null, malformed: MalformedEntry}} */
  const bad = (m) => ({ claim: null, malformed: m });

  const id = typeof raw.id === 'string' ? raw.id.trim() : '';
  if (id.length === 0) return bad({ reason: 'missing-field', field: 'id' });
  if (seenIds.has(id)) return bad({ id, reason: 'duplicate-id' });

  const kind = typeof raw.kind === 'string' ? raw.kind.trim() : '';
  if (kind.length === 0) return bad({ id, reason: 'missing-field', field: 'kind' });
  if (!CLAIM_KINDS.has(kind)) return bad({ id, reason: 'unknown-kind' });

  const source = typeof raw.source === 'string' ? raw.source.trim() : '';
  if (source.length === 0) return bad({ id, reason: 'missing-field', field: 'source' });
  const sourceProblem = checkSource(source);
  if (sourceProblem) return bad({ id, reason: sourceProblem });

  const retrieved = typeof raw.retrieved === 'string' ? raw.retrieved.trim() : '';
  if (retrieved.length === 0) return bad({ id, reason: 'missing-field', field: 'retrieved' });
  if (!isValidDate(retrieved)) return bad({ id, reason: 'bad-date' });

  /** @type {ClaimRecord} */
  const claim = { id, kind: /** @type {ClaimKind} */ (kind), source, retrieved };

  if (kind === 'registry-version') {
    const select = typeof raw.select === 'string' ? raw.select.trim() : '';
    if (select.length === 0) return bad({ id, reason: 'missing-field', field: 'select' });
    if (!isSafeSelector(select)) return bad({ id, reason: 'unsafe-selector' });
    const expect = typeof raw.expect === 'string' ? raw.expect.trim() : '';
    if (expect.length === 0) return bad({ id, reason: 'missing-field', field: 'expect' });
    claim.select = select;
    claim.expect = expect;
  }

  seenIds.add(id);
  return { claim, malformed: null };
}

/**
 * Find every `<!-- ctoc:claims … -->` block in a markdown string and parse its
 * records. A malformed record is returned in `malformed`, NEVER dropped.
 *
 * @param {string} markdown full guide contents
 * @returns {{ claims: ClaimRecord[], malformed: MalformedEntry[] }}
 * @throws {TypeError} on non-string input (misuse only). Never throws on malformed
 *   CONTENT.
 */
function parseClaimBlocks(markdown) {
  if (typeof markdown !== 'string') {
    throw new TypeError('parseClaimBlocks: markdown must be a string');
  }
  /** @type {ClaimRecord[]} */
  const claims = [];
  /** @type {MalformedEntry[]} */
  const malformed = [];
  const seenIds = new Set();

  BLOCK_RE.lastIndex = 0;
  let block;
  while ((block = BLOCK_RE.exec(markdown)) !== null) {
    for (const raw of parseRawRecords(block[1])) {
      const { claim, malformed: bad } = validateRawRecord(raw, seenIds);
      if (claim) claims.push(claim);
      if (bad) malformed.push(bad);
    }
  }
  return { claims, malformed };
}

/**
 * Extract the claims of ONE guide, reading it through the size-gated safe-fs choke
 * point. ONE `stat` (size gate) + ONE `read` — no double IO.
 *
 * @param {string} root absolute project root
 * @param {string} relPath repository-relative path to the guide (POSIX or native)
 * @returns {FileClaims}
 * @throws {TypeError} on non-string arguments (misuse only).
 * @throws {Error & {reason: UnreadReason}} when the guide cannot be read — the
 *   caller (`censusCorpus`) classifies it into `unreadable`. `reason` is
 *   `oversized` when size-gated, else `read-failed`.
 */
function extractClaims(root, relPath) {
  if (typeof root !== 'string' || root.length === 0) {
    throw new TypeError('extractClaims: root must be a non-empty string');
  }
  if (typeof relPath !== 'string' || relPath.length === 0) {
    throw new TypeError('extractClaims: relPath must be a non-empty string');
  }
  const posixRel = relPath.split(path.sep).join('/');
  const full = path.join(root, ...posixRel.split('/'));

  let content;
  try {
    const st = safeFs.statSync(full);
    if (st.size > MAX_GUIDE_BYTES) {
      const e = /** @type {Error & {reason: UnreadReason}} */ (new Error('guide exceeds size gate'));
      e.reason = 'oversized';
      throw e;
    }
    content = safeFs.readFileSync(full, 'utf8');
  } catch (err) {
    // An oversized guide re-throws with its own reason; any stat/read failure is a
    // single "could not read this file" fact (see the UnreadReason note on merging).
    if (err && err.reason === 'oversized') throw err;
    const e = /** @type {Error & {reason: UnreadReason}} */ (new Error('guide could not be read'));
    e.reason = 'read-failed';
    throw e;
  }

  const { claims, malformed } = parseClaimBlocks(content);
  return { path: posixRel, claims, malformed, declared: HAS_BLOCK_RE.test(content) };
}

/**
 * Walk `skills/**\/*.md` and report the corpus census.
 *
 * @param {string} root absolute project root (the directory containing `skills/`)
 * @param {Object} [opts] reserved for future options; accepted for forward-compat.
 * @returns {CorpusCensus}
 * @throws {TypeError} if root is not a non-empty string.
 */
function censusCorpus(root, opts = {}) {
  if (typeof root !== 'string' || root.length === 0) {
    throw new TypeError('censusCorpus: root must be a non-empty string');
  }
  void opts; // reserved; no options today.

  const claimsByKind = { 'registry-version': 0, 'url-live': 0 };
  /** @type {UnreadInput[]} */
  const unreadable = [];
  let totalFiles = 0;
  let declaredFiles = 0;
  let undeclaredFiles = 0;
  let malformedCount = 0;

  const skillsDir = path.join(root, 'skills');
  if (!safeFs.existsSync(skillsDir)) {
    // No skills/ is "there was nothing to read", NOT "I could not read". Full shape
    // returned so no caller sees a half result.
    return {
      totalFiles: 0,
      declaredFiles: 0,
      undeclaredFiles: 0,
      claimsByKind,
      malformedCount: 0,
      unreadable,
      unreadableCount: 0,
    };
  }

  /** Repository-relative POSIX path of an absolute path under root. */
  const relOf = (abs) => path.relative(root, abs).split(path.sep).join('/');

  /** @param {string} dir absolute directory to walk */
  const walk = (dir) => {
    let entries;
    try {
      entries = safeFs.readdirSync(dir, { withFileTypes: true });
    } catch {
      // A subdirectory that cannot be read stands for its WHOLE subtree — the scan
      // cannot know how many guides it failed to read, and inventing a count would
      // be the very defect being fixed.
      unreadable.push({ path: relOf(dir), reason: 'dir-unreadable' });
      return;
    }
    // Deterministic order; readdir order is platform-dependent.
    entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      // Only regular `.md` files are guides. A symlink is a security exclusion (it
      // could point outside root), not a failure to look — not reported as unread.
      if (!entry.isFile() || !entry.name.endsWith('.md')) continue;

      totalFiles += 1;
      let fc;
      try {
        fc = extractClaims(root, relOf(full));
      } catch (err) {
        const reason = err && err.reason === 'oversized' ? 'oversized' : 'read-failed';
        unreadable.push({ path: relOf(full), reason });
        continue;
      }

      if (fc.declared) declaredFiles += 1;
      else undeclaredFiles += 1;
      for (const claim of fc.claims) claimsByKind[claim.kind] += 1;
      malformedCount += fc.malformed.length;
    }
  };

  walk(skillsDir);

  return {
    totalFiles,
    declaredFiles,
    undeclaredFiles,
    claimsByKind,
    malformedCount,
    unreadable,
    unreadableCount: unreadable.length,
  };
}

module.exports = {
  parseClaimBlocks,
  extractClaims,
  censusCorpus,
};
