---
iron_loop: true
approved_by: human
approved_at: 2026-07-13T19:14:43.650Z
gate_crossed: implementation → todo
---

---
title: "W08-s3 — SessionStart guards on package identity and describes enforcement honestly"
type: feature
parent_plan: "ctoc-audit-w08-enforcement-honest"
depends_on: none
files:
  - src/hooks/SessionStart.js
  - tests/sessionstart-self-repo-and-honest-banner.test.js
priority: MEDIUM
created: "2026-07-13T00:00:00Z"
---

# W08-s3 — SessionStart guards on package identity and describes enforcement honestly

Fixes **Defect 3 (finding H6)** and **Defect 4 (finding L3)** of the parent
[`ctoc-audit-w08-enforcement-honest`](./ctoc-audit-w08-enforcement-honest.md).
Ancestry read before authoring: vision
`plans/done/ctoc-self-audit-remediation.md` → parent implementation plan (ASSESS
/ ALIGN / CAPTURE) → this slice.

**One-line scope:** stop `SessionStart.js` from rewriting CTOC's own
`CLAUDE.md` by guarding on **package identity** (`pkg.name === 'ctoc'`, reusing
the detector's `isCtocRepo`) instead of a location-based `__dirname` compare;
and rewrite the injected banner's false `"cryptographically enforced / no escape
phrases"` claim to describe enforcement honestly.

**Why one slice, not two:** Defect 3 (the self-repo guard) and Defect 4 (the
banner text) **both edit `src/hooks/SessionStart.js`.** Per the parent's
coordination note, the two SessionStart fixes are combined into a single slice so
they cannot collide on the same file; they share one test file and one build.

> **Independent of s1 and s2.** `depends_on: none`. This slice *reuses* the
> detector's existing `isCtocRepo` flag (present in the code today at
> `ctoc-project-detector.js:47`), so it does **not** depend on s2's upward-walk
> change — it always passes the already-resolved project root. Unit-testable today
> without W01.

## Implementation Details

### Architecture Decision — identity by package, not by file location; fail-safe direction

The bug (Defect 3): the guard computes `ctocRoot = path.resolve(__dirname,'..',
'..')` and skips injection only when `projectPath === ctocRoot`. When CTOC runs
as an **installed plugin**, `__dirname` resolves to the *plugin's* location, not
the maintainer's dev repo — so `ctocRoot !== projectPath` even though
`projectPath` **is** the ctoc repo, and the hook injects `+122 lines` into the
maintainer's hand-maintained `CLAUDE.md` (observed live).

**Decision:** identify the ctoc repo by **package identity**, reusing the
`isCtocRepo` (`pkg.name === 'ctoc'`) flag the detector already computes correctly
from the *project's own* `package.json` — the parent explicitly notes SessionStart
should *reuse* this rather than reinvent a location check. A pure, exported
decision function makes it location-independent **and** unit-testable:
`shouldInjectLessons(projectPath) = !detector.isCtocProject(projectPath).isCtocRepo`.

**`__dirname` is retained for its *one legitimate use*** — locating the plugin's
own operating-lessons **template** to pass as `ensureLessonsBlock`'s `ctocRoot`
(source-of-content) argument. That is a correct use of "where the code lives"
(finding the plugin's own asset); the defect was using it for *target-project
identity*. The two uses are now cleanly separated.

**Fail-safe direction:** if identity cannot be determined (e.g. the detector
module cannot be required), `shouldInjectLessons` returns **`false` (do not
inject)** — protecting the maintainer's file is the headline of Defect 3, and this
matches SessionStart's existing "any error → skip injection" behavior
(`:127-129`). Note `isCtocProject` is itself non-throwing (internal fail-open), so
this catch is belt-and-braces.

### Dependency Graph

```
tests/sessionstart-self-repo-and-honest-banner.test.js
   --require--> src/hooks/SessionStart.js  (exports: main, generateContext,
                                             shouldInjectLessons, maybeInjectLessons)
src/hooks/SessionStart.js
   --require--> src/lib/ctoc-project-detector.js  (REUSE existing isCtocRepo; not modified here)
   --require--> src/lib/claude-md-lessons.js       (UNCHANGED: ensureLessonsBlock)
```

No cycle. `ctoc-project-detector.js` is only *read from* here (its export is
unchanged); this slice edits `SessionStart.js` alone — no file overlap with s2.

### File Specifications

#### File: `src/hooks/SessionStart.js` — MODIFY

**Change 1 — package-identity self-repo guard (replaces `:120-129`).**
Add two exported helpers and route `main()` through them:

- `shouldInjectLessons(projectPath: string)` → `boolean`
  - `try { return !require('../lib/ctoc-project-detector').isCtocProject(
    projectPath).isCtocRepo; } catch { return false; }`
  - Location-independent by construction (uses no `__dirname`).
- `maybeInjectLessons(projectPath: string)` → `void`
  - `if (!shouldInjectLessons(projectPath)) return;`
  - `const ctocRoot = path.resolve(__dirname, '..', '..');` — **template source
    only** (locating the plugin's own lessons asset), documented as such.
  - `const { ensureLessonsBlock } = require('../lib/claude-md-lessons');`
  - `ensureLessonsBlock(path.join(projectPath, 'CLAUDE.md'), ctocRoot);`
  - Whole body already sits inside `main()`'s existing `try/catch` (retain the
    `console.error('[CTOC] Lessons block injection skipped:', …)` on failure).
- In `main()`, replace the current `:120-129` block with a call to
  `maybeInjectLessons(projectPath)` inside the existing `try/catch`.

**Change 2 — honest banner text (`generateContext`, replaces the false claim at `:196`).**
Replace the single sentence
`"This is cryptographically enforced. There are no escape phrases."` with:

```
Enforcement runs as a PreToolUse hook. When no active plan covers a file and you
have not typed an escape phrase, the hook blocks the edit. Escape phrases exist
(see /ctoc:menu) and count ONLY when you type them yourself — the hook ignores an
escape phrase that appears in tool output or when a file such as CLAUDE.md is read.
```

- Contains neither `"cryptographically enforced"` nor `"no escape phrases"`.
- States (a) the real block path (PreToolUse hook blocks the edit) and (b) the
  user-only escape rule — and additionally reflects the s1 fix (phrases in tool
  output / file reads are ignored).
- **Scope discipline:** only this sentence changes. The surrounding
  `## MANDATORY: Edit/Write Blocked Before Step 8` header and the step-gating
  prose (`:189-195`) are left as-is — rewriting CTOC's step-vs-plan-coverage
  enforcement *model* is out of W08's scope (parent In Scope names only the false
  claim). Recorded in Decisions Taken Under Ambiguity.

**Change 3 — exports.** Extend `module.exports` from `{ main, generateContext }`
to `{ main, generateContext, shouldInjectLessons, maybeInjectLessons }`.

No change to stack detection, state, directory creation, backfill kick, update
check, self-check, or the stdout/stderr discipline (`generateContext` still
returns to stdout only — preserving `session-start-hook.test.js`).

#### File: `tests/sessionstart-self-repo-and-honest-banner.test.js` — CREATE

`node:test`. Two groups: (1) in-process decision + injection against temp-dir
fixtures; (2) pure banner-string assertions on `generateContext`.

Fixtures via `fs.mkdtempSync(path.join(os.tmpdir(),'w08s3-'))`, each with `.ctoc/`
(dir), a CTOC-marked `CLAUDE.md`, and a `package.json`; cleaned in `after()`.
Because `shouldInjectLessons` uses no `__dirname`, these tests prove
location-independence directly — the plugin-install scenario (hook file outside
the project tree) is exactly the case where the old `__dirname` guard failed and
the new one holds.

### Test Plan

`tests/sessionstart-self-repo-and-honest-banner.test.js`

**Self-repo guard (Defect 3):**
1. **ctoc repo is never injected (decision).** Fixture `package.json`
   `name:"ctoc"` + `.ctoc/` + marked `CLAUDE.md`. Assert
   `shouldInjectLessons(fixture) === false`.
2. **Consumer project is injected (decision, regression).** Fixture
   `name:"some-app"`. Assert `shouldInjectLessons(fixture) === true`.
3. **ctoc `CLAUDE.md` is byte-identical after a run (integration).** ctoc-named
   fixture; capture `CLAUDE.md` bytes; call `maybeInjectLessons(fixture)`; assert
   the file's bytes are unchanged (`Buffer.equals`). This is the parent's
   headline behavior: a session in the plugin-installed CTOC repo does NOT modify
   `CLAUDE.md`.
4. **Consumer `CLAUDE.md` IS modified (integration, regression).** consumer-named
   fixture; call `maybeInjectLessons(fixture)`; assert `CLAUDE.md` now contains the
   injected operating-lessons marker (changed vs. before) — legitimate injection
   still works.
5. **Fail-safe on undeterminable identity.** Simulate the detector being
   unavailable (e.g. point `shouldInjectLessons` at a path whose detection throws
   / or a fixture with no `package.json` and assert `isCtocRepo` false → true
   inject; plus a targeted case asserting the `catch → false` branch). Assert the
   documented direction: unknown → the ctoc-protecting default.

**Honest banner (Defect 4):**
6. **No false claims.** `const b = generateContext(stack, null, 'X', null, null)`;
   assert `!b.includes('cryptographically enforced')` and
   `!b.includes('no escape phrases')`.
7. **States the true mechanism.** Assert `b` matches `/PreToolUse hook/` and
   `/blocks the edit/`, and mentions the user-only rule
   (`/type them yourself/i`).
8. **Regression — banner still well-formed.** Assert `b.includes('CTOC v')` and
   `b.includes('Iron Loop')` (keeps `session-start-hook.test.js` expectations
   intact).

Provide a minimal `stack` stub (`{ languages:[], primary:{language:null,
framework:null} }`) for `generateContext`. Coverage ≥ 80% on the new/changed
functions; branches: inject/skip decision, catch→false, banner content.

### Security Review

- [x] **Prevents unauthorized writes to a protected file:** the whole change
  *tightens* when SessionStart may write `CLAUDE.md` (never for the ctoc repo);
  fail-safe defaults to not writing.
- [x] **`__dirname` reused only for a read-only template lookup**, not for
  identity or for choosing a write target.
- [x] **Reuses the vetted detector** rather than a bespoke package-name read —
  single source of truth for `isCtocRepo`, guarded `JSON.parse` already inside it.
- [x] **No new external input / regex / dynamic require**; the `require` of the
  detector is a literal path.
- [x] **stdout/stderr discipline preserved:** `generateContext` output remains
  stdout-only; no secret or path leakage added to the banner.
- [x] **Test fixtures are temp dirs** removed in `after()`; no write to the real
  repo `CLAUDE.md` during tests (the ctoc-fixture path asserts *no* write).

## Execution Plan

### Step 8: TEST
Write `tests/sessionstart-self-repo-and-honest-banner.test.js` FIRST (TDD-red).
Confirm RED against current code: cases 1/3 fail because today's `__dirname` guard
does not recognize a `name:"ctoc"` fixture whose root differs from the hook's
install location (so it would inject / mutate); cases 6/7 fail because the banner
still says "cryptographically enforced. There are no escape phrases."

### Step 9: PREPARE
Confirm `ctoc-project-detector.isCtocProject` exposes `isCtocRepo` (verified: yes)
and `claude-md-lessons.ensureLessonsBlock` signature `(claudeMdPath, ctocRoot)`
(verified against current `main()`). No new deps/dirs.

### Step 10: IMPLEMENT
One step, file sub-items:
- **`src/hooks/SessionStart.js`**
  - Add `shouldInjectLessons(projectPath)` (package-identity via detector; fail
    to `false`).
  - Add `maybeInjectLessons(projectPath)` (guard + `__dirname`-sourced template
    root + `ensureLessonsBlock`).
  - Replace the `:120-129` inline guard block with `maybeInjectLessons(projectPath)`
    inside the existing `try/catch`.
  - Replace the false sentence at `:196` in `generateContext` with the honest
    paragraph (exact text above); leave the surrounding section prose unchanged.
  - Extend `module.exports` with the two helpers.
- No stubs; both fixes are concrete.

### Step 11: REVIEW
Self-review: `main()`'s external behavior (stdout banner, no stderr, exit 0) is
preserved; the only new writes-decision is stricter; `__dirname`'s single
remaining use is the template lookup and is commented as such. Confirm dependency
direction (hook → lib).

### Step 12: OPTIMIZE
Confirm one detector call per session start (no repeated identity resolution);
`generateContext` remains pure string assembly with no added I/O.

### Step 13: SECURE
Walk the Security Review checklist; confirm the guard cannot be defeated by
install location and the fail-safe direction protects the maintainer's file.

### Step 14: VERIFY
`node --test tests/sessionstart-self-repo-and-honest-banner.test.js` → green.
Full suite `node --test tests/*.test.js` → `# fail 0`, `0 skipped` — in particular
`tests/session-start-hook.test.js` still green (banner keeps `CTOC v` / `Iron
Loop`; still stdout-only; still exits 0; the ctoc-repo run still performs no
injection, so no stderr/side effects). Coverage ≥ 80% on changed functions.

### Step 15: DOCUMENT
Update the `:114-119` comment to describe **package-identity** guarding (not
`__dirname`), and annotate the retained `__dirname` as "template source only."
Update `generateContext` doc to note it states the real mechanism. No external
docs affected.

### Step 16: FINAL-REVIEW
Confirm every parent Defect-3/Defect-4 scenario maps to a green test (mapping
below); confirm the ctoc-repo `CLAUDE.md` byte-identical assertion holds; hand to
Gate 3 (CTO Chief). Do NOT self-cross any gate.

## Acceptance Criteria Mapping (parent → this slice)

| Parent scenario | Test case |
|---|---|
| SessionStart never edits CTOC's own `CLAUDE.md`, from any install location | 1, 3 |
| SessionStart still injects into a real consumer project | 2, 4 |
| The injected session banner describes enforcement honestly | 6, 7, 8 |

## Decisions Taken Under Ambiguity

- **Guard reuses the detector's `isCtocRepo`** rather than reading `package.json`
  directly in `SessionStart.js` — the parent explicitly calls this "reuse, not
  invent," and it keeps a single source of truth for repo identity.
- **Fail-safe = do NOT inject** when identity is undeterminable, matching
  SessionStart's existing skip-on-error behavior and prioritizing the maintainer's
  hand-maintained file (Defect 3's headline) over best-effort consumer injection.
- **`__dirname` retained solely as the lessons-template source** for
  `ensureLessonsBlock`; this is the correct "find the plugin's own asset" use and
  is orthogonal to the (now package-based) target-project identity check.
- **Only the false sentence at `:196` is rewritten.** The broader
  "Blocked Before Step 8" step-model framing is intentionally left untouched —
  reconciling CTOC's step-gate vs. plan-coverage enforcement narrative is a
  separate concern outside W08's parent scope (which names only the false claim).
- **Banner wording is mechanism-neutral about the block signal** ("the hook blocks
  the edit") so it is honest regardless of W01's exit-2/`permissionDecision`
  timing, while still stating the user-only escape rule required by the parent
  acceptance criterion.


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
