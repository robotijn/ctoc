---
title: "W07-s3 — CRLF fix: plan-index sync + metrics parsers"
type: feature
parent_plan: "ctoc-audit-w07-cross-platform"
depends_on: ctoc-audit-w07-s1-frontmatter-helper
priority: MEDIUM
files:
  - src/lib/plan-index/sync-unit.js
  - src/lib/metrics-loop.js
  - tests/w07-crlf-syncunit-metrics.test.js
---

# W07-s3 — CRLF fix: plan-index sync + metrics parsers

**Slice scope:** The two named background-pipeline parsers. `sync-unit.splitFrontmatter()`
feeds the plan-index embedding sync; `metrics-loop` extracts the declared-file set for
the per-plan line-count metric (which silently returns 0 on a CRLF plan today). Migrate
both to the s1 helper. This slice also closes the parent's explicit "no stray `\r` leaked
into any parsed field value" requirement for sync-unit.

## Implementation Details

### Dependency Graph
```
src/lib/plan-index/sync-unit.js --requires--> ../frontmatter (s1)
src/lib/metrics-loop.js         --requires--> ./frontmatter (s1)
tests/w07-crlf-syncunit-metrics.test.js --requires--> both
```
No cycles. Depth 2.

### File Specification — `src/lib/plan-index/sync-unit.js` (MODIFY)
`splitFrontmatter()` at `:58-62` opens with `content.match(/^---\n([\s\S]*?)\n---\n?/)` (:59).
`parseFrontmatterFields()` at `:76-112` iterates `frontmatter.split('\n')` (:77).
- Add `const { parseFrontmatter } = require('../frontmatter');` (note the `../` — this
  file is under `src/lib/plan-index/`).
- Rewrite `splitFrontmatter()` to return the helper's `\r`-free `raw` as `frontmatter`:
```js
function splitFrontmatter(content) {
  const { hasFrontmatter, raw, body } = parseFrontmatter(content);
  if (!hasFrontmatter) return { frontmatter: '', body: content };
  return { frontmatter: raw, body };
}
```
- `parseFrontmatterFields(:77)` is now transitively correct because `raw` is `\r`-free —
  its `frontmatter.split('\n')` no longer leaks `\r` into `files`/`parent_vision`/`status`.
  Leave the field-walk logic unchanged (the `\r`-leak was the bug; the helper removes it).

### File Specification — `src/lib/metrics-loop.js` (MODIFY)
Two frontmatter sites:
- `extractFrontmatterField()` at `:199-203` — `content.match(/^---\n([\s\S]*?)\n---/)` (:200).
- `extractFilesDeclaration()` at `:566-581` — `content.match(/^---\n([\s\S]*?)\n---/)` (:567)
  and `fm.slice(filesIdx).split('\n').slice(1)` (:573).
- Add `const { parseFrontmatter } = require('./frontmatter');`.
- Rewrite both to source `raw` from the helper; keep `getYamlField` and the `files:` walk
  unchanged (the `.split('\n')` at :573 is safe on the `\r`-free `raw`):
```js
function extractFrontmatterField(content, field) {
  const { hasFrontmatter, raw } = parseFrontmatter(content);
  if (!hasFrontmatter) return null;
  return getYamlField(raw, field);
}
function extractFilesDeclaration(content) {
  const { hasFrontmatter, raw } = parseFrontmatter(content);
  if (!hasFrontmatter) return [];
  const fm = raw;                          // \r-free
  // ...unchanged files: block walk...
}
```

### Test Plan — `tests/w07-crlf-syncunit-metrics.test.js` (CREATE)
CRLF/LF twins. Import the module functions directly (they are pure on `content`).
- `splitFrontmatter(crlf).frontmatter` deep-equals the LF twin's, and contains no `\r`;
  `body` equal across twins.
- `parseFrontmatterFields(splitFrontmatter(crlf).frontmatter).files` deep-equals the LF
  result AND no entry contains a `\r`.
- `extractFrontmatterField(crlf, 'title')` strictly equals the LF value (no trailing `\r`).
- `extractFilesDeclaration(crlf)` deep-equals the LF result and is **non-empty**.
- Line-count metric: write one real temp file, declare it in a CRLF plan fixture, and
  assert the metrics line-count path returns the LF twin's count, **not zero** (the parent's
  "silent metric loss" scenario).

## Execution Plan

### Step 8: TEST
Write `tests/w07-crlf-syncunit-metrics.test.js` FIRST (TDD — fails until migrated),
asserting BEHAVIOR per the Test Plan:
- [ ] Write a test: `splitFrontmatter(crlf).frontmatter` `deepStrictEqual` LF twin, no `\r`.
- [ ] Write a test: `parseFrontmatterFields` yields `\r`-free `files` equal to LF.
- [ ] Write a test: `extractFilesDeclaration(crlf)` `deepStrictEqual` LF, non-empty.
- [ ] Write a test: the declared-file line-count equals the LF count and is not zero.

### Step 9: PREPARE
- [ ] Confirm s1 `src/lib/frontmatter.js` exists (this slice `depends_on` s1).
- [ ] Confirm the `../frontmatter` vs `./frontmatter` require depth for each file.

### Step 10: IMPLEMENT
- [ ] `src/lib/plan-index/sync-unit.js` — import `parseFrontmatter` (`../frontmatter`);
  rewrite `splitFrontmatter()`; leave `parseFrontmatterFields` field-walk unchanged.
- [ ] `src/lib/metrics-loop.js` — import `parseFrontmatter` (`./frontmatter`); rewrite
  `extractFrontmatterField()` and `extractFilesDeclaration()`.

### Step 11: REVIEW
- [ ] Verify LF behavior unchanged (index sync + metrics existing tests still green).
- [ ] Verify `body` boundary from the helper matches sync-unit's original `\n?`-consuming
  boundary so `splitSections` is unaffected.

### Step 12: OPTIMIZE
- [ ] Confirm one helper call per parse; no leftover legacy `/^---\n/` regex in either file.

### Step 13: SECURE
- [ ] Confirm the `files:` walk still stops at the next top-level key (no over-collection);
  no path use here beyond the existing `path.join(projectRoot, rel)` (unchanged).

### Step 14: VERIFY
- [ ] Run `node --test tests/w07-crlf-syncunit-metrics.test.js` — all pass.
- [ ] Run the full suite `node --test tests/*.test.js` — `# fail 0`, 0 skipped.

### Step 15: DOCUMENT
- [ ] Note CRLF-safety via the shared helper in both function doc comments (finding H1),
  and that the metric no longer silently undercounts CRLF plans.

### Step 16: FINAL-REVIEW
- [ ] `\r`-leak eliminated (proven by no-`\r` assertions); metric-loss scenario fixed;
  no gate crossed (Gate 2 is human).
