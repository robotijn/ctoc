/**
 * CU4c s1 — content-contract tests for the statically-typed functional
 * language guides (haskell.md, ocaml.md, fsharp.md, scala.md).
 *
 * ZERO DOUBLES: this reads the REAL guide files off disk via fs.readFileSync
 * (mirroring tests/cu2-systems-guides.test.js and
 * tests/cu2-dynamic-web-guides.test.js) and asserts substantive structure —
 * no mocks, no fixtures, no fakes, no stubs. It guards the CU4c s1 acceptance
 * criteria for these four files:
 *   - each guide exceeds the 5-section template floor (> 5 "## " sections);
 *   - the required correction-surface sections are present (Concurrency/
 *     Evaluation/Effects, Error Handling, Security/Dependency, Testing,
 *     Performance, Version-specific, References);
 *   - each guide is well past the ~50-line stub floor (> 120 lines);
 *   - at least four code fences (>= 2 fenced examples) per guide;
 *   - at least one dated source (>= 2025) with an http URL is present per guide;
 *   - the original H1 header ("# <Lang> CTO") is intact (skills.json indexing);
 *   - each guide names its own concrete identifiers:
 *       haskell : foldl'  + QuickCheck
 *       ocaml   : Domain   + Result
 *       fsharp  : CWE-502  + FsCheck
 *       scala   : CWE-502  + ScalaCheck
 *
 * Every version/security fact these guides assert was web-verified against
 * official sources at edit time (endoflife.date/ghc, github.com/ocaml/ocaml,
 * endoflife.date/dotnet, learn.microsoft.com/dotnet/fsharp, endoflife.date/scala,
 * cwe.mitre.org). This test does NOT re-verify the facts against the network;
 * it guards the substance against a future edit dropping it.
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
  haskell: 'skills/languages/haskell.md',
  ocaml: 'skills/languages/ocaml.md',
  fsharp: 'skills/languages/fsharp.md',
  scala: 'skills/languages/scala.md',
};

// Sections every de-stubbed correction surface must carry (case-insensitive).
// Concurrency/Evaluation/Effects covers the shared evaluation-order spine:
// Haskell laziness/space leaks, OCaml effects/domains, F#/Scala async.
const REQUIRED_SECTIONS = [
  {
    name: 'Concurrency/Evaluation/Effects',
    re: /^##.*(concurren|async|effect|evaluation|space.?leak|laziness|lazy)/im,
  },
  { name: 'Error Handling', re: /^##.*error.?handling/im },
  { name: 'Security/Dependency', re: /^##.*(security|dependenc|supply.?chain)/im },
  { name: 'Testing', re: /^##.*test/im },
  { name: 'Performance', re: /^##.*performance/im },
  { name: 'Version-specific', re: /^##.*version/im },
  { name: 'References', re: /^##.*(reference|source)/im },
];

function sectionCount(md) {
  return (md.match(/^## /gm) || []).length;
}

describe('CU4c s1 — typed-functional guides are substantive (real files, zero doubles)', () => {
  for (const [lang, rel] of Object.entries(GUIDES)) {
    describe(`${lang} (${rel})`, () => {
      it('exceeds the 5-section template floor (> 5 "## " sections)', () => {
        const md = read(rel);
        const n = sectionCount(md);
        assert.ok(n > 5, `expected > 5 "## " sections, found ${n}`);
      });

      it('is well past the ~50-line stub floor (> 120 lines)', () => {
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

  it("haskell names foldl', Data.Map.Strict, bracket, and QuickCheck", () => {
    const md = read(GUIDES.haskell);
    assert.match(md, /foldl'/, "expected foldl' (strict left fold, space-leak fix)");
    assert.match(md, /Data\.Map\.Strict/, 'expected Data.Map.Strict retention fix');
    assert.match(md, /bracket/, 'expected Control.Exception.bracket resource safety');
    assert.match(md, /QuickCheck/, 'expected QuickCheck property testing');
    assert.match(md, /GHC2024/, 'expected the GHC2024 language edition');
    assert.match(md, /9\.1[0-9]/, 'expected a current GHC 9.1x version token');
  });

  it('ocaml names Domain, Effect, Result, Fun.protect, and Marshal', () => {
    const md = read(GUIDES.ocaml);
    assert.match(md, /Domain(\.spawn)?/, 'expected Domain / Domain.spawn (multicore)');
    assert.match(md, /Effect/, 'expected Effect handlers (OCaml 5)');
    assert.match(md, /Result/, 'expected Result error-handling type');
    assert.match(md, /Fun\.protect/, 'expected Fun.protect cleanup idiom');
    assert.match(md, /Marshal/, 'expected the Marshal unsafe-deserialization warning');
    assert.match(md, /5\.[0-9]/, 'expected a current OCaml 5.x version token');
  });

  it('fsharp names Result.bind, task/async CE, CWE-502, and FsCheck', () => {
    const md = read(GUIDES.fsharp);
    assert.match(md, /Result\.bind/, 'expected Result.bind railway-oriented error handling');
    assert.match(md, /task\s*\{|async\s*\{/, 'expected task { } / async { } CE');
    assert.match(md, /CWE-502/, 'expected CWE-502 deserialization class');
    assert.match(md, /FsCheck/, 'expected FsCheck property testing');
    assert.match(md, /\.NET 10|net10/i, 'expected the current .NET 10 LTS token');
    assert.match(md, /cwe\.mitre\.org/, 'expected the cwe.mitre.org advisory URL');
  });

  it('scala names Future, ExecutionContext, Try, CWE-502, and ScalaCheck', () => {
    const md = read(GUIDES.scala);
    assert.match(md, /Future/, 'expected Future eager-evaluation footgun');
    assert.match(md, /ExecutionContext/, 'expected ExecutionContext starvation footgun');
    assert.match(md, /\bTry\b/, 'expected Try error-handling type');
    assert.match(md, /CWE-502/, 'expected CWE-502 JVM deserialization class');
    assert.match(md, /ScalaCheck/, 'expected ScalaCheck property testing');
    assert.match(md, /3\.[0-9]/, 'expected a current Scala 3.x version token');
    assert.match(md, /cwe\.mitre\.org/, 'expected the cwe.mitre.org advisory URL');
  });
});
