---
title: "W02 — Human-Gate Integrity"
created: "2026-07-11T00:00:00Z"
type: stub
parent_vision: "vision/ctoc-self-audit-remediation.md"
priority: HIGH
status: stub
depends_on: ctoc-audit-w01-enforcement-blocks
---

# W02 — Human-Gate Integrity

## Problem

The four human gates can be forged or bypassed, and the revert machinery that is
supposed to catch a bypass is itself fragile. Verified defects:

- **C4 — Approval is self-asserted text in an agent-writable file.** `approved_by: human`
  is just YAML an agent can write, and the enforcement whitelist allows any write to
  `plans/**.md` including `plans/done/`. Nothing binds the marker to a real human act, so
  an agent can stamp its own approval and move its own work to done.
- **C5 — One failing revert abandons all the rest.** The gate-check revert loop has no
  per-item isolation: a single filesystem error on one revert throws out of the loop,
  skips every remaining revert (including Gate 3), and exits 0 — an unlucky filesystem
  silently disables the human gates.
- **H2 — Multi-hop moves skip gates.** `move-plan.js` only blocks the single adjacent
  gate edge, so a multi-hop move (e.g. `in-progress → done`, `functional → todo`) jumps
  over the intermediate gate entirely and is allowed.
- **H7 — Residency revert eats fresh SIP1 slices.** The residency revert also reverts
  freshly-authored SIP1 slice plans out of `implementation/`, because it cannot tell a
  legitimately new slice plan from a plan that was illegally moved in.
- **M18 — Non-atomic stamping.** Gate stamping is stamp-then-move: the `approved_by`
  marker is written, then the file is moved. A crash between the two steps leaves an
  approved marker sitting in `review/`, which later reads as pre-approved.
- **M19 — Merged-frontmatter misparse.** After a marker block is prepended to a plan,
  `parseMetadata` misreads the plan (it does not correctly merge the prepended marker
  block with the original frontmatter), corrupting downstream gate logic.

**Depends on W01:** until a PreToolUse deny actually blocks (W01), a bypass fix here
cannot be *observed* to fire — a test proving "the whitelist now denies a write to
`plans/done/`" needs W01's real block mechanism to be a true end-to-end test rather than
an assertion about a return value.

## Scope

**Fixes:**
- **Approval provenance outside the plan file (C4):** a content-hashed approval ledger at
  `.ctoc/approvals/<slug>.json` (recording the approved content hash), deny-listed to
  agents in the enforcement whitelist so agents cannot write it; a plan counts as approved
  only when a ledger entry matches its current content hash.
- **Per-violation isolation (C5):** wrap each revert in the gate-check loop in its own
  try/catch so one failure logs and continues; the loop reverts every other violation and
  never exits 0 on an incomplete sweep.
- **Multi-hop gate blocking (H2):** `move-plan.js` blocks ANY move whose path crosses a
  gate edge, including multi-hop moves — not just the single adjacent edge.
- **SIP1 exemption (H7):** exempt freshly-authored SIP1 slice plans (identified by
  `parent_plan` + not previously resident downstream) from the residency revert.
- **Atomic stamping (M18):** stamp-then-move becomes atomic (write to the destination
  with the marker as one committed operation, or move-then-stamp with rollback) so a crash
  never leaves an approved marker in `review/`.
- **Merged-frontmatter parse (M19):** `parseMetadata` correctly merges a prepended marker
  block with the original frontmatter.

**Does NOT touch:** the block *mechanism* (exit code / stdin / MultiEdit delegation) —
that is W01. W02 assumes deny works and closes the forge/bypass holes behind it.

## Story Map

**Goal:** A human gate cannot be forged, skipped, or silently disabled; approval is
provably tied to a human act on specific content.
- **Actor:** the CTOC maintainer (the human CTO) who relies on the four gates to keep
  unreviewed work out of `done/`.
- **Impact:** an agent cannot self-approve or move its own work past a gate, and a single
  filesystem error cannot disable the gates.
- **Success metric:** a test drives each bypass (self-stamped approval, multi-hop move,
  failing-revert-in-loop) and asserts the move is PREVENTED or fully reverted — proven by
  the plan's final residency, not by a return value.

### Activity 1: Approval provenance an agent cannot forge
- [ ] `[MVP]` As the maintainer, I want approval recorded in a content-hashed ledger
  outside the plan file and deny-listed to agents, so that an agent writing
  `approved_by: human` into the plan does NOT count as approval and cannot move work to
  done.
  - A plan is "approved" only when `.ctoc/approvals/<slug>.json` holds a hash matching the
    plan's current content; the whitelist denies agent writes to `.ctoc/approvals/`.
- [ ] As the maintainer, I want an approval invalidated when the plan content changes
  after approval, so that a stamped-then-edited plan is not treated as still approved.

### Activity 2: Moves cannot skip a gate
- [ ] `[MVP]` As the maintainer, I want `move-plan.js` to block any gate-crossing move
  including multi-hop, so that `in-progress → done` or `functional → todo` is PREVENTED
  rather than jumping the intermediate gate.

### Activity 3: The revert machinery is robust
- [ ] `[MVP]` As the maintainer, I want each revert isolated so one filesystem error does
  not abandon the rest, so that a failing revert on plan A still reverts plans B and C and
  the sweep never exits 0 while a violation stands.
- [ ] As the maintainer, I want freshly-authored SIP1 slice plans exempt from the
  residency revert, so that a legitimately new slice in `implementation/` is not reverted
  as if it were illegally moved in.
- [ ] As the maintainer, I want gate stamping to be atomic and merged-frontmatter to parse
  correctly, so that a crash never leaves an approved marker in `review/` and a prepended
  marker block does not corrupt the plan's parsed metadata.

## Rough acceptance criteria

- Given an agent that writes `approved_by: human` into a plan and moves it toward
  `plans/done/`, When the gates evaluate it, Then the move is PREVENTED because no matching
  ledger entry exists — the self-asserted marker is worthless.
- Given a valid ledger approval and then an edit to the plan's body, When the gate
  re-evaluates, Then the approval no longer counts (content hash mismatch) and a further
  gate crossing is PREVENTED.
- Given an agent write targeting `.ctoc/approvals/<slug>.json`, When the enforcement hook
  runs, Then the write is PREVENTED (ledger is deny-listed to agents).
- Given a move request `in-progress → done` (multi-hop across a gate), When `move-plan.js`
  runs, Then the move is PREVENTED — not just the single adjacent edge.
- Given a revert sweep over three violations where the first revert throws a filesystem
  error, When the gate-check loop runs, Then the other two are still reverted and the
  process does NOT exit 0 with a violation left standing.
- Given a freshly-authored SIP1 slice plan in `implementation/` (has `parent_plan`, never
  previously downstream), When the residency revert runs, Then the slice is NOT reverted.
- Given a crash injected between stamp and move, When recovery inspects `review/`, Then no
  plan in `review/` carries an approved marker (stamping was atomic).
- Given a plan with a marker block prepended before its original frontmatter, When
  `parseMetadata` reads it, Then it returns the correctly merged fields (title, stage,
  approval state), not `{}` or a truncated read.

## Findings addressed

C4, C5, H2, H7, M18, M19.

## INVEST status

- Ledger-provenance MVP story: Independent given W01, Valuable (forgery closed), Testable
  (self-stamp prevented). PASS.
- Approval-invalidation-on-edit story: builds on the ledger; Small, Testable (hash
  mismatch). PASS.
- Multi-hop-block MVP story: Independent, Valuable (skip closed), Small, Testable. PASS.
- Revert-isolation MVP story: Independent, Valuable (gates survive an FS error), Testable
  (partial-failure sweep). PASS.
- SIP1-exemption story: Independent, Valuable (no false revert), Testable (new slice kept).
  PASS.
- Atomic-stamp + merged-parse story: two tightly-coupled correctness fixes kept together
  (both are "a crash/prepend must not corrupt gate state"); Testable via crash-injection
  and prepend-parse. PASS — kept as one story because splitting yields sub-half-day slices
  with no independent user value.

## Decisions Taken Under Ambiguity

- No Business Model Canvas exists at `plans/canvas/ctoc-self-audit-remediation.md`, and
  none is applicable: this is a TECHNICAL remediation workstream. Proceeded vision-only
  rather than kicking back.
- Approval ledger location chosen as `.ctoc/approvals/<slug>.json` (as the vision
  suggests, "e.g. .ctoc/approvals/<slug>.json"), content-hashed rather than
  cryptographically signed — a content hash tied to a maintainer-only path is sufficient
  to break the "agent writes its own approval" attack without introducing key management,
  which is out of scope. The Product-Owner refinement can upgrade to signing if the
  maintainer wants it at Gate 1.
- M18 (atomic stamping) and M19 (merged-frontmatter parse) merged into one story: both are
  small correctness fixes on the same stamp/parse path, and each alone is under half a day
  with no independent user-visible value — merged per the too-small rule.
- Walking Skeleton = ledger provenance + multi-hop block + revert isolation: the three
  fixes that each independently close a gate-forgery/bypass hole and are observable via
  W01's real block. SIP1-exemption and atomic-stamp/parse are correctness hardening layered
  on top.
