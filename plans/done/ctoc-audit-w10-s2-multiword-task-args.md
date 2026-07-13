---
approved_by: human
approved_at: 2026-07-13T20:53:25.008Z
gate_crossed: review → done
---

---
iron_loop: true
approved_by: human
approved_at: 2026-07-13T19:14:43.693Z
gate_crossed: implementation → todo
---

---
title: "W10-s2 — Multi-word task args survive intact (M6)"
type: feature
parent_plan: "ctoc-audit-w10-menu-taskplane"
depends_on: none
files:
  - src/commands/menu.js
  - tests/w10-task-arg-splitting.test.js
priority: MEDIUM
---

# W10-s2 — Multi-word task args survive intact (M6)

**Parent:** `ctoc-audit-w10-menu-taskplane`. This is slice **(c)** — stop the CLI arg
pipeline from re-splitting already-tokenized argv. Independent (no `depends_on`).

Fixes finding **M6**: `src/commands/menu.js:539` —
`const splitArgs = cliArgs.flatMap(arg => arg.split(/\s+/));` — re-splits every
already-shell-tokenized argv element on whitespace. For
`node menu.js task complete t1 --summary "two words"`, the shell delivers
`cliArgs = ["task","complete","t1","--summary","two words"]` (5 elements; `"two words"`
is already one token). The `flatMap` explodes `"two words"` into `["two","words"]`, so
`route()` receives 6 tokens. `parseTaskArgs` (`menu-screens.js:1410`) then does
`case '--summary': out.summary = String(args[++i] …)` — it consumes only the next single
token, `"two"`, and `"words"` becomes a stray unconsumed positional. The identical
`case '--next'` branch (`menu-screens.js:1411`) is hit the same way. The corruption is
process-level, upstream of `parseTaskArgs`; `parseTaskArgs` itself is correct.

## Implementation Details

### Architecture Decision (ADR)

**Context.** The `flatMap(arg => arg.split(/\s+/))` exists to support the single-string
convenience form (`node menu.js "browse functional"` → `["browse","functional"]`) used
by some callers that pass one combined argument. But when the shell has already
tokenized argv into multiple elements — the normal case for
`menu task complete t1 --summary "two words"` — re-splitting corrupts any element that
legitimately contains a space.

**Decision.** Split ONLY when it is unambiguously the single-combined-string form:
`cliArgs.length === 1` → split that one element on whitespace; otherwise pass `cliArgs`
through **untouched** (the shell already tokenized it). This preserves both call shapes:
`["browse functional"]` (1 element) → `["browse","functional"]`; and
`["task","complete","t1","--summary","two words"]` (5 elements) → unchanged, so
`"two words"` stays one token and `parseTaskArgs` stores it whole.

**Rejected alternative.** A quoting/escaping scheme inside `route()` — unnecessary; the
shell already did the tokenizing, the bug is that we undid it. The length-1 rule is the
minimal correct fix and keeps the convenience form working.

### Dependency Graph (this slice)
```
src/commands/menu.js  (MODIFY main()'s cliArgs split at :539)
  └─ feeds → src/lib/menu-screens.js route()/parseTaskArgs  (UNCHANGED — already correct)
  └─ behavior-tested-by → tests/w10-task-arg-splitting.test.js (NEW)
```
No cycles. No dependency on other W10 slices. `menu-screens.js:parseTaskArgs` is **not**
edited (the parent confirms it is correct); this slice fixes only the upstream split.

### File Specifications

#### `src/commands/menu.js` — MODIFY
- At `menu.js:539`, replace:
  ```
  const splitArgs = cliArgs.flatMap(arg => arg.split(/\s+/));
  ```
  with a length-aware split (extract to a tiny named helper for testability):
  ```
  const splitArgs = splitCliArgs(cliArgs);
  ```
  and add the exported helper near the other top-level helpers:
  ```
  /**
   * Tokenize CLI args WITHOUT corrupting already-tokenized argv. Only the
   * single-combined-string convenience form (one element) is split on whitespace;
   * a shell-tokenized multi-element argv is passed through untouched so a quoted
   * value like `--summary "two words"` survives as one token.
   * @param {string[]} cliArgs
   * @returns {string[]}
   */
  function splitCliArgs(cliArgs) {
    if (!Array.isArray(cliArgs)) return [];
    if (cliArgs.length === 1) return String(cliArgs[0]).split(/\s+/).filter(Boolean);
    return cliArgs;
  }
  ```
- Add `splitCliArgs` to `menu.js`'s `module.exports` (it exports `handleKey`, `render`,
  etc. already at `menu.js:590+`) so the test can unit-test the tokenizer directly.
- Do NOT touch `menu-screens.js` in this slice.

### Test Plan

#### `tests/w10-task-arg-splitting.test.js` — CREATE (`node:test`)
Every case is RED before this slice (the current `flatMap` splits `"two words"`) and
GREEN after. Two layers: a direct unit test of `splitCliArgs`, and an end-to-end
round-trip through `route` + the task registry proving the stored value is intact.

1. **`splitCliArgs` preserves a multi-word quoted token.**
   `splitCliArgs(["task","complete","t1","--summary","two words here"])` deep-equals the
   input (5 elements; `"two words here"` unchanged).
2. **`splitCliArgs` still splits the single-combined-string form.**
   `splitCliArgs(["browse functional"])` → `["browse","functional"]`.
3. **Round-trip `--summary` persists in full (scenario 9).** Seed a temp project with a
   registry holding a `running` task `t1`. Route the tokenized args through
   `menu-screens.route(splitCliArgs(["task","complete","t1","--summary","two words here"])
   .unshift?…)` — concretely: call `route(["menu","task","complete","t1","--summary",
   "two words here"], root)` and re-read the registry; assert the stored `result.summary`
   is exactly `"two words here"` (3 words, not `"two"`).
4. **Round-trip `--next` persists in full (scenario 10).** Same, with
   `--next "do the next thing"`; assert stored `nextAction === "do the next thing"`
   (4 words, not `"do"`).
5. **Regression: a value with a stray unconsumed word no longer appears as a
   positional.** After case 3, assert the completed task has no spurious extra positional
   artifact (the old bug left `"words"`/`"here"` as stray tokens).

*(Cases 3–5 import `route` from `../src/lib/menu-screens` and `splitCliArgs` from
`../src/commands/menu`, feeding the tokenizer output into `route` exactly as `main()`
does — so the test exercises the real production path end-to-end.)*

### Security Review
- [x] **No injection surface added:** `splitCliArgs` only splits/returns strings; it
      never evaluates or shells out.
- [x] **Prototype-pollution:** returns a plain array of strings; no object merge, no
      `__proto__` handling; downstream `buildAddSpec`/`parseTaskArgs` already populate
      named fields only (`menu-screens.js:1427`).
- [x] **Control-char safety:** unchanged — the render layer's existing `stripCtl`
      guards still apply to any stored value at display time.
- [x] **Fail-safe:** non-array input → `[]` (route falls through to the dashboard), never
      a throw.

## Execution Plan

### Step 8: TEST
Write `tests/w10-task-arg-splitting.test.js` FIRST (TDD red), asserting BEHAVIOR — "a
`--summary "two words here"` round-trips byte-for-byte through `route` and back out of
the registry", NOT "the split function returns an array". Cases 1–5 above. Run
`node --test tests/w10-task-arg-splitting.test.js` and confirm the multi-word cases are
RED against the current `flatMap` (summary comes back `"two"`).

### Step 9: PREPARE
Re-read `src/commands/menu.js:527-543` (`main()` + the `cliArgs.flatMap` line) and
`src/lib/menu-screens.js:1399-1418` (`parseTaskArgs`) + `1516-1550` (`taskComplete`) to
confirm the stored field names (`result.summary`, `nextAction`) the round-trip asserts.
Confirm `route` and the task-registry helpers are importable without side effects. No new
deps.

### Step 10: IMPLEMENT
ONE step, ordered sub-items:
(a) Add the `splitCliArgs` helper to `src/commands/menu.js` and export it.
(b) Replace the `cliArgs.flatMap(arg => arg.split(/\s+/))` at `:539` with
`splitCliArgs(cliArgs)`.
(c) Run `node --test tests/w10-task-arg-splitting.test.js` → green.

### Step 11: REVIEW
Self-review: the convenience single-string form still splits; multi-element argv is
untouched; `parseTaskArgs`/`menu-screens.js` were NOT modified; the only production line
changed is the split at `:539` plus the new helper.

### Step 12: OPTIMIZE
Confirm the tokenizer is O(1) branch + at most one `.split` on a single element; no
per-element regex on the common multi-element path (it returns the array as-is).

### Step 13: SECURE
Run the Security Review checklist. Confirm no new shell-out, no object spread of parsed
values.

### Step 14: VERIFY
`node --test tests/w10-task-arg-splitting.test.js` → `# fail 0`; then the FULL suite
`node --test tests/*.test.js` → `# fail 0`, 0 skipped (catches any test that relied on
the old blanket `flatMap` behavior — e.g. one passing a single `"a b c"` string and
expecting 3 tokens: still works via the length-1 branch; or one passing pre-tokenized
args and NOT expecting a re-split: now correct).

### Step 15: DOCUMENT
Add/adjust the comment at `menu.js:537-539` to explain the length-aware split (the shell
already tokenizes multi-element argv; only the single combined string is split), citing
M6 so the rationale is not re-lost.

### Step 16: FINAL-REVIEW
Confirm: this slice edits only its two declared files;
`menu task complete t1 --summary "two words here"` stores the 3-word summary intact and
`--next "do the next thing"` stores the 4-word value intact; the single-string
convenience form still works; suite green, 0 skipped.

## Risk Mitigations

| Risk | Mitigation | Where |
|------|-----------|-------|
| A caller relied on the old blanket re-split of multi-element args | The shell already tokenizes multi-element argv; the only legitimate split case (1 combined string) is preserved; full-suite VERIFY surfaces any dependent test | Step 14 |
| Empty/garbage cliArgs | `splitCliArgs` returns `[]` for non-array; `route([])` → dashboard (existing safe default) | Step 10 |
| s4 later also edits `main()`'s arg handling | s4 declares `depends_on: this slice` and builds on `splitCliArgs`, never reverting it | s4 frontmatter |


---

## Execution Plan (Steps 8-16)

### Step 8: TEST (TDD Red)
- [x] Write tests for the implementation
- [x] Test error conditions
- [x] Run tests - expect RED (failing)

### Step 9: PREPARE
- [x] Install dependencies if needed
- [x] Check prerequisites
- [x] Verify dev environment ready
- [x] Create directories/config if needed

### Step 10: IMPLEMENT
- [x] Implement the feature according to requirements
- [x] Add error handling
- [x] Wire up integration points

### Step 11: REVIEW
- [x] Self-review all new code
- [x] Verify integration points work together
- [x] Check error handling completeness

### Step 12: OPTIMIZE
- [x] Remove redundant operations
- [x] Optimize critical paths
- [x] Simplify complex code

### Step 13: SECURE
- [x] Validate inputs (no path traversal)
- [x] Sanitize outputs
- [x] No secrets in code
- [x] Safe file operations

### Step 14: VERIFY
- [x] Run lint + type check
- [x] Run ALL tests (TDD Green)
- [x] Check coverage >= 80%
- [x] 0 skipped, 0 flaky tests

### Step 15: DOCUMENT
- [x] Update relevant documentation
- [x] Add JSDoc comments to new functions
- [x] Update CHANGELOG if needed

### Step 16: FINAL-REVIEW
- [x] Verify steps 8-15 completed correctly
- [x] All quality checks passed
- [x] Manual verification if needed
- [x] Ready for human review
