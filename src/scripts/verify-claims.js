'use strict';

/**
 * src/scripts/verify-claims.js — the fetcher's live call site (plan 00136).
 *
 * The command a human (today) or a scheduler (00138) runs to check the corpus's
 * declared citations against their real sources:
 *
 *     node src/scripts/verify-claims.js
 *
 * It extracts every declared claim (via 00135's `extractClaims`), verifies each over
 * the network (via 00136's `verifyClaims`), and prints a report a human can READ — the
 * three counts ALWAYS on one line, including the zeros, so `unverifiable` can never be
 * invisible:
 *
 *     [CTOC claims] verified 128  refuted 0  unverifiable 3  (registry-version 84, url-live 44)
 *     [CTOC claims] UNVERIFIABLE: https://pypi.org/pypi/duckdb/json — timeout
 *     [CTOC claims] REFUTED: https://pypi.org/pypi/duckdb/json — observed 1.6.0 expected 1.5.4
 *
 * A REFUTATION exits NON-ZERO — a moved version or a broken claim is a finding a human
 * must see. It exits via `process.exitCode` (through `requestExit`) and RETURNS; it
 * NEVER calls `process.exit` with writes pending, which would discard the tail of the
 * report (the `exit-with-pending-writes` false-green signature — `src/lib/request-exit.js`
 * is the fixed exemplar).
 *
 * IT IS THE ONLY NETWORK PATH IN THE REPOSITORY. The gated `npm test` suite performs
 * NO network access; verification is a human-run (later scheduled) action, never a
 * build step. That separation is 00137's central ruling and this script honours it.
 *
 * WHAT THIS SLICE DOES NOT DO: nothing runs on a schedule yet (00138), and `npm test`
 * does not read the ledger yet (00137) — between here and there, a refutation is seen
 * ONLY by someone who runs this script.
 *
 * Cross-platform: `path.join` throughout, hashed cache filenames, no shell.
 */

const path = require('path');
const safeFs = require('../lib/safe-fs');
const { extractClaims } = require('../lib/claim-extractor');
const { verifyClaims } = require('../lib/claim-fetcher');
const claimLedger = require('../lib/claim-ledger');
const { requestExit } = require('../lib/request-exit');

/**
 * Enumerate every `.md` guide under `skills/`, POSIX-relative, deterministically
 * ordered. A non-regular entry (symlink) is skipped as a security exclusion, exactly
 * as the extractor's own walk does.
 *
 * @param {string} root absolute project root
 * @returns {string[]} repository-relative POSIX paths
 */
function collectGuides(root) {
  const out = [];
  const skillsDir = path.join(root, 'skills');
  if (!safeFs.existsSync(skillsDir)) return out;
  const rel = (abs) => path.relative(root, abs).split(path.sep).join('/');
  const walk = (dir) => {
    let entries;
    try {
      entries = safeFs.readdirSync(dir, { withFileTypes: true });
    } catch {
      // An unreadable subdirectory is reported by the census; here it simply yields no
      // guides to verify (the census, not this walk, is the coverage instrument).
      return;
    }
    entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) { walk(full); continue; }
      if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
      out.push(rel(full));
    }
  };
  walk(skillsDir);
  return out;
}

/**
 * Collect every declared claim across the corpus, tagged with its source file.
 *
 * @param {string} root absolute project root
 * @returns {{claims: Array<Object>, unreadable: Array<{path: string, reason: string}>}}
 */
function collectClaims(root) {
  const claims = [];
  const unreadable = [];
  for (const relPath of collectGuides(root)) {
    let fc;
    try {
      fc = extractClaims(root, relPath);
    } catch (err) {
      const reason = err && err.reason === 'oversized' ? 'oversized' : 'read-failed';
      unreadable.push({ path: relPath, reason });
      continue;
    }
    for (const claim of fc.claims) claims.push({ ...claim, file: fc.path });
  }
  return { claims, unreadable };
}

/**
 * Verify a corpus (or an explicit claim set) and produce a human-legible report.
 *
 * @param {string} root absolute project root
 * @param {{claims?: Array<Object>, fetcher?: Object, print?: boolean,
 *          writeLedger?: boolean, gate?: boolean}} [opts]
 *   - `claims`      — verify this exact set instead of extracting from the corpus.
 *   - `fetcher`     — options forwarded to `verifyClaims` (cacheDir, timeoutMs,
 *                     allowLoopback, noNetwork, concurrency, now).
 *   - `print`       — write the report to stdout (default true).
 *   - `writeLedger` — persist the ledger consumed by 00137 (default true).
 *   - `gate`        — fold the offline gate's verdict into the exit code (the human-run
 *                     path); default false so a scheduled writer is not failed by a
 *                     refutation it just recorded.
 * @returns {Promise<{lines: string[], counts: Object, verdicts: Array<Object>,
 *   unreadable: Array<Object>, exitCode: number, gate: Object}>}
 */
async function runVerification(root, opts = {}) {
  const print = opts.print !== false;
  const collected = opts.claims ? { claims: opts.claims, unreadable: [] } : collectClaims(root);
  const claims = collected.claims;

  const { verdicts, counts } = await verifyClaims(claims, opts.fetcher || {});

  const byKind = { 'registry-version': 0, 'url-live': 0 };
  for (const c of claims) if (byKind[c.kind] !== undefined) byKind[c.kind] += 1;

  const lines = [];
  lines.push(
    `[CTOC claims] verified ${counts.verified}  refuted ${counts.refuted}  ` +
    `unverifiable ${counts.unverifiable}  ` +
    `(registry-version ${byKind['registry-version']}, url-live ${byKind['url-live']})`,
  );
  for (const v of verdicts) {
    if (v.state === 'REFUTED') {
      lines.push(`[CTOC claims] REFUTED: ${v.source} — observed ${v.observed} expected ${v.expected}`);
    }
  }
  for (const v of verdicts) {
    if (v.state === 'UNVERIFIABLE') {
      lines.push(`[CTOC claims] UNVERIFIABLE: ${v.source} — ${v.reason}`);
    }
  }
  for (const u of collected.unreadable) {
    lines.push(`[CTOC claims] UNREADABLE GUIDE: ${u.path} — ${u.reason}`);
  }

  if (opts.writeLedger !== false) {
    writeLedger(root, { counts, verdicts, unreadable: collected.unreadable });
    // Also write the plan-00137 gate ledger: merge-on-write so an UNVERIFIABLE attempt
    // retains the prior verdict and advances only `lastAttemptAt`. This is what the
    // offline gate reads on every `npm test`.
    try {
      const prior = claimLedger.readLedger(root);
      const merged = claimLedger.buildLedger(verdicts, claims, {
        now: Date.now(),
        prior: prior.ok ? prior.ledger : null,
      });
      claimLedger.writeLedgerFile(root, merged);
    } catch {
      // A ledger-write failure must not crash the human's verification run; the report is
      // already built, and the gate reports a missing/stale ledger on its own.
      void 0;
    }
  }

  // The OFFLINE gate over the committed ledger. Its failures are ALWAYS reported; they
  // fold into the exit code only on the human-run gate path (`opts.gate === true`), so a
  // scheduled WRITER run is never failed by a refutation it just recorded — the writer's
  // job is to keep the ledger fresh, the gate is the verdict a build meets.
  const gate = claimLedger.gateLedger(root, claims);
  for (const f of gate.failures) {
    if (f.kind !== 'drift-orphan') lines.push(`[CTOC claims] GATE ${f.kind}: ${f.detail}`);
  }

  if (print) for (const line of lines) console.log(line);

  // A refutation OR (on the gate path) an unclean gate is a non-clean result.
  const exitCode = counts.refuted > 0 || (opts.gate === true && !gate.pass) ? 1 : 0;
  return { lines, counts, verdicts, unreadable: collected.unreadable, exitCode, gate };
}

/**
 * Persist the verification ledger consumed by 00137. Bodies never reach it — only the
 * bounded verdict fields the fetcher already produced.
 *
 * @param {string} root absolute project root
 * @param {{counts: Object, verdicts: Array<Object>, unreadable: Array<Object>}} data
 */
function writeLedger(root, data) {
  const dir = path.join(root, '.ctoc', 'verification');
  try {
    if (!safeFs.existsSync(dir)) safeFs.mkdirSync(dir, { recursive: true });
    const ledger = {
      generatedAt: new Date().toISOString(),
      counts: data.counts,
      unreadable: data.unreadable,
      verdicts: data.verdicts.map((v) => ({
        id: v.id,
        file: v.file || null,
        kind: v.kind,
        source: v.source,
        state: v.state,
        reason: v.reason,
        observed: v.observed,
        expected: v.expected,
        liveContact: v.liveContact,
        checkedAt: v.checkedAt,
      })),
    };
    safeFs.writeFileSync(path.join(dir, 'ledger.json'), `${JSON.stringify(ledger, null, 2)}\n`);
  } catch {
    // A ledger-write failure must not crash the human's verification run; the report
    // has already been printed. 00137 will report a missing/stale ledger on its own.
    void 0;
  }
}

/** Run against the real corpus and set the exit code without discarding output. */
async function main() {
  // The human-run path enforces the offline gate in the exit code (`gate: true`): a
  // refuted, stale or drifted ledger exits non-zero so the finding is impossible to miss.
  const result = await runVerification(process.cwd(), { gate: true });
  requestExit(result.exitCode);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(`[CTOC claims] verification run failed: ${err && err.message ? err.message : err}`);
    requestExit(1);
  });
}

module.exports = { runVerification };
