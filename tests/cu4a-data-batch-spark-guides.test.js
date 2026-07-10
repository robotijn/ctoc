/**
 * CU4a s12 — content-contract tests for the data batch & ELT framework guides
 * (spark.md, dbt.md, airbyte.md, fivetran.md).
 *
 * ZERO DOUBLES: this reads the REAL guide files off disk via fs.readFileSync
 * (mirroring tests/cu3-data-guides.test.js) and asserts substantive structure —
 * no mocks, no fixtures, no fakes. It guards the CU4a acceptance criteria for
 * these four files:
 *   - each guide exceeds the 5-section template floor (> 5 "## " sections);
 *   - each guide is well past the ~55-line stub floor (> 120 lines);
 *   - the required correction-surface sections are present (footgun/sync,
 *     Error Handling/Reliability/Correctness, Security, Testing/Performance,
 *     Version, References);
 *   - each guide names its own concrete data-correctness identifiers
 *     (spark: shuffle / broadcast / CWE-89; dbt: is_incremental / ref( / CWE-89;
 *     airbyte: incremental / cursor field / CDC; fivetran: MAR / soft-delete /
 *     schema drift), plus a web-verified current version token;
 *   - at least one dated source (>= 2025) with an http URL is present per guide;
 *   - the original H1 "# <Framework> CTO" header is intact (skills.json indexing).
 *
 * Every version/security fact these guides assert is web-verified against official
 * sources at edit time (pypi.org JSON API for pyspark / dbt-core /
 * fivetran-connector-sdk, github.com/airbytehq/airbyte releases for Airbyte,
 * cwe.mitre.org/89 and cwe.mitre.org/798). This test does NOT re-verify the facts;
 * it guards the substance against a future edit dropping it.
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
  spark: 'skills/frameworks/data/spark.md',
  dbt: 'skills/frameworks/data/dbt.md',
  airbyte: 'skills/frameworks/data/airbyte.md',
  fivetran: 'skills/frameworks/data/fivetran.md',
};

// Sections every de-stubbed correction surface must carry (case-insensitive).
const REQUIRED_SECTIONS = [
  { name: 'Footgun/Sync', re: /^##.*(footgun|shuffle|skew|sync|materializ)/im },
  { name: 'Correctness/Reliability', re: /^##.*(correctness|reliab|error.?handling)/im },
  { name: 'Security', re: /^##.*security/im },
  { name: 'Performance/Testing', re: /^##.*(performance|test)/im },
  { name: 'Version-specific', re: /^##.*version/im },
  { name: 'References', re: /^##.*(reference|source)/im },
];

function sectionCount(md) {
  return (md.match(/^## /gm) || []).length;
}

describe('CU4a s12 — data batch & ELT guides are substantive (real files, zero doubles)', () => {
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

  it('spark names shuffle, broadcast join, AQE, and CWE-89 with a Spark 4 version token', () => {
    const md = read(GUIDES.spark);
    assert.match(md, /shuffle/i, 'expected shuffle footgun content');
    assert.match(md, /broadcast/i, 'expected broadcast-join content');
    assert.match(md, /AQE|adaptive/i, 'expected AQE / adaptive query execution content');
    assert.match(md, /skew/i, 'expected data-skew content');
    assert.match(md, /CWE-89/, 'expected CWE-89 SQL-injection identifier');
    assert.match(md, /spark\.?\s?4|pyspark 4/i, 'expected a Spark 4.x version token');
  });

  it('dbt names is_incremental, ref(, materialization, and CWE-89 with a dbt-core token', () => {
    const md = read(GUIDES.dbt);
    assert.match(md, /is_incremental/, 'expected is_incremental() incremental content');
    assert.match(md, /ref\(/, 'expected ref( DAG content');
    assert.match(md, /materializ/i, 'expected materialization content');
    assert.match(md, /CWE-89/, 'expected CWE-89 Jinja-SQL-injection identifier');
    assert.match(md, /dbt.?core 1|dbt.?core 2/i, 'expected a dbt-core version token');
  });

  it('airbyte names incremental, cursor field, CDC, and a version token', () => {
    const md = read(GUIDES.airbyte);
    assert.match(md, /incremental/i, 'expected incremental sync content');
    assert.match(md, /cursor field/i, 'expected cursor-field content');
    assert.match(md, /CDC/, 'expected CDC content');
    assert.match(md, /schema.?(change|drift)/i, 'expected schema-drift content');
    assert.match(md, /airbyte 2|v2\.0/i, 'expected an Airbyte 2.x version token');
  });

  it('fivetran names MAR, soft-delete, schema drift, and an SDK version token', () => {
    const md = read(GUIDES.fivetran);
    assert.match(md, /MAR/, 'expected MAR (Monthly Active Rows) content');
    assert.match(md, /soft.?delete/i, 'expected soft-delete history content');
    assert.match(md, /schema drift/i, 'expected schema-drift content');
    assert.match(md, /primary.?key/i, 'expected primary-key requirement content');
    assert.match(md, /connector.?sdk 2|sdk 2\./i, 'expected a Fivetran Connector SDK version token');
  });
});
