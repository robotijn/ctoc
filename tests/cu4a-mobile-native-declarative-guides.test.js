/**
 * CU4a s24 — content-contract tests for the native declarative-UI mobile guides
 * (swiftui.md, jetpack-compose.md, compose-multiplatform.md).
 *
 * ZERO DOUBLES: this reads the REAL guide files off disk via fs.readFileSync
 * (mirroring tests/cu3-data-guides.test.js) and asserts substantive structure —
 * no mocks, no fixtures, no fakes. It guards the CU4a acceptance criteria for
 * these three files:
 *   - each guide exceeds the 5-section template floor (> 5 "## " sections);
 *   - each guide is well past the ~55-line stub floor (> 120 lines);
 *   - the required correction-surface sections are present (footgun/state,
 *     Security, Testing, Performance, Version, References);
 *   - each guide carries >= 4 code fences (>= 2 fenced single-framework demos);
 *   - each guide carries at least one dated source (>= 2025) with an http URL;
 *   - the original H1 "# <Framework> CTO" header is intact (skills.json indexing);
 *   - each guide names its own concrete declarative-UI identifiers:
 *       swiftui            → @StateObject, @Observable, CWE-312;
 *       jetpack-compose    → remember, LaunchedEffect, derivedStateOf;
 *       compose-multiplatform → expect/actual, recomposition, Kotlin.
 *
 * Every version/security fact these guides assert is web-verified against official
 * sources at edit time (maven.google.com compose-bom maven-metadata, Maven Central
 * kotlin-stdlib + compose-gradle-plugin maven-metadata, swiftlang swift_releases.yml,
 * cwe.mitre.org/312). This test does NOT re-verify the facts online; it guards the
 * substance against a future edit dropping it.
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
  swiftui: 'skills/frameworks/mobile/swiftui.md',
  'jetpack-compose': 'skills/frameworks/mobile/jetpack-compose.md',
  'compose-multiplatform': 'skills/frameworks/mobile/compose-multiplatform.md',
};

// Sections every de-stubbed correction surface must carry (case-insensitive).
const REQUIRED_SECTIONS = [
  { name: 'State/Footgun', re: /^##.*(state|footgun|recomposition|identity|cross-?platform)/im },
  { name: 'Security', re: /^##.*security/im },
  { name: 'Testing', re: /^##.*test/im },
  { name: 'Performance', re: /^##.*performance/im },
  { name: 'Version-specific', re: /^##.*version/im },
  { name: 'References', re: /^##.*(reference|source)/im },
];

function sectionCount(md) {
  return (md.match(/^## /gm) || []).length;
}

describe('CU4a s24 — native declarative-UI mobile guides are substantive (real files, zero doubles)', () => {
  for (const [fw, rel] of Object.entries(GUIDES)) {
    describe(`${fw} (${rel})`, () => {
      it('exceeds the 5-section template floor (> 5 "## " sections)', () => {
        const md = read(rel);
        const n = sectionCount(md);
        assert.ok(n > 5, `expected > 5 "## " sections, found ${n}`);
      });

      it('is well past the ~55-line stub floor', () => {
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

      it('carries at least two fenced single-framework code examples', () => {
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
        assert.match(md, /^# .+CTO/m, 'expected the original "# <Framework> CTO" H1 header');
      });
    });
  }

  it('swiftui names @State/@StateObject/@ObservedObject identity, @Observable, Keychain CWE-312', () => {
    const md = read(GUIDES.swiftui);
    assert.match(md, /@StateObject/, 'expected @StateObject content');
    assert.match(md, /@ObservedObject/, 'expected @ObservedObject content');
    assert.match(md, /@Observable/, 'expected @Observable content');
    assert.match(md, /identity|\.id\(/i, 'expected view-identity footgun content');
    assert.match(md, /Keychain/i, 'expected Keychain secure-storage content');
    assert.match(md, /CWE-312/, 'expected the CWE-312 cleartext-storage token');
    assert.match(md, /Swift 6/, 'expected a Swift 6 version token');
  });

  it('jetpack-compose names remember, LaunchedEffect, derivedStateOf, stability, Keystore CWE-312', () => {
    const md = read(GUIDES['jetpack-compose']);
    assert.match(md, /\bremember\b/, 'expected remember content');
    assert.match(md, /LaunchedEffect/, 'expected LaunchedEffect side-effect content');
    assert.match(md, /derivedStateOf/, 'expected derivedStateOf content');
    assert.match(md, /stab(le|ility)|skippab/i, 'expected stability/skippability content');
    assert.match(md, /recomposition/i, 'expected recomposition-scope content');
    assert.match(md, /Keystore|EncryptedSharedPreferences/i, 'expected Keystore secure-storage content');
    assert.match(md, /CWE-312/, 'expected the CWE-312 cleartext-storage token');
    assert.match(md, /compose-bom|BOM/i, 'expected a Compose BOM version token');
  });

  it('compose-multiplatform names expect/actual, recomposition, Kotlin, resource + CWE-312', () => {
    const md = read(GUIDES['compose-multiplatform']);
    assert.match(md, /expect\/actual|expect\b.*\bactual/is, 'expected expect/actual content');
    assert.match(md, /recomposition/i, 'expected recomposition content');
    assert.match(md, /Kotlin/, 'expected a Kotlin version token');
    assert.match(md, /resource/i, 'expected resource-handling content');
    assert.match(md, /UIKitView|iOS interop|interop/i, 'expected iOS interop content');
    assert.match(md, /CWE-312/, 'expected the CWE-312 cleartext-storage token');
    assert.match(md, /Compose Multiplatform|CMP/i, 'expected a Compose Multiplatform version token');
  });
});
