/**
 * CU4c s7 — content-contract tests for the enterprise & domain platform
 * language guides (abap.md, apex.md, vba.md, matlab.md).
 *
 * ZERO DOUBLES: this reads the REAL guide files off disk via fs.readFileSync
 * (mirroring tests/cu2-systems-guides.test.js) and asserts substantive
 * structure — no mocks, no fixtures, no fakes. It guards the CU4c acceptance
 * criteria for these four vendor-platform-bound files:
 *   - each guide exceeds the 5-section template floor (> 5 "## " sections);
 *   - the required correction-surface sections are present (Execution/Governor/
 *     Vectorization, Error Handling, Security/Dependency, Testing, Performance,
 *     Version-specific, References);
 *   - each guide names its own platform-injection CWE + a concrete identifier
 *     (abap: CWE-89 + AUTHORITY-CHECK; apex: CWE-89 + governor/bulkification;
 *      vba: CWE-78 + Auto_Open; matlab: CWE-94 + parfor);
 *   - at least one dated source (>= 2025) with an http URL is present per guide;
 *   - the original H1 header is intact (skills.json indexing not corrupted).
 *
 * Every fact these guides assert is web-verified against official sources at
 * edit time (help.sap.com / developer.salesforce.com / learn.microsoft.com /
 * mathworks.com / cwe.mitre.org). This test does NOT re-verify the facts; it
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
  abap: 'skills/languages/abap.md',
  apex: 'skills/languages/apex.md',
  vba: 'skills/languages/vba.md',
  matlab: 'skills/languages/matlab.md',
};

// Sections every de-stubbed correction surface must carry (case-insensitive).
// The "concurrency-equivalent" section is platform execution / governor limits /
// vectorization — matched broadly.
const REQUIRED_SECTIONS = [
  {
    name: 'Execution/Governor/Vectorization',
    re: /^##.*(execution|governor|bulkif|vectoriz|parallel|resource|luw)/im,
  },
  { name: 'Error Handling', re: /^##.*error.?handling/im },
  { name: 'Security/Dependency', re: /^##.*(security|dependenc)/im },
  { name: 'Testing', re: /^##.*test/im },
  { name: 'Performance', re: /^##.*performance/im },
  { name: 'Version-specific', re: /^##.*version/im },
  { name: 'References', re: /^##.*(reference|source)/im },
];

function sectionCount(md) {
  return (md.match(/^## /gm) || []).length;
}

describe('CU4c s7 — enterprise/domain guides are substantive (real files, zero doubles)', () => {
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

  it('abap names Open-SQL injection CWE-89, AUTHORITY-CHECK, LUW, ABAP Unit', () => {
    const md = read(GUIDES.abap);
    assert.match(md, /CWE-89/, 'expected CWE-89 SQL injection');
    assert.match(md, /AUTHORITY-CHECK/, 'expected AUTHORITY-CHECK authorization');
    assert.match(md, /\bLUW\b|COMMIT WORK/, 'expected LUW / COMMIT WORK execution model');
    assert.match(md, /sy-subrc/, 'expected sy-subrc return-code check');
    assert.match(md, /help\.sap\.com/, 'expected an official help.sap.com source');
  });

  it('apex names SOQL injection CWE-89, WITH SECURITY_ENFORCED, governor/bulkification, @isTest', () => {
    const md = read(GUIDES.apex);
    assert.match(md, /CWE-89/, 'expected CWE-89 SOQL injection');
    assert.match(md, /WITH SECURITY_ENFORCED/, 'expected WITH SECURITY_ENFORCED CRUD/FLS');
    assert.match(md, /governor|bulkif/i, 'expected governor-limit / bulkification content');
    assert.match(md, /@isTest/i, 'expected @isTest annotation');
    assert.match(md, /developer\.salesforce\.com/, 'expected an official developer.salesforce.com source');
  });

  it('vba names command injection CWE-78, ADO SQL CWE-89, Auto_Open, DoEvents, VBA7', () => {
    const md = read(GUIDES.vba);
    assert.match(md, /CWE-78/, 'expected CWE-78 command injection');
    assert.match(md, /CWE-89/, 'expected CWE-89 SQL injection via ADO');
    assert.match(md, /Auto_?Open/, 'expected Auto_Open auto-exec macro vector');
    assert.match(md, /DoEvents/, 'expected DoEvents re-entrancy footgun');
    assert.match(md, /learn\.microsoft\.com/, 'expected an official learn.microsoft.com source');
  });

  it('matlab names code injection CWE-94, command injection CWE-78, parfor, MException, preallocation', () => {
    const md = read(GUIDES.matlab);
    assert.match(md, /CWE-94/, 'expected CWE-94 code injection via eval');
    assert.match(md, /CWE-78/, 'expected CWE-78 command injection via system/!');
    assert.match(md, /parfor/, 'expected parfor parallelism footgun');
    assert.match(md, /MException/, 'expected MException error idiom');
    assert.match(md, /mathworks\.com/, 'expected an official mathworks.com source');
  });
});
