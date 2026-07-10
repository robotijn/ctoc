/**
 * CU4a s16 — content-contract tests for the DataFrame & parallel-compute guides
 * (polars.md, dask.md, vaex.md under skills/frameworks/data/).
 *
 * ZERO DOUBLES: this reads the REAL guide files off disk via fs.readFileSync
 * (mirroring tests/cu3-data-guides.test.js and
 * tests/cu4a-data-query-engines-guides.test.js). No mocks, no fixtures, no
 * fakes. It guards the CU4a acceptance criteria for these three files:
 *   - each guide exceeds the 5-section template floor (> 5 "## " sections);
 *   - each guide is well past the ~55-line stub floor (> 120 lines);
 *   - the required correction-surface sections are present (a footgun/
 *     memory/lazy/partition section, Error Handling, Security/Dependency,
 *     Testing, Performance, Version-specific, References);
 *   - each guide carries >= 4 code fences (>= 2 fenced single-framework
 *     examples);
 *   - at least one dated source (>= 2025) with an http URL is present per guide;
 *   - each guide cites a real MITRE CWE authority URL (cwe.mitre.org);
 *   - the original "# <Framework> CTO" H1 header is intact (skills.json
 *     indexing);
 *   - each guide names its own concrete identifiers:
 *       polars -> LazyFrame + collect + with_columns + streaming engine +
 *                 expression API vs map_elements + CWE-89 (parameterized SQL) +
 *                 a current Polars 1.4x version token;
 *       dask   -> persist vs compute + partition sizing + shuffle + task-graph
 *                 blowup + CVE-2026-23528 / CWE-79 (dashboard XSS->RCE, fixed
 *                 distributed 2026.1.0) + a current Dask 2026.x version token;
 *       vaex   -> memory-mapped + virtual column + lazy + out-of-core +
 *                 groupby binning + maintenance-status note + a current Vaex
 *                 4.19.x version token.
 *
 * Every version / security fact these guides assert is web-verified against
 * official sources at edit time (pypi.org JSON API + github.com release APIs
 * for polars/dask/vaex, nvd.nist.gov / github advisories for the Dask CVE,
 * cwe.mitre.org for the CWE classes, and the official pola.rs / docs.dask.org /
 * vaex.io docs). This test does NOT re-verify the facts against the network; it
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
  polars: 'skills/frameworks/data/polars.md',
  dask: 'skills/frameworks/data/dask.md',
  vaex: 'skills/frameworks/data/vaex.md',
};

// Sections every de-stubbed correction surface must carry (case-insensitive).
// The first entry accepts the per-framework footgun/memory/lazy equivalent.
const REQUIRED_SECTIONS = [
  { name: 'Footgun/Memory/Lazy', re: /^##.*(footgun|memory|lazy|eager|partition|shuffle|out.?of.?core|streaming|virtual)/im },
  { name: 'Error Handling', re: /^##.*(error.?handling|error.?idiom|troubleshoot|correctness)/im },
  { name: 'Security/Dependency', re: /^##.*(security|dependenc|supply.?chain|auth|credential|exposure)/im },
  { name: 'Testing', re: /^##.*test/im },
  { name: 'Performance', re: /^##.*performance/im },
  { name: 'Version-specific', re: /^##.*version/im },
  { name: 'References', re: /^##.*(reference|source)/im },
];

function sectionCount(md) {
  return (md.match(/^## /gm) || []).length;
}

describe('CU4a s16 — DataFrame & parallel-compute guides are substantive (real files, zero doubles)', () => {
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

      it('keeps its original H1 header intact (skills.json indexing)', () => {
        const md = read(rel);
        assert.match(md, /^# .+CTO/m, 'expected the original "# <Framework> CTO" H1 header');
      });
    });
  }

  it('polars names LazyFrame, collect, with_columns, the streaming engine, expression-vs-UDF, CWE-89, and a current version', () => {
    const md = read(GUIDES.polars);
    assert.match(md, /LazyFrame/, 'expected the LazyFrame lazy-vs-eager type');
    assert.match(md, /collect/, 'expected .collect() materialization boundary');
    assert.match(md, /with_columns/, 'expected with_columns expression idiom');
    assert.match(md, /streaming/i, 'expected the streaming engine for larger-than-RAM');
    assert.match(md, /map_elements|apply/i, 'expected map_elements/apply Python-UDF parallelism footgun');
    assert.match(md, /read_database|scan|SQL/i, 'expected the SQL/read_database parameterization surface');
    assert.match(md, /CWE-89/, 'expected CWE-89 (SQL injection) named for parameterized reads');
    assert.match(md, /polars 1\.4[0-9]|1\.42\.[0-9]/i, 'expected a current Polars 1.4x version token');
  });

  it('dask names persist vs compute, partition sizing, shuffle, task-graph blowup, CVE-2026-23528/CWE-79, and a current version', () => {
    const md = read(GUIDES.dask);
    assert.match(md, /persist/, 'expected persist vs compute distinction');
    assert.match(md, /compute/, 'expected .compute() materialization boundary');
    assert.match(md, /partition/i, 'expected partition-sizing footgun');
    assert.match(md, /shuffle/i, 'expected shuffle cost on groupby/merge');
    assert.match(md, /task.?graph|graph.?blow/i, 'expected task-graph blowup footgun');
    assert.match(md, /spill/i, 'expected worker-memory spilling');
    assert.match(md, /CVE-2026-23528/, 'expected the Dask distributed dashboard XSS->RCE CVE id');
    assert.match(md, /CWE-79/, 'expected CWE-79 (XSS) named');
    assert.match(md, /2026\.1\.0/, 'expected the fixed distributed 2026.1.0 version');
    assert.match(md, /dask 2026\.[0-9]|2026\.7\.[0-9]/i, 'expected a current Dask 2026.x version token');
  });

  it('vaex names memory-mapped, virtual column, lazy, out-of-core, groupby binning, maintenance status, and a current version', () => {
    const md = read(GUIDES.vaex);
    assert.match(md, /memory.?mapped/i, 'expected memory-mapped HDF5/Arrow open');
    assert.match(md, /virtual column/i, 'expected virtual-columns lazy expressions');
    assert.match(md, /lazy/i, 'expected lazy evaluation / expression caching');
    assert.match(md, /out.?of.?core/i, 'expected out-of-core larger-than-RAM correctness');
    assert.match(md, /binn?ing|binby/i, 'expected groupby/binby binning footgun');
    assert.match(md, /maintenance|maintained/i, 'expected the maintenance-status note');
    assert.match(md, /vaex 4\.19|4\.19\.[0-9]/i, 'expected a current Vaex 4.19.x version token');
  });
});
