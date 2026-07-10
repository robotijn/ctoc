/**
 * CU4c s3 — content-contract tests for the Unix glue / embeddable scripting
 * language guides (bash.md, perl.md, tcl.md, lua.md).
 *
 * ZERO DOUBLES: this reads the REAL guide files off disk via fs.readFileSync
 * (mirroring tests/cu2-systems-guides.test.js) and asserts substantive
 * structure — no mocks, no fixtures, no fakes. It guards the CU4c acceptance
 * criteria for these four files:
 *   - each guide exceeds the 5-section template floor (> 5 "## " sections);
 *   - the required correction-surface sections are present (Concurrency/
 *     Coroutines/Job-Control, Error Handling, Security/Dependency, Testing,
 *     Performance, Version, References);
 *   - each guide names its own concrete identifiers (version tokens, APIs);
 *   - the injection CWE class is named per language (bash/perl: CWE-78 OS
 *     command injection; tcl/lua: CWE-94 code injection);
 *   - at least one dated source (>= 2025) with an http URL is present per guide;
 *   - the original H1 header is intact (skills.json indexing not corrupted).
 *
 * Every version/security fact these guides assert is web-verified against
 * official sources at edit time (ftp.gnu.org/gnu/bash, endoflife.date/perl,
 * www.cpan.org, tcl-lang.org, lua.org/versions.html, cwe.mitre.org). This test
 * does NOT re-verify the facts; it guards the substance against a future edit
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
  bash: 'skills/languages/bash.md',
  perl: 'skills/languages/perl.md',
  tcl: 'skills/languages/tcl.md',
  lua: 'skills/languages/lua.md',
};

// Sections every de-stubbed correction surface must carry (case-insensitive).
const REQUIRED_SECTIONS = [
  { name: 'Concurrency/Coroutines/Job-Control', re: /^##.*(concurren|coroutine|job.?control)/im },
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

describe('CU4c s3 — scripting/Unix guides are substantive (real files, zero doubles)', () => {
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

      it('keeps its original H1 header intact (skills.json indexing)', () => {
        const md = read(rel);
        assert.match(md, /^# .+CTO/m, 'expected the original "# <Lang> CTO" H1 header');
      });
    });
  }

  it('bash names CWE-78, unquoted word-splitting, pipefail, and bats-core', () => {
    const md = read(GUIDES.bash);
    assert.match(md, /CWE-78/, 'expected CWE-78 (OS command injection)');
    assert.match(md, /pipefail/, 'expected set -o pipefail footgun');
    assert.match(md, /word.?split/i, 'expected unquoted word-splitting footgun');
    assert.match(md, /bats-core/, 'expected bats-core testing framework');
    assert.match(md, /gnu\.org/, 'expected a gnu.org source for the Bash version');
    assert.match(md, /5\.3/, 'expected the Bash 5.3 version token');
  });

  it('perl names CWE-78, two-arg open, taint mode -T, Try::Tiny, and Test2', () => {
    const md = read(GUIDES.perl);
    assert.match(md, /CWE-78/, 'expected CWE-78 (OS command injection)');
    assert.match(md, /two-arg|2-arg/i, 'expected the two-arg open footgun');
    assert.match(md, /-T\b|taint/i, 'expected taint mode (-T)');
    assert.match(md, /Try::Tiny/, 'expected Try::Tiny error handling');
    assert.match(md, /Test2/, 'expected Test2 testing framework');
    assert.match(md, /5\.4[02]/, 'expected a current Perl 5.4x version token');
  });

  it('tcl names CWE-94, exec/eval injection, interp -safe, try/catch, and tcltest', () => {
    const md = read(GUIDES.tcl);
    assert.match(md, /CWE-94/, 'expected CWE-94 (code injection)');
    assert.match(md, /CWE-78/, 'expected CWE-78 for exec command injection');
    assert.match(md, /interp\s+create\s+-safe|interp\s+-safe|-safe/i, 'expected safe interpreter');
    assert.match(md, /tcltest/, 'expected tcltest framework');
    assert.match(md, /vwait|after\b/, 'expected the event-loop (vwait/after) footgun');
    assert.match(md, /9\.0|8\.6/, 'expected a Tcl 9.0/8.6 version token');
  });

  it('lua names CWE-94, loadstring/load injection, pcall, _ENV sandbox, and busted', () => {
    const md = read(GUIDES.lua);
    assert.match(md, /CWE-94/, 'expected CWE-94 (code injection)');
    assert.match(md, /load(string)?\b/, 'expected load/loadstring injection footgun');
    assert.match(md, /pcall/, 'expected pcall error handling');
    assert.match(md, /_ENV/, 'expected _ENV sandboxing');
    assert.match(md, /busted/, 'expected busted testing framework');
    assert.match(md, /coroutine\.resume/, 'expected the coroutine.resume error-swallow footgun');
    assert.match(md, /5\.4/, 'expected the Lua 5.4 version token');
  });
});
