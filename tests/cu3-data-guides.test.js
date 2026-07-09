/**
 * CU3 s4 — content-contract tests for the data-tier framework guides
 * (pandas.md, numpy.md, prisma.md).
 *
 * ZERO DOUBLES: this reads the REAL guide files off disk via fs.readFileSync
 * (mirroring tests/cu3-ai-ml-deeplearning-guides.test.js and
 * tests/cu2-dynamic-web-guides.test.js) and asserts substantive structure —
 * no mocks, no fixtures, no fakes. It guards the CU3 acceptance criteria for
 * these three files:
 *   - each guide exceeds the 5-section template floor (> 5 "## " sections);
 *   - the required correction-surface sections are present (Error Handling,
 *     Security/footgun, Testing, Performance, Version, References);
 *   - each guide names its own concrete data-correctness identifiers
 *     (SettingWithCopyWarning / Copy-on-Write; broadcasting / NEP 50; N+1 /
 *     $queryRaw), plus the web-verified current version token;
 *   - prisma names the CWE-89 SQL-injection class ($queryRawUnsafe vs the
 *     parameterized tagged-template form);
 *   - at least one dated source (>= 2025) with an http URL is present per guide;
 *   - the original H1 "# <Framework> CTO" header is intact (skills.json indexing).
 *
 * Every version/security fact these guides assert is web-verified against official
 * sources at edit time (pypi.org JSON API for pandas/numpy, registry.npmjs.org for
 * prisma/@prisma/client, pandas.pydata.org, numpy.org/neps, prisma.io docs,
 * cwe.mitre.org/89). This test does NOT re-verify the facts; it guards the
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
  pandas: 'skills/frameworks/data/pandas.md',
  numpy: 'skills/frameworks/data/numpy.md',
  prisma: 'skills/frameworks/data/prisma.md',
};

// Sections every de-stubbed correction surface must carry (case-insensitive).
const REQUIRED_SECTIONS = [
  { name: 'Error Handling', re: /^##.*error.?handling/im },
  { name: 'Security/Footgun', re: /^##.*(security|dependenc|injection|footgun|correctness|aliasing|indexing)/im },
  { name: 'Testing', re: /^##.*test/im },
  { name: 'Performance', re: /^##.*performance/im },
  { name: 'Version-specific', re: /^##.*version/im },
  { name: 'References', re: /^##.*(reference|source)/im },
];

function sectionCount(md) {
  return (md.match(/^## /gm) || []).length;
}

describe('CU3 s4 — data-tier guides are substantive (real files, zero doubles)', () => {
  for (const [fw, rel] of Object.entries(GUIDES)) {
    describe(`${fw} (${rel})`, () => {
      it('exceeds the 5-section template floor (> 5 "## " sections)', () => {
        const md = read(rel);
        const n = sectionCount(md);
        assert.ok(n > 5, `expected > 5 "## " sections, found ${n}`);
      });

      it('is well past the ~55-line stub floor', () => {
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

      it('carries at least two fenced code examples (footgun demos)', () => {
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

  it('pandas names SettingWithCopyWarning, Copy-on-Write, chained indexing, and a version token', () => {
    const md = read(GUIDES.pandas);
    assert.match(md, /SettingWithCopyWarning/, 'expected SettingWithCopyWarning content');
    assert.match(md, /Copy-on-Write|copy_on_write/i, 'expected Copy-on-Write content');
    assert.match(md, /chained.?index/i, 'expected chained-indexing footgun content');
    assert.match(md, /\.loc\[/, 'expected the .loc[] correct pattern');
    assert.match(md, /pandas 3|pandas 2/i, 'expected a pandas version token (2.x/3.x)');
    assert.match(md, /groupby|observed=/i, 'expected groupby gotcha content');
  });

  it('numpy names broadcasting, view-vs-copy, NEP 50 dtype promotion, and a 2.x token', () => {
    const md = read(GUIDES.numpy);
    assert.match(md, /broadcasting/i, 'expected broadcasting footgun content');
    assert.match(md, /view.{0,10}copy|copy.{0,10}view/i, 'expected view-vs-copy aliasing content');
    assert.match(md, /NEP.?50/i, 'expected NEP 50 dtype-promotion content');
    assert.match(md, /overflow|wrap.?around/i, 'expected integer-overflow content');
    assert.match(md, /assert_allclose|assert_array_equal/, 'expected numpy testing content');
    assert.match(md, /numpy 2/i, 'expected a numpy 2.x version token');
  });

  it('prisma names N+1, $queryRaw injection with CWE-89, migrations, and a version token', () => {
    const md = read(GUIDES.prisma);
    assert.match(md, /N\+1/, 'expected N+1 query content');
    assert.match(md, /\$queryRaw/, 'expected $queryRaw raw-query content');
    assert.match(md, /\$queryRawUnsafe/, 'expected $queryRawUnsafe unsafe-form content');
    assert.match(md, /CWE-89/, 'expected the CWE-89 SQL-injection token');
    assert.match(md, /migrate deploy|migrate dev/, 'expected migration-safety content');
    assert.match(md, /connection.?limit|connection.?pool/i, 'expected connection-pool content');
    assert.match(md, /prisma 7|@prisma\/client/i, 'expected a Prisma version token');
  });
});
