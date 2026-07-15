'use strict';

/**
 * Dark-branch coverage tests for src/lib/regex-utils.js — the audited RegExp
 * choke point (LH1). Companion to tests/regex-utils.test.js; this file targets
 * ONLY the branches the existing suite leaves dark, and each test is written to
 * go RED under a one-line mutation of the production code. No assertion here is
 * satisfied by a happy-path-only implementation.
 *
 * Baseline before this file: line 94.94%, branch 93.33%, uncovered lines 72-75
 * (the flags-type fail-closed throw). This file closes 72-75 AND kills several
 * mutants that survive the existing suite despite its lines already being green
 * (the missing-`g` mutant on METACHAR, and the null-branch of the two error
 * message ternaries, which the existing loose `/string/i` / `/pattern/i`
 * assertions do not distinguish).
 *
 * HONESTY NOTE on the "ReDoS-checked wrapper" framing: safeRegExp performs NO
 * runtime ReDoS / catastrophic-backtracking analysis and rejects NO pattern on
 * dangerousness — it is a type-validating `new RegExp(...)` constructor. There
 * is therefore no "dangerous-pattern-rejected" branch and no "detection
 * heuristic boundary" to pin in this module; a nested-quantifier pattern
 * compiles unchanged (pinned below so a future accidental rejection reds).
 * The actual ReDoS defense is escapeRegExp: it neutralizes a data-derived
 * catastrophic pattern by escaping its quantifiers into a literal — that
 * behavior IS pinned below.
 *
 * Cross-platform: pure string/RegExp logic, no OS-specific behavior, no fs.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const { escapeRegExp, safeRegExp } = require('../src/lib/regex-utils');

// ── Cluster A: flags-type fail-closed throw (dark lines 72-75) ────────────────
// Mutant target: deleting the `flags` type guard, or flipping `!== 'string'`.
// A non-string, non-undefined `flags` MUST throw a TypeError whose message
// names the offending typeof. This is the only path that reaches lines 72-75.

const NON_STRING_FLAGS = [
  { id: 'number', value: 123, typeofName: 'number' },
  { id: 'null', value: null, typeofName: 'object' }, // typeof null === 'object' (no null-ternary on flags)
  { id: 'plain-object', value: {}, typeofName: 'object' },
  { id: 'array', value: ['g'], typeofName: 'object' },
  { id: 'boolean', value: true, typeofName: 'boolean' },
  { id: 'regexp-as-flags', value: /g/, typeofName: 'object' },
];

for (const row of NON_STRING_FLAGS) {
  test(`safeRegExp throws TypeError naming the typeof when flags is a ${row.id}`, () => {
    // Arrange / Act / Assert — the throw carries the exact offending typeof.
    assert.throws(
      () => safeRegExp('abc', row.value),
      (err) =>
        err instanceof TypeError &&
        /flags must be a string/i.test(err.message) &&
        err.message.includes(`got ${row.typeofName}`),
      `flags=${row.id} must fail closed with a typeof-naming TypeError`
    );
  });
}

test('safeRegExp flags-type message uses raw typeof for null (got object, NOT got null)', () => {
  // Pins the ASYMMETRY: the flags branch has no `=== null ? 'null'` ternary,
  // unlike the pattern branch. A mutant that copied the pattern ternary onto
  // flags would print "got null" and red this test.
  assert.throws(
    () => safeRegExp('abc', null),
    (err) => err.message.includes('got object') && !err.message.includes('got null'),
    'null flags must report typeof "object", proving no null-ternary on the flags branch'
  );
});

// ── Cluster B: the `flags !== undefined` boundary (first operand of the &&) ───
// Mutant target: dropping the `flags !== undefined` guard. Without it,
// `typeof undefined !== 'string'` is true and an omitted/explicit-undefined
// flags would wrongly throw. These three rows pin the accepted side of the
// boundary and distinguish "" (a real empty flag string) from undefined.

test('safeRegExp accepts explicit undefined flags and builds a flagless RegExp', () => {
  const re = safeRegExp('abc', undefined);

  assert.ok(re instanceof RegExp, 'explicit undefined flags must not throw');
  assert.equal(re.flags, '', 'explicit undefined flags yields no flags');
});

test('safeRegExp accepts an empty-string flags value distinct from undefined', () => {
  // '' passes the type guard (typeof '' === 'string') and `!== undefined`,
  // so it is a valid, empty flag set — not conflated with the undefined case.
  const re = safeRegExp('abc', '');

  assert.ok(re instanceof RegExp);
  assert.equal(re.flags, '');
});

// ── Cluster C: pattern-type error message null-ternary (line 68) ──────────────
// The existing suite only asserts /pattern|string|RegExp/i, which cannot tell
// "null" from "object". Mutant target: replacing `pattern === null ? 'null'
// : typeof pattern` with plain `typeof pattern` — null would then print
// "got object". These rows red that mutant and pin the number/object arms too.

const PATTERN_TYPE_ROWS = [
  { id: 'null', value: null, expected: 'got null' },
  { id: 'number', value: 123, expected: 'got number' },
  { id: 'plain-object', value: {}, expected: 'got object' },
  { id: 'boolean', value: true, expected: 'got boolean' },
];

for (const row of PATTERN_TYPE_ROWS) {
  test(`safeRegExp rejects a ${row.id} pattern with a message naming it exactly`, () => {
    assert.throws(
      () => safeRegExp(row.value),
      (err) => err instanceof TypeError && err.message.includes(row.expected),
      `pattern=${row.id} must report "${row.expected}"`
    );
  });
}

// ── Cluster D: escapeRegExp error message null-ternary (line 49) ──────────────
// Same null-vs-object distinction on the escapeRegExp side. Existing suite uses
// /string/i and never inspects the typeof word, so the null arm is unpinned.

const ESCAPE_TYPE_ROWS = [
  { id: 'null', value: null, expected: 'got null' },
  { id: 'undefined', value: undefined, expected: 'got undefined' },
  { id: 'number', value: 123, expected: 'got number' },
  { id: 'plain-object', value: {}, expected: 'got object' },
];

for (const row of ESCAPE_TYPE_ROWS) {
  test(`escapeRegExp rejects a ${row.id} argument with a message naming it exactly`, () => {
    assert.throws(
      () => escapeRegExp(row.value),
      (err) => err instanceof TypeError && err.message.includes(row.expected),
      `escapeRegExp(${row.id}) must report "${row.expected}"`
    );
  });
}

// ── Cluster E: METACHAR is global — escapes EVERY occurrence, not just first ──
// Mutant target: dropping the `g` flag on METACHAR. Without `g`, only the first
// metacharacter is escaped. The existing suite's 'a.b+c' round-trip SURVIVES
// that mutant (verified: '^a\\.b+c$' still test()s 'a.b+c' and rejects the
// wildcard cases), so this exact-string check is the one that kills it.

test('escapeRegExp escapes every metacharacter occurrence, not only the first', () => {
  // Three dots -> three backslash-dots. Missing-`g` would yield '\\..' and red this.
  assert.equal(escapeRegExp('...'), '\\.\\.\\.');
  assert.equal(escapeRegExp('a.b.c'), 'a\\.b\\.c');
});

// ── Cluster F: the actual ReDoS-relevant behavior of this module ──────────────

test('escapeRegExp neutralizes a nested-quantifier data string into a literal', () => {
  // The real ReDoS defense: a catastrophic-looking DATA string has its
  // quantifiers/groups escaped, so the built pattern matches ONLY the literal
  // and cannot backtrack. Mutant target: any weakening of METACHAR that lets a
  // quantifier through would red the equality or the match assertions.
  const danger = '(a+)+';
  const escaped = escapeRegExp(danger);

  assert.equal(escaped, '\\(a\\+\\)\\+', 'quantifiers and groups are escaped');

  const re = safeRegExp('^' + escaped + '$');
  assert.ok(re.test('(a+)+'), 'matches the literal it came from');
  assert.ok(!re.test('aaaa'), 'does NOT behave as the nested-quantifier pattern');
});

test('safeRegExp performs NO dangerousness rejection — a catastrophic pattern compiles', () => {
  // DOCUMENTS current contract: safeRegExp is a type-validating constructor, not
  // a ReDoS filter. It builds a nested-quantifier RegExp unchanged. This pins
  // that contract so an accidental future "reject dangerous pattern" branch reds
  // here and forces a deliberate decision rather than a silent behavior change.
  const re = safeRegExp('(a+)+$');

  assert.ok(re instanceof RegExp);
  assert.ok(re.test('aaaa'), 'the quantifier pattern is live, not neutralized');
});

// ── Cluster G: pattern type-guard uses typeof, not truthiness ─────────────────
// Mutant target: rewriting `typeof pattern !== 'string'` as a falsy check.
// The empty string is falsy but IS a valid pattern; a truthiness guard would
// wrongly reject it. safeRegExp('') must succeed and match everywhere.

test('safeRegExp accepts the empty-string pattern (typeof guard, not truthiness)', () => {
  const re = safeRegExp('');

  assert.ok(re instanceof RegExp, 'empty string is a valid pattern');
  assert.ok(re.test('anything'), 'empty pattern matches any input');
});

// ── Cluster H: string flags value is honored / invalid flag VALUE reaches native ─
// Distinguishes the TWO failure modes: a non-string flags TYPE fails closed as
// a TypeError (Cluster A), whereas a string flags VALUE that is an invalid flag
// passes the type guard and reaches `new RegExp`, surfacing the native
// SyntaxError undropped. Mutant target: safeRegExp swallowing/rethrowing native
// errors, or the type guard rejecting valid string flags.

test('safeRegExp lets an invalid string flag surface as the native SyntaxError', () => {
  // 'q' is a string, so it clears the type guard; RegExp rejects it as a flag.
  assert.throws(() => safeRegExp('abc', 'q'), SyntaxError);
});

test('safeRegExp honors a valid multi-character string flags value', () => {
  const re = safeRegExp('abc', 'gi');

  assert.equal(re.flags, 'gi', 'flags string is passed through to the RegExp');
  assert.ok(re.global && re.ignoreCase);
});
