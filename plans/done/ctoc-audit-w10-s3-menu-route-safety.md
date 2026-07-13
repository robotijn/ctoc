---
approved_by: human
approved_at: 2026-07-13T18:37:06.102Z
gate_crossed: review → done
---

---
iron_loop: true
approved_by: human
approved_at: 2026-07-13T16:17:11.778Z
gate_crossed: implementation → todo
---

---
title: "W10-s3 — Menu route is crash-safe and traversal-guarded (M8 + M11)"
type: feature
parent_plan: "ctoc-audit-w10-menu-taskplane"
depends_on: none
files:
  - src/lib/menu-screens.js
  - tests/w10-menu-route-safety.test.js
priority: MEDIUM
---

# W10-s3 — Menu route is crash-safe and traversal-guarded (M8 + M11)

**Parent:** `ctoc-audit-w10-menu-taskplane`. This is slice **(d)** — make the plan-action
screens return the JSON error contract instead of crashing, and apply the existing
traversal guard the validate screen already uses. Independent (no `depends_on`).

Two findings, one cohesive fix in one file (both are "an untrusted plan reference reaches
`path.join` unguarded in a plan-action function"):

- **M8 (unknown-stage crash).** `route()`'s `case 'plan':` (`menu-screens.js:1662-1684`)
  does no stage validation before `planActions(stage, file, projectPath)`. Inside
  `planActions`, `menu-screens.js:1069` — `const folder = STAGE_FOLDERS[stage];` — is
  `undefined` for an unknown stage (e.g. `"bogus"`), and `menu-screens.js:1070` —
  `path.join(plansDir, folder, file)` — throws `TypeError: Path must be a string.
  Received undefined`. Nothing wraps it, so `node menu.js "plan bogus/x.md"` prints a raw
  Node stack trace and exits non-zero — not the JSON `{text, ask, actions}` contract.
- **M11 (traversal gap).** `isUnsafePlanFile(file)` (`menu-screens.js:80-89`) is applied
  by `validateScreen` (`menu-screens.js:1280`) before any `path.join`, but **not** by
  `planActions` (`:1070`) or `reviewActions` (`:1184`). A `file` like `"../../etc/passwd"`
  reaches `path.join` unchecked in both. `reviewActions` is independently reachable via
  `route()`'s `case 'plan':` when `args[2] === 'review'` (`menu-screens.js:1677`), so
  these are two independently reachable gaps.

`planActionsMore` (`menu-screens.js:1129-1134`) has the IDENTICAL unguarded
`path.join(plansDir, folder, file)` at `:1133`, reachable via `plan …/… more`
(`route:1675`). It is the same latent crash/traversal and is fixed in the same sweep
(warnings-are-bugs: do not leave a known-identical gap).

## Implementation Details

### Architecture Decision (ADR)

**Context.** `validateScreen` already contains the correct guard and the canonical
refusal screen (`menu-screens.js:1280-1286`): when `!folder || isUnsafePlanFile(file)`,
it returns a `{text, ask, actions}` JSON error with the message "Refusing a reference
that escapes the plans/ directory." The other three plan-reference functions
(`planActions`, `planActionsMore`, `reviewActions`) lack it.

**Decision.** Extract the existing inline refusal into ONE private helper
`invalidPlanRefScreen(stage, file)` and call the SAME `!folder || isUnsafePlanFile(file)`
guard at the top of `planActions`, `planActionsMore`, and `reviewActions` — and have
`validateScreen` call the same helper. This fixes M8 (unknown stage → `folder`
`undefined` → guard returns JSON instead of crashing) AND M11 (traversal `file` → guard
returns JSON, no `path.join`, no read) with one reused guard, and guarantees the refusal
message is **byte-identical** across all four sites (acceptance scenario 12 requires "the
same refusal message `validateScreen` produces").

**Why guard the action functions, not `route()`.** The crash/traversal happens INSIDE the
action functions at their own `path.join`. Guarding each function fixes every reachable
path (direct call, `route`, and any future caller) at the true source, and keeps the
refusal message co-located with the read it protects. A blanket `try/catch` in `route()`
is explicitly rejected — it would mask unrelated real bugs behind a generic error; the
targeted guard fails safe only for the known invalid-reference case.

### Dependency Graph (this slice)
```
isUnsafePlanFile (menu-screens.js:80)  ── already exists, reused
invalidPlanRefScreen (NEW private helper, refactored out of validateScreen's inline object)
  └─ called-by → planActions (:1066)      [+ guard]
  └─ called-by → planActionsMore (:1129)  [+ guard]
  └─ called-by → reviewActions (:1180)    [+ guard]
  └─ called-by → validateScreen (:1272)   [refactor inline → helper call]
  └─ behavior-tested-by → tests/w10-menu-route-safety.test.js (NEW)
```
No cycles. No dependency on other W10 slices. (s4 also edits `menu-screens.js` and
declares `depends_on: this slice`, so the two never edit it concurrently.)

### File Specifications

#### `src/lib/menu-screens.js` — MODIFY
1. **Add a private helper** near `isUnsafePlanFile` (after `:89`), extracting the exact
   object `validateScreen` returns today (`:1281-1285`):
   ```
   /**
    * The canonical "invalid plan reference" JSON screen — an unknown stage (no
    * STAGE_FOLDERS entry) or a traversal filename (isUnsafePlanFile). Every plan-ref
    * screen returns THIS shape rather than throwing, so the menu's JSON contract holds
    * for adversarial input (M8/M11). Message is identical across all call sites.
    */
   function invalidPlanRefScreen(stage, file) {
     return {
       text: `Invalid plan reference: ${stage}/${file}\n${'─'.repeat(40)}\n\n  Refusing a reference that escapes the plans/ directory.\n\n\n`,
       ask: { questions: [{ question: 'Invalid reference.', header: 'Error', options: [{ label: '◀ Back', description: 'Return to dashboard' }] }] },
       actions: { '◀ Back': '' },
     };
   }
   ```
2. **`planActions` (`:1066`)** — after `const folder = STAGE_FOLDERS[stage];` (`:1069`),
   BEFORE the `path.join` at `:1070`, insert:
   `if (!folder || isUnsafePlanFile(file)) return invalidPlanRefScreen(stage, file);`
   (Placed after the `stage === 'review'` redirect at `:1074`? No — place it FIRST, at
   the very top after `folder` is computed, so an unknown stage never reaches the review
   redirect or the `path.join`.)
3. **`planActionsMore` (`:1129`)** — same guard immediately after
   `const folder = STAGE_FOLDERS[stage];` (`:1132`), before `path.join` (`:1133`).
4. **`reviewActions` (`:1180`)** — note it uses `STAGE_FOLDERS[stage] || 'review'`
   (`:1183`), so `folder` is never falsy here; the guard must still reject a **traversal
   file**: insert `if (isUnsafePlanFile(file)) return invalidPlanRefScreen(stage, file);`
   before `path.join` (`:1184`). (Unknown-stage for review defaults to the `review`
   folder, which is intended; the traversal check is the load-bearing part here.)
5. **`validateScreen` (`:1272`)** — replace its inline refusal object (`:1281-1285`) with
   `return invalidPlanRefScreen(stage, file);`, keeping the same `if (!folder ||
   isUnsafePlanFile(file))` condition (`:1280`). Behavior-preserving refactor (proves the
   message is shared, not copy-pasted).
6. Do NOT add a `try/catch` in `route()`. Do NOT change `STAGE_FOLDERS`, `NEXT_STAGE`, or
   any screen's happy-path output.

### Test Plan

#### `tests/w10-menu-route-safety.test.js` — CREATE (`node:test`)
Imports `route` (and optionally `planActions`/`reviewActions`) from
`../src/lib/menu-screens`. Every case is RED before this slice (unknown stage throws;
traversal reaches `path.join`) and GREEN after. Assertions capture the returned object and
assert the `{text, ask, actions}` shape — and, for the crash cases, assert `route()` does
**not throw**.

1. **Unknown stage returns the JSON contract, does not throw (scenario 11).**
   `route(["plan","bogus/x.md"], root)` returns an object with string `text`, an `ask`
   with `questions`, and an `actions` map — and the call does NOT throw. Assert `text`
   contains "Invalid plan reference".
2. **Traversal rejected in `planActions` (scenario 12).**
   `route(["plan","functional/../../../etc/passwd"], root)` → returns
   `invalidPlanRefScreen`'s shape; assert no file read occurred (the returned `text`
   contains the refusal message and NOT any file content). *(Note: the `ref.indexOf('/')`
   split in `route` makes `stage="functional"`, `file="../../../etc/passwd"` → the guard
   in `planActions` fires on `isUnsafePlanFile(file)`.)*
3. **Traversal rejected in `reviewActions` (scenario 13).**
   `route(["plan","review/../../../etc/passwd","review"], root)` → same refusal shape;
   no read.
4. **Traversal rejected in `planActionsMore`.**
   `route(["plan","functional/../../../etc/passwd","more"], root)` → refusal shape; no
   read (closes the known-identical latent gap).
5. **Refusal message parity with `validateScreen` (scenario 12 "same refusal message").**
   The `text` from case 2 equals the `text` `validateScreen` produces for the same bad
   ref (`route(["validate","functional/../../../etc/passwd"], root)`), proving they share
   `invalidPlanRefScreen`.
6. **No-raw-crash regression sweep (parent Test Strategy).** Parametrized: for each of a
   set of adversarial refs — unknown stage `"bogus/x.md"`, traversal
   `"functional/../../etc/passwd"`, backslash traversal
   `"functional/..\\..\\etc\\passwd"`, empty file `"functional/"`, NUL byte
   `"functional/x .md"` — assert `route(["plan", ref], root)` returns
   `{text, ask, actions}` (all three present) and NEVER throws. A `t.assert` inside a
   try/catch fails loudly if any ref throws past `route`.
7. **Happy path unchanged (regression guard).** A valid ref
   `route(["plan","functional/some-real-plan.md"], root)` (seed the file) still returns
   the normal plan-actions screen (title present, four verbs) — the guard does not reject
   legitimate references.

### Security Review
- [ ] **Path traversal (the core fix):** every plan-reference function calls
      `isUnsafePlanFile(file)` before `path.join`; a `..`, absolute path, separator, or
      NUL byte is refused before any filesystem access (scenarios 12/13, cases 2–4, 6).
- [ ] **Cross-platform traversal:** `isUnsafePlanFile` already rejects both `/` and `\\`
      separators and `..` segments (`menu-screens.js:83-87`); case 6 includes a
      backslash-traversal to prove Windows-style attempts are refused too.
- [ ] **No information leak:** the refusal `text` echoes only the (rejected) `stage/file`
      the user supplied — never file contents, never an absolute resolved path.
- [ ] **Fail-safe contract:** unknown/adversarial input yields a valid JSON screen with a
      `◀ Back` action, never a stack trace to stderr (scenario 11).
- [ ] **No masking:** no blanket `try/catch` in `route()` — only the specific
      invalid-reference case fails safe; genuine bugs still surface.

## Execution Plan

### Step 8: TEST
Write `tests/w10-menu-route-safety.test.js` FIRST (TDD red), asserting BEHAVIOR — "an
unknown stage yields the JSON contract and does NOT throw" and "a `../../etc/passwd`
reference is refused with no file read", NOT "the function returned an object". Cases 1–7
above. Run `node --test tests/w10-menu-route-safety.test.js` and confirm the unknown-stage
and traversal cases are RED against current `main` (they throw / reach `path.join`).

### Step 9: PREPARE
Re-read `src/lib/menu-screens.js:80-89` (`isUnsafePlanFile`), `:1066-1074` (`planActions`
head), `:1129-1134` (`planActionsMore` head), `:1180-1185` (`reviewActions` head),
`:1272-1287` (`validateScreen` guard), and `:1662-1701` (`route`'s `plan`/`validate`
cases) to confirm exact insertion points and the `ref.indexOf('/')` split behavior. No
new deps.

### Step 10: IMPLEMENT
ONE step, ordered sub-items:
(a) Add the `invalidPlanRefScreen(stage, file)` helper after `isUnsafePlanFile`.
(b) Insert the `!folder || isUnsafePlanFile(file)` guard at the top of `planActions` and
`planActionsMore`; insert the `isUnsafePlanFile(file)` guard in `reviewActions`.
(c) Refactor `validateScreen`'s inline refusal (`:1281-1285`) to
`return invalidPlanRefScreen(stage, file);`.
(d) Run `node --test tests/w10-menu-route-safety.test.js` → green.

### Step 11: REVIEW
Self-review: all four plan-ref functions guard before `path.join`; the refusal object is
defined once and reused (message parity); happy paths are byte-unchanged; no `try/catch`
added to `route()`; `STAGE_FOLDERS`/`NEXT_STAGE` untouched.

### Step 12: OPTIMIZE
Confirm the guard is a single boolean check per call (no redundant `path.join` before the
guard). No duplicated refusal literal remains (grep for the "escapes the plans/" string →
exactly one occurrence, in `invalidPlanRefScreen`).

### Step 13: SECURE
Run the Security Review checklist. Grep the four functions to confirm each calls
`isUnsafePlanFile` before its `path.join`. Confirm the backslash- and NUL-traversal cases
(case 6) are refused.

### Step 14: VERIFY
`node --test tests/w10-menu-route-safety.test.js` → `# fail 0`; then the FULL suite
`node --test tests/*.test.js` → `# fail 0`, 0 skipped (catches any existing test asserting
the old inline refusal object shape in `validateScreen` — it is behavior-identical, so it
stays green; if one asserted an exact object identity, reconcile it to the shared helper).
Run `node src/commands/menu.js "plan bogus/x.md"` and confirm stdout is JSON and stderr
has NO stack trace.

### Step 15: DOCUMENT
Add a one-line comment on `invalidPlanRefScreen` (already in the spec) and a note at each
guard site citing M8/M11 so the rationale (unknown stage → `folder` undefined → crash;
traversal → unguarded `path.join`) is not re-lost.

### Step 16: FINAL-REVIEW
Confirm: this slice edits only its two declared files; `node menu.js "plan bogus/x.md"`
returns `{text, ask, actions}` with no stderr trace; traversal is refused in
`planActions`, `planActionsMore`, and `reviewActions` with the same message
`validateScreen` produces; the adversarial sweep never throws past `route()`; happy paths
unchanged; suite green, 0 skipped.

## Risk Mitigations

| Risk | Mitigation | Where |
|------|-----------|-------|
| A test asserted `validateScreen`'s exact inline object | Refactor is behavior-identical (same fields/message); full-suite VERIFY surfaces any identity assertion to reconcile | Step 14 |
| Guarding `planActions` breaks the `stage === 'review'` redirect | Guard is placed FIRST (after `folder` is computed); an unknown stage never reaches the redirect, a valid `review` stage has a real `folder` and passes the guard | Step 10(b) |
| A latent identical gap left in `planActionsMore` | Included in the same guard sweep + its own test case (4) | Step 8/10 |
| s4 also edits `menu-screens.js` | s4 declares `depends_on: this slice`; sequential build, no concurrent edit | s4 frontmatter |


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
