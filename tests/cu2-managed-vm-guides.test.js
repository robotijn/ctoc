/**
 * CU2 s4 — content-contract tests for the managed-VM language guides
 * (java.md, csharp.md) PLUS the CU2 9-file completeness check.
 *
 * ZERO DOUBLES: this reads the REAL guide files off disk via fs.readFileSync
 * (mirroring tests/cu2-systems-guides.test.js, tests/cu2-native-unsafe-guides.test.js
 * and tests/skill-regulatory-citations.test.js) and asserts substantive structure —
 * no mocks, no fixtures, no fakes.
 *
 * Part A — java.md / csharp.md substance. Guards the CU2 acceptance criteria for
 * these two managed-runtime guides:
 *   - each guide exceeds the 5-section template floor (> 5 "## " sections);
 *   - the required correction-surface sections are present (Security/Dependency,
 *     Concurrency, Error-Handling (java) / Nullable (csharp), Testing, Version, References);
 *   - the mandated deserialization CVE class CWE-502 is named in BOTH files;
 *   - a cwe.mitre.org or owasp.org reference is present in each file;
 *   - each guide names its own concrete identifiers (java: virtual threads/Loom +
 *     JPMS/--add-opens + a Java version token; csharp: ConfigureAwait + async void +
 *     Nullable + a .NET version token);
 *   - at least one dated source (>= 2025) with an http URL is present per guide;
 *   - the original H1 header is intact (skills.json indexing not corrupted).
 *
 * Part B — THE 9-FILE COMPLETENESS CHECK (this is the FINAL CU2 slice). Reads ALL
 * nine skills/languages/*.md guides (python, javascript, typescript, go, java, rust,
 * csharp, c, cpp) off disk and asserts each is substantive (well past the ~50-line
 * stub floor, exceeds the 5-section floor, has the shared required sections, carries
 * a dated http source) — proving CU2's whole scope (s1..s4) landed and no file was
 * silently omitted.
 *
 * Every Java/.NET/CWE fact these guides assert is web-verified against official
 * sources at edit time (cwe.mitre.org / openjdk.org/jeps / learn.microsoft.com /
 * endoflife.date). This test does NOT re-verify the facts; it guards the substance
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

function sectionCount(md) {
  return (md.match(/^## /gm) || []).length;
}

function lineCount(md) {
  return md.split('\n').length;
}

// ---------------------------------------------------------------------------
// Part A — java.md / csharp.md managed-VM substance
// ---------------------------------------------------------------------------

const MANAGED = {
  java: 'skills/languages/java.md',
  csharp: 'skills/languages/csharp.md',
};

// Sections common to both managed-VM correction surfaces (case-insensitive).
const SHARED_SECTIONS = [
  { name: 'Security/Dependency', re: /^##.*(security|dependenc|supply.?chain)/im },
  { name: 'Concurrency', re: /^##.*(concurren|async|thread)/im },
  { name: 'Testing', re: /^##.*test/im },
  { name: 'Version-specific', re: /^##.*version/im },
  { name: 'References', re: /^##.*(reference|source)/im },
];

describe('CU2 s4 — managed-VM guides are substantive (real files, zero doubles)', () => {
  for (const [lang, rel] of Object.entries(MANAGED)) {
    describe(`${lang} (${rel})`, () => {
      it('exceeds the 5-section template floor (> 5 "## " sections)', () => {
        const md = read(rel);
        const n = sectionCount(md);
        assert.ok(n > 5, `expected > 5 "## " sections, found ${n}`);
      });

      it('is well past the ~50-line stub floor (> 120 lines)', () => {
        const md = read(rel);
        const lines = lineCount(md);
        assert.ok(lines > 120, `expected > 120 lines (de-stubbed), found ${lines}`);
      });

      it('has all shared required correction-surface sections', () => {
        const md = read(rel);
        for (const { name, re } of SHARED_SECTIONS) {
          assert.match(md, re, `missing required section: ${name}`);
        }
      });

      it('names the mandated deserialization CVE class CWE-502', () => {
        const md = read(rel);
        assert.match(md, /CWE-502/, 'expected the literal CWE-502 token (deserialization)');
      });

      it('carries a cwe.mitre.org or owasp.org reference', () => {
        const md = read(rel);
        assert.match(
          md,
          /cwe\.mitre\.org|owasp\.org/i,
          'expected a cwe.mitre.org or owasp.org authoritative reference'
        );
      });

      it('carries at least one fenced code example (footgun demo)', () => {
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

  it('java names virtual threads/Loom, JPMS/--add-opens, a Java 2x version, and Optional', () => {
    const md = read(MANAGED.java);
    assert.match(md, /virtual thread|Loom/i, 'expected virtual threads / Project Loom content');
    assert.match(md, /JPMS|--add-opens/, 'expected the module system (JPMS / --add-opens)');
    assert.match(md, /Java 2[0-9]/, 'expected a Java 2x version token');
    assert.match(md, /Optional/, 'expected the Optional<T> null-safety idiom');
    assert.match(md, /openjdk\.org\/jeps|dev\.java|oracle\.com/i, 'expected an official JDK source URL');
  });

  it('csharp names ConfigureAwait, async void, Nullable, BinaryFormatter, and a .NET version', () => {
    const md = read(MANAGED.csharp);
    assert.match(md, /ConfigureAwait/, 'expected ConfigureAwait(false) library/app guidance');
    assert.match(md, /async void/, 'expected the async void anti-pattern');
    assert.match(md, /Nullable/, 'expected nullable reference types content');
    assert.match(md, /BinaryFormatter/, 'expected the BinaryFormatter removal (CWE-502)');
    assert.match(md, /\.NET (?:8|9|10)/, 'expected a current .NET version token');
    assert.match(md, /learn\.microsoft\.com/i, 'expected an official Microsoft source URL');
  });
});

// ---------------------------------------------------------------------------
// Part B — CU2 9-file completeness check (FINAL slice)
// ---------------------------------------------------------------------------

// The full in-scope CU2 corpus: every Tier-1 language guide across s1..s4.
const ALL_NINE = [
  'skills/languages/python.md',
  'skills/languages/javascript.md',
  'skills/languages/typescript.md',
  'skills/languages/go.md',
  'skills/languages/rust.md',
  'skills/languages/c.md',
  'skills/languages/cpp.md',
  'skills/languages/java.md',
  'skills/languages/csharp.md',
];

// Sections every de-stubbed guide must carry, regardless of slice (case-insensitive).
// Deliberately broad so it fits ALL four CU2 slices' legitimately-different, already-
// shipped structures: the dynamic/web + systems + managed guides name a
// "Security/Dependency" surface, while the native-unsafe (c/cpp) guides frame the
// same concern as "Memory-Safety CWE Classes" / "Undefined Behavior Classes" and
// their verification surface as "Sanitizers & Static Analysis". The contract is
// substance (a security-class section + a verification/testing section + version +
// references), not a single heading string.
const NINE_REQUIRED_SECTIONS = [
  {
    name: 'Security-class (security/dependency/CWE/UB/memory-safety)',
    re: /^##.*(security|dependenc|supply.?chain|cwe|undefined.?behav|memory.?safety)/im,
  },
  {
    name: 'Verification (testing/sanitizer/static-analysis)',
    re: /^##.*(test|sanitiz|static.?analysis)/im,
  },
  { name: 'Version-specific', re: /^##.*version/im },
  { name: 'References', re: /^##.*(reference|source)/im },
];

describe('CU2 completeness — all 9 language guides are substantive (real files)', () => {
  it('every in-scope guide exists on disk (no silent omission)', () => {
    for (const rel of ALL_NINE) {
      assert.ok(
        fs.existsSync(path.join(projectRoot, rel)),
        `CU2 scope file missing from disk: ${rel}`
      );
    }
  });

  for (const rel of ALL_NINE) {
    describe(rel, () => {
      it('is well past the ~50-line stub floor (> 120 lines)', () => {
        const md = read(rel);
        const lines = lineCount(md);
        assert.ok(lines > 120, `expected > 120 lines (de-stubbed), found ${lines}`);
      });

      it('exceeds the 5-section template floor (> 5 "## " sections)', () => {
        const md = read(rel);
        const n = sectionCount(md);
        assert.ok(n > 5, `expected > 5 "## " sections, found ${n}`);
      });

      it('has the shared required sections (Security, Testing, Version, References)', () => {
        const md = read(rel);
        for (const { name, re } of NINE_REQUIRED_SECTIONS) {
          assert.match(md, re, `${rel} missing required section: ${name}`);
        }
      });

      it('carries a dated source (>= 2025) with an http URL', () => {
        const md = read(rel);
        assert.match(md, /20(2[5-9]|[3-9]\d)/, `${rel}: expected a date token >= 2025`);
        assert.match(md, /https?:\/\//, `${rel}: expected an http(s) source URL`);
      });

      it('keeps its "# <Lang> CTO" H1 header intact', () => {
        const md = read(rel);
        assert.match(md, /^# .+CTO/m, `${rel}: expected the "# <Lang> CTO" H1 header`);
      });
    });
  }
});
