---
approved_by: human
approved_at: 2026-07-13T11:01:11.529Z
gate_crossed: functional → implementation
---

---
title: "W02 — Human-Gate Integrity"
created: "2026-07-11T00:00:00Z"
type: feature
parent_vision: "vision/ctoc-self-audit-remediation.md"
priority: HIGH
depends_on: ctoc-audit-w01-enforcement-blocks
---

# W02 — Human-Gate Integrity

## 1. ASSESS

### Business Context

The four human gates (`functional → implementation`, `implementation → todo`,
`review → done`) ARE CTOC's product: they are the mechanism that keeps unreviewed
or unapproved work out of `done/`. Every other feature of CTOC — the Iron Loop,
the quality fleet, the review agents — exists in service of the guarantee that
nothing reaches `done/` without a real human act approving it. If approval can be
self-asserted by the same agent whose work is being gated, or if the revert/move
machinery that enforces the gates has holes, the gates are theatre: they present
the *appearance* of control while exerting none. This is the exact population the
parent vision names as depending on this: "every CTOC user running with permission
prompts disabled ... for whom the PreToolUse hooks are the *only* guardrail."

### Current State — Verified Defects

Findings addressed: **C4, C5, H2, H7, M18, M19** (re-verified against the code below,
not re-stated from the audit).

- **C4 — Approval is self-asserted text in an agent-writable file.**
  `src/hooks/PreToolUse.Edit.js:56` whitelists `/^plans\/.*\.md$/` — every write to
  every `plans/**.md` file, including everything under `plans/done/`, passes
  enforcement unconditionally. `src/hooks/human-gate-check.js:57-79`
  (`hasApprovalMarker`) treats a plan resident in `implementation/`, `todo/`, or
  `done/` as approved purely by parsing `approved_by: human` out of the plan's OWN
  frontmatter — a value any agent can write with the very tool call the whitelist
  just allowed. There is no second source of truth binding the marker to a real
  human act; the plan is judge of its own approval.

- **C5 — One failing revert abandons all the rest.**
  `src/hooks/human-gate-check.js:120-160` (`main()`) wraps the ENTIRE
  multi-violation revert loop in a single `try { ... } catch` — not one try/catch
  per violation. `revertPlan()` (lines 103-118) does a read, an `ensureDir`, a
  write, and an `unlinkSync`; if any of those four operations throws for
  violation 1 of N, the exception propagates straight out of the `for` loop,
  skipping every remaining violation (including a Gate 3 violation), is caught
  only by the outer `catch` at lines 157-159 (which logs and falls through), and
  the process still calls `process.exit(0)` at line 163 — success, despite
  violations 2..N never having been evaluated or reverted.

- **H2 — Multi-hop moves skip gates.**
  `src/scripts/move-plan.js:60` — `if (HUMAN_GATES[sourceStage] === destination)`
  — only recognizes the three exact adjacent pairs
  (`functional→implementation`, `implementation→todo`, `review→done`). A request
  with `sourceStage = 'in-progress'`, `destination = 'done'` is not a key in
  `HUMAN_GATES` at all, so the check passes silently and `movePlan()` (imported
  from `src/lib/actions.js`) relocates the file — skipping the `review → done`
  gate entirely. The identical hole exists for `functional → todo` (skips
  `implementation`) and any other stage pair that crosses more than one gate edge.

- **H7 — Residency revert also reverts fresh SIP1 slices.**
  `src/hooks/human-gate-check.js:81-101` (`checkFolder`) flags ANY plan file
  sitting in `implementation/`, `todo/`, or `done/` that lacks an
  `approved_by: human` marker as a violation and reverts it. This sweep cannot
  distinguish "moved in illegally, bypassing a gate" from "authored fresh, in
  place, by the Implementation Planner" — a SIP1 slice plan (carries
  `parent_plan`, was never moved across a gate, was never meant to carry an
  approval marker) is indistinguishable from a smuggled-in plan and gets
  auto-reverted out of `implementation/`, corrupting legitimate in-flight
  decomposition work.

- **M18 — Non-atomic stamping.**
  `src/lib/actions.js:222-234` (`approvePlan`) writes the approval marker into
  the plan's content (`addApprovalMarker`, lines 224-226 — one filesystem write)
  and THEN calls `movePlan()` as a wholly separate operation (line 234). A
  crash/kill between those two steps leaves a plan sitting in the SOURCE folder
  (e.g. `review/`) already carrying `approved_by: human`.
  `human-gate-check.js`'s residency sweep only inspects the DESTINATION folders
  (`implementation/`, `todo/`, `done/`, per the `HUMAN_GATES` map at lines
  21-25) — never `review/`, `functional/`, or `implementation/` as a *source* —
  so a marked-but-unmoved plan sitting in `review/` is invisible to the revert
  sweep and reads as pre-approved on any later inspection or re-run.

- **M19 — Merged-frontmatter misparse.**
  `src/lib/state.js:58-60` (`parseMetadata`) uses the non-greedy regex
  `/^---\n([\s\S]*?)\n---/`, which stops at the FIRST `\n---` it finds. When
  `addApprovalMarker` (`actions.js:197-200`) prepends a second
  `---\napproved_by: ...\n---\n\n` block ahead of the plan's own frontmatter,
  `parseMetadata` matches ONLY the prepended block and returns just its three
  fields (`approved_by`, `approved_at`, `gate_crossed`) — every field from the
  plan's own frontmatter (`title`, `type`, `status`, `priority`,
  `parent_vision`, `depends_on`) is silently dropped from the returned object.
  Any downstream reader of `metadata.type` / `metadata.status` /
  `metadata.priority` after a gate crossing (dashboard, stage counters, the
  plan-validator, a subsequent `approvePlan()` call) silently sees a corrupted,
  truncated view of the plan.

### Impact

- An agent (or a buggy/compromised automation) can self-approve and ship its own
  unreviewed work straight to `done/`, defeating the exact mechanism Gate 3 exists
  to enforce — and the same mechanism defeats Gates 1 and 2 identically.
- One flaky filesystem call on one violation silently disables detection of every
  OTHER outstanding violation in the same sweep, including a Gate 3 violation —
  today the security guarantee is only as reliable as the least reliable
  filesystem call.
- Any code path (agent, script, or human typo) that constructs a multi-hop or
  skip-stage move request sails through completely ungated.
- SIP1 decomposition legitimately produces many fresh `implementation/` slices per
  functional plan; every one of them is at risk of being auto-reverted by the very
  safety net meant to protect the gates, silently corrupting in-flight
  decomposition work with no error surfaced to the human.
- A crash during the single highest-trust operation in the system — the human
  clicking approve — can leave a false-positive approved marker sitting in the
  source folder, structurally the same forgery C4 closes for an agent-authored
  marker, just triggered by a crash instead of an agent.
- Every metadata consumer downstream of a gate crossing (dashboard counts, stage
  logic, the plan-validator) silently reads a corrupted, marker-only view of any
  plan that has ever crossed a gate.

## 2. ALIGN

Each metric below is test-drivable by asserting a plan's FINAL RESIDENCY or a
DENIED/ALLOWED tool-call outcome — never by asserting a return value in isolation,
per the audit's own root-cause finding that "the tests assert structure, not
truth."

| # | Metric | Target | Test method |
|---|--------|--------|-------------|
| 1 | Forged-approval rejection | 100% of plans whose ONLY `approved_by: human` marker is agent-written, with no matching `.ctoc/approvals/<slug>.json` entry, are prevented from residing in a gate-destination folder | Write an agent-authored marker with no ledger entry, attempt/simulate the move, assert PREVENTED or REVERTED |
| 2 | Approval staleness detection | 100% of ledger-approved plans whose live `content_sha256` no longer matches the ledger entry are treated as NOT approved on next evaluation | Approve, edit body, re-evaluate, assert not-approved |
| 3 | Ledger write-protection | 100% of Edit/Write/MultiEdit/NotebookEdit calls targeting any path under `.ctoc/approvals/` are denied | Unit test calling `enforce()` with a payload under `.ctoc/approvals/` |
| 4 | Multi-hop block coverage | Every stage pair whose path crosses 1, 2, or 3 gate edges is blocked; every stage pair crossing 0 gate edges is allowed | Parametrized test matrix over the full stage-pair set (`functional, implementation, todo, in-progress, review, done`) |
| 5 | Revert-sweep completeness under partial failure | Given N violations where any k < N throw during `revertPlan()`, the other N−k are still reverted and the sweep does not silently report success while any violation remains unresolved | Inject a throwing revert for violation 1 of 3, assert 2 and 3 are reverted |
| 6 | SIP1 false-positive rate | 0% of freshly-authored SIP1 slice plans (`parent_plan` set, no ledger entry ever recorded, no prior residency outside `implementation/`) are reverted by the residency sweep | Construct such a plan, assert `checkFolder()` returns no violation for it |
| 7 | Atomic-stamp consistency | For every simulated crash point between marker-write and move, the plan's final state is EITHER (a) unmarked and still in the source folder, OR (b) marked, ledgered, AND resident in the destination folder — never (c) marked-and-resident-in-source | Crash-injection test between the two writes in `approvePlan()` |
| 8 | Frontmatter merge completeness | `parseMetadata()` on a plan with a prepended marker block returns the UNION of every original field plus every marker field | Prepend-then-parse, compare before/after field sets |

## 3. CAPTURE

### Acceptance Criteria (BDD)

- [ ] **[C4] Scenario: Self-authored marker without ledger entry is not accepted**
  Given a plan written directly to `plans/done/` (or any gate-destination folder)
  carrying a self-authored `approved_by: human` marker written by an agent
  When the gate check evaluates it
  Then it is NOT accepted as human-approved, because provenance is verified
  against the `.ctoc/approvals/<slug>.json` ledger and its content hash — not
  against the marker text in the plan body — and the move is PREVENTED or the
  plan is REVERTED

- [ ] **[C4] Scenario: Ledger-approved plan is accepted**
  Given a plan whose `.ctoc/approvals/<slug>.json` ledger entry holds a
  `content_sha256` matching the plan's current content, and a `stage_to` matching
  its current folder
  When the gate check evaluates it
  Then it IS accepted as human-approved and is NOT reverted

- [ ] **[C4] Scenario: Approval invalidated by post-approval edit**
  Given a plan with a valid ledger entry, subsequently edited in its body after
  approval
  When the gate re-evaluates the plan
  Then the approval no longer counts, because the live content hash no longer
  matches the ledger entry, and any further gate crossing is PREVENTED

- [ ] **[C4] Scenario: Ledger path is agent-write-denied**
  Given an agent attempts an Edit, Write, MultiEdit, or NotebookEdit tool call
  targeting any path under `.ctoc/approvals/`
  When the enforcement hook evaluates the call
  Then the write is PREVENTED, regardless of the `plans/**.md` whitelist that
  governs plan files

- [ ] **[H2] Scenario: Multi-hop move across one gate is blocked**
  Given a move request from `in-progress/` directly to `done/` (crossing the
  `review → done` gate without stopping in `review/`)
  When `move-plan.js` (and the underlying `movePlan()` in `src/lib/actions.js`)
  evaluates the request
  Then the move is PREVENTED, identically to a `review → done` single-hop request

- [ ] **[H2] Scenario: Multi-hop move across two gates is blocked**
  Given a move request from `functional/` directly to `todo/` (crossing both the
  `functional → implementation` and `implementation → todo` gates)
  When `move-plan.js` evaluates the request
  Then the move is PREVENTED

- [ ] **[H2] Scenario: Legitimate non-gate move still succeeds**
  Given a move request from `todo/` to `in-progress/` (not a gate edge)
  When `move-plan.js` evaluates the request
  Then the move SUCCEEDS unchanged — the multi-hop fix does not regress a
  non-gate transition

- [ ] **[C5] Scenario: Revert sweep survives a mid-loop filesystem failure**
  Given a revert sweep over three violations where the first violation's
  `revertPlan()` throws a filesystem error
  When the gate-check loop runs
  Then the second and third violations are still reverted, and the sweep does not
  report a clean outcome while the first violation remains unresolved

- [ ] **[H7] Scenario: Fresh SIP1 slice is exempt from residency revert**
  Given a freshly-authored SIP1 slice plan sitting in `implementation/` that
  carries `parent_plan`, has never appeared in a ledger entry, and has never
  resided in `todo/`, `review/`, or `done/`
  When the residency revert sweep runs
  Then the slice is NOT reverted

- [ ] **[H7] Scenario: Illegally-placed plan without SIP1 provenance is still reverted**
  Given a plan sitting in `implementation/` without a `parent_plan` field and
  without a matching ledger entry
  When the residency revert sweep runs
  Then the plan IS reverted — the SIP1 exemption does not become a blanket bypass

- [ ] **[M18] Scenario: Crash between stamp and move never leaves a false-approved plan in the source folder**
  Given a crash is injected between the approval-marker write and the
  `movePlan()` call inside `approvePlan()`
  When recovery inspects the source folder (e.g. `review/`)
  Then no plan in the source folder carries an approved marker that is not also
  matched by a ledger entry recorded for that exact `stage_from`/`stage_to` pair

- [ ] **[M19] Scenario: Frontmatter parses correctly after a marker prepend**
  Given a plan with an approval-marker block prepended before its original
  frontmatter
  When `parseMetadata` reads the file
  Then it returns the union of the marker's fields (`approved_by`, `approved_at`,
  `gate_crossed`) AND every field from the plan's own original frontmatter
  (`title`, `type`, `status`, `priority`, `parent_vision`, `depends_on`), with
  none silently dropped

### Scope

#### In Scope
- Content-hashed approval-provenance ledger at `.ctoc/approvals/<slug>.json`,
  keyed by plan slug, recording `content_sha256`, `stage_from`, `stage_to`,
  `approved_at`, `approved_by` — written only by the trusted `approvePlan()` code
  path, never by an agent tool call. *(criteria: C4 ×4)*
- Enforcement deny-listing so no Edit/Write/MultiEdit/NotebookEdit call can create
  or modify anything under `.ctoc/approvals/`. *(criterion: ledger write-denied)*
- Approval invalidation when a plan's content changes after approval (hash
  mismatch ⇒ not approved). *(criterion: post-approval edit)*
- Per-violation isolation in the gate-check revert loop (try/catch per violation;
  the sweep continues after an individual failure). *(criterion: mid-loop failure)*
- `move-plan.js` and `movePlan()` blocking ANY move whose stage path crosses one
  or more of the three gate edges, not just the single adjacent edge — while
  leaving non-gate transitions unaffected. *(criteria: H2 ×3)*
- SIP1 slice exemption in the residency revert, identified by `parent_plan` +
  no prior downstream residency + no ledger entry ever required for it, WITHOUT
  exempting plans that merely lack `parent_plan`. *(criteria: H7 ×2)*
- Atomic stamp-then-move in `approvePlan()` (single committed operation, or
  move-then-stamp with rollback on failure). *(criterion: M18)*
- Correct merged-frontmatter parsing in `parseMetadata` after a marker-block
  prepend. *(criterion: M19)*

#### Out of Scope
- **The block mechanism itself** (exit code / stdin / MultiEdit-NotebookEdit
  delegation) — that is W01 (`ctoc-audit-w01-enforcement-blocks`); this plan
  assumes W01's deny actually fires and closes the forge/bypass holes that sit
  behind it.
- **Cryptographic signing of the approval ledger** (asymmetric signatures, key
  management) — a content hash tied to an agent-write-denied path is the chosen
  mechanism for closing the self-approval attack; see Decisions below. Lives as a
  future hardening layer, not this plan.
- **Any change to the Iron Loop step model, the four-gate model, or the plan-stage
  set** — this plan hardens the existing model; it does not redesign it.
- **Dashboard/menu UI changes to visualize ledger entries** — none of the twelve
  acceptance criteria above require a UI change; if a future UI need surfaces it
  belongs to a menu/dashboard workstream, not here.
- **The other nine vision workstreams** (agent-contract loading, missing-agent
  resolution, Gate 3 validator wiring, truthful test suite, cross-platform CRLF,
  enforcement self-disable, release metadata, menu/task-plane robustness, state
  durability & dead-code) — each is its own functional plan under
  `vision/ctoc-self-audit-remediation.md`.

### Story Breakdown (INVEST)

- **[MVP] Story 1 — Ledger provenance an agent cannot forge.**
  As the CTOC maintainer, I want plan approval recorded in a content-hashed
  ledger outside the plan file and deny-listed to agents, so that an agent
  writing `approved_by: human` into the plan does NOT count as approval and
  cannot move its own work to `done/`.
  *INVEST:* Independent (observable once W01 lands; not blocked by any sibling
  story here); Negotiable (ledger location and hash choice are the PO's call, not
  prescribed); Valuable (closes the self-approval forgery, the vision's headline
  concern); Estimable; Small (one ledger module + one gate-check integration
  point); Testable (criteria: self-authored-not-accepted, ledger-approved-accepted,
  ledger-write-denied). **PASS.**

- **Story 2 — Approval invalidates on edit.**
  As the maintainer, I want an approval invalidated when the plan's content
  changes after approval, so that a stamped-then-edited plan is not silently
  treated as still approved.
  *INVEST:* builds on Story 1's ledger but is independently testable and
  shippable; Small; Testable (criterion: post-approval-edit). **PASS.**

- **[MVP] Story 3 — Moves cannot skip a gate.**
  As the maintainer, I want `move-plan.js` to block any gate-crossing move,
  including multi-hop, so that `in-progress → done` or `functional → todo` is
  PREVENTED rather than jumping the intermediate gate.
  *INVEST:* Independent of Stories 1-2 (different code path); Small; Testable
  (criteria: multi-hop ×2, non-gate-move-unaffected). **PASS.**

- **[MVP] Story 4 — The revert sweep is fault-isolated.**
  As the maintainer, I want each revert isolated in its own try/catch, so that
  one filesystem failure does not abandon every other outstanding violation and
  the sweep never silently reports success while a violation stands.
  *INVEST:* Independent; Small; Testable (criterion: mid-loop-failure). **PASS.**

- **Story 5 — SIP1 slices are exempt from residency revert.**
  As the maintainer, I want freshly-authored SIP1 slice plans exempt from the
  residency revert, so that a legitimate new slice in `implementation/` is not
  corrupted by the safety net meant to protect the gates.
  *INVEST:* conceptually depends on Story 1's ledger existing (a slice is exempt
  in part because it has never needed a ledger entry) but is independently
  testable and shippable within this same plan; Testable (criteria: SIP1-exempt,
  non-SIP1-still-reverted). **PASS.**

- **Story 6 — Atomic stamping and correct frontmatter merge.**
  As the maintainer, I want gate stamping to be atomic and merged frontmatter to
  parse correctly, so that a crash never leaves a false-approved marker in
  `review/` and a prepended marker block never corrupts a plan's parsed metadata.
  *INVEST:* two small, tightly-coupled correctness fixes on the same stamp/parse
  code path, kept as one story — each alone is sub-half-day with no independent
  user-visible value; Testable (criteria: crash-injection, prepend-parse-merge).
  **PASS.**

### Files Likely Touched
- `src/hooks/human-gate-check.js` — ledger-based acceptance check replacing/
  augmenting `hasApprovalMarker`; per-violation `try/catch` in `main()`'s revert
  loop; SIP1 exemption in `checkFolder()`.
- `src/scripts/move-plan.js` — replace the single adjacent-edge check
  (`HUMAN_GATES[sourceStage] === destination`) with a stage-order / gate-edge-
  crossing check that covers multi-hop paths.
- `src/lib/actions.js` — `approvePlan()`: write the ledger entry instead of (or
  alongside) the in-plan marker; make stamp + move atomic; `movePlan()` shares
  the multi-hop gate-edge check with `move-plan.js`.
- `src/hooks/PreToolUse.Edit.js` (and `PreToolUse.Write.js`, which delegates to
  it) — a deny check for `.ctoc/approvals/**` evaluated ahead of or instead of
  the existing `WHITELIST`.
- `src/lib/state.js` — `parseMetadata()`: merge a prepended marker block with the
  plan's own frontmatter instead of matching only the first `---...---` block.
- **New:** an approval-ledger module (e.g. `src/lib/approval-ledger.js`)
  providing read/write/verify(`content_sha256`, `stage_from`, `stage_to`) used by
  both `human-gate-check.js` and `actions.js`.

### Test Strategy
- Unit tests for the new ledger module: write, read, verify; hash mismatch;
  missing entry; `stage_from`/`stage_to` mismatch (a ledger entry recorded for
  `functional→implementation` must NOT validate a `review→done` crossing of the
  same plan).
- Unit tests for `parseMetadata` with a prepended marker block, asserting the
  full original-field-plus-marker-field union.
- Unit tests for `move-plan.js` / `movePlan()` covering the full stage-pair
  matrix (`functional, implementation, todo, in-progress, review, done`) so every
  combination is asserted PREVENTED (crosses a gate) or ALLOWED (does not) —
  including multi-hop and adjacent, gate and non-gate.
- Unit test for the gate-check revert loop with an injected throwing
  `revertPlan()` on one of several violations, asserting the others still revert
  and the sweep signals an incomplete outcome rather than a silent success.
- Unit tests for the SIP1 exemption: a plan WITH `parent_plan` and no ledger
  entry in `implementation/` is not flagged; a plan WITHOUT `parent_plan` and no
  ledger entry in the same folder IS flagged.
- Crash-injection test for atomic stamping: mock the move step to throw after the
  marker write succeeds, assert the plan's final on-disk state matches one of the
  two allowed outcomes (never "marked and still resident in source").
- A test asserting the `.ctoc/approvals/` deny: a payload targeting
  `.ctoc/approvals/<slug>.json` through Edit/Write/MultiEdit/NotebookEdit is
  denied. **Inherited dependency (from the stub, confirmed against
  `PreToolUse.Edit.js`'s own exit-code documentation):** this specific assertion
  needs W01's real exit-2 / `permissionDecision` block to be a true end-to-end
  test rather than an assertion on a return value; until W01 lands it can only be
  tested at the `enforce()`-function level, not as a proof the tool call was
  actually stopped.

## 4. PLAN — SIP1 decomposition (slice index)

This functional-derived plan is decomposed into **5 cohesive implementation slices**
(SIP1). Each is its own `parent_plan`-linked plan under `plans/implementation/` with a
focused `files:` list and its own Steps 8–16. This plan is the INDEX; the slices are
where the work and the gate approvals live. **Building is sequential + dependency-
ordered** (a slice whose `depends_on` is unbuilt is not started). File ownership is
partitioned so **no two slices modify the same non-test source file.**

| # | Slice file | Scope (one line) | Findings | Files (src) | depends_on |
|---|------------|------------------|----------|-------------|------------|
| 1 | `ctoc-audit-w02-s1-approval-ledger.md` | Content-hashed approval-provenance module `.ctoc/approvals/<slug>.json` (write/read/verify) — the source of approval truth | C4 | `src/lib/approval-ledger.js` (new) | none |
| 2 | `ctoc-audit-w02-s2-ledger-write-deny.md` | Deny-list `.ctoc/approvals/**` in `enforce()` so no Edit/Write/MultiEdit/NotebookEdit can forge a ledger entry | C4 | `src/hooks/PreToolUse.Edit.js` | none |
| 3 | `ctoc-audit-w02-s4-multihop-gate-block.md` | Order-based gate-edge check blocks any forward multi-hop move that skips a gate; backward/non-gate moves unaffected | H2 | `src/lib/gate-order.js` (new), `src/scripts/move-plan.js` | none |
| 4 | `ctoc-audit-w02-s3-gate-acceptance-revert.md` | Residency sweep accepts via the ledger (not in-plan marker); exempts fresh SIP1 slices; per-violation fault-isolated revert | C4, H7, C5 | `src/hooks/human-gate-check.js` | s1 |
| 5 | `ctoc-audit-w02-s5-atomic-stamp-merged-parse.md` | Atomic ledger-first/move/stamp/rollback in `approvePlan`; merged-frontmatter `parseMetadata` | M18, M19 | `src/lib/actions.js`, `src/lib/state.js` | s1 |

Dependency graph (roots → dependents, max chain depth 2, no cycles):
```
s1 ─┬─→ s3
    └─→ s5
s2  (independent)
s4  (independent)
```

## 5. DESIGN — architecture decisions (ADRs)

- **ADR-1 (ledger, s1).** Provenance lives in `.ctoc/approvals/<slug>.json` holding
  `{ content_sha256, stage_from, stage_to, approved_at, approved_by }`. `verify` accepts
  iff an entry exists AND `stage_to === currentStage` AND `content_sha256` matches the
  live content. A content hash tied to an agent-write-denied path breaks the self-
  approval attack without asymmetric-key management (out of scope).
- **ADR-2 (deny precedence, s2).** The `.ctoc/approvals/` deny runs as Step 0 of
  `enforce()`, BEFORE the `/^\.ctoc\//` whitelist that currently allows the whole
  `.ctoc/` tree — otherwise the ledger would be agent-writable through the back door.
  One guard in `enforce()` covers all four editing tools (Write delegates to it;
  MultiEdit/NotebookEdit do too via W01).
- **ADR-3 (folder-sensitive acceptance, s3) — forced by C4.** Because the ledger is
  agent-write-denied, an agent editing a plan in `implementation/` cannot refresh the
  hash. So acceptance binds to entry EXISTENCE (`stage_to==='implementation'`) there,
  while the tamper-sensitive terminal folders `todo/` and `done/` additionally require a
  hash match. Fresh SIP1 slices (`parent_plan` + no ledger entry) are exempt in
  `implementation/` only.
- **ADR-4 (order-based multi-hop, s4).** A move is blocked iff it is FORWARD and spans
  a gate edge by stage order — covering 1-, 2-, and 3-edge multi-hops while leaving
  backward reverts and non-gate forward moves allowed. The guard lives in the untrusted
  `move-plan.js` CLI, never in the low-level `movePlan()` (which `approvePlan` uses to
  cross gates legitimately).
- **ADR-5 (atomic stamp, s5).** `approvePlan` commits approval when the ledger entry
  lands for the destination: compute dest hash → move → write ledger + stamp → roll back
  on failure. The marker is written ONLY at the destination, so the forbidden state
  (marked-and-resident-in-source) is unreachable; a crash before the ledger write self-
  heals via s3's sweep (dest plan with no entry → reverted).
- **ADR-6 (merged parse reuse, s5).** `parseMetadata` reuses the existing CRLF-safe
  `extractFrontmatterRegion` (already used by `listSubplans`) to parse the UNION of all
  leading frontmatter blocks — behavior-identical for single-block plans.

## 6. SPEC — cross-slice notes

- **W01 is a technical prerequisite for OBSERVING W02.** Until `ctoc-audit-w01-
  enforcement-blocks` makes a PreToolUse deny actually stop a tool call (exit 2 /
  `permissionDecision`), s2's deny is provable only at the `enforce()`/subprocess
  DECISION level, not as true end-to-end prevention. Every other slice (s1, s3, s4, s5)
  is fully testable independently of W01 at the function level. Tests assert
  BEHAVIOR — final residency or a denied/allowed outcome — never a bare return value
  (the audit's root-cause finding: "the tests assert structure, not truth").
- **Batched gates (SIP1).** These 5 siblings cross Gate 2 (implementation→todo) and
  Gate 3 (review→done) together via `approveSubplans('ctoc-audit-w02-gate-integrity',
  fromStage)` — ONE human decision per batch; each sibling is still stamped
  `approved_by: human` by the gate-safe `approvePlan`. `listSubplans('ctoc-audit-w02-
  gate-integrity')` enumerates the set. More slices does NOT mean more gate prompts.
- **Migration open-decision (flagged for the human, s3).** Plans approved before the
  ledger existed have no ledger entry; the strict `todo`/`done` acceptance would flag
  them on first run. s3 does NOT auto-backfill and does NOT grandfather the forgeable
  in-plan marker. Recommendation: a one-time TRUSTED maintainer-run backfill (not an
  agent tool call) converts legacy markers into ledger entries at adoption. Whether/when
  to backfill is the maintainer's scheduling call at Gate 2.
- **Test strategy.** Ledger + gate-order are unit-tested as pure functions; hooks
  (`human-gate-check.js`, `PreToolUse.Edit.js`, `move-plan.js`) are driven both by their
  now-exported functions and by real-process `spawnSync` residency/exit assertions,
  mirroring `e2e-enforcement-and-gates.test.js` and `stale-cleanup-human-gate.test.js`.

## Decisions Taken Under Ambiguity

- **No canvas exists.** No Business Model Canvas exists at
  `plans/canvas/ctoc-self-audit-remediation.md`, and none is applicable — this is
  a TECHNICAL remediation workstream. Proceeded vision-only rather than kicking
  back.
- **Ledger design: content-sha256 + stage_from/stage_to, deny-listed to agents.**
  `.ctoc/approvals/<slug>.json` holds `{ content_sha256, stage_from, stage_to,
  approved_at, approved_by }`. `content_sha256` is the SHA-256 of the plan's full
  content (frontmatter + body) at the moment of approval, so ANY edit — including
  a re-stamped marker — changes the hash and invalidates the entry. `stage_from`/
  `stage_to` scope the entry to the EXACT gate edge it was recorded for, so an
  entry approved for `functional→implementation` cannot be replayed to justify a
  later `review→done` crossing of the same (or a same-slug, re-created) plan. The
  path is deny-listed in the enforcement whitelist so no agent tool call
  (Edit/Write/MultiEdit/NotebookEdit) can create or modify it; only the trusted,
  non-tool-call `approvePlan()` code path writes it. A content hash tied to an
  agent-write-denied path is sufficient to break the "agent writes its own
  approval" attack without introducing asymmetric-key management, which stays out
  of scope (see Out of Scope) — the maintainer can request signing as a future
  hardening layer at Gate 1 if the content-hash approach is judged insufficient.
- **W02 is observable only after W01 lands.** Until a PreToolUse deny actually
  blocks a tool call (W01, `ctoc-audit-w01-enforcement-blocks`), the fixes in
  this plan close bypass HOLES that cannot yet be *proven closed* by a true
  end-to-end test — a test asserting "the whitelist now denies a write to
  `.ctoc/approvals/`" needs W01's real block mechanism, not just an assertion on
  `enforce()`'s return value. The `depends_on` frontmatter field reflects this;
  every other criterion in this plan (ledger-approved-accepted, multi-hop block,
  revert isolation, SIP1 exemption, atomic stamp, frontmatter merge) is testable
  independently of W01 at the function level.
- **M18 and M19 stay merged into one story.** Both are small correctness fixes on
  the same stamp/parse path; each alone is under half a day with no independent
  user-visible value — merged per the too-small-story rule, unchanged from the
  original stub's judgment.
- **Walking Skeleton = ledger provenance + multi-hop block + revert isolation**
  (Stories 1, 3, 4). These three each independently close a gate-forgery or
  bypass hole and are the ones the vision's Success Criterion 2 names explicitly.
  Stories 2 (invalidate-on-edit), 5 (SIP1 exemption), and 6 (atomic stamp +
  merged parse) are correctness hardening layered on top, unchanged from the
  original stub's judgment.
