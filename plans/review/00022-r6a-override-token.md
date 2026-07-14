---
iron_loop: true
approved_by: human
approved_at: 2026-07-15T00:00:00.000Z
gate_crossed: implementation → todo
approval_note: "Standing 2026-07-14 orders. R5-B flagged follow-up: the Approve-anyway menu option must carry the override reason so approvePlan records it — today it emits a bare claude:approve with no override, so a forced crossing is not auditable at the menu surface."
---

---
title: "R6-A — Approve-anyway emits the override token so a forced crossing is auditable"
type: implementation
parent_plan: ctoc-background-engine-rebuild
depends_on: none
priority: HIGH
program: ctoc-repair-loop
iron_loop: true
files:
  - "src/lib/menu-screens.js"
  - "tests/menu-screens.test.js"
---

# R6-A — The menu passes the human's override reason

`approvePlan(path, root, { override: { reason } })` (R5-B) records `override:true`
+ the reason in the ledger and marker. But `menu-screens.js:1680` still emits a
bare `claude:approve ${stage}/${file}` for "Approve anyway" — no override, no
reason. So the one place a human forces a failed gate is the one place the
override is invisible. The menu.md `claude:approve` recipe already parses
`--override "<reason>"`.

## Implementation Details
1. The failed-validation "Approve anyway" action emits
   `claude:approve <stage>/<file> --override` and the screen captures a REASON
   from the human (a free-text input mode, mirroring the reject-input flow) — the
   session model passes that reason to `approvePlan`'s override. If a full
   reason-capture input is out of scope for the render layer, at minimum emit the
   `--override` flag and have the menu.md recipe (already updated) prompt for the
   reason; assert the token carries `--override`. Do NOT make "Approve anyway" the
   recommended/first option (R2-C already demoted it — keep it last).
2. The clean "Confirm approve" path is unchanged (no override).

### Wiring — the live call sites (MANDATORY)
| change | live call site | root |
|---|---|---|
| override token | the validate screen's failed branch → menu.md claude:approve recipe (exists) | /ctoc:menu |

### Test Plan (TDD-Red first)
The failed-validation screen's "Approve anyway" action string contains
`--override` (fails today — it's bare). The clean path's "Confirm approve" does
NOT. "Approve anyway" is the LAST option, never recommended. If you add a
reason-capture input mode, round-trip it.

## Execution Plan (Steps 8-16)
Step 8 TEST red · Step 9 PREPARE (read menu-screens validateScreen + menu.md
claude:approve recipe) · Step 10 IMPLEMENT · Step 11 REVIEW · Step 14 VERIFY
(node --test the named file + eslint; no git; no full suite) · Step 16 REPORT.

## Decisions Taken Under Ambiguity

- **Exact action string:** the failed-validation "Approve anyway" action emits
  `claude:approve <stage>/<file> --override` (e.g.
  `claude:approve functional/broken-plan.md --override`). The clean-path
  "Confirm approve" is unchanged: `claude:approve <stage>/<file>` (no token).
- **Reason-capture deferred to the recipe (not the render layer).** A full
  free-text reason-capture input mode would require the driver (menu.md) to
  interpret a new inputMode and thread the reason into `approvePlan`'s override.
  The constraint for this plan is to touch ONLY `src/lib/menu-screens.js` and its
  test — menu.md is out of bounds. The menu.md `claude:approve` recipe already
  keys the override to the buried "Approve anyway" option and calls
  `approvePlan(path, root, { override: { reason } })` with the human's reason. So
  the render layer's job is only to make the forced crossing auditable at the
  action-string surface by carrying `--override`; the recipe prompts for and
  records the reason. This matches the plan's stated fallback ("at minimum emit
  the `--override` flag and have the menu.md recipe prompt for the reason").
- **Existing assertion updated, not weakened.** The prior test asserted the bare
  `claude:approve functional/broken-plan.md`. That is exactly the un-auditable
  behavior this plan replaces, so the assertion is TIGHTENED to require the
  `--override` token (the human-replaced contract per lesson 14), never loosened.
- **"Approve anyway" stays LAST and never recommended** — position and demotion
  are unchanged; only the action string gains the token.
