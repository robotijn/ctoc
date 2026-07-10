/**
 * CU4c s11 — content-contract tests for the modern mobile-first language guides
 * (kotlin.md, swift.md, dart.md).
 *
 * ZERO DOUBLES: this reads the REAL guide files off disk via fs.readFileSync
 * (mirroring tests/cu2-systems-guides.test.js) and asserts substantive structure —
 * no mocks, no fixtures, no fakes. It guards the CU4c acceptance criteria for
 * these three files:
 *   - each guide exceeds the 5-section template floor (> 5 "## " sections);
 *   - each guide is well past the ~50-line stub floor (> 120 lines);
 *   - the required correction-surface sections are present (Concurrency/Coroutines/
 *     Isolates, Error Handling, Security/Dependency, Testing, Performance,
 *     Version-specific, References);
 *   - each guide carries >= 4 code fences (>= 2 fenced examples);
 *   - at least one dated source (>= 2025) with an http URL is present per guide;
 *   - the original H1 header is intact (skills.json indexing not corrupted);
 *   - each guide names its own headline correction identifiers.
 *
 * Every version/security fact these guides assert is web-verified against official
 * sources at edit time (kotlinlang.org / endoflife.date / swiftlang GitHub /
 * swift.org / storage.googleapis.com dart-archive / dart.dev / cwe.mitre.org).
 * This test does NOT re-verify the facts; it guards the substance against a future
 * edit dropping it.
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
  kotlin: 'skills/languages/kotlin.md',
  swift: 'skills/languages/swift.md',
  dart: 'skills/languages/dart.md',
};

// Sections every de-stubbed correction surface must carry (case-insensitive).
const REQUIRED_SECTIONS = [
  { name: 'Concurrency/Coroutines/Isolates', re: /^##.*(concurren|coroutine|isolate|async)/im },
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

describe('CU4c s11 — mobile-modern guides are substantive (real files, zero doubles)', () => {
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

  it('kotlin names Kotlin 2.0 + K2 + GlobalScope + CWE-502 + platform types + runTest', () => {
    const md = read(GUIDES.kotlin);
    assert.match(md, /Kotlin\s*2\.0/i, 'expected a "Kotlin 2.0" version token');
    assert.match(md, /\bK2\b/, 'expected the K2 compiler named');
    assert.match(md, /GlobalScope/, 'expected the GlobalScope anti-pattern named');
    assert.match(md, /CWE-502/, 'expected the CWE-502 deserialization class');
    assert.match(md, /platform.?type/i, 'expected Kotlin/Java platform-type null-safety interop');
    assert.match(md, /runTest/, 'expected kotlinx-coroutines-test runTest');
    assert.match(md, /CancellationException/, 'expected the CancellationException rethrow footgun');
    assert.match(md, /kotlinlang\.org/, 'expected the kotlinlang.org source URL');
  });

  it('swift names Swift 6 + @Sendable + @MainActor + actor isolation + Package.resolved', () => {
    const md = read(GUIDES.swift);
    assert.match(md, /Swift\s*6/i, 'expected a "Swift 6" version token');
    assert.match(md, /@Sendable/, 'expected @Sendable enforcement');
    assert.match(md, /@MainActor/, 'expected the @MainActor footgun');
    assert.match(md, /actor isolation/i, 'expected actor isolation content');
    assert.match(md, /Package\.resolved/, 'expected SPM Package.resolved pinning');
    assert.match(md, /CWE-502/, 'expected the CWE-502 deserialization class (NSKeyedUnarchiver)');
    assert.match(md, /\btry!/, 'expected the force-try try! footgun');
    assert.match(md, /swift\.org|developer\.apple\.com|swiftlang/i, 'expected an official Swift source URL');
  });

  it('dart names isolates + sound null safety + Isolate.run + late + unawaited + const', () => {
    const md = read(GUIDES.dart);
    assert.match(md, /isolate/i, 'expected isolate concurrency content');
    assert.match(md, /sound null safety/i, 'expected sound null safety named');
    assert.match(md, /Isolate\.run/, 'expected the Isolate.run message-passing API');
    assert.match(md, /\blate\b/, 'expected the late-misuse footgun');
    assert.match(md, /unawaited/, 'expected the unawaited() future-error footgun');
    assert.match(md, /const constructor/i, 'expected the const-constructor rebuild fix');
    assert.match(md, /Dart\s*3\./i, 'expected a Dart 3.x version token');
    assert.match(md, /dart\.dev|dartlang|googleapis/i, 'expected an official Dart source URL');
  });
});
