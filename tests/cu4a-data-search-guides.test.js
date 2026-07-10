/**
 * CU4a s22 — content-contract tests for the search-engine framework guides
 * (elasticsearch.md, opensearch.md, typesense.md, meilisearch.md).
 *
 * ZERO DOUBLES: this reads the REAL guide files off disk via fs.readFileSync
 * (mirroring tests/cu3-data-guides.test.js and the sibling CU4a content tests)
 * and asserts substantive structure — no mocks, no fixtures, no fakes. It guards
 * the CU4a acceptance criteria for these four files:
 *   - each guide exceeds the 5-section template floor (> 5 "## " sections);
 *   - each guide is well past the ~55-line stub floor (> 120 lines);
 *   - the required correction-surface sections are present (footgun/mapping/schema,
 *     Correctness, Security, Testing, Performance, Version, References);
 *   - each guide carries >= 4 code fences (>= 2 single-framework examples);
 *   - at least one dated source (>= 2025) with an http URL is present per guide;
 *   - the original H1 "# <Framework> CTO" header is intact (skills.json indexing);
 *   - each guide names its own concrete framework identifiers proving substance.
 *
 * Every version/security fact these guides assert is web-verified against official
 * sources at edit time (github.com/elastic/elasticsearch releases -> 9.4.3,
 * github.com/opensearch-project/OpenSearch releases -> 3.7.0,
 * github.com/typesense/typesense releases -> v30.2,
 * github.com/meilisearch/meilisearch releases -> v1.49.0, elastic.co license blog,
 * cwe.mitre.org/798). This test does NOT re-verify the facts online; it guards the
 * substance against a future edit dropping it.
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
  elasticsearch: 'skills/frameworks/data/elasticsearch.md',
  opensearch: 'skills/frameworks/data/opensearch.md',
  typesense: 'skills/frameworks/data/typesense.md',
  meilisearch: 'skills/frameworks/data/meilisearch.md',
};

// Sections every de-stubbed correction surface must carry (case-insensitive).
const REQUIRED_SECTIONS = [
  { name: 'Footgun/Mapping/Schema/Settings', re: /^##.*(footgun|mapping|schema|setting|analyz|concurren|memory)/im },
  { name: 'Correctness', re: /^##.*(correctness|relevanc|pagination|pitfall|tuning)/im },
  { name: 'Security', re: /^##.*security/im },
  { name: 'Testing', re: /^##.*test/im },
  { name: 'Performance', re: /^##.*performance/im },
  { name: 'Version-specific', re: /^##.*version/im },
  { name: 'References', re: /^##.*(reference|source)/im },
];

function sectionCount(md) {
  return (md.match(/^## /gm) || []).length;
}

describe('CU4a s22 — search-engine guides are substantive (real files, zero doubles)', () => {
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

  it('elasticsearch names keyword, search_after, analyzer, deep pagination and 9.4 version', () => {
    const md = read(GUIDES.elasticsearch);
    assert.match(md, /keyword/i, 'expected text-vs-keyword mapping content');
    assert.match(md, /search_after/, 'expected search_after / PIT deep-pagination content');
    assert.match(md, /analyzer/i, 'expected index-vs-query analyzer mismatch content');
    assert.match(md, /max_result_window|from.*size|deep pagination/i, 'expected deep-pagination window content');
    assert.match(md, /mapping explosion|total_fields|dynamic mapping/i, 'expected mapping-explosion content');
    assert.match(md, /refresh_interval/, 'expected refresh_interval near-real-time content');
    assert.match(md, /painless|script/i, 'expected painless script-injection content');
    assert.match(md, /AGPL|Elastic License|SSPL/i, 'expected license-fork note');
    assert.match(md, /9\.4\.3|9\.4/, 'expected an Elasticsearch 9.4.x version token');
  });

  it('opensearch names keyword, k-NN, search_after, ISM and 3.7 version', () => {
    const md = read(GUIDES.opensearch);
    assert.match(md, /keyword/i, 'expected text-vs-keyword mapping content');
    assert.match(md, /k-NN/i, 'expected k-NN vector plugin content');
    assert.match(md, /search_after/, 'expected search_after deep-pagination content');
    assert.match(md, /\bISM\b|Index State Management/i, 'expected ISM lifecycle content');
    assert.match(md, /security plugin|RBAC|TLS/i, 'expected security-plugin RBAC/TLS content');
    assert.match(md, /Apache 2\.0|fork of Elasticsearch 7\.10|7\.10/i, 'expected Apache-2.0 fork-of-ES-7.10 note');
    assert.match(md, /script/i, 'expected script-injection content');
    assert.match(md, /3\.7\.0|3\.7/, 'expected an OpenSearch 3.7.x version token');
  });

  it('typesense names query_by, filter_by, scoped key, CWE-798 and v30 version', () => {
    const md = read(GUIDES.typesense);
    assert.match(md, /query_by/, 'expected query_by weighting content');
    assert.match(md, /filter_by/, 'expected filter_by syntax content');
    assert.match(md, /scoped\s+(search\s+)?key|scoped api key/i, 'expected scoped-key content');
    assert.match(md, /default_sorting_field/, 'expected default_sorting_field content');
    assert.match(md, /typo.?tolerance|num_typos/i, 'expected typo-tolerance tuning content');
    assert.match(md, /CWE-798/, 'expected the CWE-798 hardcoded-admin-key token');
    assert.match(md, /symbols_to_index|per_page|page/i, 'expected pagination/indexing content');
    assert.match(md, /30\.2|v30|26\.0/, 'expected a Typesense v30.x version token');
  });

  it('meilisearch names filterable, ranking rules, tenant token, CWE-798 and v1.49 version', () => {
    const md = read(GUIDES.meilisearch);
    assert.match(md, /filterable/i, 'expected filterableAttributes content');
    assert.match(md, /ranking rules?/i, 'expected ranking-rules-order content');
    assert.match(md, /tenant token/i, 'expected tenant-token content');
    assert.match(md, /searchableAttributes/i, 'expected searchableAttributes content');
    assert.match(md, /typo.?tolerance/i, 'expected typo-tolerance content');
    assert.match(md, /CWE-798/, 'expected the CWE-798 exposed-master-key token');
    assert.match(md, /limit|offset|maxTotalHits/i, 'expected pagination-cap content');
    assert.match(md, /1\.49|v1\.49/, 'expected a Meilisearch 1.49.x version token');
  });
});
