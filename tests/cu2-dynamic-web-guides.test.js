/**
 * CU2 s1 — content-contract tests for the dynamic/web language guides
 * (python.md, javascript.md, typescript.md).
 *
 * ZERO DOUBLES: this reads the REAL guide files off disk via fs.readFileSync
 * (mirroring tests/skill-regulatory-citations.test.js) and asserts substantive
 * structure — no mocks, no fixtures, no fakes. It guards the CU2 acceptance
 * criteria for these three files:
 *   - each guide exceeds the 5-section template floor (> 5 "## " sections);
 *   - the required correction-surface sections are present (Concurrency/Async,
 *     Error Handling, Security/Dependency, Testing, Performance, Version, References);
 *   - each guide names its own concrete identifiers (version tokens, CWE ids, APIs);
 *   - the CWE / vuln-class is named where required (js prototype pollution,
 *     python deserialization);
 *   - at least one dated source (>= 2025) with an http URL is present per guide;
 *   - the original H1 header is intact (skills.json indexing not corrupted).
 *
 * Every fact these guides assert is web-verified against official sources at edit
 * time (endoflife.date / peps.python.org / npm registry / nodejs.org /
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
  python: 'skills/languages/python.md',
  javascript: 'skills/languages/javascript.md',
  typescript: 'skills/languages/typescript.md',
};

// Sections every de-stubbed correction surface must carry (case-insensitive).
const REQUIRED_SECTIONS = [
  { name: 'Concurrency/Async', re: /^##.*(concurren|async|event.?loop)/im },
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

describe('CU2 s1 — dynamic/web guides are substantive (real files, zero doubles)', () => {
  for (const [lang, rel] of Object.entries(GUIDES)) {
    describe(`${lang} (${rel})`, () => {
      it('exceeds the 5-section template floor (> 5 "## " sections)', () => {
        const md = read(rel);
        const n = sectionCount(md);
        assert.ok(n > 5, `expected > 5 "## " sections, found ${n}`);
      });

      it('is well past the ~50-line stub floor', () => {
        const md = read(rel);
        const lines = md.split('\n').length;
        assert.ok(lines > 120, `expected > 120 lines (de-stubbed), found ${lines}`);
      });

      it('has all required correction-surface sections', () => {
        const md = read(rel);
        for (const { name, re } of REQUIRED_SECTIONS) {
          assert.match(md, re, `missing required section: ${name}`);
        }
      });

      it('carries at least one fenced code example (footgun demo)', () => {
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
        assert.match(md, /^# .+CTO/m, 'expected the original "# <Lang> CTO" H1 header');
      });
    });
  }

  it('python names asyncio.gather, a 3.1x version, and a deserialization CWE', () => {
    const md = read(GUIDES.python);
    assert.match(md, /asyncio\.gather/, 'expected asyncio.gather footgun');
    assert.match(md, /3\.1[0-9]/, 'expected a Python 3.1x version token');
    assert.match(md, /CWE-\d+/, 'expected a CWE id (deserialization/injection class)');
    assert.match(md, /pickle/i, 'expected pickle deserialization mention');
  });

  it('javascript names prototype pollution CWE-1321 and a Node LTS token', () => {
    const md = read(GUIDES.javascript);
    assert.match(md, /CWE-1321/, 'expected CWE-1321 (prototype pollution)');
    assert.match(md, /prototype pollution/i, 'expected the named vuln class');
    assert.match(md, /Node(?:\.js)?\s*2[0-6]|LTS/i, 'expected a Node LTS version token');
    assert.match(md, /queueMicrotask|microtask/i, 'expected event-loop microtask content');
  });

  it('typescript names unknown vs any and a 5.x version token', () => {
    const md = read(GUIDES.typescript);
    assert.match(md, /\bunknown\b/, 'expected unknown vs any guidance');
    assert.match(md, /5\.[0-9]/, 'expected a TS 5.x version token');
    assert.match(md, /strict/i, 'expected strict-mode content');
  });
});
