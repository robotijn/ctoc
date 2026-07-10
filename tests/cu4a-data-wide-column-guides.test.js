/**
 * CU4a s20 — content-contract tests for the wide-column & multi-model NoSQL
 * framework guides (cassandra.md, scylladb.md, dynamodb.md, couchbase.md).
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
 * sources at edit time (pypi.org JSON API for cassandra-driver / scylla-driver /
 * boto3 / couchbase, dlcdn.apache.org for Cassandra server releases,
 * github.com/scylladb/scylladb release tags, docs.aws.amazon.com for DynamoDB
 * service quotas, cwe.mitre.org/89 and cwe.mitre.org/943). This test does NOT
 * re-verify the facts online; it guards the substance against a future edit
 * dropping it.
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
  cassandra: 'skills/frameworks/data/cassandra.md',
  scylladb: 'skills/frameworks/data/scylladb.md',
  dynamodb: 'skills/frameworks/data/dynamodb.md',
  couchbase: 'skills/frameworks/data/couchbase.md',
};

// Sections every de-stubbed correction surface must carry (case-insensitive).
const REQUIRED_SECTIONS = [
  { name: 'Footgun/Modeling/Data-model', re: /^##.*(footgun|modeling|data.?model|partition|concurren|memory)/im },
  { name: 'Consistency/Correctness', re: /^##.*(consistency|correctness|cost|throughput|pitfall)/im },
  { name: 'Security', re: /^##.*security/im },
  { name: 'Testing', re: /^##.*test/im },
  { name: 'Performance', re: /^##.*performance/im },
  { name: 'Version-specific', re: /^##.*version/im },
  { name: 'References', re: /^##.*(reference|source)/im },
];

function sectionCount(md) {
  return (md.match(/^## /gm) || []).length;
}

describe('CU4a s20 — wide-column & multi-model NoSQL guides are substantive (real files, zero doubles)', () => {
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

  it('cassandra names partition key, tombstone, ALLOW FILTERING, consistency and CWE-89', () => {
    const md = read(GUIDES.cassandra);
    assert.match(md, /partition key/i, 'expected partition-key design content');
    assert.match(md, /tombstone/i, 'expected tombstone / gc_grace_seconds content');
    assert.match(md, /ALLOW FILTERING/, 'expected ALLOW FILTERING full-scan content');
    assert.match(md, /gc_grace_seconds/i, 'expected gc_grace_seconds content');
    assert.match(md, /LOCAL_QUORUM/i, 'expected LOCAL_QUORUM consistency content');
    assert.match(md, /lightweight transaction|LWT|IF NOT EXISTS/i, 'expected lightweight-transaction content');
    assert.match(md, /CWE-89/, 'expected the CWE-89 CQL-injection token');
    assert.match(md, /5\.0\.8|cassandra-driver 3\.30|3\.30\.1/i, 'expected a Cassandra 5.0.x / driver 3.30.x version token');
  });

  it('scylladb names partition key, shard-aware, tombstone, ALLOW FILTERING and CWE-89', () => {
    const md = read(GUIDES.scylladb);
    assert.match(md, /partition key/i, 'expected partition-key design content');
    assert.match(md, /shard.?aware/i, 'expected shard-aware driver content');
    assert.match(md, /tombstone/i, 'expected tombstone content');
    assert.match(md, /ALLOW FILTERING/, 'expected ALLOW FILTERING full-scan content');
    assert.match(md, /LOCAL_QUORUM|consistency/i, 'expected tunable-consistency content');
    assert.match(md, /LWT|lightweight transaction/i, 'expected LWT cost content');
    assert.match(md, /CWE-89/, 'expected the CWE-89 CQL-injection token');
    assert.match(md, /2026\.1|2026\.2|scylla-driver 3\.29|3\.29\.11/i, 'expected a ScyllaDB 2026.x / driver 3.29.x version token');
  });

  it('dynamodb names single-table, GSI, Scan, hot partition and RCU/WCU', () => {
    const md = read(GUIDES.dynamodb);
    assert.match(md, /single.?table/i, 'expected single-table design content');
    assert.match(md, /\bGSI\b/, 'expected GSI projection content');
    assert.match(md, /\bScan\b/, 'expected Scan-vs-Query content');
    assert.match(md, /hot.?partition/i, 'expected hot-partition throttling content');
    assert.match(md, /RCU|WCU|on.?demand/i, 'expected RCU/WCU capacity content');
    assert.match(md, /400\s?KB/i, 'expected the 400 KB item-size limit');
    assert.match(md, /IAM|condition expression|least.?privilege/i, 'expected IAM least-privilege content');
    assert.match(md, /boto3 1\.43|1\.43\.45|SDK v3/i, 'expected a boto3 1.43.x / SDK v3 version token');
  });

  it('couchbase names N1QL, scan_consistency, CWE-943, scopes/collections and index', () => {
    const md = read(GUIDES.couchbase);
    assert.match(md, /N1QL|SQL\+\+/i, 'expected N1QL / SQL++ content');
    assert.match(md, /scan_consistency/, 'expected scan_consistency staleness content');
    assert.match(md, /request_plus/i, 'expected request_plus consistency content');
    assert.match(md, /scope|collection/i, 'expected scopes/collections content');
    assert.match(md, /GSI|CREATE INDEX|primary index/i, 'expected index-required content');
    assert.match(md, /durability|majority/i, 'expected durability (majority) content');
    assert.match(md, /parameter|\$/, 'expected parameterized-N1QL content');
    assert.match(md, /CWE-943/, 'expected the CWE-943 NoSQL-injection token');
    assert.match(md, /7\.6|couchbase 4\.6|4\.6\.2/i, 'expected a Couchbase 7.x / python SDK 4.6.x version token');
  });
});
