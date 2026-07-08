---
approved_by: human
approved_at: 2026-07-08T20:25:27.970Z
gate_crossed: review → done
---

---
iron_loop: true
approved_by: human
approved_at: 2026-07-08T19:25:50.893Z
gate_crossed: implementation → todo
---

---
title: "EC5-s5 — CTO Chief compliance dispatch instruction (LIVE wiring)"
type: implementation
parent_plan: EC5-iron-loop-integration
depends_on: EC5-s3-compliance-integration, EC5-s4-iron-loop-trigger
files:
  - agents/coordinator/cto-chief.md
  - tests/cto-chief-compliance-dispatch.test.js
priority: MEDIUM
iron_loop: true
---

# EC5-s5 — CTO Chief compliance dispatch instruction (LIVE wiring)

## Context (why this slice exists)

CTO Chief is the sole top-level dispatcher (CLAUDE.md invariant). This is the
human-facing wiring slice: it adds the compliance dispatch CASE to
`agents/coordinator/cto-chief.md` so that at the functional→implementation
transition, CTO Chief reads the `compliance_trigger:` emitted by EC5-s4's
`iron-loop-compliance-trigger.js` and, when a regime is on, invokes EC5-s3's
`compliance-integration.js` seam (`runComplianceForTransition`) — logging every
dispatch with `dispatcher: "cto-chief"`. `iron-loop.js`/library code never
dispatches; CTO Chief does.

Per the PI4 lesson — **any human-facing surface wires LIVE and the test drives the
real flow** — this slice's test does NOT merely grep the agent markdown for the
instruction text (necessary but insufficient). It EXERCISES the real seam the
instruction points at: write a real `compliance_trigger` with EC5-s4, then run
EC5-s3's `runComplianceForTransition` against a real tmp project and assert the
real Inbox question(s) land and `dispatcher: "cto-chief"` is the recorded
dispatcher. The instruction and the code it invokes are verified together.

## Implementation Details

### Architecture Decision

**Two coordinated changes, one slice: the prose instruction AND a live-flow test.**
The agent-markdown edit is the deliverable a human reads; the test is the proof the
instruction is executable and correct. They ship together (module-and-test rule
applied to an agent-definition surface). The instruction is added as a new
dispatch case in `cto-chief.md`'s existing dispatch-rules section (near the
existing `compliance/gdpr-compliance-checker` guidance), phrased to reference the
REAL exported functions by name (`evaluateComplianceTrigger` /
`runComplianceForTransition`) so a reader can trace it to code.

The `dispatcher: "cto-chief"` audit field is written per the DISPATCH_PROTOCOL —
the test asserts the recorded dispatcher for the compliance invocation is
`"cto-chief"`, never `"iron-loop"`, satisfying parent Scenario "CTO Chief is the
sole dispatcher — iron-loop.js does not dispatch agents".

### Dependency Graph

```
agents/coordinator/cto-chief.md  (dispatch instruction — prose)
  --references--> src/lib/iron-loop-compliance-trigger.js  (evaluate/write)  [EC5-s4]
  --references--> src/lib/compliance-integration.js        (runCompliance…)  [EC5-s3]
  --tested-by--> tests/cto-chief-compliance-dispatch.test.js  (drives the REAL flow)
```

Depends on siblings EC5-s3 and EC5-s4. No cycle. Chain depth 3 (s1/s2 → s3 → s5;
s4 → s5).

### File Specifications

#### File: `agents/coordinator/cto-chief.md`
**Action:** MODIFY
**Purpose:** Add the compliance dispatch case so CTO Chief runs the compliance
seam at the functional→implementation transition, as the sole dispatcher.
**Change Type:** modify-existing (add a dispatch case; touch no gate rule)

##### Changes
- **Add** a new subsection to the dispatch-rules region (adjacent to the existing
  `compliance/gdpr-compliance-checker` bullet) titled e.g.
  **"Compliance dispatch at the functional→implementation transition"** stating:
  - "When a plan crosses Gate 1 (functional→implementation), CTO Chief evaluates
    the compliance trigger via `src/lib/iron-loop-compliance-trigger.js`
    (`evaluateComplianceTrigger(projectRoot)` — or reads the `compliance_trigger:`
    frontmatter block if `writeComplianceTrigger` already persisted it)."
  - "If `runGdpr` and/or `runEuAiAct` is true, CTO Chief dispatches the compliance
    seam `src/lib/compliance-integration.js` (`runComplianceForTransition`), which
    runs the opted-in regime runner(s), cross-dedups overlapping plan-stage
    findings, and attaches them to the Inbox."
  - "Findings are ADVISORY: they attach to the Inbox before Gate 2 is presented;
    they do NOT auto-revert or auto-advance any plan and add NO human gate."
  - "Log every compliance dispatch with `dispatcher: \"cto-chief\"` per
    DISPATCH_PROTOCOL. Library code (`iron-loop.js` / the trigger emitter) never
    dispatches — it only emits the condition CTO Chief reads."
- **Do NOT** modify any human-gate rule, the 4-gate description, or any
  `review_gate` / enforcement text already in the file.

##### Called By
- (Prose) — read by the CTO Chief agent at dispatch time. Not code-imported.

##### Cross-Platform Notes
- Prose only; no code paths.

#### File: `tests/cto-chief-compliance-dispatch.test.js`
**Action:** CREATE
**Purpose:** Prove the instruction is present AND that the real seam it points at
executes correctly end-to-end (PI4 live-flow rule).
**Change Type:** new-test

### Test Plan

#### Tests: `tests/cto-chief-compliance-dispatch.test.js`
**Action:** CREATE
**Framework:** `node:test`. Combine a source-presence assertion on the agent
markdown with a REAL end-to-end flow through EC5-s4 + EC5-s3 against a tmp project
(real `.ctoc/settings.yaml`, real regime YAMLs, real Inbox — no mocks).

##### Test Cases
1. **Instruction present + names the real functions.** Read
   `agents/coordinator/cto-chief.md`: assert it contains the compliance dispatch
   subsection AND references `runComplianceForTransition` (and the trigger
   emitter) AND the string `dispatcher: "cto-chief"`.
2. **Instruction does NOT weaken a gate.** Assert the markdown states findings are
   advisory / add no human gate, and assert the file still describes exactly the
   4 human gates (no 5th "compliance gate" added). `grep` for any accidental
   `review_gate: true` addition ⇒ none introduced by this slice.
3. **LIVE flow — GDPR on: dispatcher is CTO Chief, finding attaches.** Tmp project
   with `active_profiles:[gdpr]`; call `evaluateComplianceTrigger(root)` ⇒
   `runGdpr:true, dispatcher:'cto-chief'`; then call
   `runComplianceForTransition(root, { gdprFindings:[planStageFinding] })` ⇒
   `gdprRan:true`, exactly one real Inbox question file on disk. Assert the
   recorded dispatcher for this flow is `'cto-chief'` (from the trigger's
   `dispatcher` field), never `'iron-loop'`.
4. **LIVE flow — both on, overlap deduped once.** `active_profiles:[gdpr,
   eu-ai-act-high-risk]`; supply overlapping GDPR + EU-AI-Act plan-stage findings
   ⇒ exactly ONE Inbox question file (deduped), `deduped === 1`.
5. **LIVE flow — empty profiles is a no-op.** `active_profiles:[]` ⇒ trigger both
   `false`; `runComplianceForTransition` writes no Inbox file and mutates no plan
   file (byte-diff assertion).
6. **Advisory — plan not moved.** With a tmp plan in `plans/implementation/` and a
   critical finding, after the flow the plan file is STILL in
   `plans/implementation/` (not reverted to `functional/`, not advanced to
   `todo/`) and its approval marker is unchanged.
7. **GATE-INVARIANT (load-bearing).** Read `src/hooks/human-gate-check.js` source:
   assert `HUMAN_GATES` still has exactly 3 destination keys (`implementation`,
   `todo`, `done`) — the 4-gate topology (Gate 0–3) unchanged. Assert this slice
   introduced no gate mutation: the compliance flow (trigger + integration) writes
   only Inbox questions and moves no plan.

##### Coverage Targets
- The live-flow cases (3–6) are behavioral end-to-end tests driving the real
  Inbox + real gates; the markdown-presence cases (1–2) guard the instruction.
- No test asserts only structure without also driving the real flow (PI4).

### Security Review

- [x] Path traversal: test uses tmp dirs via `os.tmpdir()` + `path.join`; the
      seam builds no paths.
- [x] Input validation: exercised via the underlying s3/s4 modules' fail-open.
- [x] No secrets in the agent markdown or the test.
- [x] Safe file operations: Inbox writes only; agent-markdown edit is additive prose.
- [x] Error messages: no leaks.
- [x] Prototype pollution: n/a (prose + test).
- [x] Command injection: none.

## Execution Plan (Steps 8-16)

### Step 8: TEST (TDD Red)
- [x] Write `tests/cto-chief-compliance-dispatch.test.js` covering cases 1–7 above
- [x] Include the LIVE end-to-end flow (cases 3–6) driving the REAL Inbox + gates
- [x] Include the GATE-INVARIANT (case 7)
- [x] Run tests — expect RED (instruction not yet in the markdown)

### Step 9: PREPARE
- [x] Confirm EC5-s3 (`compliance-integration`) and EC5-s4 (`iron-loop-compliance-trigger`) are built (depends_on)
- [x] Confirm the tmp-project fixture writes real settings + both regime YAMLs

### Step 10: IMPLEMENT
- [x] Add the compliance dispatch subsection to `agents/coordinator/cto-chief.md`
- [x] Reference the real functions (`evaluateComplianceTrigger`, `runComplianceForTransition`) and `dispatcher: "cto-chief"`
- [x] State advisory / no-new-gate / library-does-not-dispatch explicitly
- [x] Touch NO existing gate rule

### Step 11: REVIEW
- [x] Self-review: instruction is traceable to the real code seam
- [x] Verify no human-gate rule was altered; 4 gates still described

### Step 12: OPTIMIZE
- [x] Keep the instruction concise and adjacent to existing compliance dispatch guidance

### Step 13: SECURE
- [x] No secrets; additive prose only; test uses tmp dirs

### Step 14: VERIFY
- [x] Run lint + type check
- [x] Run ALL tests: `node --test tests/cto-chief-compliance-dispatch.test.js`
- [x] Coverage ≥ 80% on any exercised code; 0 skipped, 0 flaky
- [x] Confirm live-flow + dispatcher-identity + gate-invariant tests pass

### Step 15: DOCUMENT
- [x] The instruction itself is the documentation; ensure it names the seam + dispatcher

### Step 16: FINAL-REVIEW
- [x] Verify Steps 8–15 completed
- [x] Instruction present + LIVE flow + dispatcher=cto-chief + gate-invariant all green
- [x] Ready for human review

## Decisions Taken Under Ambiguity

1. **Placement of the compliance-dispatch subsection.** The plan says "adjacent
   to the existing `compliance/gdpr-compliance-checker` bullet." That bullet
   appears twice (Step 6.5 THREAT MODEL and Step 13 SECURE), but the plan is
   explicit that the case belongs at the **functional → implementation
   transition** (Gate 1). Those two existing bullets are at Step 6.5 and Step 13
   — later phases, not Gate 1. Chose to place the new `### Compliance dispatch at
   the functional → implementation transition` subsection **immediately after
   Step 4 CAPTURE's "Gate 1" outcome line and before Step 5 PLAN** — the exact
   Gate-1 seam the plan names. This is more faithful to the transition semantics
   than co-locating with a Step-13 bullet. Additive; no existing content moved.

2. **Case-insensitive `advisory` match in the content test.** The instruction
   emphasises the word with "**Findings are ADVISORY.**" (all-caps for emphasis).
   The initial test regex `/[Aa]dvisory/` did not match "ADVISORY". Chose to
   relax the test to `/advisory/i` rather than de-emphasise the prose — the
   all-caps emphasis is the higher-quality human-facing wording, and the test's
   intent is "the case states findings are advisory," which case-insensitive
   matching captures correctly.

3. **Body-bytes-unchanged assertion for the gate-off no-op (case 5).** EC5-s4's
   `writeComplianceTrigger` upserts a `compliance_trigger:` block INSIDE the plan
   frontmatter even when both gates are off (the trigger descriptor is still
   `{runGdpr:false, runEuAiAct:false, dispatcher:'cto-chief'}`), so a
   whole-file byte comparison would (correctly) differ. The no-op guarantee that
   matters is: no Inbox write, no plan MOVED, and the plan **body** (everything
   after the closing frontmatter delimiter) untouched. The test asserts exactly
   that — body bytes identical + zero Inbox files — which is the real,
   load-bearing no-op property, not an over-strict whole-file identity that would
   contradict the shipped EC5-s4 trigger-persistence behaviour.

4. **Dispatcher proof read from two sources.** To make the "dispatcher is
   cto-chief, never iron-loop" claim robust, case 3 asserts it BOTH from the
   in-memory `writeComplianceTrigger(...).trigger.dispatcher` return AND from the
   persisted frontmatter on disk (`/dispatcher:\s*cto-chief/` present,
   `/dispatcher:\s*iron-loop/` absent). Reading disk state is the read-fresh
   discipline and proves the wiring survives serialisation.

## Verification Results (Steps 8–16)

- **RED → GREEN:** initial run — content cases 1–2 FAILED (instruction absent),
  live-flow cases 3–7 PASSED against the real shipped seam. After adding the
  subsection: 8/8 pass.
- **`node --test tests/cto-chief-compliance-dispatch.test.js`:** tests 8,
  suites 6, pass 8, fail 0.
- **LIVE end-to-end proof:** case 3 writes the trigger into a real plan's
  frontmatter, reads it back from disk, re-evaluates the gate, dispatches
  `runComplianceForTransition`, and reads exactly ONE real Inbox question file
  from `.ctoc/inbox/questions/` on disk carrying the GDPR message + `source_step:
  compliance-gdpr`. Case 4: both regimes on, overlapping finding ⇒ `deduped:1`,
  ONE file on disk (single-write). Case 5: empty profiles ⇒ trigger both false,
  no Inbox file, plan body byte-unchanged.
- **Dispatcher proof:** trigger `dispatcher === 'cto-chief'` (in-memory AND
  persisted frontmatter), NEVER `'iron-loop'` — asserted in cases 3, 4, 5.
- **Full suite `node --test tests/*.test.js`:** tests 3374, suites 731, pass
  3374, **fail 0**, exit 0. architecture-invariants + readme-numbers +
  cto-chief-toplevel all green (edit is additive; no agent-count claim moved —
  no new agent `.md`).
- **`npx eslint . --max-warnings 0`:** exit 0.
- **`npx tsc --noEmit`:** 89 errors WITH the slice, 89 errors WITHOUT it —
  baseline-neutral; the slice contributes zero tsc errors (none reference
  cto-chief.md or the two seam modules).
- **Gate invariant:** case 7 asserts `HUMAN_GATES` has exactly the 3 destination
  keys (implementation, todo, done — the 4-gate topology), and that neither the
  trigger emitter nor the integration seam names a gate key or requires a hook /
  the plan-moving actions module. Case 2 asserts the new subsection names no
  `iron-loop` dispatcher, adds no `Gate 4`, and introduces no `review_gate: true`.

_(Plan NOT moved — execution stops at Step 16 per slice brief; Gate 2 is a human
gate and this plan remains in `todo/`.)_
