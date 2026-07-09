/**
 * CU3 s5 — content-contract tests for the mobile framework guides
 * (react-native.md, flutter.md, expo.md).
 *
 * ZERO DOUBLES: this reads the REAL guide files off disk via fs.readFileSync
 * (mirroring tests/cu3-web-guides.test.js and tests/cu2-dynamic-web-guides.test.js)
 * and asserts substantive structure — no mocks, no fixtures, no fakes. It guards
 * the CU3 acceptance criteria for these three files:
 *   - each guide EXCEEDS the 5-section floor (> 5 "## " sections). All three files
 *     ship with exactly 5 "## " sections, so a naive count would false-green with
 *     zero edits; "> 5" proves real additions;
 *   - the required correction-surface sections are present (framework-specific
 *     footguns + Security/Dependency, Testing, Performance, Version, References);
 *   - each guide names its own concrete identifiers (react-native: New
 *     Architecture / JSI / Fabric / TurboModule + useNativeDriver; flutter:
 *     const + null-safety + a Flutter/Dart version; expo: EAS + expo-updates +
 *     an SDK version);
 *   - an OTA/updates security note is present in react-native and expo;
 *   - at least one dated source (>= 2025) with an http URL is present per guide;
 *   - the original H1 header is intact (skills.json indexing not corrupted).
 *
 * Every version/security fact these guides assert is web-verified against official
 * sources at edit time (reactnative.dev / flutter.dev / docs.flutter.dev /
 * expo.dev / docs.expo.dev / npm registry / GitHub Advisory Database /
 * cwe.mitre.org). This test does NOT re-verify the facts; it guards the substance
 * against a future edit dropping it.
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
  'react-native': 'skills/frameworks/mobile/react-native.md',
  flutter: 'skills/frameworks/mobile/flutter.md',
  expo: 'skills/frameworks/mobile/expo.md',
};

// The floor. All three files start at exactly 5 "## " sections, so "> 5" proves
// each guide gained at least one substantive section.
const FLOOR = 5;

// Sections every de-stubbed correction surface must carry (case-insensitive).
const REQUIRED_SECTIONS = [
  { name: 'Security/Dependency', re: /^##.*(security|dependenc|supply.?chain|ota|update)/im },
  { name: 'Testing', re: /^##.*test/im },
  { name: 'Performance', re: /^##.*performance/im },
  { name: 'Version-specific', re: /^##.*version/im },
  { name: 'References', re: /^##.*(reference|source)/im },
];

function sectionCount(md) {
  return (md.match(/^## /gm) || []).length;
}

describe('CU3 s5 — mobile framework guides are substantive (real files, zero doubles)', () => {
  for (const [name, rel] of Object.entries(GUIDES)) {
    describe(`${name} (${rel})`, () => {
      it(`exceeds the ${FLOOR}-section floor (> ${FLOOR} "## " sections)`, () => {
        const md = read(rel);
        const n = sectionCount(md);
        assert.ok(
          n > FLOOR,
          `expected > ${FLOOR} "## " sections (all three files start at 5), found ${n}`
        );
      });

      it('is well past the ~55-line stub floor', () => {
        const md = read(rel);
        const lines = md.split('\n').length;
        assert.ok(lines > 120, `expected > 120 lines (de-stubbed), found ${lines}`);
      });

      it('has all required correction-surface sections', () => {
        const md = read(rel);
        for (const { name: sname, re } of REQUIRED_SECTIONS) {
          assert.match(md, re, `missing required section: ${sname}`);
        }
      });

      it('carries at least two fenced code blocks (footgun demos)', () => {
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

  it('react-native names the New Architecture (JSI/Fabric/TurboModule), useNativeDriver, Hermes + an OTA-security note', () => {
    const md = read(GUIDES['react-native']);
    assert.match(md, /New Architecture/i, 'expected the "New Architecture" term');
    assert.match(md, /JSI|Fabric|TurboModule/, 'expected a New-Architecture identifier (JSI/Fabric/TurboModule)');
    assert.match(md, /useNativeDriver/, 'expected the useNativeDriver animation footgun');
    assert.match(md, /Hermes/, 'expected the Hermes engine footgun');
    assert.match(md, /bridgeless/i, 'expected the bridgeless mode content');
    assert.match(md, /Metro/, 'expected Metro bundler resolution content');
    // OTA security: integrity / signing named, with a source
    assert.match(md, /OTA|over.?the.?air|CodePush|code.?push/i, 'expected an OTA update mention');
    assert.match(md, /sign|integrity|tamper/i, 'expected an OTA integrity/signing security note');
    // a version token for React Native
    assert.match(md, /0\.7[0-9]|0\.8[0-9]/, 'expected a current React Native version token');
  });

  it('flutter names const rebuild traps, null-safety (late/!), isolates/platform channels + a Flutter/Dart version', () => {
    const md = read(GUIDES.flutter);
    assert.match(md, /const/, 'expected the const-constructor rebuild footgun');
    assert.match(md, /null.?safety|\blate\b/i, 'expected Dart null-safety content (late / null safety)');
    assert.match(md, /isolate/i, 'expected isolate/threading content');
    assert.match(md, /platform channel/i, 'expected platform-channel threading content');
    assert.match(md, /setState/, 'expected setState-scope / rebuild anti-pattern content');
    // Flutter + Dart version tokens
    assert.match(md, /Flutter 3\.\d+/, 'expected a current Flutter version token (Flutter 3.x)');
    assert.match(md, /Dart 3\.\d+/, 'expected a current Dart SDK version token (Dart 3.x)');
  });

  it('expo names managed-vs-bare, EAS Build/Update, expo-updates runtimeVersion, SecureStore + an SDK version', () => {
    const md = read(GUIDES.expo);
    assert.match(md, /managed/i, 'expected managed-workflow content');
    assert.match(md, /bare/i, 'expected bare-workflow content');
    assert.match(md, /EAS/, 'expected EAS Build/Update content');
    assert.match(md, /expo-updates/, 'expected expo-updates content');
    assert.match(md, /runtimeVersion/, 'expected the runtimeVersion policy footgun');
    assert.match(md, /SecureStore/, 'expected the expo-secure-store / SecureStore secret-storage note');
    assert.match(md, /config plugin/i, 'expected config-plugins / prebuild content');
    // OTA security note with integrity/channel discipline
    assert.match(md, /sign|integrity|channel|branch/i, 'expected an OTA integrity/channel security note');
    // Expo SDK version token
    assert.match(md, /SDK 5[0-9]/, 'expected a current Expo SDK version token (SDK 5x)');
  });
});
