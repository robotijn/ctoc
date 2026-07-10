/**
 * CU4a s13 — content-contract tests for the data-warehouse & columnar framework
 * guides (snowflake.md, clickhouse.md, duckdb.md).
 *
 * ZERO DOUBLES: this reads the REAL guide files off disk via fs.readFileSync
 * (mirroring tests/cu3-data-guides.test.js and the sibling CU4a content tests)
 * and asserts substantive structure — no mocks, no fixtures, no fakes. It guards
 * the CU4a acceptance criteria for these three files:
 *   - each guide exceeds the 5-section template floor (> 5 "## " sections);
 *   - each guide is well past the ~55-line stub floor (> 120 lines);
 *   - the required correction-surface sections are present (footgun/cost/engine,
 *     Error Handling / Correctness, Security, Testing, Performance, Version,
 *     References);
 *   - each guide carries >= 4 code fences (>= 2 single-framework examples);
 *   - at least one dated source (>= 2025) with an http URL is present per guide;
 *   - the original H1 "# <Framework> CTO" header is intact (skills.json indexing);
 *   - each guide names its own concrete framework identifiers proving substance.
 *
 * Every version/security fact these guides assert is web-verified against official
 * sources at edit time (pypi.org JSON API for snowflake-connector-python / duckdb /
 * clickhouse-connect, github.com/ClickHouse/ClickHouse + github.com/duckdb/duckdb
 * releases, docs.snowflake.com, clickhouse.com, duckdb.org, and cwe.mitre.org/89).
 * This test does NOT re-verify the facts online; it guards the substance against a
 * future edit dropping it.
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
  snowflake: 'skills/frameworks/data/snowflake.md',
  clickhouse: 'skills/frameworks/data/clickhouse.md',
  duckdb: 'skills/frameworks/data/duckdb.md',
};

// Sections every de-stubbed correction surface must carry (case-insensitive).
const REQUIRED_SECTIONS = [
  { name: 'Footgun/Cost/Engine/Embedded', re: /^##.*(footgun|cost|engine|embedded|concurren|memory|warehouse)/im },
  { name: 'Correctness/Error Handling', re: /^##.*(correctness|error.?handling|pitfall)/im },
  { name: 'Security', re: /^##.*security/im },
  { name: 'Testing', re: /^##.*test/im },
  { name: 'Performance', re: /^##.*performance/im },
  { name: 'Version-specific', re: /^##.*version/im },
  { name: 'References', re: /^##.*(reference|source)/im },
];

function sectionCount(md) {
  return (md.match(/^## /gm) || []).length;
}

describe('CU4a s13 — data-warehouse & columnar guides are substantive (real files, zero doubles)', () => {
  for (const [fw, rel] of Object.entries(GUIDES)) {
    describe(`${fw} (${rel})`, () => {
      it('exceeds the 5-section template floor (> 5 "## " sections)', () => {
        const md = read(rel);
        const n = sectionCount(md);
        assert.ok(n > 5, `expected > 5 "## " sections, found ${n}`);
      });

      it('is well past the ~55-line stub floor (> 120 lines)', () => {
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

      it('carries >= 4 code fences (>= 2 single-framework examples)', () => {
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

  it('snowflake names auto-suspend, clustering, micro-partition, RBAC and CWE-89', () => {
    const md = read(GUIDES.snowflake);
    assert.match(md, /auto-suspend/i, 'expected auto-suspend cost footgun content');
    assert.match(md, /clustering/i, 'expected clustering-key vs auto-clustering content');
    assert.match(md, /micro-partition/i, 'expected micro-partition pruning content');
    assert.match(md, /result.?cache/i, 'expected result-cache content');
    assert.match(md, /IDENTIFIER\(|bind|parameter/i, 'expected bind-variable / parameterized-SQL content');
    assert.match(md, /RBAC|role hierarchy/i, 'expected RBAC role-hierarchy content');
    assert.match(md, /CWE-89/, 'expected the CWE-89 SQL-injection token');
    assert.match(md, /snowflake-connector-python 4\.6|4\.6\.0/i, 'expected a snowflake-connector-python 4.6.x version token');
  });

  it('clickhouse names MergeTree, ORDER BY, ReplacingMergeTree, FINAL, mutations and CWE-89', () => {
    const md = read(GUIDES.clickhouse);
    assert.match(md, /MergeTree/, 'expected MergeTree engine content');
    assert.match(md, /ORDER BY/, 'expected ORDER BY = primary index content');
    assert.match(md, /ReplacingMergeTree/, 'expected ReplacingMergeTree async-dedup content');
    assert.match(md, /\bFINAL\b/, 'expected FINAL merge-cost content');
    assert.match(md, /mutation/i, 'expected async-mutation content');
    assert.match(md, /max_memory_usage/, 'expected max_memory_usage content');
    assert.match(md, /CWE-89/, 'expected the CWE-89 SQL-injection token');
    assert.match(md, /clickhouse-connect 1\.4|1\.4\.2|25\.8|26\.5/i, 'expected a ClickHouse / clickhouse-connect version token');
  });

  it('duckdb names single-writer, temp_directory, read_parquet, memory_limit and CWE-89', () => {
    const md = read(GUIDES.duckdb);
    assert.match(md, /single.?writer|single.?process|concurrent write/i, 'expected single-writer concurrency content');
    assert.match(md, /temp_directory/, 'expected temp_directory spilling content');
    assert.match(md, /read_parquet/, 'expected read_parquet glob content');
    assert.match(md, /memory_limit/, 'expected memory_limit / OOM content');
    assert.match(md, /prepared|parameter|\?/, 'expected prepared-statement / parameterized-query content');
    assert.match(md, /httpfs|s3/i, 'expected httpfs / S3 credential content');
    assert.match(md, /CWE-89/, 'expected the CWE-89 SQL-injection token');
    assert.match(md, /duckdb 1\.5|1\.5\.4|Variegata/i, 'expected a DuckDB 1.5.x version token');
  });
});
