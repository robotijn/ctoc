/**
 * Documented counts self-verify — but a GROWING tally polices its GENERATOR,
 * while a FIXED contract still polices the hand-edited literal (plan 00215).
 *
 * ORIGINAL finding (S7, B-family): CLAUDE.md hard-codes component counts in prose
 * (test files, src/lib modules, hooks, tabs, agents, skills). Nothing checked
 * them against disk, so they rotted silently.
 *
 * THE TAX (2026-07-21): asserting a hand-edited CLAUDE.md literal against live
 * disk means every test-first build that adds a `.test.js` moves the live number,
 * breaks this test, and must edit CLAUDE.md — a file it never declared. Eight
 * builds paid that tax in one day.
 *
 * THE SPLIT (plan 00215):
 *   - GROWING tallies (test files, src/lib modules, agents, skills) are GENERATED
 *     into CLAUDE.md by release.js. Here they assert `computeDocCounts` — the ONE
 *     source of truth release.js uses — equals an INDEPENDENT walk on disk. That
 *     polices the generator and can NEVER break on adding a file.
 *   - FIXED contracts (hooks, tabs) keep the exact-equality check of the CLAUDE.md
 *     literal against disk: a change there is a real event that must be seen.
 *
 * The independent walks below (live*) are deliberately NOT computeDocCounts, so
 * the growing-row assertions cross-check two implementations, not a tautology.
 */

'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { computeDocCounts } = require('../src/lib/doc-counts');

const ROOT = path.join(__dirname, '..');
const CLAUDE_MD = fs.readFileSync(path.join(ROOT, 'CLAUDE.md'), 'utf8');

// ─────────────────────────────────────────────────────────────────────
// Live disk counters — each reads its directory at test time.
// ─────────────────────────────────────────────────────────────────────

function listFlat(segments, suffix) {
  const full = path.join(ROOT, ...segments);
  if (!fs.existsSync(full)) return [];
  return fs.readdirSync(full).filter((f) => f.endsWith(suffix));
}

function walk(dir, predicate) {
  const acc = [];
  if (!fs.existsSync(dir)) return acc;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) acc.push(...walk(full, predicate));
    else if (predicate(full)) acc.push(full);
  }
  return acc;
}

const liveTestFiles = () => listFlat(['tests'], '.test.js').length;
const liveLibModules = () => listFlat(['src', 'lib'], '.js').length;
const liveHooks = () => listFlat(['src', 'hooks'], '.js').length;
const liveTabs = () => listFlat(['src', 'tabs'], '.js').length;

// agents/**: real agent definitions only. Any path segment starting with "_"
// (e.g. agents/_shared/*) is prose fragments, not agents — excluded so the
// live count compares like-with-like against the documented "agent definitions".
const liveAgents = () =>
  walk(path.join(ROOT, 'agents'), (p) => {
    if (!p.endsWith('.md')) return false;
    return !path.relative(ROOT, p).split(path.sep).some((seg) => seg.startsWith('_'));
  }).length;

const liveSkills = () => walk(path.join(ROOT, 'skills'), (p) => p.endsWith('.md')).length;

// ─────────────────────────────────────────────────────────────────────
// Claim parser — pulls the documented integer out of CLAUDE.md at runtime.
// If the doc's phrasing changes so the regex no longer matches, the test
// FAILS LOUDLY (never silently passes) so the regex/doc are kept in sync.
// ─────────────────────────────────────────────────────────────────────

function documentedCount(regex) {
  const m = CLAUDE_MD.match(regex);
  assert.ok(
    m,
    `CLAUDE.md no longer contains a count matching ${regex} — the doc phrasing ` +
      `changed; update the regex (or the doc) so this invariant keeps tracking it`,
  );
  return Number(m[1]);
}

// GROWING tallies — generated into CLAUDE.md by release.js. Each row asserts the
// generator (computeDocCounts) equals an INDEPENDENT walk on disk; it never
// parses the CLAUDE.md literal, so adding a file can never break it. `field` is
// the computeDocCounts key; `live` is this file's own independent oracle.
const GROWING_ROWS = [
  { label: 'test files (computeDocCounts.testFiles)', field: 'testFiles', live: liveTestFiles },
  { label: 'JS modules src/lib (computeDocCounts.libModules)', field: 'libModules', live: liveLibModules },
  { label: 'agent definitions excl. _-segments (computeDocCounts.agents)', field: 'agents', live: liveAgents },
  { label: 'skill files skills/**/*.md (computeDocCounts.skills)', field: 'skills', live: liveSkills },
];

// FIXED contracts — the CLAUDE.md literal is policed exactly against disk, so a
// change (a new hook, a new dashboard tab) surfaces as a RED test, never a silent
// tally that drifts. `regex` captures the claimed integer from CLAUDE.md.
const FIXED_ROWS = [
  { label: 'Claude Code hooks (src/hooks/*.js)', regex: /(\d+) Claude Code hooks/, live: liveHooks },
  { label: 'dashboard tab files (src/tabs/*.js)', regex: /(\d+) dashboard tab files/, live: liveTabs },
];

describe('growing counts: the GENERATOR matches an independent disk walk', () => {
  const generated = computeDocCounts(ROOT);
  for (const row of GROWING_ROWS) {
    it(`${row.label}: computeDocCounts equals live disk count`, () => {
      const live = row.live();
      assert.equal(
        generated[row.field],
        live,
        `${row.label}: computeDocCounts ${generated[row.field]}, live ${live}`,
      );
    });
  }
});

describe('fixed contracts: the CLAUDE.md literal is policed exactly against disk', () => {
  for (const row of FIXED_ROWS) {
    it(`${row.label}: documented count equals live disk count`, () => {
      const documented = documentedCount(row.regex);
      const live = row.live();
      assert.equal(
        documented,
        live,
        `${row.label}: documented ${documented}, live ${live}`,
      );
    });
  }
});
