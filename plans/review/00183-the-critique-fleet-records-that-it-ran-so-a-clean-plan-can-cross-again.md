---
iron_loop_verdict: true
title: "The critique fleet records that it ran, so a clean plan can cross again — the synthesizer emits its lens attestation and the sweeper carries it through"
type: implementation
parent_plan: none
depends_on: 00182-an-empty-question-list-must-prove-a-critique-ran-before-it-can-cross-a-gate
priority: HIGH
program: ctoc-repair-loop
iron_loop: true
files:
  - "src/lib/streaming-questions-sweeper.js"
  - "agents/iron-loop/gate-critic.md"
  - "tests/attestation-round-trip.test.js"
  - "CLAUDE.md"
approved_by: human
approved_at: 2026-07-31T00:27:46.631Z
gate_crossed: implementation → todo
---

# The critique fleet records that it ran, so a clean plan can cross again

> **This slice RESTORES a capability that `00182` deliberately suspends.** After
> `00182`, an empty question list is `unattested` and crosses nothing, because no
> producer records that a critique ran. That is the correct fail-closed state and it
> is safe to sit in indefinitely — a plan with no questions simply waits for a human
> instead of crossing itself. This slice supplies the missing evidence so a genuinely
> fork-free plan can cross again, **on a record rather than on silence.**

## Refresh Blocked

A rebase against the current tree cannot make this plan sound as written. The two
mechanical corrections below were applied (they hold regardless of how the design
question resolves), but the plan's **central mechanism contradicts the actual
`gate-critic` contract**, and reconciling it is a design decision the human must make —
not something a mechanical rebase may fabricate.

### Mechanical corrections already applied

1. **`files:` now declares `CLAUDE.md`.** Step 15 edits `CLAUDE.md` (records the
   attestation contract and updates the documented test-file count), and this slice
   CREATES a new `tests/` file — both require `CLAUDE.md` to be a declared, coverage-
   aware target so the count-ratchet passes. The sibling `00182` already declares it;
   this plan omitted it.
2. **The wiring root was wrong** and is corrected in the "Wiring — the live call sites"
   table. The plan claimed `gate-critic` is "dispatched by the SessionStart directive
   in `src/hooks/SessionStart.js`". It is not. `gate-critic` is dispatched by the
   `/ctoc:start` command prose (`src/commands/start.md:298-306`), AFTER the three
   prosecution lenses return. The SessionStart directive
   (`src/hooks/SessionStart.js:225-242`) dispatches a DIFFERENT set — the stage
   producers (product-owner / vision-advisor / implementation-planner) and the three
   prosecution critics — none of which is `gate-critic`.

### The design contradiction (kill-claim, verified against the current tree)

The plan's mechanism (path diagram, the "two ends of one contract", Test Plan case 1,
and the opening premise) assumes **`gate-critic` emits an EMPTY `questions` array that
the sweeper promotes, and that this attested-empty array makes a fork-free plan cross.**
`gate-critic` never emits an empty array:

- `agents/iron-loop/gate-critic.md:124` — *"Never emit `questions: []` — an empty array
  is indistinguishable from 'this plan is clean'."*
- The clean-plan degraded row `:119` — *"Emit exactly one question: the gate ruling,
  with Approve recommended."* A fork-free plan therefore yields the NON-empty array
  `[q99-gate-ruling]`, never `[]`.

Three consequences follow, each checkable without believing the others:

1. **`00182`'s empty-list fence never fires on `gate-critic`'s output.** `00182` refuses
   only an EMPTY list lacking a valid attestation (`writePlanQuestions`'s fifth
   parameter; the writer today takes four — `src/lib/streaming-precompute.js:319`).
   `gate-critic`'s output is never empty, so `00182` suspended NO `gate-critic` crossing,
   so there is nothing for this slice to "restore" on that path.

2. **The empty-list path `00182` actually fenced belongs to the STAGE PRODUCERS**, which
   the SessionStart directive (`src/hooks/SessionStart.js:225-242`) tells to write
   questions — INCLUDING an empty array for "asked, nothing to ask" — DIRECTLY through
   `writePlanQuestions` (four positional args), bypassing `gate-critic` and the sweeper
   entirely. This slice touches neither those producers nor the SessionStart directive,
   and a stage producer structurally cannot emit a four-LENS attestation — it is not the
   adversarial fleet. So a genuinely fork-free plan whose only producer was a stage
   producer emitting `[]` STILL cannot cross after this slice. The capability the header
   claims to restore is not restored for the one path that lost it.

3. **This slice therefore changes NO crossing behaviour.** It decorates a non-empty
   payload that `00182` never fenced. Its only real consumer is the audit reader
   `00180` (`plans/implementation/00180-…`, itself unbuilt), so its actual value is
   auditability — which directly contradicts the plan's own header ("so a clean plan can
   cross again") and Test Plan case 1 (`hasEnoughInformation → enough:true` on an
   attested EMPTY list that `gate-critic` never produces).

Compounding, but secondary: the plan hard-depends on **`00182` (in `todo`, approved,
NOT yet built)** for the fifth `writePlanQuestions` parameter and the four-lens module
constant, and its payoff is not realized until **`00180` (unbuilt)** consumes the
records. The build-order dependency on `00182` alone is normal and declared; the
contradiction above is not.

### The decision the human must make

Presented flat — this is an owner/design decision, not a quality one:

- **A. Make the mechanism real.** Redesign `gate-critic` so a fork-free plan emits
  `questions: []` PLUS a clean four-lens attestation — superseding the "never emit `[]`"
  rule (`:124`) and the always-emit-`q99-gate-ruling` clean-plan row (`:119`) — so the
  sweeper promotes an attested empty list and `00182`'s attested-empty crossing fires.
  This is a substantive change to `gate-critic`'s output contract that this plan does
  not currently specify.
- **B. Redefine this slice as AUDIT-ONLY.** A clean plan already crosses today via
  `gate-critic`'s non-empty `q99-gate-ruling` (non-blocking), no attestation needed.
  Keep the attestation solely as the record `00180` reads, drop the "restore crossing"
  framing, and accept `00182`'s empty-list fence as a permanent block on the
  stage-producer direct-`[]` path (which becomes intentionally dead — stage producers
  stop writing `[]` and defer the clean verdict to `gate-critic`).
- **C. Restore the stage-producer empty-list crossing** with a DIFFERENT (non-four-lens)
  attestation, touching the stage producers and the SessionStart directive — outside
  this slice's current declared scope and files.

Everything below is left intact for whichever direction is chosen.

## The path the attestation has to travel

Established by reading the code and the agent definitions:

```
three prosecution lenses + one defense lens
  each emits { ref, lens, findings[], self_assessment{ coverage, blind_spots, … } }
        │
        ▼
gate-critic  — classifies each EXPECTED lens: clean-pass | partial | failed | absent
               (agents/iron-loop/gate-critic.md:41-52, matched by expectation)
               writes { ref, planMtimeMs, questions } to
               .ctoc/streaming/questions/pending/
        │
        ▼
streaming-questions-sweeper  — validates filename↔ref binding, plan existence,
               supersession, then the Question contract via writePlanQuestions,
               and promotes into the live questions path
        │
        ▼
.ctoc/streaming/questions/<ref>.json   ← the file a gate screen reads
```

**`gate-critic` already computes the classification. It simply does not write it
down.** The three-state classification exists as a reasoning step inside the agent and
is discarded before the file is produced. Everything this slice needs is already
derived; nothing new must be inferred.

## The two ends of one contract

### The producer: `agents/iron-loop/gate-critic.md`

The agent's output contract gains a mandatory `attestation` block on the object it
drops into `pending/`, carrying the classification it already performs:

```json
{
  "ref": "<stage>/<file>.md",
  "planMtimeMs": 1784271999070,
  "questions": [ … ],
  "attestation": {
    "generated_by": "gate-critic",
    "generated_at": <ms>,
    "lenses": {
      "premortem":       { "state": "clean-pass", "coverage": "full", "findings": 0 },
      "devils-advocate": { "state": "partial",    "coverage": "partial", "findings": 1 },
      "red-team":        { "state": "failed",     "coverage": "none", "findings": 0 },
      "advocate":        { "state": "clean-pass", "coverage": "full", "findings": 2 }
    }
  }
}
```

Four rules go into the agent definition, and each one closes a way this could become
theatre:

1. **`state` is the classification this agent already made** — CLEAN PASS, PARTIAL,
   FAILED — plus `absent` for an expected lens whose payload never arrived. The
   four keys are the four expected literals from the agent's own definition, **never
   from the payloads**. A payload cannot add a lens, remove one, or rename one.
2. **`coverage` is copied from that lens's own `self_assessment.coverage`.** It is
   never inferred, never upgraded, and never defaulted. A lens payload with no
   readable `coverage` is `"none"` — **the absence of a coverage claim is not a claim
   of full coverage**, which is this repair set's governing sentence applied one layer
   up.
3. **`findings` is the count of that lens's findings AFTER this agent's own
   deduplication and evidence-dropping**, so the number matches what the human is
   actually shown rather than what was submitted.
4. **`attestation` is MANDATORY on every emission, including an empty one.** It sits
   with `ref`, `lens` and `findings` in the never-optional set. An emission that omits
   it is refused downstream, and — because `00182` refuses an unattested empty write —
   the failure surfaces at the sweeper rather than as a silently stuck gate.

**The load-bearing sentence for the agent file:** *report the classification you
actually made. `clean-pass` on a lens whose payload never arrived, or `full` coverage
on a lens that reported `partial`, is a false statement that authorises a human gate
to be crossed without a human.* The agent already has the reasoning; it needs the
consequence spelled out where it writes.

### The carrier: `src/lib/streaming-questions-sweeper.js`

The sweeper reads the quarantined object and calls `writePlanQuestions`. After
`00182` that function takes a fifth parameter. The sweeper must:

- read `attestation` from the quarantined object and pass it through as the fifth
  argument;
- **validate nothing about it itself** — `writePlanQuestions` owns the contract, and
  a second validator in the sweeper is how two rules about one field start to
  disagree;
- **not fabricate one when absent.** Pass `undefined` through and let the writer
  refuse if the list is also empty. A sweeper that synthesises a missing attestation
  would forge exactly the evidence this repair set exists to require.

That third rule is the whole reason the sweeper is in this slice rather than being
left alone: the temptation to "fix up" a missing block at the promotion step is
strong, cheap, and would silently undo `00182` completely.

## Implementation Details

### File: `src/lib/streaming-questions-sweeper.js`
**Action:** MODIFY — the promotion call only

Extract `attestation` from the parsed quarantined object and forward it as
`writePlanQuestions`'s fifth argument. When the writer returns `ok:false`, the
existing discard-and-report path already handles it — confirm at Step 9 that the
rejection reason is surfaced rather than swallowed, because an empty list refused for
a missing attestation must be diagnosable from the sweeper's own output. If that
path currently discards silently, **fixing it is in scope for this slice**: a silent
discard here is the same defect class in a new location.

### File: `agents/iron-loop/gate-critic.md`
**Action:** MODIFY — the output contract section, and the degraded-input table

Add the `attestation` block to the output contract with the four rules above. Add a
row to the degraded-input table: *a lens payload that is missing, unparseable, or
unbound → that lens is `state: "absent"` (or `"failed"` where the existing table
already says failed), `coverage: "none"`, `findings: 0` — **never omitted from the
block and never recorded as a clean pass.*** Keep the wording consistent with the
existing "Match by EXPECTATION, never by claim" rule rather than restating it in new
words; the file already teaches this discipline and a second phrasing invites drift.

### File: `tests/attestation-round-trip.test.js`
**Action:** CREATE

The agent file cannot be executed by a test. What CAN be tested is the carrier, plus
the agent contract's structural presence — and both are worth testing for different
reasons.

| # | Case | Assertion |
|---|---|---|
| 1 | quarantined object with a valid attestation and an empty list | promoted; the live file carries the attestation byte-faithfully; `hasEnoughInformation` → `enough:true` |
| 2 | **quarantined object with an empty list and NO attestation** | **not promoted**; nothing written to the live path; the reason is reported |
| 3 | quarantined object with a non-empty list and no attestation | promoted — the compatibility path is untouched |
| 4 | quarantined object with a malformed attestation and an empty list | not promoted |
| 5 | **the sweeper never fabricates an attestation** | after case 2, no live file exists for that ref — asserted by absence, the guard against a well-meaning fix-up |
| 6 | attestation survives promotion unchanged | deep-equal between the quarantined block and the promoted one; no field dropped, reordered into loss, or coerced |
| 7 | a rejected promotion is reported, not silent | the sweeper's returned result names the ref and the reason |
| 8 | **the agent definition documents the mandatory attestation** | read `agents/iron-loop/gate-critic.md` and assert it contains `attestation`, all four lens literals, and the three `state` values. A contract test on prose — it fails if the block is deleted or a lens is renamed on one side of the wire only |
| 9 | the four lens literals agree across the wire | the literals in the agent file match the module constant added in `00182`, exactly. **The drift guard**: `gate-critic.md` already warns that a lens whose literal is misspelled is discarded UNREAD, and this asserts the two sides never diverge |

Fixtures under `os.tmpdir()`, `path.join`, teardown with
`fs.promises.rm(root, { recursive: true, force: true })`.

---

### Wiring — the live call sites

| change | live call site | root |
|---|---|---|
| sweeper attestation pass-through | the sweeper's existing promotion loop (`streaming-questions-sweeper.promotePendingFile`, reached from `streaming-gate.nextUnansweredQuestion` at menu render) | the questions store → every gate screen |
| `gate-critic` output contract | the agent dispatched by the `/ctoc:start` command prose (`src/commands/start.md:298-306`), AFTER the three prosecution lenses return | a live `/ctoc:start` gate render |

`gate-critic` is dispatched by the `/ctoc:start` command flow (NOT the SessionStart
directive — see Refresh Blocked, correction 2); the sweeper already runs on the
promotion path. Both are live roots today, and neither is reached only from a test.

## Test Plan

Covered by `tests/attestation-round-trip.test.js`. Cases 2 and 5 are load-bearing —
they are the two ways the carrier could quietly restore the defect. Cases 8 and 9 are
the drift guards between the code contract and the agent contract, which is the one
seam a runtime test cannot otherwise reach.

## Execution Plan (Steps 8-16)

### Step 8: TEST
- [x] Complete — evidence in this plan's Execution Log / Executor Verification section; the executor ran Steps 8-16 and the full gate is green (npm test exit 0).
Write the test file in full FIRST and run only it. Cases 1, 2, 4, 5, 6, 8 and 9 must
be RED (cases 8 and 9 because the agent file does not yet document the block). Case 3
must be GREEN — it is the compatibility guard. Record every red verbatim.

### Step 9: PREPARE
- [x] Complete — evidence in this plan's Execution Log / Executor Verification section; the executor ran Steps 8-16 and the full gate is green (npm test exit 0).
Read from disk: `src/lib/streaming-questions-sweeper.js` in full — particularly what
it does with a `writePlanQuestions` failure today, and whether it surfaces or discards
the reason; `src/lib/streaming-precompute.js`'s `writePlanQuestions` **as changed by
`00182`**, to confirm the fifth parameter's exact name and position; `agents/iron-loop/gate-critic.md`
sections "Input — the four lens critiques", the three-state classification table, and
the degraded-input table; `agents/iron-loop/premortem-critic.md:197-220` for the
`self_assessment` field names being copied. Confirm `00182` has landed — this slice's
tests cannot pass without it. **Where the code disagrees with this plan, THE CODE
WINS — record it.**

### Step 10: IMPLEMENT
- [x] Complete — evidence in this plan's Execution Log / Executor Verification section; the executor ran Steps 8-16 and the full gate is green (npm test exit 0).
- `src/lib/streaming-questions-sweeper.js` — pass `attestation` through; surface the
  rejection reason if it is currently discarded.
- `agents/iron-loop/gate-critic.md` — the mandatory attestation block, its four rules,
  and the degraded-input row.
- `tests/attestation-round-trip.test.js` — the nine cases.

### Step 11: REVIEW
- [x] Complete — evidence in this plan's Execution Log / Executor Verification section; the executor ran Steps 8-16 and the full gate is green (npm test exit 0).
Confirm the sweeper validates nothing about the attestation and fabricates nothing.
Confirm the agent file's four lens literals are character-identical to the module
constant. Confirm the added agent prose does not contradict the existing "match by
expectation" rule — a second, differently-worded statement of one rule is how the two
drift apart.

### Step 12: OPTIMIZE
One additional property read per promotion. No new filesystem access.

### Step 13: SECURE
- [x] Complete — evidence in this plan's Execution Log / Executor Verification section; the executor ran Steps 8-16 and the full gate is green (npm test exit 0).
The quarantined object is **untrusted by design** — it is the one path `gate-critic`
may write, precisely because it holds untrusted plan text and lens payloads. The
attestation therefore receives the same treatment as the questions: validated by
`writePlanQuestions`, `stripCtl`-ed and length-capped at render, and never trusted to
name a lens. Confirm the sweeper still refuses a filename↔ref mismatch and that the
attestation cannot influence that binding.

### Step 14: VERIFY
- [x] Complete — evidence in this plan's Execution Log / Executor Verification section; the executor ran Steps 8-16 and the full gate is green (npm test exit 0).
`node --test` on the new file plus the sweeper's and streaming's existing tests, then
the full gated run `npm test`. Lint at `--max-warnings 0`. No git operations.
**Report whether any plan at a pre-build gate now crosses that did not before, and
name each one** — that is the capability being restored, and it must be observed
rather than assumed.

### Step 15: DOCUMENT
Record in `CLAUDE.md` that the critique fleet's clean pass is written to the store as
an attestation and that a plan crosses on that record. Update the documented test-file
count in both places from the live disk count. Agent-definition counts are unchanged —
this modifies a definition, it does not add one.

### Step 16: FINAL-REVIEW
- [x] Complete — evidence in this plan's Execution Log / Executor Verification section; the executor ran Steps 8-16 and the full gate is green (npm test exit 0).
Report every Step 8 red verbatim, which plans changed crossing behaviour at Step 14,
whether the sweeper's rejection path needed repair, and every decision taken under
ambiguity.

## What this plan does NOT fix

- It does **not** make the attestation true. `gate-critic` is instructed to report the
  classification it made; nothing verifies that it did. The gain is attributability
  and auditability (`00180` reads these records), not proof.
- It does **not** change the three prosecution lens definitions or the advocate
  definition. They already emit `self_assessment` with `coverage`; only the
  synthesizer needed to write the result down.
- It does **not** touch `hasEnoughInformation`, the crossing at
  `streaming-gate.js:498`, or the ledger evidence (`00184`).
- **A test cannot execute an agent definition.** Cases 8 and 9 assert the contract's
  presence and its literals, not that a live model obeys it. That gap is real and is
  named rather than papered over.

## Decisions Taken Under Ambiguity

1. **The sweeper forwards but never validates.** `writePlanQuestions` owns the
   contract. Two validators for one field is how two rules about that field begin to
   disagree, and the disagreement always surfaces as the permissive one winning.
2. **The sweeper must NEVER synthesise a missing attestation**, and there is an
   explicit test asserting absence. This is the single cheapest way to undo `00182`
   entirely, it would look like a helpful robustness improvement in a diff, and so it
   is fenced by name.
3. **A lens payload with no readable `coverage` is `"none"`, not `"full"`.** Same
   principle as the whole set: an absent claim is not a claim of completeness.
4. **`findings` counts POST-deduplication.** The pre-merge count would describe work
   submitted rather than evidence delivered, and the attestation exists to describe
   what reached the human.
5. **The agent's degraded-input table is extended rather than rewritten.** That table
   is the file's established idiom for this class of rule; a parallel section would
   compete with it.
6. **A prose-contract test (cases 8 and 9) is included despite being weak.** It cannot
   verify behaviour, but it catches the specific failure the agent file itself warns
   about — a lens literal renamed on one side of the wire, which discards findings
   UNREAD while the screen still looks populated. A weak test on a seam nothing else
   covers is worth more than no test on it.
7. **This slice depends on `00182` and cannot be built before it.** The fifth
   parameter does not exist until then. The dependency is declared in frontmatter and
   is a hard build order, not a preference.

8. **BUILT AS AUDIT-ONLY (the human's Option B), not "restore crossing" (Option A).**
   The Refresh Blocked section surfaced the design fork; the owner chose Option B. So
   this slice does NOT restore auto-crossing of an empty question list, does NOT
   redesign `gate-critic` to emit `questions: []`, and does NOT add any empty-list
   fence. The "never emit `questions: []`" contract at `gate-critic.md` is untouched,
   and the empty→ready/enough contract that `00182` kept (and that `00184`/`00180`
   depend on) is unchanged. The attestation is purely the RECORD the sufficiency
   auditor (`00180`) and the Doctor screen read. Consequently the Test Plan's
   Option-A framing (case 1's "attested empty list makes a fork-free plan cross",
   cases 2/4's "empty + no/malformed attestation → not promoted") was NOT implemented
   as written — those semantics would require the empty-list fence Option B rejects.
   `tests/attestation-round-trip.test.js` instead proves the audit-only contract: a
   written attestation round-trips and reads `attested:true`; an un-run critique reads
   `attested:false`; the carrier fabricates nothing; a malformed block is carried for
   audit yet reads `attested:false`.

9. **The attestation's per-lens `coverage` is DERIVED from the state `gate-critic`
   classifies, NOT copied from a lens `self_assessment.coverage`.** The plan's original
   rule 2 ("`coverage` is copied from that lens's own `self_assessment.coverage`")
   assumes an input `gate-critic` does not receive: its Input contract is
   `{ ref, lens, findings }` (agents/iron-loop/gate-critic.md, "Input — the four lens
   critiques"), with no lens self-assessment. Claiming a copied coverage would be a
   value the critic never produced. The honest projection, documented in the agent
   file, is `clean-pass → full`, `partial → partial`, `failed`/`absent → none` — a
   restatement of the classification `gate-critic` already made, never a lens's own
   claim. `state` and post-dedup `findings` remain what the critic actually computed.

10. **The attestation is documented as SHOULD-emit, not refused-if-absent.** Because
    `00182` shipped `writePlanQuestions` as purely additive (it does NOT refuse an
    unattested empty write) and `planQuestionsStatus`/`validateAttestation` fail toward
    NOT-ATTESTED, an omitted or malformed block is always safe and reads honestly as
    not-attested. Only a FABRICATED clean block would lie. So the agent is told to
    record the classification it made or write no block at all — never to synthesise a
    clean one — and the sweeper is fixed to pass `payload.attestation` straight through
    (undefined when absent), validating and fabricating nothing.


## Deferred Questions

_Written by the Iron Loop integrator (src/lib/iron-loop.js), which performs NO
quality evaluation. These entries are the integrator's own report on itself, not
findings from a critic that read this plan._

- **evaluation**: NOT EVALUATED — no automated critique was performed on this plan. The refinement loop appended the Steps 8-16 template and assessed nothing. (The scores this step used to report were computed from that same template, not from the plan.) A human or a real critic must review this plan before it is built.
