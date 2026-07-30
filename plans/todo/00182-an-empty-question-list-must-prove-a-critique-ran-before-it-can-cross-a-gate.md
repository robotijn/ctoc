---
iron_loop_verdict: true
title: "An empty question list must prove a critique ran before it can cross a gate — attestation replaces emptiness as the evidence"
type: implementation
parent_plan: none
depends_on: 00181-an-unflagged-question-blocks-a-gate-instead-of-waving-it-through
priority: CRITICAL
program: ctoc-repair-loop
iron_loop: true
files:
  - "src/lib/streaming-precompute.js"
  - "tests/questions-attestation.test.js"
  - "CLAUDE.md"
approved_by: human
approved_at: 2026-07-30T14:47:43.962Z
gate_crossed: implementation → todo
---

# An empty question list must prove a critique ran before it can cross a gate

## The file contradicts itself, and the permissive reading is the one wired to a gate

`src/lib/streaming-precompute.js:354-358`, on the `ready` status:

> `questions` MAY be `[]` — the honest "the critique ran and found nothing to ask".
> That is a REAL state.

`:725-727`, in the same file, in `hasEnoughInformation`'s fail-closed doc block:

> **ABSENCE OF EVIDENCE IS NOT EVIDENCE OF ABSENCE**: a plan whose questions were
> never computed does not thereby have "enough information" — we simply do not KNOW,
> and not-knowing is not a pass.

Both statements are about the same thing: how much is known about a plan. The second
is correct. The first grants a pass to a state that carries no more knowledge than
the state the second refuses.

**And the first is the one with an action attached.** `validatePlanQuestions([])`
returns valid — every `errors.push` sits inside a `forEach` over the array, and an
empty array iterates zero times. `hasEnoughInformation` then filters an empty list
twice, gets two empty lists, and reaches `:793` with `enough: true`. At
`streaming-gate.js:603-607` (`crossBySufficiency`, defined `:498`) that verdict
crosses the plan from `functional` to `implementation`, or from `implementation` to
`todo`, writes a sufficiency ledger entry, and `continue`s past the human entirely.

### The real defect is not the emptiness — it is what is not recorded

The stored file is `{ ref, planMtimeMs, questions }` and nothing else. It records **no
producer identity, no lens coverage, no finding count, no evidence that any critique
ever ran.**

> **"The adversarial fleet examined this plan and found zero forks" and "an empty
> array reached the writer" are the same bytes and the same verdict.**

A bug in a producer, a subagent that errored after opening its output, a truncated
payload, or a hostile plan that talked its reviewer into emitting nothing — every one
of them lands as a trusted empty list. The `pending/` quarantine and the sweeper
protect against a malformed file; they do not and cannot distinguish a well-formed
empty result from a well-formed no-result.

## What a questions file must carry for an empty list to be trusted

**Do not invent a format. The lenses already emit exactly this data**, and it was read
before this plan was written.

`agents/iron-loop/premortem-critic.md:197-210` defines a `self_assessment` block that
every lens emits on every emission, mandatory, including an empty one:

```json
"self_assessment": {
  "ancestry_read": [...], "ancestry_missing": [...], "inputs_unsupplied": [...],
  "source_grepped": [...], "gate": "Gate 2", "gate_source": "named-in-brief",
  "coverage": "full", "blind_spots": [...], "budget_exhausted": false,
  "rerun_stability": "stable"
}
```

And `agents/iron-loop/gate-critic.md:41-52` already classifies each of the four
expected lenses — the prosecution literals `premortem`, `devils-advocate`,
`red-team`, and the defense literal `advocate` — into exactly three states: **CLEAN
PASS, PARTIAL, FAILED**, matched by expectation and never by the payload's own claim.
Line 120 already states the governing rule in the agent layer:

> A clean result from an incomplete review is not a pass.

**That rule exists in the agent definitions and is enforced nowhere in code.** This
slice is not a new concept; it is the projection of an existing contract into the
store, so the rule survives a producer that ignores it.

### The `attestation` block

A questions file becomes `{ ref, planMtimeMs, questions, attestation }` where
attestation is:

```json
{
  "generated_by": "gate-critic",
  "generated_at": 1784271999070,
  "lenses": {
    "premortem":       { "state": "clean-pass", "coverage": "full", "findings": 0 },
    "devils-advocate": { "state": "clean-pass", "coverage": "full", "findings": 0 },
    "red-team":        { "state": "clean-pass", "coverage": "full", "findings": 0 },
    "advocate":        { "state": "clean-pass", "coverage": "full", "findings": 2 }
  }
}
```

`state` is one of `clean-pass | partial | failed | absent`. `coverage` is one of
`full | partial | none`, the lenses' own vocabulary. `findings` is a non-negative
integer.

**An empty questions list is trustworthy exactly when all THREE PROSECUTION lenses are
`clean-pass` with `coverage: "full"`.** The defense lens (`advocate`) is deliberately
excluded from the test: it produces arguments FOR crossing, so its failure removes an
argument rather than adding evidence of a problem — which is the rule
`gate-critic.md:120` already states, adopted here verbatim rather than re-derived.

### The new status: `unattested`

`planQuestionsStatus` gains a sixth status. It applies **only** to a file whose
`questions` array is empty and whose attestation is missing, malformed, or does not
meet the bar above. A file with a non-empty `questions` array is unaffected — the
questions display and block exactly as they do today.

That scoping is the whole compatibility story. The 15 questions files in this
repository have no attestation block and non-empty arrays; all continue to work
unmodified. **Verified by reading them.**

`hasEnoughInformation` fails closed on `unattested`, joining `not-computed`, `stale`,
`invalid` and `unknown-plan` in the list at `:731-737`. The reason string is
`unattested`, distinct from every other, so a gate screen can say *"no critique is on
record for this plan"* rather than the misleading *"questions were never generated"*.

**A trusted empty list still crosses.** This slice does not remove the auto-crossing;
it makes the crossing depend on positive evidence that a critique ran, instead of on
the absence of output.

## Implementation Details

### File: `src/lib/streaming-precompute.js`
**Action:** MODIFY

1. **`validateAttestation(attestation)`** — new, not exported at first draft; export it
   only if Step 9 finds a real second caller. Returns `{valid, errors}`. Requires
   `generated_by` (non-empty string), `generated_at` (finite number), and a `lenses`
   object carrying all four expected literals, each with a `state` and `coverage` from
   the closed vocabularies and a non-negative integer `findings`. **The four expected
   lens names come from this module, never from the payload** — mirroring
   `gate-critic.md:41`, so a payload cannot add, remove, or rename a lens.
2. **`attestsEmptiness(attestation)`** — true only when the three prosecution lenses
   are each `clean-pass` with `coverage: "full"`.
3. **`writePlanQuestions(root, ref, questions, planMtimeMs, attestation)`** — a fifth
   parameter, persisted when present. **When `questions` is empty and no valid
   attestation is supplied, the write is REFUSED** with an error saying so plainly.
   An empty list is the one shape that must never reach disk unexplained.
   The parameter is positional and optional, so every existing non-empty call site
   (the sweeper's `precompute.writePlanQuestions(root, ref, payload.questions,
   currentMtimeMs)` at `streaming-questions-sweeper.js:195`) compiles and behaves
   identically.
4. **`planQuestionsStatus`** — after the existing validity and staleness checks (the
   staleness branch ends at `:465`, before the final `return {status:'ready', …}` at
   `:467`), if `questions.length === 0` and `attestsEmptiness` is not satisfied, return
   `{status: 'unattested', reason, errors}` where `reason` names which lens failed the
   bar. Ordered AFTER staleness so a stale empty file still reports `stale`, the more
   actionable instruction. Read `parsed.attestation` from the object already parsed at
   `:427` — no second read.
5. **`hasEnoughInformation`** — no logic change needed; it already fails closed on
   every non-`ready` status (the `if (status.status !== 'ready')` guard at `:764`).
   **Update its fail-closed doc block at `:731-737` to list `unattested`**, and update
   the `:354-358` comment that currently blesses an empty array, which is the sentence
   this slice exists to retract.

### File: `tests/questions-attestation.test.js`
**Action:** CREATE

| # | Case | Assertion |
|---|---|---|
| 1 | **empty list, no attestation** | `planQuestionsStatus` → `unattested`; `hasEnoughInformation` → `enough:false`, reason `unattested`. **The defect** |
| 2 | empty list, full clean attestation | `ready`, `enough:true` — the legitimate wave-through survives |
| 3 | empty list, one prosecution lens `partial` | `unattested`, and the reason names that lens |
| 4 | empty list, one prosecution lens `failed` | `unattested` |
| 5 | empty list, one prosecution lens `absent` | `unattested` |
| 6 | empty list, a prosecution lens `clean-pass` but `coverage: "partial"` | `unattested` — a clean result from an incomplete review is not a pass |
| 7 | **empty list, `advocate` failed, three prosecution lenses clean** | `ready`, `enough:true` — the defense lens does not gate |
| 8 | empty list, attestation with an unknown lens name added | the extra key is ignored; the verdict rests on the four expected literals only |
| 9 | empty list, attestation missing a lens key entirely | `unattested` |
| 10 | empty list, attestation malformed (`lenses` is an array, or a string) | `unattested`, never a crash |
| 11 | **non-empty list, no attestation** | `ready` — unchanged behaviour, the compatibility guard |
| 12 | `writePlanQuestions` refuses an empty list with no attestation | `ok:false`, error names the reason, **no file written** |
| 13 | `writePlanQuestions` accepts an empty list with a valid attestation | `ok:true`, and the attestation round-trips byte-faithfully |
| 14 | `writePlanQuestions` on a non-empty list without attestation | `ok:true` — existing call sites unbroken |
| 15 | a stale empty file reports `stale`, not `unattested` | ordering guard |
| 16 | the live questions files still read `ready` | run against the real `.ctoc/streaming/questions/` — proof no stored data broke |
| 17 | **`unattested` is distinguishable from `not-computed`** | the two reasons differ, and neither renders as the other. "I could not look" versus "I looked and found nothing" |

Fixtures under `os.tmpdir()`, `path.join`, teardown via
`fs.promises.rm(root, { recursive: true, force: true })`.

---

### Wiring — the live call sites

| change | live call site | root |
|---|---|---|
| `unattested` status | `hasEnoughInformation:759` → `streaming-gate.sufficiencyFor:458` → `pendingGateDecisions:576` | `/ctoc:start` gate screen |
| the write refusal | `writePlanQuestions` — called by `src/lib/streaming-questions-sweeper.js:195` | the sweeper, on every promotion |

Already-live paths on every gate render. Nothing reachable only from a test.

## Test Plan

Covered by `tests/questions-attestation.test.js`. Cases 1, 6 and 17 are load-bearing.
Cases 11, 14 and 16 are the compatibility guards — without them this fix would take
the store's existing contents down with it.

## Execution Plan (Steps 8-16)

### Step 8: TEST
Write the test file in full FIRST and run only it. Cases 1, 3, 4, 5, 6, 9, 10, 12, 13
and 17 must be RED. **Record case 1's red verbatim** — an empty questions file
producing `enough: true` is the sentence that authorises a gate crossing with no
human, and it is this slice's entire justification. Cases 2, 7, 11, 14, 15 and 16
must be GREEN or trivially satisfiable; if case 16 is red at Step 8, **stop** — the
stored data does not have the shape this plan assumed, and the plan is wrong before
the code is.

### Step 9: PREPARE
Read from disk: `streaming-precompute.js:226-344` (validator and writer), `:392-474`
(`planQuestionsStatus`, and the exact order of its checks), `:759-794`
(`hasEnoughInformation`); `src/lib/streaming-questions-sweeper.js` in full — it is the
only production caller of `writePlanQuestions` and calls it at `:195` with FOUR
positional args, so an empty list promoted through it is now REFUSED (`invalid-questions`
→ discarded), which is the intended fail-closed direction; threading an `attestation`
THROUGH the sweeper (reading `payload.attestation` and passing it as the fifth arg) is
`00183`'s work, not this slice's — this slice keeps the sweeper unmodified;
`agents/iron-loop/gate-critic.md:27-56` and `:105-125` (the four-lens expectation and
the three-state classification); `agents/iron-loop/premortem-critic.md:175-220` (the
`self_assessment` block this attestation projects). Grep for every caller of
`writePlanQuestions` and `planQuestionsStatus` across `src/`, `tests/` and `agents/`.
**Where the code disagrees with this plan, THE CODE WINS — record it.**

### Step 10: IMPLEMENT
- `src/lib/streaming-precompute.js` — `validateAttestation`, `attestsEmptiness`, the
  fifth writer parameter with its refusal, the `unattested` status, and the two
  corrected comment blocks.
- `tests/questions-attestation.test.js` — the seventeen cases.

### Step 11: REVIEW
Confirm the four expected lens names are a module constant and are never read from the
payload. Confirm `unattested` cannot be reached by a non-empty questions list — the
compatibility promise rests on it. Confirm the `:354-358` comment no longer blesses an
empty array, because leaving it would reproduce the self-contradiction this slice
removes, only inverted.

### Step 12: OPTIMIZE
The attestation is validated once, inside the read that already parses the file. No
extra filesystem access.

### Step 13: SECURE
The attestation is **subagent-authored, therefore untrusted**. Never render
`generated_by` or a lens name into a screen without `stripCtl` and a length cap. The
closed vocabularies for `state` and `coverage` are matched by exact string equality
against module constants — never by prefix, substring, or fuzzy match, mirroring
`gate-critic.md`'s "match by EXPECTATION, never by claim". An unrecognised value is
**not** `clean-pass` and must fail the bar, never fall through it.

### Step 14: VERIFY
`node --test` on the new file plus every existing streaming/gate test, then the full
gated run `npm test`. Lint at `--max-warnings 0`. No git operations. **Report whether
any plan currently at a pre-build gate changes its verdict**, and confirm the live
questions files still read `ready`.

### Step 15: DOCUMENT
Record the attestation contract in `CLAUDE.md`'s streaming-questions section — that an
empty question list crosses nothing without a recorded clean pass on all three
prosecution lenses at full coverage. Update the documented test-file count in both
places from the live disk count.

### Step 16: FINAL-REVIEW
Report every Step 8 red verbatim, the Step 14 blast radius, whether any stored file
changed status, and every decision taken under ambiguity.

## What this plan does NOT fix

- **No producer emits an attestation yet.** Until `00183` lands, every empty list is
  `unattested` and **auto-crossing on an empty list stops entirely.** That is the
  correct direction — fail closed — but it is a real behavioural change and it is
  stated here rather than discovered later. Non-empty lists are unaffected, so the
  gate screen keeps working normally. `00183` is also where the sweeper learns to read
  `payload.attestation` and pass it as the fifth writer argument; until then an
  attested empty list cannot promote THROUGH the sweeper (the writer's contract is
  still tested directly by case 13).
- It does **not** verify that the attestation is TRUE. A lying producer can claim four
  clean passes. This raises the bar from "no claim at all" to "a claim on the record,
  attributable, and auditable by `00180`". A cryptographic attestation is not
  proposed: the producers are subagents inside the same trust boundary, and the
  quarantine plus sweeper already fence the untrusted write path.
- It does **not** change the crossing at `streaming-gate.js:498` (`crossBySufficiency`),
  the ledger evidence (`00184`), or anything in `quality-agent.js`.

## Decisions Taken Under Ambiguity

1. **The attestation format is a PROJECTION of the existing `self_assessment` block,
   not a new invention.** The lenses already emit `coverage`, `blind_spots` and
   `budget_exhausted`; `gate-critic` already classifies each lens clean/partial/failed.
   Inventing a parallel format would have created two vocabularies for one fact.
   Reading the agent definitions before designing was the instruction, and it changed
   the design.
2. **Only the three PROSECUTION lenses gate the empty list.** `gate-critic.md:120`
   already rules that a failed defense lens removes an argument for crossing rather
   than adding evidence against it. Adopting the existing rule beats deriving a
   second, differently-shaped one.
3. **`coverage: "full"` is required, not merely `clean-pass`.** A lens that ran out of
   budget and reported `partial` genuinely did not look everywhere. Accepting a
   partial clean pass would reintroduce the defect one level up, which is exactly what
   `gate-critic.md:120` warns about.
4. **Attestation is required ONLY for the empty-list path.** Requiring it universally
   would invalidate every stored questions file and break the gate screen on day one,
   for no safety gain — a non-empty list already carries its own evidence in the form
   of questions a human reads.
5. **`unattested` is a NEW status, not folded into `invalid`.** They demand different
   actions: `invalid` means repair the file; `unattested` means re-run the critique.
   Collapsing them would tell an operator to fix the wrong thing, and the whole
   module is built on statuses that name their own remedy.
6. **The write is REFUSED for an unattested empty list rather than written and later
   rejected.** A refusal at the boundary keeps the store free of files that can only
   ever read as unattested, and surfaces the producer's defect at the producer.
7. **The fifth writer parameter is positional and optional.** Every existing call site
   passes four arguments and keeps working. A required parameter would have broken the
   sweeper the moment this landed, converting a safety fix into an outage.
8. **The auto-crossing is NOT removed while attestation is unimplemented on the
   producer side.** Removing it would be a second, larger design change made under
   cover of a bug fix. The fail-closed behaviour achieves the same safety and reverses
   itself automatically once `00183` lands.
9. **No cryptographic signing.** The threat model is a broken or truncated producer,
   not a forger with write access to `.ctoc/`; anyone with that access can edit the
   ledger too. Signing would add key management for no coverage of the actual failure.


## Deferred Questions

_Written by the Iron Loop integrator (src/lib/iron-loop.js), which performs NO
quality evaluation. These entries are the integrator's own report on itself, not
findings from a critic that read this plan._

- **evaluation**: NOT EVALUATED — no automated critique was performed on this plan. The refinement loop appended the Steps 8-16 template and assessed nothing. (The scores this step used to report were computed from that same template, not from the plan.) A human or a real critic must review this plan before it is built.
