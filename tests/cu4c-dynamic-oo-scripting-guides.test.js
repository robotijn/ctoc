/**
 * CU4c s4 — content-contract tests for the dynamic-OO scripting language guides
 * (ruby.md, php.md, groovy.md, coffeescript.md).
 *
 * ZERO DOUBLES: this reads the REAL guide files off disk via fs.readFileSync
 * (mirroring tests/cu2-systems-guides.test.js) and asserts substantive structure —
 * no mocks, no fixtures, no fakes. It guards the CU4c s4 acceptance criteria for
 * these four files:
 *   - each guide exceeds the 5-section template floor (> 5 "## " sections);
 *   - each guide is well past the ~50-line stub floor (> 120 lines);
 *   - the required correction-surface sections are present (Concurrency/Async/Legacy,
 *     Error Handling, Security/Dependency, Testing, Performance, Version, References);
 *   - each guide carries >= 4 code fences (>= 2 fenced examples);
 *   - each guide carries at least one dated source (>= 2025) with an http URL;
 *   - the original "# <Lang> CTO" H1 header is intact (skills.json indexing);
 *   - per-language concrete identifiers are named (footgun anchors, real CWE ids).
 *
 * Every fact these guides assert is web-verified against official sources at edit
 * time (ruby-lang.org / php.net / groovy-lang.org / groovy.apache.org /
 * coffeescript.org / cwe.mitre.org). This test does NOT re-verify the facts against
 * the network; it guards the substance on disk against a future edit dropping it.
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
  ruby: 'skills/languages/ruby.md',
  php: 'skills/languages/php.md',
  groovy: 'skills/languages/groovy.md',
  coffeescript: 'skills/languages/coffeescript.md',
};

// Sections every de-stubbed correction surface must carry (case-insensitive).
// The first slot accepts Concurrency (ruby/php/groovy) OR Async/Legacy (coffeescript).
const REQUIRED_SECTIONS = [
  { name: 'Concurrency/Async/Legacy', re: /^##.*(concurren|async|fiber|ractor|legacy|migration)/im },
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

describe('CU4c s4 — dynamic-OO scripting guides are substantive (real files, zero doubles)', () => {
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

      it('keeps its original "# <Lang> CTO" H1 header intact (skills.json indexing)', () => {
        const md = read(rel);
        assert.match(md, /^# .+CTO/m, 'expected the original "# <Lang> CTO" H1 header');
      });
    });
  }

  it('ruby names YJIT, Ractor, Ruby 3.4, YAML.safe_load, and CWE-502 deserialization', () => {
    const md = read(GUIDES.ruby);
    assert.match(md, /YJIT/, 'expected YJIT content');
    assert.match(md, /Ractor/, 'expected Ractor concurrency content');
    assert.match(md, /Ruby 3\.4/, 'expected a "Ruby 3.4" version token');
    assert.match(md, /CWE-502/, 'expected CWE-502 deserialization reference');
    assert.match(md, /YAML\.safe_load/, 'expected YAML.safe_load safe-deserialization guidance');
    assert.match(md, /rescue StandardError/, 'expected the bare-rescue / StandardError idiom');
    assert.match(md, /cwe\.mitre\.org/, 'expected the cwe.mitre.org authoritative URL');
  });

  it('php names CWE-502, CWE-89, unserialize, PDO prepared statements, OPcache', () => {
    const md = read(GUIDES.php);
    assert.match(md, /CWE-502/, 'expected CWE-502 deserialization reference');
    assert.match(md, /CWE-89/, 'expected CWE-89 SQL injection reference');
    assert.match(md, /unserialize/, 'expected unserialize() deserialization footgun');
    assert.match(md, /PDO/, 'expected PDO prepared statements guidance');
    assert.match(md, /OPcache/i, 'expected OPcache performance guidance');
    assert.match(md, /Fiber/, 'expected Fiber concurrency content');
    assert.match(md, /cwe\.mitre\.org/, 'expected the cwe.mitre.org authoritative URL');
  });

  it('groovy names CWE-502, CWE-94, GroovyShell, Spock, @CompileStatic', () => {
    const md = read(GUIDES.groovy);
    assert.match(md, /CWE-502/, 'expected CWE-502 JVM deserialization reference');
    assert.match(md, /CWE-94/, 'expected CWE-94 code injection reference');
    assert.match(md, /GroovyShell/, 'expected GroovyShell/Eval injection footgun');
    assert.match(md, /Spock/, 'expected the Spock testing framework');
    assert.match(md, /@CompileStatic/, 'expected @CompileStatic performance/typing guidance');
    assert.match(md, /org\.apache\.groovy/, 'expected the Groovy 4 coordinate change');
    assert.match(md, /cwe\.mitre\.org/, 'expected the cwe.mitre.org authoritative URL');
  });

  it('coffeescript names CWE-94, backtick passthrough, Mocha, and a TypeScript-migration token', () => {
    const md = read(GUIDES.coffeescript);
    assert.match(md, /CWE-94/, 'expected CWE-94 code injection reference');
    assert.match(md, /backtick/i, 'expected the backtick JS-passthrough footgun');
    assert.match(md, /Mocha/, 'expected the Mocha testing framework');
    assert.match(md, /TypeScript/, 'expected a TypeScript-migration recommendation (legacy framing)');
    assert.match(md, /legacy|maintenance/i, 'expected an honest legacy/maintenance framing');
    assert.match(md, /coffeescript\.org/, 'expected the coffeescript.org authoritative URL');
  });
});
