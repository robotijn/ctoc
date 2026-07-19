---
approved_by: human
approved_at: 2026-07-19T21:31:41.164Z
gate_crossed: implementation → todo
---

---
title: "The human approving a plan is never shown the files it grants — the gate screen strips the frontmatter, and the file list IS the write permission"
type: implementation
parent_plan: ctoc-background-engine-rebuild
depends_on: 00126-one-character-separates-a-normal-declaration-from-the-whole-repository
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

## Why this is a separate plan from the refusal

The sibling plan `00126` refuses an unanchored declaration on the hook path. That
change fails CLOSED, runs on every tool call, and is a permission decision. This one
renders text on a screen: it fails SOFT, runs once when a human opens a decision, and
decides nothing. Different failure modes, different files, different review criteria.

They are separated so the human can take either, both, or neither — bounding and
visibility are the two answers to the same question, and picking between them is the
human's call, not a planner's.

**The dependency is real and one-directional.** The number shown here and the rule
enforced there must agree, or the screen tells the human something the enforcer will
contradict. So the anchoring predicate has ONE home — `src/lib/declared-breadth.js`,
created by `00126` — and this plan ADDS the counting function to that same module
rather than starting a second encoding of "how wide is this declaration".

**If the human wants visibility WITHOUT the refusal**, this plan must be rewritten to
create `declared-breadth.js` itself with the counting function alone, and `00126`'s
dependency inverts. That is a small rewrite and it is stated here so the choice is
genuinely free rather than quietly foreclosed by an ordering.

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
src/lib/declared-breadth.js   [created by 00126; this plan ADDS countMatching]
  └─requires→ safe-fs, path   [NEW — the counting half reads the tree; the
                               anchoring predicate stays I/O-free]

src/lib/streaming-gate.js ──requires→ src/lib/declared-breadth.js   [NEW edge]
```

No cycle. No layer violation. **The I/O is added to a NEW function only** — 
`isAnchored` and `hasUnanchoredAcknowledgement` stay pure and stay on the hook path;
`countMatching` never runs there. Getting this wrong would put a filesystem walk on
every Edit call, which is the thing `00126` rejected a threshold design for.

### File: `src/lib/declared-breadth.js`
**Action:** MODIFY — add the counting half

Add one export:

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
    reasons: a link loop would hang the human's screen, and `00128` is closing the
    fact that a link reaches outside the repository — a display that silently followed
    one would report a number for files that are not in this project.
  - **BOUNDED at 20,000 entries** (`opts.maxEntries`). On reaching the cap the walk
    stops and returns `capped: true` with `total: null`. The screen then prints
    `more than 20,000 — not counted`. **A capped walk never reports a number**, because
    a number derived from a truncated input is the truncate-then-parse defect this
    repository fences by name.
  - **Never throws.** An unreadable directory is skipped and counted in neither
    direction; a fault at the top level returns `total: null` with `walked: 0`.
  - `perGlob[i].anchored` reuses `isAnchored` — one encoding, so the screen's marker
    and the enforcer's refusal cannot disagree.

Note the deliberate asymmetry, which must be written into the header: **this module
now has an I/O-free half and an I/O half, and the split is the point.** A future
maintainer who "simplifies" by calling `countMatching` from the anchoring guard puts a
tree walk on every tool call.

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
| 8 | **control characters are stripped** | a plan declaring an entry containing `[31m` and `\n` renders with neither — no forged rows, no colour escape |
| 9 | **symbolic links are not followed** | a fixture with an in-tree link to an out-of-tree directory containing 50 files → the count does not include them |
| 10 | **the gate screen survives a broken scope render** | force the parse to fault; `planDecisionScreen` still returns its `text`, `ask` and `actions` |
| 11 | **the fence is not vacuous** | case 2's fixture with a plan declaring a path that matches nothing reports `0` for that entry while the total across other entries is non-zero — proving the counter can produce both a zero and a non-zero for the right reasons |
| 12 | many entries | 50 declared entries → 40 shown, `… 10 more entries` disclosed |

Cross-platform: case 9 creates its link with `fs.symlinkSync(target, linkPath, 'junction')`
for a directory, which Windows permits without elevation. **If link creation fails, the
test FAILS LOUDLY with the reason** — it does not skip. Zero-skipped is a gate here, and
a silently skipped case is a check that reports a verdict on input it never received.

### Wiring — the live call sites

| change | live call site | root |
|---|---|---|
| `declaredBreadth.countMatching` | `streaming-gate.renderDeclaredScope` | `planDecisionScreen` → the human's gate decision screen, reached from `/ctoc:menu` |
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

## Execution Plan (Steps 8-16)

### Step 8: TEST
Write `tests/scope-shown-at-approval.test.js` in full and run **only that file, before
touching `src/`**. Record the starting state verbatim.

- **Case 1 must be RED** — today `planDecisionScreen`'s text contains none of the
  declared paths, because `renderPlanBody` strips the frontmatter. **If it is not red,
  STOP**: the finding is wrong and so is this plan.
- Cases 2-9, 11 and 12 exercise a function that does not exist yet; record that.
- **Case 10 must be GREEN already** — the gate screen renders today — and must stay
  green. It is the proof this change cannot take the approval surface down.

### Step 9: PREPARE
Read from disk, in full: `src/lib/streaming-gate.js:190-300` and `:840-900`;
`src/lib/declared-breadth.js` as `00126` actually built it (**not as `00126`
described it** — the code wins); `src/lib/plan-coverage.js:236-340` for
`readPlanFiles`' real signature; and `src/lib/safe-fs.js` for the readdir surface.

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
- `src/lib/declared-breadth.js` — `countMatching`, bounded, link-free, total; the
  header gains the I/O-free-half / I/O-half split and why it matters.
- `src/lib/streaming-gate.js` — `renderDeclaredScope` and its call at `:884`, wrapped
  so a fault cannot take the screen down.
- `tests/scope-shown-at-approval.test.js` — the twelve cases.

### Step 11: REVIEW
Confirm `isAnchored` and `hasUnanchoredAcknowledgement` remain I/O-free and that
nothing on the hook path calls `countMatching` — grep the enforcement path and prove
it. Confirm the glob matcher is `plan-coverage.globToRegex` and that no second glob
implementation was written. Confirm every rendered line passes `stripCtl`. Confirm the
plan file is read once. Confirm `renderPlanBody`'s behaviour is unchanged and its
existing tests pass with no assertion modified.

### Step 12: OPTIMIZE
Confirm the tree is walked ONCE per screen render, not once per declared glob —
matching every glob against each path during a single pass. Confirm the cap short-
circuits the walk rather than being applied after it. Record the after-timing against
Step 9's number.

### Step 13: SECURE
- Confirm a hostile `files:` entry cannot forge screen rows or emit terminal escapes:
  newline, carriage return, `[`, and a very long single entry.
- Confirm the walk cannot be induced to leave the repository: an in-tree symbolic link
  to `/`, and a link loop. Neither may be followed; neither may hang.
- Confirm the cap holds against a deliberately deep tree, and that a capped result
  reports `not counted` rather than any number.
- Confirm no absolute path leaks into the rendered text — repository-relative only.

### Step 14: VERIFY
Targeted run first: `tests/scope-shown-at-approval.test.js`,
`tests/declared-breadth.test.js`, every existing `streaming-gate` test file,
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
Header text on `countMatching` covering: the skip set and why each entry is in it; why
links are not followed; why a capped walk returns `null` and never a number; and that a
count is a snapshot at approval time, not a guarantee. A comment at
`renderDeclaredScope`'s call site stating that a fault here must never take the gate
screen down.

### Step 16: FINAL-REVIEW
Report: the paths; the Step 8 verbatim red for case 1; every approval path found at
Step 9 and whether each renders scope — naming explicitly whether the batch approval
path does; the measured walk cost and repository file count; what the screen actually
said when driven by hand at Step 14; the verbatim green; the five things this does NOT
fix; and every decision taken under ambiguity.

## Ordering and file conflicts

**Builds after `00126`**, which creates `src/lib/declared-breadth.js`. Building this
first would either duplicate the anchoring predicate or ship a module with no
enforcement consumer.

**A concurrent executor is editing `src/lib/iron-loop.js`, `src/lib/actions.js` and
several test files.** This plan declares none of them. `src/lib/streaming-gate.js`
requires `actions.js` (`streaming-gate.js:46`) but does not modify it; the executor
must confirm at Step 9 that `approvePlan`'s signature has not moved and **stop and ask**
if it has.

If an existing `streaming-gate` test asserts the exact rendered text of the decision
screen, it will go red on an added block. Those files are **not declared here**. That
is scope growth: **stop, name the file and the exact change, and ask** — per the
sibling slice's Decision 18. Self-granting the scope would invalidate the approval
being acted under.

## Decisions Taken Under Ambiguity

1. **The declared entries are printed, not only a total.** A total gives size; the
   entries give shape, and shape is what a human can judge. Printing both costs three
   lines on a screen that already prints 120.
2. **`countMatching` lives in `declared-breadth.js` rather than a new module.** The
   count and the refusal must agree; two modules encoding "how wide is this
   declaration" is the divergence surface this codebase names by name. The I/O
   asymmetry inside one module is documented instead of split away.
3. **The walk is capped at 20,000 entries and a capped walk reports NO number.**
   A number from a truncated walk is the truncate-then-parse defect this repository
   fences. `not counted` is the honest output.
4. **Symbolic links are not followed.** A loop would hang the human's screen, and
   `00128` establishes that an in-repository link can point outside — counting through
   one would report files that are not in this project.
5. **Scope renders ABOVE the body.** Below 120 lines of prose is functionally invisible,
   which would rebuild the defect in a new location.
6. **A fault renders a line, never an empty string.** Empty is indistinguishable from
   "grants nothing" — the most reassuring possible lie about a permission.
7. **The `1,847` in this plan is an ILLUSTRATION and is labelled as one.** Planning had
   no shell; the real number is measured at Step 9. A number written in a plan is a
   number someone later makes reality match.
8. **The batch approval path is a MEASUREMENT, not an assumption.** `approveSubplans`
   crosses every sibling on one human decision. Whether it renders scope was not
   verified during planning, and if it does not, that is reported as a hole rather than
   quietly fixed inside a plan that did not declare it.
