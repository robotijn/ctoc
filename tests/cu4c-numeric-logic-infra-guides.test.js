/**
 * CU4c s10 — content-contract tests for the numeric, logic & infra language
 * guides (julia.md, prolog.md, terraform.md, powershell.md).
 *
 * ZERO DOUBLES: this reads the REAL guide files off disk via fs.readFileSync
 * (mirroring tests/cu2-systems-guides.test.js) and asserts substantive
 * structure — no mocks, no fixtures, no fakes. It guards the CU4c acceptance
 * criteria for these four domain-singleton files:
 *   - each guide exceeds the 5-section template floor (> 5 "## " sections);
 *   - each guide is well past the ~50-line stub floor (> 120 lines);
 *   - the required correction-surface sections are present (the
 *     concurrency-equivalent — Concurrency / Control-Flow / Lifecycle /
 *     Pipeline — plus Error Handling, Security/Dependency, Testing,
 *     Performance, Version-specific, References);
 *   - each guide carries >= 4 code fences (>= 2 fenced examples);
 *   - each guide carries at least one dated source (>= 2025) with an http URL;
 *   - the original H1 header is intact (skills.json indexing not corrupted);
 *   - each guide names its own domain security class + concrete identifiers:
 *       julia:      @inbounds + @code_warntype + CWE-125
 *       prolog:     cut `!` + CWE-94 + PlUnit
 *       terraform:  CWE-312 + for_each + tfsec
 *       powershell: CWE-94 + Pester + the execution-policy-is-not-security caveat
 *
 * Every version/security fact these guides assert is web-verified against
 * official sources at edit time (endoflife.date · julialang.org ·
 * swi-prolog.org · developer.hashicorp.com/terraform · opentofu.org ·
 * learn.microsoft.com/powershell · cwe.mitre.org). This test does NOT
 * re-verify those facts; it guards the substance against a future edit
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
  julia: 'skills/languages/julia.md',
  prolog: 'skills/languages/prolog.md',
  terraform: 'skills/languages/terraform.md',
  powershell: 'skills/languages/powershell.md',
};

// Sections every de-stubbed correction surface must carry (case-insensitive).
// The concurrency slot is broadened to the concurrency-equivalent for the
// declarative / logic / shell domains (Control-Flow, Lifecycle, Pipeline).
const REQUIRED_SECTIONS = [
  {
    name: 'Concurrency-equivalent',
    re: /^##.*(concurren|control.?flow|lifecycle|pipeline|thread|parallel)/im,
  },
  { name: 'Error Handling', re: /^##.*(error.?handling|safety.?idiom)/im },
  { name: 'Security/Dependency', re: /^##.*(security|dependenc|supply.?chain)/im },
  { name: 'Testing', re: /^##.*test/im },
  { name: 'Performance', re: /^##.*performance/im },
  { name: 'Version-specific', re: /^##.*version/im },
  { name: 'References', re: /^##.*(reference|source)/im },
];

function sectionCount(md) {
  return (md.match(/^## /gm) || []).length;
}

describe('CU4c s10 — numeric/logic/infra guides are substantive (real files, zero doubles)', () => {
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

  it('julia names @inbounds, @code_warntype, type instability, and CWE-125', () => {
    const md = read(GUIDES.julia);
    assert.match(md, /@inbounds/, 'expected @inbounds bounds-check footgun');
    assert.match(md, /@code_warntype/, 'expected @code_warntype type-stability tool');
    assert.match(md, /type.?instab/i, 'expected type instability performance trap');
    assert.match(md, /CWE-125/, 'expected CWE-125 (out-of-bounds read)');
    assert.match(md, /@testset/, 'expected the Test stdlib @testset convention');
    assert.match(md, /julialang\.org|endoflife\.date/, 'expected an official Julia source URL');
  });

  it('prolog names the cut, negation-as-failure, CWE-94, PlUnit, and safe_goal', () => {
    const md = read(GUIDES.prolog);
    assert.match(md, /cut\b|`!`|\(`!`\)/i, 'expected the cut (!) control footgun');
    assert.match(md, /\\\+/, 'expected negation-as-failure (\\+)');
    assert.match(md, /CWE-94/, 'expected CWE-94 (code injection)');
    assert.match(md, /PlUnit/i, 'expected the PlUnit testing framework');
    assert.match(md, /safe_goal/, 'expected SWI safe_goal/1 sandboxing');
    assert.match(md, /swi-prolog\.org|swi-prolog|github\.com\/SWI-Prolog/i, 'expected an official SWI-Prolog source');
  });

  it('terraform names CWE-312, state locking, for_each vs count, tfsec, and the BUSL/OpenTofu split', () => {
    const md = read(GUIDES.terraform);
    assert.match(md, /CWE-312/, 'expected CWE-312 (cleartext storage of secrets in state)');
    assert.match(md, /state locking|state.?lock/i, 'expected state locking footgun');
    assert.match(md, /for_each/, 'expected for_each vs count trap');
    assert.match(md, /tfsec|checkov/i, 'expected a policy-as-code scanner (tfsec/checkov)');
    assert.match(md, /terraform test|\.tftest\.hcl/i, 'expected native terraform test');
    assert.match(md, /BUSL|BSL|Business Source License|OpenTofu/i, 'expected the BUSL/OpenTofu license context');
    assert.match(md, /developer\.hashicorp\.com|opentofu\.org|endoflife\.date/, 'expected an official Terraform/OpenTofu source');
  });

  it('powershell names Invoke-Expression, CWE-94, Pester, and the execution-policy-is-not-security caveat', () => {
    const md = read(GUIDES.powershell);
    assert.match(md, /Invoke-Expression/, 'expected the Invoke-Expression injection footgun');
    assert.match(md, /CWE-94/, 'expected CWE-94 (code injection)');
    assert.match(md, /Pester/, 'expected the Pester testing framework');
    assert.match(md, /PSScriptAnalyzer/, 'expected the PSScriptAnalyzer linter');
    // Execution policy must be explicitly flagged as NOT a security boundary.
    assert.match(
      md,
      /execution.?policy[\s\S]{0,120}(not|isn.?t|never)[\s\S]{0,40}(security|boundary)|(not|never)[\s\S]{0,40}(a )?security[\s\S]{0,80}execution.?policy/i,
      'expected the "execution policy is NOT a security boundary" caveat',
    );
    assert.match(md, /ForEach-Object -Parallel|\$using:/, 'expected the ForEach-Object -Parallel / $using: scope footgun');
    assert.match(md, /learn\.microsoft\.com|endoflife\.date/, 'expected an official PowerShell source');
  });
});
