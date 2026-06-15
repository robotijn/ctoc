# Handoff — 18 functional plans at Gate 1 (3 visions decomposed + harsh-reviewed)

<!-- Maintained by the `handoff` skill. Left by the previous Claude instance so
     the next one (claude or claudex) can continue. Treat as last-known state —
     verify against the repo before acting. -->

- Updated: 2026-06-15 by claude
- Branch: main
- Status: complete (a clean stopping point; the next move is Gate 1, not a resume)

## Goal
Turned three user ideas into a hardened, ready-to-build backlog. Cleared the
existing phantom backlog, created three visions, decomposed them with the CTOC
agents into functional plans, ran a 5-critic adversarial review, resolved the
findings through eight human decisions, and applied them. All committed and
pushed to origin/main. The pipeline now holds 18 functional plans awaiting
Gate 1 (functional -> implementation).

## Current status
- Done (all committed + pushed; in sync with origin/main; HEAD 9de15d9; VERSION 6.9.47):
  - Phantom-backlog cleanup + inbox fix (v6.9.45-47, earlier this session): archived
    4 shipped functional plans, advanced 10 approved+shipped review plans, and fixed
    listPlansAtGates() in src/lib/inbox.js (it counted gate DESTINATION stages with a
    marker — i.e. plans that had already CROSSED — so the dashboard showed the Done
    total; now it counts gate SOURCE stages = plans actually awaiting approval).
  - 3 vision drafts created then decomposed -> done/ (Gate 0 approved by human):
    automated-stale-plan-detection, eu-compliance-agents-gdpr-ai-act,
    upgrade-agents-and-skills-corpus (all now in plans/done/).
  - Decomposition: vision-decomposer x3 (parallel) -> stubs; product-owner x3 ->
    production-ready functional plans (commit 51f573c).
  - Harsh adversarial review: 5 parallel critics found real, repo-verified defects.
    8 decisions taken via /ask-me-questions, then applied by re-running the
    product-owner agents (commit 9de15d9). Result: 18 functional plans at Gate 1.
- Stage counts now: functional 18, in-progress 2 (pre-existing, untouched), done 26.
- In progress: nothing.
- Next: Gate 1 on whichever vision to build first (EC1 or SP1 are clean starts).
  This is a fresh decision, not a resume — nothing is half-done.

## Key decisions (the 8 from the harsh review — locked, already applied to the plans)
1. EU compliance REUSES the existing regulatory-regime system (src/lib/regulatory-regime.js
   + .ctoc/regulatory-regimes/*.yaml, 14 profiles incl. eu-ai-act-high-risk + eu-cra) —
   NOT a new compliance.mode setting. This removed a duplicate "which regulations apply"
   axis. EC1 wires shouldRunGdpr()/shouldRunEuAiAct() to active_profiles.
2. Compliance agents are HYBRID: prompt agents + small JavaScript helper modules for the
   deterministic rules (field->article map, risk-tier table, schema + price validators),
   so tests target the helpers, not the model.
3. Compliance dispatch fires at the functional->implementation slot (the existing
   background-agent slot), via the CTO Chief, findings surfaced in the Inbox — because
   approvePlan() runs the Iron Loop AFTER the Gate-2 click, and library code cannot
   dispatch an agent.
4. Stale-plan verification is in-process Node git (child_process) on explicit drill-in —
   NO Haiku scout (the menu is a plain Node process and cannot dispatch a subagent).
5. The approved-but-stranded signal flags the REVIEW stage only (the naive version
   false-positived on every healthy implementation-stage plan).
6. Advancing a stranded plan uses a dedicated reconciliation path (not approvePlan, which
   would re-fire deployment + log a fake fresh Gate-3 crossing). dead-on-arrival defaults
   to revert, never auto-delete.
7. The corpus upgrade materializes a checked-in audit ledger
   (.ctoc/audit/corpus-audit-2026-06-15.json) as the no-silent-skip authority; CU4 split
   into CU4a/CU4b/CU4c (frameworks long-tail / quality-configs / non-mainstream languages).
8. Wrap all 13 unwrapped skills (count corrected from 15) with the real 3-field
   type:wrapper convention, creating new agents/safety, agents/legal, agents/realtime dirs.

## Open questions / blockers
None.

## Gotchas
- The harsh review proved the decompose->refine pipeline produces plausible-but-wrong
  plans: non-existent hook points, a reproduced false-positive bug, a duplicated
  regulatory system, wrong skill paths (skills/x.md vs skills/x/SKILL.md), always-green
  tests. ALWAYS adversarially review generated plans before building. The 8 decisions
  above are already baked into the plan files — do not relitigate them.
- CU1 carries a load-bearing test trap: bumping model_optimized_for opus-4-7 -> opus-4-8
  reds tests/agent-modernization.test.js and tests/skill-loading.test.js (they pin
  opus-4-7). The model bump and the test update MUST be one atomic change.
- The audit ledger (.ctoc/audit/corpus-audit-2026-06-15.json) does NOT exist yet — it is
  a CU1 deliverable that every other corpus plan depends on. Build CU1 first.
- plans/in-progress/ holds 2 plans (pre-existing, untouched this session). Verify whether
  they are genuinely mid-execution or orphaned before acting on them.
- approvePlan() (src/lib/actions.js) triggers the deployment pipeline on review->done IF
  deployment is enabled; it is currently disabled (enabled:false). The stale-cleanup plans
  deliberately AVOID approvePlan for this reason.
- Environment is dev (soft enforcement, never auto-push) — commits this session were pushed
  manually. All tests must show # fail 0; currently 1511 pass / 0 fail.

## Key files
- plans/functional/ — the 18 plans: SP1-5 (stale-plan), EC1-6 (EU compliance),
  CU1/CU2/CU3/CU4a/CU4b/CU4c/CU5 (corpus upgrade). Each has parent_vision + files:.
- plans/done/ — the 3 decomposed visions (parent context for the functional plans).
- src/lib/inbox.js — the fixed listPlansAtGates (source-stage counting).
- src/lib/regulatory-regime.js + .ctoc/regulatory-regimes/ — the system EU compliance reuses.
- src/lib/actions.js (approvePlan), src/hooks/human-gate-check.js — gate machinery (read, don't modify).

## Resume here
Nothing to resume — this work is complete and pushed (HEAD 9de15d9, in sync with
origin/main). To continue the program, take ONE vision through Gate 1: pick its
functional plans (e.g. start EC1-compliance-mode-setting or SP1-cheap-stale-flag-on-menu-open),
approve functional -> implementation via the menu, and let implementation-planner generate
technical detail. Build CU1 before any other corpus plan (it creates the audit ledger the
others depend on). Delete this HANDOFF.md once it is no longer useful.
