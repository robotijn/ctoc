---
approved_by: human
approved_at: 2026-07-13T20:53:24.914Z
gate_crossed: review → done
---

---
iron_loop: true
approved_by: human
approved_at: 2026-07-13T19:14:43.627Z
gate_crossed: implementation → todo
---

---
title: "W08-s2 — Project detector walks up to find .ctoc/ so a subdirectory keeps enforcement on"
type: feature
parent_plan: "ctoc-audit-w08-enforcement-honest"
depends_on: none
files:
  - src/lib/ctoc-project-detector.js
  - tests/ctoc-project-detector-upward-walk.test.js
priority: MEDIUM
created: "2026-07-13T00:00:00Z"
---

# W08-s2 — Project detector walks up to find .ctoc/ so a subdirectory keeps enforcement on

Fixes **Defect 2 (audit finding H5)** of the parent
[`ctoc-audit-w08-enforcement-honest`](./ctoc-audit-w08-enforcement-honest.md).
Ancestry read before authoring: vision
`plans/done/ctoc-self-audit-remediation.md` → parent implementation plan (ASSESS
/ ALIGN / CAPTURE) → this slice.

**One-line scope:** give `isCtocProject(root)` an upward directory walk so a
CTOC project is recognized from any nested `cwd` (`src/lib/`, `plans/`, …) — not
only at the exact project root — closing the silent "subdirectory disables
enforcement" hole, while leaving root-level behavior byte-identical.

> **Independent of the other three W08 fixes.** `depends_on: none`. Unit-testable
> today with temp-directory fixtures; no W01 and no sibling slice required.

## Implementation Details

### Architecture Decision — where the walk stops (avoid over-walking)

The naive fix ("loop up until a directory looks like CTOC") risks **over-walking
past the real project root** when that root has `.ctoc/` + `CLAUDE.md` but the
`CLAUDE.md` lacks the CTOC marker — the walk would keep climbing and could
false-match a grand-parent project. The parent Test Strategy explicitly warns
against trading the subdirectory bug for an over-widened walk.

**Decision:** the walk stops at the **first ancestor that physically has BOTH
`.ctoc/` and `CLAUDE.md`** — that directory *is* the project boundary — and
returns that directory's `{ isCtoc, isCtocRepo }` **even if `isCtoc` is false**
(unmarked `CLAUDE.md`). Presence of the two marker files, not the marker's
content, defines the boundary; the marker/`isCtocRepo` content then classifies
that boundary. This makes the walk stop exactly at the project root and never
climb past it. Termination is guaranteed by `path.dirname(x) === x` at the
filesystem root.

### Dependency Graph

```
tests/ctoc-project-detector-upward-walk.test.js
   --require--> src/lib/ctoc-project-detector.js   (export UNCHANGED: isCtocProject)
src/lib/ctoc-project-detector.js
   --require--> src/lib/safe-fs.js                  (UNCHANGED)
   --require--> path                                 (node core)
```

No new module, no new export, no cycle. The public signature
`isCtocProject(root) → { isCtoc, isCtocRepo }` is preserved, so **no caller
changes** (`PreToolUse.Edit.js:188`, and s3's SessionStart reuse, keep working
unchanged).

### File Specifications

#### File: `src/lib/ctoc-project-detector.js` — MODIFY

Refactor the single-directory check into a helper, then wrap it in an upward
walk. Detection semantics at any one directory are otherwise **unchanged** from
today.

- `detectAt(dir: string)` → `{ present: boolean, isCtoc: boolean, isCtocRepo: boolean }`
  - `present` = both `path.join(dir,'.ctoc')` and `path.join(dir,'CLAUDE.md')`
    exist (via `safeFs.existsSync`).
  - When `present`: read `CLAUDE.md`; `isCtoc = CTOC_MARKER_RE.test(md) ||
    CTOC_PROGRAM_RE.test(md)`; read `package.json` (guarded `JSON.parse`), set
    `isCtocRepo = (pkg.name === 'ctoc')`. This is the **exact** logic that lives
    in `isCtocProject` today, moved verbatim.
  - When not `present`: return `{ present:false, isCtoc:false, isCtocRepo:false }`.
  - Whole body in `try/catch` → fail open (`present:false`) on any I/O error, same
    as today.
- `isCtocProject(root: string)` → `{ isCtoc: boolean, isCtocRepo: boolean }`
  - `let current = path.resolve(root)` (guarded; on throw return
    `{isCtoc:false,isCtocRepo:false}`).
  - Loop: `const at = detectAt(current)`; if `at.present` return
    `{ isCtoc: at.isCtoc, isCtocRepo: at.isCtocRepo }`. Else `const parent =
    path.dirname(current)`; if `parent === current` break; `current = parent`.
  - Fall-through return `{ isCtoc:false, isCtocRepo:false }`.
  - Optional belt-and-braces: cap iterations at 64 (defense against a pathological
    path); `path.dirname` cannot loop, so the cap is a safety net only.
- `module.exports` unchanged (`{ isCtocProject }`); `detectAt` stays private.
- `CTOC_MARKER_RE` / `CTOC_PROGRAM_RE` constants unchanged.

#### File: `tests/ctoc-project-detector-upward-walk.test.js` — CREATE

`node:test`. Builds real temp-dir fixtures with `fs.mkdtempSync(path.join(
os.tmpdir(), 'w08s2-'))`, writes `.ctoc/` (a dir), `CLAUDE.md`, and
`package.json` at chosen levels, and removes each fixture in `after()`
(`fs.rmSync(dir, { recursive:true, force:true })`). Cross-platform: all paths via
`path.join`, temp root via `os.tmpdir()`.

### Test Plan

`tests/ctoc-project-detector-upward-walk.test.js`

1. **Nested cwd, consumer project (Defect 2 core).** Fixture: `root/` has `.ctoc/`
   + a CTOC-marked `CLAUDE.md` + `package.json` (`name:"some-app"`); `root/src/lib/`
   exists and is bare. Assert `isCtocProject(root/src/lib)` deep-equals
   `isCtocProject(root)` and equals `{ isCtoc:true, isCtocRepo:false }`.
2. **Deeply nested cwd (≥3 levels).** `root/a/b/c` bare. Assert
   `isCtocProject(root/a/b/c)` → `{ isCtoc:true, isCtocRepo:false }`.
3. **Nested cwd inside the ctoc repo.** Fixture `root/` marked, `package.json`
   `name:"ctoc"`. Assert `isCtocProject(root/src/lib)` → `{ isCtoc:true,
   isCtocRepo:true }` — identical to running at `root`.
4. **Root-level detection unchanged (regression guard).** Assert
   `isCtocProject(root)` returns exactly the pre-fix result for both a marked
   consumer fixture (`{true,false}`) and a marked ctoc fixture (`{true,false→true}`).
5. **No over-walk past an unmarked boundary.** Fixture: `outer/` is itself marked
   CTOC; nested `outer/inner/` has `.ctoc/` + an **unmarked** `CLAUDE.md` (no
   marker, no `program: ctoc-`) + no `ctoc` package. Assert
   `isCtocProject(outer/inner/sub)` → `{ isCtoc:false, isCtocRepo:false }` (stops
   at `inner`, does NOT climb to `outer`). Guards the parent's "over-widened walk"
   risk.
6. **No CTOC ancestor anywhere.** Fixture: a bare temp dir with no `.ctoc/` at any
   level up to `os.tmpdir()`. Assert `isCtocProject(bareDir)` → `{ isCtoc:false,
   isCtocRepo:false }` and that the call terminates (does not hang / throw).
7. **Fail-open on unreadable state.** Fixture: `root/CLAUDE.md` present but
   `.ctoc` absent. Assert `{ isCtoc:false, isCtocRepo:false }` (unchanged
   both-required rule).
8. **Marked boundary with non-ctoc package still detects isCtoc.** From a nested
   dir, `{ isCtoc:true, isCtocRepo:false }` (separates the two flags).

Coverage ≥ 80%; branches covered: present/absent, marker present/absent,
package ctoc/other/missing/malformed, root-reached termination.

### Security Review

- [x] **Read-only, bounded walk:** the walk only `existsSync`/`readFileSync`s
  `.ctoc`, `CLAUDE.md`, `package.json` in ancestor dirs (never writes), terminates
  at the filesystem root, and is optionally capped at 64 hops.
- [x] **No traversal beyond fs root:** `path.dirname` monotonically ascends and
  fixes at the root; no user string is concatenated into a path (all `path.join`).
- [x] **Guarded `JSON.parse`** of ancestor `package.json` (try/catch → ignore),
  as today; malformed JSON never throws.
- [x] **Fail-open preserved:** any I/O error degrades to "not a CTOC project,"
  matching the module's existing contract; enforcement never crashes on a bad FS.
- [x] **No new external input, regex, or dynamic require.**

## Execution Plan

### Step 8: TEST
Write `tests/ctoc-project-detector-upward-walk.test.js` FIRST (TDD-red). Confirm
RED against current code — cases 1, 2, 3, 8 fail today because `isCtocProject`
only inspects the exact `root` and returns `{false,false}` from any subdirectory.

### Step 9: PREPARE
No new deps. Confirm `os`, `fs`, `path` (core) available for fixtures. Confirm
`safeFs.existsSync`/`readFileSync` semantics unchanged.

### Step 10: IMPLEMENT
One step, file sub-items:
- **`src/lib/ctoc-project-detector.js`**
  - Extract `detectAt(dir)` (verbatim single-dir logic + `present` flag).
  - Rewrite `isCtocProject(root)` as the bounded upward walk that stops at the
    first `present` ancestor and returns its `{ isCtoc, isCtocRepo }`.
  - Keep `module.exports = { isCtocProject }` and the two marker regexes.
- No stubs; the stop-condition decision above is implemented concretely.

### Step 11: REVIEW
Self-review: public signature/behavior at the root is identical; only the search
*origin* is generalized. Confirm no caller needs changing (grep
`isCtocProject(` — `PreToolUse.Edit.js:188` unchanged; s3 reuse unaffected).

### Step 12: OPTIMIZE
Confirm one `detectAt` per level, early return on first boundary, no repeated FS
stats for the same dir. The common case (root itself is CTOC) does exactly one
`detectAt`, matching today's cost.

### Step 13: SECURE
Walk the Security Review checklist; confirm termination, read-only access, guarded
parse, and fail-open.

### Step 14: VERIFY
`node --test tests/ctoc-project-detector-upward-walk.test.js` → green. Full suite
`node --test tests/*.test.js` → `# fail 0`, `0 skipped` (no regression to
`enforcement-hook.test.js` and other detector consumers). Coverage ≥ 80%.

### Step 15: DOCUMENT
Update the module header + `isCtocProject` JSDoc to describe the upward walk and
the "first directory with both markers wins" boundary rule. Note `isCtocRepo` is
resolved at that boundary.

### Step 16: FINAL-REVIEW
Confirm every parent Defect-2 scenario maps to a green test (mapping below);
confirm no over-walk; hand to Gate 3 (CTO Chief). Do NOT self-cross any gate.

## Acceptance Criteria Mapping (parent → this slice)

| Parent scenario | Test case |
|---|---|
| Enforcement stays active from a nested subdirectory | 1, 2, 3 |
| Root-level detection is unchanged | 4 |
| (regression: walk not over-widened) | 5, 6 |

## Decisions Taken Under Ambiguity

- **Stop at the first ancestor that has both `.ctoc/` and `CLAUDE.md`, regardless
  of marker content.** Chosen over "stop at the first *marked* CTOC dir" to avoid
  climbing past an unmarked-but-real project root into a grand-parent CTOC
  project. Presence defines the boundary; marker/package classify it.
- **`isCtocRepo` is resolved at the boundary directory**, not at the original
  `cwd`. Reason: the repo-identity `package.json` lives at the project root; a
  subdirectory has none. This makes s3's reuse of `isCtocProject(projectPath)
  .isCtocRepo` correct whether called from root or (post-walk) a subdirectory —
  though s3 always passes the resolved root and therefore does not depend on this
  slice.
- **64-hop safety cap** added as defense-in-depth only; `path.dirname` cannot
  cycle, so correctness does not rely on it.


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
