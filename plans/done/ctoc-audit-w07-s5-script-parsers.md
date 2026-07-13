---
approved_by: human
approved_at: 2026-07-13T18:37:06.361Z
gate_crossed: review → done
---

---
iron_loop: true
approved_by: human
approved_at: 2026-07-13T16:17:11.906Z
gate_crossed: implementation → todo
---

---
title: "W07-s5 — CRLF fix: dev-tooling script frontmatter parsers"
type: feature
parent_plan: "ctoc-audit-w07-cross-platform"
depends_on: ctoc-audit-w07-s1-frontmatter-helper
priority: MEDIUM
files:
  - src/scripts/v8-migrate-skills.js
  - src/scripts/strip-unenforced-budgets.js
  - tests/w07-crlf-scripts.test.js
---

# W07-s5 — CRLF fix: dev-tooling script frontmatter parsers

**Slice scope:** The two `src/scripts/**` frontmatter parsers surfaced by the parent's
mandated grep sweep. They carry the identical fully-broken `/^---\n/` pattern. They are
dev-time tooling (not the runtime enforcement hot path), so this is a lower-risk slice —
but the parent's second user story is explicit that *no* parser is left behind, and the
Step-5 mandate says "add every match found". Migrating them to the s1 helper keeps a single
source of the CRLF-safe pattern rather than re-inlining it.

### Decision recorded (scope): why the scripts are IN
The parent's problem statement centers the runtime lockout, but its Story 2 ("the CRLF-safe
pattern applied consistently across every frontmatter parser — including the ones not
individually named ... so that no parser left behind silently reintroduces the lockout") and
its Step-5 Decision ("add every match found to the implementation plan's file list") both
mandate closing the whole sweep. These scripts are un-owned by any sibling workstream, so
they land here. If Gate-2 review judges a script obsolete (e.g. the v8 migration is complete),
that removal is a maintainer call at the gate — not a silent decomposer deferral.

## Implementation Details

### Dependency Graph
```
src/scripts/v8-migrate-skills.js        --requires--> ../lib/frontmatter (s1)
src/scripts/strip-unenforced-budgets.js --requires--> ../lib/frontmatter (s1)
tests/w07-crlf-scripts.test.js          --requires--> both scripts (via their exports)
```
Scripts depending on `lib/` is an accepted direction (tooling consumes library). No cycles.
Depth 2.

### File Specification — `src/scripts/v8-migrate-skills.js` (MODIFY)
`parseFrontmatter()` at `:65-69` — `content.match(/^---\n([\s\S]*?)\n---/)` (:66), returns
`{ raw, end: m[0].length }`. Line `:123` — `content.replace(/^---\n[\s\S]*?\n---/, ...)`.
- Add `const { parseFrontmatter: splitFm, FRONTMATTER_BLOCK } = require('../lib/frontmatter');`
  (note `../lib/` — this file is under `src/scripts/`).
- Rewrite the local parse to delegate; compute `end` from the helper's `body` so no extra
  helper API is needed:
```js
function parseFrontmatter(content) {
  const p = splitFm(content);
  if (!p.hasFrontmatter) return null;
  return { raw: p.raw, end: content.length - p.body.length };   // == m[0].length
}
```
- `:123` reconstruction → replace `/^---\n[\s\S]*?\n---/` with `FRONTMATTER_BLOCK` in the
  `content.replace(...)` so the replace is CRLF-safe.

### File Specification — `src/scripts/strip-unenforced-budgets.js` (MODIFY)
`stripFromFrontmatter()` at `:41-59+`: two-tier match `/^---\n.../` (:44) with a non-line-1
fallback `/\n---\n.../` (:45); `fmBody.split('\n')` (:51).
- Add `const { parseFrontmatter } = require('../lib/frontmatter');`.
- Use the helper for the line-1 case; keep a CRLF-safe fallback for the heading-first case;
  split via `/\r?\n/` (or rely on the helper's already-`\r`-free `raw`):
```js
const p = parseFrontmatter(content);
let fmBody, original;
if (p.hasFrontmatter) { fmBody = p.raw; original = content.slice(0, content.length - p.body.length); }
else {
  const m = content.match(/\r?\n---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return { changed: false, content };
  fmBody = m[1].replace(/\r/g, ''); original = m[0];
}
// ...unchanged max_tokens / max_tool_calls line filtering on fmBody...
```
(Executor: preserve the exact reconstruction semantics `stripFromFrontmatter` relies on at
`:56-59`; the point is the `\r`-free `fmBody` and CRLF-safe fences.)

### Test Plan — `tests/w07-crlf-scripts.test.js` (CREATE)
CRLF/LF twins. These pure functions must be reachable — if a function is currently only
invoked under a `require.main === module` guard, add it to `module.exports` (a minimal,
behavior-neutral change) so the test can import it.
- `v8-migrate-skills.parseFrontmatter(crlf)` deep-equals the LF twin (`raw` `\r`-free; `end`
  equals the LF `end`).
- `strip-unenforced-budgets.stripFromFrontmatter(crlf)` removes the budget lines and
  produces a result whose `changed` flag and stripped frontmatter match the LF twin's.

## Execution Plan

### Step 8: TEST
Write `tests/w07-crlf-scripts.test.js` FIRST (TDD — fails until migrated), asserting BEHAVIOR:
- [ ] Write a test: `v8-migrate-skills.parseFrontmatter(crlf)` `deepStrictEqual` LF twin.
- [ ] Write a test: `strip-unenforced-budgets.stripFromFrontmatter(crlf)` matches the LF
  twin's `changed` + stripped output.

### Step 9: PREPARE
- [ ] Confirm s1 `src/lib/frontmatter.js` exists (this slice `depends_on` s1).
- [ ] Confirm the `../lib/frontmatter` require path from `src/scripts/`.
- [ ] Add `module.exports` for the pure functions under test if not already exported.

### Step 10: IMPLEMENT
- [ ] `src/scripts/v8-migrate-skills.js` — import helper; delegate `parseFrontmatter()`;
  make `:123` replace CRLF-safe via `FRONTMATTER_BLOCK`.
- [ ] `src/scripts/strip-unenforced-budgets.js` — import helper; rewrite
  `stripFromFrontmatter()` (line-1 + CRLF-safe fallback; `\r`-free `fmBody`).

### Step 11: REVIEW
- [ ] Verify LF behavior byte-identical (the migration/strip scripts produce the same output
  on LF input as before).
- [ ] Verify the added exports do not change the scripts' CLI entry behavior.

### Step 12: OPTIMIZE
- [ ] Confirm no leftover `/^---\n/` in either script; single helper call per parse.

### Step 13: SECURE
- [ ] These scripts write files — confirm no change to their write targets or path handling;
  the fix is parse-only.

### Step 14: VERIFY
- [ ] Run `node --test tests/w07-crlf-scripts.test.js` — all pass.
- [ ] Run the full suite `node --test tests/*.test.js` — `# fail 0`, 0 skipped.

### Step 15: DOCUMENT
- [ ] Note CRLF-safety via the shared helper in each script's touched function (finding H1).

### Step 16: FINAL-REVIEW
- [ ] Grep sweep fully closed — no `/^---\n/` frontmatter parser remains outside the
  siblings' explicit boundaries; no gate crossed (Gate 2 is human).


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
