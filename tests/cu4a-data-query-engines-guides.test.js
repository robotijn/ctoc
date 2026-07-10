/**
 * CU4a s14 — content-contract tests for the distributed SQL query-engine &
 * time-series guides (trino.md, presto.md, questdb.md under
 * skills/frameworks/data/).
 *
 * ZERO DOUBLES: this reads the REAL guide files off disk via fs.readFileSync
 * (mirroring tests/cu4a-aiml-serving-compute-guides.test.js and
 * tests/cu3-data-guides.test.js). No mocks, no fixtures, no fakes. It guards the
 * CU4a acceptance criteria for these three files:
 *   - each guide exceeds the 5-section template floor (> 5 "## " sections);
 *   - each guide is well past the ~55-line stub floor (> 120 lines);
 *   - the required correction-surface sections are present (a footgun/
 *     memory/time-series section, Error Handling, Security/Dependency, Testing,
 *     Performance, Version-specific, References);
 *   - each guide carries >= 4 code fences (>= 2 fenced single-framework examples);
 *   - at least one dated source (>= 2025) with an http URL is present per guide;
 *   - each guide cites a real MITRE CWE authority URL (cwe.mitre.org);
 *   - the original "# <Framework> CTO" H1 header is intact (skills.json indexing);
 *   - each guide names its own concrete identifiers and a real MITRE CWE class:
 *       trino   -> query.max-memory-per-node + spill + pushdown +
 *                  CWE-89 (parameterized SQL) + CVE-2026-34214 / CWE-312
 *                  (Iceberg REST catalog credential exposure, fixed v480);
 *       presto  -> resource group + pushdown + PrestoDB-vs-Trino divergence +
 *                  CWE-89 + PrestoDB 0.298 version token;
 *       questdb -> designated timestamp + out-of-order (O3) + ILP + SAMPLE BY +
 *                  DEDUP + CWE-89 + CVE-2026-0824 / CWE-79 (Web Console XSS).
 *
 * Every version / security fact these guides assert is web-verified against
 * official sources at edit time (github.com release APIs for trino/presto/questdb,
 * nvd.nist.gov for the CVEs, cwe.mitre.org for the CWE classes, and the official
 * trino.io / prestodb.io / questdb.io docs). This test does NOT re-verify the
 * facts against the network; it guards the substance against a future edit
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
  trino: 'skills/frameworks/data/trino.md',
  presto: 'skills/frameworks/data/presto.md',
  questdb: 'skills/frameworks/data/questdb.md',
};

// Sections every de-stubbed correction surface must carry (case-insensitive).
// The first entry accepts the per-framework footgun/memory/time-series equivalent.
const REQUIRED_SECTIONS = [
  { name: 'Footgun/Memory/Time-series', re: /^##.*(footgun|memory|spill|join|pushdown|resource|time.?series|ingest|out.?of.?order)/im },
  { name: 'Error Handling', re: /^##.*(error.?handling|error.?idiom|troubleshoot|correctness)/im },
  { name: 'Security/Dependency', re: /^##.*(security|dependenc|supply.?chain|auth|credential)/im },
  { name: 'Testing', re: /^##.*test/im },
  { name: 'Performance', re: /^##.*performance/im },
  { name: 'Version-specific', re: /^##.*version/im },
  { name: 'References', re: /^##.*(reference|source)/im },
];

function sectionCount(md) {
  return (md.match(/^## /gm) || []).length;
}

describe('CU4a s14 — distributed SQL query-engine & time-series guides are substantive (real files, zero doubles)', () => {
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

      it('cites a real MITRE CWE authority URL', () => {
        const md = read(rel);
        assert.match(md, /cwe\.mitre\.org/, 'expected the cwe.mitre.org authority URL');
      });

      it('names the SQL-injection class CWE-89 (parameterized queries)', () => {
        const md = read(rel);
        assert.match(md, /CWE-89/, 'expected CWE-89 (SQL injection) named');
      });

      it('keeps its original H1 header intact (skills.json indexing)', () => {
        const md = read(rel);
        assert.match(md, /^# .+CTO/m, 'expected the original "# <Framework> CTO" H1 header');
      });
    });
  }

  it('trino names max-memory-per-node, spill, pushdown, CVE-2026-34214/CWE-312, and a current version', () => {
    const md = read(GUIDES.trino);
    assert.match(md, /max-memory-per-node/, 'expected the query.max-memory-per-node knob');
    assert.match(md, /spill/i, 'expected spill-to-disk footgun');
    assert.match(md, /pushdown/i, 'expected predicate/projection pushdown correctness');
    assert.match(md, /broadcast|partitioned|distribution/i, 'expected broadcast vs partitioned join distribution');
    assert.match(md, /dynamic.?filter/i, 'expected dynamic filtering');
    assert.match(md, /CVE-2026-34214/, 'expected the Iceberg REST catalog credential CVE id');
    assert.match(md, /CWE-312/, 'expected CWE-312 (cleartext credential exposure) named');
    assert.match(md, /trino 48[0-9]|trino 4[89][0-9]/i, 'expected a current Trino 48x version token');
  });

  it('presto names resource group, pushdown, PrestoDB-vs-Trino divergence, and a current version', () => {
    const md = read(GUIDES.presto);
    assert.match(md, /resource group/i, 'expected resource-groups memory-limit footgun');
    assert.match(md, /pushdown/i, 'expected connector pushdown correctness');
    assert.match(md, /max-memory-per-node|query_max_memory_per_node/i, 'expected per-node memory limit');
    assert.match(md, /trino/i, 'expected PrestoDB-vs-Trino divergence warning');
    assert.match(md, /velox/i, 'expected the Velox vectorized-execution note');
    assert.match(md, /presto 0\.29[0-9]|0\.298/i, 'expected a current PrestoDB 0.29x version token');
  });

  it('questdb names designated timestamp, O3, ILP, SAMPLE BY, DEDUP, and CVE-2026-0824/CWE-79', () => {
    const md = read(GUIDES.questdb);
    assert.match(md, /designated timestamp/i, 'expected designated-timestamp requirement');
    assert.match(md, /out.?of.?order|\bO3\b/i, 'expected out-of-order (O3) ingestion cost');
    assert.match(md, /\bILP\b/, 'expected ILP (InfluxDB line protocol) ingestion');
    assert.match(md, /SAMPLE BY/, 'expected SAMPLE BY downsampling alignment');
    assert.match(md, /ASOF/i, 'expected ASOF join alignment');
    assert.match(md, /DEDUP/i, 'expected DEDUP idempotent-ingestion keys');
    assert.match(md, /PARTITION BY/i, 'expected partition-by unit footgun');
    assert.match(md, /CVE-2026-0824/, 'expected the Web Console XSS CVE id');
    assert.match(md, /CWE-79/, 'expected CWE-79 (XSS) named');
    assert.match(md, /questdb 9\.[0-9]|9\.4\.[0-9]/i, 'expected a current QuestDB 9.x version token');
  });
});
