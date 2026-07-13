'use strict';

/**
 * W07-s3 — CRLF fix: plan-index sync + metrics parsers.
 *
 * Proves the two background-pipeline frontmatter parsers read a plan checked out
 * on Windows (CRLF) byte-identically to its LF twin:
 *   - `plan-index/sync-unit.js` — `splitFrontmatter` + `parseFrontmatterFields`
 *   - `metrics-loop.js` — `extractFrontmatterField` + `extractFilesDeclaration`
 *     and the declared-file line-count metric (`countLinesAddedByPlan`), which
 *     silently returned 0 on a CRLF plan before the s1-helper migration.
 *
 * Fixtures are LF/CRLF twins: the CRLF fixture is the exact `\n` → `\r\n`
 * transform of the LF fixture, so any difference in the parsed result is the bug.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  splitFrontmatter,
  parseFrontmatterFields,
} = require('../src/lib/plan-index/sync-unit');
const {
  extractFrontmatterField,
  extractFilesDeclaration,
  countLinesAddedByPlan,
} = require('../src/lib/metrics-loop');

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

// ── metrics-loop: extractFrontmatterField ──────────────────────────────────
test('metrics extractFrontmatterField: CRLF title strictly equals LF value (no trailing \\r)', () => {
  const lfTitle = extractFrontmatterField(LF_PLAN, 'title');
  const crlfTitle = extractFrontmatterField(CRLF_PLAN, 'title');

  assert.strictEqual(crlfTitle, lfTitle);
  assert.strictEqual(crlfTitle, 'W07 fixture plan');
  assert.ok(!hasCr(String(crlfTitle)), 'title value must be \\r-free');
});

// ── metrics-loop: extractFilesDeclaration ──────────────────────────────────
test('metrics extractFilesDeclaration: CRLF files deep-equal LF and are non-empty', () => {
  const lfFiles = extractFilesDeclaration(LF_PLAN);
  const crlfFiles = extractFilesDeclaration(CRLF_PLAN);

  assert.deepStrictEqual(crlfFiles, lfFiles);
  assert.ok(crlfFiles.length > 0, 'declared files must be non-empty on a CRLF plan');
  assert.deepStrictEqual(crlfFiles, ['src/lib/a.js', 'src/lib/b.js']);
  for (const f of crlfFiles) {
    assert.ok(!hasCr(f), `files entry must be \\r-free: ${JSON.stringify(f)}`);
  }
});

// ── metrics-loop: line-count metric (the parent's "silent metric loss") ─────
test('metrics countLinesAddedByPlan: CRLF plan line-count equals LF count and is not zero', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'w07-crlf-metrics-'));
  try {
    // One real declared file with a known line count.
    const rel = path.join('src', 'lib', 'counted.js');
    const abs = path.join(dir, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    const declaredLines = ['line 1', 'line 2', 'line 3', 'line 4'];
    fs.writeFileSync(abs, declaredLines.join('\n'), 'utf8');
    const expectedCount = declaredLines.length; // split('\n').length

    // A plan that declares the real file, in LF and CRLF twins.
    const relPosix = rel.split(path.sep).join('/');
    const lfPlan = [
      '---',
      'title: line-count fixture',
      'files:',
      `  - ${relPosix}`,
      '---',
      '',
      '# Body',
    ].join('\n');
    const crlfPlan = lfPlan.replace(/\n/g, '\r\n');

    const lfCount = countLinesAddedByPlan(dir, { content: lfPlan });
    const crlfCount = countLinesAddedByPlan(dir, { content: crlfPlan });

    assert.strictEqual(lfCount, expectedCount, 'LF plan must count the declared file');
    assert.strictEqual(crlfCount, lfCount, 'CRLF plan must count identically to LF twin');
    assert.notStrictEqual(crlfCount, 0, 'CRLF plan must not silently undercount to zero');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
