/**
 * Content-contract tests for CU2 s3 — native/unsafe language guides (c, cpp).
 *
 * Reads the REAL skills/languages/c.md and skills/languages/cpp.md files off disk
 * (no mocks, no doubles — mirrors tests/skill-regulatory-citations.test.js) and
 * asserts they exceed the 5-section template floor with substantive memory-safety
 * depth: named CWE identifiers, sanitizer flags, standard-version tokens, and at
 * least one dated (>= 2025) authoritative http source per file.
 *
 * The CWE identifiers asserted here are the canonical MITRE identifiers, verified
 * against cwe.mitre.org at edit time:
 *   CWE-121 Stack-based Buffer Overflow
 *   CWE-122 Heap-based Buffer Overflow
 *   CWE-416 Use After Free
 *   CWE-134 Use of Externally-Controlled Format String
 *   CWE-190 Integer Overflow or Wraparound
 * This test guards the guides against a future edit dropping them; it does NOT
 * re-verify the CWE catalog itself.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const projectRoot = path.join(__dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(projectRoot, rel), 'utf8');
}

function h2Sections(md) {
  return md.split('\n').filter((l) => /^## /.test(l));
}

// The five canonical MITRE CWE identifiers used across the native-unsafe guides.
// Each token here is a real cwe.mitre.org identifier (verified at edit time).
const REAL_CWE_IDS = ['CWE-121', 'CWE-122', 'CWE-416', 'CWE-134', 'CWE-190'];

// Guard: every CWE token that appears in a guide must be a syntactically valid
// CWE id AND, for the specific ids this slice introduces, a known-real one.
function assertOnlyRealCwes(md, allowedExtra = []) {
  const found = [...md.matchAll(/CWE-\d+/g)].map((m) => m[0]);
  const allowed = new Set([...REAL_CWE_IDS, ...allowedExtra]);
  for (const id of found) {
    assert.ok(
      allowed.has(id),
      `CWE token ${id} is not in the verified-real allowlist — no fabricated CWEs`,
    );
  }
}

describe('CU2 s3 — c.md native-unsafe correction surface', () => {
  const rel = 'skills/languages/c.md';

  it('exceeds the 5-section template floor (> 5 ## sections)', () => {
    const md = read(rel);
    assert.ok(h2Sections(md).length > 5,
      `expected > 5 ## sections, found ${h2Sections(md).length}`);
  });

  it('keeps the H1 intact so skills.json indexing is unbroken', () => {
    const md = read(rel);
    assert.match(md, /^# C CTO/m, 'expected "# C CTO" H1');
  });

  it('names all five memory-safety CWE identifiers', () => {
    const md = read(rel);
    for (const id of REAL_CWE_IDS) {
      assert.match(md, new RegExp(id.replace('-', '-')),
        `expected ${id} named in c.md`);
    }
  });

  it('references cwe.mitre.org for the CWE catalog', () => {
    const md = read(rel);
    assert.match(md, /cwe\.mitre\.org/, 'expected a cwe.mitre.org reference');
  });

  it('contains no fabricated CWE identifiers', () => {
    // CWE-476 (NULL Pointer Dereference) is also a verified-real MITRE id.
    assertOnlyRealCwes(read(rel), ['CWE-476']);
  });

  it('names the ASan and UBSan sanitizer flags', () => {
    const md = read(rel);
    assert.match(md, /-fsanitize=address|AddressSanitizer/, 'expected ASan');
    assert.match(md, /-fsanitize=undefined|UBSan|UndefinedBehaviorSanitizer/,
      'expected UBSan');
  });

  it('names the C17/C23 standard-version tokens', () => {
    const md = read(rel);
    assert.match(md, /C17/, 'expected C17 token');
    assert.match(md, /C23/, 'expected C23 token');
  });

  it('carries the required substantive sections', () => {
    const md = read(rel);
    assert.match(md, /## .*Memory-Safety/i, 'expected a Memory-Safety section');
    assert.match(md, /## .*Sanitizers/i, 'expected a Sanitizers section');
    assert.match(md, /## .*Concurrency/i, 'expected a Concurrency section');
    assert.match(md, /## .*Error Handling/i, 'expected an Error Handling section');
    assert.match(md, /## .*References/i, 'expected a References section');
  });

  it('carries at least one dated (>= 2025) http source', () => {
    const md = read(rel);
    assert.match(md, /https?:\/\//, 'expected an http source URL');
    assert.match(md, /20(2[5-9]|[3-9]\d)-\d{2}-\d{2}|20(2[5-9]|[3-9]\d)/,
      'expected a date >= 2025');
  });
});

describe('CU2 s3 — cpp.md native-unsafe correction surface', () => {
  const rel = 'skills/languages/cpp.md';

  it('exceeds the 5-section template floor (> 5 ## sections)', () => {
    const md = read(rel);
    assert.ok(h2Sections(md).length > 5,
      `expected > 5 ## sections, found ${h2Sections(md).length}`);
  });

  it('keeps the H1 intact so skills.json indexing is unbroken', () => {
    const md = read(rel);
    assert.match(md, /^# C\+\+ CTO/m, 'expected "# C++ CTO" H1');
  });

  it('names at least the use-after-free CWE (CWE-416)', () => {
    const md = read(rel);
    assert.match(md, /CWE-416/, 'expected CWE-416 named in cpp.md');
  });

  it('references cwe.mitre.org for the CWE catalog', () => {
    const md = read(rel);
    assert.match(md, /cwe\.mitre\.org/, 'expected a cwe.mitre.org reference');
  });

  it('contains no fabricated CWE identifiers', () => {
    // CWE-401 (memory leak) and CWE-476 are also verified-real MITRE ids.
    assertOnlyRealCwes(read(rel), ['CWE-401', 'CWE-476']);
  });

  it('names the named UB / lifetime footgun classes', () => {
    const md = read(rel);
    assert.match(md, /strict aliasing/i, 'expected strict aliasing UB class');
    assert.match(md, /iterator invalidation/i, 'expected iterator invalidation');
  });

  it('names the ASan and UBSan sanitizer flags', () => {
    const md = read(rel);
    assert.match(md, /-fsanitize=address|AddressSanitizer/, 'expected ASan');
    assert.match(md, /-fsanitize=undefined|UBSan|UndefinedBehaviorSanitizer/,
      'expected UBSan');
  });

  it('names the C++20 and C++23 standard-version tokens', () => {
    const md = read(rel);
    assert.match(md, /C\+\+20/, 'expected C++20 token');
    assert.match(md, /C\+\+23/, 'expected C++23 token');
  });

  it('carries the required substantive sections', () => {
    const md = read(rel);
    assert.match(md, /## .*Undefined Behavior/i, 'expected a UB section');
    assert.match(md, /## .*Smart.?[Pp]ointer/i, 'expected a smart-pointer section');
    assert.match(md, /## .*Sanitizers/i, 'expected a Sanitizers section');
    assert.match(md, /## .*References/i, 'expected a References section');
  });

  it('carries at least one dated (>= 2025) http source', () => {
    const md = read(rel);
    assert.match(md, /https?:\/\//, 'expected an http source URL');
    assert.match(md, /20(2[5-9]|[3-9]\d)-\d{2}-\d{2}|20(2[5-9]|[3-9]\d)/,
      'expected a date >= 2025');
  });
});
