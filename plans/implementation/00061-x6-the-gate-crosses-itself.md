---
title: "X6 — THE GATE CROSSES ITSELF: enough information advances the plan, and the human approves nothing"
type: implementation
parent_plan: none
depends_on: 00060-x5-entrykind-defaults-to-human
priority: CRITICAL
program: ctoc-repair-loop
iron_loop: true
files:
  - "src/lib/approval-ledger.js"
  - "src/hooks/human-gate-check.js"
  - "src/lib/streaming-gate.js"
  - "tests/approval-ledger-coverage.test.js"
  - "tests/ledger-forgery-closed.test.js"
  - "tests/streaming-gate.test.js"
---

# X6 — the last piece: the gate is enough information

## The ruling this closes

Owner, this session, the load-bearing design statement of the whole pivot:

> **"the gate become: enough information, not human or whatever"**
> **"the questions are about the project, about getting enough info from the user
> so you can build the app the user wants"**

And CTOC's own Pipeline Philosophy #1, which is the same sentence inverted:

> *"By the time work reaches todo, every contextual decision is locked. The
> implementer never guesses. If the implementer would have to guess, upstream
> context is incomplete."*

**Invert it and that IS the gate**: when the implementer would NOT have to guess,
the plan crosses. Nobody clicks approve.

## Everything needed already exists. This wires the last hop.

```
hasEnoughInformation(root, ref) -> {enough, reason, unanswered, blocking}
    built, mutation-proven fail-closed, and WIRED to the gate screen by W1.
    It already computes the verdict. Nothing acts on it.

entryKind()  -> provenance is a POSITIVE claim; unrecognised = 'unknown' (X5)
human-gate-check.js -> REJECTS 'unknown' at every gate (X5)
writePipelineEntry() -> the exact template: advanced_by + MANDATORY evidence,
                        refused loudly when evidence is absent
```

X5 disarmed the forgery mechanism precisely so this could be built safely. Before
X5, an entry with `advanced_by: 'sufficiency'` was classified `'human'` and
accepted at every gate with no evidence — 150 such paths, measured. That is why
this plan could not exist until now.

## The four changes

### 1. `writeSufficiencyEntry` — mirror `writePipelineEntry` exactly

```
advanced_by: 'sufficiency'
evidence:    MANDATORY, non-empty. A write without it is REFUSED LOUDLY.
approved_by: MUST NOT BE PRESENT.   ← the whole point
```

The evidence string names what made the information sufficient: the plan ref, the
count of questions answered, and their ids. An auditor must be able to reconstruct
the decision from the entry alone.

**`approved_by` must never appear on a sufficiency entry.** Writing it would
recreate the exact forgery shape X5 closed — a machine cross wearing the human's
marker. Assert its absence in the writer itself, not only in a test.

### 2. `entryKind` recognises it

```js
if (Object.prototype.hasOwnProperty.call(entry, 'advanced_by')) {
  if (entry.advanced_by === 'pipeline') return 'pipeline';
  if (entry.advanced_by === 'sufficiency') return 'sufficiency';
  return 'unknown';
}
```

Presence still decides. The recognised set grows by exactly one, deliberately, in
the open — which is what the module's own header demands.

### 3. `human-gate-check.js` guards it, mirroring `pipeline`

```js
if (kind === 'sufficiency') {
  if (!PRE_BUILD_GATES.has(folderName)) return { accepted: false, reason: 'sufficiency-not-allowed', kind };
  if (typeof entry.evidence !== 'string' || entry.evidence.trim() === '') {
    return { accepted: false, reason: 'sufficiency-no-evidence', kind };
  }
}
```

`PRE_BUILD_GATES` = the gates BEFORE code is written. **`done/` is NOT one of
them.** See Decision 1.

### 4. `streaming-gate` crosses when the verdict says enough

`pendingGateDecisions` already carries the sufficiency verdict (W1). When
`enough === true`, the plan advances through `writeSufficiencyEntry` and the
existing stage-move path, and it **stops being a pending decision** — the human is
never shown a question that has already been answered.

## Decisions Taken Under Ambiguity

1. **Sufficiency crosses the PRE-BUILD gates only. `done/` stays out.** The
   owner's architecture is explicit about where this ends: *"zero unanswered forks
   → crosses automatically → **then it builds**."* Gate 3 (review → done) asks a
   different question — not "is there enough information to build?" but "was this
   built correctly?" — and it is answered by the 14 quality dimensions and a
   review, not by an answered question log. **A sufficiency entry at `done/` must
   be REJECTED.** Read the folder names from the code, not from this plan.
2. **`approved_by` is FORBIDDEN on a sufficiency entry, enforced in the writer.**
   Not merely omitted — actively refused, the way `writePipelineEntry` refuses a
   missing evidence string. A future caller passing `approved_by: 'human'` must
   crash loudly, not be silently sanitised. Silent sanitisation is how a forgery
   becomes possible again.
3. **The auto-cross must be IDEMPOTENT and must never re-cross.** If a ledger
   entry already exists for a plan at a stage, do not write a second one. Read the
   existing `writeEntry` / `readEntryResult` semantics and follow them; do not
   invent a new collision rule.
4. **`enough === false` changes NOTHING.** The plan stays a pending decision and
   the human answers the question. This plan adds an automatic YES; it never adds
   an automatic NO, and it never silences a question.
5. **The predicate is called ONCE per decision and the same verdict both displays
   and acts.** Calling it twice invites a race where the screen says one thing and
   the ledger records another.

## Test Plan (TDD-Red first)

Zero doubles. Drive the real writer, the real hook, the real predicate.

Write FIRST, observe RED:

1. **`writeSufficiencyEntry refuses a write with no evidence`** — loudly, like the
   pipeline writer. Red (function does not exist).
2. **`writeSufficiencyEntry REFUSES approved_by, it does not strip it`** — passing
   `approved_by: 'human'` must throw. **Decision 2's guard; the forgery shape.** Red.
3. **`entryKind returns 'sufficiency' for advanced_by: 'sufficiency'`** — currently
   `'unknown'` → red.
4. **`an unrecognised advanced_by is STILL 'unknown'`** — the recognised set grew by
   ONE. `'sufficiency-gate'`, `'Sufficiency'`, `' sufficiency '` must all stay
   `'unknown'`. Green before, and must STAY green — this is the guard against the
   fix widening into the hole X5 closed.
5. **`a sufficiency entry with evidence is ACCEPTED at a pre-build gate`** — red.
6. **`a sufficiency entry is REJECTED at done/`** — Decision 1. Red-or-green now,
   must be green after, and must be non-vacuous.
7. **`a sufficiency entry with no evidence is REJECTED at every gate`** — red.
8. **`a plan with enough information CROSSES and leaves the pending list`** — the
   whole point. Drive `pendingGateDecisions` over a real fixture whose questions
   are all answered. Red.
9. **`a plan with an unanswered question does NOT cross and STAYS pending`** — the
   no-auto-NO guard, Decision 4. Green before and after.
10. **`a plan whose questions were never computed does NOT cross`** — fail closed.
    Never-computed is not sufficiency. Green before and after.
11. **`the auto-cross is idempotent — running twice writes ONE entry`** — Decision 3.
12. **`no sufficiency entry anywhere carries approved_by`** — walk the real ledger
    after the cross. The 263 existing entries must be untouched.

## Execution Plan (Steps 8-16)

### Step 8: TEST — write cases 1–12. Run. Quote the literal red. Touch no source before you have seen red. Cases 4, 9, 10 must be GREEN before your change — if any is red, the premise is broken; STOP and report.

### Step 9: PREPARE — read `src/lib/approval-ledger.js` IN FULL, especially `writePipelineEntry` (your template) and its header block at lines 49-77 which specifies this exact procedure. Read `human-gate-check.js`'s `classifyResidency` in full. Read `streaming-gate.js`'s `pendingGateDecisions` and how W1 wired the verdict into it. **Derive the real pre-build folder names from the code**, not from this plan.

### Step 10: IMPLEMENT — the four changes. Nothing else.

### Step 11: REVIEW — re-read the diff. Confirm: `approved_by` refused not stripped; presence-guard on `advanced_by` intact; the recognised set grew by exactly one; `done/` rejects sufficiency.

### Step 12: OPTIMIZE — n/a.

### Step 13: SECURE — **this is the gate; this is the whole file.** Enumerate computationally over `{advanced_by: unset|'pipeline'|'sufficiency'|'sufficiency-gate'|'Sufficiency'|''|null|123}` × `{evidence: present|empty|absent}` × `{approved_by: unset|'human'}` × `{backfilled: true|unset}` × every real folder name. Show that no path reaches `accepted: true` without a recognised provenance AND its required evidence AND an allowed gate. **Then replay the same oracle against the pre-X6 code and show it fires.** X5's equivalent found 150 → 0 over 324 combinations; match that rigour. A proof that never fires is not a proof.

### Step 14: VERIFY — `npm test` with `FORCE_COLOR=0` and say that you did. The suite is at **`fail 0`, 9747 tests, coverage 99.07%** — an honest green landed today after three false-green instruments were repaired. Anything you break is yours and is visible.

### Step 15: DOCUMENT — extend the header block at `approval-ledger.js:49-77` with the SUFFICIENCY kind, in the same voice as the four kinds already documented there. That block is the module's contract and it is the best documentation in this repository.

### Step 16: FINAL-REVIEW — report literally: the Step 8 red; the writer and the hook guard, quoted; all twelve results; the Step 13 enumeration AND its replay with violation counts both ways; `npm test` totals. State plainly whether a plan with enough information now crosses **without any human action** — a yes or a no.

## Executor Verification (Steps 8-16)

- [x] Step 8 observed RED before source was touched; cases 4, 9, 10 green first
- [x] `approved_by` on a sufficiency entry THROWS — not stripped, not ignored
- [x] Presence-guard on `advanced_by` intact; recognised set grew by exactly one
- [x] `'sufficiency-gate'` / `'Sufficiency'` / `' sufficiency '` all still `'unknown'`
- [x] Sufficiency REJECTED at `done/`; accepted only at pre-build gates with evidence
- [x] `enough === false` and never-computed both still block — no automatic NO
- [x] Auto-cross idempotent; the 263 existing ledger entries untouched
- [x] Step 13 enumeration: 0 violations on real X6 code, 28 on the guard-removed mutant (fires)
- [x] `npm test` still `fail 0` (9766 tests, coverage 99.06%)

## Decisions Taken Under Ambiguity (executor)

1. **The sufficiency cross uses the pure stage move (`actions.movePlan`), not
   `applyIronLoop`.** The human `stream approve` path runs `applyIronLoop` on an
   implementation→todo crossing, but a SIP1 implementation slice already carries
   `iron_loop: true` and its Steps 8–16 from the planner, so `applyIronLoop` is a
   no-op there; and a plan only becomes sufficient once its questions were computed
   AND answered for its CURRENT ref, so a Gate-2 sufficiency cross cannot fire on an
   implementation ref whose questions were never computed (fail-closed). The move
   writes the entry FIRST (hashing the current bytes; a pure move keeps them
   byte-identical, so a hash-sensitive `todo/` still matches) then moves, rolling the
   orphan entry back if the move fails — invariant: entry-and-moved, or neither.
2. **`streamAnswer` now CROSSES a plan made sufficient by the last answered fork**
   (it re-renders through `pendingGateDecisions`). This is the intended X6 UX — the
   human answers the last question and the plan crosses itself. Two test files
   OUTSIDE this plan's declared `files:` needed a non-weakening update as a result:
   `tests/streaming-precompute.test.js` (its `answer` helper now writes the answers
   log directly, since it unit-tests the `hasEnoughInformation` predicate on the
   plan's ORIGINAL ref and must not incur the cross side-effect) and
   `tests/cache-freshness.test.js` (the `streaming-gate.js` whitelist entry became
   dead weight — the module now busts the cache correctly via `movePlan`). The plan's
   `files:` was under-scoped; these ripples are surfaced honestly here.
