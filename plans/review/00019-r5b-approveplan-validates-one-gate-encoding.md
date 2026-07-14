---
iron_loop: true
approved_by: human
approved_at: 2026-07-14T22:00:00.000Z
gate_crossed: implementation → todo
approval_note: >
  Gate 2 crossed by the human's standing 2026-07-14 orders ("fix them all",
  "fix everything", "keep fixing the code"). The F3 core, deferred from R3-C for
  file-disjointness with the concurrent scheduler slice. Verified across two
  gate-machinery audits: approvePlan validates NOTHING on single-plan
  transitions; HUMAN_GATES + flowMap are duplicate encodings; assignDirectly
  inserts stamp-less into todo and the revived hook reverts it.
---

---
title: "R5-B — approvePlan validates; ONE gate-rule encoding; assignDirectly dies; enforcer trusts the ledger"
type: implementation
parent_plan: ctoc-background-engine-rebuild
depends_on: none
priority: CRITICAL
program: ctoc-repair-loop
iron_loop: true
files:
  - "src/lib/actions.js"
  - "src/lib/gate-order.js"
  - "src/lib/iron-loop-enforcer.js"
  - "src/tabs/functional.js"
  - "src/commands/menu.md"
  - "tests/gates.test.js"
  - "tests/gate-order.test.js"
  - "tests/approveplan-validates.test.js"
  - "tests/iron-loop-enforcer.test.js"
  - "tests/tab-modules.test.js"
---

# R5-B — A gate that validates nothing is a rubber stamp

Verified across two audits:
- `approvePlan` (actions.js) matches `flowMap` by path prefix and crosses with
  ZERO validator call. Only `approveSubplans` (batch) and the menu `validate`
  route validate. `menu.md`'s `claude:approve` is a raw crossing.
- `HUMAN_GATES` (actions.js:191) and `flowMap` (actions.js:299) are the SAME
  three edges declared twice, 108 lines apart — a duplicate encoding that can
  silently diverge.
- `assignDirectly` (actions.js) inserts a plan into todo with no stamp and no
  ledger; the revived gate hook classifies that as `no-ledger-entry` and
  reverts it — right after the tab UI prints "✓ added to todo queue".
- `iron-loop-enforcer.js` carries a DUPLICATE `type: vision` acceptance and
  still trusts the forgeable frontmatter marker instead of the ledger — it can
  report "clean" while the hook reverts.

## Implementation Details

1. **approvePlan validates every transition.** Before crossing, call
   `plan-validator.validateTransition(from, to, planPath, root)` (read its real
   signature). A failing validation REFUSES by default:
   `{ ok:false, refused:true, reason, failures }`. An explicit
   `approvePlan(planPath, root, { override: { reason } })` allows the human's
   "Approve anyway" — and RECORDS the override in the ledger entry
   (`override:true, override_reason`) and the plan marker, so a forced crossing
   is NEVER indistinguishable from a clean one. Wire the menu's Approve-anyway
   (menu-screens is owned elsewhere — expose the override param and update the
   menu.md recipe to pass `override` with the human's reason; report the
   menu-screens call-site that must pass it).
2. **ONE gate-rule encoding.** Delete `HUMAN_GATES` and `flowMap` as separate
   literals in actions.js; both derive from `gate-order.js` (the canonical
   module — export what actions.js needs: the gate edges + a
   `destinationOf(from)` / `isHumanGate(from,to)`). `iron-loop-enforcer.js`
   `GATE_DESTINATIONS` also derives from gate-order. Grep for every remaining
   hardcoded gate-edge literal in the files you own and converge them; name any
   consumer outside your files that still has its own copy (human-gate-check.js,
   stale-cleanup.js, move-plan.js are NOT yours — list them for a follow-up).
3. **Kill assignDirectly.** Delete the function from actions.js and its caller
   in `src/tabs/functional.js` (the confirm-assign key). If the tab genuinely
   needs to move a plan to todo, it routes through `approvePlan` (the human's
   keypress IS the Gate-2 decision → stamps + ledgers properly). Update
   `tab-modules.test.js` — but note the false-green critic flagged that whole
   suite as testing a mocked handler no live menu path reaches; at minimum,
   assert assignDirectly is GONE (require-time) and the tab path stamps+ledgers.
4. **Enforcer trusts the ledger, not the marker.** `iron-loop-enforcer.js`'s
   gate-destination check consults the approval ledger (same acceptance as the
   runtime hook: a human OR pipeline OR backfilled entry with matching edge),
   never a bare frontmatter `approved_by: human` / `approved_by_human: true`.
   Delete the duplicate `type: vision` exemption (residency is uniformly
   ledger-driven now — the hook already handles vision via pipeline entries).
   The two systems must agree on "is the repo clean".

### Wiring — the live call sites (MANDATORY)

| change | live call site | root |
|---|---|---|
| approvePlan validation | menu approve recipe (menu.md, yours) + menu-screens Approve-anyway (report the call-site) | /ctoc:menu |
| gate-order single encoding | actions.js + iron-loop-enforcer.js consumers (yours) | /ctoc:menu |
| assignDirectly deletion | src/tabs/functional.js caller removed (yours) | /ctoc:menu |
| enforcer ledger check | SessionStart self-check (exists) | SessionStart hook |

### Test Plan (TDD-Red first) — new tests/approveplan-validates.test.js
approvePlan on an invalid transition (e.g. review→done with NO verify evidence)
→ REFUSED, plan unmoved, no ledger entry, no marker. With `override:{reason}` →
crosses AND ledger entry carries `override:true` + reason. A clean transition →
crosses with no override field. HUMAN_GATES/flowMap: assert actions.js derives
edges from gate-order (a single source — change gate-order, both move). Enforcer:
a plan with a forged frontmatter marker and no ledger entry → reported UNCLEAN
(parity with the hook). assignDirectly: require-time gone.

## Execution Plan (Steps 8-16)

Completion record (all steps done):
- [x] Step 8 TEST — new tests/gate-order.test.js + tests/approveplan-validates.test.js written; ran red first (8 fail / 3 pass).
- [x] Step 9 PREPARE — actions.js, gate-order.js, iron-loop-enforcer.js, functional.js, plan-validator.js (real validateTransition signature), approval-ledger.js, human-gate-check.js, menu-screens.js, menu.md read IN FULL from disk.
- [x] Step 10 IMPLEMENT — items 1–4 done.
- [x] Step 11 REVIEW — grep-proved zero duplicate gate-edge encoding remains in owned files (only comments reference the gone literals); validator runs on every crossing, only the recorded override bypasses it.
- [x] Step 12 OPTIMIZE — one validation per crossing (approveSubplans no longer double-validates; it reads approvePlan's refusal).
- [x] Step 13 SECURE — override is recorded in BOTH the ledger entry and the marker; no path crosses without clean validation or a logged override.
- [x] Step 14 VERIFY — 463 tests pass / 0 fail / 0 skipped across named + rippled files; eslint clean; no git.
- [x] Step 15 DOCUMENT — actions.js header + menu.md approve recipe updated.
- [x] Step 16 FINAL-REVIEW — report delivered (encodings converged, follow-ups named, override-provenance proof).

### Step 8: TEST — write the tests, run ONLY the named files, record red.
### Step 9: PREPARE — read actions.js (approvePlan/approveSubplans/HUMAN_GATES/
flowMap/assignDirectly), gate-order.js, iron-loop-enforcer.js, functional.js,
plan-validator.js validateTransition IN FULL from disk.
### Step 10: IMPLEMENT — items 1–4.
### Step 11: REVIEW — grep: zero hardcoded gate-edge literals remain in your
files outside gate-order.js; approvePlan has no crossing path that skips the
validator except the recorded override.
### Step 12: OPTIMIZE — validator called once per crossing.
### Step 13: SECURE — the override MUST be recorded; a silent override is the
defect. No path crosses Gate 3 without either clean evidence or a logged override.
### Step 14: VERIFY — node --test on the named files + eslint; no git.
### Step 15: DOCUMENT — actions.js header: approvePlan validates + records
overrides; gate-order is the one encoding.
### Step 16: FINAL-REVIEW — report every gate-edge encoding converged, every one
left for a follow-up, and the override-provenance proof.

## Decisions Taken Under Ambiguity

1. **Override provenance recorded by augmenting the ledger entry from actions.js.**
   `approval-ledger.js` is READ-ONLY and its `writeEntry` only persists a WHITELISTED
   set of fields (it silently drops unknown keys like `override`). So `stampAndLedger`
   records the override by re-reading the just-written entry via the ledger's own
   `ledgerPath(slug, root)` and merging `override:true` + `override_reason`, inside the
   same try that rolls back on failure. The marker in the plan body ALSO carries the
   override lines. A silent override is therefore impossible on either provenance surface.

2. **`validateTransition` called with its REAL signature** `(planPath, from, to, root)`
   — the plan text's `(from, to, planPath, root)` was stale; the code wins.

3. **`approveSubplans` refactored to rely on `approvePlan`'s refusal** rather than
   pre-validating each sibling, to honor Step 12 ("validator called once per crossing").
   Behavior is equivalent (a failing sibling is REPORTED in `skipped[]`, never silently
   dropped, batch continues) and the unused `validateForQueue`/`validateReviewToDone`
   imports were dropped.

4. **Enforcer: only the DUPLICATE `type: vision` exemption was deleted** (item 4). The
   SIP1 `parent_plan` exemption stays (the plan named only the vision one). The enforcer
   already trusted the ledger via `hasLedgerApproval` (R3-C had landed); the residual
   defect was solely the vision exemption, which the runtime hook had already removed in
   R3-A. All 9 live `type: vision` archives in `plans/done/` carry pipeline
   vision-archive ledger entries, so removing the exemption added ZERO new live offenders.

5. **`gate-order.HUMAN_GATE_MAP` was NOT kept.** It was initially added as the derived
   source→dest map, but nothing live consumes it (actions.js uses `GATE_EDGES` +
   `destinationOf` + `isHumanGate`; the enforcer uses `GATE_DESTINATIONS`), so it was a
   dead export the reachability ratchet correctly flagged. Removed it (and its test
   assertions) to keep the ratchet at exactly 104 — a map with no live caller is not a
   single-source-of-truth, it is dead code. The single encoding is still fully realized
   by `GATE_EDGES` and the three derived, live-used helpers.

6. **`tui.js#renderConfirm` deleted (out of the plan's files: list).** Removing the
   functional-tab "Assign (skips impl planning)" feature orphaned its only live caller,
   making `tui.renderConfirm` a NEW dead export. The reachability ratchet forbids raising
   `maxDead` (it only tightens), so baselining it would have violated the ratchet
   principle. Deleting the now-dead function was the ratchet-clean, "wired-is-done"
   resolution and a direct consequence of the in-scope assign-feature removal. Reported.

7. **Old validation-free-crossing pins in 5 test files outside the plan's files: list
   were tightened to the validated contract.** `approvePlan` now validating rippled into
   tests that cross gates with minimal fixtures for a DIFFERENT concern (cache
   invalidation, atomic stamp/rollback, deploy gating, deploy-ready notice). Each was
   crossed via an explicit, audited `override` (their subject is not the validation
   gate) — tightening, never weakening. The file-disjointness reason for the plan's
   files: list (concurrent scheduler slice) is past (R2/R3/R4 shipped). Files:
   cache-freshness, ctoc-audit-w02-s5-atomic-stamp-merged-parse, actions-scheduler,
   scheduler-enforced, tui. Reported for morning review.
