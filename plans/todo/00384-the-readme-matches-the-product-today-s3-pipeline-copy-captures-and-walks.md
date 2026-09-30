---
iron_loop_verdict: true
iron_loop: true
title: "Captures and walks on a disposable copy of this repository's pipeline — the dashboard, the decision screens, the task board, and every busy screen the stages show"
type: implementation
parent_plan: the-readme-matches-the-product-today
depends_on: 00383-the-readme-matches-the-product-today-s2-fresh-project-captures-and-walks
priority: medium
effort: medium
files:
  - .ctoc/verification/readme-truth-record.md
  - .ctoc/verification/readme-captures/**
approved_by: human
approved_at: 2026-09-30T07:58:20.037Z
gate_crossed: implementation → todo
---

# Captures and walks on a disposable copy of this repository's pipeline — the dashboard, the decision screens, the task board, and every busy screen the stages show

**Scope (one line):** copy this repository's pipeline state once into a directory outside the repository, take every capture on the census's list whose project kind is "copy" from that one copy, run the ordered pieces' steps that need a busy pipeline, and run the census's "ran" claim rows that belong there.

Read the parent plan in full first. The busy-pipeline decision ("one real run on a disposable copy of this repository's pipeline state, kept as a snapshot") governs every capture here.

## Implementation Details

### The disposable-copy procedure — never the live repository

Rendering the dashboard in this repository moves real plans, and the streaming gate crosses plans that have enough information. So every run in this slice has the copy, never this repository, as its project root.

1. **Make the copy outside the repository**, under the operating system's temporary directory (Node's `os.tmpdir()`), never inside or below this repository. Copy, at one moment, this repository's `plans/` folder and its `.ctoc/` folder without `.ctoc/logs/`. The record states the time the copy was taken and the list of what was copied.
2. **Prove the product will use the copy as its root.** Before the first run, call `findProjectRoot` in `src/lib/project-root.js` from the copy and confirm it returns the copy. Any other answer stops the slice before any run.
3. **List the real pipeline before the first run** — every file under this repository's `plans/` and `.ctoc/` with a sha256 checksum, excluding `.ctoc/logs/` and this plan's own record and capture files — into `.ctoc/verification/readme-captures/listings/`, with the listing's checksum in the record.
4. **Run the real command in the copy**, the product's code taken from this repository, output redirected to a file under `.ctoc/verification/readme-captures/`. Per run the record keeps the command line (with `<repository>` and `<copy>` for the absolute paths), the copy's description and time, exit code, byte count, and sha256 of the raw output.
5. **List again after the last run, compare by program, name and attribute every difference.** A difference caused by a run of this slice fails the slice.
6. **Remove the copy at the end.** The raw outputs and listings stay.

The copy moves as the product renders it — that is the product's real behaviour on a busy pipeline, and it happens in the copy only. The record says, per capture, which runs came before it in the copy.

### What this slice does

1. **The captures on the census's list whose kind is "copy"**, each through the route `src/commands/start.md` documents (exact invocation read from `src/commands/start.js` first). Expected, subject to the census's list:
   - the dashboard (the pipeline overview, the tasks, the inbox, the agent line). Its first line is the capture-version line `CTOC v<version>`; the release sync keeps that one line current (parent rule 1). Whatever the real output holds — including a line the README does not explain today, such as the one about a plan whose builder is no longer running, re-queued for a clean rebuild — is kept as it is; the stage slice explains it (criterion 2);
   - the decision screens: the default screen that asks the pending decisions one at a time; a plan whose precomputed question is on disk, so the screen asks that question with its options; the validation screen shown before an approval;
   - the task board and one opened task;
   - the stale-plan question and its options;
   - each busy stage screen the census lists.
2. **Provenance of agent-written content.** For a screen that shows something an agent wrote earlier — a precomputed question with its pros and cons, a plan body — the record names the plan it came from and says it is real output of the critique fleet (or of the planner) from a real plan of this repository, carried in the copy (parent capture rule 4). The stage slice states this in the README (criterion 3).
3. **The flow walks of the ordered pieces that need a busy pipeline** (by the census's map; expected: the old dashboard lesson, the decision-screen lesson, the build lesson, the done-and-ship lesson, the keep-healthy lesson, and the recipes that start from a busy pipeline). The same two ordered lists as the fresh-project slice: what the piece tells and shows, and what the product really did and showed. Host-owned steps are listed as host-owned for the web slice.
4. **The census's "ran" claim rows that belong on a busy pipeline** (for example that every inbox count has a door that opens it): run in the copy, each row given its command, what it printed, and a verdict.
5. **Capture-row verdicts** for every census capture row re-taken here, by the parent's rule for capture rows.

### What this slice must not do

Edit `README.md`; edit any test or source file; move any plan in this repository; run anything with this repository as the project root; start a second Claude.

### Which sections of the rebuilt README it writes

None.

### Decisions of the parent that govern it

- ALIGN, "How a capture is taken and proven real", rules 1 to 7 — in particular rule 4 (content from an agent's earlier work says so) and rule 6 (what the proof honestly proves: a busy capture cannot be regenerated byte for byte, so the record states when the copy was taken).
- Decisions Taken Under Ambiguity: where the busy-pipeline captures come from; shortening is a closed list of two; the plain-words rule governs prose, not captures.

### Acceptance criteria

This slice closes no criterion by itself. The clauses it produces the evidence for, quoted from the parent:

- **2:** "GIVEN a capture whose real output differs from the README block in a line the prose does not explain" — the real output is taken here.
- **3:** "the record row says which" — the provenance rows are written here.
- **8:** the second listing pair is recorded here.
- **11:** "each comes from one real run on a disposable copy of this repository's pipeline state … and the record row states the root the product was given and when the copy was taken."
- **22:** the flow-test lists of the ordered pieces walked here.

### Evidence to record

Per capture: route, command line with placeholders, the copy's description and time, exit code, byte count, sha256, raw file name, and which earlier runs in the copy preceded it. The provenance rows. The flow-walk list pairs. The verdicts of the "ran" rows and capture rows. The listing pair and its attributed differences.

### How to verify

1. A throwaway program recomputes the checksum and byte count of every raw file this slice wrote and compares them with the record.
2. A throwaway program compares the two listings and prints the difference list; every difference is attributed in the record.
3. Every capture on the census's "copy" list has a raw file or a recorded reason.
4. `npm test` — zero failures, zero skipped, coverage at or above the floor. One commit with a patch version; nothing pushed.

### Constraints from the other tests that read the README

None can move: this slice does not edit the README.

### Wiring — the live call sites

No module is added or changed. The raw captures are placed by the stage slice and compared byte for byte by the whole-document check.

### Security review

- The copy contains the approval ledger and the question store; they are read by the product in the copy and never written back to this repository.
- Every raw output is checked for a secret, a token or a home-directory user name before it is kept. One that carries any is not kept and not redacted; the slice stops and puts it to the human.
- Commands run with an argument array and no shell.

## Decisions Taken Under Ambiguity

1. **One copy, every busy screen from it, taken in one sitting.** The parent says "one real run on a disposable copy"; taking every busy screen from one copy keeps their counts consistent with each other and gives the record one copy time.
2. **The copy leaves out `.ctoc/logs/`.** Logs are append-only history that no screen needs, and leaving them out keeps the copy small. If a screen's source turns out to read a log, the log is copied too and the record says so.
3. **The copy is not given git history.** If a screen's source reads git state and prints an error in the copy, the builder initialises an empty git repository in the copy (which changes no plan and no pipeline state) and records that it did; the capture is taken after.
4. **Screens are captured in the order the census lists them**, and the record says which runs preceded each, because an earlier render can move plans in the copy and change what a later screen shows.


---

## Execution Plan (Steps 8-16)

### Step 8: TEST (TDD Red)
- [ ] Write tests for the implementation
- [ ] Test error conditions
- [ ] Run tests - expect RED (failing)

### Step 9: PREPARE
- [ ] Install dependencies if needed
- [ ] Check prerequisites
- [ ] Verify dev environment ready
- [ ] Create directories/config if needed

### Step 10: IMPLEMENT
- [ ] Implement the feature according to requirements
- [ ] Add error handling
- [ ] Wire up integration points

### Step 11: REVIEW
- [ ] Self-review all new code
- [ ] Verify integration points work together
- [ ] Check error handling completeness

### Step 12: OPTIMIZE
- [ ] Remove redundant operations
- [ ] Optimize critical paths
- [ ] Simplify complex code

### Step 13: SECURE
- [ ] Validate inputs (no path traversal)
- [ ] Sanitize outputs
- [ ] No secrets in code
- [ ] Safe file operations

### Step 14: VERIFY
- [ ] Run lint + type check
- [ ] Run ALL tests (TDD Green)
- [ ] Check coverage >= 80%
- [ ] 0 skipped, 0 flaky tests

### Step 15: DOCUMENT
- [ ] Update relevant documentation
- [ ] Add JSDoc comments to new functions
- [ ] Update CHANGELOG if needed

### Step 16: FINAL-REVIEW
- [ ] Verify steps 8-15 completed correctly
- [ ] All quality checks passed
- [ ] Manual verification if needed
- [ ] Ready for human review


## Deferred Questions

_Written by the Iron Loop integrator (src/lib/iron-loop.js), which performs NO
quality evaluation. These entries are the integrator's own report on itself, not
findings from a critic that read this plan._

- **evaluation**: NOT EVALUATED — no automated critique was performed on this plan. The refinement loop appended the Steps 8-16 template and assessed nothing. (The scores this step used to report were computed from that same template, not from the plan.) A human or a real critic must review this plan before it is built.
