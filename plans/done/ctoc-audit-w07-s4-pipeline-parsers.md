---
approved_by: human
approved_at: 2026-07-13T18:37:06.334Z
gate_crossed: review → done
---

---
iron_loop: true
approved_by: human
approved_at: 2026-07-13T16:17:11.881Z
gate_crossed: implementation → todo
---

---
title: "W07-s4 — CRLF fix: remaining runtime pipeline parsers"
type: feature
parent_plan: "ctoc-audit-w07-cross-platform"
depends_on: ctoc-audit-w07-s1-frontmatter-helper
priority: MEDIUM
files:
  - src/lib/vision-decomposer.js
  - src/lib/inbox.js
  - src/lib/iron-loop-enforcer.js
  - tests/w07-crlf-pipeline-parsers.test.js
---

# W07-s4 — CRLF fix: remaining runtime pipeline parsers

**Slice scope:** The three additional runtime frontmatter parsers found by the parent's
mandated Step-5 grep sweep that are NOT owned by a sibling workstream. Each carries the
same fully-broken `/^---\n/` pattern. (`agent-resolver.js` is excluded → W03/W04;
`actions.js` marker-prepend → W02, per the parent's Out-of-Scope.)

## Implementation Details

### Dependency Graph
```
src/lib/vision-decomposer.js   --requires--> ./frontmatter (s1)   [+ already requires state.parseMetadata]
src/lib/inbox.js               --requires--> ./frontmatter (s1)
src/lib/iron-loop-enforcer.js  --requires--> ./frontmatter (s1)
tests/w07-crlf-pipeline-parsers.test.js --requires--> all three
```
No cycles (`frontmatter.js` has no internal deps). Depth 2.

### File Specification — `src/lib/vision-decomposer.js` (MODIFY)
Three broken sites (its `:43`/`:235` `parseMetadata` calls are already fixed transitively
by s2 and are NOT edited here):
- `:47` strip frontmatter — `content.replace(/^---\n[\s\S]*?\n---\n/, '')`.
- `:240` detect — `content.match(/^---\n/)`; `:247` prepend — `content.replace(/^---\n/, ...)`.
- Add `const { parseFrontmatter, FRONTMATTER_OPEN } = require('./frontmatter');`.
- `:47` → use the helper's `body`:
  `const { body } = parseFrontmatter(content);` then use `body` where the stripped text is needed.
- `:240`/`:247` → CRLF-safe detect + prepend that preserves the matched fence:
```js
if (FRONTMATTER_OPEN.test(content)) {
  content = content.replace(FRONTMATTER_OPEN, (fence) => fence + additions);
} else { /* unchanged else: prepend a fresh --- block */ }
```
This closes the CRLF double-frontmatter bug (on CRLF today `/^---\n/` fails, so the else
branch prepends a SECOND `---` block).

### File Specification — `src/lib/inbox.js` (MODIFY)
Local `parseFrontmatter()` at `:140-154` — `content.match(/^---\n([\s\S]*?)\n---/)` (:141),
`m[1].split('\n')` (:144). Import the helper under an alias to avoid the name clash:
```js
const { parseFrontmatter: splitFm } = require('./frontmatter');
function parseFrontmatter(content) {
  const { hasFrontmatter, lines } = splitFm(content);
  if (!hasFrontmatter) return {};
  const out = {};
  for (const line of lines) { /* UNCHANGED colon-split / unquote logic */ }
  return out;
}
```

### File Specification — `src/lib/iron-loop-enforcer.js` (MODIFY)
`readFM()` at `:95-101` has a two-tier match: line-1 `/^---\n.../m` (:98) with a
non-line-1 fallback `/\n---\n.../` (:99), returning `{ fm, body: content }`.
- Add `const { parseFrontmatter } = require('./frontmatter');`.
- Use the helper for the line-1 case; keep a CRLF-safe fallback for the heading-first case
  and strip `\r` from the fallback capture:
```js
const parsed = parseFrontmatter(content);
if (parsed.hasFrontmatter) return { fm: parsed.raw, body: content };
const m = content.match(/\r?\n---\r?\n([\s\S]*?)\r?\n---/);
return { fm: m ? m[1].replace(/\r/g, '') : '', body: content };
```

### Test Plan — `tests/w07-crlf-pipeline-parsers.test.js` (CREATE)
CRLF/LF twins.
- `inbox`: `parseFrontmatter(crlf)` deep-equals LF twin (import via the module export).
- `iron-loop-enforcer`: write a CRLF plan file and its LF twin; `readFM(crlfPath).fm`
  deep-equals `readFM(lfPath).fm`, with no `\r`; also cover the non-line-1 (heading-first)
  CRLF fixture through the fallback path.
- `vision-decomposer`: drive the exported decomposition entry point on a temp **CRLF**
  vision file; assert (a) the markers are inserted ONCE — the resulting file has exactly
  one opening+closing `---` pair (no duplicated frontmatter block), and (b) the
  frontmatter-stripped body matches the LF twin's stripped body.

## Execution Plan

### Step 8: TEST
Write `tests/w07-crlf-pipeline-parsers.test.js` FIRST (TDD — fails until migrated),
asserting BEHAVIOR per the Test Plan:
- [ ] Write a test: `inbox.parseFrontmatter(crlf)` `deepStrictEqual` LF twin.
- [ ] Write a test: `iron-loop-enforcer.readFM(crlfPath).fm` equals LF, no `\r`; plus the
  heading-first CRLF fallback case.
- [ ] Write a test: decomposing a CRLF vision inserts markers once (no double `---` block)
  and strips the body identically to LF.

### Step 9: PREPARE
- [ ] Confirm s1 `src/lib/frontmatter.js` exists (this slice `depends_on` s1).
- [ ] Confirm each module's export surface exposes the function under test (add a minimal
  export only if a pure function is currently unexported — do not restructure logic).

### Step 10: IMPLEMENT
- [ ] `src/lib/vision-decomposer.js` — import helper; fix `:47` strip and `:240`/`:247`
  detect+prepend.
- [ ] `src/lib/inbox.js` — import helper (aliased); rewrite local `parseFrontmatter()`.
- [ ] `src/lib/iron-loop-enforcer.js` — import helper; rewrite `readFM()` (line-1 + CRLF-safe
  fallback).

### Step 11: REVIEW
- [ ] Verify LF behavior unchanged for all three (existing `tests/inbox.test.js`,
  `tests/iron-loop-enforcer.test.js`, and vision-decomposer tests still green).
- [ ] Verify the double-frontmatter bug is gone (marker inserted once on CRLF).

### Step 12: OPTIMIZE
- [ ] Confirm no leftover `/^---\n/` in any of the three files.

### Step 13: SECURE
- [ ] Confirm the prepend uses a function replacer (no `$&`/`$1` interpolation of file
  content into the replacement) — no injection of `content` into a regex replacement string.

### Step 14: VERIFY
- [ ] Run `node --test tests/w07-crlf-pipeline-parsers.test.js tests/inbox.test.js tests/iron-loop-enforcer.test.js` — all pass.
- [ ] Run the full suite `node --test tests/*.test.js` — `# fail 0`, 0 skipped.

### Step 15: DOCUMENT
- [ ] Note CRLF-safety via the shared helper in each touched function's doc comment
  (finding H1); note the vision-decomposer double-frontmatter fix.

### Step 16: FINAL-REVIEW
- [ ] All three parsers CRLF-safe; no double-frontmatter regression; excluded siblings
  (agent-resolver → W03/W04, actions.js → W02) untouched; no gate crossed (Gate 2 is human).


---

## Execution Plan (Steps 8-16)

### Step 8: TEST (TDD Red)
- [ ] Write tests for the implementation
- [ ] Test error conditions
- [ ] Run tests - expect RED (failing)

### Step 9: PREPARE
- [ ] Install dependencies if needed
- [ ] Check prerequisites
- [ ] Verify dev environment ready
- [ ] Create directories/config if needed

### Step 10: IMPLEMENT
- [ ] Implement the feature according to requirements
- [ ] Add error handling
- [ ] Wire up integration points

### Step 11: REVIEW
- [ ] Self-review all new code
- [ ] Verify integration points work together
- [ ] Check error handling completeness

### Step 12: OPTIMIZE
- [ ] Remove redundant operations
- [ ] Optimize critical paths
- [ ] Simplify complex code

### Step 13: SECURE
- [ ] Validate inputs (no path traversal)
- [ ] Sanitize outputs
- [ ] No secrets in code
- [ ] Safe file operations

### Step 14: VERIFY
- [ ] Run lint + type check
- [ ] Run ALL tests (TDD Green)
- [ ] Check coverage >= 80%
- [ ] 0 skipped, 0 flaky tests

### Step 15: DOCUMENT
- [ ] Update relevant documentation
- [ ] Add JSDoc comments to new functions
- [ ] Update CHANGELOG if needed

### Step 16: FINAL-REVIEW
- [ ] Verify steps 8-15 completed correctly
- [ ] All quality checks passed
- [ ] Manual verification if needed
- [ ] Ready for human review
