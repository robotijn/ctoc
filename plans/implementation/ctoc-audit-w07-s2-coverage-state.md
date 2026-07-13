---
title: "W07-s2 — CRLF fix: enforcement hot path (plan-coverage + state)"
type: feature
parent_plan: "ctoc-audit-w07-cross-platform"
depends_on: ctoc-audit-w07-s1-frontmatter-helper
priority: MEDIUM
files:
  - src/lib/plan-coverage.js
  - src/lib/state.js
  - tests/w07-crlf-coverage-state.test.js
---

# W07-s2 — CRLF fix: enforcement hot path (plan-coverage + state)

**Slice scope:** The two parsers that actually cause the Windows lockout.
`plan-coverage.readPlanFiles()` is what the PreToolUse enforcement hook calls to
resolve a plan's `files:` coverage; `state.parseMetadata()` is imported by
`plan-validator.js:10`, so this single fix propagates into **every** gate check
(`validateForReview`, `validateReviewToDone`, …) without editing plan-validator.
Migrate both to the s1 helper.

## Implementation Details

### Dependency Graph
```
src/lib/state.js         --requires-->  src/lib/frontmatter.js (s1)
src/lib/plan-coverage.js --requires-->  src/lib/frontmatter.js (s1)
src/lib/plan-validator.js --requires--> src/lib/state.parseMetadata  (UNCHANGED — inherits the fix)
tests/w07-crlf-coverage-state.test.js --requires--> state.js, plan-coverage.js
```
No cycles (`frontmatter.js` has no internal deps). Depth 2.

### File Specification — `src/lib/state.js` (MODIFY)
`parseMetadata()` at `:58-80` currently opens with
`content.match(/^---\n([\s\S]*?)\n---/)` (:59) and iterates `match[1].split('\n')` (:63).
- Add `const { parseFrontmatter } = require('./frontmatter');` to the imports.
- Replace the match+split with the helper; keep the existing key/value/boolean/number
  parsing verbatim so LF behavior is byte-identical:
```js
function parseMetadata(content) {
  const { hasFrontmatter, lines } = parseFrontmatter(content);
  if (!hasFrontmatter) return {};
  const metadata = {};
  lines.forEach(line => { /* UNCHANGED colon-split / unquote / bool / int logic */ });
  return metadata;
}
```

### File Specification — `src/lib/plan-coverage.js` (MODIFY)
`readPlanFiles()` at `:76-98` opens with `content.match(/^---\n([\s\S]*?)\n---/)` (:79)
and later `after.split('\n').slice(1)` (:86).
- Add `const { parseFrontmatter } = require('./frontmatter');` to the imports.
- Replace only the frontmatter extraction; keep the `files:` block walk unchanged
  (the `after.split('\n')` at :86 is now safe because the helper's `raw` is `\r`-free):
```js
const { hasFrontmatter, raw } = parseFrontmatter(content);
if (!hasFrontmatter) return [];
const fmBody = raw;                       // \r-free
const filesIdx = fmBody.search(/^files:\s*$/m);
// ...unchanged from here (slice, split('\n'), glob collection)...
```

### Test Plan — `tests/w07-crlf-coverage-state.test.js` (CREATE)
Behavior tests, CRLF/LF twins (`crlf = lf.replace(/\n/g, '\r\n')`). Fixture is a
realistic plan string with `title`, `priority`, `approved_by`, and a `files:` block.
- `parseMetadata(crlf)` deep-equals `parseMetadata(lf)` AND is non-empty (not `{}`).
- Write the CRLF fixture to a temp `plans/todo/<slug>.md` (via `os.tmpdir()`), and its
  LF twin; assert `readPlanFiles(crlfPath)` deep-equals `readPlanFiles(lfPath)` and is
  **non-empty** — the end-to-end lockout proof ("coverage resolves to nothing" is what
  H1 actually breaks).
- End-to-end coverage: assert the declared file (e.g. `src/foo.js`) is reported covered
  for the CRLF fixture via plan-coverage's public coverage entry point (read the module's
  exports and drive the same function the hook calls); assert it is NOT treated as
  uncovered.
- Gate propagation: assert `require('../src/lib/plan-validator')` resolves
  `parseMetadata` from `state.js` (same function object) so the gate checks inherit the
  fix; where a minimal valid plan fixture is feasible, drive `validateForReview` on the
  CRLF and LF twins and assert the same verdict.

## Execution Plan

### Step 8: TEST
Write `tests/w07-crlf-coverage-state.test.js` FIRST (TDD — fails until both parsers
are migrated), asserting BEHAVIOR per the Test Plan:
- [ ] Write a test: `parseMetadata(crlf)` `deepStrictEqual` `parseMetadata(lf)`, non-empty.
- [ ] Write a test: `readPlanFiles(crlfPath)` `deepStrictEqual` `readPlanFiles(lfPath)`,
  non-empty (the lockout scenario).
- [ ] Write a test: the declared file resolves as COVERED under CRLF via the coverage API.
- [ ] Write a test: gate propagation — parseMetadata parity holds for a plan carrying
  gate-relevant fields (drive `validateForReview` on both twins where feasible).

### Step 9: PREPARE
- [ ] Confirm s1 `src/lib/frontmatter.js` exists and exports `parseFrontmatter` (this
  slice `depends_on` s1).
- [ ] Confirm a writable temp dir for fixtures via `os.tmpdir()` + `fs.mkdtempSync`.

### Step 10: IMPLEMENT
- [ ] `src/lib/state.js` — import `parseFrontmatter`; rewrite `parseMetadata()` per spec
  (keep key/value/bool/number logic verbatim).
- [ ] `src/lib/plan-coverage.js` — import `parseFrontmatter`; rewrite the frontmatter
  extraction in `readPlanFiles()`; leave the `files:` walk unchanged.

### Step 11: REVIEW
- [ ] Verify LF behavior unchanged (existing `tests/state.test.js` + plan-coverage tests
  still green) — the migration is drop-in on LF.
- [ ] Verify plan-validator is NOT edited (it inherits the fix via its `parseMetadata` import).

### Step 12: OPTIMIZE
- [ ] Confirm no double frontmatter scan (helper called once per parse; no leftover
  legacy regex).

### Step 13: SECURE
- [ ] Confirm the `files:` glob collection still rejects a next-top-level-key line
  (no widening of what counts as a covered file); no path-traversal regression in coverage.

### Step 14: VERIFY
- [ ] Run `node --test tests/w07-crlf-coverage-state.test.js tests/state.test.js` — all pass.
- [ ] Run the full suite `node --test tests/*.test.js` — `# fail 0`, 0 skipped.

### Step 15: DOCUMENT
- [ ] Update the `parseMetadata` / `readPlanFiles` doc comments to note CRLF-safety via the
  shared helper (finding H1), so no maintainer re-inlines a bare `/^---\n/`.

### Step 16: FINAL-REVIEW
- [ ] The Windows-lockout scenario is proven fixed end-to-end (coverage resolves under
  CRLF); gate propagation proven; no gate crossed (Gate 2 is human).
