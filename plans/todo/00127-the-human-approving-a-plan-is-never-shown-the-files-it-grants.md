---
approved_by: human
approved_at: 2026-07-20T09:39:54.629Z
gate_crossed: implementation → todo
---

---
approved_by: human
approved_at: 2026-07-19T21:31:41.164Z
gate_crossed: implementation → todo
---

---
title: "The human approving a plan is never shown the files it grants — the gate screen strips the frontmatter, and the file list IS the write permission"
type: implementation
parent_plan: ctoc-background-engine-rebuild
depends_on: none
priority: HIGH
program: ctoc-repair-loop
iron_loop: true
files:
  - "src/lib/declared-breadth.js"
  - "src/lib/streaming-gate.js"
  - "tests/scope-shown-at-approval.test.js"
---

# The human approving a plan is never shown the files it grants

## The defect, verified by reading

A plan's `files:` list **is** the write permission. `plan-coverage.findCoveringPlan`
reads it and the enforcement hook allows or refuses every edit on that basis. The
human is the only one who can grant it, and they grant it by approving the plan.

Read from the source, here is what the human sees when they do that:

- `src/lib/streaming-gate.js:856 planDecisionScreen` builds the gate screen — the
  topic line, the gate label, the title, then the body at `:884`.
- `:884` calls `renderPlanBody(content)` (`:213-223`).
- `renderPlanBody`'s first statement is
  `const body = stripLeadingFrontmatter(content)`.

**The `files:` list lives in the frontmatter. It is stripped before the human sees
anything.** The one thing a gate approval actually grants is the one thing the
approval screen does not show. Everything else in the frontmatter goes with it —
`priority`, `depends_on`, `parent_plan` — but the file list is the one that carries
consequence, because it is the only line that decides what an agent may overwrite.

This is not a hypothesis about human attention. It is not that `**` is easy to miss
next to `src/**`; it is that **neither is on the screen at all.**

## THIS PLAN NOW BUILDS FIRST — the dependency was inverted

An earlier draft had this plan depend on `00126`, because `00126` created
`src/lib/declared-breadth.js` and this plan added a counting function to it. **That
ordering shipped consent before the ability to see what you are consenting to.**

`00126` refuses an unanchored declaration unless the plan's frontmatter carries an
`unanchored_scope` acknowledgement. That acknowledgement is genuinely unforgeable —
the specification hash covers every frontmatter block, length-prefixed — but under the
old ordering it was also **invisible**, because this screen strips the frontmatter. A
human would have been asked to consent, in a frontmatter key, to a scope the screen
never rendered. An unforgeable signature on a blank page is still a signature on a
blank page.

So the order is inverted, exactly as this plan's earlier text already anticipated and
called small:

- **This plan CREATES `src/lib/declared-breadth.js`** with `isAnchored` (the
  anchoring predicate, needed here for the unanchored marker) and `countMatching`
  (the counting half), and renders the scope block at the gate.
- **`00126` then ADDS the enforcement half** — `hasUnanchoredAcknowledgement`,
  `REFUSAL_REASON`, and the coverage guard — to that same module, and declares
  `depends_on: 00127`.

The anchoring predicate still has exactly ONE home, which was the real constraint. The
only thing that changed is which plan puts it there. **The number shown here and the
rule enforced there must agree**, and they do, because they are the same function.

This plan is complete and useful on its own: the human can take visibility and stop.
It creates no dead code — `isAnchored` and `countMatching` both have a live consumer
in the gate screen the moment this lands.

## Why this is still a separate plan from the refusal

`00126` fails CLOSED, runs on every tool call, and is a permission decision. This one
renders text on a screen: it fails SOFT, runs once when a human opens a decision, and
decides nothing. Different failure modes, different files, different review criteria.

They are separated so the human can take either, both, or neither — bounding and
visibility are the two answers to the same question, and picking between them is the
human's call, not a planner's.

## What the screen should say

Rendered between the title and the body at `streaming-gate.js:884`, before the human
is asked anything:

```
  Scope — what approving this grants write access to:
    src/lib/declared-breadth.js         1 file
    src/lib/streaming-gate.js           1 file
    tests/scope-shown-at-approval.js    1 file
                                        3 files total
```

and, when a declaration is unanchored:

```
  Scope — what approving this grants write access to:
    **                                  1,847 files  ← rooted at the repository
    (this plan declares an unanchored scope: "…")
                                        1,847 files total
```

Three properties this shape has, each chosen against a specific failure:

1. **The literal declared entries are printed**, not just a total. A total alone
   ("this grants 1,847 files") tells the human the size but not the shape, and the
   shape is what they can actually judge.
2. **A count that cannot be computed prints as `not counted`, never as `0`.** A
   no-match branch that returns a plausible verdict is this repository's central
   defect class. `0` would read as "grants nothing" — the most reassuring possible
   lie.
3. **The unanchored marker is spelled out in words**, not a symbol the human has to
   learn. "rooted at the repository" says the consequence.

The second rendering above is what makes `00126` answerable. When that plan lands, a
human who is refused for an unanchored declaration will already have seen, at the gate,
exactly which entry was unanchored and how much it reached.

## What stops working

Nothing. This plan adds rows to a screen and changes no decision anywhere. The
honest risks are the two below, and both are handled rather than hoped away:

| risk | handling |
|---|---|
| The walk makes opening a decision feel slow. | Bounded (see the cap), and measured at Step 9 against a stated budget. |
| A hostile plan file forges screen rows or emits terminal escapes through its `files:` entries. | Every rendered entry goes through the module's existing `stripCtl`, exactly as `renderPlanBody` already does for body lines. A declared path is author-controlled text arriving on a screen; it is treated as such. |

## Implementation Details

### Dependency graph

```
src/lib/declared-breadth.js   [CREATED HERE]
  ├─ isAnchored               [pure — no filesystem, no I/O; 00126 will call it
  │                            from the hook path, so it must stay pure]
  └─ countMatching ──requires→ safe-fs, path, plan-coverage.globToRegex
                              [the counting half reads the tree; NEVER on the hook path]

src/lib/streaming-gate.js ──requires→ src/lib/declared-breadth.js   [NEW edge]
```

No cycle. No layer violation. **The I/O lives in `countMatching` alone.** `isAnchored`
stays pure because `00126` will put it on the hook path; getting this wrong would put a
filesystem walk on every Edit call, which is the thing `00126` rejected a threshold
design for. The asymmetry is the point and must be written into the header.

### File: `src/lib/declared-breadth.js`
**Action:** CREATE
**Purpose:** The ONE encoding of "how wide is this declaration". Created here with an
I/O-free predicate half and an I/O counting half; `00126` later adds the enforcement
half to the same module.

Exports:

- `isAnchored(glob)` → `boolean`
  - `true` iff `glob` is a non-empty string whose FIRST `/`-separated segment
    contains none of `*` or `?`. Evaluate on the same normalized form
    `plan-coverage.scanForCoverage` computes (backslashes to forward slashes, then
    `path.posix.normalize`) so a Windows-authored `src\**` is judged identically to
    `src/**`. A leading `./` is collapsed by that normalization.
  - Non-string, empty string, or a leading empty segment (`/x`) → `false`.
  - **Pure. No I/O. Never throws.** `00126` calls this on the enforcement hook path,
    where a throw reaches a fail-OPEN catch and becomes an ALLOW, and where a
    filesystem read is a latency defect. Both constraints bind from the moment this
    function is written, even though this plan only renders with it.
- `countMatching(globs, root, opts)` → `{ perGlob: Array<{glob, count, anchored, capped}>, total: number|null, capped: boolean, walked: number }`
  - Walks the repository tree once from `root`, testing each relative path against
    every declared glob with `plan-coverage.globToRegex` — the SAME audited matcher
    the enforcement hook uses, so the number shown is the number that will be
    granted. **No second glob implementation.**
  - **SKIPS** `.git`, `node_modules`, and `.ctoc/state` (churn, and none of it is
    interesting to a human judging scope). Every skip is a documented constant, not a
    scattered condition.
  - **DOES NOT follow symbolic links** — `readdirSync(..., { withFileTypes: true })`
    and recurse only into a real directory entry. A link is counted as one entry. Two
    reasons: a link loop would hang the human's screen, and `00128` (shipped) and
    `00142` establish that a link inside the repository reaches outside it — a display
    that silently followed one would report a number for files that are not in this
    project.
  - **BOUNDED at 20,000 entries** (`opts.maxEntries`). On reaching the cap the walk
    stops and returns `capped: true` with `total: null`. The screen then prints
    `more than 20,000 — not counted`. **A capped walk never reports a number**, because
    a number derived from a truncated input is the truncate-then-parse defect this
    repository fences by name.
  - **Never throws.** An unreadable directory is skipped and counted in neither
    direction; a fault at the top level returns `total: null` with `walked: 0`.
  - `perGlob[i].anchored` calls `isAnchored` — one encoding, so the screen's marker
    and (once `00126` lands) the enforcer's refusal cannot disagree.

Deliberately NOT written here: `hasUnanchoredAcknowledgement` and `REFUSAL_REASON`.
They are the enforcement half and belong to `00126`, which is separately approvable.
This plan must not pre-build them — a module carrying an unused refusal token invites
the next reader to wire it up without the human's decision.

### File: `src/lib/streaming-gate.js`
**Action:** MODIFY — one rendered block, one helper

- Add `renderDeclaredScope(content, projectRoot)` → `string`, near `renderPlanBody`
  and following its conventions exactly: `stripCtl` on every emitted line, two-space
  indentation, an honest disclosure when anything is cut.
  - Parses the declared list with `plan-coverage.readPlanFiles(planPath, content)` —
    the content is already read at `:870`, so **no extra file read**.
  - No declarations → one line: `Scope — this plan declares no files.` That is
    itself worth seeing: an approved plan with no `files:` grants nothing, and a human
    looking at an empty scope learns something true.
  - More than 40 declared entries → print the first 40 and disclose the remainder
    (`… N more entries`), mirroring `MAX_BODY_LINES`' existing honesty.
  - Any fault → return a single line saying the scope could not be read, **never an
    empty string**. An empty string is indistinguishable from "grants nothing".
- Call it at `:884`, BEFORE `renderPlanBody`, so scope is above the prose rather than
  below 120 lines of it.
- Wrap the call in the module's established `try`/`catch` shape: a fault renders the
  fallback line and the gate screen still comes up. **The human's only approval
  surface must never be taken down by a display feature.**

### File: `tests/scope-shown-at-approval.test.js`
**Action:** CREATE
**Framework:** `node:test`, real `os.tmpdir()` fixtures, `path.join` throughout,
recursive-force cleanup in `finally`, no shell.

| # | Case | Assertion |
|---|---|---|
| 1 | **the defect, pinned** — `planDecisionScreen` on a plan declaring three files | the returned `text` CONTAINS all three declared paths. **This is red today** and is the whole finding |
| 2 | count correctness | a fixture tree with 7 files under `src/`; a plan declaring `src/**` reports 7 |
| 3 | the globstar case | a plan declaring `**` reports the whole fixture tree's file count, and the line carries the unanchored marker |
| 4 | anchored declarations carry no marker | `src/**` renders without it |
| 5 | **a capped walk reports no number** | `maxEntries: 3` over a larger tree → `total === null`, `capped === true`, and the screen text contains `not counted` and does NOT contain `0 files total` |
| 6 | **a fault reports no number** | a root that does not exist → `total === null`; the screen renders the could-not-read line and does not throw |
| 7 | no declarations | the screen says the plan declares no files |
| 8 | **control characters are stripped** | a plan declaring an entry containing `[31m` and `\n` renders with neither — no forged rows, no colour escape |
| 9 | **symbolic links are not followed** | a fixture with an in-tree link to an out-of-tree directory containing 50 files → the count does not include them |
| 10 | **the gate screen survives a broken scope render** | force the parse to fault; `planDecisionScreen` still returns its `text`, `ask` and `actions` |
| 11 | **the fence is not vacuous** | case 2's fixture with a plan declaring a path that matches nothing reports `0` for that entry while the total across other entries is non-zero — proving the counter can produce both a zero and a non-zero for the right reasons |
| 12 | many entries | 50 declared entries → 40 shown, `… 10 more entries` disclosed |
| 13 | **`isAnchored` is pure and total** | `src/**`, `tests/*.test.js`, `a/b/c.js` → `true`; `**`, `*`, `*.md`, `**/*.js`, `?rc`, `''`, `null`, `42` → `false`, **no throw**; and a Windows-authored `src\**` → `true` |

Case 13 is here because this plan now CREATES `isAnchored`, and a function created by
one plan and enforced by another must be pinned where it is born. `00126` re-pins it
more fully as a regression guard on its own guard — that duplication is deliberate,
not an oversight.

Cross-platform: case 9 creates its link with `fs.symlinkSync(target, linkPath, 'junction')`
for a directory, which Windows permits without elevation. **If link creation fails, the
test FAILS LOUDLY with the reason** — it does not skip. Zero-skipped is a gate here, and
a silently skipped case is a check that reports a verdict on input it never received.

### Wiring — the live call sites

| change | live call site | root |
|---|---|---|
| `declaredBreadth.countMatching` | `streaming-gate.renderDeclaredScope` | `planDecisionScreen` → the human's gate decision screen, reached from `/ctoc:menu` |
| `declaredBreadth.isAnchored` | `countMatching`'s `perGlob[].anchored`, rendered as the unanchored marker | the same screen |
| `streaming-gate.renderDeclaredScope` | `planDecisionScreen:884` | the same |
| `tests/scope-shown-at-approval.test.js` | the suite | `npm test` |

Nothing here is reachable only from a test. The root is the screen a human opens to
answer a gate — the only place this information can do any good.

## What this does NOT fix

1. **It refuses nothing.** A human who reads "1,847 files" and approves anyway has
   approved 1,847 files. That is `00126`'s job, and deliberately not this one's.
2. **Visibility only works if the human is actually shown it at the moment of
   choosing**, which is why this renders on the gate decision screen and nowhere else.
   It does NOT appear in the dashboard, the plan list, or any other surface. If the
   human approves through a path that does not pass `planDecisionScreen`, they see
   nothing — **and that path must be identified at Step 9**, not assumed absent.
3. **It shows scope, not consequence.** "1,847 files" does not say which of them are
   safety-critical. Ranking or flagging protected paths is a separate idea and is not
   built here.
4. **It does not change what an approval binds to.** The specification hash is
   untouched.
5. **The count is a snapshot.** Files created after approval are matched by the same
   glob and were never counted. A count is an aid to judgement at the moment of
   choosing, not a guarantee about the future, and the header must say so plainly.
6. **It does not know which plan is building.** That is `00129`, which has a measured
   blocker of its own — read it before assuming that gap closes.

## Execution Plan (Steps 8-16)

### Step 8: TEST
Write `tests/scope-shown-at-approval.test.js` in full and run **only that file, before
touching `src/`**. Record the starting state verbatim.

- **Case 1 must be RED** — today `planDecisionScreen`'s text contains none of the
  declared paths, because `renderPlanBody` strips the frontmatter. **If it is not red,
  STOP**: the finding is wrong and so is this plan.
- Cases 2-9, 11, 12 and 13 exercise a module that does not exist yet; record that.
- **Case 10 must be GREEN already** — the gate screen renders today — and must stay
  green. It is the proof this change cannot take the approval surface down.

### Step 9: PREPARE
Read from disk, in full: `src/lib/streaming-gate.js:190-300` and `:840-900`;
`src/lib/plan-coverage.js:236-340` for `readPlanFiles`' real signature and its
`globToRegex` export; and `src/lib/safe-fs.js` for the readdir surface.

**`src/lib/declared-breadth.js` must NOT already exist.** If it does, `00126` was built
out of order — **stop and report** rather than merging into it blind.

Then MEASURE:

1. **Every path by which a human can approve a plan.** Grep for `approvePlan` and
   `approveSubplans` call sites and establish which of them pass through
   `planDecisionScreen`. `approveSubplans` crosses a whole sibling BATCH on one
   decision — **if that path does not render a scope line, the batch case is a hole in
   this fix and must be reported to the human**, because it is the path that grants the
   most at once.
2. **The walk's cost on this repository**, with `node_modules` present. Report the
   entry count and the wall time. **Above roughly 300 milliseconds, stop and report** —
   this runs while a human waits at a decision screen, and the standing rule is that the
   human never waits for a computation.
3. **The real file count of this repository** under the skip rules, so the numbers in
   the Step 16 report are measured rather than illustrative. The `1,847` used in this
   plan's example is **an illustration, not a measurement**, and must not be repeated
   as fact.

### Step 10: IMPLEMENT
One step, files as sub-items.
- `src/lib/declared-breadth.js` — `isAnchored` (pure, total) and `countMatching`
  (bounded, link-free, total); the header carries the I/O-free-half / I/O-half split,
  why it matters, and that `00126` will add the enforcement half here.
- `src/lib/streaming-gate.js` — `renderDeclaredScope` and its call at `:884`, wrapped
  so a fault cannot take the screen down.
- `tests/scope-shown-at-approval.test.js` — the thirteen cases.

### Step 11: REVIEW
Confirm `isAnchored` is I/O-free and total, and that nothing outside `countMatching`
in this module touches the filesystem — `00126` will put `isAnchored` on the
enforcement hook path, and a filesystem read there is a latency defect while a throw
there becomes an ALLOW. Confirm the glob matcher is `plan-coverage.globToRegex` and
that no second glob implementation was written. Confirm every rendered line passes
`stripCtl`. Confirm the plan file is read once. Confirm `renderPlanBody`'s behaviour is
unchanged and its existing tests pass with no assertion modified.

### Step 12: OPTIMIZE
Confirm the tree is walked ONCE per screen render, not once per declared glob —
matching every glob against each path during a single pass. Confirm the cap short-
circuits the walk rather than being applied after it. Record the after-timing against
Step 9's number.

### Step 13: SECURE
- Confirm a hostile `files:` entry cannot forge screen rows or emit terminal escapes:
  newline, carriage return, `[`, and a very long single entry.
- Confirm the walk cannot be induced to leave the repository: an in-tree symbolic link
  to `/`, and a link loop. Neither may be followed; neither may hang.
- Confirm the cap holds against a deliberately deep tree, and that a capped result
  reports `not counted` rather than any number.
- Confirm `isAnchored` never throws on any hostile input — non-string, empty, control
  characters, a very long string. It is about to become a permission predicate.
- Confirm no absolute path leaks into the rendered text — repository-relative only.

### Step 14: VERIFY
Targeted run first: `tests/scope-shown-at-approval.test.js`,
every existing `streaming-gate` test file, `tests/plan-coverage-coverage.test.js`,
`tests/false-green-fence.test.js`, `tests/architecture-invariants.test.js`,
`tests/export-reachability.test.js`, `tests/doc-counts.test.js`.

Then the full gated run `npm test`; record `tests`, `suites`, `pass`, `fail`, the
zero-skipped counter and the coverage line **verbatim**. The floor must not be
lowered. Lint every changed JavaScript file at `--max-warnings 0`.

Then drive it as a human: open the gate decision screen for a real plan in this
repository and **read the rendered scope block**. A rendering feature verified only
by an assertion on a returned string has not been verified — the measure is the human.
Record what the screen actually said. **No git operations.**

### Step 15: DOCUMENT
Header text on the module covering: that it holds an I/O-free half and an I/O half and
why the split is load-bearing (`00126` puts `isAnchored` on the enforcement hook path);
the skip set for the walk and why each entry is in it; why links are not followed; why
a capped walk returns `null` and never a number; and that a count is a snapshot at
approval time, not a guarantee. A comment at `renderDeclaredScope`'s call site stating
that a fault here must never take the gate screen down.

### Step 16: FINAL-REVIEW
Report: the paths; the Step 8 verbatim red for case 1; every approval path found at
Step 9 and whether each renders scope — naming explicitly whether the batch approval
path does; the measured walk cost and repository file count; what the screen actually
said when driven by hand at Step 14; the verbatim green; the six things this does NOT
fix; and every decision taken under ambiguity.

## Ordering and file conflicts

**This plan builds FIRST of its pair.** `00126` declares `depends_on: 00127` and adds
the enforcement half to the module created here. Building `00126` first would ship a
consent mechanism whose question the human is never shown — see "THIS PLAN NOW BUILDS
FIRST".

**A concurrent executor is editing `src/lib/iron-loop.js`, `src/lib/actions.js` and
several test files.** This plan declares none of them. `src/lib/streaming-gate.js`
requires `actions.js` (`streaming-gate.js:46`) but does not modify it; the executor
must confirm at Step 9 that `approvePlan`'s signature has not moved and **stop and ask**
if it has.

This plan does NOT write into `plan-coverage`'s denial slot and adds no denial reason.
The canonical ranking rule for that slot is defined in `00126` under "THE DENIAL SLOT";
nothing here needs it, and nothing here may add a fourth writer.

If an existing `streaming-gate` test asserts the exact rendered text of the decision
screen, it will go red on an added block. Those files are **not declared here**. That
is scope growth: **stop, name the file and the exact change, and ask** — per the
sibling slice's Decision 18. Self-granting the scope would invalidate the approval
being acted under.

## Decisions Taken Under Ambiguity

1. **The declared entries are printed, not only a total.** A total gives size; the
   entries give shape, and shape is what a human can judge. Printing both costs three
   lines on a screen that already prints 120.
2. **THE DEPENDENCY IS INVERTED: this plan now builds first and creates
   `declared-breadth.js`.** `00126`'s acknowledgement key is unforgeable but was
   invisible, because this screen strips the frontmatter — so consent would have
   shipped before the ability to see what was being consented to. The anchoring
   predicate still has exactly one home; only which plan creates it changed. This
   plan's own earlier text pre-authorised the rewrite and called it small.
3. **`isAnchored` is written here as PURE and TOTAL even though this plan only needs
   it for a screen marker.** `00126` will call it on the enforcement hook path, where
   a filesystem read is a latency defect and a throw becomes an ALLOW. Writing it to
   the stricter contract from birth costs nothing; retrofitting it later is how the
   contract gets lost.
4. **`hasUnanchoredAcknowledgement` and `REFUSAL_REASON` are deliberately NOT
   pre-built here.** They are the enforcement half and belong to a separately
   approvable decision. A module carrying an unused refusal token invites the next
   reader to wire it up without the human ever deciding to.
5. **`countMatching` lives in `declared-breadth.js` rather than a new module.** The
   count and the refusal must agree; two modules encoding "how wide is this
   declaration" is the divergence surface this codebase names by name. The I/O
   asymmetry inside one module is documented instead of split away.
6. **The walk is capped at 20,000 entries and a capped walk reports NO number.**
   A number from a truncated walk is the truncate-then-parse defect this repository
   fences. `not counted` is the honest output.
7. **Symbolic links are not followed.** A loop would hang the human's screen, and
   `00128` established that an in-repository link can point outside — counting through
   one would report files that are not in this project.
8. **Scope renders ABOVE the body.** Below 120 lines of prose is functionally invisible,
   which would rebuild the defect in a new location.
9. **A fault renders a line, never an empty string.** Empty is indistinguishable from
   "grants nothing" — the most reassuring possible lie about a permission.
10. **The `1,847` in this plan is an ILLUSTRATION and is labelled as one.** Planning had
    no shell; the real number is measured at Step 9. A number written in a plan is a
    number someone later makes reality match.
11. **The batch approval path is a MEASUREMENT, not an assumption.** `approveSubplans`
    crosses every sibling on one human decision. Whether it renders scope was not
    verified during planning, and if it does not, that is reported as a hole rather than
    quietly fixed inside a plan that did not declare it.

### Decisions taken during implementation (Steps 8–16)

12. **`total` is the UNION of distinct files matching any declared glob, not the sum of
    per-glob counts.** Two overlapping globs (`src/**` and `**`) would double-count a
    file under a naive sum; the union is what an approval actually grants. Each file is
    tested against every glob (per-glob counts increment independently) but the total
    increments once per file matched by at least one glob.
13. **`renderDeclaredScope(content, projectRoot, opts)` gained an optional third `opts`
    param, forwarded to `countMatching` (only `maxEntries` today).** The production call
    at `planDecisionScreen` passes none, so behaviour is the default 20,000 cap; the
    param exists so the capped-render path is drivable by a test with a small cap
    (`maxEntries: 3`) over a real tree, rather than requiring a 20,000-file fixture.
14. **Batch approval (`approveSubplans`) is the MEASURED HOLE this plan does not close.**
    Confirmed at Step 9: `approveSubplans` (the `todo-all` / `done-all` word shortcuts)
    crosses a whole sibling batch directly through `actions.js` and NEVER passes through
    `planDecisionScreen`, so it renders no scope block. A human crossing a batch on one
    decision still sees no file list. This is exactly the hole the plan said to report,
    not fix: closing it means rendering scope on the batch-approval surface, which this
    plan did not declare and must not self-grant.
15. **Measured facts (Step 9), replacing the plan's illustrative `1,847`.** This
    repository holds **2,213** real files under the walk's skip rules (`.git`,
    `node_modules`, `.ctoc/state`); a full walk with `node_modules` present touched
    ~2,491 entries in ~21 ms — far under both the 300 ms budget and the 20,000-entry
    cap. The `1,847` in the plan body was an illustration and is not the real number.
16. **The per-glob line renders as `    {glob}  —  {count}`**, the unanchored marker as
    `  ← rooted at the repository` with a spelled-out follow-up note, and a
    cannot-be-counted result as `not counted` (capped) or `the scope size could not be
    counted` (walk fault) — never `0`. Every emitted line passes the module's `stripCtl`.
