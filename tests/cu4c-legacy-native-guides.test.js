/**
 * CU4c s6 — content-contract tests for the legacy & native language guides
 * (fortran.md, assembly.md, cobol.md, objectivec.md).
 *
 * ZERO DOUBLES: this reads the REAL guide files off disk via fs.readFileSync
 * (mirroring tests/cu2-systems-guides.test.js and tests/cu4c-systems-modern-guides.test.js)
 * and asserts substantive structure — no mocks, no fixtures, no fakes. It guards
 * the CU4c acceptance criteria for these four legacy/native guides:
 *   - each guide exceeds the 5-section template floor (> 5 "## " sections);
 *   - each guide is well past the ~50-line stub floor (> 120 lines);
 *   - the required correction-surface sections are present (Memory/ABI/Data,
 *     Error Handling, Security/Dependency, Testing/Toolchain, Performance,
 *     Version, References);
 *   - each guide carries >= 4 code fences (>= 2 fenced examples);
 *   - each guide carries at least one dated source (>= 2025) with an http URL;
 *   - the original H1 header is intact (skills.json indexing not corrupted);
 *   - each guide names its own concrete identifiers + the applicable CWE class.
 *
 * Every version/CWE/tool/ABI fact these guides assert is web-verified against
 * official sources at edit time (fortran-lang.org / gcc.gnu.org/fortran /
 * gitlab.com/x86-psABIs / developer.arm.com / gnucobol.sourceforge.io /
 * developer.apple.com / clang.llvm.org / cwe.mitre.org). This test does NOT
 * re-verify the facts; it guards the substance against a future edit dropping it.
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
  fortran: 'skills/languages/fortran.md',
  assembly: 'skills/languages/assembly.md',
  cobol: 'skills/languages/cobol.md',
  objectivec: 'skills/languages/objectivec.md',
};

// Sections every de-stubbed correction surface must carry (case-insensitive).
// The concurrency-equivalent required section is broadened to match
// memory/ABI/register/data for these legacy/native families (per the plan).
const REQUIRED_SECTIONS = [
  { name: 'Memory/ABI/Data/Concurrency', re: /^##.*(memor|abi|register|data|concurren|alloc|arc)/im },
  { name: 'Error Handling', re: /^##.*error.?handling/im },
  { name: 'Security/Dependency', re: /^##.*(security|dependenc|supply.?chain)/im },
  { name: 'Testing/Toolchain', re: /^##.*(test|toolchain)/im },
  { name: 'Performance', re: /^##.*performance/im },
  { name: 'Version-specific', re: /^##.*version/im },
  { name: 'References', re: /^##.*(reference|source)/im },
];

function sectionCount(md) {
  return (md.match(/^## /gm) || []).length;
}

describe('CU4c s6 — legacy & native guides are substantive (real files, zero doubles)', () => {
  for (const [lang, rel] of Object.entries(GUIDES)) {
    describe(`${lang} (${rel})`, () => {
      it('exceeds the 5-section template floor (> 5 "## " sections)', () => {
        const md = read(rel);
        const n = sectionCount(md);
        assert.ok(n > 5, `expected > 5 "## " sections, found ${n}`);
      });

      it('is well past the ~50-line stub floor', () => {
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

      it('carries >= 4 code fences (>= 2 fenced examples)', () => {
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
        assert.match(md, /^# .+CTO/m, 'expected the original "# <Lang> CTO" H1 header');
      });
    });
  }

  it('fortran names -fcheck=bounds, CWE-125, implicit none, and a Fortran 2018/2023 standard', () => {
    const md = read(GUIDES.fortran);
    assert.match(md, /-fcheck=bounds/, 'expected the gfortran -fcheck=bounds flag');
    assert.match(md, /CWE-125/, 'expected CWE-125 out-of-bounds read');
    assert.match(md, /CWE-787/, 'expected CWE-787 out-of-bounds write');
    assert.match(md, /implicit none/i, 'expected the implicit none discipline');
    assert.match(md, /Fortran 20(18|23)/, 'expected a Fortran 2018/2023 standard token');
    assert.match(md, /fortran-lang\.org|gcc\.gnu\.org/, 'expected a fortran-lang.org / gcc.gnu.org source URL');
  });

  it('assembly names System V AMD64 ABI, CWE-121, 16-byte alignment, and ARM64 AAPCS64', () => {
    const md = read(GUIDES.assembly);
    assert.match(md, /System V AMD64/i, 'expected the System V AMD64 ABI named explicitly');
    assert.match(md, /AAPCS64|ARM64/, 'expected the ARM64 AAPCS64 ABI named explicitly');
    assert.match(md, /CWE-121/, 'expected CWE-121 stack-based buffer overflow');
    assert.match(md, /CWE-787/, 'expected CWE-787 out-of-bounds write');
    assert.match(md, /16-byte/, 'expected the 16-byte stack alignment rule');
    assert.match(md, /objdump/, 'expected objdump disassembly verification');
    assert.match(md, /x86-psABIs|developer\.arm\.com|felixcloutier/, 'expected an official ISA/ABI source URL');
  });

  it('cobol names PIC, REDEFINES, COMP-3, FILE STATUS, CWE-89, and GnuCOBOL', () => {
    const md = read(GUIDES.cobol);
    assert.match(md, /\bPIC\b/, 'expected the PIC clause');
    assert.match(md, /REDEFINES/, 'expected REDEFINES aliasing');
    assert.match(md, /COMP-3/, 'expected COMP-3 packed decimal');
    assert.match(md, /FILE STATUS/, 'expected FILE STATUS post-I/O checks');
    assert.match(md, /ON SIZE ERROR/, 'expected ON SIZE ERROR arithmetic guard');
    assert.match(md, /CWE-89/, 'expected CWE-89 SQL injection in embedded SQL');
    assert.match(md, /GnuCOBOL/, 'expected GnuCOBOL named');
    assert.match(md, /gnucobol\.sourceforge\.io|iso\.org/, 'expected a GnuCOBOL / ISO source URL');
  });

  it('objectivec names ARC, __weak, dispatch_async, NSError, CWE-134, and CWE-502', () => {
    const md = read(GUIDES.objectivec);
    assert.match(md, /\bARC\b/, 'expected ARC memory management');
    assert.match(md, /__weak/, 'expected the __weak qualifier for retain cycles');
    assert.match(md, /dispatch_async/, 'expected GCD dispatch_async');
    assert.match(md, /NSError/, 'expected the NSError ** out-param convention');
    assert.match(md, /CWE-134/, 'expected CWE-134 format-string vulnerability');
    assert.match(md, /CWE-502/, 'expected CWE-502 unsafe deserialization');
    assert.match(md, /requiringSecureCoding/, 'expected requiringSecureCoding for NSKeyedUnarchiver');
    assert.match(md, /developer\.apple\.com|clang\.llvm\.org/, 'expected an Apple / clang source URL');
  });
});
