/**
 * CU4a s15 — content-contract tests for the open table & columnar lake-format
 * framework guides (iceberg.md, hudi.md, delta-lake.md, arrow.md).
 *
 * ZERO DOUBLES: this reads the REAL guide files off disk via fs.readFileSync
 * (mirroring tests/cu3-data-guides.test.js) and asserts substantive structure —
 * no mocks, no fixtures, no fakes. It guards the CU4a acceptance criteria for
 * these four files:
 *   - each guide exceeds the 5-section template floor (> 5 "## " sections);
 *   - each guide is well past the ~55-line stub floor (> 120 lines);
 *   - the required correction-surface sections are present (a footgun/memory
 *     section, Concurrency/Correctness, Security, Testing, Performance, Version,
 *     References);
 *   - each guide names its own concrete lake-format identifiers
 *     (iceberg: snapshot / expire_snapshots / merge-on-read;
 *      hudi: Merge-on-Read / PRECOMBINE / compaction;
 *      delta-lake: VACUUM / OPTIMIZE / _delta_log;
 *      arrow: zero-copy / to_pandas / RecordBatch);
 *   - at least one dated source (>= 2025) with an http URL is present per guide;
 *   - at least 4 code fences (>= 2 fenced single-framework examples) per guide;
 *   - the original H1 "# <Framework> CTO" header is intact (skills.json indexing).
 *
 * Every version/security fact these guides assert is web-verified against official
 * sources at edit time (pypi.org JSON API for pyiceberg/delta-spark/pyarrow,
 * GitHub releases for apache/iceberg, apache/hudi, delta-io/delta, apache/arrow,
 * and cwe.mitre.org / nvd.nist.gov for CVE-2023-47248, CVE-2026-25087,
 * CVE-2026-42812). This test does NOT re-verify the facts; it guards the
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
  iceberg: 'skills/frameworks/data/iceberg.md',
  hudi: 'skills/frameworks/data/hudi.md',
  'delta-lake': 'skills/frameworks/data/delta-lake.md',
  arrow: 'skills/frameworks/data/arrow.md',
};

// Sections every de-stubbed correction surface must carry (case-insensitive).
const REQUIRED_SECTIONS = [
  { name: 'Footgun/Memory', re: /^##.*(footgun|memory|table|concurrenc)/im },
  { name: 'Concurrency/Correctness', re: /^##.*(concurrenc|correctness|conflict|isolation)/im },
  { name: 'Security', re: /^##.*(security|credential|dependenc|acl|untrusted)/im },
  { name: 'Testing', re: /^##.*test/im },
  { name: 'Performance', re: /^##.*performance/im },
  { name: 'Version-specific', re: /^##.*version/im },
  { name: 'References', re: /^##.*(reference|source)/im },
];

// Per-framework concrete identifiers — proves substance, not padding.
const IDENTIFIERS = {
  iceberg: ['snapshot', 'expire_snapshots', 'merge-on-read'],
  hudi: ['Merge-on-Read', 'PRECOMBINE', 'compaction'],
  'delta-lake': ['VACUUM', 'OPTIMIZE', '_delta_log'],
  arrow: ['zero-copy', 'to_pandas', 'RecordBatch'],
};

// Original H1 headers (skills.json trigger indexing must stay intact).
const H1 = {
  iceberg: /^# Apache Iceberg CTO/m,
  hudi: /^# Apache Hudi CTO/m,
  'delta-lake': /^# Delta Lake CTO/m,
  arrow: /^# Apache Arrow CTO/m,
};

function sectionCount(md) {
  return (md.match(/^## /gm) || []).length;
}

function lineCount(md) {
  return md.split('\n').length;
}

function fenceCount(md) {
  return (md.match(/^```/gm) || []).length / 2;
}

describe('CU4a s15 — lake-format guides are substantive (real files, zero doubles)', () => {
  for (const [fw, rel] of Object.entries(GUIDES)) {
    describe(fw, () => {
      const md = read(rel);

      it('exceeds the 5-section template floor (> 5 "## " sections)', () => {
        const n = sectionCount(md);
        assert.ok(n > 5, `${fw}: expected > 5 "## " sections, found ${n}`);
      });

      it('is well past the ~55-line stub floor (> 120 lines)', () => {
        const n = lineCount(md);
        assert.ok(n > 120, `${fw}: expected > 120 lines, found ${n}`);
      });

      for (const section of REQUIRED_SECTIONS) {
        it(`has a ${section.name} section`, () => {
          assert.match(md, section.re, `${fw}: missing ${section.name} section`);
        });
      }

      it('has >= 4 code fences (>= 2 fenced single-framework examples)', () => {
        const n = fenceCount(md);
        assert.ok(n >= 4, `${fw}: expected >= 4 code fences, found ${n}`);
      });

      it('carries at least one dated source (>= 2025) and an http URL', () => {
        assert.match(md, /20(2[5-9]|[3-9]\d)/, `${fw}: no date token >= 2025 found`);
        assert.match(md, /https?:\/\//, `${fw}: no http(s) URL found`);
      });

      for (const id of IDENTIFIERS[fw]) {
        it(`names the concrete identifier "${id}"`, () => {
          assert.ok(
            md.includes(id),
            `${fw}: expected concrete identifier "${id}" to be present`
          );
        });
      }

      it('keeps the original H1 "# <Framework> CTO" header (skills.json indexing)', () => {
        assert.match(md, H1[fw], `${fw}: original H1 header missing/altered`);
      });
    });
  }

  it('all four guides exist and are non-empty', () => {
    for (const rel of Object.values(GUIDES)) {
      const md = read(rel);
      assert.ok(md.length > 0, `${rel} is empty`);
    }
  });
});
