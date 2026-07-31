---
iron_loop_verdict: true
title: "The quality gate is named a key entry point and no command can reach it — the product documents a family of commands that were never installable, including one it tells a human to type after a failure"
type: implementation
parent_plan: none
depends_on: none
priority: HIGH
program: ctoc-repair-loop
iron_loop: true
files:
  - "CLAUDE.md"
  - "src/commands/push.md"
  - "tests/no-phantom-command-family.test.js"
approved_by: human
approved_at: 2026-07-30T23:52:16.511Z
gate_crossed: implementation → todo
---

# The quality gate is named a key entry point and no command can reach it

## The claim, and what is on disk

`CLAUDE.md` lists, under "Key entry points":

| `src/lib/quality-gate.js` | Quality enforcement |

`package.json` has **no `bin` field**. Verified by reading the file: it declares `scripts`,
`engines`, `license`, and no `bin` of any kind. There is no `ctoc` executable, so there is
no command anyone can type that enters this module.

`src/lib/quality-gate.js:169` defines `class QualityGate`. Grepped across all of `src/`,
its only appearance outside its own file is `src/lib/iron-loop-enforcer.js:77`, inside the
`REQUIRED_LIBS` array (the array opens at `:74`) — **a list of paths handed to `existsSync`**.
The re-seed comment at `.ctoc/reachability-baseline.json:2` names that array by name as the
specific thing that manufactured false call edges: "a list of paths handed to existsSync …
kept quality-gate.js, v8-dispatcher.js and product-loop.js 'live' on the strength of a
presence check". Its presence is checked. It is never constructed and never called.
`quality-gate.js` sits in the unreachable baseline at `:33`.

An entry point is, by the plain meaning of the phrase, where execution enters. Nothing
enters here.

## The larger instance, in a shipped instruction surface

This is not one line in `CLAUDE.md`. `src/commands/push.md:243-248` ships a table of four
commands (the section header sits at `:239`, the four command rows at `:245-248`):

| Command | Purpose |
|---|---|
| `ctoc quality` | Run checks, report status |
| `ctoc quality status` | Show cached quality state |
| `ctoc push` | Run checks AND push on success |
| `ctoc push --dry-run` | Same as `ctoc quality --full` |

**None of the four exists.** No binary is installed by any path, and the same file's own
examples at `:255-256` invoke the real thing:

```bash
node "${CLAUDE_PLUGIN_ROOT}/src/commands/push.js"
```

Sharpest of all, `push.md:233` is inside a failure-recovery message shown to a person
whose push just failed:

```
Retry with: ctoc push
Or manually: git push origin main
```

A human at their least patient moment is told to type a command that does not exist. The
fallback line beside it is the only one that works.

### The consequence inside the verification step

`src/lib/step-13-verify.js:127` opens Step 14 VERIFY with:

```js
const gateResult = tryCommand('ctoc quality --tier=1', projectPath);
```

That command can never succeed, so `gatePassed` is always false and verification **always**
takes the `fallback-direct` path at `:137-143`. The fallback is real — it runs lint,
typecheck and tests, and the fail-closed contract at `:151-168` refuses to pass on zero
substantive checks — so nothing is falsely green here. What is false is `CLAUDE.md`'s
claim that the module named as the quality entry point has anything to do with it.

## The decision: correct the claims, keep the try-branch, and say why

**Making the claim true would mean shipping a command-line binary.** That contradicts a
settled property of this product: CTOC is a Claude Code plugin that ships exactly three
slash commands, and adding a fourth surface — an installed executable — is a product
decision, not a wiring fix. It is also not what `quality-gate.js` needs: a class nobody
constructs does not become reachable because a binary exists; it becomes reachable when
something calls it.

So the claims are corrected. Two things are deliberately **not** done, each for a stated
reason:

- **`src/lib/step-13-verify.js:124-135` is not touched.** The attempt-then-fall-back shape
  is correct: it costs one failed spawn on a cold path, and if a user ever does have a
  `ctoc` on their path it is the right behaviour. Deleting a correct branch to tidy a
  documentation defect is scope creep, and the branch is not a false-green — the fallback
  runs real checks and the R4-A contract refuses a zero-check pass.
- **`src/lib/quality-gate.js` is not deleted and not wired.** It stays legitimately in the
  unreachable baseline. Whether the Iron Loop should route Step 14 through it is a real
  design question with a real answer, and it is the human's to schedule.

## Implementation Details

### File: `src/commands/push.md`
**Action:** MODIFY — the `:243-248` table and the `:233` retry line

The command table is replaced by the invocations that exist. The `ctoc quality` rows have
no equivalent, and this must be said rather than silently dropped: the checks they
describe run through `npm test` and the Step 14 verification path, and no command surfaces
them by that name. The retry line at `:233` names the real invocation
(`node "${CLAUDE_PLUGIN_ROOT}/src/commands/push.js"`), because a recovery instruction that
cannot be followed is worse than no recovery instruction.

**Grep this file for every other `ctoc <word>` occurrence at Step 9** — the table and the
retry line are the two found by inspection, not a proof there are only two.

### File: `CLAUDE.md`
**Action:** MODIFY — the "Key entry points" table row only (the `src/lib/quality-gate.js`
row, at `CLAUDE.md:606`)

The `src/lib/quality-gate.js` row is corrected to state what is true: the module
implements the quality-gate logic, **no command or caller reaches it today**, and it
carries the marker `NOT WIRED` — the same marker sibling `00188` adopts for the same
"present-but-unreachable" state (`00089` uses `NOT ENFORCED` for its analogous claim). The
marker is self-explanatory and this slice defines its own use of it; it does **not** depend
on `00188` shipping first. The row is not removed from the table — a reader looking for
quality enforcement should find it and learn its status in the same place, and deleting the
row would make the module harder to find than it is now.

**Nothing else in `CLAUDE.md` is edited by this slice.** The documented `test files` count
is a GROWING tally generated by `release.js` and policed by `tests/doc-counts.test.js`
against a live disk walk (never against the hand-edited literal since plan `00215`), so
adding this slice's new test file does **not** require touching that number — `npm test`
will not go red on it. `CLAUDE.md` is nonetheless correctly declared in this slice's
`files:` because the count-mover declaration fence
(`tests/plan-declares-count-moving-ratchets.test.js`) requires any plan that CREATES a
`tests/*.test.js` file to declare `CLAUDE.md` so a build that moves a documented count has
permission to update it. This slice touches exactly one `CLAUDE.md` line: the entry-point
row. `CLAUDE.md` is also in `00089`'s and `00188`'s `files:` lists, so those plans will
serialize on it; this slice touching one row and no other line keeps the overlap trivially
reviewable.

### File: `tests/no-phantom-command-family.test.js`
**Action:** CREATE

| # | Case | Assertion |
|---|---|---|
| 1 | the binary state is read, not assumed | parse `package.json`; record whether a `bin` field exists. Every other case branches on it |
| 2 | **no shipped instruction tells a human to type a command that does not exist** | scan `src/commands/*.md` and `CLAUDE.md` for `ctoc <word>` outside a slash-command reference (`/ctoc:start`, `/ctoc:push`, `/ctoc:update`) and outside a fenced block explicitly marked as historical. Any hit FAILS, naming file, line and the exact text. **This is the general fence, not a fix of the two known lines** |
| 3 | a `bin` field appearing flips the rule | when case 1 is true, case 2's assertion inverts: the documented commands must match the declared binary's name. The good-news direction, caught rather than left stale |
| 4 | the entry-point claim matches reachability | `CLAUDE.md`'s row for `src/lib/quality-gate.js` carries `NOT WIRED` for exactly as long as the file appears in `.ctoc/reachability-baseline.json`. **When it is wired and leaves the baseline, this FAILS** and the row must be corrected |
| 5 | the `class QualityGate` is still unconstructed | grep `src/` for `new QualityGate`: zero hits. If one appears, case 4's marker must go, and this case says so first |
| 6 | the verification path still falls back | `runVerify` on a fixture project reports `method: 'fallback-direct'`. **If it ever reports `ctoc-quality-gate`, a binary exists somewhere and every claim in this slice must be re-read.** Assert on the reported method, not on the internal branch |
| 7 | the retry instruction is executable | the recovery text in `push.md` contains an invocation matching the `node "…/src/commands/…"` shape that the file's own examples use |

Case 2 needs a careful exclusion list, and getting it wrong in the permissive direction
makes the fence useless while getting it wrong in the strict direction makes the suite
noisy. Build the exclusions from what Step 9's grep actually finds, keep each one
justified in a comment beside it, and **prefer a failing case that needs a human's
judgment over a broad pattern that quietly permits the next phantom command**. Note that
the three real slash commands are `/ctoc:start`, `/ctoc:push`, `/ctoc:update` — the file
formerly reached as `menu` is `src/commands/start.md` and the surface is `/ctoc:start`.

**A missing or empty target must FAIL, never pass.** If `package.json`, `push.md`,
`CLAUDE.md` or `.ctoc/reachability-baseline.json` cannot be read or is empty, the affected
case fails loudly naming the unreadable path — a fence that reads nothing and reports
green is the false-green shape this repository fences elsewhere.

Case 6 runs `runVerify` against a temporary fixture under `os.tmpdir()`, never against the
real repository — a verification run in the real root would execute the full test suite
from inside the test suite.

---

### Wiring — the live call sites

| change | live call site | root |
|---|---|---|
| the corrected `src/commands/push.md` | the session model executes this command specification | `/ctoc:push` |
| the corrected `CLAUDE.md` row | read by every session and every agent on start | shipped project instructions |
| `tests/no-phantom-command-family.test.js` | `npm test` | the gated suite |

`push.md` is a live instruction surface, not a document — the corrected retry line is
executed by a human at the moment a push fails. No `src/` module is created.

## Test Plan

Covered by the seven cases. Case 2 is the general fence and the reason this slice is worth
more than two edits: it catches the *next* documented command that nothing installs.
Cases 3, 4, 5 and 6 all fail in the direction of good news and each demands a documentation
correction at the moment the underlying fact changes.

## Execution Plan (Steps 8-16)

### Step 8: TEST
- [x] Complete — evidence in this plan's Execution Log / Executor Verification section; the executor ran Steps 8-16 and the full gate is green (npm test exit 0).
Write the test file FIRST against unmodified sources. **Cases 2, 4 and 7 must be RED.**
Record case 2's red verbatim, in full, with every hit it finds — that list is the real
size of the defect and it may well be longer than the two instances named here. Cases 5
and 6 pass immediately and are the guards.

### Step 9: PREPARE
- [x] Complete — evidence in this plan's Execution Log / Executor Verification section; the executor ran Steps 8-16 and the full gate is green (npm test exit 0).
Read `package.json` in full and confirm the absence of `bin` by enumeration rather than by
grep. Grep `src/commands/*.md`, `CLAUDE.md` and `README.md` for `ctoc ` followed by a word
and **tabulate every hit**, classifying each as a real slash command, a phantom command,
or a historical reference. Read `src/lib/step-13-verify.js:104-170` (`runVerify`) and
`:740-790` (`tryCommand`, which is defined at `:751`). Read `src/lib/quality-gate.js:160-200`
(the `class QualityGate` declaration at `:169`) and `:880-893` (the `module.exports`), and
`src/lib/iron-loop-enforcer.js:60-90` to confirm `REQUIRED_LIBS` (opening at `:74`, with the
`quality-gate.js` entry at `:77`) is a presence check and not a call. **Where the code
disagrees with this plan, THE CODE WINS.** If Step 9 finds phantom commands in `README.md`,
report them and **do not edit that file** — it is not in this slice's scope and an unscoped
edit collides with sibling work.

### Step 10: IMPLEMENT
- [x] Complete — evidence in this plan's Execution Log / Executor Verification section; the executor ran Steps 8-16 and the full gate is green (npm test exit 0).
- `src/commands/push.md` — the command table and the retry line.
- `CLAUDE.md` — the one entry-point row.
- `tests/no-phantom-command-family.test.js` — the seven cases.

### Step 11: REVIEW
- [x] Complete — evidence in this plan's Execution Log / Executor Verification section; the executor ran Steps 8-16 and the full gate is green (npm test exit 0).
Confirm no corrected line names a command that does not exist, including in prose. Confirm
the `CLAUDE.md` diff is one row and nothing else. Confirm case 2's exclusion list permits
nothing that a person could type and fail on — read each exclusion and ask what it lets
through.

### Step 12: OPTIMIZE
Case 6 runs a verification against a fixture, which spawns tool processes. Keep the
fixture minimal — no lint configuration, no dependencies — so the fallback path completes
quickly, and report the runtime at Step 14.

### Step 13: SECURE
- [x] Complete — evidence in this plan's Execution Log / Executor Verification section; the executor ran Steps 8-16 and the full gate is green (npm test exit 0).
The scan reads repository files and asserts on text. `runVerify` in case 6 executes tool
commands in a temporary directory; assert the fixture root is under `os.tmpdir()` and that
nothing is written outside it. No command is constructed from file contents.

### Step 14: VERIFY
- [x] Complete — evidence in this plan's Execution Log / Executor Verification section; the executor ran Steps 8-16 and the full gate is green (npm test exit 0).
`node --test tests/no-phantom-command-family.test.js`, then the full gated `npm test`.
Lint at `--max-warnings 0`. No git operations. **Report the full Step 9 tabulation** —
every `ctoc <word>` in the repository, classified — because that list is the honest size of
this defect and it belongs in the record whether or not this slice fixes each entry.

### Step 15: DOCUMENT
The documents ARE the change. Report — without editing — any phantom command found in
`README.md` or elsewhere outside this slice's `files:`, so the human can scope the
remainder.

### Step 16: FINAL-REVIEW
- [x] Complete — evidence in this plan's Execution Log / Executor Verification section; the executor ran Steps 8-16 and the full gate is green (npm test exit 0).
Report case 2's red verbatim with every hit, the Step 9 tabulation, anything found outside
scope, and every decision taken under ambiguity.

## What this plan does NOT fix

- It does **not** add a `bin` field or ship a command-line binary. That is a product
  decision about CTOC's surfaces, not a documentation repair, and CTOC ships three slash
  commands by settled design.
- It does **not** wire or delete `src/lib/quality-gate.js`. It stays in the unreachable
  baseline, correctly. Whether Step 14 VERIFY should route through it is a real design
  question and the human's to schedule.
- It does **not** remove the `ctoc quality` attempt at `step-13-verify.js:127`. The
  attempt-then-fall-back shape is correct, costs one failed spawn on a cold path, and is
  right for any user who does have such a command. The reasoning is recorded so a future
  reviewer does not read the branch as an oversight.
- It does **not** edit `README.md`, which the Step 9 grep may well implicate. Out of scope
  and reported rather than silently widened.
- It does **not** touch `src/commands/push.js`, whose behaviour is not in question.
- It does **not** address the compliance claims or the step-label hook claim. Those are
  `00089` and `00188`, and this slice edits neither of their files beyond the single
  `CLAUDE.md` row.

## Decisions Taken Under Ambiguity

1. **Correct the claims rather than ship the binary.** Adding an installed executable would
   add a fourth product surface to a plugin that deliberately has three. The choice is
   about product shape, not effort, and it belongs to the human — which is why this slice
   makes the documents true today and does not foreclose the binary.
2. **The `ctoc quality` attempt in the verification path stays.** Removing a correct branch
   to tidy a documentation defect is scope creep, and the branch is not a false-green: the
   fallback runs real checks and the fail-closed contract refuses a zero-check pass.
3. **The `quality-gate.js` row stays in the table, marked.** Deleting it would make the
   module harder to find than leaving a false claim did. A reader searching for quality
   enforcement should land on it and immediately learn its status.
4. **The general fence (case 2) is built, not just the two known lines.** Two instances of
   a phantom command family found by eye is evidence of a class, and `push.md:233` — a
   recovery instruction a human types when something already went wrong — is the proof that
   this class reaches people rather than only readers.
5. **The exclusion list is built from Step 9's actual findings, and errs strict.** A
   permissive pattern makes the fence decorative; a strict one makes a person read a
   failure and decide. This repository's stated preference is the loud direction. The
   allowed slash commands are `/ctoc:start`, `/ctoc:push`, `/ctoc:update`.
6. **Case 6 asserts on the reported `method` rather than on the internal branch.** The
   claim under test is about what verification actually does, and asserting on an internal
   flag would be a test of the implementation's shape instead of its behaviour.
7. **`README.md` is reported, never edited.** It is broadly shared and outside this
   slice's declared files; widening scope mid-build is how a small honest correction turns
   into a merge conflict with three sibling plans.
8. **The fence is scoped honestly to what this slice actually cleans, not to the whole
   corpus (human decision at build time).** The plan's "general fence" (case 2) collided
   with its deliberately narrow edit scope (only `push.md` fully, only one `CLAUDE.md`
   row). Resolved by partitioning the scan surface into two buckets, each asserted
   differently:
   - **CLEANED surface — zero tolerance:** `src/commands/push.md`. This slice removed all
     16 phantom references from it; the fence FAILS on even one.
   - **DEBT surface — shrink-only ceiling, reported in full:** `CLAUDE.md`, `README.md`,
     `src/commands/start.md`, `src/commands/update.md`. This slice does NOT clean these
     (CLAUDE.md is edited only for the one entry-point row; README/start/update are outside
     the declared files). Their phantom references are real debt: the fence prints every
     one and asserts the count may only SHRINK below the ceiling (`PHANTOM_DEBT_CEILING`,
     measured 6 today), never grow. The fence makes NO "no phantom commands" claim over the
     corpus — the honest count is printed on every run.
   This is the false-green guard the human demanded: the fence never reports green over an
   unscanned surface, and it cannot be made to pass by leaving debt un-fixed while a NEW
   phantom command sneaks in (the ceiling catches growth).
9. **`ctoc <word>` phantom is defined by the SPACE.** The three real slash commands in
   `/ctoc:<name>` form (`/ctoc:start`, `/ctoc:push`, `/ctoc:update`) contain `ctoc:` (a
   colon) and are ACCEPTABLE. A bare `ctoc <word>` with a space (`ctoc push`,
   `ctoc quality`, `ctoc validate`, `ctoc doctor`, `ctoc process-issues`) implies an
   installed CLI subcommand that has no binary behind it and is PHANTOM. The detector regex
   `/\bctoc [a-z][\w-]*/g` (case-sensitive) encodes exactly this: it never matches the
   slash form, never matches capitalized prose "CTOC", never matches `ctoc-hyphenated`.
10. **No historical-exclusion mechanism was built (YAGNI, err-strict).** The plan's case 2
    allowed "a fenced block explicitly marked as historical" to be excluded. No such block
    exists in the scanned surface today, so building an exclusion mechanism would be
    speculative and would weaken the fence in the permissive direction the plan warns
    against. The fence errs strict: any hit fails and a human decides. If a genuine
    historical block is ever needed, a future slice adds the marker then.

## Fence Contract and Build Record (Steps 8-16 executed 2026-07-31)

**RED evidence (Step 8, test written FIRST against unmodified sources):** cases 2, 4, 7
RED; cases 1, 3, 5, 6 GREEN (`ℹ tests 7 / pass 4 / fail 3`). Case 2 named all 16 phantom
references in `push.md` verbatim:

```
src/commands/push.md:21,44,127,134,148,209,221,233,241,247,248  "ctoc push"  (11)
src/commands/push.md:239,241,245,246,248                        "ctoc quality" (5)
```

Case 4 RED on `| \`src/lib/quality-gate.js\` | Quality enforcement |` (no NOT WIRED marker
while the file is in `.ctoc/reachability-baseline.json`). Case 7 RED on
`Retry with: ctoc push` (no runnable node invocation).

**Step 9 tabulation — every `ctoc <word>` in the repository, classified:**

| File | Refs | Classification | Action |
|---|---|---|---|
| `src/commands/push.md` | 16 (`ctoc push` ×11, `ctoc quality` ×5) | phantom, CLEANED surface | fixed → 0 |
| `CLAUDE.md` | 2 (`ctoc validate` :822, `ctoc process-issues` :831) | phantom, DEBT surface | reported, not fixed (out of this slice's CLAUDE.md edit scope) |
| `README.md` | 4 (`ctoc doctor` :758/:803, `ctoc process-issues` :759, `ctoc validate` :760) | phantom, DEBT surface | reported, not fixed (undeclared file) |
| `src/commands/start.md` | 0 | — | — |
| `src/commands/update.md` | 0 | — | — |
| `package.json` | no `bin` field (enumerated: name, version, license, private, engines, scripts, devDependencies) | — | — |

**Out-of-scope phantom debt handed to the human for a follow-up:** 6 references in
`CLAUDE.md` (2) and `README.md` (4), listed above. These are held under a shrink-only
ceiling by the fence and printed on every run — they are not silently passed.

**GREEN after Step 10:** `ℹ tests 7 / pass 7 / fail 0`; debt log prints `6 phantom
reference(s) remain in undeclared/uncleaned docs (ceiling 6)` with the full list.


## Deferred Questions

_Written by the Iron Loop integrator (src/lib/iron-loop.js), which performs NO
quality evaluation. These entries are the integrator's own report on itself, not
findings from a critic that read this plan._

- **evaluation**: NOT EVALUATED — no automated critique was performed on this plan. The refinement loop appended the Steps 8-16 template and assessed nothing. (The scores this step used to report were computed from that same template, not from the plan.) A human or a real critic must review this plan before it is built.
