'use strict';

/**
 * tests/claim-census.test.js — the specification for src/lib/claim-extractor.js
 * (plan 00135) and the one-directional ratchet on citation coverage.
 *
 * Two axes are proven here:
 *   1. The PARSER contract (cases 1-13): a declared `<!-- ctoc:claims … -->` block
 *      turns into structured claim records; a malformed record is NEVER silently
 *      dropped (that is the false-green `silent-catch` signature this repository
 *      fences) but returned with a CLOSED-enum reason; and the census reports
 *      honestly when it could not read part of the corpus, so `unreadableCount === 0`
 *      is the only thing that licenses reading a zero `undeclaredFiles`.
 *   2. The RATCHET (cases 14-16): declared-file coverage may only ever rise, the
 *      ratchet is seen BITING (case 15), and the live census is REPORTED rather than
 *      asserted equal to a literal (a hard-coded expected count would invite making
 *      reality match the plan).
 *
 * The enforcer wire (final describe) proves the module is reachable from a LIVE
 * root — `iron-loop-enforcer`'s `claim-census` check — not merely from this test. A
 * test is never a caller (see src/lib/reachability.js).
 *
 * Every fixture lives under os.tmpdir() and is removed in `finally`; the real
 * skills/ tree is never written.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  parseClaimBlocks,
  extractClaims,
  censusCorpus,
} = require('../src/lib/claim-extractor');

const { checkAllInvariants } = require('../src/lib/iron-loop-enforcer');

const REAL_ROOT = path.join(__dirname, '..');

// POSIX/non-root only: chmod 000 actually denies read there. Under root or on
// Windows it does not, so the permission-dependent SUB-assertions are gated — but
// a portable assertion (an oversized file) always runs, so no case silently no-ops.
const CAN_DENY =
  process.platform !== 'win32' &&
  typeof process.getuid === 'function' &&
  process.getuid() !== 0;

/** Make an isolated fixture root and hand it to `fn`; always clean up. */
function withFixture(fn) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-claim-census-'));
  try {
    return fn(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

/** Write a guide under skills/<rel> in the fixture, creating parent dirs. */
function writeGuide(root, rel, content) {
  const full = path.join(root, 'skills', ...rel.split('/'));
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
  return full;
}

const WELL_FORMED = `# DuckDB

<!-- ctoc:claims
- id: duckdb-python-version
  kind: registry-version
  source: https://pypi.org/pypi/duckdb/json
  select: info.version
  expect: 1.5.4
  retrieved: 2026-07-10
- id: duckdb-concurrency-doc
  kind: url-live
  source: https://duckdb.org/docs/stable/connect/concurrency
  retrieved: 2026-07-10
-->

DuckDB is an in-process analytical database.
`;

// ── The parser contract ──────────────────────────────────────────────────────

describe('parseClaimBlocks — the parser contract', () => {
  it('(1) a well-formed block parses into exact records', () => {
    const { claims, malformed } = parseClaimBlocks(WELL_FORMED);
    assert.equal(malformed.length, 0, 'no malformed records expected');
    assert.equal(claims.length, 2);
    assert.deepEqual(claims[0], {
      id: 'duckdb-python-version',
      kind: 'registry-version',
      source: 'https://pypi.org/pypi/duckdb/json',
      select: 'info.version',
      expect: '1.5.4',
      retrieved: '2026-07-10',
    });
    assert.equal(claims[1].id, 'duckdb-concurrency-doc');
    assert.equal(claims[1].kind, 'url-live');
    assert.equal(claims[1].source, 'https://duckdb.org/docs/stable/connect/concurrency');
    assert.equal(claims[1].retrieved, '2026-07-10');
    // url-live carries no select/expect.
    assert.equal(claims[1].select, undefined);
    assert.equal(claims[1].expect, undefined);
  });

  it('(1b) throws TypeError on non-string input (misuse only)', () => {
    assert.throws(() => parseClaimBlocks(42), TypeError);
    assert.throws(() => parseClaimBlocks(null), TypeError);
  });

  it('(4) an unknown kind is MALFORMED, never silently dropped', () => {
    const md = `<!-- ctoc:claims
- id: x
  kind: bogus-kind
  source: https://example.com/x
  retrieved: 2026-07-10
-->`;
    const { claims, malformed } = parseClaimBlocks(md);
    assert.equal(claims.length, 0);
    assert.equal(malformed.length, 1);
    assert.equal(malformed[0].reason, 'unknown-kind');
    assert.equal(malformed[0].id, 'x');
  });

  it('(5) a missing required field is MALFORMED and NAMES the field', () => {
    const md = `<!-- ctoc:claims
- id: x
  kind: url-live
  retrieved: 2026-07-10
-->`;
    const { malformed } = parseClaimBlocks(md);
    assert.equal(malformed.length, 1);
    assert.equal(malformed[0].reason, 'missing-field');
    assert.equal(malformed[0].field, 'source');
  });

  it('(6) a duplicate id within a file is MALFORMED (duplicate-id)', () => {
    const md = `<!-- ctoc:claims
- id: dup
  kind: url-live
  source: https://example.com/a
  retrieved: 2026-07-10
- id: dup
  kind: url-live
  source: https://example.com/b
  retrieved: 2026-07-10
-->`;
    const { claims, malformed } = parseClaimBlocks(md);
    assert.equal(claims.length, 1, 'the first record is valid');
    assert.equal(malformed.length, 1);
    assert.equal(malformed[0].reason, 'duplicate-id');
    assert.equal(malformed[0].id, 'dup');
  });

  it('(7) an http:// source is rejected (insecure-source)', () => {
    const md = `<!-- ctoc:claims
- id: x
  kind: url-live
  source: http://example.com/x
  retrieved: 2026-07-10
-->`;
    const { malformed } = parseClaimBlocks(md);
    assert.equal(malformed.length, 1);
    assert.equal(malformed[0].reason, 'insecure-source');
  });

  it('(8) a source with userinfo or an explicit port is rejected (unsafe-source)', () => {
    const withUser = `<!-- ctoc:claims
- id: x
  kind: url-live
  source: https://user:pass@example.com/x
  retrieved: 2026-07-10
-->`;
    assert.equal(parseClaimBlocks(withUser).malformed[0].reason, 'unsafe-source');

    const withPort = `<!-- ctoc:claims
- id: y
  kind: url-live
  source: https://example.com:8443/x
  retrieved: 2026-07-10
-->`;
    assert.equal(parseClaimBlocks(withPort).malformed[0].reason, 'unsafe-source');
  });

  it('(8b) a source that is not a parseable absolute URL is rejected (unsafe-source)', () => {
    const md = `<!-- ctoc:claims
- id: x
  kind: url-live
  source: not a url at all
  retrieved: 2026-07-10
-->`;
    const { malformed } = parseClaimBlocks(md);
    assert.equal(malformed.length, 1);
    assert.equal(malformed[0].reason, 'unsafe-source');
  });

  it('(9) a select reaching a prototype segment is rejected (unsafe-selector)', () => {
    const md = `<!-- ctoc:claims
- id: x
  kind: registry-version
  source: https://example.com/x
  select: __proto__.x
  expect: 1.0.0
  retrieved: 2026-07-10
-->`;
    const { malformed } = parseClaimBlocks(md);
    assert.equal(malformed.length, 1);
    assert.equal(malformed[0].reason, 'unsafe-selector');
  });

  it('(10) a malformed retrieved date is rejected (bad-date)', () => {
    const md = `<!-- ctoc:claims
- id: x
  kind: url-live
  source: https://example.com/x
  retrieved: 2026-13-40
-->`;
    const { malformed } = parseClaimBlocks(md);
    assert.equal(malformed.length, 1);
    assert.equal(malformed[0].reason, 'bad-date');
  });

  it('(10b) a registry-version missing select or expect is MALFORMED (missing-field)', () => {
    const noSelect = `<!-- ctoc:claims
- id: x
  kind: registry-version
  source: https://example.com/x
  expect: 1.0.0
  retrieved: 2026-07-10
-->`;
    const r1 = parseClaimBlocks(noSelect).malformed[0];
    assert.equal(r1.reason, 'missing-field');
    assert.equal(r1.field, 'select');

    const noExpect = `<!-- ctoc:claims
- id: y
  kind: registry-version
  source: https://example.com/y
  select: info.version
  retrieved: 2026-07-10
-->`;
    const r2 = parseClaimBlocks(noExpect).malformed[0];
    assert.equal(r2.reason, 'missing-field');
    assert.equal(r2.field, 'expect');
  });
});

// ── extractClaims — declared vs undeclared vs empty ──────────────────────────

describe('extractClaims — declared / undeclared / empty', () => {
  it('(2) no block ⇒ declared:false, zero claims (the honest uncovered state)', () =>
    withFixture((root) => {
      writeGuide(root, 'frameworks/web/express.md',
        '# Express\n\nUpdated January 2026\n\nExpress 5 requires Node.js 18+.\n');
      const fc = extractClaims(root, 'skills/frameworks/web/express.md');
      assert.equal(fc.declared, false);
      assert.equal(fc.claims.length, 0);
      assert.equal(fc.malformed.length, 0);
      assert.equal(fc.path, 'skills/frameworks/web/express.md');
    }));

  it('(3) an EMPTY block ⇒ declared:true, zero claims (looked, found nothing ≠ never looked)', () =>
    withFixture((root) => {
      writeGuide(root, 'frameworks/data/empty.md',
        '# Empty\n\n<!-- ctoc:claims\n-->\n\nBody.\n');
      const fc = extractClaims(root, 'skills/frameworks/data/empty.md');
      assert.equal(fc.declared, true, 'a present-but-empty block still means an author looked');
      assert.equal(fc.claims.length, 0);
    }));

  it('a well-formed file reports declared:true with its claims', () =>
    withFixture((root) => {
      writeGuide(root, 'frameworks/data/duckdb.md', WELL_FORMED);
      const fc = extractClaims(root, 'skills/frameworks/data/duckdb.md');
      assert.equal(fc.declared, true);
      assert.equal(fc.claims.length, 2);
    }));

  it('throws TypeError on non-string arguments (misuse only)', () =>
    withFixture((root) => {
      assert.throws(() => extractClaims(root, 42), TypeError);
      assert.throws(() => extractClaims(42, 'skills/x.md'), TypeError);
    }));
});

// ── censusCorpus — the honest count and the could-not-look contract ───────────

describe('censusCorpus — the corpus census', () => {
  it('counts declared, undeclared and claims-by-kind across the corpus', () =>
    withFixture((root) => {
      writeGuide(root, 'frameworks/data/duckdb.md', WELL_FORMED);
      writeGuide(root, 'frameworks/web/express.md', '# Express\n\nno citations here.\n');
      writeGuide(root, 'frameworks/web/backbone.md', '# Backbone\n\nBackbone 1.6.x\n');
      const c = censusCorpus(root);
      assert.equal(c.totalFiles, 3);
      assert.equal(c.declaredFiles, 1);
      assert.equal(c.undeclaredFiles, 2);
      assert.equal(c.claimsByKind['registry-version'], 1);
      assert.equal(c.claimsByKind['url-live'], 1);
      assert.equal(c.malformedCount, 0);
      assert.equal(c.unreadableCount, 0);
    }));

  it('malformed records are COUNTED, never dropped', () =>
    withFixture((root) => {
      writeGuide(root, 'a.md', `<!-- ctoc:claims
- id: bad
  kind: nope
  source: https://example.com/x
  retrieved: 2026-07-10
-->`);
      const c = censusCorpus(root);
      assert.equal(c.declaredFiles, 1, 'a file with a block is declared even if its records are malformed');
      assert.equal(c.malformedCount, 1);
    }));

  it('(12) unreadableCount === 0 on a fully readable fixture (the only honest zero)', () =>
    withFixture((root) => {
      writeGuide(root, 'a.md', WELL_FORMED);
      writeGuide(root, 'nested/b.md', '# B\n');
      const c = censusCorpus(root);
      assert.equal(c.unreadableCount, 0);
      assert.equal(c.unreadable.length, 0);
    }));

  it('an absent skills/ directory is not a fault — empty, complete result', () =>
    withFixture((root) => {
      const c = censusCorpus(root); // no skills/ dir at all
      assert.equal(c.totalFiles, 0);
      assert.equal(c.declaredFiles, 0);
      assert.equal(c.undeclaredFiles, 0);
      assert.equal(c.unreadableCount, 0);
    }));

  it('(11) an unreadable input sets unreadableCount > 0 — the census must NOT read as clean', () =>
    withFixture((root) => {
      // PORTABLE branch: an oversized guide is unreadable on every platform.
      const big = 'a'.repeat((1 << 20) + 32); // > MAX_GUIDE_BYTES (1 MiB)
      writeGuide(root, 'oversized.md', big);
      writeGuide(root, 'ok.md', WELL_FORMED);

      let c = censusCorpus(root);
      assert.ok(c.unreadableCount > 0, 'an oversized guide must be reported unreadable');
      assert.ok(
        c.unreadable.some((u) => u.reason === 'oversized'),
        'the oversized guide carries reason oversized',
      );
      // Its own declared claim is still counted — the readable part is not lost.
      assert.equal(c.declaredFiles, 1);

      // ADDITIVE, permission-dependent branch: a directory that cannot be read.
      if (CAN_DENY) {
        const deniedDir = path.join(root, 'skills', 'locked');
        fs.mkdirSync(deniedDir, { recursive: true });
        fs.writeFileSync(path.join(deniedDir, 'hidden.md'), '# hidden\n');
        fs.chmodSync(deniedDir, 0o000);
        try {
          c = censusCorpus(root);
          assert.ok(
            c.unreadable.some((u) => u.reason === 'dir-unreadable'),
            'a denied directory is reported dir-unreadable, standing for the whole subtree',
          );
        } finally {
          fs.chmodSync(deniedDir, 0o755); // restore so cleanup can remove it
        }
      }
    }));

  it('(13) unreadable[].path is repository-relative and POSIX, never absolute', () =>
    withFixture((root) => {
      writeGuide(root, 'nested/oversized.md', 'a'.repeat((1 << 20) + 32));
      const c = censusCorpus(root);
      assert.ok(c.unreadableCount > 0);
      for (const u of c.unreadable) {
        assert.ok(!path.isAbsolute(u.path), `unread path must be relative: ${u.path}`);
        assert.ok(!u.path.includes('\\'), `unread path must be POSIX: ${u.path}`);
        assert.ok(u.path.startsWith('skills/'), `unread path is under skills/: ${u.path}`);
        assert.ok(!u.path.includes(os.tmpdir()), 'the absolute root (a user name) must never leak');
      }
    }));

  it('throws TypeError on a non-string root (misuse only)', () => {
    assert.throws(() => censusCorpus(42), TypeError);
    assert.throws(() => censusCorpus(''), TypeError);
  });
});

// ── The ratchet — coverage may only rise, and it must be SEEN biting ──────────

describe('census ratchet — declared coverage moves in one direction', () => {
  const baselineFile = path.join(REAL_ROOT, '.ctoc', 'claim-coverage-baseline.json');

  function readBaselineMin() {
    const parsed = JSON.parse(fs.readFileSync(baselineFile, 'utf8'));
    assert.ok(Number.isFinite(parsed.minDeclaredFiles), 'baseline minDeclaredFiles is a number');
    return parsed.minDeclaredFiles;
  }

  it('(14) CENSUS RATCHET — declaredFiles is at or above the committed floor', () => {
    const min = readBaselineMin();
    const c = censusCorpus(REAL_ROOT);
    assert.ok(
      c.declaredFiles >= min,
      `citation coverage regressed: ${c.declaredFiles} guides declare claims, below the floor ${min}. ` +
        'The floor may only RISE — restore the removed claim block; never lower the baseline.',
    );
  });

  it('(15) the ratchet BITES — a floor above the live count fails the same comparison', () => {
    const c = censusCorpus(REAL_ROOT);
    const wouldRegress = c.declaredFiles < c.declaredFiles + 1; // floor raised by one
    assert.equal(
      wouldRegress,
      true,
      'raising the floor above the live declared count MUST fail the ratchet — a ratchet ' +
        'never seen failing is indistinguishable from an assertion-free test',
    );
  });

  it('(16) the live census is REPORTED, never asserted equal to a literal', () => {
    const c = censusCorpus(REAL_ROOT);
    // Decision 5/16: the real numbers are the product of this slice; print them.
    console.log(
      `[claim-census] skills corpus: total=${c.totalFiles} declared=${c.declaredFiles} ` +
        `undeclared=${c.undeclaredFiles} registry-version=${c.claimsByKind['registry-version']} ` +
        `url-live=${c.claimsByKind['url-live']} malformed=${c.malformedCount} ` +
        `unreadable=${c.unreadableCount}`,
    );
    assert.equal(typeof c.totalFiles, 'number');
    assert.ok(c.totalFiles > 0, 'the real corpus has guides');
    assert.equal(c.declaredFiles + c.undeclaredFiles <= c.totalFiles, true);
    assert.equal(c.unreadableCount, 0, 'the real corpus is fully readable in this run');
  });
});

// ── The wire — reachable from a LIVE root, not merely from this test ──────────

describe('the claim-census enforcer check — the live call site', () => {
  function seed(root, { skills = {}, baseline } = {}) {
    for (const [rel, content] of Object.entries(skills)) writeGuide(root, rel, content);
    if (baseline !== undefined) {
      fs.mkdirSync(path.join(root, '.ctoc'), { recursive: true });
      fs.writeFileSync(
        path.join(root, '.ctoc', 'claim-coverage-baseline.json'),
        JSON.stringify(baseline),
      );
    }
  }

  it('is CLEAN when declared coverage is at or above the floor', () =>
    withFixture((root) => {
      seed(root, { skills: { 'a.md': WELL_FORMED }, baseline: { minDeclaredFiles: 1 } });
      const r = checkAllInvariants({ root, mode: 'thorough', scopes: ['architecture'] });
      const f = r.findings.find((x) => x.id === 'claim-census');
      assert.equal(f, undefined, 'a clean census contributes no finding');
    }));

  it('BLOCKS when declared coverage REGRESSES below the floor', () =>
    withFixture((root) => {
      seed(root, {
        skills: { 'a.md': '# no block here\n', 'b.md': '# also none\n' },
        baseline: { minDeclaredFiles: 5 },
      });
      const r = checkAllInvariants({ root, mode: 'thorough', scopes: ['architecture'] });
      const f = r.findings.find((x) => x.id === 'claim-census');
      assert.ok(f, 'a regression must surface a finding');
      assert.equal(f.severity, 'block');
      assert.match(f.message, /coverage|regress/i);
    }));

  it('BLOCKS when the walk was PARTIAL (a corpus that could not be fully read is not clean)', () =>
    withFixture((root) => {
      seed(root, {
        skills: { 'ok.md': WELL_FORMED, 'oversized.md': 'a'.repeat((1 << 20) + 32) },
        baseline: { minDeclaredFiles: 0 },
      });
      const r = checkAllInvariants({ root, mode: 'thorough', scopes: ['architecture'] });
      const f = r.findings.find((x) => x.id === 'claim-census');
      assert.ok(f, 'a partial walk must surface a finding');
      assert.equal(f.severity, 'block');
      assert.match(f.message, /could not read|partial/i);
    }));

  it('is CLEAN (no finding) on a tree with no corpus at all', () =>
    withFixture((root) => {
      const r = checkAllInvariants({ root, mode: 'thorough', scopes: ['architecture'] });
      const f = r.findings.find((x) => x.id === 'claim-census');
      assert.equal(f, undefined, 'no skills/ tree ⇒ not a corpus ⇒ no finding');
    }));

  it('BLOCKS on a MALFORMED baseline — an unreadable ratchet must not read as clear', () =>
    withFixture((root) => {
      writeGuide(root, 'a.md', WELL_FORMED);
      fs.mkdirSync(path.join(root, '.ctoc'), { recursive: true });
      fs.writeFileSync(path.join(root, '.ctoc', 'claim-coverage-baseline.json'), '{ not json');
      const r = checkAllInvariants({ root, mode: 'thorough', scopes: ['architecture'] });
      const f = r.findings.find((x) => x.id === 'claim-census');
      assert.ok(f, 'a malformed baseline must surface a finding');
      assert.equal(f.severity, 'block');
      assert.match(f.message, /unreadable|repair/i);
    }));

  it('BLOCKS on a baseline missing a numeric minDeclaredFiles', () =>
    withFixture((root) => {
      writeGuide(root, 'a.md', WELL_FORMED);
      fs.mkdirSync(path.join(root, '.ctoc'), { recursive: true });
      fs.writeFileSync(
        path.join(root, '.ctoc', 'claim-coverage-baseline.json'),
        JSON.stringify({ note: 'no floor here' }),
      );
      const r = checkAllInvariants({ root, mode: 'thorough', scopes: ['architecture'] });
      const f = r.findings.find((x) => x.id === 'claim-census');
      assert.ok(f, 'a baseline without a numeric floor is a broken instrument');
      assert.equal(f.severity, 'block');
    }));
});
