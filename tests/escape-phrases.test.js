/**
 * Tests for escape-phrases.js (K4)
 *
 * Single source of truth for escape phrases recognized by the PreToolUse
 * enforcement hook. Tests cover case-insensitivity, word boundaries, and
 * the full canonical list.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { ESCAPE_PHRASES, matchEscapePhrase } = require('../src/lib/escape-phrases');

describe('ESCAPE_PHRASES list', () => {
  it('includes the canonical escape phrases', () => {
    const expected = ['hotfix', 'trivial fix', 'trivial change', 'quick fix', 'urgent', 'skip planning', 'skip iron loop'];
    for (const phrase of expected) {
      assert.ok(ESCAPE_PHRASES.includes(phrase), `ESCAPE_PHRASES should include '${phrase}'`);
    }
  });

  it('is frozen (cannot be mutated)', () => {
    assert.ok(Object.isFrozen(ESCAPE_PHRASES), 'ESCAPE_PHRASES should be frozen');
  });
});

describe('matchEscapePhrase', () => {
  it('returns the phrase when present (case-insensitive)', () => {
    assert.equal(matchEscapePhrase('please apply a hotfix'), 'hotfix');
    assert.equal(matchEscapePhrase('Apply a HOTFIX now'), 'hotfix');
    assert.equal(matchEscapePhrase('this is a trivial fix'), 'trivial fix');
  });

  it('returns null when no phrase is present', () => {
    assert.equal(matchEscapePhrase('please implement the feature'), null);
    assert.equal(matchEscapePhrase('refactor the module'), null);
  });

  it('respects word boundaries — does not match substrings inside other words', () => {
    // "urgentcare" should NOT match "urgent"
    assert.equal(matchEscapePhrase('urgentcare clinic note'), null);
    // "urgent." should match (punctuation is a boundary)
    assert.equal(matchEscapePhrase('this is urgent.'), 'urgent');
  });

  it('handles empty and non-string input gracefully', () => {
    assert.equal(matchEscapePhrase(''), null);
    assert.equal(matchEscapePhrase(null), null);
    assert.equal(matchEscapePhrase(undefined), null);
    assert.equal(matchEscapePhrase(42), null);
  });

  it('returns the first match (deterministic order)', () => {
    const text = 'hotfix and trivial fix in one message';
    const match = matchEscapePhrase(text);
    assert.ok(['hotfix', 'trivial fix'].includes(match), 'returns a recognized phrase');
  });
});
