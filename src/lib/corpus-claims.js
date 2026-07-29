'use strict';

/**
 * src/lib/corpus-claims.js — the NETWORK-FREE corpus-claim collector (plan 00137).
 *
 * Walks `skills/**` off disk and returns every declared `ctoc:claims` record, each tagged
 * with its guide path, plus the guides it could not read. It has NO `fetch`, no subprocess,
 * no writes — it requires only the offline extractor (src/lib/claim-extractor.js) and the
 * audited ./safe-fs choke point. That is the whole reason it exists as its own module:
 *
 *   - src/scripts/test-gate.js (the gated `npm test` entry) needs the corpus claims to run
 *     the OFFLINE ledger gate, and MUST NOT pull src/lib/claim-fetcher.js (which contains
 *     `fetch`) into the build's module graph.
 *   - src/scripts/verify-claims.js (the human-run/scheduled NETWORK path) needs the same
 *     collection before it fetches.
 *
 * Both callers share this ONE collector so the walk is defined once and the network module
 * loads only in the script that actually fetches. Cross-platform: `path.join`, POSIX-relative
 * output, no shell; a non-regular entry (symlink) is skipped as a security exclusion.
 */

const path = require('path');
const safeFs = require('./safe-fs');
const { extractClaims } = require('./claim-extractor');

/**
 * Enumerate every `.md` guide under `skills/`, POSIX-relative, deterministically ordered.
 * A non-regular entry (symlink) is skipped as a security exclusion. An unreadable
 * subdirectory yields no guides (the census, not this walk, is the coverage instrument).
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
 * Collect every declared claim across the corpus, tagged with its source file. A guide the
 * extractor cannot read (oversized, or an IO failure) is reported in `unreadable` with a
 * closed-enum reason — never dropped silently and never crashed on.
 *
 * @param {string} root absolute project root
 * @returns {{claims: Array<Object>, unreadable: Array<{path: string, reason: string}>}}
 */
function collectCorpusClaims(root) {
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

module.exports = { collectCorpusClaims };
