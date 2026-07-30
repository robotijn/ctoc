---
iron_loop_verdict: true
title: "The refinement loop is documented as a running mechanism and is a design record — ten of its exports are dead, its named driver cannot dispatch or execute, and one of its listed files does not exist"
type: implementation
parent_plan: none
depends_on: none
priority: HIGH
program: ctoc-repair-loop
iron_loop: true
files:
  - "docs/REFINEMENT_LOOP.md"
  - "tests/refinement-loop-claims-match-code.test.js"
  - "CLAUDE.md"
approved_by: human
approved_at: 2026-07-30T19:04:14.682Z
gate_crossed: implementation → todo
---

# The refinement loop is documented as a running mechanism

## What the document promises

`docs/REFINEMENT_LOOP.md` opens with "A multi-agent iterative critic-implement-test cycle
that converges on a code state with zero critical-severity findings", carries a ten-point
decision record with citations to published research, and describes a round in the present
tense at `:25-68`: "CTO Chief dispatches N critics in PARALLEL via Task tool… CTO Chief
writes the JSON letter… CTO Chief dispatches in SEQUENCE: test-writer… implementer…
Verifier confirms…"

A reader — a human evaluating CTOC, or an agent instructed to read the specification —
concludes this loop runs.

## What is on disk, verified 2026-07-30

### Ten of the module's exports have no caller

`.ctoc/export-reachability-baseline.json` lists exactly ten dead exports from
`src/lib/refinement-loop.js` (entries at `:36-45` in the baseline today — the file was
re-seeded again since this plan was first written, so take the list from the file, never
from a cited line range):

```
appendRound · buildLetter · computeFingerprint · detectImplementerWall
detectOscillation · fingerprintsMatchFuzzy · phaseConverged · selectPanel
shouldEscalate · writeLetter
```

That is the whole documented mechanism: panel selection, convergence detection,
escalation, the journal writer, both loop-detection heuristics, the fingerprinting they
compare on, and the letter format the document argues for over Markdown at Decision 6.

### The one live export writes a note nothing reads

`shouldRunLoop` is genuinely called — `src/lib/actions.js:766` (required at `:753`),
inside `recordRefinementGate` (defined at `:751`), itself called at `:681` from
`applyIronLoop` when a plan enters the todo queue. Its docblock at `:744` says the verdict
is written to `<root>/.ctoc/state/refinement/<slug>.json` "for the integrator/menu to
read."

Grepped across all of `src/`: **that path is built via
`path.join(root, '.ctoc', 'state', 'refinement')` at `actions.js:769` and written at
`:772`, and it is read nowhere.** Not by the integrator, not by the menu, not by any hook.
The gate computes a correct decision, persists it durably, and no consumer exists. Because
the path is assembled from `path.join` segments, the only place the literal string
`state/refinement` appears is the docblock comment at `:744` — a grep for that literal will
NOT land on the write site, which is why the test below (Case 4) matches the `path.join`
segment form as well. The write is additionally wrapped in a bare `catch {}` at `:776`, so
a failure to record it is invisible — defensible as advisory-and-fail-open, and worth
knowing given nothing reads the result either way.

### The named driver cannot dispatch agents or execute code

`docs/REFINEMENT_LOOP.md:185`:

> `agents/iron-loop/iron-loop-integrator.md` | Existing Tier 1 agent; extended to drive
> Steps 11-13 via the loop

`agents/iron-loop/iron-loop-integrator.md:4`:

```
tools: Read, Write, Edit
```

No `Task`, so it cannot dispatch the parallel critics the loop is built on. No `Bash`, so
it cannot run the module's functions. The agent named as the driver is the one agent in
the chain equipped to do neither thing the loop requires. (`cto-chief`, named throughout
the round description, does hold `Task` and `Bash` — the defect is specific to `:185`,
and precision matters because an overstated claim here would be the same failure in the
other direction.)

### One listed file does not exist

`:183` lists `src/lib/letter-renderer.js` — "JSON → Markdown renderer for human escalation
views" — in a table titled "Files and where they live". **There is no such file.**
`.ctoc/config/refinement-triggers.yaml` at `:181` does exist, so the table is a mix of
shipped and unshipped entries with nothing distinguishing them.

## The decision: mark it a design record, and record what running it would cost

Correcting the document is not the reflex answer here; it is the answer the size of the
gap forces, and the reasoning is recorded so it can be argued with.

**Making the claim true means building the loop**: a driver with `Task` and `Bash`, ten
export call sites across phase transition, journal append, loop detection and escalation,
the missing renderer, and a dispatch path that runs critics in parallel and a test-writer
and implementer in sequence. That is a multi-plan program, not a wiring fix. Every other
item in this repair set had wiring measured in call sites; this one is measured in
subsystems.

**And the document is genuinely valuable as a design record.** Its ten decisions carry
real citations and a stated rationale each; deleting it would discard the design work.
`src/lib/refinement-loop.js` is implemented and tested — what is missing is the caller.

So the document keeps everything it says and changes what it claims about *now*: a
specification for a mechanism that is partially built, with each row of the file table
marked by its actual state. That is a document a reader can act on, in either direction —
to build it, or to stop expecting it.

## Implementation Details

### File: `docs/REFINEMENT_LOOP.md`
**Action:** MODIFY

Four changes. The executor writes the wording; this plan fixes the content.

1. **A status block immediately under the title**, before the design decisions, stating in
   plain words: the library is implemented and tested; the loop does not run today; the
   only part that executes is the gate that decides whether it *would*, and its verdict is
   written to `.ctoc/state/refinement/<slug>.json` where nothing currently reads it. It
   carries the exact marker **`NOT RUNNING`**, in the marker convention `00089` uses for
   `NOT ENFORCED` and `00188` uses for `NOT WIRED`, so all three are greppable as one set.

2. **The "How a round runs" block at `:25-68` is labelled as the specification of a round,
   not a description of one.** The block's content does not change — it is the design.
   What changes is that a reader can no longer read it as reportage.

3. **The "Files and where they live" table at `:177-186` gains a state column**, filled
   from disk at Step 9 rather than from this plan. `letter-renderer.js` is marked as not
   existing. The integrator row is corrected to say the agent is *named* as the intended
   driver and that its current `tools:` grant holds neither `Task` nor `Bash` — which is
   what the eventual wiring must change first.

4. **A short section recording what running it would cost**, sourced from the analysis
   above: the ten dead exports by name and the concern each belongs to, the missing
   renderer, the driver's tool grant, and the absent consumer for the gate verdict. This is
   the record that makes the work schedulable. **It states no phase, no ordering and no
   timeline — what gets built and when is the human's decision, and a document that
   proposed a sequence would be making it for him.**

The "Open calibration items" section at `:188-198` stays as written. It is honest about
being uncalibrated.

### File: `tests/refinement-loop-claims-match-code.test.js`
**Action:** CREATE

Bidirectional, so the document cannot go stale in either direction.

| # | Case | Assertion |
|---|---|---|
| 1 | the marker is present | `docs/REFINEMENT_LOOP.md` contains `NOT RUNNING` |
| 2 | **the dead-export claim is measured, not stated** | read `.ctoc/export-reachability-baseline.json`; collect every entry beginning `src/lib/refinement-loop.js#`; assert the document's list names exactly that set. **If an export is wired later, the sets diverge and this FAILS**, demanding the document be updated — the good-news direction |
| 3 | `shouldRunLoop` is still the live one | it is absent from the dead-export set, and `src/lib/actions.js` still requires `./refinement-loop`. If the live caller disappears, the document must say so |
| 4 | **the gate verdict still has no reader** | search `src/**/*.js` for references to the refinement gate-state directory, matching BOTH the string-literal form `state/refinement` AND the `path.join` segment form `'state', 'refinement'` (the write assembles the path from segments, so a bare `state/refinement` grep hits only the docblock comment). Assert (a) the only module that references that directory is `src/lib/actions.js`, and (b) actions.js WRITES it (a `writeFileSync` into the `state/refinement` dir inside `recordRefinementGate`) and performs NO read (no `readFileSync`/`readFile`/`readdirSync`/`readdir` against that dir). **When a reader is added in any module this FAILS**, and the document's claim about the unread note must go |
| 5 | every file in the table exists, or is marked | for each path in the "Files and where they live" table, either the file is on disk or its row carries the not-existing marker. `letter-renderer.js` is the live instance; a future file that vanishes is caught the same way |
| 6 | the driver's tool grant matches the claim | parse `tools:` from `agents/iron-loop/iron-loop-integrator.md`; if it lacks `Task` or `Bash`, the table row must say so; **if it gains both, this FAILS** and the row must be corrected |
| 7 | the round description is not read as reportage | the "How a round runs" section carries its specification label. A weak assertion by nature — asserted on the label's presence, not on prose — and it is stated as such in the test's comment rather than dressed up as stronger than it is |

Fixtures: none needed; every case reads repository files. No writes anywhere.

---

### Wiring — the live call sites

| change | live call site | root |
|---|---|---|
| the corrected `docs/REFINEMENT_LOOP.md` | read by humans, and by any agent instructed to read the refinement specification | shipped documentation |
| `tests/refinement-loop-claims-match-code.test.js` | `npm test` | the gated suite |

No `src/` module is created, so this slice cannot produce dead code.

## Test Plan

Covered by the seven cases. Cases 2, 4 and 6 are the ones that earn the file: each fails
in the direction of good news — an export wired, a reader added, the driver's tools
granted — and each failure is a demand to update the document at the moment the fact
changes. Case 7 is deliberately weak and says so.

## Execution Plan (Steps 8-16)

### Step 8: TEST
Write the test file FIRST against the UNMODIFIED document. **Cases 1, 5 and 6 must be
RED.** Record case 5's red verbatim — a "Files and where they live" table listing a file
that does not exist is the sharpest single sentence in this slice. Cases 2, 3 and 4
measure current state and should pass once the document's list is written in Step 10; at
Step 8 they fail for absence of the document text, which is expected.

### Step 9: PREPARE
Read `docs/REFINEMENT_LOOP.md` in full. Read `.ctoc/export-reachability-baseline.json` and
**take the dead-export list from that file, not from this plan** — it has been re-seeded
several times (entries sit at `:36-45` today; older plans cite ranges that have already
drifted). Read `src/lib/actions.js:674-687` (the `recordRefinementGate` call inside
`applyIronLoop`) and `:739-779` (`recordRefinementGate` itself — docblock, the
`path.join(root, '.ctoc', 'state', 'refinement')` build, the write, and the fail-open bare
`catch {}`). Read `src/lib/refinement-loop.js:645-690` (the `module.exports` block).
Confirm by grep that the refinement gate-state directory has one writer and no reader,
searching BOTH the literal `state/refinement` (docblock only) and the `path.join` segment
form `'state', 'refinement'` (the write site). Check each path in the file table for
existence. Read `agents/iron-loop/iron-loop-integrator.md:1-11`. **Where the code
disagrees with this plan, THE CODE WINS and the disagreement is reported** — the ten-export
figure and the missing renderer are the two claims most worth re-verifying.

### Step 10: IMPLEMENT
- `docs/REFINEMENT_LOOP.md` — the status block, the specification label, the state column,
  the wiring-cost section.
- `tests/refinement-loop-claims-match-code.test.js` — the seven cases.

### Step 11: REVIEW
Read the document start to finish as someone who has never seen the code, and ask after
each section whether anything running is implied. The failure mode of this repair is a
status block at the top that a reader skips before reading forty lines of present-tense
round description — which is why change 2 exists and must be checked at the section, not
only at the top.

### Step 12: OPTIMIZE
Seven file reads in one test. Nothing to optimize.

### Step 13: SECURE
The test reads repository files and writes nothing. Assert it performs no write under any
branch. Paths built with `path.join`; no path derived from file contents is ever used to
read.

### Step 14: VERIFY
`node --test tests/refinement-loop-claims-match-code.test.js`, then the full gated
`npm test`. Lint at `--max-warnings 0`. No git operations. **Report the measured dead-export
list verbatim** so the document's list and the baseline can be compared by eye once, by a
human, before the test is trusted to do it forever.

### Step 15: DOCUMENT
The document IS the change. `CLAUDE.md` is declared in this plan's `files:` ONLY to satisfy
the count-mover declaration fence (`tests/plan-declares-count-moving-ratchets.test.js`):
creating a new `tests/*.test.js` file moves the documented test-file tally, and a plan that
creates a counted artifact must declare `CLAUDE.md` to cross Gate 2. The test-file count is
a GENERATED growing tally (`src/lib/doc-counts.js` `computeDocCounts.testFiles`, written into
CLAUDE.md by `release.js`), policed by an independent disk walk in `tests/doc-counts.test.js`,
so adding a test file does NOT break that test and needs no hand edit here; if the CLAUDE.md
literal is refreshed at all it is via the generator, never a prose edit. **Do NOT add any
prose to `CLAUDE.md` or `README.md` asserting the refinement loop runs.** Additionally check
whether `CLAUDE.md` or `README.md` already asserts the loop runs; if either does, report it —
do not edit either file to make such a claim here, since both are broadly shared and an
unscoped edit would collide with sibling slices.

### Step 16: FINAL-REVIEW
Report case 5's red verbatim, the measured dead-export list, any disagreement between this
plan and the code, and every decision taken under ambiguity.

## What this plan does NOT fix

- It does **not** wire the refinement loop. Ten call sites across four concerns, a missing
  renderer, a driver whose tool grant must change, and a consumer for the gate verdict —
  that is a program of work, and what gets built and when is the human's to decide.
- It does **not** create `src/lib/letter-renderer.js`. Creating a file to make a table
  entry true, when nothing would call it, is how this repository accumulated the dead
  modules it is now removing.
- It does **not** change `agents/iron-loop/iron-loop-integrator.md`. Granting `Task` and
  `Bash` to an agent is a capability decision, and granting them with nothing to drive
  would be capability without purpose. `00110` separately corrects five agent bodies that
  are *ordered* to run code they cannot; the integrator is not one of them — this is a
  document claiming an agent drives something, which is a different defect with a
  different owner.
- It does **not** add a reader for `.ctoc/state/refinement/<slug>.json`, and does not
  remove the writer. The verdict is correct and cheap; a future consumer will want it.
- It does **not** touch the bare `catch {}` at `actions.js:776`. That belongs to the
  false-green ratchet.
- It does **not** delete or shorten the design record. The ten decisions and their
  citations are the value in the file.

## Decisions Taken Under Ambiguity

1. **Mark the document rather than build the loop, on size rather than on preference.**
   Every other item in this repair set had wiring measurable in call sites. This one needs
   a driver, ten call sites, a missing module and a consumer. Calling that "a small
   wiring" would be the overclaim being repaired, one level up.
2. **Nothing is deleted from the document.** A design record with citations is an asset;
   the defect is the tense, not the content.
3. **The state column is filled from disk at Step 9, never from this plan.** The baseline
   is re-seeded whenever the reachability fence moves and older plans already cite line
   numbers that have moved. A plan that hands the executor stale facts to transcribe
   manufactures the next false claim.
4. **The wiring-cost section names no phase and no order.** Recording what it would take
   is technical; deciding what to build and when is the human's, and a document proposing
   a sequence would be quietly making that call.
5. **`NOT RUNNING` is a third marker beside `NOT ENFORCED` and `NOT WIRED`.** Three
   distinct states — nothing evaluates it, it exists but is not registered, it is built but
   nothing drives it — deserve three words, or a grep across the repository stops
   distinguishing them.
6. **Case 7 is admitted as weak in the test itself.** Asserting on prose tense is not
   reliably checkable; asserting on a label is. Saying so in the comment is better than an
   assertion that reads stronger than it is — which is the false-green shape, applied to a
   test about false claims.
7. **The precision about `cto-chief` is kept.** It holds `Task` and `Bash`, so only the
   `:185` integrator claim is defective. Writing "the agent said to drive it cannot
   dispatch" without that distinction would make this document's correction as loose as
   the sentence it corrects.
8. **`CLAUDE.md` is declared but not prose-edited (rebase 2026-07-30).** The count-mover
   declaration fence hard-blocks a plan that creates a `tests/*.test.js` file without
   declaring `CLAUDE.md`; declaring it is the fence's requirement, not a licence to add a
   loop-runs claim. The test-file count is generator-managed, so no manual CLAUDE.md edit
   is needed — the declaration exists solely to let the plan cross Gate 2 and to grant
   write permission if the generated tally is refreshed.


## Deferred Questions

_Written by the Iron Loop integrator (src/lib/iron-loop.js), which performs NO
quality evaluation. These entries are the integrator's own report on itself, not
findings from a critic that read this plan._

- **evaluation**: NOT EVALUATED — no automated critique was performed on this plan. The refinement loop appended the Steps 8-16 template and assessed nothing. (The scores this step used to report were computed from that same template, not from the plan.) A human or a real critic must review this plan before it is built.
