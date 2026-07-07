/**
 * PI2 — Deterministic plan → summary-text extractor (embedding input).
 *
 * Turns a plan `.md` file into a compact, byte-deterministic "summary text" used
 * as embedding input. The output is intentionally lossy: it keeps the signal that
 * discriminates plans (title, a few key frontmatter fields, and every H2/H3
 * heading line) and DROPS section body prose — which is high-volume, low-signal,
 * and would dominate the vector.
 *
 * Determinism is a hard contract (EM-06): identical input → byte-identical output
 * (`===`). No network, no LLM. Frontmatter is parsed with `parseMetadata` from
 * `src/lib/state.js` (spy-able in tests) so the parse stays consistent with the
 * rest of CTOC.
 *
 * Cross-platform: pure string operations; no fs, no paths.
 *
 * Called by PI3 (indexing), NOT by PI2's runtime `embed`.
 */

'use strict';

const state = require('../state');

// Frontmatter string fields carried into the summary, in fixed order. Only those
// present (and string/number scalar) are emitted, so the output stays stable.
const SUMMARY_FRONTMATTER_FIELDS = ['title', 'status', 'priority', 'parent_vision'];

// Matches an H2 or H3 ATX heading LINE (## or ###), capturing the whole line.
const H2_H3_LINE = /^#{2,3}[ \t]+\S.*$/;

/**
 * Extract a deterministic summary string from plan markdown.
 *
 * Emits, in fixed order:
 *   1. The values of selected frontmatter fields (title, status, priority,
 *      parent_vision) that are present, one per line, as `key: value`.
 *   2. Every H2/H3 heading LINE verbatim, in document order.
 * All section body prose is excluded.
 *
 * @param {string} markdownText - raw plan markdown (with optional YAML frontmatter)
 * @returns {string} deterministic summary text; '' for non-string input (fail-soft)
 */
function extractSummary(markdownText) {
  // Fail-soft: extraction must never throw into the indexing pipeline.
  if (typeof markdownText !== 'string') return '';

  const lines = [];

  // 1) Frontmatter fields via state.parseMetadata (spy-able → EM-06).
  let metadata;
  try {
    metadata = state.parseMetadata(markdownText);
  } catch {
    metadata = {};
  }
  if (metadata && typeof metadata === 'object') {
    for (const field of SUMMARY_FRONTMATTER_FIELDS) {
      const value = metadata[field];
      if (value == null) continue;
      if (typeof value === 'string' || typeof value === 'number') {
        const str = String(value).trim();
        if (str.length > 0) lines.push(`${field}: ${str}`);
      }
    }
  }

  // 2) H2/H3 heading lines in document order (body prose excluded).
  // Split on \n; strip a trailing \r so CRLF files produce identical output to LF.
  const bodyLines = markdownText.split('\n');
  for (let raw of bodyLines) {
    if (raw.endsWith('\r')) raw = raw.slice(0, -1);
    if (H2_H3_LINE.test(raw)) {
      lines.push(raw.trimEnd());
    }
  }

  return lines.join('\n');
}

module.exports = { extractSummary, SUMMARY_FRONTMATTER_FIELDS };
