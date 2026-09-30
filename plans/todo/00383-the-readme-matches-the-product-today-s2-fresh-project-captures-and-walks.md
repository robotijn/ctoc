---
iron_loop_verdict: true
iron_loop: true
title: "Captures and walks in a fresh disposable project — the first-run screen, the empty stages, the refused edit, the push dry run, and the journey from nothing to finished"
type: implementation
parent_plan: the-readme-matches-the-product-today
depends_on: 00382-the-readme-matches-the-product-today-s1-census-and-empty-record
priority: medium
effort: medium
files:
  - .ctoc/verification/readme-truth-record.md
  - .ctoc/verification/readme-captures/**
approved_by: human
approved_at: 2026-09-30T07:58:20.010Z
gate_crossed: implementation → todo
---

# Captures and walks in a fresh disposable project — the first-run screen, the empty stages, the refused edit, the push dry run, and the journey from nothing to finished

**Scope (one line):** in a fresh project made outside the repository, take every capture on the census's list whose project kind is "fresh", walk the product's real journey from nothing to a finished piece of work, run the ordered pieces' steps that belong to a fresh project, and run the census's "ran" claim rows that belong there — never once touching this repository's own pipeline.

Read the parent plan in full first. Its capture rules ("How a capture is taken and proven real") govern every byte this slice produces.

## Implementation Details

### The disposable-copy procedure — never the live repository

Rendering the dashboard in this repository moves real plans: its reconcile moved a plan from the in-progress folder to the todo folder on 2026-09-29 (reported in the parent), and the streaming gate's `pendingGateDecisions` crosses plans that have enough information (read in the parent). So no capture and no walk in this slice ever runs with this repository as the project root.

1. **Make the project outside the repository**, under the operating system's temporary directory (Node's `os.tmpdir()`), never inside or below this repository. It is made the way the quickstart will describe: a package file and one source file, and no `.ctoc/` folder. The record describes exactly what it contains.
2. **Prove the product will use it as its root.** Before the first run, call the product's own root resolver — `findProjectRoot` in `src/lib/project-root.js` — with the disposable directory as its starting point, and confirm it returns the disposable directory. Any other answer stops the slice before any run.
3. **List the real pipeline before the first run.** Every file under this repository's `plans/` and `.ctoc/` folders with a sha256 content checksum, excluding `.ctoc/logs/` (append-only logs) and this plan's own record and capture files. The listing is written under `.ctoc/verification/readme-captures/listings/`; the record holds its checksum.
4. **Run the real command, with the disposable directory as the working directory**, the product's code taken from this repository, and the output going to a file under `.ctoc/verification/readme-captures/` by redirection — never typed, never pasted from a terminal. For every run the record keeps: the exact command line (with `<repository>` and `<disposable>` in place of the two absolute paths, so no home directory or user name is committed), the project's description, the exit code, the byte count, and the sha256 of the raw output.
5. **List again after the last run**, the same way; compare the two listings; name every difference and attribute it to its cause (another build, the session's own hooks, a commit). A difference caused by a run of this slice fails the slice.
6. **Remove the disposable directory at the end.** The raw outputs and the listings stay.

### What this slice does

1. **The captures on the census's list whose kind is "fresh"**, each through the route `src/commands/start.md` documents for it (the builder reads the exact invocation from `src/commands/start.js` before the first run):
   - the first-run screen — the first open of the dashboard in the project with no `.ctoc/` folder;
   - every empty-pipeline screen the census lists (for example the empty list of a stage);
   - the refused-edit screen, by driving the real edit hook `src/hooks/PreToolUse.Edit.js` the way the host does — a real edit request for a source file that no approved plan covers, delivered on the hook's standard input, in the project after its first run has initialised it (the parent's decision on the refused-edit screen);
   - the push command's dry run — `src/commands/push.js` with `--dry-run`, the way `src/commands/push.md` has Claude run it (decision D16). If it cannot be captured, the record says what stopped it.
2. **The journey walk, from nothing to finished**, driven through the real entry points the header of `tests/greenfield-journey.test.js` lists: initialisation; the crossing of "what to build" and of "how to build it" through the real approval function; the scheduler taking a plan from the todo queue into the in-progress folder; completion moving it to review and running the real verification; and the crossing to done on that real evidence. The steps that need a model — writing the vision, breaking it into plans, refining a plan — are seeded as files in the exact shape the code consumes, as that test seeds them, and are recorded as seeded, never as observed. The record lists, in order, every step the product needed, what drove it, and the screen the product printed at it (a capture, taken by the procedure above). The quickstart slice writes from this list (criterion 28).
3. **The flow walks of the ordered pieces whose steps belong in a fresh project** (by the census's map; expected: the old install, open-it and idea-to-plans lessons, and the recipes that start from nothing). For each, two ordered lists go into the record, exactly as the parent's flow test defines them: (i) the steps the piece tells the reader to take and the blocks of each screen it shows; (ii) the steps and screen blocks the product really had. A step the host owns (installing the plugin, updating it, the plugin menu path) is listed as host-owned; the web slice checks it against the host's documentation.
4. **The census's "ran" claim rows that belong in a fresh project** (for example what initialisation writes, and that it never overwrites an existing file): each is run, and its row gets the command, what it printed, and a verdict — true, corrected (with the corrected text), removed, or not verified.
5. **Capture-row verdicts.** Each capture row of the census whose screen this slice re-took gets its verdict by the parent's rule: true when the old block and the real output have the same blocks, labels, order and wording, differing only in values the README labels as a moment; corrected otherwise, with the difference named.

### What this slice must not do

Edit `README.md`; edit any test or source file; move any plan; run anything with this repository as the project root; start a second Claude.

### Which sections of the rebuilt README it writes

None.

### Decisions of the parent that govern it

- ALIGN, "How a capture is taken and proven real", rules 1 to 7.
- ALIGN, "The rules this plan holds itself to", rules 1 and 2.
- Decisions Taken Under Ambiguity: who observes the walkthrough (the builder only); the refused-edit screen; which version is "the product"; "the same screen" means the same blocks, labels, order and wording.
- D16 (Shipping's screen is the push dry run).

### Acceptance criteria

This slice closes no criterion by itself. The clauses it produces the evidence for, quoted from the parent:

- **1:** "every screen is produced by running the real code in a fresh disposable project".
- **8:** "the recorded before-and-after listings show no plan file moved or changed and no pipeline-state file written by any capture run" — this slice records one listing pair.
- **14:** "the capture stays verbatim, including that line" — the first-run capture is taken here.
- **22:** the flow-test lists of the ordered pieces walked here.
- **28:** "the first-run screen, the stage moves, the build start, the verification evidence and the crossing to done are driven through the product's real entry points, which the header of the greenfield-journey test lists; whatever needs the host or a model session is marked not verified where it stands and listed in the record, never presented as observed."

### Evidence to record

Per capture: the route, the command line with placeholders, the project's description, exit code, byte count, sha256, and the raw file's name. The journey walk's ordered steps. The flow-walk list pairs. The verdicts of the "ran" rows and of the capture rows re-taken. The listing pair's checksums and the attributed difference list.

### How to verify

1. A throwaway program recomputes the sha256 and byte count of every raw file this slice wrote and compares them with the record; its printed result goes into the record.
2. The two listings are compared by a throwaway program, not by eye; its printed difference list goes into the record with the attributions.
3. Every capture on the census's "fresh" list has a raw file or a recorded reason it could not be taken.
4. `npm test` — zero failures, zero skipped, coverage at or above the floor in `.ctoc/coverage-baseline.json`. One commit with a patch version by the release rule; nothing pushed.

### Constraints from the other tests that read the README

None can move: this slice does not edit the README.

### Wiring — the live call sites

No module is added or changed. The raw captures are read by the slices that place them in the README and by the whole-document check that compares each placed block with its raw file byte for byte.

### Security review

- Before a raw output is kept under `.ctoc/verification/readme-captures/`, it is checked for a secret, a token or a home-directory user name. One that carries any of them is not kept and not redacted (a redacted capture is no longer a capture): the slice stops and puts it to the human.
- Commands are run with an argument array and no shell, so nothing from a plan or a screen is ever interpreted as a command.
- The edit-hook payload names a file inside the disposable project only.

## Decisions Taken Under Ambiguity

1. **The "pipeline-state folder" of the listing is all of `.ctoc/` except `.ctoc/logs/` and this plan's own record and capture files.** The parent does not bound it; the whole folder is a superset, so nothing the dashboard's reconcile or the gate could write escapes the comparison. The cost is more differences to attribute (other sessions' hooks write there), each named.
2. **The listings are kept as files under `.ctoc/verification/readme-captures/listings/`** and the record holds their checksums, because a listing of every plan and state file would bury the record the human reads.
3. **Absolute paths in recorded command lines are replaced by `<repository>` and `<disposable>`.** A committed record must not carry a home directory; this is a recorded transformation of the record, never of a capture.
4. **The model-written steps of the journey are seeded, as the greenfield-journey test seeds them**, and marked not verified where the quickstart will describe them. The parent's decision that the builder alone observes the walk leaves no other honest option.


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
