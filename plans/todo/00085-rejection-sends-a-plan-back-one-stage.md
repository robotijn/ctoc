---
approved_by: human
approved_at: 2026-07-19T11:58:15.149Z
gate_crossed: implementation → todo
---

---
title: "Rejection sends a plan back one stage, not four — and withdraws the approval it no longer has"
type: implementation
parent_plan: ctoc-background-engine-rebuild
depends_on: none
priority: CRITICAL
program: ctoc-repair-loop
iron_loop: true
files:
  - "src/lib/actions.js"
  - "tests/reject-plan-stage-aware.test.js"
---

# Rejection sends a plan back one stage, not four

## What I re-verified, and where the code disagrees with the brief

The brief relayed my own earlier finding back to me. I re-read the source rather
than trusting the relay, and the relay is **correct but incomplete** — there are
five defects in this function, not one, and two of them are worse than the one
that was reported.

`src/lib/actions.js:703-735`, read in full:

```js
function rejectPlan(planPath, feedback, projectPath) {
  const root = projectPath || findProjectRoot();
  let content = safeFs.readFileSync(planPath, 'utf8');
  const metadata = parseMetadata(content);
  const revision = (metadata.revision || 0) + 1;
  const rejectionHeader = `# REVISION ${revision}\n\n## Rejection Feedback\n\n${feedback}\n\n---\n\n`;
  const metadataUpdates = `revision: ${revision}\nrejection_reason: "${feedback.replace(/"/g, '\\"').slice(0, 100)}"\ntag: rejected\n`;
  if (content.match(/^---\n/)) {
    content = content.replace(/^---\n/, `---\n${metadataUpdates}`);
  } else {
    content = `---\n${metadataUpdates}---\n\n${content}`;
  }
  content = rejectionHeader + content;
  safeFs.writeFileSync(planPath, content);
  // Move to functional
  return movePlan(planPath, 'functional', root);
}
```

**The sole live caller is `src/tabs/review.js:9`** — the Review tab. Nothing else
in the repository calls `rejectPlan`. So in practice this function only ever runs
on plans resident in `review/`, at Gate 3.

| # | Defect | Evidence |
|---|---|---|
| **D1** | Unconditional target. `movePlan(planPath, 'functional')` ignores the plan's stage, so a Gate 3 rejection drops the plan from `review` (order 4) to `functional` (order 0) — four stages, past Gate 2 and Gate 1. | `:734` |
| **D2** | **The rejection header is prepended ABOVE the frontmatter.** `:730` runs `content = rejectionHeader + content` *after* the frontmatter injection, so the file ends up starting with `# REVISION 1` and the `---` block is no longer at position zero. | `:711-730` |
| **D3** | The approval marker is never stripped. Nothing removes `approved_by: human` / `gate_crossed:`, so a rejected plan still carries a record claiming it crossed a gate. | absence throughout `:703-735` |
| **D4** | The ledger entry is orphaned. The function neither requires `approval-ledger` nor calls `removeEntry`, so the entry still records its `stage_to` for a plan that has moved away from it. | absence throughout |
| **D5** | The feedback string is interpolated into YAML with only `"` escaped, and `.slice(0, 100)` is applied *after* escaping — so a newline in the feedback breaks the frontmatter, and a truncation can land mid-escape. | `:722` |

**D2 is the most damaging and was not in the brief.** Frontmatter parsing in this
codebase starts at line zero — the enforcer's `frontmatterRegion` walks from
`lines[0]` and requires `lines[i].trim() === '---'`, and stops immediately
otherwise. After one rejection the plan's frontmatter is invisible to every reader
of it: `parseMetadata`, the `files:` coverage check that the PreToolUse hook uses
to decide what may be edited, plan validation, and the ledger's frontmatter
region. A rejected plan silently loses its declared write surface.

**D4 is exploitable, and this is what decides the ledger question below.**
`classifyResidency` accepts residency when `entry.stage_to === folderName`, and it
only additionally checks the content hash for `HASH_SENSITIVE_FOLDERS`, which is
`{'todo','done'}` — **`implementation` is a gate destination that is NOT
hash-sensitive**. So an orphaned entry recording `stage_to: 'implementation'`,
left behind by a rejection that moved the plan back to `functional`, would accept
that plan's residency the moment it returns to `implementation` — with no new
approval. That is a live gate-skip, not a hypothetical one.

## Settling the model: one stage back

The brief asks whether "one revert edge per gate" is the right model, and whether
`gate-order` encodes the documented table. It does not encode it, and the answer
is better than either option.

**What `gate-order.js` actually encodes:**

```js
STAGE_ORDER = ['functional','implementation','todo','in-progress','review','done'];
GATE_EDGES  = [['functional','implementation'], ['implementation','todo'], ['review','done']];
GATE_SOURCE = { implementation:'functional', todo:'implementation', done:'review' };
```

**Discrepancy, recorded rather than smoothed over:** the project documents *four*
gates including Gate 0 (`vision → functional`), and `gate-order.js` encodes
**three**. `STAGE_ORDER` does not contain `vision` or `canvas` at all. So the
documented table and the code disagree about how many gates exist.

**I treat `gate-order.js` as the specification for this slice**, for a stated
reason: it is the executable encoding that every consumer already derives from
(`human-gate-check`'s revert map, `approval-ledger`'s `stage_from`, the enforcer's
`GATE_DESTINATIONS`), and `rejectPlan`'s only caller operates on `review`, which
is inside `STAGE_ORDER`. Gate 0 is out of this slice's reach and **`STAGE_ORDER`
must not be extended here** — adding `vision` would change the behaviour of
`crossesHumanGate` for every caller, which is a different unit of work.

**`sourceOf` is the wrong function, and this is the trap.** My earlier note said
`gate-order.sourceOf` provides the target. Re-reading it, that is wrong and I am
correcting myself: `sourceOf` maps a gate *destination* to its *source*. It is
built for the residency sweep, which handles a plan sitting at a destination it
did not earn. A plan being **rejected** is at the gate's *source*, not its
destination — `sourceOf('review')` returns `undefined`, because `review` is not a
destination. Using it here would have produced `undefined` on the only path that
actually runs.

**The model that fits: exactly one stage back along `STAGE_ORDER`.** Its merit is
that it is not a new rule — it *reproduces the documented revert table* and
extends correctly to the case the table does not cover:

| Plan at | One stage back | Documented revert target | Agrees? |
|---|---|---|---|
| `done` (5) | `review` (4) | Gate 3 reverts to `review` | yes |
| `todo` (2) | `implementation` (1) | Gate 2 reverts to `implementation` | yes |
| `implementation` (1) | `functional` (0) | Gate 1 reverts to `functional` | yes |
| `review` (4) | `in-progress` (3) | *not in the table* | the rejection case |

So the per-gate table is a **special case** of one-stage-back evaluated at gate
destinations. One rule, no second encoding, and the answer at `review` — send the
build back to being built — is the one a human means by rejecting at Gate 3.

**Why it cannot be used to skip a gate.** Forward moves are gate-checked by
`crossesHumanGate`, which is span-based and catches multi-hop skips
(`:41-52`). A plan moved one stage back must re-cross every gate edge it
re-approaches on the way forward. And one-stage-back from `review` lands on
`in-progress`, which is **not** a gate destination, so it needs no ledger entry to
reside there — the move is residency-neutral. Landing a rejected plan on `todo` or
`implementation` instead would drop it onto ledger-governed ground, which is
exactly how D4 becomes exploitable.

**Guard-rail the implementation must carry:** the computed target must be rejected
if it is not strictly one index lower, and the function must refuse rather than
guess when the current stage is not in `STAGE_ORDER` (a plan in `vision/` or
`canvas/`). Fail closed — refuse the rejection with a clear error rather than move
a plan to a stage nobody chose.

## The ledger: remove the entry

The brief asks: remove, mark superseded, or leave. **Remove**, and the reasoning
is the fail-closed discipline the codebase already documents.

- **Leaving it is unsafe** — demonstrated above under D4: a `stage_to:
  'implementation'` entry survives a rejection and re-accepts the plan at
  `implementation` with no new approval, because that folder is not hash-sensitive.
- **Marking it superseded** would mean a new field or a new `advanced_by` value.
  `entryKind` fails closed to `'unknown'` for anything it does not recognise, and
  `classifyResidency` rejects `'unknown'` at every gate — so a superseded entry
  *would* be safe, but it requires a new kind with guards in two files, which is a
  larger change than the defect warrants and would land in the same files that
  `plans/implementation/00084-approval-hash-survives-its-own-pipeline.md` is
  changing.
- **Removing it** makes the plan's state honest: the human has withdrawn the
  approval, so the record of that approval must not persist. No entry means not
  approved, which is precisely the fail-closed default. The plan must re-earn every
  gate on its way forward.

**The disclosed cost:** removing the entry loses the ledger's record that the
approval ever existed. That is a real audit loss and it is stated, not buried. It
is bounded because the rejection itself is recorded in the plan (the revision
counter, `rejection_reason`, `tag: rejected`) and the move is logged by the normal
action path. A `superseded` entry kind that preserves the history is a reasonable
future improvement; **it is not proposed as work here** and is mentioned only so
the trade-off is legible.

## The content rewrite: what is load-bearing

| Element | Load-bearing? | Disposition |
|---|---|---|
| `revision` counter | yes — tracks iteration count, read back on the next rejection | keep |
| `rejection_reason` in frontmatter | yes — the human's feedback must be durable | keep, but **fix the escaping** (D5) |
| `tag: rejected` | yes — a queryable marker | keep |
| Rejection feedback in the body | yes — the executor reads the plan, not the frontmatter | keep, but **place it correctly** (D2) |
| Header **above** the frontmatter | **no — this is the defect** | move it below the frontmatter block |
| Approval marker left in place | **no — it is a false record** | **strip it** (D3) |

The rejection header must be inserted **after** the frontmatter block(s), not
prepended to the file. The frontmatter must remain at byte zero.

Stripping the approval marker is required and must be precise: remove the
gate-stamp block that `addApprovalMarker` wrote (`approved_by`, `approved_at`,
`gate_crossed`, and the `override` keys when present), leaving the plan's own
frontmatter intact. A plan that has been rejected has not crossed a gate, and
leaving the marker keeps a claim in the file that the ledger no longer backs.

## Implementation Details

### File: `src/lib/actions.js`
**Action:** MODIFY — `rejectPlan` only

1. **Stage-aware target.** Derive the current stage from the plan's parent
   directory, look it up in `gateOrder.STAGE_ORDER`, and compute
   `STAGE_ORDER[index - 1]`. Refuse loudly when the stage is unknown or when the
   index is 0 (a `functional` plan has nowhere further back). `sourceOf` is
   deliberately **not** used — see the trap documented above.
2. **Frontmatter stays at byte zero.** Inject the metadata updates into the
   existing frontmatter as today, then insert the rejection header **after** the
   final closing `---` of the frontmatter region, using the same multi-block
   frontmatter derivation the rest of the codebase uses (a gate-stamped plan has
   two blocks).
3. **Strip the approval marker** from the frontmatter region as part of the same
   rewrite.
4. **Withdraw the ledger entry** via `approval-ledger.removeEntry(slug, root)`,
   keyed by `slugFromPlanPath`. Best-effort by that function's existing contract;
   a failure to remove must be surfaced, never swallowed silently, because a
   surviving entry is the D4 gate-skip.
5. **Safe feedback encoding.** Truncate first, then escape, and strip newlines and
   control characters before interpolating into YAML.
6. **Ordering, so a partial failure cannot strand the plan:** write the content,
   then remove the ledger entry, then move. A crash before the move leaves a
   rejected-but-unmoved plan with no ledger entry — visible and safe. A move before
   the ledger removal could leave an approved-looking plan at a new stage, which is
   the unsafe ordering.

---

### Wiring — the live call sites

| change | live call site | root |
|---|---|---|
| stage-aware target | `src/tabs/review.js:9` → the Review tab's reject action | `/ctoc:menu` → Review → reject |
| frontmatter-preserving rewrite | same | same |
| ledger withdrawal | same | same |

The function has exactly one caller and it is already wired; nothing here is
reachable only from a test.

## Test Plan

### Tests: `tests/reject-plan-stage-aware.test.js`

The brief requires a case per gate edge **paired** with a skip-proof case, so that
merely changing a constant cannot pass. The pairing is the design of the suite:
cases 1-4 pin each target, and cases 5-7 pin that no target is a stage from which
a gate could be skipped. A one-constant fix satisfies at most one of each pair.

| # | Case | Assertion |
|---|---|---|
| 1 | reject from `review` | lands in `in-progress`, NOT `functional` — the reported defect |
| 2 | reject from `todo` | lands in `implementation` (Gate 2's documented revert target) |
| 3 | reject from `implementation` | lands in `functional` (Gate 1's documented target) |
| 4 | reject from `done` | lands in `review` (Gate 3's documented target) |
| 5 | **no rejection crosses more than one stage** | for every stage in `STAGE_ORDER`, the target index is exactly `index - 1`; a table-driven case, so a constant cannot satisfy it |
| 6 | **no rejection lands a plan where it could skip a gate forward** | for every rejection target, assert `crossesHumanGate(target, originalStage)` is TRUE whenever the original stage was reached through a gate — the plan must re-cross to get back |
| 7 | **a rejection target is never a gate destination the plan has not earned** | for each target, either it is not in `GATE_DESTINATIONS`, or the plan has a valid ledger entry for it; asserted against the real `gate-order` values |
| 8 | reject from `functional` refuses | no move, a clear error, the file unchanged on disk |
| 9 | reject from an unknown stage refuses | fail closed, no move |
| 10 | **frontmatter stays at byte zero** | after rejection the file starts with `---`, and `parseMetadata` still returns the plan's `files:` — the D2 regression guard |
| 11 | the `files:` declaration survives | the PreToolUse coverage check still resolves the plan's declared files after a rejection |
| 12 | the rejection feedback is in the body | present, and positioned after the frontmatter |
| 13 | **the approval marker is stripped** | no `approved_by`, `approved_at`, or `gate_crossed` remains |
| 14 | **the ledger entry is removed** | `readEntry` returns null after rejection |
| 15 | **the D4 gate-skip is closed** | approve to `implementation`, reject, move forward to `implementation` again → `classifyResidency` does NOT accept (no entry) |
| 16 | the revision counter increments | 0 → 1 → 2 across two rejections |
| 17 | feedback with a newline does not corrupt the frontmatter | `parseMetadata` still parses; `rejection_reason` is single-line |
| 18 | feedback with a quote at the truncation boundary | no dangling escape; frontmatter parses |
| 19 | a control character in feedback is stripped | no escape sequence reaches the file |
| 20 | ordering under failure | with the move forced to throw, the plan is not left with a surviving ledger entry |

Cross-platform: `fs.promises`, `path.join`, `os.tmpdir()`; teardown with
`fs.promises.rm(root, { recursive: true, force: true })`.

## Execution Plan (Steps 8-16)

### Step 8: TEST — write the file in full, run ONLY it, record red verbatim. Cases 1, 5, 6, 10, 11, 13, 14, 15, 17 and 18 MUST be red. Cases 2, 3 and 4 will be red for a different reason than case 1 (today every stage yields `functional`), and case 5's table form is what makes a single-constant fix insufficient — confirm in the report that changing the literal `'functional'` to any other single literal still fails case 5.
### Step 9: PREPARE — read from disk in full: `src/lib/actions.js` `rejectPlan`, `movePlan`, `addApprovalMarker` and `stampAndLedger`; `src/lib/gate-order.js`; `src/tabs/review.js`'s reject action; and the frontmatter-region derivation used elsewhere (`stale-detector.extractFrontmatterRegion`). Settle two facts and record both: whether a `plans/in-progress/` directory exists or `movePlan` creates it (the project documents in-progress as a frontmatter state, so if the directory is not a valid move target this plan's Gate 3 answer must be revisited before implementing — STOP and report rather than inventing a target), and whether `movePlan` performs its own gate check that would refuse a backward move.
### Step 10: IMPLEMENT — one step, files as sub-items.
  - `src/lib/actions.js` — items 1-6 (stage-aware one-back target with the refuse-on-unknown guard; frontmatter-preserving rewrite; approval-marker strip; ledger withdrawal; safe feedback encoding; the write→withdraw→move ordering).
### Step 11: REVIEW — confirm no path computes a target more than one index back, and no path uses `sourceOf`. Grep for any other unconditional `movePlan(..., '<literal>')` in the file and justify each. Confirm the rewrite leaves byte zero as `-`, and that a rejected plan round-trips through `parseMetadata` with its `files:` intact.
### Step 12: OPTIMIZE — one read, one write, one move; no re-read of the plan after the rewrite.
### Step 13: SECURE — the feedback string is human input written into YAML and into the plan body: truncate, strip control characters and newlines, then escape, in that order. Confirm the ledger withdrawal cannot be induced to remove a *different* plan's entry (the slug comes from `slugFromPlanPath`, which carries the traversal guard). Confirm no path can leave a plan resident at a gate destination with a stale entry.
### Step 14: VERIFY — `node --test tests/reject-plan-stage-aware.test.js tests/actions*.test.js tests/gate*.test.js tests/human-gate*.test.js` green, then the full gated run `npm test`. Lint both files. No git operations.
### Step 15: DOCUMENT — the function's doc comment states the one-stage-back rule, states explicitly that `sourceOf` is the wrong function here and why, and records that rejection withdraws the ledger entry. Note the audit trade-off of removal.
### Step 16: FINAL-REVIEW — report files, tests, red and green evidence verbatim, the two Step 9 findings, and every decision taken under ambiguity.

## Decisions Taken Under Ambiguity

1. **One stage back along `STAGE_ORDER`, not a per-gate revert table.** The
   one-back rule *reproduces* the documented table at all three gate destinations
   and additionally answers the `review` case the table omits. One rule beats a
   second encoding that could drift from `GATE_EDGES`.
2. **I am correcting my own earlier note: `sourceOf` is the wrong function.** It
   maps destination → source and is built for the residency sweep. `rejectPlan`
   operates on plans at gate *sources*, and `sourceOf('review')` is `undefined` —
   it would have failed on the only path that actually runs. Recorded as a
   correction rather than quietly dropped.
3. **`gate-order.js` is treated as the specification, and the disagreement with the
   documented four-gate table is recorded, not resolved.** The code encodes three
   gates and omits `vision`/`canvas` from `STAGE_ORDER`. Extending it would change
   `crossesHumanGate` for every consumer — out of scope here, and named so nobody
   assumes this slice settled it.
4. **The ledger entry is removed on rejection.** Leaving it is demonstrably
   exploitable (D4, via the non-hash-sensitive `implementation` destination);
   removal is the fail-closed default — no entry means not approved. The audit loss
   is disclosed; a `superseded` entry kind is mentioned only as a trade-off, and is
   **not** proposed as work.
5. **Four additional defects are fixed in the same function, and one of them is
   worse than the reported one.** D2 (the header prepended above the frontmatter)
   destroys a rejected plan's `files:` declaration — its write-surface grant —
   for every reader in the codebase. Fixing D1 while leaving D2 would ship a
   rejection that routes correctly and still corrupts the plan.
6. **The approval marker is stripped.** A rejected plan asserting `approved_by:
   human` is a false claim in a file, which is the exact class this wave keeps
   deleting.
7. **Write, then withdraw the ledger entry, then move.** A crash between steps
   leaves a rejected plan with no approval record, which is safe. The reverse
   ordering could leave an approved-looking plan at a new stage.
8. **One fact is named as unresolved rather than assumed.** Whether `in-progress`
   is a valid move target is decided by `movePlan` and the plans directory layout,
   and the project documents in-progress as a frontmatter state rather than a
   directory. Step 9 settles it and STOPS if it is not a valid target, instead of
   inventing a different Gate 3 answer mid-build.
9. **Case 5 is table-driven on purpose.** The brief asked for pairing so that a
   constant swap cannot pass; a per-stage table plus the forward-skip assertion
   (case 6) means any fix that is not genuinely stage-aware fails at least one
   case in every pair.
