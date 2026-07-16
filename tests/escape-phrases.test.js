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

  it('does NOT match bare-word phrases embedded in a file path or identifier', () => {
    // Path/identifier punctuation (/ \ - _ .) is NOT a word boundary for escape
    // detection. A user innocuously naming a file must never disable the
    // write-enforcement guard. See adversarial-repair: silent gate bypass.
    assert.equal(matchEscapePhrase('please fix the bug in src/hotfix-runner.js'), null);
    assert.equal(matchEscapePhrase('the issue is in src/urgent-alerts.js'), null);
    assert.equal(matchEscapePhrase('look at hotfix_manager.py'), null);
    assert.equal(matchEscapePhrase('hotfixes are queued'), null);
    assert.equal(matchEscapePhrase('trivially complex logic'), null);
    assert.equal(matchEscapePhrase('C:\\repo\\urgent-alerts.js'), null);
    // Dot-EXTENSION filenames must NOT match: a `.` is a boundary only when it is
    // itself followed by whitespace/end (a sentence period), never when followed
    // by an extension char. This was a surviving hole of the same class.
    assert.equal(matchEscapePhrase('the file urgent.js is broken'), null);
    assert.equal(matchEscapePhrase('run hotfix.md now'), null);
    assert.equal(matchEscapePhrase('urgent.json'), null);
  });

  it('matches genuine directives wrapped in brackets/quotes (opening punctuation is a boundary)', () => {
    // The leading boundary accepts an opening bracket/quote so a real directive
    // wrapped in punctuation is not silently dropped (a fail-safe over-narrowing).
    assert.equal(matchEscapePhrase('(hotfix)'), 'hotfix');
    assert.equal(matchEscapePhrase('"urgent"'), 'urgent');
    assert.equal(matchEscapePhrase('[skip planning]'), 'skip planning');
    assert.equal(matchEscapePhrase('please, urgent, do it'), 'urgent');
  });

  it('still matches bare-word phrases used as genuine standalone directives', () => {
    assert.equal(matchEscapePhrase('do a proper hotfix now'), 'hotfix');
    assert.equal(matchEscapePhrase('this is urgent'), 'urgent');
    assert.equal(matchEscapePhrase('hotfix.'), 'hotfix');
    assert.equal(matchEscapePhrase('urgent!'), 'urgent');
    assert.equal(matchEscapePhrase('hotfix'), 'hotfix');
    // A RUN of sentence punctuation (ellipsis / !! / ?!) is still a boundary — the
    // trailing lookahead quantifies the punct class, so common emphatic prose works
    // while a filename dot (alnum after the dot) still does NOT match.
    assert.equal(matchEscapePhrase('please do a quick fix...'), 'quick fix');
    assert.equal(matchEscapePhrase('this is urgent!!'), 'urgent');
    assert.equal(matchEscapePhrase('hotfix?!'), 'hotfix');
    assert.equal(matchEscapePhrase('urgent.js...'), null); // filename, not a directive
    assert.equal(matchEscapePhrase('hotfix.md.'), null);
  });

  it('still matches multi-word directives', () => {
    assert.equal(matchEscapePhrase('please skip planning for this'), 'skip planning');
    assert.equal(matchEscapePhrase('just skip iron loop here'), 'skip iron loop');
    assert.equal(matchEscapePhrase('this is a quick fix'), 'quick fix');
    assert.equal(matchEscapePhrase('a trivial fix'), 'trivial fix');
    assert.equal(matchEscapePhrase('only a trivial change'), 'trivial change');
  });
});
