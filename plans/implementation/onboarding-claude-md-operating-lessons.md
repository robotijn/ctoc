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
