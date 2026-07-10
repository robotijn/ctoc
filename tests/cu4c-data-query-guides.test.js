/**
 * CU4c s8 — content-contract tests for the data / query language guides
 * (sql.md, graphql.md, r.md).
 *
 * ZERO DOUBLES: this reads the REAL guide files off disk via fs.readFileSync
 * (mirroring tests/cu2-systems-guides.test.js) and asserts substantive
 * structure — no mocks, no fixtures, no fakes. It guards the CU4c acceptance
 * criteria for these three files:
 *   - each guide exceeds the 5-section template floor (> 5 "## " sections);
 *   - the required correction-surface sections are present (QueryShape/
 *     Complexity/Vectorization, Error Handling/Constraints, Security/Dependency,
 *     Testing, Performance, Version-specific, References);
 *   - each guide names its own concrete identifiers and injection/DoS CWE class:
 *     sql -> CWE-89 (SQL injection) + EXPLAIN + parameterized;
 *     graphql -> CWE-770 (uncontrolled resource consumption / query DoS) + DataLoader;
 *     r -> CWE-94 (code injection via eval(parse())) + testthat;
 *   - at least one dated source (>= 2025) with an http URL is present per guide;
 *   - the original H1 header is intact (skills.json indexing not corrupted).
 *
 * Every version / security fact these guides assert is web-verified against
 * official sources at edit time (cwe.mitre.org, postgresql.org, spec.graphql.org,
 * cran.r-project.org / r-project.org). This test does NOT re-verify the facts; it
 * guards the substance against a future edit dropping it.
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
  sql: 'skills/languages/sql.md',
  graphql: 'skills/languages/graphql.md',
  r: 'skills/languages/r.md',
};

// Sections every de-stubbed correction surface must carry (case-insensitive).
// The first entry accepts the per-language "query-shape" equivalent:
// sql -> query-shape/concurrency, graphql -> query-complexity/N+1,
// r -> vectorization/parallelism.
const REQUIRED_SECTIONS = [
  { name: 'Query-shape/Concurrency/Vectorization', re: /^##.*(query.?shape|concurren|complexit|vectoriz|parallel|isolation)/im },
  { name: 'Error Handling/Constraints', re: /^##.*(error.?handling|constraint)/im },
  { name: 'Security/Dependency', re: /^##.*(security|dependenc|supply.?chain)/im },
  { name: 'Testing', re: /^##.*test/im },
  { name: 'Performance', re: /^##.*performance/im },
  { name: 'Version-specific', re: /^##.*version/im },
  { name: 'References', re: /^##.*(reference|source)/im },
];

function sectionCount(md) {
  return (md.match(/^## /gm) || []).length;
}

describe('CU4c s8 — data/query guides are substantive (real files, zero doubles)', () => {
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

      it('carries at least two fenced code examples (>= 4 fences)', () => {
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

  it('sql names CWE-89, parameterized queries, EXPLAIN, and a named dialect', () => {
    const md = read(GUIDES.sql);
    assert.match(md, /CWE-89/, 'expected CWE-89 (SQL injection) named');
    assert.match(md, /cwe\.mitre\.org/, 'expected the cwe.mitre.org authority URL');
    assert.match(md, /parameteri[sz]ed|prepared statement/i, 'expected parameterized/prepared statements');
    assert.match(md, /EXPLAIN/i, 'expected EXPLAIN as a verification tool');
    assert.match(md, /SARGable/i, 'expected the SARGable performance concept');
    assert.match(md, /PostgreSQL|MySQL|SQL Server|SQLite/, 'expected a named SQL dialect');
  });

  it('graphql names CWE-770, DataLoader, depth/complexity limiting, and introspection', () => {
    const md = read(GUIDES.graphql);
    assert.match(md, /CWE-770/, 'expected CWE-770 (query DoS / resource exhaustion) named');
    assert.match(md, /cwe\.mitre\.org/, 'expected the cwe.mitre.org authority URL');
    assert.match(md, /DataLoader/, 'expected DataLoader batching (N+1)');
    assert.match(md, /depth.?limit|complexity/i, 'expected depth/complexity limiting');
    assert.match(md, /introspection/i, 'expected introspection-exposure guidance');
    assert.match(md, /persisted quer/i, 'expected persisted queries mitigation');
  });

  it('r names CWE-94, eval(parse()), testthat, data.table, and vapply', () => {
    const md = read(GUIDES.r);
    assert.match(md, /CWE-94/, 'expected CWE-94 (code injection) named');
    assert.match(md, /cwe\.mitre\.org/, 'expected the cwe.mitre.org authority URL');
    assert.match(md, /eval\(parse/, 'expected the eval(parse(text=...)) injection footgun');
    assert.match(md, /testthat/, 'expected the testthat framework');
    assert.match(md, /data\.table/, 'expected data.table for large-data performance');
    assert.match(md, /vapply/, 'expected vapply over sapply for type safety');
  });
});
