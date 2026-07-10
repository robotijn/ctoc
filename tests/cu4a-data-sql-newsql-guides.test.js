/**
 * CU4a s17 — content-contract tests for the distributed & serverless SQL
 * framework guides (cockroachdb.md, planetscale.md, neon.md, supabase.md).
 *
 * ZERO DOUBLES: this reads the REAL guide files off disk via fs.readFileSync
 * (mirroring tests/cu3-data-guides.test.js) and asserts substantive structure —
 * no mocks, no fixtures, no fakes. It guards the CU4a acceptance criteria for
 * these four files:
 *   - each guide exceeds the 5-section template floor (> 5 "## " sections);
 *   - each guide is well past the ~55-line stub floor (> 120 lines);
 *   - the required correction-surface sections are present (a footgun/concurrency
 *     section, Error Handling, Security/Dependency, Testing, Performance,
 *     Version-specific, References);
 *   - at least four fenced code examples (>= 2 single-framework blocks) per guide;
 *   - at least one dated source (>= 2025) with an http URL is present per guide;
 *   - the original H1 "# <Framework> CTO" header is intact (skills.json indexing);
 *   - each guide names its own concrete distributed/serverless identifiers:
 *       cockroachdb: 40001 · retry · AS OF SYSTEM TIME
 *       planetscale: deploy request · foreign key · CWE-89
 *       neon:        pooler · scale-to-zero · RLS
 *       supabase:    RLS · service_role · CWE-284
 *
 * Every version/security fact these guides assert is web-verified against official
 * sources at edit time (GitHub releases for cockroachdb, registry.npmjs.org for
 * @supabase/supabase-js / @neondatabase/serverless / @planetscale/database,
 * cockroachlabs.com / planetscale.com / neon.com / supabase.com docs, and
 * cwe.mitre.org for CWE-89/CWE-284/CWE-798). This test does NOT re-verify the
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
  cockroachdb: 'skills/frameworks/data/cockroachdb.md',
  planetscale: 'skills/frameworks/data/planetscale.md',
  neon: 'skills/frameworks/data/neon.md',
  supabase: 'skills/frameworks/data/supabase.md',
};

// Sections every de-stubbed correction surface must carry (case-insensitive).
const REQUIRED_SECTIONS = [
  { name: 'Footgun/Concurrency', re: /^##.*(footgun|transaction|retry|concurren|serverless|rls|connection|schema)/im },
  { name: 'Error Handling', re: /^##.*error.?handling/im },
  { name: 'Security/Dependency', re: /^##.*(security|dependenc|injection|access.?control|credential|footgun)/im },
  { name: 'Testing', re: /^##.*test/im },
  { name: 'Performance', re: /^##.*performance/im },
  { name: 'Version-specific', re: /^##.*version/im },
  { name: 'References', re: /^##.*(reference|source)/im },
];

function sectionCount(md) {
  return (md.match(/^## /gm) || []).length;
}

describe('CU4a s17 — distributed & serverless SQL guides are substantive (real files, zero doubles)', () => {
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

      it('carries at least four fenced code examples (>= 2 blocks)', () => {
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

  it('cockroachdb names the 40001 retry error, client-side retry loop, and AS OF SYSTEM TIME', () => {
    const md = read(GUIDES.cockroachdb);
    assert.match(md, /40001/, 'expected the 40001 serialization-failure retry-error token');
    assert.match(md, /retry/i, 'expected client-side retry-loop content');
    assert.match(md, /AS OF SYSTEM TIME/, 'expected AS OF SYSTEM TIME follower-read content');
    assert.match(md, /hash.?sharded|UUID|hot.?range/i, 'expected hot-range / hash-sharded content');
    assert.match(md, /CWE-89/, 'expected the CWE-89 SQL-injection token');
    assert.match(md, /v2[56]\.\d|v25\.\d/i, 'expected a current CockroachDB version token (v25.x/v26.x)');
  });

  it('planetscale names deploy requests, no-foreign-key Vitess, sharding, and CWE-89', () => {
    const md = read(GUIDES.planetscale);
    assert.match(md, /deploy request/i, 'expected deploy-request schema-change content');
    assert.match(md, /foreign key/i, 'expected no-foreign-key Vitess content');
    assert.match(md, /vitess/i, 'expected Vitess sharding content');
    assert.match(md, /CWE-89/, 'expected the CWE-89 SQL-injection token');
    assert.match(md, /@planetscale\/database/, 'expected the serverless HTTP driver token');
    assert.match(md, /branch/i, 'expected branching workflow content');
  });

  it('neon names the pooler, scale-to-zero cold start, RLS, and connection-per-request', () => {
    const md = read(GUIDES.neon);
    assert.match(md, /pooler|pgbouncer/i, 'expected pooler / PgBouncer content');
    assert.match(md, /scale.?to.?zero|cold.?start/i, 'expected scale-to-zero cold-start content');
    assert.match(md, /\bRLS\b|row.?level.?security/i, 'expected RLS content');
    assert.match(md, /CWE-89/, 'expected the CWE-89 SQL-injection token');
    assert.match(md, /branch/i, 'expected copy-on-write branching content');
    assert.match(md, /@neondatabase\/serverless/, 'expected the serverless driver token');
  });

  it('supabase names RLS as the auth boundary, service_role bypass, and CWE-284', () => {
    const md = read(GUIDES.supabase);
    assert.match(md, /\bRLS\b|row.?level.?security/i, 'expected RLS auth-boundary content');
    assert.match(md, /service_role/, 'expected service_role key-separation content');
    assert.match(md, /CWE-284/, 'expected the CWE-284 broken-access-control token');
    assert.match(md, /CWE-798/, 'expected the CWE-798 hard-coded-credentials token');
    assert.match(md, /auth\.uid\(\)/, 'expected the auth.uid() RLS policy content');
    assert.match(md, /supavisor|pooler/i, 'expected Supavisor pooler content');
  });
});
