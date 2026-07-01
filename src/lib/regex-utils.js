/* eslint-disable security/detect-non-literal-regexp --
 * LH1: This module is the SINGLE audited RegExp-construction choke point for CTOC.
 *
 * CTOC is a codebase full of detectors and parsers, so it builds regexes from
 * variables (glob→regex conversions, config-derived patterns, escaped user
 * tokens). The `security/detect-non-literal-regexp` heuristic fires on ANY
 * `new RegExp(x)` whose first argument is not a string literal — which is the
 * whole point of that code. Crucially, ESCAPING the input (the real ReDoS/
 * injection fix) does NOT silence the rule: the argument is still non-literal.
 *
 * So rather than scatter inline suppressions (silence with no invariant), every
 * dynamic RegExp construction in src/ routes through `safeRegExp(...)` below,
 * and any data-derived interpolation is first passed through `escapeRegExp(...)`
 * so a data string is matched LITERALLY (never interpreted as a pattern). This
 * file holds the ONLY `new RegExp(...)` call on a non-literal in src/, so the
 * detect-non-literal-regexp disable lives HERE and ONLY HERE — letting the rule
 * be promoted to `error` everywhere else with --max-warnings 0.
 *
 * `escapeRegExp` is also the single source of truth replacing the copies of
 * `.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')` previously inlined across src/.
 *
 * Cross-platform: pure string/RegExp logic, no OS-specific assumptions.
 *
 * See docs/SECURITY_LINT.md (rationale) and plan LH1 (full strategy).
 */

'use strict';

// Every character that carries special meaning in a JS regular expression,
// including inside a character class (`-`, `]`, `\`) and the `/` delimiter.
// Escaping this exact set turns any string into a literal-match pattern.
const METACHAR = /[.*+?^${}()|[\]\\/-]/g;

/**
 * Escape regex metacharacters in `str` so it can be interpolated into a pattern
 * and matched as a LITERAL string (no metacharacter interpretation).
 *
 * This is the single source of truth for regex escaping in CTOC. Use it on any
 * data-derived substring before building a RegExp from it.
 *
 * @param {string} str - the literal text to escape
 * @returns {string} the escaped text, safe to embed in a RegExp source
 * @throws {TypeError} when `str` is not a string (fail-closed)
 */
function escapeRegExp(str) {
  if (typeof str !== 'string') {
    throw new TypeError(
      `regex-utils: escapeRegExp expects a string; got ${str === null ? 'null' : typeof str}`
    );
  }
  return str.replace(METACHAR, '\\$&');
}

/**
 * The audited `new RegExp(...)` constructor. Every dynamic RegExp in CTOC is
 * built here so the detect-non-literal-regexp disable is centralized and
 * load-bearing. Validates the pattern type and fails closed on garbage; a
 * genuinely malformed pattern still throws its native SyntaxError.
 *
 * @param {string | RegExp} pattern - the regex source (escape data first with escapeRegExp)
 * @param {string} [flags] - optional regex flags (e.g. 'g', 'i', 'm')
 * @returns {RegExp} the constructed regular expression
 * @throws {TypeError} when `pattern` is neither a string nor a RegExp
 */
function safeRegExp(pattern, flags) {
  if (typeof pattern !== 'string' && !(pattern instanceof RegExp)) {
    throw new TypeError(
      `regex-utils: safeRegExp pattern must be a string or RegExp; got ${pattern === null ? 'null' : typeof pattern}`
    );
  }
  if (flags !== undefined && typeof flags !== 'string') {
    throw new TypeError(
      `regex-utils: safeRegExp flags must be a string when provided; got ${typeof flags}`
    );
  }
  return new RegExp(pattern, flags);
}

module.exports = { escapeRegExp, safeRegExp };
