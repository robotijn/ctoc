'use strict';

/**
 * Tests for src/lib/regex-utils.js — the audited RegExp choke point (LH1).
 *
 * regex-utils is the symmetric partner of safe-fs for the
 * `security/detect-non-literal-regexp` rule. The `detect-non-literal-regexp`
 * heuristic fires on ANY `new RegExp(x)` where x is not a string literal —
 * which is the whole point of a detector/parser codebase. Escaping the input
 * is the real security fix, but escaping does NOT silence the rule (the
 * argument is still non-literal). So every dynamic RegExp construction routes
 * through `safeRegExp(...)`, and the SOLE project-wide
 * `eslint-disable security/detect-non-literal-regexp` lives inside this file.
 *
 * Two exports:
 *   - escapeRegExp(str): escape regex metacharacters so a data string can be
 *     interpolated as a LITERAL match. Single source of truth, replacing the
 *     `.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')` copies scattered across src/.
 *   - safeRegExp(pattern, flags): the audited `new RegExp(...)` constructor.
 *
 * Cross-platform: pure string/RegExp logic, no OS-specific behavior.
 */

const test = require('node:test');
const assert = require('node:assert');

const { escapeRegExp, safeRegExp } = require('../src/lib/regex-utils');

// ── Surface ─────────────────────────────────────────────────────────────────

test('exports escapeRegExp and safeRegExp as functions', () => {
  assert.strictEqual(typeof escapeRegExp, 'function');
  assert.strictEqual(typeof safeRegExp, 'function');
});

// ── escapeRegExp: escapes every regex metacharacter ──────────────────────────

test('escapeRegExp escapes each regex metacharacter . [ ] ( ) * + ? ^ $ | { } \\ / -', () => {
  const metachars = ['.', '[', ']', '(', ')', '*', '+', '?', '^', '$', '|', '{', '}', '\\', '/', '-'];
  for (const ch of metachars) {
    const escaped = escapeRegExp(ch);
    // Each metachar must be backslash-prefixed after escaping.
    assert.strictEqual(escaped, '\\' + ch, `escapeRegExp(${JSON.stringify(ch)}) should be ${JSON.stringify('\\' + ch)}`);
    // And the escaped form must compile to a RegExp that matches the literal char.
    const re = new RegExp(escaped);
    assert.ok(re.test(ch), `escaped ${JSON.stringify(ch)} should match the literal char`);
  }
});

test('escapeRegExp round-trips: an escaped data string matches only its literal', () => {
  // 'a.b+c' as a raw regex would match 'axbbbc' etc. Escaped, it matches ONLY 'a.b+c'.
  const data = 'a.b+c';
  const re = new RegExp('^' + escapeRegExp(data) + '$');
  assert.ok(re.test('a.b+c'), 'escaped literal must match itself');
  assert.ok(!re.test('axbbbc'), 'escaped literal must NOT match the metachar interpretation');
  assert.ok(!re.test('aXbc'), 'escaped literal must NOT match . as wildcard');
});

test('escapeRegExp handles a complex metachar-heavy string as a literal', () => {
  const data = 'C:\\Users\\foo (bar) [baz]{1,2}?.*$';
  const re = new RegExp('^' + escapeRegExp(data) + '$');
  assert.ok(re.test(data), 'complex path/glob-like string round-trips as a literal');
  assert.ok(!re.test('C:UsersfooX'), 'no accidental wildcard matching');
});

test('escapeRegExp leaves ordinary characters untouched', () => {
  assert.strictEqual(escapeRegExp('abcDEF_123'), 'abcDEF_123');
  assert.strictEqual(escapeRegExp(''), '');
});

test('escapeRegExp throws on non-string input (fail-closed)', () => {
  for (const bad of [123, {}, [], null, undefined, true]) {
    assert.throws(() => escapeRegExp(bad), /string/i, `escapeRegExp(${String(bad)}) should throw`);
  }
});

// ── safeRegExp: audited constructor ──────────────────────────────────────────

test('safeRegExp builds a working RegExp from a string pattern', () => {
  const re = safeRegExp('ab+c');
  assert.ok(re instanceof RegExp);
  assert.ok(re.test('abbbc'));
  assert.ok(!re.test('ac'));
});

test('safeRegExp passes flags through', () => {
  const re = safeRegExp('abc', 'i');
  assert.ok(re.test('ABC'), 'i flag makes it case-insensitive');
  assert.strictEqual(re.flags, 'i');

  const g = safeRegExp('x', 'g');
  assert.strictEqual(g.global, true);
});

test('safeRegExp accepts a RegExp source pattern', () => {
  const re = safeRegExp(/foo\d+/, 'i');
  assert.ok(re instanceof RegExp);
  assert.ok(re.test('FOO123'));
});

test('safeRegExp composes with escapeRegExp for literal interpolation', () => {
  const userInput = 'file.name*';
  const re = safeRegExp('^' + escapeRegExp(userInput) + '$');
  assert.ok(re.test('file.name*'));
  assert.ok(!re.test('fileXnameYYY'));
});

test('safeRegExp throws on invalid pattern type (fail-closed)', () => {
  for (const bad of [123, {}, [], null, undefined, true]) {
    assert.throws(() => safeRegExp(bad), /pattern|string|RegExp/i, `safeRegExp(${String(bad)}) should throw`);
  }
});

test('safeRegExp propagates a genuine invalid-regex SyntaxError', () => {
  // An unbalanced group is a real regex error; safeRegExp must not swallow it.
  assert.throws(() => safeRegExp('('), SyntaxError);
});
