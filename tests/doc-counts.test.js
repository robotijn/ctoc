/**
 * W06-s6 — Documented counts self-verify against live disk counts.
 *
 * Finding S7 (B-family): CLAUDE.md hard-codes component counts in prose
 * (test files, src/lib modules, hooks, tabs, agents, skills). Nothing checked
 * them against disk, so they rotted silently — "109 test files" and
 * "114 JS modules" both drifted while the suite stayed green.
 *
 * This test parses each claimed number out of CLAUDE.md at test time and
 * compares it to a live count taken from disk at test time. NEITHER operand is
 * hard-coded here: hard-coding "259" would just relocate the drift (the same
 * duplicate-literal anti-pattern this workstream exists to kill). Because both
 * operands are computed at runtime, the test tracks the doc and the disk as
 * they change together.
 *
 * PAIRING: W06 owns only this RED tripwire. The doc correction that reconciles
 * the stale numbers is a CLAUDE.md edit OUTSIDE W06's test-only scope — nearest
 * owner W09 (release & metadata truth), with W04 (adds agents) and vision
 * workstream 11 (removes dead modules) also moving counted artifacts. This test
 * goes GREEN once those documented counts are corrected to match disk; it does
 * NOT edit CLAUDE.md.
 */

'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

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

// One row per documented count. `regex` captures the claimed integer; `live`
// counts the same artifact on disk. Both operands are runtime-computed.
const ROWS = [
  {
    label: 'test files (test command line: "Run all N test files")',
    regex: /Run all (\d+) test files/,
    live: liveTestFiles,
  },
  {
    label: 'test files (project-structure line: "tests/  N test files")',
    regex: /tests\/\s+(\d+) test files/,
    live: liveTestFiles,
  },
  {
    label: 'Claude Code hooks (src/hooks/*.js)',
    regex: /(\d+) Claude Code hooks/,
    live: liveHooks,
  },
  {
    label: 'JS modules (src/lib/*.js)',
    regex: /(\d+) JS modules/,
    live: liveLibModules,
  },
  {
    label: 'dashboard tab files (src/tabs/*.js)',
    regex: /(\d+) dashboard tab files/,
    live: liveTabs,
  },
  {
    label: 'agent definitions (agents/**/*.md, excl. _shared)',
    regex: /(\d+) agent definitions/,
    live: liveAgents,
  },
  {
    // Anchored to the "skills/" project-structure line so it does not match the
    // unrelated "creating 5 skill files" example prose elsewhere in CLAUDE.md.
    label: 'skill files (skills/**/*.md)',
    regex: /skills\/\s+(\d+) skill files/,
    live: liveSkills,
  },
];

describe('CLAUDE.md documented counts self-verify against live disk counts', () => {
  for (const row of ROWS) {
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
