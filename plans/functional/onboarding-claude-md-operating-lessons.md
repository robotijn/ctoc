---
title: "Onboarding — Corrected CLAUDE.md + Injected Operating Lessons (init + existing projects)"
created: "2026-06-28T00:00:00Z"
type: feature
status: functional
priority: HIGH
program: ctoc-onboarding
order: 1
depends_on: []
acceptance_criteria_count: 9
risk_level: MEDIUM
files:
  - ".ctoc/templates/CLAUDE.md.template"
  - ".ctoc/templates/operating-lessons.md"
  - "src/lib/claude-md-lessons.js"
  - "src/lib/init-project.js"
  - "src/hooks/SessionStart.js"
  - "tests/claude-md-lessons.test.js"
---

# Onboarding — Corrected CLAUDE.md + Injected Operating Lessons

> **Pending Approval — Gate 1: functional → implementation**

---

## Problem Statement

The generated project CLAUDE.md is the first and most-read instruction surface
for every CTOC project, yet `.ctoc/templates/CLAUDE.md.template` has drifted from
how CTOC actually works and carries none of the operating lessons learned running
CTOC in anger. Concretely, the template is **factually wrong** today:

- Says "Iron Loop (15 Steps)" with "Step 7 is TDD / Step 13 VERIFY" — CTOC has
  **16 steps**; the real labels are Step 8 TEST, Step 10 IMPLEMENT, Step 14 VERIFY.
- Documents a plan tree that does not exist (`functional/draft/`,
  `functional/approved/`, `in_progress/`) instead of the real
  `plans/{vision,canvas,functional,implementation,todo,in-progress,review,done}`.
- Lists `ctoc`, `ctoc plan new`, `ctoc plan approve` CLI commands — CTOC ships
  exactly three slash commands (`menu`, `push`, `update`); everything else is the
  menu.
- Shows only Gates 1/2/3 — Gate 0 (vision → functional) is missing.

Wrong onboarding instructions are bugs (today's warning is tomorrow's crash):
they mislead the human and the agent in every downstream project. Separately,
`init-project.js` writes CLAUDE.md only when absent (confirmed at line ~575), so
existing projects never receive corrections or new lessons. `SessionStart.js` does
not currently call any lessons injector — no mechanism exists to propagate lessons
to already-initialized projects.

---

## Business Alignment

**Job to Be Done:** When I start using CTOC on a new project (or return to an
existing one after a CTOC update), I want my project CLAUDE.md to reflect the
real 16-step pipeline, correct plan directories, and distilled operating lessons,
so I can follow the correct process on the first session without discovering
contradictions between what CLAUDE.md says and what CTOC actually does.

**Impact Map:**

- **Goal:** Every CTOC project starts with accurate, up-to-date onboarding
  instructions — so the human and agent never disagree about how the pipeline
  works.
- **Actor:** Any developer initializing or running an existing CTOC project.
- **Impact:** Developer opens a session and immediately has the correct Iron Loop
  step labels, gate count, plan directory names, slash commands, and operating
  lessons — without manually editing CLAUDE.md or reading release notes.
- **Deliverable:** A corrected template, a canonical lessons source, an idempotent
  injector module (`ensureLessonsBlock`), and wiring of that module into both
  `initProject()` and `SessionStart.js`.

---

## User Stories

**As a** developer initializing a new project with CTOC,
**I want** the generated CLAUDE.md to accurately reflect the real 16-step Iron
Loop, 4 gates, correct plan directories, and 3-slash-command rule,
**so that** the instructions I follow on day one match how CTOC actually works,
not a stale description that sends me down wrong paths.

**As a** developer with an existing CTOC project opening a new session,
**I want** CTOC to automatically inject the current operating lessons block into
my CLAUDE.md if it is absent or out of date,
**so that** I benefit from distilled CTOC practice without manually editing
CLAUDE.md or tracking what changed between CTOC versions.

---

## Acceptance Criteria

- [ ] **Scenario: New project init produces accurate CLAUDE.md**
  Given a new project directory containing no CLAUDE.md
  When `initProject()` runs (non-dry-run)
  Then the generated CLAUDE.md contains "16" in the Iron Loop section label,
  the step labels "8:TEST", "10:IMPLEMENT", and "14:VERIFY", all four gate
  labels including "Gate 0", the plan directory list
  `plans/{vision,canvas,functional,implementation,todo,in-progress,review,done}`,
  and the three slash command names `menu`, `push`, `update`
  And the managed lessons block is present between its version markers

- [ ] **Scenario: Drift strings absent from generated CLAUDE.md**
  Given a freshly initialized project's CLAUDE.md produced by the corrected template
  When its full text is scanned
  Then none of the following strings appear: "15 Steps", "functional/draft",
  "functional/approved", "in_progress/", "ctoc plan new", "ctoc plan approve",
  "Step 7 is TDD", "Step 9 is ONE step", "Step 13 VERIFY"

- [ ] **Scenario: `ensureLessonsBlock` is idempotent on a current block**
  Given a CLAUDE.md already containing `<!-- CTOC:LESSONS v1 START -->` through
  `<!-- CTOC:LESSONS v1 END -->` (current version)
  When `ensureLessonsBlock(claudeMdPath, ctocRoot)` is called a second time
  Then the function returns `false` (no change made)
  And the file content is byte-for-byte identical to before the call
  And the file contains exactly one start marker and exactly one end marker

- [ ] **Scenario: User prose preserved byte-for-byte around managed block**
  Given a CLAUDE.md with user-authored prose before the managed block start
  marker and additional user-authored prose after the managed block end marker
  When `ensureLessonsBlock` runs (whether inserting for the first time or
  upgrading an old block)
  Then the content before the start marker is byte-for-byte unchanged
  And the content after the end marker is byte-for-byte unchanged

- [ ] **Scenario: Version upgrade replaces old block in place**
  Given a CLAUDE.md containing an older block bounded by
  `<!-- CTOC:LESSONS v0 START -->` and `<!-- CTOC:LESSONS v0 END -->`
  with user prose outside those markers
  When `ensureLessonsBlock(claudeMdPath, ctocRoot)` is called with v1 as the
  current version
  Then the function returns `true` (change made)
  And the file contains `<!-- CTOC:LESSONS v1 START -->` and
  `<!-- CTOC:LESSONS v1 END -->`
  And no v0 markers remain
  And no duplicate start or end markers exist
  And the surrounding user prose is unchanged

- [ ] **Scenario: SessionStart injects block for existing project on first run**
  Given an existing CTOC project whose CLAUDE.md is present but contains no
  managed lessons block
  When `SessionStart.js` `main()` completes
  Then CLAUDE.md contains exactly one managed lessons block between its markers

- [ ] **Scenario: SessionStart is a no-op on second run**
  Given an existing CTOC project whose CLAUDE.md already contains the current
  managed lessons block
  When `SessionStart.js` `main()` runs again
  Then CLAUDE.md is byte-for-byte unchanged after the second run

- [ ] **Scenario: `ensureLessonsBlock` fails open when lessons source is missing**
  Given the canonical lessons file `operating-lessons.md` does not exist at the
  resolved path
  When `ensureLessonsBlock(claudeMdPath, ctocRoot)` is called
  Then the function returns `false` without modifying `claudeMdPath`
  And a warning is written to stderr (not a thrown exception)
  And `SessionStart.js` continues to completion without aborting

- [ ] **Scenario: All file paths are cross-platform**
  Given the module `src/lib/claude-md-lessons.js` is loaded on macOS, Linux,
  or Windows
  When paths to `operating-lessons.md` and `claudeMdPath` are resolved
  Then every path is constructed via `path.join()` or `path.resolve()` with no
  hardcoded `/` or `\` directory separators in string literals
  And no child processes or shell commands are spawned to read or write files

---

## Non-Functional Requirements

| Requirement | Criterion |
|-------------|-----------|
| Cross-platform | `path.join`/`path.resolve` only; `fs` synchronous API; no shell invocation; passes on macOS, Linux, Windows |
| Idempotency | Running `ensureLessonsBlock` N times on the same file with the same version produces the same result as running it once |
| Content preservation | Bytes outside the managed block markers are never altered; verified by byte-for-byte diff in tests |
| Atomicity | Write uses a temp file + `fs.renameSync` (atomic on same filesystem) to prevent partial-write corruption |
| Performance | `ensureLessonsBlock` completes in < 20ms measured in the test suite; SessionStart total < 100ms |
| Fail-open | Any error inside `ensureLessonsBlock` (missing file, I/O error, regex failure) catches, logs to stderr, and returns `false`; it never throws to the caller |
| No global mutation | Never touches `~/.claude/CLAUDE.md` or any file outside the target project directory |

---

## Scope

### In Scope

- Correct `.ctoc/templates/CLAUDE.md.template`: 16 steps (Step 8 TEST, Step 10
  IMPLEMENT, Step 14 VERIFY), 4 gates (Gate 0 through Gate 3), real plan dirs
  (`plans/{vision,canvas,functional,implementation,todo,in-progress,review,done}`),
  3 slash commands (`menu`, `push`, `update`), removal of all `ctoc plan ...` CLI
  references and `functional/draft`/`in_progress` directory references.
- New `.ctoc/templates/operating-lessons.md`: canonical versioned source for the
  12 generalized operating lessons; version marker embedded in file.
- New `src/lib/claude-md-lessons.js`: exports `ensureLessonsBlock(claudeMdPath,
  ctocRoot)` with idempotent marker-delimited injection logic.
- Wire `ensureLessonsBlock` into `initProject()` (called after the CLAUDE.md
  write/skip decision so both new and existing projects receive the block).
- Wire `ensureLessonsBlock` into `SessionStart.js` `main()` (after step 5,
  directory ensure; before step 6, update check), wrapped in try/catch.
- Test file `tests/claude-md-lessons.test.js` covering all 9 acceptance scenarios.

### Out of Scope

- Modifying the user's global `~/.claude/CLAUDE.md` (personal infrastructure —
  never touched, enforced by the no-global-mutation NFR).
- Changing hook/gate logic, gate counts, or Iron Loop step definitions (this plan
  documents the real structure; it does not change it).
- The vector plan-index program (separate `ctoc-planning-intelligence` plans).
- Auto-migration of incorrect CLAUDE.md content other than the managed block (e.g.,
  rewriting the human's custom sections — out of scope forever).
- Any UI or dashboard surface for managing lessons (future phase if needed).
- `plans/canvas` directory creation in `initProject()` — it already appears in
  `PLAN_DIRS` at line 124; this plan does not add or change that constant.

---

## Test Plan

Test file: `tests/claude-md-lessons.test.js` (Node built-in test runner, matching
project convention).

| Test | Scenario covered | Method |
|------|-----------------|--------|
| `init_writes_16_step_iron_loop` | AC1 | Render template to temp dir; grep output for "16", "8:TEST", "10:IMPLEMENT", "14:VERIFY", "Gate 0" |
| `init_no_drift_strings` | AC2 | Render template to temp dir; assert each drift string absent |
| `ensure_lessons_idempotent` | AC3 | Call `ensureLessonsBlock` twice; compare file after each call; assert returns false on second call |
| `ensure_lessons_preserves_prose` | AC4 | Construct fixture with user text above/below markers; run; compare non-block content byte-for-byte |
| `ensure_lessons_upgrades_old_version` | AC5 | Fixture with v0 block; call with v1; assert v1 markers present, v0 absent, return value true |
| `session_start_injects_block` | AC6 | Spy/stub `ensureLessonsBlock`; verify it is called from `main()` when block absent |
| `session_start_noop_on_second_run` | AC7 | Call injector twice on same fixture; assert file unchanged on second call |
| `ensure_lessons_fails_open_missing_source` | AC8 | Delete/mock operating-lessons.md; call; assert returns false, no throw, no file mutation |
| `ensure_lessons_uses_path_join` | AC9 | Inspect module source for hardcoded path separators (static analysis); mock path module to confirm calls |

**Falsifiable drift-string assertions** (must all be absent from rendered template output):

```
"15 Steps"
"Step 7 is TDD"
"Step 9 is ONE step"
"Step 13 VERIFY"
"functional/draft"
"functional/approved"
"implementation/draft"
"implementation/approved"
"in_progress/"
"ctoc plan new"
"ctoc plan approve"
"ctoc plan status"
```

**Presence assertions** (must all appear in rendered template output):

```
"16"              (in Iron Loop header)
"Step 8"          (TEST step)
"Step 10"         (IMPLEMENT step)
"Step 14"         (VERIFY step)
"Gate 0"          (vision → functional)
"menu"            (slash command)
"push"            (slash command)
"update"          (slash command)
"plans/in-progress"  (correct hyphenated form)
"plans/canvas"    (missing from old template)
```

---

## The Distilled Operating Lessons (canonical block content — generalized)

> Generalized from the lessons learned operating CTOC; no person- or
> repo-specific text, so it is correct in every project.

1. **The measure is the human.** "Working" means a person can open it, act, and
   get a fast, legible response. Green tests, a finished job, or a running engine
   are not "working" if the human sees nothing happen. Grinding with no feedback
   is broken.
2. **Never route around CTOC or self-cross its gates.** The four human gates
   belong to the human. No auto-approval, no skipping the pipeline — rot
   accumulates exactly where the pipeline is bypassed.
3. **Always implement via the Iron Loop** (TDD-Red → implement → verify →
   review). No ad-hoc edits to plan-covered files.
4. **Use CTOC's own agents** for pipeline work; never substitute a generic or
   ad-hoc agent. If CTOC looks unavailable, stop and surface the blocker.
5. **Honesty is the mechanism.** Report reality plainly; never hide behind
   "technically it ran." Show the real data/output; do not point at a file in
   place of showing it.
6. **Test the human's behavior, not the structure.** Drive the real end-to-end
   flow (act → it responds in reasonable time → it does the thing); snapshot or
   render-only tests are false green.
7. **No-stub rule.** On ambiguity, make a documented reasonable choice and
   continue with working code; record it under
   `## Decisions Taken Under Ambiguity`. Never leave stubs or TODOs.
8. **Async-overnight.** Do not synchronously block on ambiguity; document the
   choice, continue, and let review/kickback catch wrong calls.
9. **Warnings are bugs.** Deprecations, compiler/linter warnings, and
   vulnerabilities of any severity are critical — fix them now.
10. **Menu discipline — just show it.** Present a menu or selection immediately;
    do not deliberate at the human before showing it.
11. **Pre-todo is context; todo+ is execution.** Lock all context before code; if
    the implementer would have to guess, kick back upstream.
12. **Cross-platform always.** `path.join`, `fs.promises`, `os.homedir`,
    `process.platform`; never a shell script as an entry point.

(Plus a short, accurate methodology reference: 16 steps, 4 gates, 3 slash
commands, marketplace-only install.)

---

## Risks

### Technical Risks

- **Non-atomic write may corrupt CLAUDE.md on crash mid-write.**
  - Likelihood: LOW — rare; requires process death precisely during `writeFileSync`
  - Impact: HIGH — partial CLAUDE.md is invisible damage; developer may not notice
  - Mitigation: Write final content to `path.join(os.tmpdir(), uuid + '.claude.md')`
    then `fs.renameSync(tmp, target)` — atomic on same-volume filesystems (macOS,
    Linux, Windows NTFS)

- **CRLF line endings (Windows) break marker regex matching.**
  - Likelihood: MEDIUM — Windows developers editing CLAUDE.md in VS Code default
    to CRLF; the start marker `<!-- CTOC:LESSONS vN START -->` spans a full line
    and regex using `\n` will not match `\r\n`
  - Impact: HIGH — injector incorrectly treats a CRLF-encoded current block as
    absent and inserts a duplicate
  - Mitigation: Normalize `\r\n` → `\n` on read into memory; detect and restore
    original EOL style (CRLF or LF) when writing back; test with CRLF fixture

### Business Risks

- **Future block version bump silently replaces in-block content a developer
  customized, assuming they stayed inside the markers.**
  - Likelihood: LOW — the managed block is clearly labelled "CTOC-managed; do not
    edit" (a comment will be added inside the block itself)
  - Impact: MEDIUM — unexpected content loss; developer must diff from git to
    recover; no data is permanently lost (git history has it)
  - Mitigation: Add an HTML comment `<!-- Content between these markers is
    CTOC-managed. Do not edit manually. -->` as the first line inside the block;
    document the contract in the generated CLAUDE.md preamble.

### Dependency Risks

- **SessionStart.js performance regression from added I/O.**
  - Likelihood: MEDIUM — `ensureLessonsBlock` adds two synchronous file reads
    (CLAUDE.md + operating-lessons.md) and a conditional write to every session
    start; SessionStart already targets < 100ms total
  - Impact: MEDIUM — perceived session start slowness; if > 100ms developers may
    disable the hook
  - Mitigation: Benchmark `ensureLessonsBlock` isolated in the test suite; assert
    it completes in < 20ms on a warm filesystem; use `fs.readFileSync` (sync,
    avoids event-loop overhead); the no-op path (current block already present)
    reads two files and exits — fastest path is the steady-state path

---

## Rollback

- **Template correction:** `git checkout .ctoc/templates/CLAUDE.md.template`
  restores the old (wrong) template. Consequence: next `initProject()` generates
  incorrect content again. No runtime harm; just re-introduces the known bug.
- **Lessons injector (single project):** Delete the lines from
  `<!-- CTOC:LESSONS vN START -->` through `<!-- CTOC:LESSONS vN END -->` in
  `CLAUDE.md`. The injector is idempotent; the next session start re-injects
  cleanly. No data is lost.
- **Rollback trigger:** If the injector corrupts a CLAUDE.md in CI (unlikely
  given atomic write), `git checkout CLAUDE.md` in the affected project restores
  the last committed state.

---

## Dependencies

None. This plan has no upstream plan dependencies. `src/lib/claude-md-lessons.js`
is a new module with no imports beyond Node built-ins (`fs`, `path`, `os`). It
does not depend on state-manager, stack-detector, or any other CTOC library.

---

## Priority

**Priority: HIGH** (Score: 8/9)

- Dependency: HIGH (3) — the corrected template is read by `initProject()` on
  every first-use; `ensureLessonsBlock` must exist before SessionStart wiring
  can be tested; correct onboarding is the prerequisite for every other plan
  in the `ctoc-onboarding` program.
- Business Impact: HIGH (3) — wrong instructions in CLAUDE.md are bugs that
  propagate to every downstream project; the problem exists at program start
  for every new CTOC user and every existing project.
- Technical Risk: MEDIUM (2) — file read/write with marker-based injection is
  well-understood; the main complexity is CRLF normalization and atomic write,
  both solvable with standard Node built-ins and documented mitigations.

---

## Decisions Taken Under Ambiguity

- **Managed-block, not overwrite.** The injector edits only between markers so a
  project's own CLAUDE.md content is never clobbered — the safe way for a tool to
  co-own a user file. Rationale: existing projects already have curated CLAUDE.md
  prose.
- **Single canonical source.** Lessons live once in
  `.ctoc/templates/operating-lessons.md`; the template embeds the block at
  build/init time and the injector reads it at runtime, so they can never diverge.
- **Version marker drives upgrades.** A block version (`vN`) lets SessionStart
  upgrade silently; bumping it is how future lessons propagate to every project.
- **Generalized content.** All person- and repo-specific phrasing is stripped so
  the block is correct in any project.
- **Lessons source resolved via `__dirname`, not project root.** `operating-lessons.md`
  lives in the CTOC plugin installation, not the target project. In both
  `init-project.js` and `claude-md-lessons.js`, the path is resolved as
  `path.join(__dirname, '..', '..', '.ctoc', 'templates', 'operating-lessons.md')`.
  This means the lessons always come from the installed CTOC version, which is
  correct behavior — projects should receive the lessons from the CTOC version
  currently running, not from a copy placed in their own repo.
- **Synchronous fs in `ensureLessonsBlock`.** SessionStart.js is already
  synchronous throughout its setup steps (loadState, saveState, mkdirSync). Using
  `readFileSync`/`writeFileSync` is consistent with the existing hook pattern and
  avoids introducing async complexity into a path that is not currently async.
- **`plans/canvas` confirmed in scope.** `PLAN_DIRS` in `init-project.js` line 124
  includes `plans/canvas`; the corrected template must list it. The old template
  omitted it entirely.
