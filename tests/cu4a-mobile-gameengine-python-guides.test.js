/**
 * CU4a s26 — content-contract tests for the game-engine & Python-mobile
 * framework guides (unity.md, unreal.md, kivy.md, beeware.md).
 *
 * ZERO DOUBLES: reads the REAL guide files off disk via fs.readFileSync
 * (mirroring tests/cu3-data-guides.test.js) and asserts substantive structure
 * — no mocks, no fixtures, no fakes. Guards the CU4a acceptance criteria for
 * these four files:
 *   - each guide exceeds the 5-section template floor (> 5 "## " sections);
 *   - each guide is well past the ~55-line stub floor (> 120 lines);
 *   - the required correction-surface sections are present (footgun/memory/
 *     threading, Error/Correctness, Security/Dependency, Testing, Performance,
 *     Version, References);
 *   - each guide names its own concrete framework identifiers (proving
 *     substance, not padding);
 *   - at least one dated source (>= 2025) with an http URL is present per guide;
 *   - the original H1 "# <Framework> CTO" header is intact (skills.json indexing).
 *
 * Every version/security fact these guides assert is web-verified against
 * official sources at edit time (pypi.org JSON API for kivy/buildozer/toga/
 * briefcase, unity.com release archive, dev.epicgames.com docs, cwe.mitre.org).
 * This test does NOT re-verify the live facts; it guards the substance against
 * a future edit dropping it.
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
  unity: 'skills/frameworks/mobile/unity.md',
  unreal: 'skills/frameworks/mobile/unreal.md',
  kivy: 'skills/frameworks/mobile/kivy.md',
  beeware: 'skills/frameworks/mobile/beeware.md',
};

// Sections every de-stubbed correction surface must carry (case-insensitive).
const REQUIRED_SECTIONS = [
  { name: 'Footgun/Memory/Threading', re: /^##.*(footgun|memory|threading|garbage|allocation|concurren)/im },
  { name: 'Error/Correctness', re: /^##.*(error|correctness|replication|main.?thread|serial)/im },
  { name: 'Security/Dependency', re: /^##.*(security|dependenc|injection|provenance)/im },
  { name: 'Testing', re: /^##.*test/im },
  { name: 'Performance', re: /^##.*performance/im },
  { name: 'Version-specific', re: /^##.*version/im },
  { name: 'References', re: /^##.*(reference|source)/im },
];

function sectionCount(md) {
  return (md.match(/^## /gm) || []).length;
}

describe('CU4a s26 — game-engine & Python-mobile guides are substantive (real files, zero doubles)', () => {
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

      it('carries at least four code fences (>= 2 fenced examples)', () => {
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

  it('unity names Update hot-path, object pooling, FixedUpdate, and IL2CPP/serialization footguns', () => {
    const md = read(GUIDES.unity);
    assert.match(md, /Update/, 'expected Update hot-path content');
    assert.match(md, /object pool/i, 'expected object-pooling content');
    assert.match(md, /FixedUpdate/, 'expected FixedUpdate physics content');
    assert.match(md, /GetComponent/, 'expected GetComponent-in-hot-loop content');
    assert.match(md, /coroutine|Awaitable/i, 'expected coroutine-vs-async content');
    assert.match(md, /IL2CPP/, 'expected IL2CPP content');
    assert.match(md, /CWE-502/, 'expected the CWE-502 deserialization token (AssetBundle/serialization)');
    assert.match(md, /6000\.|Unity 6/i, 'expected a Unity 6 (6000.x) version token');
  });

  it('unreal names UPROPERTY GC reachability, tick, TWeakObjectPtr, replication, and pak footguns', () => {
    const md = read(GUIDES.unreal);
    assert.match(md, /UPROPERTY/, 'expected UPROPERTY GC-reachability content');
    assert.match(md, /\btick\b/i, 'expected tick-cost content');
    assert.match(md, /TWeakObjectPtr/, 'expected TWeakObjectPtr content');
    assert.match(md, /replicat/i, 'expected replication/RPC content');
    assert.match(md, /Blueprint/i, 'expected Blueprint-vs-C\\+\\+ content');
    assert.match(md, /\.pak|pak file/i, 'expected untrusted-pak content');
    assert.match(md, /CWE-502/, 'expected the CWE-502 deserialization token');
    assert.match(md, /5\.6|5\.7|5\.8|UE 5/i, 'expected an Unreal Engine 5.x version token');
  });

  it('kivy names @mainthread, Clock, KV language, buildozer, and CWE-94 KV-injection footguns', () => {
    const md = read(GUIDES.kivy);
    assert.match(md, /@mainthread/, 'expected @mainthread content');
    assert.match(md, /Clock/, 'expected Clock scheduling content');
    assert.match(md, /KV language|kv-lang|KV-lang/i, 'expected KV-language content');
    assert.match(md, /buildozer/i, 'expected buildozer packaging content');
    assert.match(md, /CWE-94/, 'expected the CWE-94 code-injection token');
    assert.match(md, /kivy 2\.3|Kivy 2\./i, 'expected a Kivy 2.3.x version token');
  });

  it('beeware names Briefcase, Toga parity, async event loop, provenance, and version tokens', () => {
    const md = read(GUIDES.beeware);
    assert.match(md, /Briefcase/, 'expected Briefcase packaging content');
    assert.match(md, /Toga/, 'expected Toga native-widget-parity content');
    assert.match(md, /async/, 'expected async event-loop content');
    assert.match(md, /add_background_task/, 'expected add_background_task content');
    assert.match(md, /provenance|supply.?chain|CWE-1357|dependency/i, 'expected bundled-dependency provenance content');
    assert.match(md, /Toga 0\.5|Briefcase 0\.4/i, 'expected a Toga 0.5.x / Briefcase 0.4.x version token');
  });
});
