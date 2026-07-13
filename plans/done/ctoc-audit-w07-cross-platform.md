---
approved_by: human
approved_at: 2026-07-13T20:53:24.822Z
gate_crossed: review → done
---

---
iron_loop: true
approved_by: human
approved_at: 2026-07-13T19:14:57.915Z
gate_crossed: implementation → todo
---

---
approved_by: human
approved_at: 2026-07-13T11:01:11.655Z
gate_crossed: functional → implementation
---

---
title: "W07 — Cross-Platform Correctness"
created: "2026-07-11T00:00:00Z"
type: feature
parent_vision: "vision/ctoc-self-audit-remediation.md"
priority: MEDIUM
depends_on: none
---

# W07 — Cross-Platform Correctness

## 1. ASSESS — Problem Understanding

### Business Context

A Windows user checking out CTOC with git's default `autocrlf=true` gets every
plan file with CRLF line endings. The frontmatter parsers on the enforcement hot
path require a bare `\n` immediately after the opening `---`; against `---\r\n`
that match fails and the plan parses as `{}`. With empty frontmatter, the
enforcement hook's `files:` coverage resolves to nothing, so it covers no plan
and **blocks every plan-covered edit** — a full Windows lockout of the exact
guardrail CTOC exists to provide. This is named directly in the parent vision's
target audience ("Cross-platform users on Windows, currently locked out of
editing any plan-covered file by the CRLF defect") and success criterion #6
("CTOC runs on Windows"). For this population the product is not degraded, it is
unusable — every `Edit`/`Write` to a plan-covered file is denied regardless of
what the plan declares.

### Current State

Verified by direct inspection of the live code on 2026-07-11 (all citations are
file:line against the code as it stands today; every claim in the originating
stub was re-checked against disk rather than trusted, per the ASSESS mandate —
no drift found, all four named files and both named finding IDs below match
exactly):

- **H1 — CRLF checkout locks Windows users out (frontmatter parsers require a
  bare `\n`).** Four parsers directly confirmed:
  - `src/lib/plan-coverage.js:79` — `content.match(/^---\n([\s\S]*?)\n---/)`
    inside `readPlanFiles()`; `:86` — `after.split('\n').slice(1)` when walking
    the `files:` block. This is the function the PreToolUse enforcement hook
    calls to resolve `files:` coverage — the single most consequential parser
    for the lockout.
  - `src/lib/state.js:59` — `content.match(/^---\n([\s\S]*?)\n---/)` inside
    `parseMetadata()`; `:63` — `match[1].split('\n').forEach(...)`.
    `parseMetadata` is imported and reused by `src/lib/plan-validator.js:10`
    (`const { parseMetadata } = require('./state');`), so this one parser's
    CRLF bug propagates into every plan-validator.js gate check
    (`validateForReview`, `validateReviewToDone`) as well as its own two call
    sites — fixing `state.js` closes more surface than its direct callers
    suggest.
  - `src/lib/plan-index/sync-unit.js:59` — `content.match(/^---\n([\s\S]*?)\n---\n?/)`
    inside `splitFrontmatter()`.
  - `src/lib/metrics-loop.js:567` — `content.match(/^---\n([\s\S]*?)\n---/)`
    inside `extractFilesDeclaration()`; `:573` —
    `fm.slice(filesIdx).split('\n').slice(1)`.
  - The parent vision's audit states **12** total affected parsers; only these
    4 (6 call sites) are individually named in the vision and the originating
    stub. The remaining ~8 were not enumerated anywhere upstream and were not
    fabricated here — see Decisions Taken Under Ambiguity for the concrete,
    non-stub resolution (a mandatory Step 5 grep sweep).
  - **This is a consistency gap, not a research problem.** The CRLF-safe
    pattern already exists and works correctly elsewhere in this exact repo —
    confirmed at `src/lib/stale-detector.js:104`
    (`content.split(/\r?\n/)`) and `src/hooks/human-gate-check.js:66,68`
    (`content.match(/^---\r?\n([\s\S]*?)\r?\n---/)` and
    `fm[1].split(/\r?\n/)`). The fix is to apply the pattern CTOC already ships
    to the parsers that missed it, not to invent a new one.

- **M13 — POSIX-only shell-outs on hot paths.**
  - `src/lib/sast-runner.js:355` — inside `runESLintSecurity()`:
    `const command = 'npx eslint --plugin security --format json . 2>/dev/null || true';`,
    passed to `execSync(command, { ..., shell: true })` at `:357-362`.
    `2>/dev/null` and `|| true` are POSIX shell syntax; neither is valid under
    `cmd.exe` (Windows's default shell), and the redirect target (`/dev/null`)
    does not exist on Windows at all.
  - `src/lib/runner-detect.js:93` — inside `checkDisk()`:
    `` execSync(`df -k "${targetPath}" | tail -1`, ...) ``. `df` and `tail` are
    POSIX/Unix utilities absent from a stock Windows install. Confirmed
    ironic detail: the function's own comment at `:92` reads "Use df command
    for cross-platform compatibility" — the opposite of what the code does;
    worth flagging so no future maintainer copies the comment's claim at face
    value.

- **M22 — `process.env.HOME` used where `os.homedir()` is required.**
  - `src/lib/agent-critic-loop.js:44` — `const GRADES_FILE =
    path.join(process.env.HOME, '.ctoc/agents/grades.yaml');` is a
    **module-level** `const`. Windows does not set `HOME` (it sets
    `USERPROFILE`/`HOMEDRIVE`+`HOMEPATH`), so `process.env.HOME` is `undefined`
    and `path.join(undefined, ...)` throws `TypeError: Path must be a string`
    **at `require()` time** — the module cannot load at all on Windows, this
    is not a degraded feature, it is a process that cannot start.
  - `src/lib/grading-system.js:31-33` — `function getGradesFile() { return
    path.join(process.env.HOME || '/tmp', '.ctoc/agents/grades.yaml'); }` does
    not throw (guarded with `|| '/tmp'`) but silently resolves to a bogus
    drive-relative path instead of the user's real home directory — grades
    write to the wrong place with no error surfaced anywhere.

### Impact

- **Full Windows lockout.** With H1 unfixed, every CRLF-checked-out plan's
  `files:` declaration resolves to `{}`/`[]` via `plan-coverage.js` and
  `state.js`, so the enforcement hook's coverage check finds no covered file
  for any plan-covered edit and blocks it — the exact failure the vision names
  as making "the product... unusable" for this population.
- **Silent metric loss.** `metrics-loop.js`'s declared-file line-count metric
  (`:566-581`) returns `[]` for `filesDeclared` on a CRLF-checked-out plan, so
  per-plan line-count metrics silently undercount to 0 with no error raised —
  another instance of the vision's "tests assert structure, not truth" blind
  spot, this time at the metrics layer rather than the test layer.
- **M13:** a CRLF-authored plan's SAST security scan or a `runner-detect`
  prerequisite check throws or silently returns a wrong result under `cmd.exe`,
  so a Windows quality-gate run gets a false failure (or a swallowed/incorrect
  result) instead of a real scan.
- **M22:** `agent-critic-loop.js`'s module-load-time throw means any code path
  that `require()`s it — even transitively — crashes the whole Node process on
  Windows before any of its logic runs.

## 2. ALIGN — Goals + Success Metrics

**Job to Be Done:** When I check out or author a CTOC plan on Windows
(`git core.autocrlf=true`) and try to edit a plan-covered file, or run the SAST
scanner, `runner-detect`, or `agent-critic-loop`, I want line-ending and
home-directory handling to work identically to Linux/macOS, so I can use CTOC
without being locked out of every plan-covered edit or crashing the process.

**Impact Map:**
- **Goal:** CTOC runs correctly on Windows — parent vision success criterion #6.
- **Actor:** Cross-platform (Windows) CTOC user, and the enforcement hook that
  reads their plans (named directly in the vision's target audience list).
- **Impact:** A CRLF-checked-out repo parses and enforces identically to an LF
  one; the SAST runner, `runner-detect`, and `agent-critic-loop` run without any
  POSIX-only assumption.
- **Deliverable:** CRLF-safe frontmatter parsing applied to the parsers still
  missing it, portable non-shell invocations replacing the two POSIX shell-outs,
  and `os.homedir()` replacing `process.env.HOME` at both call sites.

**Success metrics** (each behavior-observable, not an internal-function-return
check):

- [x] A CRLF-encoded plan file parses to a byte-identical (deep-equal) metadata
  object as its LF twin, across every fixed parser.
- [x] A CRLF-checked-out plan declaring `files:` resolves plan-coverage to the
  same covered set as its LF twin — the end-to-end behavior H1 actually breaks,
  not merely the raw parser.
- [x] `sast-runner.js`'s ESLint-security invocation completes without a
  `2>/dev/null`/`|| true` shell-string construct present in source.
- [x] `runner-detect.js`'s disk-space check completes without a `df`/`tail`
  shell-string construct present in source, on a platform lacking those
  binaries.
- [x] `agent-critic-loop.js` loads (`require()` does not throw) in a process
  where `HOME` is unset.
- [x] `grading-system.js`'s resolved grades-file path is under `os.homedir()`,
  not a `/tmp`-derived fallback, when `HOME` is unset but a real home directory
  exists.

## 3. CAPTURE

### Acceptance Criteria (BDD)

- [x] **Scenario: CRLF frontmatter parses identically to LF — plan-coverage.js**
  Given a plan file whose bytes use CRLF line endings and declares
  `files: ["src/foo.js"]`
  When `plan-coverage.js`'s `readPlanFiles()` parses it
  Then the returned files list equals the list parsed from the byte-for-byte LF
  twin of the same file
  And the list is non-empty (not silently `[]`).

- [x] **Scenario: CRLF frontmatter parses identically to LF — state.js**
  Given a CRLF-encoded plan file
  When `state.js`'s `parseMetadata()` parses it
  Then the returned metadata object is deep-equal to the object parsed from the
  plan's LF twin.

- [x] **Scenario: Coverage survives CRLF end to end**
  Given a CRLF-checked-out plan in `todo` declaring `files: ["src/foo.js"]`
  When the enforcement hook computes coverage for an edit to `src/foo.js`
  Then `src/foo.js` is reported covered (allow), not treated as uncovered.

- [x] **Scenario: metrics-loop line-count metric survives CRLF**
  Given a CRLF-checked-out plan declaring one existing file in `files:`
  When `metrics-loop.js`'s `extractFilesDeclaration()` + line-count path
  computes the plan's declared-file line count
  Then the count equals the LF twin's count, not zero.

- [x] **Scenario: plan-index sync-unit splits frontmatter correctly under CRLF**
  Given a CRLF-encoded plan file
  When `plan-index/sync-unit.js`'s `splitFrontmatter()` runs
  Then the returned `frontmatter` string equals the LF twin's `frontmatter`
  string, with no stray `\r` leaked into any parsed field value.

- [x] **Scenario: SAST runner completes without a POSIX shell string**
  Given `sast-runner.js` runs its ESLint-security step in an environment with
  no POSIX shell available
  When `runESLintSecurity()` executes
  Then it completes (or fails on ESLint's own exit code) without relying on
  `2>/dev/null` or `|| true` shell syntax
  And no `2>/dev/null` or `|| true` string is present in `sast-runner.js`.

- [x] **Scenario: runner-detect disk check completes without df/tail**
  Given `runner-detect.js`'s `checkDisk()` runs on a platform with no `df` or
  `tail` binary on PATH
  When `checkDisk()` executes
  Then it returns a disk-space result (ok/not-ok) without shelling out to
  `df`/`tail`
  And no `` df `` or `` | tail `` string is present in `runner-detect.js`.

- [x] **Scenario: agent-critic-loop loads without HOME set**
  Given a process environment where `HOME` is unset (e.g. Windows, or an
  explicitly filtered env)
  When `agent-critic-loop.js` is `require()`d
  Then the module loads without throwing
  And its grades-file path derives from `os.homedir()`.

- [x] **Scenario: grading-system resolves the real home directory**
  Given a process environment where `HOME` is unset but `os.homedir()` resolves
  to a real path
  When `grading-system.js`'s `getGradesFile()` is called
  Then the returned path is under `os.homedir()`
  And it is not the literal string `/tmp` or a drive-relative `\tmp\...`
  artifact.

### Scope

#### In Scope

- CRLF-safe frontmatter parsing (`/^---\n/` → `/^---\r?\n/`,
  `.split('\n')` → `.split(/\r?\n/)`) applied to `plan-coverage.js` (`:79`,
  `:86`).
- The same fix applied to `state.js` (`:59`, `:63`) — propagates to every
  `plan-validator.js` caller via its `parseMetadata` import.
- The same fix applied to `plan-index/sync-unit.js` (`:59`).
- The same fix applied to `metrics-loop.js` (`:567`, `:573`).
- `sast-runner.js`'s ESLint-security shell-out (`:355`, `:357-362`) replaced
  with a portable non-shell invocation (no `shell: true`, no
  `2>/dev/null`/`|| true`).
- `runner-detect.js`'s disk-space shell-out (`:93`) replaced with a portable
  non-shell invocation (no `df`/`tail`).
- `agent-critic-loop.js:44` changed from `process.env.HOME` to `os.homedir()`.
- `grading-system.js:31-33` changed from `process.env.HOME` to `os.homedir()`.

#### Out of Scope

- Enforcement exit-code/deny-signal semantics (the block protocol,
  stdin-vs-`CLAUDE_TOOL_INPUT` reads) — **W01** (already refined; lands
  independently). This plan does not touch any `PreToolUse.*.js` deny/allow
  signal.
- The escape-phrase matcher and project-root walk — **W08**.
- Release/metadata sync (VERSION/`package.json`/license consistency) — **W09**.
- Any agent-contract loading, human-gate-integrity ledger, or Iron-Loop
  step-agent-resolution work — the vision's workstreams 2–5, outside workstream
  7's boundary entirely.
- Full byte-level file normalization (rewriting CRLF to LF on disk, or a
  `.gitattributes` enforcement mandate) — deliberately not chosen; kept from the
  originating stub's decision, see Decisions Taken Under Ambiguity.
- A from-scratch full-repo audit for every POSIX-only shell-out in the
  codebase — only the two named in the vision's M13 finding
  (`sast-runner.js`, `runner-detect.js`) are committed here; any additional
  instance found later is a new finding, not silently folded into this plan.

### Story Breakdown (INVEST-validated)

**As a** Windows CTOC user, **I want** a CRLF-checked-out plan's frontmatter to
parse identically to its LF twin, **so that** plan-coverage resolves and I am
not locked out of editing plan-covered files.
*(Independent of the other vision workstreams. Valuable — closes the full
Windows lockout. Small — regex/split swap across a bounded set of call sites.
Testable — CRLF/LF fixture parity, verified end-to-end through coverage.
`[MVP]`.)*

**As a** maintainer, **I want** the CRLF-safe pattern applied consistently
across every frontmatter parser — including the ones not individually named in
this plan — **so that** no parser left behind silently reintroduces the
lockout on a code path nobody has fixture-tested yet.
*(Depends on the first story's fixture/pattern landing as the reusable
template. Negotiable — shared-helper vs. per-file patch is a Step 5 design
choice, see Decisions below. Testable via a repo-wide grep assertion plus a
fixture per discovered parser.)*

**As a** Windows user, **I want** the SAST runner and disk-space probe to run
without a POSIX-only shell construct, **so that** a scan or a `runner-detect`
check does not throw or silently fail under `cmd.exe`.
*(Independent of the other three stories. Valuable — a Windows quality-gate run
gets a real result instead of a false failure. Small — two call sites.
Testable — no-shell-string assertion plus successful completion on a
shell-less spawn. `[MVP]`.)*

**As a** Windows user, **I want** home-directory lookups to use
`os.homedir()`, **so that** `agent-critic-loop.js` loads without crashing the
process and `grading-system.js` writes grades to my real home directory
instead of a bogus fallback path.
*(Independent. Valuable — turns a process-crash into a working feature. Small —
two call sites. Testable — module loads with `HOME` unset; resolved path is
under `os.homedir()`.)*

### Files Likely Touched

- `src/lib/plan-coverage.js` — `readPlanFiles()` frontmatter match (`:79`) and
  split (`:86`).
- `src/lib/state.js` — `parseMetadata()` frontmatter match (`:59`) and split
  (`:63`); consumed by `plan-validator.js` (`parseMetadata` imported at
  `plan-validator.js:10`), so this fix's effect extends past its own two call
  sites.
- `src/lib/plan-index/sync-unit.js` — `splitFrontmatter()` frontmatter match
  (`:59`).
- `src/lib/metrics-loop.js` — `extractFilesDeclaration()` frontmatter match
  (`:567`) and split (`:573`).
- Remaining frontmatter parsers not individually named in the vision or the
  originating stub (audit states 12 total; 4 files / 6 call sites verified
  above) — exact file list produced by a full-repo grep sweep at Step 5 PLAN,
  see Decisions Taken Under Ambiguity below.
- `src/lib/sast-runner.js` — `runESLintSecurity()`'s shell-command string
  (`:355`) and its `execSync` call (`:357-362`, `shell: true`).
- `src/lib/runner-detect.js` — `checkDisk()`'s `df`/`tail` shell-out (`:93`).
- `src/lib/agent-critic-loop.js` — module-level `GRADES_FILE` constant (`:44`).
- `src/lib/grading-system.js` — `getGradesFile()` (`:31-33`).
- New or extended CRLF/LF fixture tests under `tests/` (exact filenames decided
  at Step 8 TEST) — should reuse the fixture pattern already proven for
  `stale-detector.js` / `human-gate-check.js`, not reinvent it.

### Test Strategy

- **Byte-level CRLF fixture pairing.** For each frontmatter parser in scope,
  construct a CRLF-encoded plan fixture and its byte-for-byte LF twin (same
  content, only line-ending bytes differ), and assert deep-equal parsed output
  between the two — proves parity, not just "doesn't throw."
- **End-to-end coverage assertion**, not just raw-parser output: a fixture with
  `files:` declared must additionally prove the enforcement/coverage function
  resolves the declared file as covered when the fixture is CRLF-encoded — the
  failure H1 actually names is "coverage resolves to nothing," one level above
  the raw parser return value.
- **Shell-out tests simulate absence, not just "ran on a machine that happens to
  have the binary."** macOS/Linux dev machines have `/bin/sh`, `df`, and `tail`,
  so a naive "it ran and returned something" test would pass today and still
  miss the Windows failure. Tests must assert (a) no POSIX-only shell string is
  present in source (a static assertion) and (b) the function completes and
  returns a result when the environment is constructed to lack `/bin/sh`,
  `df`, or `tail` on `PATH`.
- **Homedir tests run in a child process with `HOME` filtered from `env`**
  (`spawnSync`/`execFileSync` with a constructed `env` object), not an
  in-process `delete process.env.HOME` — Node's module cache means a second
  `require()` in the same process would not re-execute the top-level
  `path.join` that actually throws, so an in-process test would not catch a
  regression of the module-load-time crash.
  This is a fresh-subprocess requirement for a working-code proof, not an
  implementation-step directive.
- Every scenario above must exist as a failing test before the fix lands
  (Step 8 TEST, out of scope for this functional plan) and pass after —
  matching the vision's own dogfooding requirement and the test-strategy
  convention already established by W01 in this same vision.

## Slices (dependency-ordered) — SIP1 INDEX

This functional-derived plan is decomposed into **7 implementation slices** (SIP1).
This file is the INDEX; each slice below is a complete implementation plan with its
own Steps 8–16. Build order follows `depends_on` (slices are built sequentially, FIFO;
the maintainer chooses when). **Gates 2 & 3 batch per parent** via
`approveSubplans("ctoc-audit-w07-cross-platform", fromStage)` — ONE human decision
crosses every sibling (each stamped `approved_by: human`). `listSubplans(...)` enumerates
the set.

| # | Slice file | Scope (one line) | depends_on |
|---|------------|------------------|------------|
| 1 | `ctoc-audit-w07-s1-frontmatter-helper.md` | Shared CRLF-safe frontmatter helper — the single home for the `/^---\r?\n/` pattern | — |
| 2 | `ctoc-audit-w07-s2-coverage-state.md` | Enforcement hot path — the actual Windows-lockout parsers (feeds every gate via `parseMetadata`) | s1 |
| 3 | `ctoc-audit-w07-s3-syncunit-metrics.md` | Plan-index sync + metrics parsers (kills the `\r`-leak and the zero line-count) | s1 |
| 4 | `ctoc-audit-w07-s4-pipeline-parsers.md` | Remaining runtime pipeline parsers: vision-decomposer, inbox, iron-loop-enforcer | s1 |
| 5 | `ctoc-audit-w07-s5-script-parsers.md` | Dev-tooling script frontmatter parsers (closes the grep sweep) | s1 |
| 6 | `ctoc-audit-w07-s6-portable-shellouts.md` | M13 — POSIX shell-outs → `execFileSync` + `fs.statfsSync` | — |
| 7 | `ctoc-audit-w07-s7-homedir.md` | M22 — `process.env.HOME` → `os.homedir()` | — |

Dependency chain max depth 2 (s1 → s{2,3,4,5}); s6, s7 independent. No cycles.

### `files:` touched per slice
- **s1** — `src/lib/frontmatter.js`, `tests/frontmatter.test.js`
- **s2** — `src/lib/plan-coverage.js`, `src/lib/state.js`, `tests/w07-crlf-coverage-state.test.js`
- **s3** — `src/lib/plan-index/sync-unit.js`, `src/lib/metrics-loop.js`, `tests/w07-crlf-syncunit-metrics.test.js`
- **s4** — `src/lib/vision-decomposer.js`, `src/lib/inbox.js`, `src/lib/iron-loop-enforcer.js`, `tests/w07-crlf-pipeline-parsers.test.js`
- **s5** — `src/scripts/v8-migrate-skills.js`, `src/scripts/strip-unenforced-budgets.js`, `tests/w07-crlf-scripts.test.js`
- **s6** — `src/lib/sast-runner.js`, `src/lib/runner-detect.js`, `tests/w07-portable-shellouts.test.js`
- **s7** — `src/lib/agent-critic-loop.js`, `src/lib/grading-system.js`, `tests/w07-homedir.test.js`

### Step-5 grep sweep — RESOLVED (the parent mandated running it here)
Full-repo search for `/^---\n/`-style frontmatter matches and bare `.split('\n')` on
captured frontmatter, run against live code on decomposition. **Every fully-broken
`/^---\n/` frontmatter parser found is assigned to a slice above:**

- **Migrated (fully-broken `/^---\n/`):** `state.js` (:59,:63), `plan-coverage.js`
  (:79,:86), `plan-index/sync-unit.js` (:59,:77), `metrics-loop.js` (:200,:567,:573),
  `vision-decomposer.js` (:47,:240,:247), `inbox.js` (:141,:144),
  `iron-loop-enforcer.js` (:98-99), `scripts/v8-migrate-skills.js` (:66,:123),
  `scripts/strip-unenforced-budgets.js` (:44,:51). The already-correct references
  (`human-gate-check.js:66`, `reconciliation.js:94`) are the pattern the helper mirrors.
- **Excluded — assigned to a sibling workstream by this plan's own Out-of-Scope:**
  `agent-resolver.js` (:34,:57) → W03/W04 (agent-contract / step-agent resolution);
  `actions.js` marker/metadata prepend (:307,:360,:392) → W02 (human-gate-integrity),
  which also avoids two workstreams editing `actions.js`.
- **Excluded — distinct lesser bug class:** `four-eyes.js` (:48,:123) and
  `privilege-posture.js` (:97) use the `/^---\s*\n/` tolerant variant — a partial
  `\r`-leak, NOT the total parse-failure that causes the lockout — and are
  gate/privilege-integrity-adjacent (W02). Recorded as a distinct finding, not silently
  folded into W07 (same discipline the plan applies to shell-outs).

## Decisions Taken Under Ambiguity

- **No Business Model Canvas.** No canvas exists at
  `plans/canvas/ctoc-self-audit-remediation.md`. This is a technical
  remediation vision; a BMC is N/A. Recorded here and proceeding — no
  kickback. (Kept from the originating stub.)
- **Shared CRLF-safe frontmatter-parse helper vs. fix each parser in place:
  RECOMMEND a shared helper**, over independently patching each of the ~12
  parsers' own inline regex/split. Reasoning:
  - The root cause of H1 is not "one file has a bug" — it is that the
    CRLF-safe pattern already coexists as two independent working
    implementations (`stale-detector.js`, `human-gate-check.js`) alongside at
    least four independently broken ones (`plan-coverage.js`, `state.js`,
    `sync-unit.js`, `metrics-loop.js`). Patching each of the 12 in place
    preserves the N-copies-of-the-same-five-lines shape and only fixes today's
    known instances; the next new parser (or any of the ~8 still unnamed) is
    exactly as likely to reintroduce the bug as the last one was.
  - This is the change shape the plan's own second story (consistency, not
    just current-defect coverage) and the parent vision's stated meta-problem
    both call for: "the deeper problem is not any single bug... the defects
    accumulated behind a green suite" — a copy-pasted regex accumulates
    defects the same way a structural test gap does.
  - Cost is smaller than it looks: the four confirmed call sites each
    duplicate ~5 lines of near-identical parsing logic that collapses into one
    shared call; the marginal cost of importing a helper vs. editing a 1-line
    regex is paid back the moment a 5th caller exists.
  - **Left open for Step 5 (PLAN), not resolved here:** where the helper lives
    (a new module vs. exported from `state.js` vs. from `stale-detector.js`)
    and its exact signature — this functional plan commits to the
    shared-helper *approach*, not its file location or API shape, which is
    implementation design.
- **Enumerating the remaining ~8 unnamed frontmatter parsers.** The vision and
  the originating stub both state an audit total of 12 affected parsers and
  name only 4 (6 call sites) — all 4 independently re-verified against live
  code in this ASSESS pass with exact, unchanged line numbers. Rather than
  fabricate file names for the other ~8, or leave a bare "+8 more" as an open
  TODO (forbidden by the no-stub rule), this plan documents a concrete,
  mandatory action instead: **Step 5 (PLAN) must run a full-repo search for
  `/^---\n/`-style frontmatter matches and any bare `.split('\n')` following a
  frontmatter capture before implementation begins**, and add every match
  found to the implementation plan's file list. This closes the enumeration
  gap with a defined process step, not a placeholder — and is exactly the kind
  of gap the shared-helper decision above is designed to make structurally
  impossible to reintroduce once closed.
- **Regex over full CRLF normalization** (kept from the originating stub, still
  the right call after re-verification): chose the minimal `\r?\n`
  regex/`split` change — matching the pattern already proven correct in
  `stale-detector.js` / `human-gate-check.js` — over normalizing every file to
  LF on read, to keep the change surgical and avoid altering byte content that
  enforcement hashing or `plan-coverage.js`'s glob matching may depend on.
- **Portable shell-out replacement mechanism: RECOMMEND `execFileSync`/
  `spawnSync` with an argument array** (no `shell: true`, no string
  interpolation) for both `sast-runner.js` and `runner-detect.js`, over a
  Windows-specific branch (`if (process.platform === 'win32') {...} else
  {...}`) that would leave two code paths to maintain. For
  `runner-detect.js`'s disk-space check specifically, the argument-array fix
  likely means replacing the `df`/`tail` pipeline with Node's own
  `fs.statfs`/`fs.statfsSync` (available since Node 18.15) where the running
  Node version supports it, removing the external-binary dependency entirely
  rather than only making the invocation syntax portable — the exact choice
  (`statfs` vs. a portable `df` invocation with a Windows equivalent) is left
  to Step 5/6 design, not fixed here.


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
