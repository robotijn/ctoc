/**
 * CU2 s2 — content-contract tests for the systems language guides
 * (go.md, rust.md).
 *
 * ZERO DOUBLES: this reads the REAL guide files off disk via fs.readFileSync
 * (mirroring tests/cu2-dynamic-web-guides.test.js and
 * tests/skill-regulatory-citations.test.js) and asserts substantive structure —
 * no mocks, no fixtures, no fakes. It guards the CU2 acceptance criteria for
 * these two files:
 *   - each guide exceeds the 5-section template floor (> 5 "## " sections);
 *   - the required correction-surface sections are present (Concurrency,
 *     Error Handling, Security/Dependency, Testing, Performance, Version, References);
 *   - each guide names its own concrete identifiers (version tokens, APIs, editions);
 *   - the advisory / vuln-scanning path is named (go: govulncheck / pkg.go.dev/vuln,
 *     rust: cargo audit / RUSTSEC);
 *   - at least one dated source (>= 2025) with an http URL is present per guide;
 *   - the original H1 header is intact (skills.json indexing not corrupted).
 *
 * Every fact these guides assert is web-verified against official sources at edit
 * time (go.dev / pkg.go.dev/vuln / doc.rust-lang.org / blog.rust-lang.org /
 * rustsec.org / crates.io / endoflife.date). This test does NOT re-verify the
 * facts; it guards the substance against a future edit dropping it.
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
  go: 'skills/languages/go.md',
  rust: 'skills/languages/rust.md',
};

// Sections every de-stubbed correction surface must carry (case-insensitive).
const REQUIRED_SECTIONS = [
  { name: 'Concurrency', re: /^##.*(concurren|goroutine|async|ownership|borrow)/im },
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

describe('CU2 s2 — systems guides are substantive (real files, zero doubles)', () => {
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

  it('go names errors.Is/As, govulncheck, a 1.2x version, and context cancellation', () => {
    const md = read(GUIDES.go);
    assert.match(md, /errors\.(As|Is)/, 'expected errors.Is/errors.As wrapping');
    assert.match(md, /govulncheck/, 'expected govulncheck vuln scanner');
    assert.match(md, /1\.2[0-9]/, 'expected a Go 1.2x version token');
    assert.match(md, /context/i, 'expected context cancellation content');
    assert.match(md, /-race/, 'expected the -race data-race detector');
    assert.match(md, /pkg\.go\.dev\/vuln/, 'expected a Go vuln DB reference');
  });

  it('rust names tokio, cargo audit, RUSTSEC, a 2024/2021 edition, and .await lock hold', () => {
    const md = read(GUIDES.rust);
    assert.match(md, /tokio/, 'expected tokio async runtime');
    assert.match(md, /cargo audit/i, 'expected cargo audit');
    assert.match(md, /RUSTSEC/, 'expected a RUSTSEC advisory reference');
    assert.match(md, /202[14]\s*edition|edition\s*202[14]/i, 'expected a Rust edition token (2021/2024)');
    assert.match(md, /\.await/, 'expected .await footgun (lock across await)');
    assert.match(md, /rustsec\.org/, 'expected the rustsec.org advisory DB URL');
  });
});
