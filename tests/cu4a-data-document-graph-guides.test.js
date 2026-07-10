/**
 * CU4a s21 — content-contract tests for the document & graph database
 * framework guides (mongodb.md, arangodb.md, neo4j.md, dgraph.md).
 *
 * ZERO DOUBLES: this reads the REAL guide files off disk via fs.readFileSync
 * (mirroring tests/cu3-data-guides.test.js and the sibling CU4a content tests)
 * and asserts substantive structure — no mocks, no fixtures, no fakes. It guards
 * the CU4a acceptance criteria for these four files:
 *   - each guide exceeds the 5-section template floor (> 5 "## " sections);
 *   - each guide is well past the ~55-line stub floor (> 120 lines);
 *   - the required correction-surface sections are present (footgun/modeling,
 *     Consistency/Correctness, Security, Testing, Performance, Version,
 *     References);
 *   - each guide carries >= 4 code fences (>= 2 single-framework examples);
 *   - at least one dated source (>= 2025) with an http URL is present per guide;
 *   - the original H1 "# <Framework> CTO" header is intact (skills.json indexing);
 *   - each guide names its own concrete framework identifiers proving substance.
 *
 * Every version/security fact these guides assert is web-verified against official
 * sources at edit time (registry.npmjs.org + pypi.org JSON APIs for the mongodb /
 * python-arango / neo4j / pydgraph drivers, www.mongodb.com/docs manual release
 * notes, docs.arangodb.com/3.12, neo4j.com release-notes, github.com dgraph
 * releases, and cwe.mitre.org/943 for the NoSQL/query-injection weakness class).
 * NoSQL / query-language injection is CWE-943 ("Improper Neutralization of Special
 * Elements in Data Query Logic"), NOT CWE-89 (that is SQL). This test does NOT
 * re-verify the facts online; it guards the substance against a future edit
 * silently dropping it.
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
  mongodb: 'skills/frameworks/data/mongodb.md',
  arangodb: 'skills/frameworks/data/arangodb.md',
  neo4j: 'skills/frameworks/data/neo4j.md',
  dgraph: 'skills/frameworks/data/dgraph.md',
};

// Sections every de-stubbed correction surface must carry (case-insensitive).
const REQUIRED_SECTIONS = [
  { name: 'Footgun/Query/Traversal/Memory', re: /^##.*(footgun|query|traversal|graph|schema|index|concurren|memory)/im },
  { name: 'Consistency/Correctness', re: /^##.*(consistency|correctness|cost|pitfall|transaction)/im },
  { name: 'Security', re: /^##.*security/im },
  { name: 'Testing', re: /^##.*test/im },
  { name: 'Performance', re: /^##.*performance/im },
  { name: 'Version-specific', re: /^##.*version/im },
  { name: 'References', re: /^##.*(reference|source)/im },
];

function sectionCount(md) {
  return (md.match(/^## /gm) || []).length;
}

describe('CU4a s21 — document & graph database guides are substantive (real files, zero doubles)', () => {
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

  it('mongodb names COLLSCAN, $lookup, aggregation memory, $where injection and CWE-943', () => {
    const md = read(GUIDES.mongodb);
    assert.match(md, /COLLSCAN/, 'expected the COLLSCAN unindexed-scan token');
    assert.match(md, /\$lookup/, 'expected $lookup join-cost content');
    assert.match(md, /aggregation/i, 'expected aggregation-pipeline memory content');
    assert.match(md, /16\s?MB/i, 'expected the 16MB document-size limit');
    assert.match(md, /\$where|operator injection/i, 'expected $where / operator-injection content');
    assert.match(md, /w:\s*['"]?majority|write concern/i, 'expected write-concern content');
    assert.match(md, /CWE-943/, 'expected the CWE-943 NoSQL-injection token');
    // Must not ASSIGN this weakness to CWE-89 (that is SQL); an educational
    // "CWE-943, not CWE-89" contrast is allowed, "is/= CWE-89" is not.
    assert.doesNotMatch(md, /\b(is|=|:)\s*CWE-89\b/i, 'must NOT label NoSQL injection AS CWE-89 (that is SQL)');
    assert.match(md, /8\.0\.27|8\.2\.12|mongodb 7\.5|pymongo 4\.17/i, 'expected a MongoDB 8.x server / driver version token');
  });

  it('arangodb names AQL, bind parameter, traversal depth, edge collection and CWE-943', () => {
    const md = read(GUIDES.arangodb);
    assert.match(md, /\bAQL\b/, 'expected AQL query-language content');
    assert.match(md, /bind parameter/i, 'expected AQL bind-parameter content');
    assert.match(md, /traversal/i, 'expected traversal-depth content');
    assert.match(md, /edge collection/i, 'expected edge-collection content');
    assert.match(md, /persistent index|@index|ensureIndex/i, 'expected index-required content');
    assert.match(md, /RBAC|permission/i, 'expected RBAC / permission content');
    assert.match(md, /CWE-943/, 'expected the CWE-943 AQL-injection token');
    assert.doesNotMatch(md, /\b(is|=|:)\s*CWE-89\b/i, 'must NOT label AQL injection AS CWE-89 (that is SQL)');
    assert.match(md, /3\.12|python-arango 8\.3/i, 'expected an ArangoDB 3.12 / python-arango 8.3.x version token');
  });

  it('neo4j names Cypher, MERGE, cartesian product, supernode and CWE-943', () => {
    const md = read(GUIDES.neo4j);
    assert.match(md, /Cypher/, 'expected Cypher query-language content');
    assert.match(md, /\bMERGE\b/, 'expected MERGE-semantics / duplicate content');
    assert.match(md, /cartesian product/i, 'expected cartesian-product content');
    assert.match(md, /supernode|super.?node/i, 'expected supernode-hotspot content');
    assert.match(md, /\$\w+|\$param|parameter/i, 'expected $param parameterized-query content');
    assert.match(md, /PROFILE|EXPLAIN/, 'expected PROFILE / EXPLAIN content');
    assert.match(md, /CWE-943/, 'expected the CWE-943 Cypher-injection token');
    assert.doesNotMatch(md, /\b(is|=|:)\s*CWE-89\b/i, 'must NOT label Cypher injection AS CWE-89 (that is SQL)');
    assert.match(md, /2026\.06|5\.26|neo4j 6\.2/i, 'expected a Neo4j 2026.06 / 5.26 LTS / driver 6.2.x version token');
  });

  it('dgraph names DQL, @index, upsert, transaction conflict and ACL', () => {
    const md = read(GUIDES.dgraph);
    assert.match(md, /\bDQL\b/, 'expected DQL query-language content');
    assert.match(md, /@index/, 'expected @index predicate-indexing content');
    assert.match(md, /upsert/i, 'expected upsert-block content');
    assert.match(md, /@reverse/, 'expected @reverse reverse-edge content');
    assert.match(md, /transaction conflict|conflict|linearizable/i, 'expected transaction-conflict / read-consistency content');
    assert.match(md, /\bACL\b/, 'expected ACL content');
    assert.match(md, /GraphQL/, 'expected GraphQL / DQL API content');
    assert.match(md, /v?25\.3|pydgraph 25\.2/i, 'expected a Dgraph v25.3.x / pydgraph 25.2.x version token');
  });
});
