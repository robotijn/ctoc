---
title: "R2-D — Instruction-surface truth pass: no claim the code does not keep"
type: implementation
parent_plan: ctoc-background-engine-rebuild
depends_on: 00004-r2b-actions-drain-and-shipgate
priority: HIGH
program: ctoc-repair-loop
iron_loop: true
files:
  - "src/commands/menu.md"
  - "CLAUDE.md"
  - "README.md"
  - "docs/IRON_LOOP.md"
  - ".ctoc/ask-me-questions.md"
  - "skills/ask-me-questions/SKILL.md"
  - "tests/readme-numbers.test.js"
---

# R2-D — Every instruction surface tells shipped truth

Fixes C1-8 (recipe double-enqueue), T1/T2/T3/T9/T12/W8 (false or overstated
claims), the batching contradiction. Honesty is the mechanism; an instruction
surface the session model executes MUST NOT describe machinery that does not
exist — the model will act as if it does.

## Implementation Details

1. **C1-8 double-enqueue.** menu.md `claude:start-agent` (and the tail of
   `claude:advance-all-implementation`): startAgent() already records AND
   claims the task via addAndClaim — the recipe must NOT run `menu task add`
   for the same plan. New recipe: call startAgent({force:true}) (human-
   initiated start clears drain-stop per R2-B) → launch the Agent → `menu task
   start <returned task.id> --agent-id <harness id>` to stamp the id → render.
   Surface the R2-B `skipped[]` list to the human when present.
2. **T1.** CLAUDE.md "Async overnight… The pipeline drains while the user
   sleeps" → rewrite to the withdrawn-claim truth: maximal lossless progress
   while a session is alive; lossless resume; agents make documented choices
   below the question floor instead of blocking (and real forks ASK — see 5).
3. **T2.** CLAUDE.md + README "Every dispatch is logged to .ctoc/audit/…" →
   state reality: dispatch logging is an instruction-level protocol
   (DISPATCH_PROTOCOL.md) followed by the session model; it is not enforced by
   code today.
4. **T3.** README "AI that writes production-quality code on the first try" →
   honest claim (adversarial review + gates catch what a first pass misses).
   W8: Rule 11's "under a second" → honest ("a short WORK turn — a few tool
   calls — never a foreground build").
5. **T9 + batching contradiction.** Reconcile the interaction model across
   README/IRON_LOOP/menu.md/ask-me-questions to the human's decided ask-first
   rule: REAL FORKS ask and block their subtree; trivia below the question
   floor gets a documented reasonable choice; menu ride-alongs (settings
   questions) MAY batch in one AskUserQuestion call (explicit exemption in
   .ctoc/ask-me-questions.md AND skills/ask-me-questions/SKILL.md — keep the
   two byte-identical; they are a synced pair), while discussion/design
   questions stay one-per-turn matrices.
6. **T12.** IRON_LOOP "enforced by hooks, not honor" → scope it: file-edit,
   commit, and gate-residency enforcement are hooked; step execution, dispatch
   logging, and the two-plane protocol are instruction-level discipline.
7. **T5 verification.** After R2-C ships review `done-all`, the IRON_LOOP
   Gate-3-batch claim becomes true — verify the wording matches the shipped
   shortcut name and describes typing the word as the approval.
8. Update tests/readme-numbers.test.js claim-pins ONLY where they pin the
   exact strings you are correcting (tighten to the new honest strings).

### Wiring — the live call sites (MANDATORY)
Instruction surfaces ARE roots (the session model executes them). menu.md
recipes must reference real exports with real signatures — verify each named
function exists on disk with that shape before writing it into prose.

### Test Plan (TDD-Red first)
readme-numbers.test.js: update the pinned claim strings you change; add pins
for the new honest phrasings ("maximal lossless progress", scoped hook claim)
so regressions to marketing-speak fail. Verify grep-zero for: "drains while
the user sleeps", "on the first try", "plan-serial" (outside historical plan
files), double-`menu task add` in the start-agent recipe. diff -q the
ask-me-questions pair stays byte-identical.

## Execution Plan (Steps 8-16)
### Step 8: TEST — adjust/add the pins, run readme-numbers + doc-counts, red.
### Step 9: PREPARE — read every file IN FULL from disk; read post-R2-B
actions.js startAgent signature (skipped[]/force) before writing the recipe.
If R2-B's return shape is absent on disk, STOP and report.
### Step 10: IMPLEMENT — changes 1–8.
### Step 11: REVIEW — every remaining superlative claim in README checked
against code; list any you left and why.
### Step 12: OPTIMIZE — n/a (prose); keep recipes terse.
### Step 13: SECURE — no secrets/paths leaked into docs.
### Step 14: VERIFY — node --test tests/readme-numbers.test.js
tests/doc-counts.test.js + the grep-zeros above; no git.
### Step 15: DOCUMENT — n/a (this IS documentation).
### Step 16: FINAL-REVIEW — report every claim changed, before → after.

## Decisions Taken Under Ambiguity

1. **C2 ride-along functions written to the new contract before they exist on
   disk (seam d).** `declineComplianceRegime(root)` and the durable
   "keep-defaults, stop asking" environment persistence are R2-C2's code and are
   NOT on disk yet (only `writeActiveProfiles` exists in
   `src/lib/compliance-regime.js`; the environment "Decide later" label + no-op
   still live in `src/commands/menu.js`, which is outside this plan's file set).
   Per the explicit wave brief, the menu.md recipes are written to the NEW
   contract now and R2-C2 lands the functions + the menu.js label in the SAME
   wave commit. This is an instruction surface describing machinery that lands
   in the same wave — not a stub — and is flagged loudly in the report.

2. **`claude:done-all-<parent>` recipe added; key registration deferred to
   R2-C2 (seam c).** The review-stage Gate-3 batch recipe is written into
   menu.md's action table calling `approveSubplans(parentSlug, 'review')` (verified
   on disk: `src/lib/actions.js:1663`, `fromStage: 'review'` accepted). The
   menu-side key wiring (recognising the typed word `done-all` on a review list)
   lands in slice R2-C2, noted in the recipe and the report.

3. **`cancelTask` corrected to its real return shape (seam b).**
   `src/lib/actions.js:1283` `cancelTask(projectPath, taskId)` returns
   `{ task, agentTaskId }`: a RUNNING task → `cancelling` (non-terminal; files/slot
   stay locked until `task-reconcile` confirms the harness agent is dead), a QUEUED
   task → `cancelled` (freed at once). The prose that claimed "queued or running →
   terminal cancelled" and "a cancel frees the task's slot" was false for the
   running case and is rewritten to the two-phase truth.

4. **start-agent recipe made an explicit exception to the generic WORK recipe
   (seam a / C1-8).** `startAgent(projectPath, {force})` (`actions.js:1088`) already
   records AND claims the task via `addAndClaim`, so the start-agent recipe must NOT
   call `menu task add` a second time (that was the C1-8 double-enqueue). The recipe
   passes `{force:true}` (human-initiated, clears a drain-stop per R2-B), then stamps
   the harness id with `menu task start <task.id> --agent-id <id>` (verified the
   `--agent-id` flag exists: `menu-screens.js:1599`), and surfaces the R2-B
   `skipped[]` list. The generic WORK-dispatch recipe section is left intact for the
   other WORK actions (menu-protocol.test.js pins its add→dispatch→start ordering).

5. **Plan left in `plans/todo/` (not moved to review).** This slice is one of a
   coordinated wave (R2-A/B/C/C2/D/E/F/I) that lands unstaged together; its recipes
   reference C2 functions not yet on disk, and Gate 3 (review→done) is a human batch
   the wave coordinator crosses across all siblings. Moving this single slice to
   review in isolation would misrepresent wave readiness. Step 8-16 work is complete
   and checkboxed here; stage transition is the wave's, not this slice's. Documented
   choice, surfaced in the report.

7. **CLAUDE.md test-file count reconciled 254 → 256 to keep `doc-counts` green
   honestly.** Two untracked sibling-slice test files (`gate-hook-revival.test.js`
   from R2-F, `menu-inbox-routes.test.js`) brought disk to 256 while CLAUDE.md still
   documented 254 — on a clean HEAD the count matched (254). Step 14 lists
   `doc-counts` as a gate this slice must pass; the only honest way to pass it is to
   correct the documented count to disk truth (weakening the test would leave the doc
   lying — exactly the failure R2-D exists to kill). CLAUDE.md is in this plan's file
   set, so the reconciliation is in scope. Both count sites (the `node --test` command
   line and the architecture tree) were updated.

6. **T9 cross-doc reconciliation is minimal because README/IRON_LOOP are already
   ask-first.** README's interaction model ("Steps 1-7: agents ask, you decide",
   lines 47/286/296/342) and IRON_LOOP (no async/never-block interaction claim on
   disk) already state the ask-first rule honestly. The only false interaction claim
   was README line 16 ("on the first try"), fixed under T3. The batching
   contradiction is resolved solely by adding the ride-along exemption to the
   ask-me-questions synced pair (menu.md already permits ride-along batching in
   Rules 8/10/14).
