---
title: "The step-label checker is documented as a hook that rejects plans before execution — it is registered nowhere, and a test now keeps the document and the hook manifest telling the same story"
type: implementation
parent_plan: none
depends_on: none
priority: HIGH
program: ctoc-repair-loop
iron_loop: true
files:
  - "docs/IRON_LOOP.md"
  - "tests/step-label-hook-claim-matches-manifest.test.js"
  - "CLAUDE.md"
---

# The step-label checker is documented as a hook that rejects plans

## The claim, and what is on disk

`docs/IRON_LOOP.md:307`, verbatim:

> Step labels are validated programmatically by `src/lib/plan-validator.js` and enforced
> by `src/hooks/validate-plan-steps.js`. Plans with wrong labels are REJECTED before
> execution.

Present indicative, a named file, a stated consequence. A reader concludes that a plan
whose step reads `TESTING` instead of `TEST` cannot be executed.

What is on disk:

1. `src/hooks/validate-plan-steps.js` exists (246 lines) and its logic is correct. It is
   unit-tested (`tests/validate-plan-steps-coverage.test.js`,
   `tests/hooks-remaining.test.js:170-206`) and it runs as a standalone script:
   `node src/hooks/validate-plan-steps.js <plan>`.
2. **It is absent from `.claude-plugin/hooks.json`.** It is the only file under
   `src/hooks/` that is, which is exactly why `.ctoc/reachability-baseline.json:14` lists
   it (first entry of the `unreachable` array) as unreachable — `liveRoots` at
   `reachability.js:364-389` treats a hook as live if and only if the manifest names its
   file (`raw.includes(path.basename(file))` at `reachability.js:386`).
3. Nothing invokes it at any transition. No plan is rejected by it, ever.
4. `src/lib/plan-validator.js` **is** wired and does reject a plan missing a required
   step — **matched by step NUMBER**. Label *text* is not checked by anything that runs.

So the first half of the sentence is true and the second half is false, which is the worst
shape: the true half lends its credibility to the false half.

`CLAUDE.md:642` already states this accurately: "which today runs only as a standalone
script … and is NOT wired as a runtime hook — so a present-but-mislabeled step is not
auto-rejected at runtime." **Two shipped documents disagree.** One of them has to move,
and it is not the accurate one.

## The decision: correct the claim, and record exactly what wiring would cost

This is deliberately not the reflex answer, so the reasoning is recorded.

**The mechanism is wanted.** Step-label text carries real weight in this repository —
`skills/agent-fragments/ancestry-read.md:14` instructs every agent that non-matching
labels are "a hard block", and this very plan's Steps 8-16 are validated against those
labels. A checker for the one thing `plan-validator.js` does not check is worth having.

**The wiring is small.** One entry in `.claude-plugin/hooks.json` and the file becomes a
live root.

**And it must not be wired today**, for a reason that is specific rather than cautious.
`.ctoc/false-green-baseline.json:52-54` records three defects in that same file:

```
src/hooks/validate-plan-steps.js:exit-with-pending-writes:<module>
src/hooks/validate-plan-steps.js:exit-with-pending-writes:<module>#2
src/hooks/validate-plan-steps.js:exit-with-pending-writes:<module>#3
```

These three correspond to the three `process.exit` calls in the `require.main === module`
CLI block (`validate-plan-steps.js:225`, `:232`, `:237`).
`exit-with-pending-writes` is one of the five documented false-green signatures:
`process.exit` discarding buffered writes, which is **invisible when a human runs it in a
terminal** — terminal writes are synchronous — and shows up only when an automated caller
reads the output over a pipe. A hook is precisely an automated caller reading over a pipe.

So wiring this file as-is would install, at a gate, an instrument that can drop the
message explaining its own verdict. A blind gate that blocks work without saying why is
worse than an unwired checker plus an honest document, and CTOC has shipped that exact
defect five times.

**The honest order is therefore: fix the three sites, then wire, then update the
document.** The first two are unbuilt work and the human schedules them. This slice makes
the document true today and makes the eventual wiring impossible to forget — because the
test below fails the moment the hook is registered, demanding the sentence be corrected
back.

## Implementation Details

### File: `docs/IRON_LOOP.md`
**Action:** MODIFY — the "Validation" section at `:305-307` only

The replacement states four things, and its wording must be the executor's own rather
than a copy of this plan:

- `src/lib/plan-validator.js` is wired and rejects a plan missing a required step, matched
  by step **number**.
- `src/hooks/validate-plan-steps.js` checks label **text** and runs only as a standalone
  command: `node src/hooks/validate-plan-steps.js <plan-path>`.
- It carries the exact marker **`NOT WIRED`**, matching the `NOT ENFORCED` marker
  convention `00089` establishes for the same class of correction (see
  `docs/INDEPENDENCE.md`, which uses `NOT ENFORCED` at `:8`, `:9`, `:95` and elsewhere),
  so both are greppable as one set.
- The consequence a reader needs: a present-but-mislabeled step is **not** rejected at
  runtime today.

One sentence names the prerequisite for wiring — the three pending-write defects — so a
future reader does not read "not wired" as "nobody got around to it" and wire a blind
instrument in an afternoon.

**Do not delete the reference to the file.** It exists, it works, it is the basis of the
wiring, and a reader needs to know it is there.

### File: `CLAUDE.md`
**Action:** DECLARE ONLY — no content change to the accurate sentence

`CLAUDE.md` is declared in `files:` for one reason: this slice CREATES a new counted
artifact (`tests/step-label-hook-claim-matches-manifest.test.js` matches the `testFiles`
counted class). The shipped count-mover declaration fence
(`tests/plan-declares-count-moving-ratchets.test.js`; enforced at Gate 2 by
`validateTransition('implementation','todo')` in `src/lib/plan-validator.js` via
`checkPlanDeclaresCountMovers` in `src/lib/documented-counts.js`) BLOCKS a plan that
declares a new `tests/*.test.js` without also declaring `CLAUDE.md`. Declaring it is what
makes this plan crossable — verified by that test's case "7b: a stamped count-mover that
DECLARES CLAUDE.md crosses Gate 2".

**No hand-edit of a count literal is required.** Since plan 00215's split shipped, the
CLAUDE.md test-file count is a GENERATED growing tally: `src/lib/doc-counts.js`
(`computeDocCounts`) is the one source of truth, `release.js` writes it into CLAUDE.md,
and `tests/doc-counts.test.js` polices the *generator against a live disk walk*, never the
CLAUDE.md literal — so adding a test file can never break that test, and the literal is
refreshed by `node src/scripts/release.js` at release time, not in this slice. The
accurate sentence at `CLAUDE.md:642` is verified UNCHANGED; the declaration grants the
edit permission the fence requires without obligating any content change.

### File: `tests/step-label-hook-claim-matches-manifest.test.js`
**Action:** CREATE

The fence is **bidirectional**. A one-way test ("the doc does not lie today") goes stale
the instant someone wires the hook, and then the corrected sentence becomes the false one.

| # | Case | Assertion |
|---|---|---|
| 1 | the manifest state is read, not assumed | parse `.claude-plugin/hooks.json`; determine whether any entry names `validate-plan-steps.js`. Record the boolean the rest of the cases branch on |
| 2 | **not registered ⇒ the document says so** | when case 1 is false, `docs/IRON_LOOP.md` contains the marker `NOT WIRED` in the Validation section and does **not** contain the phrase "REJECTED before execution" |
| 3 | **registered ⇒ the document must be updated** | when case 1 is true, the test FAILS with a message naming the file, the section, and the sentence to restore. The hook being wired is good news; a stale document is not, and this is the case that catches it |
| 4 | the two documents agree | `CLAUDE.md`'s statement and `docs/IRON_LOOP.md`'s statement both reflect the same manifest boolean. Match on CONTENT (`grep` for the `NOT WIRED` / "REJECTED before execution" phrases), never on a line number — the accurate CLAUDE.md sentence lives at `:642` today but a content match survives any future re-flow. Two shipped documents disagreeing about one mechanism is the defect being repaired, and it must not be repairable in only one of them |
| 5 | the file still exists | `src/hooks/validate-plan-steps.js` is on disk. If a future slice deletes it, both documents must change and this test says so rather than leaving two dangling references |
| 6 | the standalone command still works | spawn `node src/hooks/validate-plan-steps.js` against a temp plan with a mislabeled step; assert a non-zero exit and that the **stderr** names the bad label. The FAILED branch prints its errors via `console.error` to stderr (`validate-plan-steps.js:234-235`) immediately before `process.exit(1)` — so the assertion reads `r.stderr`, matching the existing sibling at `tests/hooks-remaining.test.js:182-189`. **The document claims this command works; the test proves it** rather than trusting it |

Case 6 uses `spawnSync(process.execPath, [hookPath, planPath])` — no shell — with the
fixture under `os.tmpdir()` and `path.join` throughout. It overlaps
`tests/hooks-remaining.test.js:170-206` by design: that test proves the script's behaviour,
this one proves the *documented claim about* the script. If case 6 reveals output loss
from the pending-write defect, **that is a finding to report, not a reason to weaken the
assertion** — it would be direct evidence for the prerequisite this plan names.

---

### Wiring — the live call sites

| change | live call site | root |
|---|---|---|
| the corrected `docs/IRON_LOOP.md` sentence | read by humans and by every agent instructed to read the Iron Loop specification | the repository's shipped documentation |
| `tests/step-label-hook-claim-matches-manifest.test.js` | `npm test` | the gated suite |
| the `CLAUDE.md` declaration | `checkPlanDeclaresCountMovers` at Gate 2 (and `release.js`'s count regeneration) | the count-mover declaration fence |

The document is the artifact; a document has no caller other than its reader, and the test
is what stops it drifting from the code. Nothing new is created under `src/`, so nothing
here can become dead code.

## Test Plan

Covered by the six cases. Case 3 is the one that earns the file: it converts "the hook is
unwired" from a fact somebody has to remember into a fact the suite enforces in both
directions.

## Execution Plan (Steps 8-16)

### Step 8: TEST
Write the test file FIRST and run only it against the UNMODIFIED document. **Case 2 must
be RED** — the document today contains "REJECTED before execution" and no `NOT WIRED`
marker. Record that red verbatim. Case 3 is inert while the hook is unregistered; assert
in the test's own comment that this is expected, so a reader does not mistake an inert
branch for an untested one. Case 6 should pass immediately unless the pending-write
defect drops the output — record which.

### Step 9: PREPARE
Read `.claude-plugin/hooks.json` in full and confirm by enumeration that
`validate-plan-steps.js` is the only file under `src/hooks/` absent from it. Read
`src/hooks/validate-plan-steps.js:219-238` (the `require.main === module` CLI entry and
its three `process.exit` sites) and confirm they are the three
`exit-with-pending-writes:<module>` entries in the false-green baseline. Read
`CLAUDE.md:642` and `docs/IRON_LOOP.md:305-307`. Read `src/lib/plan-validator.js`'s
step check to confirm it matches by number and not by label text — **this plan asserts
that, and if the code disagrees, THE CODE WINS** and the correction changes shape.

### Step 10: IMPLEMENT
- `docs/IRON_LOOP.md` — the Validation section, carrying `NOT WIRED` and the prerequisite
  sentence.
- `tests/step-label-hook-claim-matches-manifest.test.js` — the six cases.
- `CLAUDE.md` — declared only; the accurate sentence at `:642` stays byte-for-byte. No
  count literal is hand-edited (see the CLAUDE.md file spec above).

### Step 11: REVIEW
Confirm the new sentence claims nothing that is not on disk. Read it as someone who has
never seen the code and ask what mechanism they would now expect to run — if the answer is
anything other than "the standalone command I choose to run", the wording is still
overclaiming. Confirm case 3's failure message tells its reader exactly what to edit.

### Step 12: OPTIMIZE
Two small file reads and one child process. Nothing to optimize; do not add caching to a
test that exists to read the current state of two files.

### Step 13: SECURE
The test reads two repository files and spawns one child process with no shell against a
temporary path. Assert no fixture is written outside `os.tmpdir()`. The test must not
write to `docs/`, `.claude-plugin/` or `CLAUDE.md` under any branch — a test that edits the
document it checks is a fence that grades its own homework.

### Step 14: VERIFY
`node --test tests/step-label-hook-claim-matches-manifest.test.js`, then the full gated
`npm test`. Lint at `--max-warnings 0`. No git operations. Confirm the count-fence test
`tests/plan-declares-count-moving-ratchets.test.js` and `tests/doc-counts.test.js` both
pass with the new test file present (they must — the CLAUDE.md declaration satisfies the
former, and the latter polices the generator, not a literal). **Report whether case 6
observed truncated output** — that is direct evidence about the three pending-write sites
and it is worth more than the passing test.

### Step 15: DOCUMENT
The document IS the change. Additionally confirm `CLAUDE.md:642` still matches after the
edit; if the two now differ in any substantive way, correct the difference in this slice
rather than leaving a third variant.

### Step 16: FINAL-REVIEW
Report case 2's red verbatim, the case 6 truncation finding, the enumeration proving this
is the only unregistered hook, and every decision taken under ambiguity.

## What this plan does NOT fix

- It does **not** wire the hook, and the reason is specific: three recorded
  `exit-with-pending-writes` defects would make it a gate that can drop the message
  explaining its own verdict. **The mechanism is wanted and the wiring is small; the
  prerequisite is fixing those three sites.** That work is unbuilt and the human schedules
  it.
- It does **not** fix the three pending-write sites. They belong to the false-green
  ratchet, whose baseline may only shrink, and pulling three entries out of it is its own
  slice with its own evidence.
- It does **not** remove `src/hooks/validate-plan-steps.js` from the `unreachable` list in
  `.ctoc/reachability-baseline.json` (`:14`). It stays legitimately unreachable until it is
  wired, and `00088` (the reachability-fence repair) already recorded that judgment.
- It does **not** change `src/lib/plan-validator.js` or add label-text checking anywhere
  that runs.
- It does **not** touch the compliance claims in the same class. `docs/INDEPENDENCE.md`
  and the `cto-chief.md` control claims belong entirely to `00089`, and this slice must
  not edit either file.

## Decisions Taken Under Ambiguity

1. **Correct the claim rather than wire the mechanism, on a stated prerequisite rather
   than on caution.** The default of "just fix the doc" was explicitly resisted; what
   makes it right here is the three recorded blind sites in the very file that would
   become the gate. An unwired checker plus an honest sentence is strictly better than a
   gate that can block work without printing why.
2. **The marker is `NOT WIRED`, not `NOT ENFORCED`.** `00089` uses `NOT ENFORCED` for a
   control that no mechanism evaluates. This file has a mechanism a human can run today;
   the missing thing is registration. Two different states deserve two different words, or
   a grep across the repository stops distinguishing "nothing exists" from "it exists and
   you must invoke it".
3. **The test is bidirectional.** A one-way assertion would go stale in the good direction
   — someone wires the hook and the corrected sentence silently becomes the lie. Case 3
   makes the wiring self-documenting.
4. **Case 4 pins both documents to the same manifest boolean, matched on content not line
   numbers.** The defect is not "one document is wrong"; it is "two shipped documents
   disagree and nothing noticed". Repairing only the wrong one leaves the mechanism that
   allowed the disagreement. Content matching (not the `:642` line number) keeps the test
   robust to future re-flow of CLAUDE.md.
5. **Case 6 executes the documented command instead of trusting it, and reads stderr.** The
   document tells a reader to run something. A claim about a command is checkable by
   running the command; the FAILED branch reports on stderr, so the assertion reads stderr.
   This repository has just been shown what happens when a shipped instruction is never
   executed by anything.
6. **`CLAUDE.md` is declared, not content-edited.** The count-mover declaration fence
   requires any plan creating a counted artifact (here, a new `tests/*.test.js`) to declare
   `CLAUDE.md` so a build that moves the count can update it. Declaring it satisfies the
   Gate-2 fence; the generated test-file count is refreshed by `release.js`, and the
   accurate NOT-WIRED sentence at `:642` is left unchanged — so the declaration adds
   permission, not a content change.
