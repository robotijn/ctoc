---
approved_by: human
approved_at: 2026-07-19T11:58:15.122Z
gate_crossed: implementation → todo
---

---
title: "The approval hash survives its own pipeline — bind the approval to the specification, not to the execution log"
type: implementation
parent_plan: ctoc-background-engine-rebuild
depends_on: none
priority: CRITICAL
program: ctoc-repair-loop
iron_loop: true
files:
  - "src/lib/approval-ledger.js"
  - "src/hooks/human-gate-check.js"
  - "tests/approval-hash-survives-execution.test.js"
---

# The approval hash survives its own pipeline

## What I measured

I re-measured this rather than taking it on trust, and two findings differ from
the brief in ways that change the plan.

**Verified directly:**

- `computeContentHash` (`approval-ledger.js:179`) hashes the **whole file**, and
  its own doc comment says so: *"Hashing the whole file means ANY later edit …
  changes the hash and invalidates the entry."*
- The hash is **correct at the moment of approval**, not wrong from birth.
  `stampAndLedger` (`actions.js:314-316`) hashes `destContent` — the exact bytes
  that land at the destination, marker included. So this is not a stamping-order
  bug; the binding is sound when written and decays only afterwards.
- The plan file is also the execution log. `plans/review/00076-…md` carries
  `- [x] COMPLETE — …` records appended under each `### Step N:` heading
  (`:267-285`), executor decisions 7-10 appended into the planner's
  `## Decisions Taken Under Ambiguity` section (`:329-362`), and a whole
  `## Execution Record (Steps 8–16)` section (`:364-397`). Every one of those was
  written after the approval that hashed the file.
- The recorded entries confirm the edge: `00076` and `00075` both record
  `stage_to: "todo"`, and both plans now reside in `plans/review/`.
- **I am myself a witness to the non-executor half.** I amended
  `plans/todo/00075-…md` after its Gate 2 approval at `21:08:04.252Z`, and the
  coordinator amended its frontmatter. Both are legitimate operations, and both
  changed the hashed bytes.

**Correction 1 — the enforcer does not fire on the three plans in review.**
`checkGateDestinationsApproved` iterates `GATE_DESTINATIONS`, which
`gate-order.js` defines as `['implementation', 'todo', 'done']`. `review` is not
a gate destination, so plans sitting there are not swept at all. The brief's claim
that the enforcer fires on these three is not what the code does.

**Correction 2 — and this one raises the severity, not lowers it.** The
consequence is not confined to an advisory message. `human-gate-check.js:145`:

```js
const HASH_SENSITIVE_FOLDERS = new Set(['todo', 'done']);
```

introduced by the comment *"Terminal gate-destination folders where **no
legitimate agent editing occurs**"*. That premise is **false for `todo/`** — I
edited a plan there today, and the executor writes step records into plans while
they carry an in-progress marker, which `CLAUDE.md` states is *"a plan state
tracked in YAML frontmatter, not a separate directory"*. And `hash-mismatch` is
not advisory: the module's own migration table (`:63-70`) lists it among the
reasons that mean *"provenance EXISTS and is WRONG (a live attack signature)"* and
that **still revert on EVERY project, migrated or not** — the withheld-on-unmigrated
carve-out covers only `no-ledger-entry`.

So the exposure is a **revert of a plan out of its gate destination, mid-build,
classified as an attack signature** — not merely noise. I could not run code to
confirm that a plan physically resides in `todo/` for the whole of its build, and
that single fact decides whether the consequence is noise or a mid-build revert.
**Step 9 settles it before anything is implemented**, and the plan is written so
that the fix is correct either way.

The brief's core diagnosis stands and is if anything understated: the mechanism
cannot distinguish a genuine post-approval amendment from ordinary execution,
because by construction it sees the same event.

## The design problem, confronted

The ruling is to hash the specification and exclude the execution log. The whole
difficulty is the boundary, and a wrong boundary **fails open quietly**, which is
strictly worse than today's noisy failure.

### What is actually on disk

Reading real plans, the execution record is **not** a clean suffix. It appears in
three places, two of which are interleaved into specification sections:

| Where | Example | Provenance |
|---|---|---|
| `## Execution Record` section | `00076:364-397` | executor only |
| checkbox bullets under `### Step N:` headings | `00076:267`, `:269`, `:273` | executor only |
| appended items in `## Decisions Taken Under Ambiguity` | `00076:329-362` (decisions 7-10) | executor, in the planner's section |

Meanwhile `### Step 10: IMPLEMENT` legitimately carries **plain** sub-item bullets
that ARE specification (`  - src/lib/x.js — …`).

### The boundary

**Deny-list, never allow-list.** The hashed region is the whole file **minus**
explicitly excluded regions. An allow-list fails open on anything forgotten — a
new specification section nobody remembered to add would be silently unhashed. A
deny-list hashes anything new by default, so a forgotten section is *protected*,
not exempted. This choice is the difference between failing safe and failing open.

Excluded regions, exactly two rules:

1. **Named execution sections** — a heading matching `EXECUTION_SECTIONS`:
   `## Execution Record`, `## Step 16 FINAL-REVIEW report`,
   `## Decisions Taken During Execution`, `## Verification Evidence`, and
   `## Decisions Taken Under Ambiguity` (see the disclosed loss below). The
   section runs from its heading to the next heading of the same or higher level.
2. **Checkbox lines anywhere** — a line whose trimmed form begins `- [x]` or
   `- [ ]`. This is the executor's completion-record marker, and it is **not my
   invention**: `plan-validator.validateStepsComplete:132-141` already treats
   `- [x]` as the completion signal, so the convention is already load-bearing
   elsewhere in this codebase. Plain bullets — the Step 10 sub-items — stay
   hashed.

### What makes it stable, stated honestly

**It is a convention, not a structural guarantee, and here is exactly what
enforces it:** the plan template defines the headings; `plan-validator` requires
steps by number; `src/hooks/validate-plan-steps.js` checks label text but
`CLAUDE.md` records that it *"is NOT wired as a runtime hook"*. That is weak
enforcement, and pretending otherwise would be the kind of claim this wave keeps
deleting.

What makes the design safe anyway is that **every drift direction degrades toward
noise, never toward silence**:

| Drift | Effect | Direction |
|---|---|---|
| executor invents a new execution section not on the list | hashed → mismatch | noisy — today's behaviour |
| executor writes a record without a checkbox | hashed → mismatch | noisy |
| executor edits a specification section | hashed → mismatch | **caught, correctly** |
| planner amends scope after approval (what I did) | hashed → mismatch | **caught, correctly** |
| someone adds a heading to `EXECUTION_SECTIONS` | silently exempt | **the only silent path — and it is a source change, reviewed** |

The single silent-exemption route is a deliberate edit to a constant in a reviewed
source file. Everything an executor can do at runtime either is caught or is
noisy. That asymmetry is the argument for this boundary, and the test suite pins
each row.

### The disclosed loss

Excluding `## Decisions Taken Under Ambiguity` is a real cost and must not be
buried. It is excluded because the executor is *required* to append to it, so
hashing it would reproduce the defect. The consequence: an executor could rewrite
or delete the planner's recorded decisions without breaking the approval.

The loss is bounded, and the bound is the reason it is acceptable: that section is
a **record**, not a **grant**. It confers no write surface and no scope. Every
grant-bearing part stays hashed — the frontmatter (including `files:`, which is
the actual write-surface grant), the scope prose, the implementation
specification, the test plan, and the step headings.

**Recommended follow-up, for the human to schedule, not for this slice:** split
the section into `## Decisions Taken Under Ambiguity` (planner, hashed) and
`## Decisions Taken During Execution` (executor, excluded), in the plan template
and the executor contract. That recovers the loss. It is a convention change
across the template and the agent instructions, which is a different unit of work
from this mechanism.

## Implementation Details

### File: `src/lib/approval-ledger.js`
**Action:** MODIFY

1. **`EXECUTION_SECTIONS`** — a frozen, exported constant listing the excluded
   headings, normalised (trimmed, lowercased, `#` markers stripped) so a heading
   level or trailing-space difference cannot cause a miss.
2. **`computeSpecHash(content)`** — returns `{ hash, ok, reason }`.
   - Locate the frontmatter region using the same derivation the codebase already
     uses for merged frontmatter blocks (`extractFrontmatterRegion`), so a
     gate-stamped plan's second block is handled identically.
   - Walk the body line by line, tracking the current heading. Drop a line when it
     falls inside an excluded section or matches the checkbox rule. Keep the rest.
   - Normalise line endings to `\n` before hashing, so a checkout with different
     line endings does not invalidate an approval. Cross-platform, and it changes
     nothing about what is protected.
   - Return `ok: false` with a reason when the region cannot be established —
     no frontmatter delimiters, or the file is empty. **The caller must treat
     `ok: false` as a failed verification**, never as a pass.
3. **`hash_scope` on new entries.** `writeEntry`, `writePipelineEntry` and
   `writeSufficiencyEntry` record `hash_scope: 'specification'`. An entry with no
   `hash_scope` means `'file'` — legacy whole-file semantics. This mirrors the
   registry's `generation` field (absent ⇒ 0), an established pattern here.
4. **`verify` branches on the recorded scope**, and fails closed:
   ```js
   function verify(slug, content, currentStage, projectPath) {
     const entry = readEntry(slug, projectPath);
     if (!entry) return false;
     if (entry.stage_to !== currentStage) return false;
     if (entry.hash_scope === 'specification') {
       const { hash, ok } = computeSpecHash(content);
       if (!ok) return false;   // boundary not locatable ⇒ NOT a pass
       return entry.content_sha256 === hash;
     }
     return entry.content_sha256 === computeContentHash(content);
   }
   ```
   `computeContentHash` is **kept**, unchanged and still exported: legacy entries
   are verified under the semantics they were written with, and nothing is
   retroactively re-blessed.

### File: `src/hooks/human-gate-check.js`
**Action:** MODIFY

`classifyResidency:245-251` performs its **own** hash comparison rather than
calling `ledger.verify`, so the semantics must be changed here too or the fix does
not reach the consumer that reverts. Replace the inline comparison with a call to
a single shared ledger predicate, so there is one encoding of "does this content
match this entry" rather than two that can diverge.

Add one distinguishing reason code: a mismatch under `hash_scope: 'file'` (a
legacy entry) reports `hash-mismatch-legacy`; a mismatch under
`'specification'` reports `hash-mismatch`. Both still reject — no gate is
weakened — but the human and the enforcer can finally tell *"this predates the
fix"* from *"the specification actually changed after approval"*. Without that
split the fence keeps crying wolf on 263 legacy entries and the real signal stays
buried, which is the harm this slice exists to remove.

Correct the false premise in the comment at `:143-144`: `todo/` is **not** a
folder where no legitimate agent editing occurs, and the new hashing is what makes
the hash-sensitivity of that folder tenable.

---

### Wiring — the live call sites

| new code | live call site | root |
|---|---|---|
| `computeSpecHash` | `approval-ledger.verify` and `human-gate-check.classifyResidency` (this slice) | every gate crossing, every residency sweep |
| `hash_scope` on writes | `stampAndLedger` → `writeEntry` (already wired) | `/ctoc:menu` gate approval |
| `hash-mismatch-legacy` | `classifyResidency`'s reason, surfaced by the sweep and the enforcer | `/ctoc:menu` |

## Test Plan

### Tests: `tests/approval-hash-survives-execution.test.js`

The central test reproduces the real lifecycle end to end: approve a plan, run the
edits an executor actually makes, and assert the approval **survives** — then make
a scope change and assert it **breaks**.

| # | Case | Assertion |
|---|---|---|
| 1 | **execution does not break approval** | approve a plan; append `- [x] COMPLETE` records under step headings and a `## Execution Record` section; `verify` still true — red today |
| 2 | **a scope change DOES break approval** | approve; change `files:` in frontmatter; `verify` false |
| 3 | a specification edit breaks approval | edit `## Implementation Details` prose; `verify` false |
| 4 | a step heading edit breaks approval | rewrite `### Step 13: SECURE — …`; `verify` false |
| 5 | a plain Step 10 sub-item is specification | edit a `  - src/lib/x.js — …` bullet; `verify` false |
| 6 | the real lifecycle, on real bytes | take `plans/review/00076-…md`, strip its execution records to reconstruct the pre-build text, hash that, then verify against the current file; true |
| 7 | **fail closed when the boundary is missing** | content with no frontmatter delimiters → `computeSpecHash().ok === false` and `verify` false |
| 8 | fail closed on empty content | `verify` false |
| 9 | **legacy entries keep legacy semantics** | an entry with no `hash_scope` verifies against the whole file, unchanged |
| 10 | a legacy mismatch reports its own reason | `classifyResidency` → `hash-mismatch-legacy`, still `accepted: false` |
| 11 | a specification mismatch reports `hash-mismatch` | still `accepted: false` |
| 12 | new entries record the scope | every write path stamps `hash_scope: 'specification'` |
| 13 | line-ending normalisation | the same plan with CRLF verifies identically |
| 14 | an unlisted new section is hashed | adding `## Notes` breaks the hash — the deny-list fails safe |
| 15 | a record without a checkbox is hashed | breaks the hash — drift is noisy, never silent |
| 16 | excluded sections end at the next heading | content after an excluded section is hashed again |
| 17 | **no gate is weakened** | `wrong-edge`, `no-ledger-entry`, `unknown-provenance`, `ledger-corrupt` all still reject exactly as before |

## Execution Plan (Steps 8-16)

### Step 8: TEST — write the file in full, run ONLY it, record red verbatim. Cases 1, 6, 7, 10, 12 and 14 MUST be red. Case 9 and case 17 MUST be GREEN before the change: they are the "nothing else moves" guards, and a fix that turns either red has weakened a gate rather than repaired a hash.
### Step 9: PREPARE — **settle the open fact first**: determine from `actions.js` (`startAgent`, `completeExecution`, `movePlan`) and the plans directory whether a plan physically resides in `todo/` for the duration of its build. Record the answer verbatim in the Step 16 report — it decides whether this defect causes a mid-build revert or advisory noise, and the human needs the real answer either way. Then read in full: `src/lib/approval-ledger.js`; `src/hooks/human-gate-check.js:120-300`; `src/lib/stale-detector.js`'s `extractFrontmatterRegion`; and two real executed plans, to confirm the section names and marker shapes against disk rather than against this plan's quotation.
### Step 10: IMPLEMENT — one step, files as sub-items.
  - `src/lib/approval-ledger.js` — `EXECUTION_SECTIONS`, `computeSpecHash`, `hash_scope` on all three write paths, the scope-branching fail-closed `verify`.
  - `src/hooks/human-gate-check.js` — route the comparison through the shared predicate, add `hash-mismatch-legacy`, correct the false premise in the comment at `:143-144`.
### Step 11: REVIEW — grep for every remaining direct call to `computeContentHash` and justify each. Confirm no path reaches `accepted: true` when `computeSpecHash` returns `ok: false`. Then run the fence against this repository's live ledger and report the real counts: how many of the 263 entries are legacy, and how many plans currently in a gate destination would be accepted or rejected before and after.
### Step 12: OPTIMIZE — one linear pass over the lines; no regular expression compiled per line; no second read of the plan.
### Step 13: SECURE — this is approval-provenance code, so state the threat model explicitly in the report: excluding a region means content there is unhashed, and the argument that this is safe rests on excluded regions carrying no grant. Confirm `files:` and every frontmatter field remain hashed. Confirm no new path can write a ledger entry, and that `.ctoc/approvals/` stays agent-write-denied on both channels.
### Step 14: VERIFY — `node --test tests/approval-hash-survives-execution.test.js tests/approval-ledger*.test.js tests/human-gate*.test.js tests/gate*.test.js` green, then the full gated run `npm test`. Lint the changed files. No git operations.
### Step 15: DOCUMENT — the module header states what the hash now covers and, in plain words, why: the plan file is both specification and execution log, and an approval binds to the part the human ruled on. Document the deny-list, the fail-closed rule, the `hash_scope` versioning, and the disclosed loss on the decisions section.
### Step 16: FINAL-REVIEW — report files, tests, red and green evidence verbatim, the Step 9 answer about `todo/` residency, the Step 11 ledger counts, and every decision taken under ambiguity.

## A second verified defect, for the human to schedule

I verified the rejection routing as instructed. **It is real.**
`actions.js:703-735`, `rejectPlan` ends:

```js
  // Move to functional
  return movePlan(planPath, 'functional', root);
```

Unconditional. It ignores the plan's current stage, so rejecting from `review`
sends the plan back four stages, past Gate 2 and Gate 1. It also prepends a
revision header and injects frontmatter, so it rewrites the plan's content, and it
leaves the ledger entry in place — recording `stage_to: todo` for a plan now
sitting in `functional/`.

I judge this a defect, not a design: nothing in the code or its comment states an
intent to unwind two gates, the sibling operations move exactly one stage, and a
Gate 3 rejection means "this build is wrong", not "this product decision is wrong".

**I recommend it as its own slice and I have not written it**, because it is a
different file, a different mechanism (stage routing, not content hashing) and a
different test surface, and because the schedule is the human's to set. The fix is
one stage-aware lookup — reject to the gate's own source stage, which
`gate-order.sourceOf` already provides as the single encoding — plus a decision
about whether rejection should clear the stale ledger entry. Everything needed to
schedule it is here.

## Decisions Taken Under Ambiguity

1. **Deny-list, not allow-list.** An allow-list silently exempts any specification
   section nobody remembered to include — the exact fail-open the ruling warns
   against. A deny-list hashes anything new by default.
2. **The checkbox rule is adopted because the codebase already relies on it.**
   `plan-validator.validateStepsComplete:132-141` treats `- [x]` as the completion
   marker. Reusing that convention adds no new one; inventing a fresh marker would
   have created a second encoding of "this line is an execution record".
3. **`## Decisions Taken Under Ambiguity` is excluded, and the loss is disclosed
   rather than minimised.** The executor is required to append there. The loss is
   bounded because the section is a record, not a grant; the split that recovers it
   is recommended above as a separate unit of work, for the human to schedule.
4. **`hash_scope` versioning instead of a migration.** Re-hashing existing entries
   against current content would launder every post-approval amendment — including
   the one I made to `00075` — into an approved state. Versioned semantics change
   nothing retroactively, and entries age into the new scope as plans are
   re-approved. This mirrors the registry's `generation` field.
5. **`hash-mismatch-legacy` is a new reason, not a new acceptance.** Both mismatch
   kinds still reject. The split exists so the fence stops crying wolf on legacy
   entries while the real signal stays visible — the harm being removed is
   indistinguishability, not strictness.
6. **`human-gate-check.js` is in scope even though the brief named only the
   ledger.** `classifyResidency` does its own hash comparison, so a change confined
   to `approval-ledger.js` would not reach the consumer that performs the revert.
   The slice would have shipped a fix that changed nothing where it matters.
7. **Two corrections to the brief are recorded rather than quietly absorbed.** The
   enforcer does not scan `review/`, so it does not fire on the three plans cited;
   and the real exposure is a revert armed by `hash-mismatch` in `todo/`, which is
   more serious than the noise described. Reporting the premise back as given would
   have understated the severity.
8. **One fact is named as unresolved rather than assumed.** Whether a plan
   physically resides in `todo/` throughout its build decides between "mid-build
   revert" and "advisory noise". I could not execute code to settle it, so it is not
   asserted in either direction; Step 9 settles it before implementation, and the
   fix is correct either way.
