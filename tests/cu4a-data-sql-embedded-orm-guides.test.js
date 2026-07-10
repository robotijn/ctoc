/**
 * CU4a s18 — content-contract tests for the embedded-SQL, time-series & ORM
 * framework guides (sqlite.md, timescaledb.md, sqlalchemy.md, alembic.md,
 * drizzle.md).
 *
 * ZERO DOUBLES: this reads the REAL guide files off disk via fs.readFileSync
 * (mirroring tests/cu3-data-guides.test.js and the sibling CU4a content tests)
 * and asserts substantive structure — no mocks, no fixtures, no fakes. It guards
 * the CU4a acceptance criteria for these five files:
 *   - each guide exceeds the 5-section template floor (> 5 "## " sections);
 *   - each guide is well past the ~55-line stub floor (> 120 lines);
 *   - the required correction-surface sections are present (footgun/concurrency/
 *     memory, Error Handling / Correctness, Security, Testing, Performance,
 *     Version, References);
 *   - each guide carries >= 4 code fences (>= 2 single-framework examples);
 *   - at least one dated source (>= 2025) with an http URL is present per guide;
 *   - the original H1 "# <Framework> CTO" header is intact (skills.json indexing);
 *   - each guide names its own concrete framework identifiers proving substance.
 *
 * Every version/security fact these guides assert is web-verified against official
 * sources at edit time (sqlite.org releaselog + stricttables, github.com/timescale/
 * timescaledb releases, pypi.org JSON API for SQLAlchemy + alembic, registry.npmjs.org
 * for drizzle-orm / drizzle-kit, and cwe.mitre.org/89). This test does NOT re-verify
 * the facts online; it guards the substance against a future edit dropping it.
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
  sqlite: 'skills/frameworks/data/sqlite.md',
  timescaledb: 'skills/frameworks/data/timescaledb.md',
  sqlalchemy: 'skills/frameworks/data/sqlalchemy.md',
  alembic: 'skills/frameworks/data/alembic.md',
  drizzle: 'skills/frameworks/data/drizzle.md',
};

// Sections every de-stubbed correction surface must carry (case-insensitive).
const REQUIRED_SECTIONS = [
  { name: 'Footgun/Concurrency/Memory', re: /^##.*(footgun|concurren|memory|hypertable|migration|orm|query|lock)/im },
  { name: 'Correctness/Error Handling', re: /^##.*(correctness|error.?handling|pitfall|safety)/im },
  { name: 'Security', re: /^##.*security/im },
  { name: 'Testing', re: /^##.*test/im },
  { name: 'Performance', re: /^##.*performance/im },
  { name: 'Version-specific', re: /^##.*version/im },
  { name: 'References', re: /^##.*(reference|source)/im },
];

function sectionCount(md) {
  return (md.match(/^## /gm) || []).length;
}

describe('CU4a s18 — embedded-SQL, time-series & ORM guides are substantive (real files, zero doubles)', () => {
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

  it('sqlite names WAL, SQLITE_BUSY, busy_timeout, type affinity, STRICT and CWE-89', () => {
    const md = read(GUIDES.sqlite);
    assert.match(md, /\bWAL\b/, 'expected WAL-mode concurrency content');
    assert.match(md, /SQLITE_BUSY/, 'expected SQLITE_BUSY single-writer content');
    assert.match(md, /busy_timeout/, 'expected busy_timeout content');
    assert.match(md, /affinity/i, 'expected type-affinity surprise content');
    assert.match(md, /\bSTRICT\b/, 'expected STRICT-table content');
    assert.match(md, /foreign_keys/i, 'expected PRAGMA foreign_keys content');
    assert.match(md, /CWE-89/, 'expected the CWE-89 SQL-injection token');
    assert.match(md, /3\.53|3\.53\.3|3\.37/, 'expected a SQLite 3.53.x / 3.37 version token');
  });

  it('timescaledb names hypertable, chunk_time_interval, time_bucket, continuous aggregate, compression and CWE-89', () => {
    const md = read(GUIDES.timescaledb);
    assert.match(md, /hypertable/i, 'expected hypertable content');
    assert.match(md, /chunk_time_interval/, 'expected chunk_time_interval sizing content');
    assert.match(md, /time_bucket/, 'expected time_bucket alignment content');
    assert.match(md, /continuous aggregate/i, 'expected continuous-aggregate content');
    assert.match(md, /compress/i, 'expected compression-policy content');
    assert.match(md, /retention/i, 'expected retention-policy content');
    assert.match(md, /CWE-89/, 'expected the CWE-89 SQL-injection token');
    assert.match(md, /2\.28|2\.28\.2/, 'expected a TimescaleDB 2.28.x version token');
  });

  it('sqlalchemy names selectinload, N+1, 2.0, session, text() and CWE-89', () => {
    const md = read(GUIDES.sqlalchemy);
    assert.match(md, /selectinload/, 'expected selectinload eager-loading content');
    assert.match(md, /N\+1/, 'expected N+1 lazy-loading content');
    assert.match(md, /joinedload/, 'expected joinedload content');
    assert.match(md, /\b2\.0\b/, 'expected 2.0-style select() content');
    assert.match(md, /expire_on_commit/, 'expected identity-map / expire_on_commit content');
    assert.match(md, /text\(/, 'expected text() raw-SQL content');
    assert.match(md, /CWE-89/, 'expected the CWE-89 SQL-injection token');
    assert.match(md, /2\.0\.51|2\.0\b/, 'expected a SQLAlchemy 2.0.x version token');
  });

  it('alembic names autogenerate, down_revision, batch, offline and CWE-89', () => {
    const md = read(GUIDES.alembic);
    assert.match(md, /autogenerate/i, 'expected autogenerate-misses content');
    assert.match(md, /down_revision/, 'expected down_revision chain content');
    assert.match(md, /batch/i, 'expected batch-mode SQLite ALTER content');
    assert.match(md, /offline/i, 'expected offline-vs-online content');
    assert.match(md, /data migration/i, 'expected data-migration content');
    assert.match(md, /CWE-89/, 'expected the CWE-89 SQL-injection token');
    assert.match(md, /1\.18|1\.18\.5/, 'expected an Alembic 1.18.x version token');
  });

  it('drizzle names sql.raw, sql template, drizzle-kit, generate/migrate and CWE-89', () => {
    const md = read(GUIDES.drizzle);
    assert.match(md, /sql\.raw/, 'expected sql.raw injection content');
    assert.match(md, /sql`|sql template|tagged template/i, 'expected parameterized sql`` template content');
    assert.match(md, /drizzle-kit/, 'expected drizzle-kit migration content');
    assert.match(md, /generate|migrate/i, 'expected generate/migrate-not-push content');
    assert.match(md, /prepare|prepared/i, 'expected prepared-statement content');
    assert.match(md, /CWE-89/, 'expected the CWE-89 SQL-injection token');
    assert.match(md, /0\.45|0\.45\.2|0\.31/, 'expected a drizzle-orm 0.45.x / drizzle-kit 0.31.x version token');
  });
});
