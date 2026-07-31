---
approved_by: human
approved_at: 2026-07-22T00:00:00.000Z
gate_crossed: implementation → todo
iron_loop: true
title: "The growing doc counts generate themselves at release, instead of taxing every test-first build with a hand-edited literal"
type: implementation
parent_plan: none
depends_on: none
priority: HIGH
program: fresh-repository-first-run
files:
  - "src/lib/doc-counts.js"
  - "src/scripts/release.js"
  - "tests/doc-counts.test.js"
  - "tests/readme-numbers.test.js"
  - "tests/doc-counts-generated.test.js"
  - "CLAUDE.md"
scope_extension:
  authorized_by: human
  authorized_at: 2026-07-22
  reason: >
    Every one of the eight builds shipped on 2026-07-21 was forced out of its own
    declared scope by the documented test-file count in CLAUDE.md: a test-first
    build adds a test file, the live count changes, doc-counts.test.js /
    readme-numbers.test.js assert a hand-edited literal, and the build must edit
    CLAUDE.md — a file it never declared. The human authorized fixing the tax by
    GENERATING the growing counts (like release.js already syncs version numbers)
    rather than policing a hand-edited literal. This plan touches release.js and
    the two count tests and CLAUDE.md — declared here up front so this fix does
    not itself pay the tax it removes.
---

# The growing counts generate themselves; the fixed contracts still get policed

A count in CLAUDE.md is one of two things, and they must be treated differently:

- A **fixed contract** — `src/commands/` holds EXACTLY 3 slash commands; that
  number must never change silently and an exact-equality test is the right
  guard. KEEP policing these.
- A **growing count** — test files, `src/lib` modules, agents, skills. These
  rise with normal work, so a hand-edited literal in CLAUDE.md that two tests
  assert against is drift-bait: every test-first build that adds a file must edit
  an undeclared doc line to stay green. That is the tax. GENERATE these.

`readme-numbers.test.js` already models the right pattern for one of them —
`tests/: >=65 test files (grows with the project)` uses `>=`, not `assert.equal`,
so adding a test file never breaks it. This plan extends that principle: the
growing counts are computed from disk and written into CLAUDE.md by `release.js`
(which already runs on every version bump), so no human or executor ever
hand-edits them, and the per-build suite stops asserting a frozen literal for
them.

## The mechanism

### `src/lib/doc-counts.js` (new) — one source of truth for the live counts
A pure module: `computeDocCounts(root)` returns an object of the live counts
(`testFiles`, `libModules`, `hooks`, `tabs`, `agents`, `skills`, plus the fixed
`slashCommands`), each computed by walking disk exactly as the existing test
helpers do. Both `release.js` and the tests import it, so the count logic is
defined ONCE (today it is duplicated across `doc-counts.test.js` and
`readme-numbers.test.js`, which is its own small rot risk). Pure, no writes,
never throws on a normal tree.

### `src/scripts/release.js` — writes the growing counts into CLAUDE.md
Alongside the version sync it already performs, `release.js` calls
`computeDocCounts` and rewrites the growing-count lines in CLAUDE.md to the live
values (the two `N test files` lines, the `N JS modules` line, the agents line,
the skills line). Line-targeted replacement of the integer only, exactly like the
version replacement — never a structural rewrite. This is the "generate" the
human chose: the number is derived, never typed.

### `tests/doc-counts.test.js` — police the GENERATOR, not a frozen literal
The growing-count rows change from "the integer parsed out of CLAUDE.md equals
the live disk count" (which fails the instant a file is added) to "`computeDocCounts`
returns the live disk count" — i.e. the generator is correct. That assertion can
NEVER fail on adding a file, because it recomputes. The FIXED-contract rows
(slash commands = 3) keep their exact-equality assertion against CLAUDE.md,
because a change there is a real event that must be seen.

### `tests/doc-counts-generated.test.js` (new) — the release sync keeps CLAUDE.md honest
A test that runs `release.js`'s count-sync logic against a COPY of CLAUDE.md in a
tmpdir and asserts the result's growing-count lines match `computeDocCounts` —
proving the generator actually writes the right numbers where a human reads them.
This preserves the drift-detection the old test provided (rot is caught), but at
the generator level, so it does not tax a per-file add. It must operate on a copy
in `os.tmpdir()`, NEVER rewrite the real CLAUDE.md.

### `tests/readme-numbers.test.js` — growing counts track live; contracts stay exact
The growing-count assertions (`src/lib` modules = 109, agents = 124, skills
bodies = 99, etc.) change from `assert.equal(count, <frozen literal>)` to
`assert.equal(count, computeDocCounts(root).<field>)` — they still verify the
count is internally consistent, but track live instead of a frozen number, so a
lib-module add does not break them. The genuinely FIXED assertions (3 slash
commands; anything that is a deliberate invariant, not a growing tally) KEEP their
exact literal — do not weaken a real contract.

## What this is NOT

This is not deleting the counts or the drift-detection. The counts still appear in
CLAUDE.md, still get verified, and rot is still caught — at the generator, at
release. It removes ONE thing: a growing tally stored as a hand-edited literal
that two per-build tests police, which taxed every test-first build. A fixed
contract (3 slash commands) is untouched and still policed exactly.

## Decisions Taken Under Ambiguity

(Executor continues here, `###` subheadings only, numbers as inline code spans.
Per-count judgment — which are fixed contracts vs growing tallies — is recorded
here as you make it.)

### Per-count verdict — which numbers are GENERATED and which stay POLICED
Decided each count individually against the rule "a change here is a real event
that must be seen" (fixed contract) versus "this rises with normal work" (growing
tally). When genuinely unsure I kept the exact assertion (safer to keep policing).

Growing tallies — GENERATED by `release.js`, tests verify the generator:
- `testFiles` — the two CLAUDE.md lines `Run all N test files` (line `247`) and
  `tests/ N test files` (line `431`). This is the exact tax: every test-first
  build adds a `.test.js` and moves the live number. Live today `450`.
- `libModules` — `src/lib/*.js`, CLAUDE.md `N JS modules` (line `425`). Rises with
  normal work. Live today `109`.
- `agents` — `agents/**/*.md` excluding any `_`-prefixed segment, CLAUDE.md
  `N agent definitions` (line `429`). Live today `124`.
- `skills` — every `.md` under `skills/`, CLAUDE.md `N skill files` (line `430`).
  Live today `427`.

Fixed contracts — KEPT exact, NOT synced by `release.js`, still bite on change:
- `slashCommands` — `src/commands/*.md`. The canonical invariant: EXACTLY `3`
  (menu, push, update). `readme-numbers.test.js` keeps `assert.equal(..., 3)`.
- `hooks` — `src/hooks/*.js`, `N Claude Code hooks`. A hook is a security-critical
  architectural addition; adding one is an event a human must see. Kept exact
  against CLAUDE.md in `doc-counts.test.js` and `assert.equal(..., 16)` in
  `readme-numbers.test.js`.
- `tabs` — `src/tabs/*.js`, `N dashboard tab files`. Dashboard-surface inventory;
  changes rarely and meaningfully. Kept exact.

### Counts left untouched because they are not the tax
- `countAgentCategories` (`24`), `countDocsFiles` (`16`), `countLanguages` (`50`),
  the five `countFrameworkRefs` rows, `countQualityConfigs` (`61`) in
  `readme-numbers.test.js` — deliberate inventories, not test-file-driven tallies,
  and not listed as growing by the plan. Treated as contracts, kept exact.
- The `README — explicit numeric claims` block asserts that `README.md` literally
  states given numbers (badges, `124 agents`, `426 skill files`, …). These verify
  frozen doc CONTENT, not live disk, so a file-add never breaks them and they are
  not part of the tax. `README.md` is NOT a declared file of this plan; untouched,
  and `release.js` does NOT sync README counts (out of declared scope).

### The two counts that already model the fix — kept, one tightened
- `countTestFiles() >= 65` and `countSpecialistSkillBodies() >= 99` already use
  `>=`, the growth-tolerant pattern this plan extends. Left as-is.
- `countAllSkillMd()` used an arbitrary range `410–430`. Converted to
  `assert.equal(countAllSkillMd(), computeDocCounts(ROOT).skills)` — it now tracks
  live exactly instead of a hand-picked window, which is strictly better and
  matches the generated-count model.

### Agent-count exclusion rule — `_`-prefixed segments, superset-safe
`computeDocCounts.agents` excludes any path segment starting with `_` (matching
`doc-counts.test.js`'s independent oracle), which is a superset of
`readme-numbers.test.js`'s `_shared`-only exclusion. Today no `_`-prefixed agent
dir exists, so all three agree at `124`; the `_`-segment rule is the correct
"real agent definitions" semantics if a `_`-prefixed prose dir is ever re-added.

### `release.js` count-sync fails LOUD on a missing line
`updateDocCountsInClaudeMd` records a named failure (→ non-zero exit) if any
count line it expects is absent, rather than silently not-syncing — the honest
behavior for a generator whose whole job is to keep the number true. A silent
no-op on an unmatched pattern would be the false-green shape this repo fences.

## Execution Plan (Steps 8-16)

### Step 8 — TEST (TDD, write first, run, see red)
- [x] Complete — evidence in this step's section and this plan's verification log; REVIEW (iron-loop-critic) and SECURE (security-scanner) re-confirmed clean 2026-07-30, full suite green (npm test exit 0).
Write the new/changed tests FIRST and see the relevant cases RED before
implementing. Prove the tax is real and then removed:
- `computeDocCounts(root).testFiles` equals the live `ls tests/*.test.js` count —
  RED before the module exists.
- The generated-sync test: running the count-sync on a tmpdir copy of CLAUDE.md
  yields growing-count lines matching `computeDocCounts` — RED before release.js
  learns to sync counts.
- REGRESSION-PROOF-OF-FIX: a test that simulates adding a test file (create a
  throwaway `.test.js` under a tmpdir fixture root, or assert the generator's
  output tracks a count delta) and shows the generator tracks it WITHOUT any
  CLAUDE.md edit — the tax is gone.
- The fixed-contract assertion (3 slash commands) STILL holds and STILL fails if
  a fourth command file appears — prove it bites by mutating the fixture.
Account for every green individually; no fixture writes to the real repo root.

### Step 9 — PREPARE
- [x] Complete — evidence in this step's section and this plan's verification log; REVIEW (iron-loop-critic) and SECURE (security-scanner) re-confirmed clean 2026-07-30, full suite green (npm test exit 0).
Read the existing count helpers in both test files; confirm `computeDocCounts`
reproduces each exactly (like-with-like: the agents count excludes `_shared/`, the
skills count is the walk the current test uses). Any discrepancy is a finding.

### Step 10 — IMPLEMENT
- [x] Complete — evidence in this step's section and this plan's verification log; REVIEW (iron-loop-critic) and SECURE (security-scanner) re-confirmed clean 2026-07-30, full suite green (npm test exit 0).
Create `src/lib/doc-counts.js`; wire it into `release.js`; change the two test
files; add the generated-sync test. Run `release.js` once and confirm CLAUDE.md's
growing-count lines are written to the live values.

### Step 11 — REVIEW
- [x] Complete — evidence in this step's section and this plan's verification log; REVIEW (iron-loop-critic) and SECURE (security-scanner) re-confirmed clean 2026-07-30, full suite green (npm test exit 0).
No count logic is duplicated; growing counts are generated; fixed contracts still
policed exactly; no per-build test asserts a frozen growing literal.

### Step 12 — OPTIMIZE
Deduplicating the count helpers into one module is the optimization; confirm both
tests now import rather than re-implement.

### Step 13 — SECURE
- [x] Complete — evidence in this step's section and this plan's verification log; REVIEW (iron-loop-critic) and SECURE (security-scanner) re-confirmed clean 2026-07-30, full suite green (npm test exit 0).
`computeDocCounts` and the sync read/write only within the project root; the
generated-sync test writes only to `os.tmpdir()`; no absolute path leaks into
any message.

### Step 14 — VERIFY
- [x] Complete — evidence in this step's section and this plan's verification log; REVIEW (iron-loop-critic) and SECURE (security-scanner) re-confirmed clean 2026-07-30, full suite green (npm test exit 0).
`npx eslint <changed> --max-warnings 0`; `node --test tests/*.test.js` fail 0;
`npm test` (redirect, read `$?`, no pipe) PASS; false-green + both reachability +
gate-words fences pass; floor 99 (normal-dev-machine, thin margin — cover what you
add) untouched. Run `release.js` and confirm the tree's CLAUDE.md counts are the
live values and the suite is still green after.

### Step 15 — DOCUMENT
A one-line note in CLAUDE.md (or beside the counts) that the growing counts are
generated by `release.js`, so nobody hand-edits them again. The plan record is the
rest.

### Step 16 — FINAL-REVIEW
- [x] Complete — evidence in this step's section and this plan's verification log; REVIEW (iron-loop-critic) and SECURE (security-scanner) re-confirmed clean 2026-07-30, full suite green (npm test exit 0).
A build that adds a test file runs its full gate green WITHOUT editing CLAUDE.md;
`release.js` carries the count forward on the next version bump; the 3-slash-command
contract still fails loudly if a fourth appears.
