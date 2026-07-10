/**
 * CU4a s25 — content-contract tests for the .NET & hybrid-mobile framework
 * guides (maui.md, xamarin.md, ionic.md, capacitor.md, nativescript.md).
 *
 * ZERO DOUBLES: this reads the REAL guide files off disk via fs.readFileSync
 * (mirroring tests/cu3-data-guides.test.js and
 * tests/cu4a-aiml-numeric-frameworks-guides.test.js) and asserts substantive
 * structure — no mocks, no fixtures, no fakes. It guards the CU4a acceptance
 * criteria for these five files:
 *   - each guide exceeds the 5-section template floor (> 5 "## " sections);
 *   - each guide is well past the ~55-line stub floor (> 120 lines);
 *   - the required correction-surface sections are present (footgun/lifecycle,
 *     Error Handling, Security/Dependency, Testing, Performance, Version,
 *     References);
 *   - each guide carries >= 4 code fences (>= 2 single-framework examples);
 *   - at least one dated source (>= 2025) with an http URL is present per guide;
 *   - the original H1 "# <Framework> CTO" header is intact (skills.json indexing);
 *   - each guide names its own concrete, web-verified identifiers.
 *
 * Every version/security fact these guides assert is web-verified against official
 * sources at edit time:
 *   - maui/xamarin: nuget.org (Microsoft.Maui.Controls 10.0.80 = .NET 10, published
 *     2026-06-24) + dotnet.microsoft.com support policy (Xamarin EOL May 1, 2024);
 *   - ionic: npmjs.org (@ionic/core 8.8.13, published 2026-07-01);
 *   - capacitor: npmjs.org (@capacitor/core 8.4.1, published 2026-06-19) +
 *     capacitorjs.com/docs/config + /docs/guides/security;
 *   - nativescript: npmjs.org (@nativescript/core 9.0.20, published 2026-05-27) +
 *     docs.nativescript.org/guide/marshalling + /multithreading;
 *   - CWE ids: cwe.mitre.org/79 (XSS) and cwe.mitre.org/312 (cleartext storage).
 * This test does NOT re-verify the facts against the network; it guards the
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
  maui: 'skills/frameworks/mobile/maui.md',
  xamarin: 'skills/frameworks/mobile/xamarin.md',
  ionic: 'skills/frameworks/mobile/ionic.md',
  capacitor: 'skills/frameworks/mobile/capacitor.md',
  nativescript: 'skills/frameworks/mobile/nativescript.md',
};

// Sections every de-stubbed correction surface must carry (case-insensitive).
const REQUIRED_SECTIONS = [
  { name: 'Footgun/Lifecycle/Bridge/Runtime', re: /^##.*(footgun|lifecycle|bridge|webview|runtime|eol|migration)/im },
  { name: 'Error Handling', re: /^##.*error.?handling/im },
  { name: 'Security', re: /^##.*(security|secure)/im },
  { name: 'Testing', re: /^##.*test/im },
  { name: 'Performance', re: /^##.*performance/im },
  { name: 'Version-specific', re: /^##.*version/im },
  { name: 'References', re: /^##.*(reference|source)/im },
];

function sectionCount(md) {
  return (md.match(/^## /gm) || []).length;
}

describe('CU4a s25 — .NET & hybrid-mobile guides are substantive (real files, zero doubles)', () => {
  for (const [fw, rel] of Object.entries(GUIDES)) {
    describe(`${fw} (${rel})`, () => {
      it('exceeds the 5-section template floor (> 5 "## " sections)', () => {
        const md = read(rel);
        const n = sectionCount(md);
        assert.ok(n > 5, `expected > 5 "## " sections, found ${n}`);
      });

      it('is well past the ~55-line stub floor (> 120 lines)', () => {
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

      it('carries >= 4 code fences (>= 2 single-framework examples)', () => {
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

  it('maui names handler mappers, MainThread, SecureStorage/CWE-312, DI lifetime, and a .NET 10 version token', () => {
    const md = read(GUIDES.maui);
    assert.match(md, /handler/i, 'expected handler/mapper content');
    assert.match(md, /MainThread/, 'expected MainThread.BeginInvokeOnMainThread content');
    assert.match(md, /SecureStorage/, 'expected SecureStorage content');
    assert.match(md, /CWE-312/, 'expected the CWE-312 cleartext-storage token');
    assert.match(md, /lifetime|Transient|Singleton|Scoped/i, 'expected DI lifetime content');
    assert.match(md, /Shell/, 'expected Shell navigation content');
    assert.match(md, /\.NET 10|10\.0\.80/, 'expected a .NET 10 / MAUI 10.0.80 version token');
  });

  it('xamarin names EOL May 2024, migrate to MAUI, upgrade-assistant, SecureStorage/CWE-312', () => {
    const md = read(GUIDES.xamarin);
    assert.match(md, /EOL|end of support|end-of-support/i, 'expected EOL content');
    assert.match(md, /May 1, 2024|May 2024/, 'expected the May 1, 2024 EOL date');
    assert.match(md, /MAUI/, 'expected .NET MAUI migration target');
    assert.match(md, /migrate|migration/i, 'expected migration content');
    assert.match(md, /upgrade-assistant|upgrade assistant/i, 'expected .NET Upgrade Assistant content');
    assert.match(md, /MessagingCenter/, 'expected MessagingCenter deprecation content');
    assert.match(md, /CWE-312/, 'expected the CWE-312 cleartext-storage token');
  });

  it('ionic names WebView XSS/CWE-79, innerHTML, Capacitor, CSP, and an 8.x version token', () => {
    const md = read(GUIDES.ionic);
    assert.match(md, /WebView/, 'expected WebView content');
    assert.match(md, /CWE-79/, 'expected the CWE-79 XSS token');
    assert.match(md, /innerHTML/, 'expected innerHTML sanitization content');
    assert.match(md, /Capacitor/, 'expected Capacitor plugin-bridge content');
    assert.match(md, /CSP|Content-Security-Policy/i, 'expected CSP content');
    assert.match(md, /Ionic 8|8\.8/i, 'expected an Ionic 8.x version token');
  });

  it('capacitor names allowNavigation, server.url, CWE-79, Preferences/CWE-312, and an 8.x version token', () => {
    const md = read(GUIDES.capacitor);
    assert.match(md, /allowNavigation/, 'expected allowNavigation scope content');
    assert.match(md, /server\.url/, 'expected server.url live-reload content');
    assert.match(md, /CWE-79/, 'expected the CWE-79 WebView-XSS token');
    assert.match(md, /Preferences/, 'expected Preferences-plugin content');
    assert.match(md, /CWE-312/, 'expected the CWE-312 cleartext-storage token');
    assert.match(md, /Capacitor 8|8\.4/i, 'expected a Capacitor 8.x version token');
  });

  it('nativescript names marshalling, main thread, native API, memory, and a 8.x/9.x version token', () => {
    const md = read(GUIDES.nativescript);
    assert.match(md, /marshalling/i, 'expected native-API marshalling content');
    assert.match(md, /main thread/i, 'expected main-thread blocking content');
    assert.match(md, /native API/i, 'expected direct native-API access content');
    assert.match(md, /memory|reference/i, 'expected memory / native-object-reference content');
    assert.match(md, /Worker/, 'expected Worker off-thread content');
    assert.match(md, /NativeScript 9|9\.0|8\.9/i, 'expected a NativeScript 9.x version token');
  });
});
