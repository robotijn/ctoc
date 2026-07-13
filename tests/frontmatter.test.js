/**
 * CTOC — Shared CRLF-safe frontmatter helper (W07-s1)
 *
 * Behavioral tests for src/lib/frontmatter.js — the single home of the
 * CRLF-safe frontmatter pattern (finding H1). A plan checked out on Windows
 * (CRLF line endings) MUST parse byte-identically to the same plan on
 * macOS/Linux (LF). These tests build a byte-level CRLF twin from an LF
 * fixture (`lf.replace(/\n/g, '\r\n')`) and assert equivalence. No doubles.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  FRONTMATTER_OPEN,
  FRONTMATTER_BLOCK,
  splitLines,
  parseFrontmatter,
} = require('../src/lib/frontmatter');

// A realistic plan fixture with title / priority / files: block, LF line endings.
const LF_FIXTURE = [
  '---',
  'title: "W07-s1 — Shared CRLF-safe frontmatter helper"',
  'type: feature',
  'priority: MEDIUM',
  'files:',
  '  - src/lib/frontmatter.js',
  '  - tests/frontmatter.test.js',
  '---',
  '',
  '# Body heading',
  '',
  'Some body text with a trailing line.',
  '',
].join('\n');

// Byte-level Windows twin: every LF becomes CRLF.
const CRLF_FIXTURE = LF_FIXTURE.replace(/\n/g, '\r\n');

describe('frontmatter — CRLF/LF equivalence', () => {
  it('parseFrontmatter(crlf) deep-equals parseFrontmatter(lf)', () => {
    assert.deepStrictEqual(
      parseFrontmatter(CRLF_FIXTURE),
      parseFrontmatter(LF_FIXTURE)
    );
  });

  it('returned raw contains no carriage return, and no line does either', () => {
    const { raw, lines } = parseFrontmatter(CRLF_FIXTURE);
    assert.ok(!/\r/.test(raw), 'raw must be free of \\r');
    for (const line of lines) {
      assert.ok(!/\r/.test(line), `line "${line}" must be free of \\r`);
    }
  });

  it('body for a CRLF doc equals the LF twin body', () => {
    assert.strictEqual(
      parseFrontmatter(CRLF_FIXTURE).body,
      parseFrontmatter(LF_FIXTURE).body
    );
  });

  it('lines reflect the fixture interior fields', () => {
    const { lines } = parseFrontmatter(LF_FIXTURE);
    assert.ok(lines.includes('title: "W07-s1 — Shared CRLF-safe frontmatter helper"'));
    assert.ok(lines.includes('files:'));
    assert.ok(lines.includes('  - src/lib/frontmatter.js'));
  });
});

describe('frontmatter — no-frontmatter input', () => {
  it('returns hasFrontmatter:false with whole content as body', () => {
    assert.deepStrictEqual(parseFrontmatter('no frontmatter here'), {
      hasFrontmatter: false,
      raw: '',
      lines: [],
      body: 'no frontmatter here',
    });
  });

  it('coerces a non-string input without throwing', () => {
    const result = parseFrontmatter(null);
    assert.strictEqual(result.hasFrontmatter, false);
    assert.strictEqual(result.body, 'null');
  });
});

describe('frontmatter — FRONTMATTER_OPEN fence', () => {
  it('matches both LF and CRLF opening fences', () => {
    assert.strictEqual(FRONTMATTER_OPEN.test('---\ntitle: x\n'), true);
    assert.strictEqual(FRONTMATTER_OPEN.test('---\r\ntitle: x\r\n'), true);
  });

  it('does not match a non-fence opening', () => {
    assert.strictEqual(FRONTMATTER_OPEN.test('## not a fence\n'), false);
  });
});

describe('frontmatter — FRONTMATTER_BLOCK', () => {
  it('captures the interior as group 1 for both endings', () => {
    const lf = '---\na: 1\nb: 2\n---\nbody'.match(FRONTMATTER_BLOCK);
    const crlf = '---\r\na: 1\r\nb: 2\r\n---\r\nbody'.match(FRONTMATTER_BLOCK);
    assert.ok(lf, 'LF block must match');
    assert.ok(crlf, 'CRLF block must match');
    assert.strictEqual(lf[1], 'a: 1\nb: 2');
  });
});

describe('frontmatter — splitLines', () => {
  it('splitLines(crlf) deep-equals splitLines(lf)', () => {
    assert.deepStrictEqual(splitLines('a\r\nb'), splitLines('a\nb'));
    assert.deepStrictEqual(splitLines('a\r\nb'), ['a', 'b']);
  });
});
