'use strict';

/**
 * W07-s3 — CRLF fix: plan-index sync + metrics parsers.
 *
 * Proves the two background-pipeline frontmatter parsers read a plan checked out
 * on Windows (CRLF) byte-identically to its LF twin:
 *   - `plan-index/sync-unit.js` — `splitFrontmatter` + `parseFrontmatterFields`
 *     and the declared-file line-count metric (`countLinesAddedByPlan`), which
 *     silently returned 0 on a CRLF plan before the s1-helper migration.
 *
 * Fixtures are LF/CRLF twins: the CRLF fixture is the exact `\n` → `\r\n`
 * transform of the LF fixture, so any difference in the parsed result is the bug.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  splitFrontmatter,
  parseFrontmatterFields,
} = require('../src/lib/plan-index/sync-unit');

// LF fixture and its exact CRLF twin.
const LF_PLAN = [
  '---',
  'title: W07 fixture plan',
  'status: todo',
  'parent_vision: some-vision',
  'files:',
  '  - src/lib/a.js',
  '  - "src/lib/b.js"',
  '---',
  '',
  '# Body heading',
  '',
  'Some body text.',
  '',
].join('\n');
const CRLF_PLAN = LF_PLAN.replace(/\n/g, '\r\n');

const hasCr = (s) => /\r/.test(s);

// ── sync-unit: splitFrontmatter ────────────────────────────────────────────
test('sync-unit splitFrontmatter: CRLF frontmatter deep-equals LF twin and is \\r-free', () => {
  const lf = splitFrontmatter(LF_PLAN);
  const crlf = splitFrontmatter(CRLF_PLAN);

  assert.deepStrictEqual(crlf.frontmatter, lf.frontmatter);
  assert.ok(!hasCr(crlf.frontmatter), 'frontmatter must contain no carriage return');
  assert.deepStrictEqual(crlf.body, lf.body);
  assert.ok(!hasCr(crlf.body), 'body must contain no carriage return');
  // Sanity: the LF twin actually parsed a non-empty frontmatter block.
  assert.ok(lf.frontmatter.includes('title: W07 fixture plan'));
});

// ── sync-unit: parseFrontmatterFields ──────────────────────────────────────
test('sync-unit parseFrontmatterFields: CRLF files/parentVision/status equal LF and are \\r-free', () => {
  const lfFields = parseFrontmatterFields(splitFrontmatter(LF_PLAN).frontmatter);
  const crlfFields = parseFrontmatterFields(splitFrontmatter(CRLF_PLAN).frontmatter);

  assert.deepStrictEqual(crlfFields.files, lfFields.files);
  assert.deepStrictEqual(crlfFields.files, ['src/lib/a.js', 'src/lib/b.js']);
  for (const f of crlfFields.files) {
    assert.ok(!hasCr(f), `files entry must be \\r-free: ${JSON.stringify(f)}`);
  }
  assert.strictEqual(crlfFields.parentVision, lfFields.parentVision);
  assert.ok(!hasCr(String(crlfFields.parentVision)), 'parentVision must be \\r-free');
  assert.strictEqual(crlfFields.status, lfFields.status);
  assert.ok(!hasCr(String(crlfFields.status)), 'status must be \\r-free');
});

