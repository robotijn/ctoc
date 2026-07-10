/**
 * CU4c — the 41-file completeness check over all CU4c-targeted language guides.
 *
 * ZERO DOUBLES: reads ALL 41 named CU4c language guides off disk via
 * fs.readFileSync, reads the corpus audit ledger (read-only for CU1/CU2 records;
 * the CU4c verdict block is appended by this slice's Step 10), and enumerates the
 * full skills/languages/*.md set off disk. No mocks, no fixtures, no fakes.
 *
 * This is the CU4c-wide gate. It proves:
 *   (a) every one of the 41 named non-mainstream language guides is substantive
 *       (well past the stub floor, > 5 "## " sections, > 90 lines, carries a dated
 *       >= 2025 source with an http URL) — the UPGRADED verdict is real, not
 *       fabricated;
 *   (b) every one of the 41 has a recorded CU4c verdict (UPGRADED or SOLID-SKIPPED)
 *       in the audit ledger — the completeness diff IN_SCOPE \ (UPGRADED ∪
 *       SOLID-SKIPPED) is EMPTY, and no phantom verdict is recorded for a
 *       non-in-scope path (no silent omission, no phantom);
 *   (c) the SCOPE BOUNDARY holds two ways:
 *       - no CU2 mainstream file (python/javascript/typescript/go/java/rust/
 *         csharp/c/cpp) is recorded under a CU4c verdict (CU4c must not touch CU2);
 *       - NO-SILENT-SKIP: enumerate ALL skills/languages/*.md, subtract the 9 CU2
 *         mainstream, and assert every remaining file is substantive (> 5 "## "
 *         sections). Any non-mainstream language guide left at <= 5 sections that
 *         ISN'T one of the CU2 9 FAILS — proving CU4c's whole 41-file scope landed
 *         with nothing thin left behind.
 *
 * The 41 IN_SCOPE filenames are the audit-ledger diff (all skills/languages/*.md at
 * <= 5 "## " sections MINUS the 9 CU2 mainstream files), confirmed fresh as exactly
 * 41. Mirrors tests/cu4b-completeness.test.js + tests/cu3-completeness.test.js
 * (the CU no-silent-skip content-contract precedent).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const projectRoot = path.join(__dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(projectRoot, rel), 'utf8');
}

function exists(rel) {
  return fs.existsSync(path.join(projectRoot, rel));
}

function sectionCount(md) {
  return (md.match(/^## /gm) || []).length;
}

const AUDIT_LEDGER = '.ctoc/audit/corpus-audit-2026-06-15.json';

// The 9 CU2 mainstream language guides — OUT OF CU4c SCOPE (>= 10 sections each).
// CU4c must not touch these; the scope-boundary guard asserts none is recorded
// under a CU4c verdict, and the no-silent-skip enumeration excludes exactly these.
const CU2_MAINSTREAM = [
  'python', 'javascript', 'typescript', 'go', 'java',
  'rust', 'csharp', 'c', 'cpp',
];

// The canonical CU4c in-scope set: the 41 read-fresh-confirmed thin non-mainstream
// language guides upgraded by s1–s11. Every one started at exactly 5 "## " sections
// (the audit-ledger diff floor), so the strict floor is 5 (n > 5) — this defeats a
// no-op false-green. Slice→file coverage (union = 41, no overlap, no omission):
//   s1  haskell ocaml fsharp scala        s2  clojure scheme erlang elixir
//   s3  bash perl tcl lua                  s4  ruby php groovy coffeescript
//   s5  zig nim crystal d                  s6  fortran assembly cobol objectivec
//   s7  abap apex vba matlab               s8  sql graphql r
//   s9  solidity verilog vhdl              s10 julia prolog terraform powershell
//   s11 kotlin swift dart
const IN_SCOPE = [
  'abap', 'apex', 'assembly', 'bash', 'clojure', 'cobol', 'coffeescript',
  'crystal', 'd', 'dart', 'elixir', 'erlang', 'fortran', 'fsharp', 'graphql',
  'groovy', 'haskell', 'julia', 'kotlin', 'lua', 'matlab', 'nim', 'objectivec',
  'ocaml', 'perl', 'php', 'powershell', 'prolog', 'r', 'ruby', 'scala', 'scheme',
  'solidity', 'sql', 'swift', 'tcl', 'terraform', 'vba', 'verilog', 'vhdl', 'zig',
].map((name) => ({ name, rel: `skills/languages/${name}.md`, floor: 5 }));

const CU4C_VALID_VERDICTS = new Set(['UPGRADED', 'SOLID-SKIPPED']);

function loadLedger() {
  const raw = read(AUDIT_LEDGER);
  return JSON.parse(raw); // throws on invalid JSON — that IS the check
}

// The CU4c verdict block: an additive top-level `cu4c_verdicts` object on the ledger
// (existing CU1/CU2 records[] untouched). The object carries provenance + a legend
// and a `.verdicts[]` array of per-file entries. Also tolerates a bare-array shape.
// Read fresh off disk each call.
function cu4cVerdicts() {
  const ledger = loadLedger();
  const block = ledger.cu4c_verdicts;
  if (Array.isArray(block)) return block;
  if (block && Array.isArray(block.verdicts)) return block.verdicts;
  return [];
}

// Enumerate every language markdown guide on disk (non-recursive; flat dir).
function allLanguageGuides() {
  const dir = path.join(projectRoot, 'skills/languages');
  return fs.readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .map((f) => f.replace(/\.md$/, ''))
    .sort();
}

describe('CU4c — 41-file completeness check (real files + recorded verdicts, zero doubles)', () => {
  it('the ledger is valid JSON with the expected top-level shape', () => {
    const ledger = loadLedger();
    assert.ok(Array.isArray(ledger.records), 'ledger.records must be an array');
    assert.ok(ledger.records.length > 0, 'ledger.records must be non-empty');
  });

  it('the IN_SCOPE constant is exactly 41, distinct, and disjoint from the 9 CU2 files', () => {
    assert.equal(IN_SCOPE.length, 41, 'the canonical CU4c in-scope set must be exactly 41 files');
    const names = IN_SCOPE.map((s) => s.name);
    assert.equal(new Set(names).size, 41, 'IN_SCOPE names must be distinct (no duplicates)');
    const cu2 = new Set(CU2_MAINSTREAM);
    for (const n of names) {
      assert.ok(!cu2.has(n), `IN_SCOPE must not include CU2 mainstream file: ${n}`);
    }
  });

  it('all 41 named guide files exist on disk', () => {
    for (const { rel } of IN_SCOPE) {
      assert.ok(exists(rel), `named CU4c guide missing on disk: ${rel}`);
    }
  });

  describe('every in-scope guide is UPGRADED on disk — exceeds its section floor (> 5)', () => {
    for (const { rel, floor } of IN_SCOPE) {
      it(`${rel} has > ${floor} "## " sections`, () => {
        const n = sectionCount(read(rel));
        assert.ok(n > floor, `expected > ${floor} "## " sections, found ${n}`);
      });
    }
  });

  describe('every in-scope guide is well past the stub floor (line count)', () => {
    for (const { rel } of IN_SCOPE) {
      it(`${rel} is > 90 lines`, () => {
        const lines = read(rel).split('\n').length;
        assert.ok(lines > 90, `expected > 90 lines (de-stubbed), found ${lines}`);
      });
    }
  });

  describe('every in-scope guide carries a dated source (>= 2025) with an http URL', () => {
    for (const { rel } of IN_SCOPE) {
      it(`${rel} has a >= 2025 date and an http source`, () => {
        const md = read(rel);
        assert.match(md, /20(2[5-9]|[3-9]\d)/, `expected a >= 2025 date token in ${rel}`);
        assert.match(md, /https?:\/\//, `expected an http(s) source URL in ${rel}`);
      });
    }
  });

  describe('no silent omission — every in-scope file has a recorded CU4c verdict', () => {
    it('the CU4c verdict block exists and is non-empty', () => {
      const v = cu4cVerdicts();
      assert.ok(v.length > 0, 'ledger.cu4c_verdicts must exist and be non-empty');
    });

    it('every CU4c verdict entry is well-formed (path, cu4c_verdict, slice, date)', () => {
      for (const rec of cu4cVerdicts()) {
        assert.equal(typeof rec.path, 'string', `verdict path not string: ${JSON.stringify(rec)}`);
        assert.ok(
          CU4C_VALID_VERDICTS.has(rec.cu4c_verdict),
          `bad cu4c_verdict for ${rec.path}: ${rec.cu4c_verdict}`
        );
        assert.equal(typeof rec.slice, 'string', `verdict slice not string: ${rec.path}`);
        assert.equal(typeof rec.date, 'string', `verdict date not string: ${rec.path}`);
      }
    });

    it('completeness diff is EMPTY — IN_SCOPE \\ (UPGRADED ∪ SOLID-SKIPPED) === []', () => {
      const recorded = new Set(cu4cVerdicts().map((r) => r.path));
      const missing = IN_SCOPE
        .map((s) => s.rel)
        .filter((rel) => !recorded.has(rel));
      assert.deepEqual(
        missing,
        [],
        `in-scope file(s) with NO recorded CU4c verdict (silently omitted): ${missing.join(', ')}`
      );
    });

    it('no phantom verdict — every recorded CU4c verdict path is one of the 41 in-scope', () => {
      const inScope = new Set(IN_SCOPE.map((s) => s.rel));
      const phantom = cu4cVerdicts()
        .map((r) => r.path)
        .filter((p) => !inScope.has(p));
      assert.deepEqual(
        phantom,
        [],
        `CU4c verdict recorded for path(s) NOT in the 41-file scope (phantom): ${phantom.join(', ')}`
      );
    });

    it('every UPGRADED verdict is real — the recorded file has > 5 "## " sections on disk', () => {
      for (const rec of cu4cVerdicts()) {
        if (rec.cu4c_verdict !== 'UPGRADED') continue;
        assert.ok(exists(rec.path), `UPGRADED verdict path missing on disk: ${rec.path}`);
        const n = sectionCount(read(rec.path));
        assert.ok(n > 5, `UPGRADED verdict for ${rec.path} but only ${n} "## " sections on disk (fabricated verdict)`);
      }
    });
  });

  describe('scope boundary — CU4c must not touch the 9 CU2 mainstream files', () => {
    it('no CU2 mainstream file is recorded under a CU4c verdict', () => {
      const cu2Rel = new Set(CU2_MAINSTREAM.map((n) => `skills/languages/${n}.md`));
      const leaked = cu4cVerdicts()
        .map((r) => r.path)
        .filter((p) => cu2Rel.has(p));
      assert.deepEqual(
        leaked,
        [],
        `CU2 mainstream file(s) recorded under a CU4c verdict (scope breach): ${leaked.join(', ')}`
      );
    });
  });

  it('NO-SILENT-SKIP — every non-mainstream language guide on disk is substantive (> 5 sections)', () => {
    // Enumerate ALL skills/languages/*.md, subtract the 9 CU2 mainstream, and assert
    // every remaining file is substantive. A non-mainstream guide left at <= 5 "## "
    // sections that ISN'T one of the CU2 9 was silently skipped — CU4c scope would be
    // incomplete. This proves CU4c's whole 41-file scope landed with nothing thin
    // left behind, independent of the hand-maintained IN_SCOPE list.
    const cu2 = new Set(CU2_MAINSTREAM);
    const thinNonMainstream = [];
    for (const name of allLanguageGuides()) {
      if (cu2.has(name)) continue; // CU2 scope — not CU4c's concern here
      const n = sectionCount(read(`skills/languages/${name}.md`));
      if (n <= 5) thinNonMainstream.push(`${name} (${n} sections)`);
    }
    assert.deepEqual(
      thinNonMainstream,
      [],
      `non-mainstream language guide(s) left thin (<= 5 sections) OUTSIDE CU2 — silently skipped by CU4c: ${thinNonMainstream.join(', ')}`
    );
  });

  it('the on-disk non-mainstream set equals the 41-file IN_SCOPE list (no drift)', () => {
    // The full on-disk language set minus the 9 CU2 mainstream must equal IN_SCOPE.
    const cu2 = new Set(CU2_MAINSTREAM);
    const onDiskNonMainstream = allLanguageGuides().filter((n) => !cu2.has(n)).sort();
    const inScopeNames = IN_SCOPE.map((s) => s.name).sort();
    assert.deepEqual(
      onDiskNonMainstream,
      inScopeNames,
      'the on-disk non-mainstream language set drifted from the 41-file IN_SCOPE constant'
    );
  });
});
