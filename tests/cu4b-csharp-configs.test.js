/**
 * CU4b s1 — content-contract tests for the csharp quality-config guides
 * (legacy.md, strict.md, strictest.md).
 *
 * ZERO DOUBLES: this reads the THREE REAL config files off disk via
 * fs.readFileSync (mirroring tests/cu3-web-guides.test.js) and asserts
 * substantive structure — no mocks, no fixtures, no fakes, no stubs. It guards
 * the CU4b s1 acceptance criteria:
 *   - each config EXCEEDS the thin floor (> 5 "## " sections). The three files
 *     started at 3 (legacy) / 5 (strict) / 4 (strictest) sections, so "> 5"
 *     proves real additions on all three;
 *   - well past the stub floor (> 90 lines);
 *   - the required correction-surface sections are present (EditorConfig,
 *     Project File, Coverage, Complexity, Commands, CI);
 *   - each config names concrete C# / .NET 9 identifiers (a net9.0/.NET 9 token,
 *     Nullable, an AnalysisLevel/TreatWarningsAsErrors key, a CA\d+ analyzer id);
 *   - >= 4 code fences (.editorconfig + .csproj + commands blocks);
 *   - at least one dated source (>= 2025) with an http URL per file;
 *   - CROSS-LANGUAGE GUARD: no Kotlin/detekt/ktlint signature token leaked from
 *     the cross-family structural template (kotlin/strictest);
 *   - strictness-gradient guard: legacy is lenient (Nullable>warnings, 50%);
 *     strictest is maximal (TreatWarningsAsErrors>true, 90%).
 *
 * Every version/rule these guides assert is web-verified against official
 * sources at edit time (api.nuget.org package index, learn.microsoft.com code
 * analysis docs, github.com/actions/setup-dotnet). This test does NOT re-verify
 * those facts over the network; it guards the substance against a future edit
 * dropping it.
 */

'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const projectRoot = path.join(__dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(projectRoot, rel), 'utf8');
}

const CONFIGS = {
  legacy: 'skills/quality-configs/csharp/legacy.md',
  strict: 'skills/quality-configs/csharp/strict.md',
  strictest: 'skills/quality-configs/csharp/strictest.md',
};

// The thin floor. legacy started at 3, strictest at 4, strict at 5 "## "
// sections. Asserting "> 5" proves each of the three gained real sections.
const THIN_FLOOR = 5;

// Sections every de-stubbed csharp correction surface must carry (case-insensitive).
const REQUIRED_SECTIONS = [
  { name: 'EditorConfig', re: /^##.*editorconfig/im },
  { name: 'Project File', re: /^##.*project file/im },
  { name: 'Coverage', re: /^##.*coverage/im },
  { name: 'Complexity', re: /^##.*complexity/im },
  { name: 'Commands', re: /^##.*command/im },
  { name: 'CI', re: /^##.*(ci|continuous integration|github actions)/im },
];

// Kotlin/detekt/ktlint signature tokens — MUST be absent (proves no value from
// the cross-family structural template kotlin/strictest.md leaked into a C# guide).
const KOTLIN_TOKENS = [
  /detekt/i,
  /ktlint/i,
  /build\.gradle/i,
  /\bgradlew\b/i,
  /\.kt\b/i,
  /kover/i,
];

function sectionCount(md) {
  return (md.match(/^## /gm) || []).length;
}

describe('CU4b s1 — csharp quality configs are substantive (real files, zero doubles)', () => {
  for (const [name, rel] of Object.entries(CONFIGS)) {
    describe(`${name} (${rel})`, () => {
      it(`exceeds the thin ${THIN_FLOOR}-section floor (> ${THIN_FLOOR} "## " sections)`, () => {
        const md = read(rel);
        const n = sectionCount(md);
        assert.ok(
          n > THIN_FLOOR,
          `expected > ${THIN_FLOOR} "## " sections, found ${n}`
        );
      });

      it('is well past the thin stub floor (> 90 lines)', () => {
        const md = read(rel);
        const lines = md.split('\n').length;
        assert.ok(lines > 90, `expected > 90 lines (de-stubbed), found ${lines}`);
      });

      it('has all required correction-surface sections', () => {
        const md = read(rel);
        for (const { name: sname, re } of REQUIRED_SECTIONS) {
          assert.match(md, re, `missing required section: ${sname}`);
        }
      });

      it('names concrete C# / .NET 9 identifiers', () => {
        const md = read(rel);
        assert.match(md, /\.NET 9|net9\.0/, 'expected a .NET 9 / net9.0 token');
        assert.match(md, /Nullable/, 'expected the Nullable property');
        assert.match(
          md,
          /AnalysisLevel|TreatWarningsAsErrors|WarningsAsErrors/,
          'expected an AnalysisLevel / TreatWarningsAsErrors key'
        );
        assert.match(md, /CA\d{3,4}/, 'expected a CAxxxx analyzer rule id');
      });

      it('carries at least four fenced code blocks (.editorconfig + .csproj + commands)', () => {
        const md = read(rel);
        const fences = (md.match(/^```/gm) || []).length;
        assert.ok(fences >= 4, `expected >= 4 code fences, found ${fences}`);
      });

      it('carries at least one dated source (>= 2025) with an http URL', () => {
        const md = read(rel);
        assert.match(md, /20(2[5-9]|[3-9]\d)/, 'expected a date token >= 2025');
        assert.match(md, /https?:\/\//, 'expected at least one http(s) source URL');
      });

      it('keeps its original H1 header intact (skills.json indexing)', () => {
        const md = read(rel);
        assert.match(md, /^# C#.+Quality Config/m, 'expected the original "# C# ... Quality Config" H1 header');
      });

      it('CROSS-LANGUAGE GUARD: contains no Kotlin/detekt/ktlint template token', () => {
        const md = read(rel);
        for (const re of KOTLIN_TOKENS) {
          assert.doesNotMatch(md, re, `Kotlin/template token leaked into a C# guide: ${re}`);
        }
      });
    });
  }

  it('gradient (lenient end): legacy is Nullable>warnings and 50% coverage', () => {
    const md = read(CONFIGS.legacy);
    assert.match(md, /<Nullable>warnings<\/Nullable>/, 'expected legacy Nullable=warnings');
    assert.match(md, /TreatWarningsAsErrors>false/, 'expected legacy TreatWarningsAsErrors=false');
    assert.match(md, /50%/, 'expected legacy 50% coverage floor');
    assert.match(md, /latest-minimum/, 'expected legacy AnalysisLevel latest-minimum');
  });

  it('gradient (strict middle): strict is Nullable>enable, latest-all, 80% coverage', () => {
    const md = read(CONFIGS.strict);
    assert.match(md, /<Nullable>enable<\/Nullable>/, 'expected strict Nullable=enable');
    assert.match(md, /latest-all/, 'expected strict AnalysisLevel latest-all');
    assert.match(md, /80%/, 'expected strict 80% coverage floor');
    assert.match(md, /EnforceCodeStyleInBuild/, 'expected strict EnforceCodeStyleInBuild');
  });

  it('gradient (maximal end): strictest is TreatWarningsAsErrors>true and 90% coverage', () => {
    const md = read(CONFIGS.strictest);
    assert.match(md, /<TreatWarningsAsErrors>true<\/TreatWarningsAsErrors>/, 'expected strictest TreatWarningsAsErrors=true');
    assert.match(md, /dotnet_analyzer_diagnostic\.severity\s*=\s*error/, 'expected strictest all-analyzers-as-error');
    assert.match(md, /90%/, 'expected strictest 90% coverage floor');
  });

  it('gradient is monotonic across the three files (severity escalates)', () => {
    const legacy = read(CONFIGS.legacy);
    const strictest = read(CONFIGS.strictest);
    // legacy must NOT treat all warnings as errors; strictest must.
    assert.match(legacy, /TreatWarningsAsErrors>false/, 'legacy must not be warnings-as-errors');
    assert.match(strictest, /<TreatWarningsAsErrors>true<\/TreatWarningsAsErrors>/, 'strictest must be warnings-as-errors');
  });
});
