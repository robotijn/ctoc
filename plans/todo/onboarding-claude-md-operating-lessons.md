---
iron_loop: true
approved_by: human
approved_at: 2026-06-30T18:28:12.781Z
gate_crossed: implementation → todo
---

---
approved_by: human
approved_at: 2026-06-30T18:07:12.714Z
gate_crossed: functional → implementation
---

---
title: "Onboarding — Corrected CLAUDE.md + Injected Operating Lessons (init + existing projects)"
created: "2026-06-28T00:00:00Z"
type: feature
status: functional
priority: HIGH
parent_vision: "done/local-semantic-plan-index.md"
program: ctoc-onboarding
order: 1
depends_on: []
acceptance_criteria_count: 12
risk_level: MEDIUM
files:
  - ".ctoc/templates/CLAUDE.md.template"
  - ".ctoc/templates/operating-lessons.md"
  - "src/lib/claude-md-lessons.js"
  - "src/lib/init-project.js"
  - "src/hooks/SessionStart.js"
  - "src/commands/update.js"
  - "tests/claude-md-lessons.test.js"
  - "README.md"
  - "tests/readme-numbers.test.js"
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
  exactly three slash commands (`/ctoc:menu`, `/ctoc:push`, `/ctoc:update`);
  everything else is the menu.
- Shows only Gates 1/2/3 — Gate 0 (vision → functional) is missing.

Wrong onboarding instructions are bugs (today's warning is tomorrow's crash):
they mislead the human and the agent in every downstream project. Separately,
`init-project.js` writes CLAUDE.md only when absent (confirmed at line ~575), so
existing projects never receive corrections or new lessons. `SessionStart.js` does
not currently call any lessons injector — no mechanism exists to propagate lessons
to already-initialized projects. And no on-demand path exists: a developer who
runs `/ctoc:update` to get the latest CTOC version receives updated plugin code
but no refreshed local CLAUDE.md managed block.

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
  injector module (`ensureLessonsBlock`), and wiring of that module into
  `initProject()`, `SessionStart.js`, and `src/commands/update.js`.

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
  Then the generated CLAUDE.md contains the substring "16 steps" or "16-step"
  in the Iron Loop section (the assertion must match that compound token — not
  the bare digit "16", which also matches "2016" or pixel sizes),
  the step labels "8:TEST", "10:IMPLEMENT", and "14:VERIFY", all four gate
  labels including "Gate 0", the plan directory list
  `plans/{vision,canvas,functional,implementation,todo,in-progress,review,done}`,
  and the three slash command tokens `/ctoc:menu`, `/ctoc:push`, `/ctoc:update`
  (not bare "menu"/"push"/"update", which appear in ordinary prose)
  And the managed lessons block is present between its version markers

- [ ] **Scenario: Drift strings absent from generated CLAUDE.md**
  Given a freshly initialized project's CLAUDE.md produced by the corrected template
  When its full text is scanned
  Then none of the following strings appear: "15 Steps", "functional/draft",
  "functional/approved", "in_progress/", "ctoc plan new", "ctoc plan approve",
  "Step 7 is TDD", "Step 9 is ONE step", "Step 13 VERIFY"

- [ ] **Scenario: `ensureLessonsBlock` is idempotent on a current block**
  Given a CLAUDE.md already containing `<!-- CTOC:LESSONS v1 START -->` through
  `<!-- CTOC:LESSONS v1 END -->` with the exact canonical block body (current
  version and content hash match)
  When `ensureLessonsBlock(claudeMdPath, ctocRoot)` is called a second time
  Then the function returns `false` (no change made)
  And the file content is byte-for-byte identical to before the call
  And the file contains exactly one start marker and exactly one end marker
  And the no-change decision is keyed on a content hash of the canonical block
  body (not just the version string): if the block body were altered while
  keeping v1 markers, the next call returns `true` and replaces the block

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
  Given an existing CTOC project directory with a stub `.ctoc/state` file,
  a CLAUDE.md that contains no managed lessons block, and the canonical
  `operating-lessons.md` source present at its resolved path
  When `SessionStart.js` `main()` runs to completion against that project
  directory (invoked as the real module, not stubbed)
  Then the on-disk CLAUDE.md contains exactly one `<!-- CTOC:LESSONS v1 START -->`
  marker, exactly one `<!-- CTOC:LESSONS v1 END -->` marker, and the canonical
  lesson content between them
  And no additional start or end markers are present anywhere in the file

- [ ] **Scenario: SessionStart is a no-op on second run**
  Given an existing CTOC project whose CLAUDE.md already contains the current
  managed lessons block (version and content hash both match)
  When `SessionStart.js` `main()` runs again
  Then CLAUDE.md is byte-for-byte unchanged after the second run

- [ ] **Scenario: `ensureLessonsBlock` fails open when lessons source is missing**
  Given the canonical lessons file `operating-lessons.md` does not exist at the
  resolved path
  When `ensureLessonsBlock(claudeMdPath, ctocRoot)` is called
  Then the function returns `false` without modifying `claudeMdPath`
  And a warning message is written to stderr — the test captures stderr output
  and asserts it is non-empty and references the missing file path
  (a silent return-false with no stderr output FAILS this scenario — no-silent-
  failure rule)
  And `SessionStart.js` continues to completion without aborting

- [ ] **Scenario: All file paths and atomic write are cross-platform**
  Given a test environment where `process.platform` is set to `'win32'`
  and `path.sep` is set to `'\\'`
  When `ensureLessonsBlock(claudeMdPath, ctocRoot)` resolves all internal
  paths (to `operating-lessons.md` and to the temp write target)
  Then every resolved path string uses the `'\\'` separator (no hardcoded `/`
  appears in any generated path string)
  And a spy on `fs.renameSync` confirms it is called exactly once with arguments
  `(tempPath, claudeMdPath)`, verifying the atomic temp-then-rename write
  pattern (no direct `writeFileSync` to the target path)
  And no child processes or shell commands are spawned to read or write files

- [ ] **Scenario: CRLF line endings do not produce duplicate markers**
  Given a CLAUDE.md fixture whose line endings are `\r\n` (CRLF) throughout
  and which already contains `<!-- CTOC:LESSONS v1 START -->` through
  `<!-- CTOC:LESSONS v1 END -->` with the canonical block body (CRLF-encoded)
  When `ensureLessonsBlock(claudeMdPath, ctocRoot)` is called
  Then the function returns `false` (no change — current version, hash matches)
  And the file contains exactly one start marker and exactly one end marker
  And no duplicate markers appear anywhere in the file
  And the original CRLF line endings are preserved in the written output

- [ ] **Scenario: Markers embedded in fenced code blocks are ignored**
  Given a CLAUDE.md that contains a fenced code block (triple-backtick
  delimiters) whose inner text includes the literal strings
  `<!-- CTOC:LESSONS v1 START -->` and `<!-- CTOC:LESSONS v1 END -->` as
  documentation examples, but has no real managed block outside the code fence
  When `ensureLessonsBlock(claudeMdPath, ctocRoot)` is called
  Then the injector identifies the file as having no real managed block
  And inserts exactly one managed block at the end of the file (outside
  the fenced code section)
  And the fenced code block content is preserved byte-for-byte

- [ ] **Scenario: /ctoc:update refreshes the local CLAUDE.md managed block**
  Given a project directory whose CLAUDE.md has a stale or absent managed
  lessons block (either no markers at all, or a v0 block, or a v1 block with
  a content hash that does not match the canonical canonical source)
  When the `/ctoc:update` code path runs — specifically, the
  `ensureLessonsBlock` injection added to `src/commands/update.js` is invoked
  against a temp project directory (the real `update.js` lessons-injection path,
  not a stub; the version-fetch network calls are stubbed to avoid network I/O
  in the test)
  Then the local CLAUDE.md contains exactly one `<!-- CTOC:LESSONS v1 START -->`
  marker and exactly one `<!-- CTOC:LESSONS v1 END -->` marker
  And the canonical lesson content appears between those markers
  And a second invocation of the same injection path leaves the file
  byte-for-byte unchanged (no-op: current version and content hash already match)
  And no exception propagates to the caller — a lessons-injection failure is
  caught and logged to stderr without aborting the update function

---

## Non-Functional Requirements

| Requirement | Criterion |
|-------------|-----------|
| Cross-platform | `path.join`/`path.resolve` only; `fs` synchronous API; no shell invocation; verified behaviorally by mocking `process.platform` and `path.sep` in the test suite |
| Idempotency | Running `ensureLessonsBlock` N times is idempotent: keyed on a SHA-256 content hash of the canonical block body (not just the version string), so in-marker drift is also corrected; result of N calls equals result of one call |
| Content preservation | Bytes outside the managed block markers are never altered; verified by byte-for-byte diff in tests |
| Atomicity | Write uses a temp file + `fs.renameSync` (atomic on same filesystem) to prevent partial-write corruption; verified by spy on `fs.renameSync` in the test |
| Performance | Steady-state no-op path reads two files and exits without writing; no hard millisecond CI thresholds (inherently flaky); performance is validated by design (minimal synchronous I/O) rather than by timing assertions |
| Fail-open | Any error inside `ensureLessonsBlock` (missing file, I/O error, regex failure) catches, logs to stderr (assertably non-empty), and returns `false`; it never throws to the caller |
| No global mutation | Never touches `~/.claude/CLAUDE.md` or any file outside the target project directory |

---

## Scope

### In Scope

- Correct `.ctoc/templates/CLAUDE.md.template`: 16 steps (Step 8 TEST, Step 10
  IMPLEMENT, Step 14 VERIFY), 4 gates (Gate 0 through Gate 3), real plan dirs
  (`plans/{vision,canvas,functional,implementation,todo,in-progress,review,done}`),
  3 slash commands (`/ctoc:menu`, `/ctoc:push`, `/ctoc:update`), removal of all
  `ctoc plan ...` CLI references and `functional/draft`/`in_progress` directory
  references.
- New `.ctoc/templates/operating-lessons.md`: canonical versioned source for the
  12 generalized operating lessons; version marker embedded in file.
- New `src/lib/claude-md-lessons.js`: exports `ensureLessonsBlock(claudeMdPath,
  ctocRoot)` with idempotent marker-delimited injection logic keyed on content
  hash; CRLF-normalizing reader; fenced-code-block-aware marker search; atomic
  write via temp file + `fs.renameSync`.
- Wire `ensureLessonsBlock` into `initProject()` (called after the CLAUDE.md
  write/skip decision so both new and existing projects receive the block).
- Wire `ensureLessonsBlock` into `SessionStart.js` `main()` (after step 5,
  directory ensure; before step 6, update check), wrapped in try/catch.
- Wire `ensureLessonsBlock(claudeMdPath, ctocRoot)` into `src/commands/update.js`
  so running `/ctoc:update` refreshes or injects the managed lessons block in the
  current project's local CLAUDE.md, in addition to the command's existing
  version-sync behavior. The injection runs at both terminal points of the
  `update()` function: (a) immediately before the early-return in the
  "already up to date" branch, and (b) after step 7 (clean old versions) and
  before the final success console.log, so the block is refreshed whether or not
  a version change occurred. `claudeMdPath` is `path.join(process.cwd(), 'CLAUDE.md')`;
  `ctocRoot` is `path.resolve(__dirname, '..', '..')`. The call is wrapped in
  try/catch: a lessons-injection failure is caught, logged to stderr, and never
  aborts the version update. `src/commands/update.md` is NOT modified — it is a
  pass-through bash invoker with `disable-model-invocation: true`; the injection
  behavior is fully contained in `update.js`.
- Add `plans/canvas` to `SessionStart.js`'s `directories` list (currently absent
  from lines 76–90) to match the corrected template's directory listing;
  `initProject()`'s `PLAN_DIRS` constant already includes it and is not changed.
- Resolve the `generateContext` triplication: `SessionStart.js`'s `generateContext`
  hardcodes the 16-step banner inline — a third copy alongside the corrected
  template and `operating-lessons.md`. In Scope: add a cross-reference comment in
  `generateContext` citing the canonical source, and add a test assertion that the
  step labels in the banner match those in `operating-lessons.md`. `generateContext`
  is NOT restructured to do runtime file I/O (would add latency to every session
  start); the three copies are kept intentionally separate but sync-guarded by a
  test.
- Test file `tests/claude-md-lessons.test.js` covering all 12 acceptance scenarios.

### Out of Scope

- Modifying the user's global `~/.claude/CLAUDE.md` (personal infrastructure —
  never touched, enforced by the no-global-mutation NFR).
- Changing hook/gate logic, gate counts, or Iron Loop step definitions (this plan
  documents the real structure; it does not change it).
- The vector plan-index program (separate `ctoc-planning-intelligence` plans).
- Auto-migration of incorrect CLAUDE.md content other than the managed block (e.g.,
  rewriting the human's custom sections — out of scope forever).
- Any UI or dashboard surface for managing lessons (future phase if needed).
- `plans/canvas` constant in `initProject()`'s `PLAN_DIRS` — already correct at
  line 126; this plan does not touch it. Only `SessionStart.js`'s separate
  `directories` list is updated (see In Scope).
- `src/commands/update.md` — already correctly passes through to `update.js` via
  bash with `disable-model-invocation: true`; no content change required; no
  `model:` frontmatter to add (guarded by `tests/slash-command-no-model-pin.test.js`).

---

## Test Plan

Test file: `tests/claude-md-lessons.test.js` (Node built-in test runner, matching
project convention).

| Test | Scenario covered | Method |
|------|-----------------|--------|
| `init_writes_16_step_iron_loop` | AC1 | Render template to temp dir; assert presence of "16 steps" or "16-step" (compound token), "8:TEST", "10:IMPLEMENT", "14:VERIFY", "Gate 0", "/ctoc:menu", "/ctoc:push", "/ctoc:update" |
| `init_no_drift_strings` | AC2 | Render template to temp dir; assert each drift string absent |
| `ensure_lessons_idempotent` | AC3 | Call `ensureLessonsBlock` twice with matching content hash; compare file after each call; assert returns false on second call |
| `ensure_lessons_preserves_prose` | AC4 | Construct fixture with user text above/below markers; run; compare non-block content byte-for-byte |
| `ensure_lessons_upgrades_old_version` | AC5 | Fixture with v0 block; call with v1; assert v1 markers present, v0 absent, return value true |
| `session_start_injects_block` | AC6 | Run real `SessionStart.main()` against a temp project dir with stub state; assert on-disk CLAUDE.md contains exactly one START marker, one END marker, and the canonical lesson body between them |
| `session_start_noop_on_second_run` | AC7 | Call injector twice on same fixture (current version + hash match); assert file unchanged on second call |
| `ensure_lessons_fails_open_missing_source` | AC8 | Delete/rename operating-lessons.md; capture stderr; call; assert returns false, stderr non-empty referencing the missing path, no file mutation |
| `ensure_lessons_cross_platform_atomic` | AC9 | Mock `process.platform='win32'` and `path.sep='\\'`; spy `fs.renameSync`; call `ensureLessonsBlock`; assert all paths use `\\`, renameSync called with `(tempPath, target)`, no child processes spawned |
| `ensure_lessons_idempotent_crlf` | AC10 | Load CRLF fixture with current-version markers and canonical body; call `ensureLessonsBlock`; assert returns false, exactly one start marker, one end marker, CRLF endings preserved |
| `ensure_lessons_ignores_fenced_markers` | AC11 | Load fixture with fenced code block containing literal marker text but no real managed block; assert injector inserts one managed block, fenced content preserved |
| `update_injects_lessons_block` | AC12 | Invoke the real `update.js` lessons-injection path against a temp project dir (stub network calls that fetch from GitHub and update the plugin registry; call only the `ensureLessonsBlock` portion of `update()` directly to isolate the injection logic); assert CLAUDE.md gains exactly one START marker and one END marker with canonical content between them; invoke a second time and assert the file is byte-for-byte unchanged (no-op on current block) |

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
"16 steps" or "16-step"  (compound token — not bare "16", which matches "2016"/sizes)
"Step 8"                  (TEST step)
"Step 10"                 (IMPLEMENT step)
"Step 14"                 (VERIFY step)
"Gate 0"                  (vision → functional)
"/ctoc:menu"              (slash command — not bare "menu", which appears in prose)
"/ctoc:push"              (slash command — not bare "push")
"/ctoc:update"            (slash command — not bare "update")
"plans/in-progress"       (correct hyphenated form)
"plans/canvas"            (missing from old template)
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
    Linux, Windows NTFS); verified by spy on `fs.renameSync` in AC9

- **CRLF line endings (Windows) break marker regex matching.**
  - Likelihood: MEDIUM — Windows developers editing CLAUDE.md in VS Code default
    to CRLF; the start marker `<!-- CTOC:LESSONS vN START -->` spans a full line
    and a regex using `\n` will not match `\r\n`
  - Impact: HIGH — injector incorrectly treats a CRLF-encoded current block as
    absent and inserts a duplicate
  - Mitigation: Normalize `\r\n` → `\n` on read into memory; detect and restore
    original EOL style (CRLF or LF) when writing back; verified by AC10
    (CRLF fixture asserts no duplicate markers and returns false on second call)

- **Markers inside fenced code blocks matched by naive regex.**
  - Likelihood: MEDIUM — this plan file itself embeds the literal markers as
    documentation; any project using operating-lessons.md as a reference will
    reproduce this pattern
  - Impact: MEDIUM — injector finds a false start marker inside a code fence and
    treats an absent block as present (no-op) or corrupts the splice
  - Mitigation: Strip fenced code block regions before searching for markers;
    verified by AC11

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
    start; SessionStart already has a sub-100ms target
  - Impact: MEDIUM — perceived session start slowness; if perceptible developers
    may disable the hook
  - Mitigation: Keep `ensureLessonsBlock` to pure synchronous fs I/O (no async,
    no shell); the no-op path (current block present, hash matches) reads two
    files and exits — the steady-state path is also the fastest path; no timing
    assertions in CI (flaky); validate by design

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
is a new module with no imports beyond Node built-ins (`fs`, `path`, `os`,
`crypto`). It does not depend on state-manager, stack-detector, or any other
CTOC library.

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
  well-understood; the main complexity is CRLF normalization, fenced-code-block
  stripping, content-hash keying, and atomic write, all solvable with standard
  Node built-ins and documented mitigations.

---

## Decisions Taken Under Ambiguity

- **Three refresh triggers: init + SessionStart auto + /ctoc:update explicit
  (Option A — human decision).**
  The human selected Option A: the lessons block is refreshed by three independent
  triggers — `initProject()` at project creation, `SessionStart.js` at every
  session open (automatic), and `/ctoc:update` on explicit demand. Rationale:
  `/ctoc:update` matches the developer's mental model of "run update to get the
  latest everything"; riding the injection on the existing command satisfies
  discoverability without introducing a fourth slash command (CTOC ships exactly
  three). The "already up to date" case (version unchanged) still refreshes the
  block: a developer who runs `/ctoc:update` expects their environment to be
  current regardless of whether the plugin version changed.
  **Documented choice — WHERE in update.js the injection runs:** The call to
  `ensureLessonsBlock(claudeMdPath, ctocRoot)` is placed at both terminal points
  of the `update()` function in `src/commands/update.js`:
  (a) Immediately before the early-return in the "already up to date" branch
  (currently lines ~99–102), so the block is refreshed even when the plugin
  version has not changed.
  (b) After step 7 (clean old versions), before the final
  `console.log('✓ Updated to CTOC ...')`, so the block is also refreshed after
  a successful version upgrade.
  In both cases: `claudeMdPath = path.join(process.cwd(), 'CLAUDE.md')` (the
  project directory from which the user invoked `/ctoc:update`);
  `ctocRoot = path.resolve(__dirname, '..', '..')` (the installed plugin root,
  consistent with the `__dirname`-relative resolution used in `initProject.js`
  and `claude-md-lessons.js`). Both call sites are wrapped in try/catch: a
  lessons-injection failure is caught, logged to stderr, and never surfaces as a
  version-update failure. `src/commands/update.md` is NOT modified — it already
  invokes `update.js` via bash with `disable-model-invocation: true`; it carries
  no `model:` frontmatter (preserved: the slash-command-no-model-pin test guards
  this); the injection behavior is fully self-contained in `update.js`.

- **Managed-block, not overwrite.** The injector edits only between markers so a
  project's own CLAUDE.md content is never clobbered — the safe way for a tool to
  co-own a user file. Rationale: existing projects already have curated CLAUDE.md
  prose.
- **Single canonical source.** Lessons live once in
  `.ctoc/templates/operating-lessons.md`; the template embeds the block at
  build/init time and the injector reads it at runtime, so they can never diverge.
- **Content hash rather than version marker for idempotency.** A user who edits
  inside the current-version markers would silently drift from canonical if we
  keyed only on the version string. Decision: compute SHA-256 of the canonical
  block body at call time; if the existing block's content hash differs from the
  canonical hash, treat as out of date and replace. The `crypto` built-in is added
  to the module's imports for this purpose.
- **Version marker still drives cross-version upgrades.** The content-hash check
  applies within the same version (v1 → v1 drift). A version bump (v0 → v1)
  triggers replacement unconditionally, without needing a hash comparison.
- **generateContext intentionally separate, sync-guarded by test.** Three copies of
  the 16-step progression exist: `generateContext` in `SessionStart.js` (compact
  machine-readable banner), the CLAUDE.md template (human prose), and
  `operating-lessons.md` (canonical lesson source). Merging them would require
  runtime file I/O in `generateContext`, adding latency to every session start.
  Decision: keep the three copies separate; add a cross-reference comment in
  `generateContext` naming the canonical source; add a test in
  `claude-md-lessons.test.js` that asserts the step labels in the banner string
  match those extracted from `operating-lessons.md`, so a future edit to one
  immediately fails the other.
- **Fenced-code-block stripping via line-state parser, not regex look-behind.**
  A naive regex could be foiled by nested backticks or language-tagged fences.
  Decision: scan the file line-by-line tracking open/closed fence state before
  building the marker search range; this is O(n) and free of regex complexity.
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
- **`plans/canvas` confirmed in scope for SessionStart.** `PLAN_DIRS` in
  `init-project.js` line 126 includes `plans/canvas`; the corrected template
  must list it; and `SessionStart.js`'s `directories` list (lines 76–90) currently
  omits it — that omission is a bug this plan fixes. The `initProject()` constant
  is not touched.

- **`update.js` made testable via `require.main` guard + named injection helper +
  exports (residual ambiguity surfaced by AC12).** AC12 requires driving "the real
  `update.js` lessons-injection path, not a stub" while "the version-fetch network
  calls are stubbed." Today `update.js` calls `update()` unconditionally at module
  load (line 181), so `require('../commands/update')` would execute the full network
  update at require time. Decision: (1) extract the injection into a named local
  helper `refreshLocalLessons()` that resolves
  `claudeMdPath = path.join(process.cwd(), 'CLAUDE.md')` and
  `ctocRoot = path.resolve(__dirname, '..', '..')`, wraps `ensureLessonsBlock` in
  try/catch, and is invoked at BOTH terminal points; (2) guard the auto-invocation
  with `if (require.main === module) { update(); }`; (3)
  `module.exports = { update, refreshLocalLessons, getCurrentVersion, getLatestVersion }`.
  The AC12 test then requires the real module (no network — auto-run is guarded),
  `process.chdir`s into a temp project, and calls the genuine `refreshLocalLessons()`,
  exercising the real injection path + real `ensureLessonsBlock` + real
  `operating-lessons.md`, with network avoided by construction rather than by mocking
  GitHub. This refines (does not contradict) the earlier "two terminal points"
  decision: the try/catch lives once inside the shared helper instead of being
  duplicated inline at each point.

- **`ctocRoot` is an explicit fallback; `__dirname` is primary (reconciles the
  signature `ensureLessonsBlock(claudeMdPath, ctocRoot)` with the `__dirname`
  resolution decision).** The canonical `operating-lessons.md` is resolved primarily
  via `path.join(__dirname, '..', '..', '.ctoc', 'templates', 'operating-lessons.md')`
  (the installed CTOC version — honors the existing decision). The `ctocRoot`
  argument, passed by all three callers, is used only as a documented fallback
  (`path.join(ctocRoot, '.ctoc', 'templates', 'operating-lessons.md')`) when the
  `__dirname`-relative path does not exist. If neither resolves, the function
  fails open with a stderr warning naming BOTH attempted paths.

- **Atomic write: `os.tmpdir()` primary, same-directory `EXDEV` fallback.** The temp
  file is `path.join(os.tmpdir(), unique + '.claude.md')` then
  `fs.renameSync(tmp, target)` (per design and AC9). A cross-device rename
  (`EXDEV` — e.g. Linux CI where `/tmp` is `tmpfs`) is caught and retried once with a
  temp file in the SAME directory as the target
  (`path.join(path.dirname(target), '.' + base + '.ctoc-tmp-' + rand)`), guaranteeing
  a same-filesystem atomic rename everywhere. The AC9 "renameSync called exactly once
  with `(tempPath, target)`" assertion is kept deterministic by creating the AC9 temp
  project UNDER `os.tmpdir()` (`fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-'))`) so
  target and temp share one volume and the EXDEV branch never fires in the test.

- **AC9 win32 verification via `path.win32` monkeypatch, not bare `path.sep`
  reassignment.** Reassigning `path.sep` does NOT change `path.join`/`path.resolve`
  behavior on a POSIX host (they bind to the platform implementation). Decision: the
  AC9 test monkeypatches `path.join`, `path.resolve`, `path.dirname`, `path.basename`,
  and `path.sep` to their `path.win32` equivalents (and sets `process.platform` to
  `'win32'`) before requiring `claude-md-lessons.js` fresh (cache-busted via
  `delete require.cache[...]`), then asserts the temp path captured by the
  `fs.renameSync` spy contains the win32 separator `'\\'`, proving the module routed
  path construction through the (win32) `path` API rather than hardcoding `'/'`.

- **Template carries an EMPTY placeholder managed block for placement; lessons are
  injected, never duplicated.** To honor single-canonical-source (the 12 lessons live
  only in `operating-lessons.md`) while controlling WHERE the block lands in the
  generated CLAUDE.md, the corrected template includes an empty managed block (START
  marker + managed-notice line + END marker, no lesson body) inside a new
  `## CTOC Operating Lessons` section. `initProject()`'s wired `ensureLessonsBlock`
  call then fills that block in place from `operating-lessons.md` (empty-body hash ≠
  canonical hash → replace). No literal copy of the 12 lessons exists in the template,
  so they can never drift from canonical.

- **Missing target CLAUDE.md is created with the block (SessionStart/update
  robustness).** If `claudeMdPath` does not exist when `ensureLessonsBlock` runs (e.g.
  `/ctoc:update` in a project whose CLAUDE.md was deleted), the function writes a new
  CLAUDE.md containing only the canonical block (atomic, returns `true`).
  Non-destructive; keeps all three triggers self-healing.

- **Malformed managed block (start without end, or end without start) fails open.**
  If the line-state parser finds an opening marker with no matching close outside
  fences (or vice-versa), the function does NOT attempt a splice (which could clobber
  user prose); it writes a non-empty stderr warning naming the target and returns
  `false`.

- **AC1 is an integration test over the real `initProject()`.** AC1's Given/When is
  "When `initProject()` runs (non-dry-run)", so the test calls the real
  `initProject(tempDir)` and asserts on the resulting on-disk CLAUDE.md — exercising
  both template correctness (drift fixed) AND the wired `ensureLessonsBlock` injection
  that fills the placeholder block. The Test-Plan table's looser phrasing "render
  template to temp dir" is satisfied by `initProject` rendering the template
  internally.

- **`SessionStart.js` exports `main` + `generateContext` behind a `require.main`
  guard (residual ambiguity surfaced by AC6/AC7 + the sync-guard).** To drive
  `main()` in-process (AC6/AC7) and to read the step-banner directly (the
  `generateContext`↔`operating-lessons.md` sync-guard), the bare `main().catch(...)`
  is wrapped in `if (require.main === module) { … }` and the module exports
  `{ main, generateContext }`. Production behavior is unchanged (the hook is invoked
  as the node entrypoint, so `require.main === module` is true and `main()` runs as
  before). This is a test seam only; no `model:` frontmatter is involved, and
  `SessionStart.js` is already in this plan's `files:` list.

- **SessionStart self-repo guard (surfaced at execution Step 10/14).** §6.5 Change 2
  is wired exactly as specified, with ONE added safety guard: step 5b skips injection
  when `path.resolve(projectPath) === path.resolve(__dirname, '..', '..')` — i.e. when
  the hook is running against CTOC's OWN source repo. Rationale: (1) CTOC's own
  hand-maintained `CLAUDE.md` must never be auto-edited by its own dev hook (a tool
  must not silently rewrite its source-of-truth onboarding file); (2) `tests/session-start-hook.test.js`
  spawns `node SessionStart.js` with `cwd = repo root`, so without the guard step 5b
  would append the block to the real repo `CLAUDE.md` and dirty the tree on every test
  run. In a consumer project the hook runs from the installed plugin, so the plugin
  root (`__dirname/../..`) differs from `projectPath` and injection proceeds normally
  (verified by AC6/AC7 against a temp project). No AC is affected; the repo `CLAUDE.md`
  is provably untouched by the suite.

- **init fills-on-create / refreshes-existing, but does NOT first-inject a blockless
  pre-existing `CLAUDE.md` (refines §6.4).** §6.4's data-flow note ("appends if a
  pre-existing project's CLAUDE.md has no block") conflicts with the frozen
  `tests/init-project.test.js` assertion that an existing user `CLAUDE.md` is preserved
  byte-for-byte without `--force` (and that test file is outside this plan's editable
  `files:` set). Reconciliation: at init, `ensureLessonsBlock` runs only when the
  `CLAUDE.md` was just created from the template (placeholder fill — AC1) OR already
  contains a managed block (refresh). A pre-existing user `CLAUDE.md` with no block is
  left untouched at init; its first injection is owned by `SessionStart` on next session
  open — which is the documented every-open trigger for existing projects (Decision A).
  All three triggers remain (init for new, SessionStart for existing/every-open, update
  for explicit); no acceptance criterion is affected (AC1/AC2 cover new-init; AC6 covers
  existing-via-SessionStart; AC12 covers update). This is the more conservative behavior
  — init never silently rewrites a developer's hand-authored CLAUDE.md.

---

## Implementation Details

> Iron Loop Step 5 (PLAN) + Step 6 (DESIGN). Produced by implementation-planner.
> This blueprint feeds Step 7 (SPEC) → Gate 2. It does NOT contain execution steps
> 7–15 (those are generated by the integrator at Step 7).

### 5. PLAN

#### 5.1 Architecture Decision (ADR brief)

- **Context.** The generated project `CLAUDE.md` is the most-read onboarding surface
  in every CTOC project, yet `.ctoc/templates/CLAUDE.md.template` has drifted (15
  steps, wrong step labels, nonexistent plan dirs, removed `ctoc plan …` CLI, missing
  Gate 0) and carries none of the distilled operating lessons. `initProject()` writes
  CLAUDE.md only when absent (line 575), so existing projects never receive
  corrections; no mechanism propagates lessons to already-initialized projects; and
  `/ctoc:update` refreshes plugin code but not the local CLAUDE.md.
- **Decision.** Establish ONE canonical lessons source
  (`.ctoc/templates/operating-lessons.md`) and an idempotent, fail-open, atomic,
  content-hash-keyed injector (`src/lib/claude-md-lessons.js → ensureLessonsBlock`).
  Wire the injector into three independent triggers — `initProject()` (creation),
  `SessionStart.js` (every session open, automatic), `/ctoc:update` (explicit). Correct
  the template to 16 steps / 4 gates (incl. Gate 0) / real plan dirs / 3 slash
  commands, and have the template carry only an EMPTY placeholder managed block
  (no lesson duplication) that the injector fills.
- **Consequences.** (+) Corrections + lessons reach both new and existing projects
  automatically; (+) lesson text exists exactly once (no drift); (+) session start is
  never blocked (double fail-open: the injector never throws, and the hook wraps it in
  try/catch). (−) Two extra synchronous file reads at session start — but the
  steady-state no-op (current block present, hash matches) reads two files and exits
  without writing, so the fast path is also the common path. (−) `generateContext`
  keeps a third copy of the step-banner (machine-readable), sync-guarded by a test
  rather than merged into runtime file I/O, to avoid adding latency to every session
  start.

#### 5.2 Dependency Graph

```
.ctoc/templates/operating-lessons.md        (canonical DATA; no code deps)
        │  read at runtime (resolved via __dirname, ctocRoot fallback)
        ▼
src/lib/claude-md-lessons.js                 (deps: node built-ins ONLY — fs, path, os, crypto)
   ▲              ▲                    ▲
   │ require      │ require            │ require
src/lib/        src/hooks/          src/commands/
init-project.js SessionStart.js     update.js
   │ reads (renderTemplate)
   ▼
.ctoc/templates/CLAUDE.md.template           (DATA; corrected facts + empty placeholder block)

tests/claude-md-lessons.test.js  ── drives ──▶  claude-md-lessons.js (unit),
                                                initProject() (AC1/AC2 integration),
                                                SessionStart.main() (AC6/AC7),
                                                update.refreshLocalLessons() (AC12),
                                                operating-lessons.md + CLAUDE.md.template (sync-guard)
```

- **No cycles.** `claude-md-lessons.js` imports only Node built-ins (matches the plan's
  Dependencies section). The three callers depend on it one-directionally. Layering is
  respected: `lib` → built-ins; `hooks`/`commands` → `lib` (inward).
- **No orphans.** Every created file is required or driven by at least one other node.

#### 5.3 Implementation Order

Build/reference order (dependency order; at execution, Step 8 TEST authors the test
file first per TDD, then implementation fills in this order):

1. `.ctoc/templates/operating-lessons.md` **(CREATE)** — canonical data; no code deps.
2. `src/lib/claude-md-lessons.js` **(CREATE)** — reads #1; Node built-ins only.
3. `.ctoc/templates/CLAUDE.md.template` **(MODIFY)** — corrected facts + empty
   placeholder managed block.
4. `src/lib/init-project.js` **(MODIFY)** — `require`s #2, renders #3, one wired call.
5. `src/hooks/SessionStart.js` **(MODIFY)** — `require`s #2; add `plans/canvas`;
   generateContext cross-ref comment.
6. `src/commands/update.js` **(MODIFY)** — `require`s #2; helper + two points +
   `require.main` guard + exports.
7. `tests/claude-md-lessons.test.js` **(CREATE)** — drives all of the above (12 AC
   scenarios + NFRs + sync-guard).

### 6. DESIGN — File Specifications

#### 6.1 File: `.ctoc/templates/operating-lessons.md`

**Action:** CREATE
**Purpose:** The single canonical, versioned source of the CTOC-managed operating
lessons block. `ensureLessonsBlock` reads this file and writes the START..END region
(inclusive) verbatim into each project's CLAUDE.md.
**Change Type:** new data file (no code).

**Version token:** `v1` (the `N` in `<!-- CTOC:LESSONS vN START -->`). A future
content change that is meant to force replacement on every project bumps this to `v2`;
in-version edits are handled automatically by the content-hash check.

**Marker contract (canonical constants — must match `claude-md-lessons.js` exactly):**
- START: `<!-- CTOC:LESSONS v1 START -->`
- managed-notice (first in-block line): `<!-- Content between these markers is CTOC-managed. Do not edit manually. -->`
- END: `<!-- CTOC:LESSONS v1 END -->`

**Exact file content** (everything from the START marker through the END marker,
inclusive, is the block written into CLAUDE.md; a one-line file header above the START
marker is allowed and is ignored by the injector, which slices START..END):

```markdown
<!-- Canonical CTOC operating-lessons source. Edit the lessons HERE; ensureLessonsBlock propagates them. -->

<!-- CTOC:LESSONS v1 START -->
<!-- Content between these markers is CTOC-managed. Do not edit manually. -->

## CTOC Operating Lessons

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

**Methodology reference:** CTOC runs a **16-step** Iron Loop across **4 human gates**
(Gate 0 vision→functional, Gate 1 functional→implementation, Gate 2
implementation→todo, Gate 3 review→done). Key step labels: **8:TEST** (TDD), **10:IMPLEMENT**
(one step, files as sub-items), **14:VERIFY** (quality gate: lint, typecheck, all
tests, coverage ≥ 80%, 0 skipped, 0 flaky). CTOC ships exactly **3 slash commands** —
`/ctoc:menu`, `/ctoc:push`, `/ctoc:update` — and is **always installed from the
marketplace**, never from a local path.

<!-- CTOC:LESSONS v1 END -->
```

**Notes for the implementer (Step 10):**
- The 12 lessons are reproduced **verbatim** from `## The Distilled Operating Lessons`
  above; do not reword.
- The methodology-reference paragraph intentionally contains the literal tokens
  `16-step`, `8:TEST`, `10:IMPLEMENT`, `14:VERIFY`, `Gate 0`, `/ctoc:menu`,
  `/ctoc:push`, `/ctoc:update`. The `generateContext`↔`operating-lessons.md`
  sync-guard test (§6.7) asserts these tokens co-occur in both surfaces.
- File EOL: author with LF; the injector normalizes anyway.

#### 6.2 File: `.ctoc/templates/CLAUDE.md.template`

**Action:** MODIFY
**Purpose:** The template rendered by `initProject()` into a new project's CLAUDE.md.
Correct every drifted fact and add an empty placeholder managed block for placement.
**Change Type:** modify-existing (string corrections + one new section).

**Exact correction list (drift → truth), keyed to current line numbers:**

| # | Where (current line) | Current (WRONG) | Replace with (CORRECT) |
|---|---|---|---|
| C1 | L39 | `## Iron Loop (15 Steps)` | `## Iron Loop (16 Steps)` |
| C2 | L41 | `Every feature follows 15 steps.` | `Every feature follows 16 steps.` |
| C3 | L43–55 (fenced diagram) | 3 phases (Steps 1-3 / 4-6 / 7-15), Gates 1-3 only | New 4-phase diagram **with Gate 0** (see block below) |
| C4 | L57 | `**Step 7 is TDD** -- write tests FIRST, not "identify coverage".` | `**Step 8 is TEST (TDD)** -- write tests FIRST, not "identify coverage".` |
| C5 | L58 | `**Step 9 is ONE step** -- multiple files are sub-items, not separate IMPLEMENT steps.` | `**Step 10 is ONE step (IMPLEMENT)** -- multiple files are sub-items, not separate IMPLEMENT steps.` |
| C6 | L59 | `**Step 13 VERIFY is the quality gate** -- lint, typecheck, ALL tests, coverage >= 80%, 0 skipped, 0 flaky.` | `**Step 14 VERIFY is the quality gate** -- lint, typecheck, ALL tests, coverage >= 80%, 0 skipped, 0 flaky.` |
| C7 | L71–81 (fenced plan tree) | `functional/draft/`, `functional/approved/`, `implementation/draft/`, `implementation/approved/`, `todo/`, `in_progress/`, `review/`, `done/` | Real dirs (see block below) |
| C8 | L83–88 (command table) | `ctoc`, `ctoc plan new "title"`, `ctoc plan status`, `ctoc plan approve <id>` | 3 slash commands (see block below) |

**C3 — replacement phase/gate diagram (L43–55):**

```
Phase 0: IDEATION (Step 1)                       [vision-advisor, product-owner]
  IDEATE
  Human Gate 0: User approves vision (vision → functional)

Phase 1: FUNCTIONAL PLANNING (Steps 2-4)         [product-owner, functional-reviewer]
  ASSESS -> ALIGN -> CAPTURE
  Human Gate 1: User approves functional plan (functional → implementation)

Phase 2: IMPLEMENTATION PLANNING (Steps 5-7)     [implementation-planner]
  PLAN -> DESIGN -> SPEC
  Human Gate 2: User approves technical approach (implementation → todo)

Phase 3: IMPLEMENTATION (Steps 8-16)             [Autonomous]
  TEST -> PREPARE -> IMPLEMENT -> REVIEW -> OPTIMIZE -> SECURE -> VERIFY -> DOCUMENT -> FINAL-REVIEW
  Human Gate 3: User approves commit/push (review → done)
```

**C7 — replacement plan tree (L71–81):**

```
plans/
  vision/          Raw ideas / vision drafts (Gate 0)
  canvas/          Business-model / lean canvas context
  functional/      Business-approved features (Gate 1)
  implementation/  Technical design + blueprint (Gate 2)
  todo/            Ready for execution (Iron Loop injected)
  in-progress/     Currently being worked on
  review/          Awaiting human review (Gate 3)
  done/            Shipped
```
> The canonical token used in tests is the brace form
> `plans/{vision,canvas,functional,implementation,todo,in-progress,review,done}`;
> include that exact compound string once in the section prose so AC1's directory
> assertion matches.

**C8 — replacement command table (L83–88):**

```
| Command | Action |
|---------|--------|
| /ctoc:menu | Dashboard — create/approve/advance plans, releases, all features |
| /ctoc:push | Run quality checks and push (when auto-push is disabled) |
| /ctoc:update | Update CTOC to the latest version + refresh this file's lessons block |
```
> CTOC ships exactly these three slash commands; everything else is reached through
> the menu. Remove every `ctoc plan …` CLI reference.

**New section — empty placeholder managed block (insert after the Iron Loop section,
before `## Plan Management`):**

```markdown
---

<!-- CTOC:LESSONS v1 START -->
<!-- Content between these markers is CTOC-managed. Do not edit manually. -->
<!-- CTOC:LESSONS v1 END -->
```

- The placeholder has **no lesson body** (single-canonical-source: lessons live only in
  `operating-lessons.md`). `initProject()`'s wired `ensureLessonsBlock` call fills it
  in place (empty-body hash ≠ canonical hash → replace), controlling placement without
  duplicating lesson text into the template.
- `{{...}}` placeholders elsewhere are untouched; the block contains no `{{...}}`
  tokens so `renderTemplate` passes it through verbatim.

**Falsifiable post-correction assertions (template text, see §6.7):**
- ABSENT: `15 Steps`, `Step 7 is TDD`, `Step 9 is ONE step`, `Step 13 VERIFY`,
  `functional/draft`, `functional/approved`, `implementation/draft`,
  `implementation/approved`, `in_progress/`, `ctoc plan new`, `ctoc plan approve`,
  `ctoc plan status`.
- PRESENT: `16 Steps`/`16 steps`, `Step 8`, `Step 10`, `Step 14`, `Gate 0`,
  `/ctoc:menu`, `/ctoc:push`, `/ctoc:update`, `plans/in-progress`, `plans/canvas`.

#### 6.3 File: `src/lib/claude-md-lessons.js`

**Action:** CREATE
**Purpose:** Idempotent, fail-open, atomic, cross-platform injector of the
CTOC-managed operating-lessons block into a project's CLAUDE.md.
**Change Type:** new module.

**Dependencies (imports — Node built-ins ONLY; matches plan §Dependencies):**
```js
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
```

**Module constants (exported for the test to reuse — single source of marker truth):**
```js
const LESSONS_VERSION = 'v1';
const START_MARKER    = '<!-- CTOC:LESSONS v1 START -->';
const END_MARKER      = '<!-- CTOC:LESSONS v1 END -->';
const MANAGED_NOTICE  = '<!-- Content between these markers is CTOC-managed. Do not edit manually. -->';
// Version-agnostic line matchers for v0→v1 (any version) upgrade detection:
const ANY_START_RE = /^\s*<!--\s*CTOC:LESSONS\s+v(\d+)\s+START\s*-->\s*$/;
const ANY_END_RE   = /^\s*<!--\s*CTOC:LESSONS\s+v(\d+)\s+END\s*-->\s*$/;
const FENCE_RE     = /^\s*(```+|~~~+)/;   // opening/closing code-fence line
```

**Public API:**
```js
/**
 * Ensure the CTOC-managed operating-lessons block is present and current in a CLAUDE.md.
 * Idempotent, fail-open, atomic, cross-platform. NEVER throws.
 *
 * @param {string} claudeMdPath - Absolute path to the target project's CLAUDE.md.
 * @param {string} [ctocRoot]   - Absolute path to the installed CTOC plugin root.
 *                                Used ONLY as a fallback to locate operating-lessons.md;
 *                                primary resolution is __dirname-relative.
 * @returns {boolean} true if the file was modified (inserted / upgraded / refreshed / created);
 *                    false if no change was needed OR any error was caught (fail-open).
 */
function ensureLessonsBlock(claudeMdPath, ctocRoot) { ... }

module.exports = {
  ensureLessonsBlock,
  // exported for tests + the sync-guard:
  LESSONS_VERSION, START_MARKER, END_MARKER, MANAGED_NOTICE,
  resolveLessonsSource, findManagedBlock, normalizeEol, computeHash
};
```

**Helper signatures:**
```js
// Resolve the canonical source. Primary: __dirname-relative (installed CTOC). Fallback: ctocRoot.
function resolveLessonsSource(ctocRoot) -> string|null
//   primary  = path.join(__dirname, '..', '..', '.ctoc', 'templates', 'operating-lessons.md')
//   fallback = ctocRoot ? path.join(ctocRoot, '.ctoc', 'templates', 'operating-lessons.md') : null
//   returns first that exists, else null.

// Split CRLF/LF; report the EOL to restore on write.
function normalizeEol(text) -> { normalized: string, eol: '\n' | '\r\n' }
//   eol = text.includes('\r\n') ? '\r\n' : '\n'; normalized = text.replace(/\r\n/g, '\n').

// O(n) line-state parser, fenced-code-block aware. Finds FIRST complete block OUTSIDE fences.
function findManagedBlock(lines /* string[], already LF-split */)
//   -> { startIdx, endIdx, version } | null | { malformed: true }
//   - iterate lines; toggle inFence when a line matches FENCE_RE (track the fence token
//     so ``` is not closed by ~~~);
//   - while NOT inFence: first line matching ANY_START_RE sets startIdx (+version);
//     after a start, first line matching ANY_END_RE sets endIdx → return {startIdx,endIdx,version};
//   - start-without-end OR end-without-start (outside fences) → return { malformed: true };
//   - none found → return null.

// SHA-256 hex of the canonical block BODY (text strictly between markers, LF-normalized).
function computeHash(bodyLF) -> string   // crypto.createHash('sha256').update(bodyLF,'utf8').digest('hex')

// Atomic write: os.tmpdir() primary; same-dir retry on EXDEV. NO direct writeFileSync to target.
function atomicWrite(targetPath, contentWithEol) -> void
function restoreEol(normLF, eol) -> string   // eol==='\r\n' ? normLF.replace(/\n/g,'\r\n') : normLF
```

**`ensureLessonsBlock` algorithm (single outer try/catch → fail-open):**
```
try {
  1. src = resolveLessonsSource(ctocRoot)
     if (src === null) {
       process.stderr.write('[CTOC] ensureLessonsBlock: operating-lessons.md not found at '
         + primaryPath + ' (fallback: ' + fallbackPath + '); CLAUDE.md left unchanged\n');
       return false;                                   // AC8 fail-open, stderr non-empty, names path
     }
  2. srcLines  = normalizeEol(fs.readFileSync(src,'utf8')).normalized.split('\n')
     srcBlock  = findManagedBlock(srcLines)
     if (!srcBlock || srcBlock.malformed) {
       process.stderr.write('[CTOC] ensureLessonsBlock: canonical source ' + src
         + ' is missing well-formed v1 markers; CLAUDE.md left unchanged\n');
       return false;                                   // packaging error → fail-open
     }
     canonicalBlock = srcLines.slice(srcBlock.startIdx, srcBlock.endIdx + 1).join('\n')   // START..END inclusive
     canonicalBody  = srcLines.slice(srcBlock.startIdx + 1, srcBlock.endIdx).join('\n')   // body for hashing
     canonicalHash  = computeHash(canonicalBody)

  3. if (!fs.existsSync(claudeMdPath)) {               // create-if-missing (documented choice)
       atomicWrite(claudeMdPath, canonicalBlock + '\n')
       return true
     }

  4. raw = fs.readFileSync(claudeMdPath,'utf8')
     { normalized: tgtNorm, eol } = normalizeEol(raw)
     tgtLines = tgtNorm.split('\n')
     blk = findManagedBlock(tgtLines)                  // fenced-aware: markers inside ``` are skipped (AC11)

  5. if (blk && blk.malformed) {
       process.stderr.write('[CTOC] ensureLessonsBlock: malformed managed block in '
         + claudeMdPath + ' (start/end mismatch); leaving file unchanged\n')
       return false                                    // never splice a malformed region
     }

  6. if (!blk) {                                       // no real block → append once (AC11 path)
       newNorm = tgtNorm.replace(/\n*$/, '') + '\n\n' + canonicalBlock + '\n'
       if (newNorm === tgtNorm) return false
       atomicWrite(claudeMdPath, restoreEol(newNorm, eol))
       return true
     }

  7. // block exists
     existingBody = tgtLines.slice(blk.startIdx + 1, blk.endIdx).join('\n')
     if (blk.version === LESSONS_VERSION && computeHash(existingBody) === canonicalHash) {
       return false                                    // AC3/AC7/AC10 no-op: version + hash match
     }
     // replace [startIdx..endIdx] in place (AC5 upgrade, in-version drift, empty-placeholder fill)
     newLines = [ ...tgtLines.slice(0, blk.startIdx),
                  ...canonicalBlock.split('\n'),
                  ...tgtLines.slice(blk.endIdx + 1) ]
     newNorm = newLines.join('\n')
     if (newNorm === tgtNorm) return false
     atomicWrite(claudeMdPath, restoreEol(newNorm, eol))
     return true
}
catch (err) {
  process.stderr.write('[CTOC] ensureLessonsBlock failed (' + err.message
    + '); CLAUDE.md ' + claudeMdPath + ' left unchanged\n')
  return false                                         // fail-open NFR: never throw
}
```

**`atomicWrite` detail (atomicity NFR + AC9):**
```
const base = path.basename(targetPath);
const tmp  = path.join(os.tmpdir(),
  'ctoc-lessons-' + process.pid + '-' + Date.now() + '-' + crypto.randomBytes(6).toString('hex') + '.claude.md');
fs.writeFileSync(tmp, contentWithEol, 'utf8');
try {
  fs.renameSync(tmp, targetPath);                      // atomic on same volume — AC9 asserts exactly-once
} catch (e) {
  if (e.code !== 'EXDEV') { try { fs.unlinkSync(tmp); } catch (_) {} throw e; }
  // cross-device: retry with a same-directory temp so rename stays atomic
  const sameDirTmp = path.join(path.dirname(targetPath), '.' + base + '.ctoc-tmp-' + crypto.randomBytes(6).toString('hex'));
  fs.writeFileSync(sameDirTmp, contentWithEol, 'utf8');
  fs.renameSync(sameDirTmp, targetPath);
  try { fs.unlinkSync(tmp); } catch (_) {}
}
```

**Idempotency / CRLF / fenced / atomic / fail-open — why the design holds:**
- **Idempotency (content hash, AC3):** the no-change decision (step 7) compares both
  the parsed version AND `computeHash(existingBody)` against `canonicalHash`. Editing
  inside current-version markers changes the hash → next call returns `true` and
  replaces. Keyed on body hash, not the version string alone.
- **CRLF (AC10):** `normalizeEol` strips `\r\n`→`\n` before hashing and before marker
  matching, so a CRLF-encoded current block hashes identical to the LF canonical body →
  step 7 returns `false`, nothing is written, original CRLF preserved (file untouched).
  When a write IS needed, `restoreEol` re-applies the file's original EOL.
- **Fenced markers (AC11):** `findManagedBlock` ignores marker lines while `inFence`,
  so a fixture whose ONLY markers are inside ``` returns `null` → step 6 appends exactly
  one real block at EOF; fenced content is sliced-around, never modified.
- **Atomic (AC9):** all writes go through `atomicWrite` (temp + `renameSync`); never a
  direct `writeFileSync(target, …)`. EXDEV fallback keeps atomicity on cross-device FS.
- **Fail-open (AC8 + NFR):** every exit on error writes a non-empty stderr line naming
  the relevant path and returns `false`; the outer try/catch guarantees no throw escapes.
- **Cross-platform:** only `path.join`/`path.resolve`/`path.dirname`/`path.basename`,
  `os.tmpdir()`, and synchronous `fs`; zero hardcoded `'/'`; zero child processes.
- **No global mutation:** the function only ever touches `claudeMdPath` (and temp files);
  it never references `os.homedir()` or `~/.claude/CLAUDE.md`.

#### 6.4 File: `src/lib/init-project.js`

**Action:** MODIFY
**Purpose:** After the existing CLAUDE.md write/skip decision, inject the managed
lessons block so BOTH new (just-written) and existing (skipped) projects receive it.
**Change Type:** modify-existing (one new call site; no signature change).

**Changes:**
- **Add** a single wired call immediately AFTER the CLAUDE.md write/skip block (after
  the closing `}` of the `else { skipped.push('CLAUDE.md (already exists, …)') }` at
  **line 598**) and BEFORE `// 4. Generate IRON_LOOP.md` (**line 600**).
- **Import:** none at top — `require('./claude-md-lessons')` is required lazily at the
  call site (consistent with the lazy `require('../lib/iron-loop-enforcer')` pattern in
  SessionStart.js, and so a missing module can never break init at load time).
- **No change** to `PLAN_DIRS` (line 124–133 already includes `plans/canvas` — confirmed,
  out of scope) and **no change** to `module.exports`.

**Exact insertion (between line 598 and line 600):**
```js
  // 3b. Ensure CTOC-managed operating-lessons block (both new and existing CLAUDE.md).
  //     Single canonical source: .ctoc/templates/operating-lessons.md (resolved via __dirname).
  if (!dryRun) {
    try {
      const { ensureLessonsBlock } = require('./claude-md-lessons');
      const ctocRoot = path.resolve(__dirname, '..', '..');   // same base as templatePath (line 570)
      if (ensureLessonsBlock(claudeMdPath, ctocRoot)) {
        created.push('CLAUDE.md (operating-lessons block)');
      }
    } catch (err) {
      // Fail-open: a lessons failure must never break project init.
      skipped.push('CLAUDE.md operating-lessons block (' + err.message + ')');
    }
  }
```

**Data flow:** `initProject(projectDir)` renders the corrected template → writes (or
skips) `CLAUDE.md` → `ensureLessonsBlock(claudeMdPath, ctocRoot)` reads
`operating-lessons.md`, finds the empty placeholder block in the freshly-rendered
CLAUDE.md (or appends if a pre-existing project's CLAUDE.md has no block) → fills/refreshes
it atomically → returns whether it changed.

**Error handling:** double fail-open — `ensureLessonsBlock` never throws, and this site
wraps it in try/catch so even a programming error in the injector cannot break init.
`dryRun` is honored (no write).

#### 6.5 File: `src/hooks/SessionStart.js`

**Action:** MODIFY
**Purpose:** (a) add `plans/canvas` to the `directories` list; (b) inject/refresh the
lessons block on every session open, fail-open; (c) add a cross-reference comment in
`generateContext` naming `operating-lessons.md` as the canonical source (NO runtime I/O
added to `generateContext`).
**Change Type:** modify-existing (one list entry, one fail-open call, one comment).

**Change 1 — add `plans/canvas` to `directories` (after `'plans/vision'`, line 78):**
```js
  const directories = [
    // Plans workflow (matches init-project.js PLAN_DIRS)
    'plans/vision',
    'plans/canvas',          // <-- ADDED: was missing; PLAN_DIRS already has it
    'plans/functional',
    'plans/implementation',
    'plans/todo',
    'plans/in-progress',
    'plans/review',
    'plans/done',
    // Learnings system
    'learnings/pending',
    'learnings/approved',
    'learnings/applied'
  ];
```

**Change 2 — fail-open injection, AFTER the step-5 dir-ensure loop (ends line 96) and
BEFORE step 6 update check (line 98). HIGHEST-STAKES placement:**
```js
  // 5b. Ensure CTOC-managed operating-lessons block in CLAUDE.md (fail-open).
  //     MUST NOT throw, block, or perceptibly slow session start. Double-guarded:
  //     ensureLessonsBlock itself never throws; this try/catch is a belt-and-braces backstop.
  try {
    const { ensureLessonsBlock } = require('../lib/claude-md-lessons');
    const claudeMdPath = path.join(projectPath, 'CLAUDE.md');
    const ctocRoot = path.resolve(__dirname, '..', '..');
    ensureLessonsBlock(claudeMdPath, ctocRoot);
  } catch (err) {
    console.error('[CTOC] Lessons block injection skipped:', err.message);
  }
```
- Placement rationale: after directories exist (so a same-dir EXDEV temp can be written),
  before the update check and the `generateContext`/`console.log` stdout emission, so the
  hook's stdout contract is unaffected. Steady-state (block current) = two file reads +
  exit, no write → no perceptible latency (Performance NFR: validated by design, no CI
  timing assertions).
- `return false` from the injector is ignored here; SessionStart never branches on it.

**Change 3 — cross-reference comment in `generateContext` (above the
`## Iron Loop (16 Steps)` banner, ~line 137). Do NOT convert to runtime file I/O:**
```js
  // NOTE: This 16-step banner is the compact, machine-readable copy. The CANONICAL
  // operating-lessons + methodology reference live in .ctoc/templates/operating-lessons.md.
  // Kept as a separate inline copy on purpose (no runtime file I/O on the hot session-start
  // path); the generateContext↔operating-lessons.md step labels are sync-guarded by
  // tests/claude-md-lessons.test.js (any divergence fails that test).
```
- The banner string itself is unchanged (it already reads "16 Steps" and lists
  `8:TEST`, `10:IMPLEMENT`, `14:VERIFY`); the sync-guard (§6.7) protects it going forward.

**Change 4 — export `main` + `generateContext` and guard the auto-run (replace the bare
`main().catch(...)` at lines 171–174), so AC6/AC7 can drive `main()` in-process and the
sync-guard can read `generateContext` directly:**
```js
if (require.main === module) {
  main().catch(err => {
    console.error('[CTOC] Session start error:', err.message);
    process.exit(1);
  });
}

module.exports = { main, generateContext };
```
- Behavior is preserved: Claude Code invokes the hook as the node entrypoint
  (`require.main === module` true → `main()` runs exactly as before). The export only
  adds an in-process test seam. NOT a `model:` change; SessionStart.js carries no
  frontmatter to alter. SessionStart.js is already in the plan's `files:` list.

**Error handling:** `main()` already ends with `.catch(...)` (now guarded); the inner
try/catch (Change 2) ensures the lessons step cannot reach it. No new throw paths
introduced.

#### 6.6 File: `src/commands/update.js`

**Action:** MODIFY
**Purpose:** Refresh/inject the local CLAUDE.md managed block whenever `/ctoc:update`
runs (both the "already up to date" branch and the post-upgrade branch), fail-open; and
make the injection path testable without network.
**Change Type:** modify-existing (one helper, two call sites, auto-run guard + exports).

**Change 1 — add the shared injection helper (place after the constants block, ~line 18,
before `function run(...)`):**
```js
const os = require('os'); // not strictly needed here; ensureLessonsBlock owns os usage

/**
 * Refresh the local project's CTOC-managed operating-lessons block. Fail-open:
 * a lessons-injection failure is logged to stderr and NEVER aborts the version update.
 */
function refreshLocalLessons() {
  try {
    const { ensureLessonsBlock } = require('../lib/claude-md-lessons');
    const claudeMdPath = path.join(process.cwd(), 'CLAUDE.md');
    const ctocRoot = path.resolve(__dirname, '..', '..');
    ensureLessonsBlock(claudeMdPath, ctocRoot);
  } catch (err) {
    console.error('[CTOC] Lessons block refresh skipped:', err.message);
  }
}
```
> `os` import is optional; include only if linting tolerates an unused import — otherwise
> omit it (ensureLessonsBlock owns all `os` usage). The implementer should OMIT it unless
> needed, to satisfy the no-warnings rule.

**Change 2 — injection point (a): "already up to date" branch, BEFORE the `return;`
(current lines 98–102):**
```js
  if (currentVersion === newVersion) {
    console.log('\n' + '─'.repeat(40));
    console.log(`✓ Already up to date (v${newVersion})`);
    refreshLocalLessons();          // <-- (a) refresh even when version unchanged
    return;
  }
```

**Change 3 — injection point (b): after step 7 (clean old versions, ends line 174),
BEFORE the final success `console.log` (current lines 176–177):**
```js
  // 7b. Refresh local CLAUDE.md operating-lessons block after a successful upgrade.
  refreshLocalLessons();            // <-- (b) refresh after version change

  console.log('\n' + '─'.repeat(40));
  console.log(`✓ Updated to CTOC v${newVersion}`);
  console.log('\nRestart Claude Code for changes to take effect.');
```
> Injection runs at the two TERMINAL SUCCESS points only. The `process.exit(1)` error
> exits (network failure ~L86, no-version ~L92) intentionally do NOT inject.

**Change 4 — make the module testable (replace the bare `update();` at line 181):**
```js
if (require.main === module) {
  update();
}

module.exports = { update, refreshLocalLessons, getCurrentVersion, getLatestVersion };
```
- This is REQUIRED for AC12: it lets the test `require('../commands/update')` without
  triggering the network update at load, then drive the genuine `refreshLocalLessons()`.
- No `model:` frontmatter is added anywhere; `src/commands/update.md` is NOT touched
  (guarded by `tests/slash-command-no-model-pin.test.js`).

**Data flow:** `/ctoc:update` → `update.md` (bash, `disable-model-invocation: true`) →
`node update.js` → `require.main === module` → `update()` → at each terminal success
point → `refreshLocalLessons()` → `ensureLessonsBlock(cwd/CLAUDE.md, installedRoot)`.

**Error handling:** `refreshLocalLessons` swallows + logs; a lessons failure can never
turn a successful `/ctoc:update` into a failure.

#### 6.7 File: `tests/claude-md-lessons.test.js`

**Action:** CREATE
**Framework:** Node built-in `node:test` (`describe`/`it`) + `node:assert/strict`
(matches `tests/init-project.test.js`, `tests/session-start-hook.test.js`,
`tests/update.test.js`).
**Coverage targets:** ≥ 80% line + branch on `src/lib/claude-md-lessons.js`; every
error/throw path exercised; every AC has ≥ 1 dedicated case.

**Shared fixtures / helpers:**
- `mkTmpProject()` → `fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-lessons-'))` (under
  `os.tmpdir()` so atomic temp + target share a volume — makes AC9's single-rename
  deterministic). Register cleanup with `t.after(() => fs.rmSync(dir,{recursive:true,force:true}))`.
- `REPO_ROOT = path.resolve(__dirname, '..')` — the real repo where
  `.ctoc/templates/operating-lessons.md` lives.
- `canonicalBlock()` — read `operating-lessons.md`, extract START..END via the module's
  exported `findManagedBlock`, return the inclusive block string.
- `captureStderr(fn)` — temporarily replace `process.stderr.write` with a collector,
  run `fn`, restore, return collected string.

| Test (`it`) | AC | Method / key assertions |
|---|---|---|
| `init_writes_16_step_iron_loop` | AC1 | Run real `initProject(tmp)` (non-dry-run); read `tmp/CLAUDE.md`; assert it contains compound token `16 steps`/`16-step` (NOT bare `16`), `Step 8`, `Step 10`, `Step 14`, `Gate 0`, the brace string `plans/{vision,canvas,…,done}`, and `/ctoc:menu` `/ctoc:push` `/ctoc:update`; assert exactly one `START_MARKER` + one `END_MARKER` with the 12-lesson body present between them (placeholder was filled by the wired injector) |
| `init_no_drift_strings` | AC2 | Run `initProject(tmp)`; assert each drift string from §6.2 ABSENT in `tmp/CLAUDE.md` |
| `ensure_lessons_idempotent` | AC3 | Seed `CLAUDE.md` with prose + current block; call `ensureLessonsBlock` twice; 1st may be `false`, 2nd MUST be `false`; bytes identical across the 2nd call; exactly one start + one end marker; then mutate the in-block body, call again → `true` (hash-keyed, not version-keyed) |
| `ensure_lessons_preserves_prose` | AC4 | Fixture: `"PRE\n\n"+block+"\n\nPOST"`; run (insert + upgrade variants); assert substring before `START_MARKER` === `"PRE\n\n"` and after `END_MARKER` === `"\n\nPOST"` byte-for-byte |
| `ensure_lessons_upgrades_old_version` | AC5 | Fixture with `v0 START`…`v0 END` + surrounding prose; call → `true`; assert `v1` markers present, NO `v0` markers, exactly one start/one end, prose unchanged |
| `session_start_injects_block` | AC6 | Build a temp project (stub `.ctoc/state/iron-loop.yaml`, a CLAUDE.md with NO block); `process.chdir(tmp)`; `delete require.cache` + `require('../src/hooks/SessionStart')` is not exported → instead require the module and call its exported `main` OR spawn `node src/hooks/SessionStart.js` with `cwd=tmp` (see note); assert on-disk CLAUDE.md has exactly one START + one END + the canonical body between |
| `session_start_noop_on_second_run` | AC7 | After AC6 state (block current), run the same path again; assert CLAUDE.md byte-for-byte unchanged |
| `ensure_lessons_fails_open_missing_source` | AC8 | Point resolution at a missing source (temporarily rename the repo `operating-lessons.md` OR run from a `ctocRoot` whose path lacks it AND with `__dirname` source absent — see note); `captureStderr`; call; assert returns `false`, stderr NON-EMPTY and includes the missing path substring, target CLAUDE.md unmodified |
| `ensure_lessons_cross_platform_atomic` | AC9 | Monkeypatch `path.{join,resolve,dirname,basename}` + `path.sep` to `path.win32`, set `process.platform='win32'`; spy `fs.renameSync`; cache-bust + require module fresh; run against a `mkTmpProject()` (under os.tmpdir); assert `renameSync` called exactly once, its 1st arg (temp) contains `'\\'`, 2nd arg === target; assert `child_process.execSync`/`spawn` spies never called; restore all patches in `finally` |
| `ensure_lessons_idempotent_crlf` | AC10 | Build current block + prose, `.replace(/\n/g,'\r\n')` → CRLF fixture; call → `false`; assert one start + one end marker; assert raw bytes still contain `\r\n` and NO `\n` that is not preceded by `\r` (EOL preserved); call again → still `false`, unchanged |
| `ensure_lessons_ignores_fenced_markers` | AC11 | Fixture: prose + a ```` ```text ```` fence whose body contains literal `START_MARKER`/`END_MARKER`, no real block; call → `true`; assert exactly one REAL block appended after the fence, the fenced region byte-for-byte preserved, total START_MARKER occurrences === 2 (one in fence + one real) but `findManagedBlock` located the real one OUTSIDE the fence |
| `update_injects_lessons_block` | AC12 | `delete require.cache` then `require('../src/commands/update')` (no network — auto-run guarded by `require.main`); `process.chdir(mkTmpProject())` with a CLAUDE.md lacking the block; call exported `refreshLocalLessons()`; assert CLAUDE.md gains exactly one START + one END + canonical body; call again → byte-for-byte unchanged; wrap a forced-throw variant (stub `ensureLessonsBlock` to throw) and assert `refreshLocalLessons()` does NOT throw and writes stderr; restore cwd in `finally` |
| `generatecontext_syncguard_step_labels` | Scope (triplication) | Capture the `generateContext` banner string (require SessionStart's exported `generateContext`, or read the source and extract the banner) AND read `operating-lessons.md`; assert the tokens `16`, `8:TEST`, `10:IMPLEMENT`, `14:VERIFY` appear in BOTH; a future edit to one that drops a label fails this test |

**Implementation notes for the test author (Step 8/10):**
- **AC6/AC7 driving `SessionStart.main()`:** `main()` is currently NOT exported. Two
  acceptable approaches — (i) add `module.exports = { main, generateContext };` plus an
  `if (require.main === module) main().catch(...)` guard to SessionStart.js (mirrors the
  update.js change; lets the test `require` + `await main()` with `process.chdir(tmp)`),
  OR (ii) drive it as a child process: `execFileSync(process.execPath,
  [path.join(REPO_ROOT,'src/hooks/SessionStart.js')], { cwd: tmp })`. **Recommended:
  approach (i)** — exporting `main`/`generateContext` also gives the sync-guard test
  direct access to `generateContext` and keeps the test in-process (faster, coverage
  counts). This is a residual choice; if approach (i) is taken, note that
  `src/hooks/SessionStart.js` is already in the plan's `files:` list, so the export +
  guard edit is in scope. **The `generateContext`-export is the cleanest enabler for the
  sync-guard.**
- **AC8 missing-source isolation:** prefer constructing a throwaway directory layout
  where neither the `__dirname` primary nor the supplied `ctocRoot` fallback contains
  `operating-lessons.md` (e.g. copy `claude-md-lessons.js` into a temp tree, or pass a
  `ctocRoot` pointing at an empty temp dir AND temporarily rename the repo source).
  Restore the repo source in `finally`. Do NOT leave the repo source renamed.
- **AC9 cache-bust:** `delete require.cache[require.resolve('../src/lib/claude-md-lessons')]`
  AFTER monkeypatching `path`, so the module re-binds `const path = require('path')` to
  the patched object; restore `path` methods and `process.platform` in `finally`.
- All assertions are meaningful (no early-return-without-assert, no empty catch). The
  fail-open tests assert BOTH the return value AND non-empty stderr (no-silent-failure
  rule).

#### 6.8 Acceptance-Criteria → Implementation → Test matrix

Every AC maps to a concrete implementation element AND ≥ 1 test.

| AC | Implementation element | Test (`it`) |
|----|------------------------|-------------|
| AC1 — init produces accurate CLAUDE.md | §6.2 template corrections C1–C8 + §6.4 wired `ensureLessonsBlock` fills placeholder | `init_writes_16_step_iron_loop` |
| AC2 — drift strings absent | §6.2 C1–C8 (removals) | `init_no_drift_strings` |
| AC3 — idempotent on current block (hash-keyed) | §6.3 step 7 (version + `computeHash` compare) | `ensure_lessons_idempotent` |
| AC4 — user prose preserved | §6.3 steps 6–7 splice only `[startIdx..endIdx]` | `ensure_lessons_preserves_prose` |
| AC5 — version upgrade in place | §6.3 `findManagedBlock` version-agnostic match + step 7 replace | `ensure_lessons_upgrades_old_version` |
| AC6 — SessionStart injects | §6.5 Change 2 (+ Change 4 export) | `session_start_injects_block` |
| AC7 — SessionStart no-op 2nd run | §6.3 step 7 false + §6.5 Change 2 | `session_start_noop_on_second_run` |
| AC8 — fail-open missing source | §6.3 step 1 stderr + return false | `ensure_lessons_fails_open_missing_source` |
| AC9 — cross-platform atomic | §6.3 `atomicWrite` (os.tmpdir + renameSync, EXDEV fallback); `path.*` only | `ensure_lessons_cross_platform_atomic` |
| AC10 — CRLF no duplicate markers | §6.3 `normalizeEol`/`restoreEol` + hash on LF body | `ensure_lessons_idempotent_crlf` |
| AC11 — fenced markers ignored | §6.3 `findManagedBlock` `inFence` skip + step 6 append | `ensure_lessons_ignores_fenced_markers` |
| AC12 — /ctoc:update refreshes block | §6.6 `refreshLocalLessons` + 2 call sites + `require.main` guard + exports | `update_injects_lessons_block` |

| NFR | Implementation element | Test |
|-----|------------------------|------|
| Cross-platform | §6.3: `path.join`/`resolve`/`dirname`/`basename`, `os.tmpdir`, sync `fs`, no shell | AC9 (`path.win32` monkeypatch + no-child-process spy) |
| Idempotency (SHA-256 of body) | §6.3 `computeHash` + step 7 dual check | AC3, AC7, AC10 |
| Content preservation | §6.3 splice-only; `restoreEol` | AC4 (byte-for-byte before/after markers) |
| Atomicity | §6.3 `atomicWrite` temp + `renameSync`; no direct `writeFileSync(target,…)` | AC9 (`renameSync` spy exactly once `(tmp,target)`) |
| Performance | §6.3 steady-state no-op = 2 reads + exit; §6.5 placement off the stdout path | by design (no CI timing assertions — documented, flaky avoided) |
| Fail-open | §6.3 outer try/catch + every error exit writes non-empty stderr | AC8, AC12 forced-throw variant |
| No global mutation | §6.3 only touches `claudeMdPath` + temp files; never `os.homedir()`/`~/.claude` | §6.9 review + (negative) absence of any homedir reference |

#### 6.9 Security / Safety Review

- **SessionStart fail-open invariant (load-bearing).** The single most important
  safety property: `ensureLessonsBlock` must NEVER throw, block, or perceptibly slow
  session start. It is double-guarded — (1) the function body is wrapped in an outer
  try/catch that returns `false` on any error; (2) §6.5 Change 2 wraps the call again
  in try/catch. Steady-state (current block present) is two synchronous reads + an
  early `return false`, no write — so the common path is also the fast path. No CI
  timing assertion is added (flaky); performance is validated by design.
- **No global mutation (red line).** The injector only ever writes `claudeMdPath` and
  its temp files. It must NOT reference `os.homedir()`, `process.env.HOME`,
  `~/.claude/CLAUDE.md`, or any path outside the target project. The three call sites
  pass project-scoped `claudeMdPath` only (`projectDir/CLAUDE.md`,
  `projectPath/CLAUDE.md`, `process.cwd()/CLAUDE.md`). Reviewer must grep the new module
  for `homedir`/`USERPROFILE`/`.claude` and confirm ZERO matches.
- **Path traversal / safe write target.** `claudeMdPath` originates from CTOC-internal
  callers (never raw user input). The atomic write targets only `claudeMdPath`; temp
  files use `os.tmpdir()` (or same-dir on EXDEV) with a randomized name
  (`crypto.randomBytes`), avoiding predictable-temp collisions.
- **No command injection.** Zero `child_process` use in the new module; AC9 spies assert
  no `execSync`/`spawn` is invoked during a write.
- **Content integrity.** The managed-notice line warns humans not to hand-edit the
  block; the content-hash check transparently restores canonical content if they do —
  no silent divergence. User prose outside the markers is never touched (AC4).
- **No secrets, no network.** The module performs local file I/O only; it has no
  network calls and handles no credentials. `/ctoc:update`'s network path is unchanged
  and unrelated to the injection (which runs only at terminal success points).

---

### Quality-bar checklist (Step 7 SPEC → Gate 2 readiness)

- [x] Every AC (1–12) maps to ≥ 1 implementation element AND ≥ 1 test (§6.8).
- [x] Every file has exact path, purpose, action (CREATE/MODIFY).
- [x] Every new function has a typed signature + error-handling spec (§6.3).
- [x] Dependency graph acyclic, no orphans (§5.2).
- [x] Test plan covers happy path + error paths + edge cases (CRLF, fenced, EXDEV, win32).
- [x] Security/safety checklist complete (§6.9).
- [x] Implementation order reflects dependency order (§5.3).
- [x] Cross-platform addressed (`path.*`, `os.tmpdir`, sync `fs`, no shell).
- [x] No stubs; residual ambiguities documented under `## Decisions Taken Under Ambiguity`.
- [x] Gate-1 marker (`approved_by: human`) and the 7-file `files:` block preserved.


---

## Execution Plan (Steps 8-16)

### Step 8: TEST (TDD Red)
- [x] Write tests for the implementation (`tests/claude-md-lessons.test.js`, 12 ACs + sync-guard + error paths)
- [x] Test error conditions (missing source, malformed markers, EXDEV, non-EXDEV rename, fail-open)
- [x] Run tests - expect RED (failing) — confirmed MODULE_NOT_FOUND before implementation

### Step 9: PREPARE
- [x] Install dependencies if needed (none — Node built-ins only)
- [x] Check prerequisites (node v24; node:test runner)
- [x] Verify dev environment ready
- [x] Create directories/config if needed (n/a — module + template files)

### Step 10: IMPLEMENT
- [x] Implement the feature according to requirements (operating-lessons.md, claude-md-lessons.js, template C1–C8 + placeholder, init/SessionStart/update wiring, README + readme-numbers bump)
- [x] Add error handling (single outer try/catch, fail-open, stderr on every error exit)
- [x] Wire up integration points (init 3b, SessionStart 5b + guard, update refreshLocalLessons x2)

### Step 11: REVIEW
- [x] Self-review all new code
- [x] Verify integration points work together (full suite green)
- [x] Check error handling completeness (no silent failures; stderr asserted)

### Step 12: OPTIMIZE
- [x] Remove redundant operations (steady-state no-op = 2 reads + early return, no write)
- [x] Optimize critical paths (session-start hot path off the stdout path; no async)
- [x] Simplify complex code (O(n) fence parser; uniform ManagedBlock shape)

### Step 13: SECURE
- [x] Validate inputs (no path traversal — callers pass project-scoped paths)
- [x] Sanitize outputs (markers/notice are fixed constants)
- [x] No secrets in code (no network, no credentials)
- [x] Safe file operations (atomic temp-then-rename; never touches ~/.claude)

### Step 14: VERIFY
- [x] Run lint + type check (ESLint 0 errors; tsc baseline unchanged — new file type-clean)
- [x] Run ALL tests (TDD Green) — full suite 2516 pass / 0 fail
- [x] Check coverage >= 80% (claude-md-lessons.js: 99.28% line, 84.48% branch, 100% funcs)
- [x] 0 skipped, 0 flaky tests

### Step 15: DOCUMENT
- [x] Update relevant documentation (README src/lib count + parenthetical)
- [x] Add JSDoc comments to new functions (all exports + ManagedBlock typedef)
- [x] Update CHANGELOG if needed (n/a — version bump handled at release)

### Step 16: FINAL-REVIEW
- [x] Verify steps 8-15 completed correctly
- [x] All quality checks passed
- [x] Manual verification if needed (repo CLAUDE.md provably untouched by suite)
- [x] Ready for human review (plan left in todo/ per execution brief; no stage change)
