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
    // Word-bounded: ensure phrase doesn't appear inside another word.
    // \b doesn't work cleanly with multi-word phrases, so we use lookarounds.
    const pattern = new RegExp(`(^|[^a-z0-9])${phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9]|$)`, 'i');
    if (pattern.test(normalized)) return phrase;
  }
  return null;
}

module.exports = {
  ESCAPE_PHRASES,
  matchEscapePhrase,
};
