/**
 * CU4c s5 — content-contract tests for the modern systems language guides
 * (zig.md, nim.md, crystal.md, d.md).
 *
 * ZERO DOUBLES: this reads the REAL guide files off disk via fs.readFileSync
 * (mirroring tests/cu2-systems-guides.test.js) and asserts substantive
 * structure — no mocks, no fixtures, no fakes. It guards the CU4c acceptance
 * criteria for these four modern C-adjacent systems guides:
 *   - each guide exceeds the 5-section template floor (> 5 "## " sections);
 *   - each guide is well past the ~50-line stub floor (> 120 lines);
 *   - the required correction-surface sections are present (Memory/Concurrency,
 *     Error Handling, Security/Dependency, Testing, Performance, Version, References);
 *   - each guide carries >= 4 code fences (>= 2 fenced examples);
 *   - each guide carries at least one dated source (>= 2025) with an http URL;
 *   - the original H1 header is intact (skills.json indexing not corrupted);
 *   - each guide names its own concrete identifiers;
 *   - each guide names at least one memory-safety CWE class (C-adjacent domain).
 *
 * Every version/CWE/tool fact these guides assert is web-verified against
 * official sources at edit time (ziglang.org / nim-lang.org / crystal-lang.org /
 * dlang.org / cwe.mitre.org / endoflife.date). This test does NOT re-verify the
 * facts; it guards the substance against a future edit dropping it.
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
  zig: 'skills/languages/zig.md',
  nim: 'skills/languages/nim.md',
  crystal: 'skills/languages/crystal.md',
  d: 'skills/languages/d.md',
};

// Sections every de-stubbed correction surface must carry (case-insensitive).
const REQUIRED_SECTIONS = [
  { name: 'Memory/Concurrency', re: /^##.*(memor|concurren|alloc|fiber|gc|thread)/im },
  { name: 'Error Handling', re: /^##.*error.?handling/im },
  { name: 'Security/Dependency', re: /^##.*(security|dependenc|supply.?chain)/im },
  { name: 'Testing', re: /^##.*test/im },
  { name: 'Performance', re: /^##.*performance/im },
  { name: 'Version-specific', re: /^##.*version/im },
  { name: 'References', re: /^##.*(reference|source)/im },
];

// Memory-safety CWE classes inherited from the C-adjacent domain.
const MEM_SAFETY_CWE = /CWE-(416|787|125|190)/;

function sectionCount(md) {
  return (md.match(/^## /gm) || []).length;
}

describe('CU4c s5 — modern systems guides are substantive (real files, zero doubles)', () => {
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

      it('names at least one memory-safety CWE class (C-adjacent domain)', () => {
        const md = read(rel);
        assert.match(md, MEM_SAFETY_CWE, 'expected a memory-safety CWE (416/787/125/190)');
      });
    });
  }

  it('zig names errdefer, CWE-416, a 0.x version token, and a build mode', () => {
    const md = read(GUIDES.zig);
    assert.match(md, /errdefer/, 'expected errdefer cleanup-on-error');
    assert.match(md, /CWE-416/, 'expected CWE-416 use-after-free');
    assert.match(md, /\b0\.\d/, 'expected a Zig 0.x pre-1.0 version token');
    assert.match(md, /Release(Safe|Fast)/, 'expected a Zig build mode (ReleaseSafe/ReleaseFast)');
    assert.match(md, /ziglang\.org/, 'expected the ziglang.org source URL');
  });

  it('nim names ORC, --mm, CWE-416, and gcsafe', () => {
    const md = read(GUIDES.nim);
    assert.match(md, /ORC/, 'expected ORC memory management');
    assert.match(md, /--mm/, 'expected the --mm memory-model flag');
    assert.match(md, /CWE-416/, 'expected CWE-416 use-after-free at the FFI boundary');
    assert.match(md, /gcsafe/i, 'expected the gcsafe pragma for cross-thread procs');
    assert.match(md, /nim-lang\.org/, 'expected the nim-lang.org source URL');
  });

  it('crystal names Channel, Fiber, shard.lock, and preview_mt', () => {
    const md = read(GUIDES.crystal);
    assert.match(md, /Channel/, 'expected Channel CSP communication');
    assert.match(md, /Fiber/i, 'expected cooperative Fiber concurrency');
    assert.match(md, /shard\.?lock/i, 'expected shard.lock pinning');
    assert.match(md, /preview_mt/, 'expected the -Dpreview_mt multi-threading preview flag');
    assert.match(md, /crystal-lang\.org/, 'expected the crystal-lang.org source URL');
  });

  it('d names @safe, @nogc, DIP1000, CWE-416, and scope(exit)', () => {
    const md = read(GUIDES.d);
    assert.match(md, /@safe/, 'expected the @safe memory-safety attribute');
    assert.match(md, /@nogc/, 'expected the @nogc attribute');
    assert.match(md, /DIP1000/, 'expected DIP1000 scope-lifetime checks');
    assert.match(md, /CWE-416/, 'expected CWE-416 use-after-free in @system/C FFI');
    assert.match(md, /scope\(exit\)/, 'expected scope(exit) RAII cleanup');
    assert.match(md, /dlang\.org/, 'expected the dlang.org source URL');
  });
});
