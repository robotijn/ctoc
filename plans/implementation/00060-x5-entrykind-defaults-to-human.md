---
title: "X5 — entryKind classifies any unrecognised provenance as the human, and the gate hook waves it through"
type: implementation
parent_plan: none
depends_on: none
priority: CRITICAL
program: ctoc-repair-loop
iron_loop: true
files:
  - "src/lib/approval-ledger.js"
  - "src/hooks/human-gate-check.js"
  - "tests/ledger-forgery-closed.test.js"
  - "tests/approval-ledger-coverage.test.js"
---

# X5 — the forgery mechanism, still armed, and the migration everyone feared does not exist

## The defect

`src/lib/approval-ledger.js:357`:

```js
function entryKind(entry) {
  if (!entry || typeof entry !== 'object') return null;
  if (entry.advanced_by === 'pipeline') return 'pipeline';
  if (entry.backfilled === true) return 'backfilled';
  return 'human';                    // ← ANYTHING ELSE IS CLASSIFIED AS THE HUMAN
}
```

**`'human'` is the absence of evidence.** Not a positive claim — a fallthrough.

And `src/hooks/human-gate-check.js:202`, the gate enforcement hook:

```js
if (kind === 'pipeline') {
  if (folderName !== 'done')  return { accepted: false, reason: 'pipeline-not-allowed', kind };
  if (!entry.evidence)        return { accepted: false, reason: 'pipeline-no-evidence', kind };
}
return { accepted: true, reason: null, kind };   // ← EVERYTHING ELSE IS ACCEPTED
```

**`'pipeline'` is the only guarded kind.** So an entry with
`advanced_by: 'sufficiency-gate'` is classified `'human'`, skips the guard, and is
**accepted at every gate including `todo`**, with no evidence requirement. It is
not merely mislabelled — it is waved through.

This is the mechanism that produced 26 forged approvals, whose own backfill
reason reads: *"Claude wrote approved_by:human into plan frontmatter directly
instead of crossing Gate 2 via approvePlan — a forged marker. The WORK was
ordered by the human; the PROVENANCE path was wrong."*

## The migration everyone feared does not exist — measured

```
263 ledger entries
  210  backfilled: true          → classified 'backfilled'   ✓
   53  fall through to 'human'
    0  carry nothing positive

Of those 53:
   53  carry approved_by: "human"  EXPLICITLY
    0  carry an advanced_by
```

**Every existing entry already carries its own evidence.** The classifier simply
never looks. Checking the marker that is already on disk reclassifies **nothing**
— 210 stay `backfilled`, 53 stay `human`, 0 become `unknown`.

The author of this plan spent a full session describing this as a risky migration
of 234 entries. It is 263 and it needs **zero** migration. That mistake is why
the owner's architecture has been blocked all day for no reason.

## The fix — two functions

### 1. `entryKind` demands a positive marker and fails closed

```js
function entryKind(entry) {
  if (!entry || typeof entry !== 'object') return null;
  // Provenance is a POSITIVE claim, never a fallthrough. An unrecognised
  // `advanced_by` is NOT the human — that default forged 26 approvals.
  if (typeof entry.advanced_by === 'string' && entry.advanced_by.trim() !== '') {
    return entry.advanced_by === 'pipeline' ? 'pipeline' : 'unknown';
  }
  if (entry.backfilled === true) return 'backfilled';
  if (entry.approved_by === 'human') return 'human';
  return 'unknown';
}
```

### 2. `classifyResidency` REJECTS `'unknown'`

```js
if (kind === 'unknown') return { accepted: false, reason: 'unknown-provenance', kind };
```

Placed **before** the `pipeline` branch, so no unrecognised provenance can reach
`accepted: true` on any path.

## Decisions Taken Under Ambiguity

1. **`'backfilled'` stays ACCEPTED at every gate. Do not touch it.** A backfilled
   entry currently falls through to `accepted: true`, and that is deliberate: the
   210 backfilled entries record work the human genuinely ordered by a wrong
   provenance path. Rejecting them would revert 210 plans and would be a
   destructive change nobody asked for. This plan makes provenance *honest*; it
   does not re-adjudicate history.
2. **An unrecognised `advanced_by` returns `'unknown'`, NOT its own value.**
   Returning `entry.advanced_by` verbatim would make `entryKind` return arbitrary
   strings and would let a new provenance be *invented at the call site* — which
   is the same defect one level up. A new provenance must be added to this
   function deliberately, in the open, with its own guard. That is exactly how the
   sufficiency gate will be added in the NEXT plan.
3. **`advanced_by` is checked FIRST, before `approved_by`.** An entry carrying
   BOTH `advanced_by: 'sufficiency-gate'` AND `approved_by: 'human'` is precisely
   the forgery shape — a machine cross wearing the human's marker. Checking
   `advanced_by` first classifies it `'unknown'` and rejects it. Checking
   `approved_by` first would accept it. **This ordering is the whole fix; get it
   backwards and the plan is a no-op.**
4. **This plan does NOT add the sufficiency-gate kind.** It makes the classifier
   honest and the hook fail closed. Wiring the auto-cross is the next plan, and it
   must add `'sufficiency'` as a recognised kind with an evidence requirement
   mirroring `pipeline`'s. Doing both here would mean shipping the safety fix and
   the thing it protects against in one change, with no red-to-green boundary
   between them.
5. **The JSDoc contract at `human-gate-check.js:176` widens to include
   `'unknown'`.** That is a documentation correction, not a scope expansion — the
   function will now return it.

## Test Plan (TDD-Red first)

Zero doubles — read the REAL 263 entries from `.ctoc/approvals/` where the test
concerns classification of real data.

Write FIRST, observe RED:

1. **`an entry with an unrecognised advanced_by is NOT classified as human`** —
   feed `{advanced_by: 'sufficiency-gate', stage_to: 'todo'}`. Currently returns
   `'human'` → red. **This is the bug.**
2. **`an unrecognised provenance is REJECTED by the gate hook at every gate`** —
   drive the real `classifyResidency` at `todo`, `review` and `done`. Currently
   `accepted: true` at all three → red. **This is the bug that matters.**
3. **`an entry carrying BOTH advanced_by and approved_by:human is unknown, not human`** —
   the forgery shape. Currently `'human'` → red.
4. **`all 263 real ledger entries keep their current classification`** — walk the
   real `.ctoc/approvals/` tree. 210 `backfilled`, 53 `human`, **0 `unknown`**.
   Green before AND after. **This is the proof that no migration is needed**, and
   it must be non-vacuous: assert the count is > 200, so an empty directory cannot
   pass it.
5. **`a real human entry is still accepted`** — `approved_by: 'human'` at `todo`
   → accepted. Green before and after; the no-false-red guard.
6. **`pipeline provenance still obeys its existing guards`** — accepted only at
   `done`, only with evidence. Green before and after.
7. **`backfilled entries are still accepted`** — the 210 must not move.
   Green before and after. Decision 1's guard.

## Execution Plan (Steps 8-16)

### Step 8: TEST — write cases 1–7. Run. Cases 1, 2, 3 MUST fail; 4–7 MUST pass. Quote the literal red. Touch no source before you have seen red.

### Step 9: PREPARE — read `src/lib/approval-ledger.js` and `src/hooks/human-gate-check.js` IN FULL. Read the real entries under `.ctoc/approvals/`. **Verify the 210/53/0 split yourself** — this plan's author has been wrong thirteen times today by asserting from greps, and `grep` in this environment is aliased to a `.gitignore`-respecting wrapper that SILENTLY SKIPS FILES. Use node to read the tree.

### Step 10: IMPLEMENT — the two functions. Nothing else. Do not add a sufficiency kind. Do not touch the 263 entries on disk — if this change requires editing ledger data, STOP: it means the measurement was wrong and the plan is void.

### Step 11: REVIEW — re-run case 4 and confirm 210/53/0 unchanged. Confirm `advanced_by` is checked before `approved_by`.

### Step 12: OPTIMIZE — n/a.

### Step 13: SECURE — **this IS the security step; this function is the forgery mechanism.** Enumerate every path through `classifyResidency` that ends `accepted: true`, and show none is reachable by an entry that does not carry an explicit, recognised provenance marker. Do it computationally over the cross-product of `{advanced_by: unset|'pipeline'|'sufficiency-gate'|''|null|123}` × `{backfilled: true|false|unset}` × `{approved_by: 'human'|'claude'|unset}` × `{folderName: todo|review|done}` × `{evidence: present|absent}`. **Then replay the same oracle against the OLD code and show it detects the defect** — a proof that never fires is not a proof. Three executors did exactly this today; match them.

### Step 14: VERIFY — `npm test` with `FORCE_COLOR=0` and say that you did. The suite is currently at **`fail 0`, 9725 tests, coverage 99.06%** — the first honest green in this repo's history. **Anything you break is yours and is visible.** Do not report a partial green as done.

### Step 15: DOCUMENT — correct the JSDoc at `human-gate-check.js:176` to include `'unknown'`, and the header comment block at `approval-ledger.js:49-56` which claims `entryKind` "reports provenance HONESTLY" — it does not yet.

### Step 16: FINAL-REVIEW — report literally: the Step 8 red; the final `entryKind` and the hook's guard; all seven results; the Step 13 enumeration AND its replay against the old code; `npm test` totals. State plainly whether the 263 entries kept their classification, with the counts.

## Executor Verification (Steps 8-16)

- [ ] Step 8 observed RED on cases 1–3 before source was touched
- [ ] The 210/53/0 split re-measured from disk with node, not grep
- [ ] `advanced_by` checked BEFORE `approved_by` (Decision 3 — the whole fix)
- [ ] `'unknown'` rejected before the pipeline branch, on every path
- [ ] NO ledger data edited — zero files under `.ctoc/approvals/` changed
- [ ] `'backfilled'` still accepted; the 210 did not move
- [ ] Step 13 enumeration replayed against the old code and shown to fire
- [ ] `npm test` still `fail 0`
