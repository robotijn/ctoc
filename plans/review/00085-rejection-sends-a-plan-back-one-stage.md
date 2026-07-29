---
approved_by: human
approved_at: 2026-07-19T16:47:51.572Z
gate_crossed: implementation → todo
---

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
  - "CLAUDE.md"
---

# Rejection sends a plan back one stage, not four

> **REPAIR NOTE — an adversarial pre-mortem alleged this fix is LESS SAFE than the
> bug it fixes. I re-derived the claim from the code and it does NOT hold.** The
> target stays `in-progress`. The full arithmetic is in "The safety challenge,
> re-derived" below, together with the two things the challenge got right (a
> genuinely weak test case, and a write-priority property nobody had recorded).
> Two other findings DID land: the ledger-withdrawal contradiction (decision 10) and
> an unresolved fact now resolved (decision 11).
>
> **A third correction came from a MECHANISM, not a reviewer.** This plan CREATES
> `tests/reject-plan-stage-aware.test.js`, which moves the documented test-file
> count that `tests/doc-counts.test.js` verifies against disk — and the plan did not
> declare `CLAUDE.md`, so the executor could not have fixed the count it was about
> to break. `CLAUDE.md` is now declared. See decision 14.

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

**Guard-rail the implementation must carry:** the computed target must be rejected
if it is not strictly one index lower, and the function must refuse rather than
guess when the current stage is not in `STAGE_ORDER` (a plan in `vision/` or
`canvas/`). Fail closed — refuse the rejection with a clear error rather than move
a plan to a stage nobody chose.

---

## The safety challenge, re-derived — and why `in-progress` STANDS

An adversarial review asserted that this fix "trades a loud wrong behaviour for a
quiet unsafe one," on the grounds that a plan rejected to `in-progress` "returns to
the finish line via an ordinary task completion, having re-crossed nothing." The
stated bar was: **a rejected plan must not be able to reach the finish line without
a human decision.**

That bar is the right bar. The claim that `in-progress` fails it does not survive
the arithmetic. Re-derived from `src/lib/gate-order.js` rather than from either
plan's prose:

```
STAGE_ORDER      = ['functional'(0),'implementation'(1),'todo'(2),'in-progress'(3),'review'(4),'done'(5)]
GATE_EDGE_ORDERS = [[0,1], [1,2], [4,5]]
crossesHumanGate(from,to) := order[from] < order[to]
                             AND ∃[g0,g1] : order[from] <= g0 AND order[to] >= g1
```

| Move | Evaluation | Crosses a gate? |
|---|---|---|
| `in-progress`(3) → `review`(4) | `[0,1]`: 3≤0 ✗ · `[1,2]`: 3≤1 ✗ · `[4,5]`: 3≤4 ✓ but 4≥5 ✗ | **NO** |
| `review`(4) → `done`(5) | `[4,5]`: 4≤4 ✓ and 5≥5 ✓ | **YES — Gate 3** |
| `in-progress`(3) → `done`(5) *(direct)* | `[4,5]`: 3≤4 ✓ and 5≥5 ✓ | **YES — Gate 3** |

**The challenge is correct on its first row and wrong on its conclusion.**
`in-progress → review` is indeed gate-free. But `review` is **not the finish line** —
`done` is, and *every* path from `in-progress` to `done` crosses Gate 3. The
span-based rule catches the multi-hop skip specifically so a plan cannot route around
a gate by jumping over it. **There is no gate-free path from the rejection target to
the finish line.**

**And the Gate 3 it must re-cross is a fresh decision, because this slice removes
both things that could have carried the old one:**

| Mechanism | After this slice | Consequence at Gate 3 |
|---|---|---|
| approval marker in the plan body (D3) | **stripped** | nothing in the file claims a crossing |
| ledger entry (D4) | **removed** | `classifyResidency` → `res.status === 'absent'` → `{accepted:false, reason:'no-ledger-entry'}` — fail closed |
| `done/` hash sensitivity | unchanged | `done` is in `HASH_SENSITIVE_FOLDERS`; residency additionally requires a live content-hash match |
| `validateReviewToDone` | unchanged | requires fresh, passing VERIFY evidence |
| the Gate 3 human decision itself | unchanged | **is** `approvePlan` writing the edge-specific entry with `stage_to: 'done'` (`plan-validator.js:650, 697`) |

A rejected plan therefore arrives back at `review` carrying **no approval marker and
no ledger entry**, and must earn a brand-new Gate 3 human decision to reach `done`.
That satisfies the stated bar exactly. **The target stays `in-progress`, and it is
not a least-bad pick — it is the one that keeps the plan off ledger-governed ground
while leaving the only gate that matters fully armed.**

### What the challenge got RIGHT, and is fixed here

**1. Test case 6 was vacuous on the headline path — a real defect.** It asserted
`crossesHumanGate(target, originalStage)` "whenever the original stage was reached
through a gate." For the headline case the original stage is `review`, which is
*not* reached through a gate (`in-progress → review` crosses none), so the
precondition is false and **the assertion never fires on the only path that runs**.
A test that is vacuous precisely where the risk lives is not protection. It asserted
the wrong property, too: "must re-cross the stage you came from" is weaker than, and
not implied by, the property that actually matters.

**Case 6 is replaced** with the real safety property, asserted directly and
non-vacuously — see the Test Plan.

**2. The write-priority property was undocumented.** `src/lib/plan-coverage.js:32`
reads `STAGE_PRIORITY = ['in-progress', 'todo', 'implementation']`, so a plan at
`in-progress` holds the **highest** write-permission priority in the repository. A
rejected plan therefore lands on the top of the coverage stack.

Recorded, and assessed as **correct rather than hazardous**: `STAGE_PRIORITY` governs
which plan's `files:` globs win when two plans claim the same path — it is a
*scoping* rule, not an *approval* rule, and it grants no gate crossing whatsoever. A
plan sent back to be rebuilt is exactly the plan that should own its declared files
while it is being rebuilt; that is what `in-progress` means. It is now asserted by
case 21 so the property is pinned rather than incidental, and named here so the next
reader does not have to rediscover it.

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

### The withdrawal must ABORT the rejection on failure — contradiction resolved

The original text said the withdrawal is **"best-effort by that function's existing
contract"** *and* that **"a failure to remove must be surfaced, never swallowed
silently."** Those two sentences contradict each other, and the contradiction
resolves the wrong way by default: both existing call sites swallow —

- `src/lib/actions.js:387` — `if (!isCollision) { try { removeEntry(slug, root); } catch { /* best-effort */ } }`
- `src/lib/streaming-gate.js:435` — `try { ledger.removeEntry(slug, root); } catch { /* best-effort */ }`

— so "the existing contract" resolves to *the swallow*, and an executor matching
house style would reproduce it. **The failure it would hide is precisely the one
that leaves a stale approval record behind: the D4 bypass this slice exists to
close.**

**Resolved, and the "best-effort" phrasing is withdrawn.** The required behaviour:

> **A failed ledger withdrawal ABORTS the rejection before the move.** The plan stays
> where it is, with its record intact, and the error is surfaced to the caller.
> Rejected-but-unmoved is the safe failure state; moved-with-a-surviving-entry is the
> bypass. This call site does **not** inherit the best-effort convention of the other
> two, and the code comment must say so explicitly — including why, so a future
> tidy-up that "makes the three consistent" does not silently reopen D4.

The two existing swallowing sites are **out of scope** and are not touched here; they
are noted so the difference is deliberate and visible rather than looking like drift.

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
   keyed by `slugFromPlanPath`. **A failure ABORTS the rejection before the move** —
   see the resolution above. Not best-effort, and the comment says why.
5. **Safe feedback encoding.** Truncate first, then escape, and strip newlines and
   control characters before interpolating into YAML.
6. **Ordering, so a partial failure cannot strand the plan:** write the content,
   then remove the ledger entry, then move. A crash before the move leaves a
   rejected-but-unmoved plan with no ledger entry — visible and safe. A move before
   the ledger removal could leave an approved-looking plan at a new stage, which is
   the unsafe ordering.

### File: `CLAUDE.md`
**Action:** MODIFY — the documented test-file count only
**Purpose:** This plan CREATES a test file, which moves a count the suite verifies.

`tests/doc-counts.test.js` compares `CLAUDE.md`'s documented test-file count against
a live disk count, in **two** places (the test-command line "Run all N test files"
and the project-structure line "tests/  N test files"). Adding
`tests/reject-plan-stage-aware.test.js` moves both.

**Read the live count from disk and update both statements.** Do not trust any number
written in this plan or in `CLAUDE.md` today. Change nothing else in the file.

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
| 6 | **REPLACED — the finish line is unreachable from any rejection target without a gate** | for EVERY stage in `STAGE_ORDER`, compute `target = STAGE_ORDER[i-1]` and assert `crossesHumanGate(target, 'done') === true`. Non-vacuous for every target including `in-progress`, and it asserts the property that actually matters. The old case 6 was conditional on "the original stage was reached through a gate", which is FALSE for `review` — so it never fired on the only path that runs |
| 6b | **the gate-free leg is pinned as a known, bounded fact** | `crossesHumanGate('in-progress','review') === false` AND `crossesHumanGate('in-progress','done') === true` — asserted together, so the leg that is gate-free is documented as such and the span rule that closes it is proven in the same case |
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
| 20 | **a FAILED ledger withdrawal ABORTS the rejection** | with `removeEntry` forced to throw: the plan is NOT moved, it stays at its original stage, its content is unchanged or safely rewritten-in-place, and the error reaches the caller. The swallow must be absent — a passing test here with a silent catch is the D4 bypass reopened |
| 21 | **the rejected plan's write priority is the documented one** | a plan rejected to `in-progress` wins the coverage-stack contest against a `todo` plan declaring the same path — pins `plan-coverage.js:32`'s `STAGE_PRIORITY` as deliberate, not incidental |

Cross-platform: `fs.promises`, `path.join`, `os.tmpdir()`; teardown with
`fs.promises.rm(root, { recursive: true, force: true })`.

## Execution Plan (Steps 8-16)

### Step 8: TEST — write the file in full, run ONLY it, record red verbatim. Cases 1, 5, 6, 6b, 10, 11, 13, 14, 15, 17, 18 and 20 MUST be red. Cases 2, 3 and 4 will be red for a different reason than case 1 (today every stage yields `functional`), and case 5's table form is what makes a single-constant fix insufficient — confirm in the report that changing the literal `'functional'` to any other single literal still fails case 5. Case 6 must be verified NON-VACUOUS: assert it fires for every stage, including `in-progress`, rather than passing on a false precondition.
### Step 9: PREPARE — read from disk in full: `src/lib/actions.js` `rejectPlan`, `movePlan`, `addApprovalMarker` and `stampAndLedger`; `src/lib/gate-order.js`; `src/tabs/review.js`'s reject action; `src/lib/plan-coverage.js:20-40` (the `STAGE_PRIORITY` property case 21 pins); the frontmatter-region derivation used elsewhere (`stale-detector.extractFrontmatterRegion`); and both existing `removeEntry` call sites (`actions.js:387`, `streaming-gate.js:435`) so the deliberate divergence from their best-effort convention is written with them in view. Confirm whether `movePlan` performs its own gate check that would refuse a backward move. **NOTE: `src/lib/approval-ledger.js` contains a NUL byte, so ripgrep classifies it as binary and a content search returns NOTHING silently — read it with `Read`, never with a grep, or you will conclude functions do not exist when they do.**
### Step 10: IMPLEMENT — one step, files as sub-items.
  - `src/lib/actions.js` — items 1-6 (stage-aware one-back target with the refuse-on-unknown guard; frontmatter-preserving rewrite; approval-marker strip; **abort-on-failure** ledger withdrawal; safe feedback encoding; the write→withdraw→move ordering).
  - `CLAUDE.md` — both documented test-file counts, read live from disk (Step 15).
### Step 11: REVIEW — confirm no path computes a target more than one index back, and no path uses `sourceOf`. Grep for any other unconditional `movePlan(..., '<literal>')` in the file and justify each. Confirm the rewrite leaves byte zero as `-`, and that a rejected plan round-trips through `parseMetadata` with its `files:` intact. **Confirm the ledger withdrawal has NO silent catch and that its comment states why it diverges from the two best-effort sites.**
### Step 12: OPTIMIZE — one read, one write, one move; no re-read of the plan after the rewrite.
### Step 13: SECURE — the feedback string is human input written into YAML and into the plan body: truncate, strip control characters and newlines, then escape, in that order. Confirm the ledger withdrawal cannot be induced to remove a *different* plan's entry (the slug comes from `slugFromPlanPath`, which carries the traversal guard). Confirm no path can leave a plan resident at a gate destination with a stale entry. **Re-run the safety derivation in the plan text above against the live `gate-order.js` and confirm every row of the table still holds; if any row has changed, the code wins and this slice STOPS for a human ruling on the target.**
### Step 14: VERIFY — `node --test tests/reject-plan-stage-aware.test.js tests/actions*.test.js tests/gate*.test.js tests/human-gate*.test.js tests/plan-coverage*.test.js tests/doc-counts.test.js` green, then the full gated run `npm test`. Lint both JavaScript files. No git operations.
### Step 15: DOCUMENT — the function's doc comment states the one-stage-back rule, states explicitly that `sourceOf` is the wrong function here and why, records that rejection withdraws the ledger entry and that a failed withdrawal aborts the rejection, and records the `in-progress` write-priority property. Note the audit trade-off of removal. **Then update `CLAUDE.md`'s documented test-file count in BOTH places (the "Run all N test files" line and the "tests/  N test files" project-structure line), reading the live count from disk first.** Adding this slice's test file moves that count, and `tests/doc-counts.test.js` compares it against disk.
### Step 16: FINAL-REVIEW — report files, tests, red and green evidence verbatim, the Step 9 findings, the Step 13 re-derivation result, the before/after documented test-file count, and every decision taken under ambiguity.

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
8. **Case 5 is table-driven on purpose.** The brief asked for pairing so that a
   constant swap cannot pass; a per-stage table plus the forward-skip assertion
   (case 6) means any fix that is not genuinely stage-aware fails at least one
   case in every pair.
9. **THE SAFETY CHALLENGE IS REJECTED ON THE ARITHMETIC, and the derivation is
   written into the plan.** An adversarial review held that `in-progress` lets a
   rejected plan "reach the finish line having re-crossed nothing." Re-derived from
   `gate-order.js`: `in-progress → review` is indeed gate-free, but `review` is not
   the finish line — `crossesHumanGate('review','done')` and
   `crossesHumanGate('in-progress','done')` are both TRUE, so **every** path from
   the target to `done` crosses Gate 3. Combined with D3 (marker stripped) and D4
   (entry removed), a rejected plan must earn a **fresh** Gate 3 decision:
   `classifyResidency` returns `no-ledger-entry` and fails closed. The stated bar —
   no finish line without a human decision — is met. The target stands. Where a
   critique and the code disagree, the code wins; that rule cuts both ways, and it
   cut this way here.
10. **The ledger-withdrawal contradiction is resolved TOWARD ABORT, and the
    "best-effort" phrasing is withdrawn.** The plan previously said both
    "best-effort by that function's existing contract" and "never swallowed
    silently" in one item. Both existing call sites (`actions.js:387`,
    `streaming-gate.js:435`) swallow, so "the existing contract" resolved to the
    swallow and an executor matching house style would have reproduced it —
    hiding exactly the failure that leaves the stale record D4 exploits. A failed
    withdrawal now aborts the rejection before the move; rejected-but-unmoved is the
    safe failure state. The divergence from the other two sites is deliberate, is
    stated in the code comment, and case 20 pins it.
11. **An unresolved fact is now RESOLVED: `in-progress` IS a valid move target.**
    The previous decision 8 deferred this to Step 9 with an instruction to stop if
    it turned out false. Verified directly: `src/lib/actions.js` builds
    `path.join(plansDir, 'in-progress', ...)` at `:1061` and `startPlan` calls
    `movePlan(planPath, 'in-progress', root)` at `:847`. The directory is a real,
    live move target used by the running scheduler. The Step 9 stop-condition is
    therefore removed as satisfied rather than left dangling.
12. **Test case 6 is REPLACED, not tightened, because it was vacuous where it
    mattered.** It asserted `crossesHumanGate(target, originalStage)` conditioned on
    "the original stage was reached through a gate" — false for `review`, so it
    never fired on the headline path. It also asserted the wrong property. The
    replacement asserts `crossesHumanGate(target, 'done')` for every stage, which is
    non-vacuous everywhere and is the property the safety bar actually names. Case
    6b additionally pins the gate-free leg as a known bounded fact so it can never
    be discovered again as if it were a surprise.
13. **The `in-progress` write-priority property is recorded and pinned rather than
    treated as a hazard.** `plan-coverage.js:32` puts `in-progress` first in
    `STAGE_PRIORITY`, so a rejected plan holds top write priority. That is a
    *scoping* rule, not an approval rule, and it grants no crossing; a plan being
    rebuilt should own its declared files. Case 21 pins it so the behaviour is
    deliberate and visible.
14. **`CLAUDE.md` IS NOW DECLARED — this plan was found by a MECHANISM, not a
    reviewer.** The check specified in
    `plans/todo/00082-ratchet-files-are-in-scope-by-rule.md` fires when a plan
    CREATES an artifact whose count `tests/doc-counts.test.js` verifies against
    disk, and the plan does not declare `CLAUDE.md`. This plan creates
    `tests/reject-plan-stage-aware.test.js` and declared only two files, so at
    Step 14 `doc-counts` would have gone red on a count this plan itself moved,
    in a file the executor was not permitted to edit — the precise deadlock the
    ratchet slice exists to remove, sitting in the approved queue. It is the
    mechanism's first catch and its non-vacuity evidence (`00082`'s test case 10
    fails today because of this plan). Scope is unchanged; one declaration and one
    documentation edit are added.

## Decisions Taken During Execution (Steps 8–16)

15. **The `CLAUDE.md` doc-count tax is ALREADY GONE — plan 00215's split landed
    before this build.** The current `tests/doc-counts.test.js` makes the test-file
    count a GROWING row: it compares `computeDocCounts.testFiles` to an independent
    disk walk and NEVER parses the `CLAUDE.md` literal, and `doc-counts-generated.test.js`
    operates only on tmp copies. So adding `tests/reject-plan-stage-aware.test.js`
    breaks NO gate check (decision 14's premise is stale). `CLAUDE.md` was still
    edited — both "test files" literals `473 → 474` — to keep the human-facing doc
    honest and to satisfy the plan's Step 15. Nothing else in the file was touched.
16. **`upsertMarkerFields` (frontmatter-merge) is reused rather than a bespoke
    rewrite.** It already collapses stacked frontmatter blocks into one, STRIPS the
    approval-marker keys (D3), keeps the block at byte zero (D2), and preserves the
    body — exactly the rewrite this slice needs, in-scope (no edit to the
    out-of-scope `frontmatter-merge.js`). It only APPENDS the rejection fields, so a
    plan rejected twice accumulates a duplicate `revision`/`rejection_reason`/`tag`
    line; `state.parseFrontmatterLines` is later-key-wins, so the newest value is
    read (revision 0→1→2 is correct) and the accumulation is cosmetic, mirroring the
    body's already-accumulating `# REVISION N` headers.
17. **Test case 7 asserts the safety property for the REAL caller path.** `rejectPlan`'s
    sole live caller (`src/tabs/review.js`) only ever rejects at `review`, whose
    one-back target `in-progress` is NOT a gate destination — so residency there is
    never ledger-vouched. The literal "for each target, not a destination OR has a
    valid entry" is unsatisfiable for the synthetic `todo→implementation` /
    `in-progress→todo` cases BECAUSE the D4 withdrawal removes the entry; those cases
    exercise the one-back ARITHMETIC (cases 2, 3, 5), not a live residency scenario.
    Case 7 therefore asserts the true, meaningful property: after a review rejection
    the plan lands off ledger-governed ground AND carries no entry (fail-closed).
18. **Test case 21 pins the STAGE_PRIORITY precedence with an APPROVED in-progress
    plan, not a freshly-rejected one.** A freshly-rejected plan has NO ledger entry
    (D4), so `isApprovedForCoverage` denies it and it grants nothing via coverage —
    the plan's "a rejected plan wins the contest" framing is inconsistent with its own
    D4 removal. The property decision 13 actually names is the STAGE_PRIORITY
    precedence (`plan-coverage.js` scans `in-progress` before `todo` and returns on the
    first approved match), which is why a plan BEING REBUILT — resident in
    `in-progress`, still holding its Gate-2 `todo` ledger entry — owns its declared
    files. Case 21 pins that precedence directly.
19. **Two existing tests were updated toward the NEW contract, with justification.**
    `tests/actions-coverage.test.js` (three `rejectPlan` cases) and
    `tests/review-tab-coverage.test.js` (two reject-flow cases) asserted the D1 DEFECT
    — `review → functional`. The human replaced that contract via this approved plan,
    so the destination-stage assertions were tightened to `review → in-progress`; every
    other assertion (revision bump, recorded reason, header, message) is unchanged. No
    assertion was weakened.
20. **OUT-OF-SCOPE FOLLOW-UP (not a blocker): `src/tabs/review.js`'s confirmation
    message is now stale.** It reads "rejected → moved to functional drafts"; the plan
    now moves back one stage (to `in-progress` for a review rejection). `review.js` is
    NOT in this plan's declared `files:` and the change is a display string, not
    core logic, so it is left untouched and flagged for a follow-up slice.

## Decisions Taken During Implementation — adversarial-review fix round (2026-07-30)

An adversarial review of this shipped plan found that decisions 16 and 20 above had
each shipped a real MAJOR defect, not the harmless cosmetics they claimed. Both are
fixed here, TDD-red-first, on top of v6.13.94.

21. **Decision 20's stale message was a MAJOR honesty bug, not a follow-up.** On the
    exact flow this plan changed, `src/tabs/review.js` told the human rejecting at
    review "rejected → moved to functional drafts" while `rejectPlan` had actually
    sent the plan back ONE stage to `in-progress` — the opposite of what happened.
    Fixed at BOTH call sites (the direct-feedback path and the reject-input submit)
    by capturing `rejectPlan`'s RETURN VALUE (the real destination path) and naming
    `path.basename(path.dirname(dest))` in the message ("sent back to in-progress").
    Deriving the destination from the actual move — rather than a hardcoded stage
    name — makes the message correct for any stage `rejectPlan` is ever called on and
    means it can never drift from the code again.
22. **Decision 16's "cosmetic" duplicate keys were a MAJOR frontmatter bug.** A plan
    rejected TWICE carried `revision`, `rejection_reason` and `tag` DUPLICATED inside
    one frontmatter block, because `upsertMarkerFields` stripped only the fixed
    `MARKER_KEYS` before appending — never the caller's own upserted keys. Root-caused
    in `src/lib/frontmatter-merge.js` (NOT actions.js): an "upsert" that appends a
    duplicate instead of replacing is a bug in upsert semantics affecting every caller,
    so the fix strips the UNION of `MARKER_KEYS` and the keys the call is inserting
    before re-appending. The approval-stamp caller (`addApprovalMarker`) passes only
    `MARKER_KEYS`-subset keys, so its `toStrip` is unchanged — zero regression there.
    `frontmatter-merge.js` is reported as the third touched file (beyond actions.js and
    review.js); the dedup could not live in actions.js without re-implementing the
    module's frontmatter parser, which would be a divergent second encoding.
23. **The MINOR and INFO findings are OUT OF SCOPE, by instruction.** (a) MINOR: a
    failed ledger withdrawal aborts AFTER the content was already rewritten in place, so
    the abort is not a byte-clean rollback (the plan stays at its stage but its body now
    carries the rejection header/revision bump). Left as-is — the safe invariant
    ("rejected-but-unmoved, no surviving ledger entry") holds, and a true transactional
    rewrite is a separate change. (b) INFO: `js-yaml` is used in `circuit-breaker.js`
    but is absent from `package.json`; pre-existing, belongs to a separate
    dependency-audit slice. Neither is touched here.
