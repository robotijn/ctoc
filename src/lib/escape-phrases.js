/**
 * Escape Phrases — single source of truth
 *
 * When a user types one of these phrases in conversation, the PreToolUse
 * enforcement hook (introduced by Vision C / C1) allows the operation
 * without an active plan. Designed for genuinely trivial changes where
 * pipeline ceremony would exceed the change cost.
 *
 * Case-insensitive substring match with word-boundary checks to avoid
 * false positives on natural prose (e.g. "trivial" inside "trivially
 * complex" should NOT match "trivial fix").
 */

const { safeRegExp, escapeRegExp } = require('./regex-utils');

const ESCAPE_PHRASES = Object.freeze([
  'hotfix',
  'trivial fix',
  'trivial change',
  'quick fix',
  'urgent',
  'skip planning',
  'skip iron loop',
]);

/**
 * Return the matched escape phrase or null.
 * Matches as a word-bounded, case-insensitive substring.
 *
 * @param {string} text - Text to scan (e.g. a user message body)
 * @returns {string|null}
 */
function matchEscapePhrase(text) {
  if (typeof text !== 'string' || !text.length) return null;
  const normalized = text.toLowerCase();
  for (const phrase of ESCAPE_PHRASES) {
    // Word-bounded, but path/identifier punctuation (/ \ - _ .) must NOT count
    // as a boundary: otherwise a bare-word phrase like "hotfix" or "urgent"
    // matches when it appears as a token inside a filename or identifier
    // (e.g. "src/hotfix-runner.js", "urgent_alerts.py", "urgent.js") in genuine
    // user prose, silently disabling the write-enforcement guard.
    //   LEADING boundary  = string start, whitespace, or an opening bracket/quote
    //                       ( ( [ " ' ) — so "(hotfix)"/"[skip planning]" still
    //                       match — but NEVER a path char (/ \ - _ .).
    //   TRAILING boundary = string end, whitespace, a closing bracket/quote, OR
    //                       sentence punctuation THAT IS ITSELF followed by
    //                       whitespace/end. The follow-up requirement is what
    //                       distinguishes a sentence period ("do a hotfix.") — a
    //                       real boundary — from a filename dot ("hotfix.md") — NOT
    //                       a boundary — closing the dot-extension false-open hole.
    // \b doesn't work cleanly with multi-word phrases, so we use lookarounds.
    const pattern = safeRegExp(
      `(^|[\\s('"\\[])${escapeRegExp(phrase)}(?=[\\s)'"\\]]|[.,!?;:](?:\\s|$)|$)`,
      'i'
    );
    if (pattern.test(normalized)) return phrase;
  }
  return null;
}

module.exports = {
  ESCAPE_PHRASES,
  matchEscapePhrase,
};
