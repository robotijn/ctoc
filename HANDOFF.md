# Handoff — phantom-backlog cleanup + inbox gate-count fix

<!-- Maintained by the `handoff` skill. Left by the previous Claude instance so
     the next one (claude or claudex) can continue. Treat as last-known state —
     verify against the repo before acting. -->

- Updated: 2026-06-15 by claude
- Branch: main
- Status: complete

## Goal
Started from a menu question — "are the 4 functional plans stale or
implemented?" — which exposed a repo-wide phantom backlog: shipped work whose
plan files were never moved out of their pipeline stages. Cleared the backlog
and fixed the inbox reporting bug it surfaced. All done, released
v6.9.45 → v6.9.47, pushed to origin/main.

## Current status
- Done (all committed + pushed; in sync with origin/main):
  - v6.9.45 — archived 4 shipped functional plans → done/. A1-canvas-layer,
    A2-three-section-dashboard, A3-menu-rethink-five-areas,
    C1-pretooluse-enforcement-hook had sat in plans/functional/ ~31 days as
    phantom backlog, but each feature shipped months ago (A1 v6.2.0, A2 v6.2.1,
    C1 v6.3.0, A3 v6.3.1) and is present in the tree. Each was stamped with
    approved_by: human + a gate_crossed note recording its shipping version,
    then moved functional → done. Functional stage: 4 → 0.
  - v6.9.46 — advanced 10 approved+shipped plans review/ → done/. The whole
    review queue held plans that already carried approved_by: human (passed
    Gate 3 review) but were never moved on, stranded since v6.1.x. Every one
    verified shipped vs the tree + git history. Advanced via the sanctioned
    approvePlan() flow (validate → approve) with explicit human authorization
    for the Gate 3 crossing. Deployment is disabled (enabled: false) so no
    deploy side effects fired. Review stage: 10 → 0.
  - v6.9.47 — fixed the inbox "plans at gates" bug. listPlansAtGates() counted
    gate DESTINATION stages (implementation/todo/done) with an approved_by
    marker — i.e. plans that had already CROSSED a gate — so the count tracked
    the Done total and the dashboard claimed "23 plans at gates" when zero were
    waiting. Rewrote it to count gate SOURCE stages (functional→G1,
    implementation→G2, review→G3); the marker is no longer consulted (it
    reflects the previous gate crossed, not the next one awaited). Replaced two
    trivial assert-an-array tests with 9 meaningful ones incl. a direct
    regression (a done/ plan must not be counted).
- In progress: nothing from this session.
- Next: nothing required. See the in-progress plans note under Gotchas.

## Key decisions
- Shipped-but-stranded plans are archived to done/ (not deleted) so the design
  docs stay browsable; each carries approved_by: human + gate_crossed recording
  the version it shipped in. This is the same pattern the existing done/ vision
  plans use (e.g. ctoc-v7-business-first-architecture.md).
- Advancing review → done crosses Gate 3, the most safety-critical human gate.
  It was done only after explicit user authorization, via approvePlan() — the
  move-plan.js script refuses gate crossings by design.
- Inbox "plans at gates" now means "plans where the human owes an approval
  decision" = plans in a gate SOURCE stage (user-chosen definition, option A
  over review-only or label-rename).
- CTOC runtime environment for this repo was set to `dev` this session (soft
  enforcement, never auto-push); that is why the 3 commits were pushed manually
  rather than automatically.

## Open questions / blockers
None.

## Gotchas
- `plans/in-progress/` holds 2 plans (pre-existing, NOT touched this session —
  they predate it). If a future task picks them up, verify whether they are
  genuinely mid-execution or orphaned (actions.js:691 cleanupOrphaned moves
  lock-less in-progress plans to review). Not investigated here.
- `in-progress` IS a real plan directory (state.js:103, actions.js:421), despite
  a CLAUDE.md note that calls it "a frontmatter state, not a directory." Trust
  the code: plans/in-progress/ exists and is read directly.
- approvePlan() triggers the deployment pipeline on review → done IF deployment
  config is enabled. It is currently disabled (enabled: false, dry_run: true),
  so nothing deployed. Re-check getDeploymentConfig() before bulk-advancing
  plans if deployment is ever turned on.
- All tests must show `# fail 0`. Currently 1511 tests, all passing.
- VERSION is the single source of truth; `node src/scripts/release.js` syncs it
  into plugin.json / marketplace.json / README.md on every commit.

## Key files
- src/lib/inbox.js — listPlansAtGates (now source-stage based) + HUMAN_GATE_SOURCE_STAGES.
- tests/inbox.test.js — the strengthened gate-count suite (9 tests incl. regression).
- src/lib/actions.js — approvePlan() (gate flow + deployment trigger); cleanupOrphaned (line 691).
- src/scripts/move-plan.js — CLI plan mover; refuses human-gate crossings by design.
- plans/done/ — now 23 plans incl. the 14 archived/advanced this session.

## Resume here
Nothing to resume — this work is complete and pushed (HEAD ba55664, v6.9.47,
in sync with origin/main). For a new task, start fresh; delete this HANDOFF.md
once it is no longer useful. If you do pick up new work, check plans/in-progress/
(2 plans) first.
