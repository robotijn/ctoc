/**
 * Content-contract tests for CU1 s5 — example + source-ref gaps.
 *
 * Reads the REAL SKILL.md files (no mocks/doubles) and asserts the three
 * gaps from the CU1 acceptance criteria are filled:
 *   1. posthog-analytics gains a SQL BAD/SAFE query footgun (unbounded event
 *      scan vs. date-bounded query).
 *   2. sentry-errors gains a C++ (cpp) example with a real native-SDK concern
 *      (flush/close before exit).
 *   3. react-native-bridge-checker reaches >=10 distinct dated source refs.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const projectRoot = path.join(__dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(projectRoot, rel), 'utf8');
}

describe('CU1 s5 — example + source-ref gaps', () => {
  it('posthog-analytics has a SQL BAD/SAFE event-query footgun (unbounded scan vs. date-bounded)', () => {
    const md = read('skills/saas/posthog-analytics/SKILL.md');
    // A dedicated SQL block that shows an unbounded / full-scan query vs. a
    // date-bounded one. Distinct from the pre-existing schema example.
    assert.match(md, /```sql[\s\S]*?-- BAD[\s\S]*?```/i, 'expected a SQL BAD block');
    assert.match(md, /```sql[\s\S]*?-- SAFE[\s\S]*?```/i, 'expected a SQL SAFE block');
    // The footgun the plan specifies: unbounded query / full scan without a date filter.
    assert.match(md, /full[\s-]?scan|unbounded|without a (date|time) filter/i,
      'expected the unbounded/full-scan footgun to be described');
  });

  it('sentry-errors has a C++ (cpp) example demonstrating flush/close before exit', () => {
    const md = read('skills/saas/sentry-errors/SKILL.md');
    assert.match(md, /```(cpp|c\+\+)[\s\S]*?```/i, 'expected a cpp-fenced code block');
    // Non-trivial native-SDK concern: events lost if not flushed/closed before exit.
    assert.match(md, /sentry_close|sentry_flush/,
      'expected sentry_close()/sentry_flush() in the C++ example');
    assert.match(md, /```(cpp|c\+\+)[\s\S]*?\/\/ BAD[\s\S]*?```/i, 'expected a C++ BAD case');
    assert.match(md, /```(cpp|c\+\+)[\s\S]*?\/\/ SAFE[\s\S]*?```/i, 'expected a C++ SAFE case');
  });

  it('react-native-bridge-checker has >=10 distinct dated source references', () => {
    const md = read('skills/mobile/react-native-bridge-checker/SKILL.md');
    // A "## Sources" section must exist.
    assert.match(md, /^##\s+Sources/m, 'expected a ## Sources section');
    const sources = md.slice(md.search(/^##\s+Sources/m));
    // Each source line: a markdown link + a parenthetical date (YYYY-MM-DD or Mon YYYY / YYYY).
    const bullets = sources.split('\n').filter((l) => /^\s*-\s+\[.+\]\(https?:\/\/.+\)/.test(l));
    const dated = bullets.filter((l) => /\b(20\d\d)(-\d\d-\d\d)?\b|\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+20\d\d/.test(l));
    const urls = new Set(bullets.map((l) => (l.match(/\((https?:\/\/[^)]+)\)/) || [])[1]));
    assert.ok(dated.length >= 10, `expected >=10 dated source bullets, found ${dated.length}`);
    assert.ok(urls.size >= 10, `expected >=10 distinct source URLs, found ${urls.size}`);
  });
});
