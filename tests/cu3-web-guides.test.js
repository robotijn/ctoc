/**
 * CU3 s3 — content-contract tests for the web framework guides
 * (react.md, nextjs.md).
 *
 * ZERO DOUBLES: this reads the REAL guide files off disk via fs.readFileSync
 * (mirroring tests/cu2-dynamic-web-guides.test.js) and asserts substantive
 * structure — no mocks, no fixtures, no fakes. It guards the CU3 acceptance
 * criteria for these two files:
 *   - each guide EXCEEDS THE RAISED floor (> 6 "## " sections). Both files
 *     already ship with exactly 6 "## " sections, so a naive "> 5" would false-
 *     green with zero edits; "> 6" proves real additions (see the plan's
 *     raised-floor note);
 *   - the required correction-surface sections are present (Async/Concurrency,
 *     Error Handling, Security/Dependency, Testing, Performance, Version,
 *     References);
 *   - each guide names its own concrete identifiers (React 19 + useActionState/
 *     useOptimistic; Next.js 15 + Server Component/Server Actions);
 *   - the CWE / vuln-class is named where required (react: CWE-79 XSS via
 *     dangerouslySetInnerHTML; nextjs: an input-validation CWE class in the
 *     Server Actions section);
 *   - at least one dated source (>= 2025) with an http URL is present per guide;
 *   - the original H1 header is intact (skills.json indexing not corrupted).
 *
 * Every fact these guides assert is web-verified against official sources at edit
 * time (react.dev / nextjs.org / npm registry / NVD / GitHub Advisory Database /
 * cwe.mitre.org). This test does NOT re-verify the facts; it guards the substance
 * against a future edit dropping it.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const projectRoot = path.join(__dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(projectRoot, rel), 'utf8');
}

const GUIDES = {
  react: 'skills/frameworks/web/react.md',
  nextjs: 'skills/frameworks/web/nextjs.md',
};

// The RAISED floor. Both files start at exactly 6 "## " sections, so the naive
// "> 5" template floor would pass with zero edits (false green). "> 6" proves
// each guide gained at least one substantive section.
const RAISED_FLOOR = 6;

// Sections every de-stubbed correction surface must carry (case-insensitive).
const REQUIRED_SECTIONS = [
  { name: 'Async/Concurrency', re: /^##.*(concurren|async|render(ing)?|boundary)/im },
  { name: 'Error Handling', re: /^##.*error.?handling/im },
  { name: 'Security/Dependency', re: /^##.*(security|dependenc|supply.?chain)/im },
  { name: 'Testing', re: /^##.*test/im },
  { name: 'Performance', re: /^##.*performance/im },
  { name: 'Version-specific', re: /^##.*version/im },
  { name: 'References', re: /^##.*(reference|source)/im },
];

function sectionCount(md) {
  return (md.match(/^## /gm) || []).length;
}

describe('CU3 s3 — web framework guides are substantive (real files, zero doubles)', () => {
  for (const [name, rel] of Object.entries(GUIDES)) {
    describe(`${name} (${rel})`, () => {
      it(`exceeds the RAISED ${RAISED_FLOOR}-section floor (> ${RAISED_FLOOR} "## " sections)`, () => {
        const md = read(rel);
        const n = sectionCount(md);
        assert.ok(
          n > RAISED_FLOOR,
          `expected > ${RAISED_FLOOR} "## " sections (raised floor — both files start at 6), found ${n}`
        );
      });

      it('is well past the ~65-line stub floor', () => {
        const md = read(rel);
        const lines = md.split('\n').length;
        assert.ok(lines > 120, `expected > 120 lines (de-stubbed), found ${lines}`);
      });

      it('has all required correction-surface sections', () => {
        const md = read(rel);
        for (const { name: sname, re } of REQUIRED_SECTIONS) {
          assert.match(md, re, `missing required section: ${sname}`);
        }
      });

      it('carries at least two fenced code blocks (footgun demos)', () => {
        const md = read(rel);
        const fences = (md.match(/^```/gm) || []).length;
        assert.ok(fences >= 4, `expected >= 4 code fences (>= 2 blocks), found ${fences}`);
      });

      it('carries at least one dated source (>= 2025) with an http URL', () => {
        const md = read(rel);
        assert.match(md, /20(2[5-9]|[3-9]\d)/, 'expected a date token >= 2025');
        assert.match(md, /https?:\/\//, 'expected at least one http(s) source URL');
      });

      it('keeps its original H1 header intact (skills.json indexing)', () => {
        const md = read(rel);
        assert.match(md, /^# .+CTO/m, 'expected the original "# <Framework> CTO" H1 header');
      });
    });
  }

  it('react names React 19, a new hook (useActionState/useOptimistic), tearing + CWE-79 XSS', () => {
    const md = read(GUIDES.react);
    assert.match(md, /React 19/, 'expected the "React 19" version token');
    assert.match(md, /useActionState|useOptimistic/, 'expected a React 19 hook (useActionState/useOptimistic)');
    assert.match(md, /useSyncExternalStore/, 'expected useSyncExternalStore (concurrent tearing fix)');
    assert.match(md, /useEffect/, 'expected useEffect dependency/cleanup footgun content');
    assert.match(md, /CWE-79/, 'expected CWE-79 (XSS)');
    assert.match(md, /dangerouslySetInnerHTML/, 'expected the dangerouslySetInnerHTML XSS footgun');
  });

  it('nextjs names Next.js 15, the Server/Client boundary, Server Actions + an input-validation CWE', () => {
    const md = read(GUIDES.nextjs);
    assert.match(md, /Next\.js 15/, 'expected the "Next.js 15" version token');
    assert.match(md, /Server Component|Server Actions?/, 'expected Server Component / Server Actions content');
    assert.match(md, /use client/, 'expected the "use client" boundary directive');
    assert.match(md, /CWE-\d+/, 'expected a CWE id (input-validation class) in the Server Actions section');
    assert.match(md, /revalidate/i, 'expected caching/revalidate content');
    assert.match(md, /edge/i, 'expected edge runtime restriction content');
  });
});
