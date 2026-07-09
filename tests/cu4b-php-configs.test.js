'use strict';

// CU4b s2 — content-contract test for the php quality-config guides.
// ZERO TEST DOUBLES: reads the two REAL files off disk and asserts substance.
// No mocks, no fakes, no fixtures — the files under skills/quality-configs/php/ are the SUT.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const PHP_DIR = path.join(__dirname, '..', 'skills', 'quality-configs', 'php');

function read(file) {
  return fs.readFileSync(path.join(PHP_DIR, file), 'utf8');
}

function sectionCount(md) {
  // Count level-2 (##) headings, not ### or deeper.
  return (md.match(/^##[^#]/gm) || []).length;
}

function fenceCount(md) {
  // Number of opening code fences (each block = one opening ``` line).
  const fences = md.match(/^```/gm) || [];
  return Math.floor(fences.length / 2);
}

// Files under test with their tier-specific gradient expectations.
const FILES = [
  {
    file: 'legacy.md',
    tier: 'legacy',
    level: /level:\s*5/i,
    coverage: /50\s*%/,
    // legacy-specific: baseline-driven gradual adoption
    gradientTokens: [/baseline/i],
    requirePsalm: false,
  },
  {
    file: 'strictest.md',
    tier: 'strictest',
    // PHPStan 2.x exposes 11 levels (0–10); level 10 is the true strictest (web-verified
    // 2026-07-09 phpstan.org/user-guide/rule-levels). The plan's "level 9 (max)" predates
    // PHPStan 2.x's level 10. Strictest uses level 10 with level 9's max-strictness flags
    // (checkMissingIterableValueType etc.) retained. Assert the real max.
    level: /level:\s*10/i,
    coverage: /90\s*%/,
    gradientTokens: [/declare\(strict_types=1\)/],
    requirePsalm: true,
  },
];

for (const spec of FILES) {
  const label = `php/${spec.file}`;

  test(`${label}: has more than 5 level-2 sections`, () => {
    const md = read(spec.file);
    const n = sectionCount(md);
    assert.ok(n > 5, `expected > 5 '##' sections, got ${n}`);
  });

  test(`${label}: has more than 90 lines`, () => {
    const md = read(spec.file);
    const n = md.split('\n').length;
    assert.ok(n > 90, `expected > 90 lines, got ${n}`);
  });

  test(`${label}: names the required toolchain sections`, () => {
    const md = read(spec.file);
    assert.match(md, /PHPStan/, 'must mention PHPStan');
    assert.match(md, /PHP[-_ ]?CS[-_ ]?Fixer|PHP_?CodeSniffer|PHPCS/i, 'must mention a style fixer/sniffer');
    assert.match(md, /PHPUnit/i, 'must mention PHPUnit');
    assert.match(md, /coverage/i, 'must mention Coverage');
    assert.match(md, /complexity/i, 'must mention Complexity');
    assert.match(md, /install/i, 'must have an Install section');
    assert.match(md, /\bCI\b|GitHub Actions|workflow/i, 'must mention CI');
  });

  test(`${label}: names PHP-specific identifiers`, () => {
    const md = read(spec.file);
    assert.match(md, /PHP\s*8\.3|php8\.3|8\.3/i, 'must reference PHP 8.3');
    assert.match(md, /declare\(strict_types=1\)/, 'must reference declare(strict_types=1)');
    assert.match(md, /PHPStan/, 'must reference PHPStan');
    assert.match(md, /level[:\s]+\d/i, 'must name a PHPStan level number');
    assert.match(md, /PSR-12/, 'must reference the PSR-12 ruleset');
    if (spec.requirePsalm) {
      assert.match(md, /psalm/i, 'strictest must reference Psalm');
    }
  });

  test(`${label}: has at least 4 code fences`, () => {
    const md = read(spec.file);
    const n = fenceCount(md);
    assert.ok(n >= 4, `expected >= 4 code fences, got ${n}`);
  });

  test(`${label}: carries at least one dated http source (>=2025)`, () => {
    const md = read(spec.file);
    assert.match(md, /20(2[5-9]|[3-9]\d)/, 'must carry a >=2025 date token');
    assert.match(md, /https?:\/\//, 'must carry an http(s) source URL');
    // The date and a URL should co-occur on a source line (verification integrity).
    const hasDatedSourceLine = md.split('\n').some(
      (line) => /https?:\/\//.test(line) && /20(2[5-9]|[3-9]\d)/.test(line),
    );
    assert.ok(hasDatedSourceLine, 'expected a single line carrying both a URL and a >=2025 date');
  });

  test(`${label}: cross-language guard — no Ruby/RuboCop tokens`, () => {
    const md = read(spec.file);
    assert.doesNotMatch(md, /RuboCop/i, 'must not contain RuboCop');
    assert.doesNotMatch(md, /frozen_string_literal/, 'must not contain frozen_string_literal');
    assert.doesNotMatch(md, /\.rubocop/, 'must not contain .rubocop');
    assert.doesNotMatch(md, /\bGemfile\b/, 'must not contain Gemfile');
    assert.doesNotMatch(md, /SimpleCov/, 'must not contain SimpleCov');
  });

  test(`${label}: gradient tokens correct for its tier`, () => {
    const md = read(spec.file);
    assert.match(md, spec.level, `must carry the ${spec.tier} PHPStan level`);
    assert.match(md, spec.coverage, `must carry the ${spec.tier} coverage floor`);
    for (const tok of spec.gradientTokens) {
      assert.match(md, tok, `must carry gradient token ${tok}`);
    }
  });
}

// Cross-file gradient invariant: strictest is genuinely stricter than legacy.
test('gradient: strictest level 10 & 90%, legacy level 5 & 50% & baseline', () => {
  const strictest = read('strictest.md');
  const legacy = read('legacy.md');
  assert.match(strictest, /level:\s*10/);
  assert.match(strictest, /90\s*%/);
  assert.match(legacy, /level:\s*5/);
  assert.match(legacy, /50\s*%/);
  assert.match(legacy, /baseline/i);
});
