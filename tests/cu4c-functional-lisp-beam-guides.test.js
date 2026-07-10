/**
 * CU4c s2 — content-contract tests for the Lisp-family / BEAM-actor language
 * guides (clojure.md, scheme.md, erlang.md, elixir.md).
 *
 * ZERO DOUBLES: this reads the REAL guide files off disk via fs.readFileSync
 * (mirroring tests/cu4c-functional-typed-guides.test.js and
 * tests/cu2-systems-guides.test.js) and asserts substantive structure —
 * no mocks, no fixtures, no fakes, no stubs. It guards the CU4c s2 acceptance
 * criteria for these four files:
 *   - each guide exceeds the 5-section template floor (> 5 "## " sections);
 *   - the required correction-surface sections are present (Concurrency/
 *     Continuations/OTP, Error Handling, Security/Dependency, Testing,
 *     Performance, Version-specific, References);
 *   - each guide is well past the ~50-line stub floor (> 120 lines);
 *   - at least four code fences (>= 2 fenced examples) per guide;
 *   - at least one dated source (>= 2025) with an http URL is present per guide;
 *   - the original H1 header ("# <Lang> CTO") is intact (skills.json indexing);
 *   - each guide names its own concrete identifiers:
 *       clojure : CWE-502 + test.check + edn/read-string
 *       scheme  : call/cc + SRFI-64 + CWE-95
 *       erlang  : binary_to_term + gen_server + CWE-502
 *       elixir  : GenServer + to_existing_atom + CWE-502
 *
 * Every version/security fact these guides assert was web-verified against
 * official sources at edit time (clojure.org/releases/downloads,
 * github.com/racket/racket releases, github.com/erlang/otp releases,
 * github.com/elixir-lang/elixir releases + versioned compatibility page,
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
  clojure: 'skills/languages/clojure.md',
  scheme: 'skills/languages/scheme.md',
  erlang: 'skills/languages/erlang.md',
  elixir: 'skills/languages/elixir.md',
};

// Sections every de-stubbed correction surface must carry (case-insensitive).
// The Concurrency/Continuations/OTP head covers the shared spine: Clojure STM +
// core.async, Scheme call/cc continuations, Erlang/Elixir OTP processes.
const REQUIRED_SECTIONS = [
  {
    name: 'Concurrency/Continuations/OTP',
    re: /^##.*(concurren|continuation|otp|footgun|process|actor)/im,
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

describe('CU4c s2 — Lisp/BEAM guides are substantive (real files, zero doubles)', () => {
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

  it('clojure names edn/read-string, CWE-502, dosync, and test.check', () => {
    const md = read(GUIDES.clojure);
    assert.match(md, /edn\/read-string/, 'expected clojure.edn/read-string safe-read fix');
    assert.match(md, /read-string/, 'expected the read-string/eval code-execution footgun');
    assert.match(md, /CWE-502/, 'expected CWE-502 JVM-interop deserialization class');
    assert.match(md, /dosync/, 'expected dosync STM retry-semantics footgun');
    assert.match(md, /core\.async/, 'expected core.async go-block blocking-call trap');
    assert.match(md, /test\.check/, 'expected test.check property testing');
    assert.match(md, /1\.12\.[0-9]/, 'expected a current Clojure 1.12.x version token');
    assert.match(md, /cwe\.mitre\.org/, 'expected the cwe.mitre.org advisory URL');
  });

  it('scheme names call/cc, dynamic-wind, guard, CWE-95, and SRFI-64', () => {
    const md = read(GUIDES.scheme);
    assert.match(md, /call\/cc/, 'expected call/cc re-entry footgun');
    assert.match(md, /dynamic-wind/, 'expected dynamic-wind interaction warning');
    assert.match(md, /\bguard\b/, 'expected R7RS guard error-handling idiom');
    assert.match(md, /CWE-95/, 'expected CWE-95 eval-injection class');
    assert.match(md, /SRFI-64/, 'expected SRFI-64 test framework');
    assert.match(md, /R7RS/, 'expected the R7RS standard anchor');
    assert.match(md, /cwe\.mitre\.org/, 'expected the cwe.mitre.org advisory URL');
  });

  it('erlang names gen_server, binary_to_term, [safe], supervisor, CWE-502, and PropEr', () => {
    const md = read(GUIDES.erlang);
    assert.match(md, /gen_server/, 'expected gen_server blocking-handle_call footgun');
    assert.match(md, /binary_to_term/, 'expected binary_to_term deserialization footgun');
    assert.match(md, /\[safe\]/, 'expected the binary_to_term(Bin, [safe]) fix');
    assert.match(md, /supervisor/i, 'expected supervisor restart-strategy idiom');
    assert.match(md, /CWE-502/, 'expected CWE-502 deserialization class');
    assert.match(md, /PropEr/, 'expected PropEr property testing');
    assert.match(md, /OTP[- ]?29/, 'expected a current Erlang/OTP 29 version token');
    assert.match(md, /cwe\.mitre\.org/, 'expected the cwe.mitre.org advisory URL');
  });

  it('elixir names GenServer, to_existing_atom, Task.async, with, CWE-502, and StreamData', () => {
    const md = read(GUIDES.elixir);
    assert.match(md, /GenServer/, 'expected GenServer serial-bottleneck footgun');
    assert.match(md, /to_existing_atom/, 'expected String.to_existing_atom atom-exhaustion fix');
    assert.match(md, /Task\.async/, 'expected Task.async leak footgun');
    assert.match(md, /\bwith\b/, 'expected the with error-handling idiom');
    assert.match(md, /CWE-502/, 'expected CWE-502 deserialization class');
    assert.match(md, /StreamData/, 'expected StreamData property testing');
    assert.match(md, /1\.20\.[0-9]/, 'expected a current Elixir 1.20.x version token');
    assert.match(md, /cwe\.mitre\.org/, 'expected the cwe.mitre.org advisory URL');
  });
});
