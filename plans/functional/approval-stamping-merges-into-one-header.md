# Functional Plan: Approval stamping merges into one header, and the corrupted plans are repaired

> Created: 2026-07-27
> Status: Draft
> Author: CTO Chief (surfaced by the review-backlog rework sweep)
> Hardened by: Product Owner agent (Iron Loop Steps 2-4 -- ASSESS, ALIGN, CAPTURE), 2026-07-27

---

## 1. ASSESS - Problem Understanding

### Context

When a plan crosses a human gate, `src/lib/actions.js`'s `addApprovalMarker` writes the
`approved_by: human` marker by **prepending a brand-new `---\n...\n---\n\n` fenced block**
ahead of the plan's existing content (`stampAndLedger` calls it, called from `approvePlan`
for every `isHumanGate` crossing; `approveSubplans` batches this by looping `approvePlan`
per sibling -- one marker prepend per sibling per crossing). This project has exactly
three human-gate edges (`src/lib/gate-order.js` `GATE_EDGES`): `functional -> implementation`,
`implementation -> todo`, `review -> done`. A plan that reaches `review/` through the normal
flow has crossed 2 of them (2 stacked blocks); a plan that was rejected once
(`rejectPlan` reverts it to `functional/` with no marker) and re-approved crosses those
same 2 edges again, reaching 4 stacked blocks -- which matches the "two-to-four stacked
blocks" observed on disk exactly.

`src/lib/frontmatter.js`'s `parseFrontmatter()` -- documented in its own header as "the
SINGLE HOME for the CRLF-safe frontmatter pattern... every plan-reading module MUST
import from here" -- matches only the **first** `---...---` block (`FRONTMATTER_BLOCK`
is not multi-block aware). Read directly, on a stacked-block plan it returns only the
most recent marker's three scalar fields (`approved_by`, `approved_at`, `gate_crossed`);
the plan's own `title`, `type`, `files:`, `depends_on` -- which live in the second (or
third, or fourth) block -- are invisible to it.

### Current State (verified by direct code read, and by what could not be verified)

**Verified by reading the code directly (this hardening pass):**
- `addApprovalMarker` (`src/lib/actions.js`) unconditionally prepends a full new
  frontmatter block on every crossing; it never inspects or merges into the block
  already present. This is the write-side root cause, confirmed by reading the function.
- `frontmatter.parseFrontmatter()` (`src/lib/frontmatter.js`) parses only the first
  `---...---` block via a single-match regex. Confirmed by reading the function.
- **The corruption is not uniformly invisible to the pipeline.** A separate fix
  (cited inline as "finding M19") already gave THREE other call sites their own
  merge-aware reader, each built independently on top of the shared
  `stale-detector.extractFrontmatterRegion` helper (which concatenates every
  *well-formed, consecutively leading* `---...---` block, not just the first):
  `state.parseMetadata` (used by `readPlans`, which backs the dashboard and every
  `plan.metadata` consumer), `plan-coverage.parsePlanFiles` (used by the
  `PreToolUse.Edit.js` enforcement hook's `files:` coverage check), and
  `actions.planDeclaredFiles` (used by `taskSpecFromPlan` for scheduler
  file-conflict serialization). A **fourth** site, `actions.listSubplans`, hand-rolls
  its own inline regex merge over the same region for the same reason. So today,
  `title`, `files:`, `depends_on`, and dashboard rendering are, in practice, already
  recoverable through these four paths for any stacked-block plan whose blocks are
  each individually well-formed -- **the corruption is real and the write-side defect
  is real, but four independent, duplicated reader-side patches are already carrying
  the weight the write path should be carrying.** That duplication is itself evidence
  for fixing this at the source (see Business Alignment).
- The `---` fence gate-destination residency check (`src/lib/approval-residency.js`
  `classifyResidency`, invoked by `src/hooks/human-gate-check.js`) only inspects plans
  resident in the three **gate-destination** folders (`implementation`, `todo`, `done`).
  `review` is not a gate destination (`gate-order.GATE_DESTINATIONS` is
  `['implementation','todo','done']`) and is therefore **not** subject to the
  ledger content-hash check (`HASH_SENSITIVE_FOLDERS = {'todo','done'}`). This matters
  directly for the migration risk noted below.
- `state.js`'s own duplicate-key merge convention (`parseFrontmatterLines`, used by
  `parseMetadata`): "a later duplicate key OVERRIDES an earlier one." Any FR-1 merge
  algorithm should either follow this existing convention or explicitly justify
  diverging from it -- introducing a third, inconsistent merge rule would be a new
  defect of the same shape as the one being fixed.

**Not verified -- a genuine tool limitation of this hardening pass, disclosed rather
than silently assumed:** this agent's toolset for this pass was Read/Write/WebSearch
only, with no directory-listing or glob capability, and this repository's plan
filenames carry a slug suffix this agent does not know (e.g. `plans/review/00090.md`
does not exist as a literal path -- the real file is `plans/review/00090-<slug>.md`).
Direct reads of `plans/review/00090-*.md` and `plans/review/00097-*.md` could not be
attempted for that reason. **This does not change the diagnosis** -- the write-side
mechanism (`addApprovalMarker` prepending unconditionally) is independently confirmed
by reading `actions.js` itself, which is sufficient to prove the defect exists and
recurs regardless of which specific files currently show it -- but it does mean the
**exact current stage** of the other six named plans (`00088`, `00098`, `00121`,
`00124`, `00156`, `00158`) is unconfirmed by this pass. That stage matters for FR-3
(below): a corrupted plan resident in `todo/` or `done/` carries different migration
risk than one resident in `review/`.

### Impact

- **Confirmed working today (not broken):** the `PreToolUse.Edit.js` enforcement hook's
  `files:` coverage check, via `plan-coverage.parsePlanFiles`, already reads the merged
  region and finds `files:` correctly on a stacked-block plan resident in `todo/` --
  this is the specific consumer path the original diagnosis's Impact section named as
  broken; it is not, today, because of the M19-derived workaround. The workaround is
  real but it is a patch, not a fix, and it is the fourth independent copy of the same
  patch in this codebase.
- **Confirmed still broken:** any direct caller of `frontmatter.parseFrontmatter()`
  (the primitive every plan-reading module is told to import) silently gets
  marker-only fields from a stacked-block plan. Today's known callers route around
  this via the four merge-aware wrappers above, but the primitive itself is the
  documented "single home" and remains a footgun for the next caller who reasonably
  trusts its own header.
- **Confirmed still broken:** the raw file is human-illegible on inspection (2-4
  nested `---` blocks in one file) and grows without bound across reject/re-approve
  cycles -- an audit trail should read as one coherent history, not as an accumulating
  stack the reader has to re-discover on every read.
- **Fragility of the existing workaround:** `extractFrontmatterRegion` merges only
  *consecutive, individually well-formed* leading blocks; it stops silently at the
  first unterminated/malformed block and returns whatever it collected before that
  point. A single malformed prepend (e.g. a crash mid-write before this repository's
  atomic-write discipline was in place, or a manual edit) would again make `title`/
  `files:`/`depends_on` invisible to all four workarounds at once, with no signal that
  the merge stopped early.
- **It recurs on every human-gate crossing** -- this is a live, ongoing defect in the
  approval path, not a one-off historical accident, confirmed directly from the
  unconditional-prepend code path.

---

## 2. ALIGN - Business Alignment

### Job to Be Done

When a plan crosses a human gate (or several, over its lifetime, including a
reject-and-resubmit cycle), I want the approval marker written into the plan's
**existing** frontmatter instead of stacked on top of it, so I can trust that every
tool reading that plan afterward -- the dashboard, the enforcement hook, the scheduler,
and a human skimming the raw file -- sees the plan's real `title`, `files:`, and
`depends_on`, through the ordinary, single, documented reader (`parseFrontmatter`),
not only through duplicated workaround code that has to be independently maintained
at every call site and silently stops merging on the first malformed block.

### Impact Map

- **Goal:** The human-gate approval mechanism -- the four-gate guarantee this project's
  own CLAUDE.md treats as non-negotiable ("no code without... gates") -- writes its
  audit marker without degrading the machine-readable plan it is stamping, so the
  guarantee holds through every consumer, not just the ones patched so far.
- **Actor:** Two actors share this stub, both named in the parent context (this is a
  CTOC self-hardening plan, so the "user" is the pipeline's own operators and tooling):
  (1) the human approving a gate, whose approval must not corrupt the very plan they
  just approved; (2) the CTO Chief / iron-loop-executor / enforcement hook building an
  approved plan, which must read that plan's real declared scope correctly through the
  primitive path, not only through a workaround.
- **Impact:** A gate crossing becomes observably idempotent and non-destructive: the
  file always carries exactly one frontmatter block, readable by the primitive
  `parseFrontmatter()` with no special-case merge logic required by the caller.
- **Deliverable:** A merge-based `addApprovalMarker`/`stampAndLedger` write path, an
  idempotency guard against a duplicate same-edge crossing, a one-time repair of the
  plans already corrupted (scope per the Open Decision below), and a regression test
  that proves the primitive reader survives a double approval.

### Success Metrics

- [ ] Stamping an approval **merges** `approved_by`/`approved_at`/`gate_crossed` (and,
      when present, `override`/`override_reason`) into the plan's single existing
      frontmatter block. After the merge the file contains exactly one
      `---...---` block, full stop -- never two, regardless of how many times the
      plan has crossed a gate in its lifetime.
- [ ] Approving the same plan across the same gate edge twice never creates a second
      block and never silently discards the first crossing's data (idempotent).
- [ ] Every gate crossing's marker data, across the plan's whole lifetime (up to 3
      distinct edges plus any reject/resubmit repeats), remains present and
      recoverable after the merge -- not overwritten down to only the most recent
      crossing. (The concrete field layout that achieves this -- e.g. a list of
      crossings vs. one namespaced key per edge -- is an Implementation Planning
      decision, Steps 5-7; this plan specifies the observable guarantee, not the
      schema.)
- [ ] A one-time migration collapses the stacked blocks on every already-corrupted
      existing plan (scope: see Open Decision), preserving all marker-field **values**
      and the real `title`/`files:`/`depends_on`, and -- for any migrated plan
      resident in a ledger-hash-sensitive folder (`todo/` or `done/`) -- also updates
      that plan's ledger entry so its stored content hash matches the migrated bytes
      (see Constraints below; this is new grounding this hardening pass adds).
- [ ] A regression test proves that after a **double** approval (two distinct gate
      crossings on the same plan), `frontmatter.parseFrontmatter()` -- the raw,
      shared primitive, not just the higher-level wrappers -- returns the plan's
      real `title`, `files:`, and `depends_on` unchanged.
- [ ] The full gate is green (whole suite + coverage floor + zero skipped).

### Constraints -- safety-critical

This edits the **human-gate approval path**. Per the project's self-improvement rule,
hook/gate-logic changes require explicit human approval and go through the full
pipeline -- no escape phrase, no shortcut.

**"Byte-for-byte" is a data-preservation constraint, not a layout-freeze constraint.**
Merging N stacked blocks into 1 necessarily changes the file's byte layout (that is
the fix). What must be preserved byte-for-byte is the **value** of every marker field
written by every past crossing -- `approved_by`, `approved_at`, `gate_crossed`, and any
`override`/`override_reason` -- and the plan's own original fields (`title`, `type`,
`files:`, `depends_on`, `status`, `priority`, and anything else already present). An
approval that silently loses a `gate_crossed` or an `approved_at` value, or that
silently collapses two distinct crossings' evidence into one, is a **worse** failure
than the corruption being fixed: it destroys the audit trail while looking clean.

**The ledger-hash interaction is new grounding from this hardening pass and is now an
explicit constraint.** `approval-ledger`'s `stampAndLedger` computes a plan's ledger
`content_sha256` / specification hash against the **exact bytes** written at approval
time, and for plans resident in `todo/` or `done/` (`HASH_SENSITIVE_FOLDERS`) a later
mismatch against that stored hash is classified `hash-mismatch` and the plan is
**reverted by the residency sweep as an apparent forgery** -- a false, alarming signal
against a plan a human genuinely approved. The ongoing fix (merging at write time) is
self-consistent by construction: `stampAndLedger` always computes the hash against
whatever it just wrote, so this never desyncs going forward. The **migration** of
already-corrupted plans is the one place this can go wrong: rewriting a plan's bytes
after its ledger entry was already written, without also updating that entry, would
desync the two and cause exactly this false-forgery revert on the next residency
check. Verified: none of the three specifically-named corrupted plans
(`plans/review/00090`, `00097`, `00078`) are exposed to this, because `review` is not
a gate-destination folder and is not swept for ledger-hash residency at all. **Not
verified** for the other six named plans -- their current stage was not confirmed by
this pass (see ASSESS). The migration (FR-3) must therefore check each affected
plan's actual current stage and, for any resident in `todo/` or `done/`, update its
ledger entry atomically with the file rewrite.

---

## 3. CAPTURE - Requirements

### User Stories (INVEST-validated)

**As a** human approving a plan at a gate,
**I want** my approval stamped without corrupting the plan's own frontmatter,
**so that** the plan I just approved keeps its title, files, and dependencies visible
to every downstream tool, not only to the tools someone remembered to patch.

*(Independent: the write-path fix stands alone. Negotiable: describes the outcome, not
the field schema. Valuable: protects the human's own approval act. Estimable: a single,
well-understood function. Small: one write path. Testable: FR-1/FR-2 below.)*

**As** the CTO Chief / iron-loop-executor building an approved plan,
**I want** a plan's `files:` and `depends_on` to be readable through the primitive
frontmatter reader after every gate it has crossed,
**so that** the enforcement hook grants exactly the declared write access and the
scheduler orders dependencies correctly, without relying on a workaround that stops
merging silently on the first malformed block.

*(Independent: testable without the migration landing. Negotiable: no schema
prescribed. Valuable: this is the actor the coverage-hook Impact bullet is about.
Estimable/Small: same write path. Testable: FR-4.)*

**As** the human clearing the review backlog,
**I want** the already-corrupted plans repaired in one pass with zero data loss and no
false forgery reverts,
**so that** they can safely re-enter the pipeline (including crossing `review -> done`)
without the dashboard showing them untitled or the scheduler mis-ordering their
dependencies.

*(Independent: depends on FR-1's merge algorithm existing first -- declared via
`depends_on` in Implementation Planning, not a violation of INVEST at the functional
level. Negotiable: scope stated as an open decision, not prescribed here. Valuable:
directly serves the actor who filed this stub. Estimable: bounded by the ~9-plan
count. Small: a one-time script over a small file set. Testable: FR-3.)*

### Functional Requirements

| ID | Requirement | Priority | Acceptance Criteria (summary) |
|----|-------------|----------|---------------------|
| FR-1 | Merge the approval marker into the plan's single existing frontmatter block | Must | Exactly one `---...---` block after any crossing; every prior crossing's marker data still recoverable; plan's own fields unchanged |
| FR-2 | Idempotent re-approval of the same gate edge | Must | Re-approving the same edge updates in place; never adds a block; never silently drops override provenance |
| FR-3 | One-time, ledger-hash-aware migration of the already-corrupted plans | Must | Single block per plan; all marker values retained; `todo`/`done`-resident plans get their ledger entry updated in the same step |
| FR-4 | Regression test proving the primitive reader survives approval | Must | `parseFrontmatter()` (not just `parseMetadata`) returns real `title`/`files:`/`depends_on` after a double approval; the enforcement hook still resolves coverage correctly |

#### FR-1 -- Merge the approval marker into the plan's single existing frontmatter block

- [ ] **Scenario: First gate crossing on a never-approved plan**
  Given a plan with one frontmatter block (`title`, `type`, `files:`, `depends_on`,
  no approval marker)
  When it crosses a human gate (e.g. `functional -> implementation`) via `approvePlan`
  Then the resulting file has exactly one `---...---` block
  And that block contains both the original fields unchanged and the new
  `approved_by`/`approved_at`/`gate_crossed` fields
  And no second `---...---` block exists anywhere in the file.

- [ ] **Scenario: Second, later gate crossing on an already-approved plan**
  Given a plan that already carries one merged block recording its
  `functional -> implementation` crossing, now resident in `implementation/`
  When it crosses its next gate (`implementation -> todo`) via `approvePlan`
  Then the file still has exactly one `---...---` block
  And the `functional -> implementation` crossing's `approved_at` and `gate_crossed`
  values are still present and recoverable somewhere in that block
  And the new `implementation -> todo` crossing's own `approved_at`/`gate_crossed`
  values are also present
  And the plan's own `title`/`files:`/`depends_on` are unchanged from before the
  first crossing.

- [ ] **Scenario: Malformed source block**
  Given a plan whose existing frontmatter block is unterminated (missing the closing
  `---`)
  When a gate crossing is attempted on it
  Then the crossing is refused with a specific, named reason (not a silent write that
  produces a second malformed or ambiguous block)
  And the plan is left byte-identical in its source location, matching this
  repository's existing "a failing validation refuses; no marker, no move, no ledger
  entry" contract in `approvePlan`.

#### FR-2 -- Idempotent re-approval of the same gate edge

- [ ] **Scenario: Duplicate crossing of the same edge**
  Given a plan that was just approved for `implementation -> todo` (marker present,
  one block)
  When `approvePlan` is invoked again for the identical plan and the identical edge
  before any other stage move happens
  Then the plan file's marker for that edge is updated in place
  And the file still has exactly one frontmatter block
  And no second copy of the `implementation -> todo` marker is appended.

- [ ] **Scenario: Re-approval after an override**
  Given a plan that was approved with `options.override = { reason }` (marker carries
  `override: true` and `override_reason`)
  When the same edge is re-approved normally (no override this time)
  Then the file still has exactly one frontmatter block
  And the override fields are handled by an explicit, named rule (retained or
  cleared) rather than left in an inconsistent or duplicated state.

- [ ] **Scenario: Batch re-approval via approveSubplans does not double-stamp**
  Given a sibling set of sub-plans, one of which was already individually approved
  for `review -> done` moments earlier
  When `approveSubplans` batches the remaining siblings through the same edge
  Then the already-approved sibling is not re-stamped with a second block
  And every sibling ends the batch with exactly one frontmatter block each.

#### FR-3 -- One-time, ledger-hash-aware migration of the already-corrupted plans

- [ ] **Scenario: Migrating a review-stage corrupted plan**
  Given an already-corrupted plan resident in `plans/review/` with 2-4 stacked
  frontmatter blocks
  When the one-time migration runs
  Then the file ends with exactly one merged block
  And `frontmatter.parseFrontmatter()` (the raw primitive) correctly reads its
  `title`/`files:`/`depends_on`
  And every stacked block's marker-field values are still recoverable per FR-1's
  data-preservation rule.

- [ ] **Scenario: Migrating a plan resident in a ledger-hash-sensitive folder**
  Given an already-corrupted plan that is resident in `plans/todo/` or `plans/done/`
  and has an existing ledger entry (`.ctoc/approvals/<slug>.json`) computed against
  its current (pre-migration) bytes
  When the migration rewrites that plan's frontmatter
  Then the migration also updates that ledger entry's stored hash, in the same step,
  so it matches the migrated bytes
  And the next residency check (`approval-residency.classifyResidency`) on that plan
  reports `accepted: true`, not `hash-mismatch`.

- [ ] **Scenario: A plan the migration cannot safely parse is skipped and reported**
  Given a plan among the ~9 whose stacked blocks include one that is malformed or
  unterminated
  When the migration runs
  Then that plan is skipped (left untouched) and named in the migration's report with
  a specific reason
  And the migration does not silently drop it from the report or silently attempt a
  best-effort rewrite that could lose data.

#### FR-4 -- Regression test proving the primitive reader survives approval

- [ ] **Scenario: Double approval survives the raw primitive reader**
  Given a plan with `title: "X"`, `files: ["src/a.js"]`, `depends_on: "none"` set
  When it is approved twice in sequence, crossing two distinct gate edges
  (`functional -> implementation`, then `implementation -> todo`)
  Then `frontmatter.parseFrontmatter()` -- called directly, not through
  `parseMetadata` or any other wrapper -- returns `title: "X"` and `files:
  ["src/a.js"]` unchanged.

- [ ] **Scenario: The enforcement hook still resolves coverage correctly**
  Given the same twice-approved plan, now resident in `todo/`
  When `plan-coverage.findCoveringPlan('src/a.js', root)` is called (the function
  `PreToolUse.Edit.js` uses to decide write access)
  Then it returns a match naming that plan
  And calling it for an unrelated file the plan does not declare returns no match --
  proving the fix does not over-broaden coverage as a side effect.

- [ ] **Scenario: Ledger hash stays in sync with the merged content**
  Given a plan approved once under the new merge-based `stampAndLedger`
  When its ledger entry's stored `content_sha256` (or specification hash) is compared
  against the plan file's actual committed bytes immediately after approval
  Then they match -- proving the merge change did not introduce the very
  hash-desync failure mode named as a migration risk above.

### Out of Scope

- The **meaning** of approval (what a human gate authorizes) -- only the write
  *format*.
- The separate menu-to-start `files:` drift (already fixed per-plan during the sweep).
- **Hardening `frontmatter.parseFrontmatter()` itself to merge multiple blocks.** FR-1
  makes new stacking structurally impossible going forward, and FR-3 migrates the
  existing corruption, so after this plan ships no live plan should carry multiple
  blocks. If a future regression somehow reintroduces stacking, this primitive would
  again silently mask it -- that residual exposure is named explicitly in Risks below
  as a thing to watch, not something this plan fixes preemptively (it would touch
  every caller of a widely-imported low-level module for a hazard this plan already
  removes at the source).
- **Simplifying or removing the four existing merge-aware workaround readers**
  (`state.parseMetadata`, `plan-coverage.parsePlanFiles`, `actions.planDeclaredFiles`,
  `actions.listSubplans`'s inline regex). They remain correct and continue to protect
  against any un-migrated legacy plan (if the human's Gate-1 decision is fix-only) or
  any future regression. Consolidating four independent implementations into one
  shared helper is a legitimate, separate cleanup with its own risk profile -- named
  here as a technical dependency worth knowing about, not scheduled by this plan.

---

## 4. Priority

**Priority: HIGH** (Score: 8/9)
- Dependency: HIGH (3) -- this defect is live on every future batch approval, and the
  already-corrupted plans in the backlog cannot safely reach `review -> done` (their
  final gate) until it is addressed one way or another; other backlog-clearing work
  depends on this being resolved.
- Business Impact: HIGH (3) -- this is the write path behind the four-human-gate
  guarantee this project treats as non-negotiable; an approval mechanism that
  degrades the very plan it stamps undermines the audit trail the whole gate system
  exists to produce.
- Technical Risk: MEDIUM (2) -- the write-path fix itself (FR-1/FR-2) is narrow and
  well-understood (one function), but the migration's interaction with the ledger's
  content-hash residency check (FR-3) is a genuine, previously-unidentified risk of
  reverting a legitimate approval as an apparent forgery if handled carelessly.

---

## 5. Risks

### Technical Risks

- **Risk:** A naive merge implementation collapses up to 3 distinct lifetime gate
  crossings' worth of `approved_by`/`approved_at`/`gate_crossed` scalar fields down to
  only the most recent one, silently destroying prior-crossing audit evidence.
  - Likelihood: MEDIUM -- the simplest merge implementation (overwrite the same three
    scalar keys) is the one an implementer is likely to reach for first, and it is
    exactly this failure.
  - Impact: HIGH -- a plan that crossed 3 human gates would end up with only 1
    crossing's evidence recoverable, a real loss of accountability data on a
    safety-critical path.
  - Mitigation: Design and test-lock (FR-1's multi-crossing scenario) a merge
    algorithm that retains every distinct crossing's data before this plan crosses
    Gate 1 into Implementation Planning.

- **Risk:** Migrating an already-corrupted plan that is resident in a ledger-hash-
  sensitive folder (`todo/` or `done/`) without also updating its ledger entry desyncs
  the stored hash from the migrated bytes, and the next residency sweep reverts that
  plan as an apparent forgery.
  - Likelihood: LOW for the three specifically-verified plans (`00090`, `00097`,
    `00078` are all in `review/`, which is not swept for ledger-hash residency at
    all) -- **unverified** for the other six named plans, whose current stage this
    hardening pass could not confirm.
  - Impact: HIGH -- a false forgery revert on a legitimately human-approved plan is a
    confusing, alarming signal that directly damages trust in the gate system this
    plan is trying to protect.
  - Mitigation: Before migrating each affected plan, check its actual current stage;
    for any plan in `todo/` or `done/`, update its ledger entry's stored hash
    atomically with the file rewrite, in the same migration step, never leaving the
    two out of sync even transiently.

- **Risk:** `stale-detector.extractFrontmatterRegion` (the shared merge helper four
  independent readers already depend on) stops merging silently at the first
  malformed/unterminated leading block, so a single bad prepend anywhere in a plan's
  history would again hide every field after it from all four workarounds at once.
  - Likelihood: LOW -- this repository's atomic-write discipline
    (`atomicWriteFileSync`) makes a mid-write truncation unlikely going forward.
  - Impact: MEDIUM -- would recreate the exact symptom this plan fixes, on a subset of
    plans, with no loud signal that the merge stopped early.
  - Mitigation: FR-3's migration must name (report) any plan it could not fully merge,
    rather than silently accepting a partial merge as success.

### Business Risks

- **Risk:** The migration rewrites the bytes of plans a human already approved; if
  communicated poorly, this could read as "editing an approved plan without a new
  human decision," even though every field's value and the original approval decision
  are preserved unchanged.
  - Likelihood: LOW.
  - Impact: MEDIUM -- erodes trust in the gate's integrity guarantee if the human
    reviewing the migration cannot see exactly what changed and what did not.
  - Mitigation: State plainly, in the migration's own report and in the Gate-1
    approval request for the implementation plan, exactly which bytes change
    (frontmatter block layout only) and which do not (every field value, and the
    human's original approval decision).

### Dependency Risks

- **Risk:** This plan edits the human-gate approval path itself. Per this project's
  own self-improvement rule, hook/gate-logic changes require explicit human approval
  through the full pipeline -- no escape phrase, no shortcut.
  - Likelihood: HIGH -- by design; this is the rule operating correctly, not a
    surprise blocker.
  - Impact: LOW -- an expected, planned gate, already named in the original stub's
    Constraints.
  - Mitigation: Route this plan through the full Iron Loop; do not let it cross Gate 1
    without an explicit human review of the merge algorithm's data-preservation
    design (see the Technical Risk above).

---

## Open decision for the gate

**Migration scope.** Fix the stamping only, or fix the stamping **and** migrate the
~9 already-corrupted plans? Recommendation: **both** -- a fix that leaves nine plans
with unreadable-through-the-primitive `files:` is half a fix, and those plans are the
ones most likely to re-enter the build. This hardening pass adds one concrete
consideration for whichever way the human decides: if "migrate" is chosen, the
migration must be **ledger-hash-aware** for any of the nine that turn out to be
resident in `todo/` or `done/` (unverified for six of the nine by this pass -- their
current stage should be confirmed before Implementation Planning scopes the
migration), because rewriting those plans' bytes without also updating their ledger
entry would revert a legitimate approval as an apparent forgery. This does not change
the recommendation; it changes what "migrate" has to include to be safe. Stated here
for the human's Gate-1 call, not decided.

---

*Follows the CTOC Iron Loop (Steps 1-3: ASSESS, ALIGN, CAPTURE). Awaiting the human's
Gate-1 approval before technical planning.*
