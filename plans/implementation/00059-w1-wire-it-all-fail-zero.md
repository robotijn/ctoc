---
title: "W1 — WIRE IT ALL: the gate predicate reaches a human, both dead exports die, the suite reaches fail 0"
type: implementation
parent_plan: none
depends_on: none
priority: CRITICAL
program: ctoc-repair-loop
iron_loop: true
files:
  - "src/lib/streaming-gate.js"
  - "src/hooks/PreToolUse.Task.js"
  - "src/lib/agent-slots.js"
  - "tests/agent-layer-reachability.test.js"
  - "tests/streaming-gate.test.js"
  - "tests/pretooluse-task-coverage.test.js"
  - ".ctoc/sweep-autostart.js"
  - ".ctoc/sweep-watchdog.js"
---

# W1 — first get a working system to work

## The ruling

Owner, 2026-07-17: **"wire it, wire it all and then test it, and then slowly
improve it. first get a working system to work, because we only have failing
system!!!!!!!!!!!!!"**

This plan gets the suite to **`fail 0`**. Nothing else. Improvement comes after.

## What "unwired" actually amounts to — measured, not feared

```
unreachable FILES:   []          ← the file fence is already at ZERO
dead EXPORTS:         2
```

The whole unwired surface is two exports:

```
src/lib/agent-slots.js#activeCount
src/lib/streaming-precompute.js#hasEnoughInformation
```

Both have exactly one kind of caller: **tests**. Operating Lesson 16 — *a test IS
a caller; a module is done when a human can REACH it* — is what caught them.

## The one that matters

`tests/streaming-precompute.test.js:559`:

```js
describe('hasEnoughInformation — THE GATE PREDICATE, and it FAILS CLOSED')
```

**`hasEnoughInformation` is the predicate for the owner's load-bearing principle
— "the gate is enough information, not human approval".** It was built, tested
exhaustively, proven fail-closed by mutation testing, and **never connected to
anything**. It is dead code.

That is the same miss recorded in the principle's own memory — *"I fixed
product-owner to emit product questions and then never wired the reader to ask
them. The two halves had never met."* — repeated one layer down, on the predicate
itself.

## Why it was never wired — the trap

```
src/lib/streaming-precompute.js:430
    const { pendingGateDecisions } = require('./streaming-gate');   // LAZY, inside a function
```

`streaming-precompute` **already requires** `streaming-gate`. So
`streaming-gate` cannot require `streaming-precompute` at the top level without a
require cycle. The natural caller is structurally blocked from calling it the
obvious way.

**The fix is the idiom already in the file**: a lazy `require` inside the function
that needs it. Line 430 is the precedent — mirror it exactly, in the opposite
direction.

## The blocker on the FULL wiring — read before scoping up

`src/lib/approval-ledger.js:357`:

```js
function entryKind(entry) {
  if (entry.advanced_by === 'pipeline')  return 'pipeline';
  if (entry.backfilled === true)         return 'backfilled';
  return 'human';                        // ← ANYTHING ELSE IS CLASSIFIED AS THE HUMAN
}
```

The owner's architecture is that a gate **crosses automatically** when there is
enough information, recording `advanced_by: <something>` and **never**
`approved_by: human`. But an entry with `advanced_by: 'sufficiency-gate'` falls
through to the default and is classified as **`'human'`** — a forged approval
created by a classifier default, on the same day 26 real forgeries were removed
from this repo.

**Therefore this plan wires the predicate to SHOW, never to CROSS.** No ledger
write. No auto-approval. Crossing is a separate plan that must follow the
`entryKind` fix. **If you find yourself writing to the approval ledger, STOP —
you are outside this plan.**

## The five changes

1. **Wire `hasEnoughInformation` into `streaming-gate.pendingGateDecisions`.**
   Each pending decision carries its sufficiency verdict, so the human SEES
   whether a plan has enough information and which questions are unanswered.
   Lazy require, mirroring line 430. Display only.
2. **Wire `activeCount` into `PreToolUse.Task.js`.** The hook already denies past
   the concurrency cap; its denial message should name the real count ("N of 5
   slots in use"). A read API with a real production caller.
3. **Fix the three typecheck errors** in `src/lib/agent-slots.js` (lines 88-90:
   `Property 'token' does not exist on type 'object'`). A JSDoc annotation.
4. **Delete `.ctoc/sweep-autostart.js` and `.ctoc/sweep-watchdog.js`.** Broken
   scratch from a superseded approach — they carry the ESLint errors AND a live
   `ALLOWED_TOOLS is not defined` bug, and the sweep they scaffolded was replaced
   by this session's plans. See Decision 3.
5. **Fix the irregular-whitespace lint** in `tests/agent-layer-reachability.test.js`.

## Decisions Taken Under Ambiguity

1. **`hasEnoughInformation` is wired to DISPLAY, not to CROSS.** Crossing is the
   owner's architecture and the point of the function — but it is unsafe until
   `entryKind` fails closed (above). Displaying is a real production caller, is
   honest, and unblocks the gate today. **This is deliberately half the goal**;
   the other half is the next plan, and this file says so rather than quietly
   shipping a "wired" export that only decorates a screen.
2. **`activeCount` is wired rather than un-exported.** Un-exporting and testing
   through the public API is the other legitimate answer. Rejected: the deny
   message currently cannot tell the human how many slots are in use, which is
   exactly the information a person hitting the cap needs. Wiring it serves the
   human; un-exporting only serves the fence.
3. **The sweep scripts are DELETED, not fixed.** They are the author's own scratch
   from this session, they never successfully ran (the `ALLOWED_TOOLS` reference
   was never defined), and the work they scaffolded is now done by real plans. But
   they are named in `HANDOFF.md` — **do not edit HANDOFF.md**; report the stale
   reference instead. Deleting another author's file would be out of order; these
   are ours.
4. **Nothing is added to any baseline.** `.ctoc/reachability-baseline.json` says it
   verbatim: *"NEVER add a file here to make a failing build pass — wire it or
   delete it."* The same applies to the dead-export baseline. Both exports are
   WIRED here. If you cannot wire one, DELETE it and say so — do not list it.

## Decisions Taken Under Ambiguity — ADDED BY THE EXECUTOR (2026-07-17)

Three of this plan's factual premises were tested and found FALSE. The plan told the
executor to confirm the require-cycle claim independently rather than trust it; doing
that surfaced the rest.

5. **The require-cycle premise is FALSE. The lazy require is kept anyway.**
   The plan states `streaming-gate` "cannot require `streaming-precompute` at the top
   level without a require cycle". Measured: it can. A cycle needs BOTH edges at load
   time, and `streaming-precompute` reaches `streaming-gate` ONLY through its own
   call-time require at line 430 — it has no top-level edge back. Hoisting the new
   require to the top of `streaming-gate` was tried directly and broke nothing, in
   either load order. So the "trap" that supposedly explains why nobody ever wired
   this is not real; the export was simply never wired.
   The require is STILL lazy, for two honest reasons rather than the plan's: it
   matches the idiom already in this very file (`nextUnansweredQuestion`, line ~232,
   lazily requires the same module), and it structurally guarantees that a future
   top-level edge from precompute back to here cannot close a cycle.

6. **Case 4's specified falsification is IMPOSSIBLE; a real one was used.**
   The plan requires proving case 4 can fail "by temporarily hoisting the require to
   the top level". That mutation cannot fail the test, because ONE lazy edge on either
   side is sufficient to prevent a cycle — verified by applying it. Case 4 was instead
   falsified with the DOUBLE mutation (both edges at load time), which produced
   `Warning: Accessing non-existent property 'hasEnoughInformation' of module exports
   inside circular dependency` and failed the reverse-load-order case. Restored after.

7. **The sweep scripts are NOT deleted. All three deletion premises are FALSE.**
   Decision 3 says delete `.ctoc/sweep-autostart.js` and `.ctoc/sweep-watchdog.js`
   because they (a) never ran, (b) carry a live `ALLOWED_TOOLS is not defined` bug,
   and (c) scaffolded work now superseded. Measured:
   - (b) is FALSE. `ALLOWED_TOOLS` appears in exactly THREE COMMENTS and is never an
     identifier; the real variable is `toolSet`, used at the spawn. There is no
     `not defined` bug, ESLint reports no `no-undef`, and both files parse. (The three
     stale comment references were repointed at `toolSet` — a documentation fix.)
   - (a) is FALSE. The watchdog header records measured runs ("ran for eight minutes",
     "Measured: this exact spawn ...", "Verified:").
   - (c) is FALSE, and this is the load-bearing one. `HANDOFF.md` "Resume here" —
     the same file this plan says not to edit — designates the watchdog as the tool
     for the NEXT phase: *"The sweep (`.ctoc/sweep-watchdog.js`) is built and proven
     for this"*, under **"THEN the real work: BUILD THE WATCHER LAYER."** The
     reference is forward-looking, not stale. Deleting it would destroy a 53 KB tool
     the handoff instructs the next session to use, irreversibly (this tree has a full
     session of uncommitted work and the executor is barred from git).
   The ESLint errors were the actual target, and they are a CONFIG GAP:
   `eslint.config.js` turns `n/no-process-exit` off ("CLI entry points and hooks exit
   by design") and `n/hashbang` off ("executable hooks/scripts use shebangs
   intentionally"), but its `files` glob covers only the src, tests and evals
   directories — `.ctoc` scripts never inherited it and are flagged for doing exactly
   what the repo blesses one directory over. Fixed non-destructively, reaching the
   same `fail 0`: shebangs REMOVED (the rule was right — neither file is a
   `bin` entry and both are documented to run as `node .ctoc/…`), and the remaining
   rules disabled file-locally with the gap documented at each site.
   **The real fix is a `.ctoc` script block in `eslint.config.js`. That file is not in
   this plan's `files:` declaration, so it is REPORTED, not edited.** Deleting the
   scripts remains available to the owner at zero cost; un-deleting them would not be.

8. **`activeCount`'s stated justification is FALSE; it is wired on a real one.**
   Decision 2 argues "the deny message currently cannot tell the human how many slots
   are in use". It already could — `block(slot.running, …)` passed the real count. The
   genuine defect was adjacent: `buildBlockMessage` interpolated `running` where it
   meant the CAP ("`${running}` is CTOC's standing concurrency limit"), one number
   doing both jobs — correct only while the two coincide, and `agent-slots` FAILS OPEN,
   so an over-subscribed count would have been announced AS the limit. The message now
   reports "N of MAX", from `MAX_CONCURRENT`.
   `activeCount` is wired on a justification that survives scrutiny: `acquire` filters
   stale holders out of its in-memory count but returns BEFORE `writeSlots` on the
   refuse path, so it never PERSISTS that reap — a store with 5 live and 3 crashed
   holders refuses correctly at 5 and stays at 8 on disk. `activeCount` reaps and
   persists, at exactly the moment a dead holder costs a human a real launch. The
   number matches `slot.running`; the SIDE EFFECT is the point, and it is tested.

## Test Plan (TDD-Red first)

Write FIRST, observe RED:

1. **`pendingGateDecisions reports each plan's sufficiency verdict`** — assert the
   returned decisions carry `enough` and the unanswered question ids from the real
   predicate over a real fixture project. Currently the field does not exist → red.
2. **`a plan with an unanswered critical question reports enough:false`** — the
   predicate's fail-closed behaviour must survive the wiring. Red.
3. **`a plan whose questions were never computed reports enough:false`** — not
   `enough:true`, not a crash. Absence of evidence is never evidence of
   sufficiency. Red.
4. **`wiring the predicate did not create a require cycle`** — load
   `streaming-gate` first in a fresh process, then `streaming-precompute`, and
   assert both export what they should. A cycle yields a partially-initialised
   module and this is the exact hazard the lazy-require idiom exists for. **This
   test must be able to FAIL** — verify it by temporarily hoisting the require to
   the top level and watching it break.
5. **`the Task hook's denial names the real slot count`** — drive the real hook at
   the cap and assert the message contains the count from `activeCount`, not a
   hardcoded number. Red.
6. **`the dead-export fence is at zero`** — run the real fence. Currently 2 → red.
   This is the plan's definition of done.

## Execution Plan (Steps 8-16)

### Step 8: TEST — write cases 1–6. Run. All but 4 MUST fail. Quote the literal red. Touch no source before you have seen red.

### Step 9: PREPARE — read `src/lib/streaming-gate.js` IN FULL (it is ~830 lines; read it, do not skim). Read `hasEnoughInformation` and `planQuestionsStatus` in `src/lib/streaming-precompute.js`. Read line 430's lazy-require idiom — you are mirroring it. Read `src/hooks/PreToolUse.Task.js` in full. **Confirm the require-cycle claim yourself** rather than trusting this plan; a plan author in this program has been wrong nine times today by asserting from greps.

### Step 10: IMPLEMENT — the five changes. Nothing else. Do NOT write to the approval ledger. Do NOT auto-cross a gate. Do NOT touch `entryKind`.

### Step 11: REVIEW — re-read the diff. Confirm no top-level require was added to `streaming-gate.js` that could cycle, and that the sufficiency verdict is displayed, never acted on.

### Step 12: OPTIMIZE — n/a.

### Step 13: SECURE — enumerate every path added here that could reach `approvePlan`, `approved_by`, or the approval ledger. The answer must be NONE. This plan touches the gate; the gate belongs to the human; forging his approval is this repository's worst historical defect and 26 instances were removed from it today.

### Step 14: VERIFY — `npm test` with `FORCE_COLOR=0`, and say that you did. **The target is `fail 0`.** The six current failures are: dead-export (3 cases, the 2 exports), iron-loop-enforcer (echoes the dead-export fence), ESLint (`.ctoc/sweep-*.js` + `tests/agent-layer-reachability.test.js`), typecheck (3 errors in `agent-slots.js`). This plan closes all six. If any remains, name it and say why rather than reporting partial success as success.

### Step 15: DOCUMENT — n/a. The wiring is the documentation; a comment at the lazy require pointing at line 430's precedent is enough.

### Step 16: FINAL-REVIEW — report literally: the Step 8 red; the six test results; `npm test` totals and the FORCE_COLOR setting; and **whether the suite reached `fail 0`, stated as a yes or a no**. If it did not, say so plainly — a partial green reported as done is the exact defect this whole session has been repairing.

## Executor Verification (Steps 8-16)

- [x] Step 8 observed RED before any source was touched — 5 of 6 cases red; case 4's
      two load-order assertions green at Step 8 as the plan predicted
- [x] Require-cycle claim confirmed independently — and REFUTED. See Decision 5.
- [x] Case 4 proven able to fail — NOT by the hoist the plan specified (that mutation
      cannot fail it), but by the double mutation. See Decision 6.
- [x] `hasEnoughInformation` has a real production caller
      (`streaming-gate.sufficiencyFor` → `pendingGateDecisions`, rendered by
      `sufficiencyLine` on the gate screen the human reads). Display only.
- [x] `activeCount` has a real production caller (`PreToolUse.Task.enforce` block path)
- [x] NOTHING written to the approval ledger; no gate crossed; `entryKind` untouched —
      proven by runtime require-trace, not by grep. Step 13 answer: NONE.
- [x] No baseline widened, no entry added to any baseline list. Dead exports fell
      104 → 102 by WIRING; maxDead still 102, list still 102 entries, untouched.
- [x] `npm test` = **fail 0** (9725/9725, skipped 0, coverage 99.05% ≥ 99).
      `npm run lint` exit 0. `npm run typecheck` exit 0, raw `tsc --noEmit` 0 errors.
- [x] Step 15 DOCUMENT — n/a per the plan; the lazy require carries its comment (which
      corrects, rather than repeats, the plan's cycle claim).
