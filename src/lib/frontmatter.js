'use strict';

/**
 * Shared CRLF-safe frontmatter helper (CTOC finding H1).
 *
 * SINGLE HOME for the CRLF-safe frontmatter pattern. Every plan-reading module
 * MUST import from here rather than re-inlining `/^---\n/` (the LF-only pattern
 * that silently locks out plans checked out on Windows with CRLF line endings).
 * Because this module has ZERO internal `require`s (node built-ins only, and it
 * needs none), it can never participate in a require cycle — consumers such as
 * `state.js` and `vision-decomposer` can import it freely.
 *
 * Contract: a plan checked out on Windows (CRLF) parses byte-identically to the
 * same plan on macOS/Linux (LF). The interior `raw` and every `lines` entry are
 * guaranteed free of any stray carriage return.
 *
 * @module frontmatter
 */

/**
 * CRLF-safe opening fence — for detect / prepend / strip callers.
 * @type {RegExp}
 */
const FRONTMATTER_OPEN = /^---\r?\n/;

/**
 * CRLF-safe full frontmatter block. Capture group 1 is the interior (may
 * contain `\r` until normalized by {@link parseFrontmatter}).
 * @type {RegExp}
 */
const FRONTMATTER_BLOCK = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

/**
 * Split a string into lines, tolerating both LF and CRLF endings.
 * @param {string} s
 * @returns {string[]}
 */
function splitLines(s) {
  return String(s).split(/\r?\n/);
}

/**
 * Parse frontmatter from plan/document content, CRLF-safe and non-throwing.
 *
 * @param {string} content Raw document text (non-strings are coerced via String()).
 * @returns {{ hasFrontmatter: boolean, raw: string, lines: string[], body: string }}
 *   - `hasFrontmatter` — whether a leading `---` fenced block was found.
 *   - `raw` — the interior frontmatter with every `\r` stripped (`''` when none).
 *   - `lines` — `raw.split('\n')` (guaranteed `\r`-free; `[]` when none).
 *   - `body` — content after the block, `\r`-normalized so a CRLF document
 *     parses byte-identically to its LF twin (whole content when no frontmatter).
 *     LF input is unaffected (no `\r` to strip), so legacy LF callers are drop-in.
 */
function parseFrontmatter(content) {
  const text = String(content);
  const m = text.match(FRONTMATTER_BLOCK);
  if (!m) {
    return { hasFrontmatter: false, raw: '', lines: [], body: text.replace(/\r/g, '') };
  }
  const raw = m[1].replace(/\r/g, '');
  return {
    hasFrontmatter: true,
    raw,
    lines: raw.split('\n'),
    body: text.slice(m[0].length).replace(/\r/g, ''),
  };
}

module.exports = { FRONTMATTER_OPEN, FRONTMATTER_BLOCK, splitLines, parseFrontmatter };
