---
title: "Automated Stale-Plan Detection & Human-Gated Cleanup"
created: "2026-06-15T00:00:00Z"
priority: MEDIUM
type: vision
status: draft
program: ctoc-pipeline-hygiene
order: 1
---

# Automated Stale-Plan Detection & Human-Gated Cleanup

## The Load-Bearing Principle

**Detection suggests; the human decides; a gate is never crossed automatically.**
The pipeline accumulates phantom backlog — plans whose work shipped (or which
died on arrival) but which were never moved out of their stage. CTOC should
surface these proactively and propose the right cleanup, but every action stays
behind explicit human approval, consistent with the four-gate philosophy.

## Problem Statement

1. Plans rot in place. This was discovered first-hand on 2026-06-15: four
   `functional/` plans (A1–C1) and ten `review/` plans were all shipped months
   earlier (v6.1.x–v6.3.x) but never advanced — the dashboard misreported them
   as live backlog for ~31 days.
2. There is no automated signal for "this plan no longer reflects reality."
   Finding the rot required a manual cross-check of every plan against the tree
   and git history.
3. Cleanup, once identified, is manual and error-prone (stamping markers,
   choosing archive vs delete vs advance, avoiding the gate auto-revert hook).

## Vision

A CTOC capability that continuously detects stale plans and proposes
category-appropriate cleanup, always behind human approval.

### Decisions locked during ideation (2026-06-15)

- **Detection signal — HYBRID.** Evidence-based detection (work provably exists
  in tree/git but the plan never advanced; or the plan carries
  `approved_by: human` yet sits in a gate source stage) drives *actionable*
  cleanup. Age/inactivity is an *advisory* flag only — never acted on alone,
  because age false-positives erode trust.
- **Surface + trigger — CHEAP FLAG + SCOUT VERIFY.** Cheap signals (age,
  marker-in-source-stage, declared `files:` exist) run on menu open and surface
  "N possibly-stale plans" as a new Inbox stream. Expensive proof (git-history
  match) is done by a Tier-3 scout only when the user drills in — keeping the
  dashboard hot-path fast and honoring the 3-slash-command rule (lives in the
  menu/Inbox, not a new command).
- **Cleanup action — CATEGORY-AWARE PROPOSAL.** The detector classifies each
  stale plan and proposes the right action with its evidence: shipped-but-early
  → archive to `done/` (stamp `approved_by: human` + `gate_crossed`);
  approved-but-stranded → advance to `done/`; dead-on-arrival → delete or
  revert. The human confirms or overrides.

## Decisions Taken Under Ambiguity (no-stub rule — to confirm at Gate 0)

- **Approval granularity (Q4, undecided):** default to a grouped review surface
  that lists every detected plan with its proposed action + evidence, with
  per-plan approve/override and a "select all of category X" affordance.
  Rationale: the human stays aware of each plan (the user's stated goal) without
  forcing 14 separate prompts when a batch is homogeneous.
- **Gate-crossing safety (Q5, undecided):** default to the detector proposing
  Gate 3 advancement for approved-but-stranded `review/` plans, but the actual
  crossing routes through the existing `approvePlan()` flow with explicit human
  confirmation — never the move script, never automatic. The detector may
  *propose* a gate crossing; only the human *executes* it.

## Success Criteria

1. Menu open surfaces a "possibly-stale plans" Inbox count without measurable
   hot-path regression (cheap reads only).
2. Drilling in runs a Tier-3 scout that verifies each candidate against git
   history and `files:` existence, classifies it, and proposes an action.
3. Every cleanup action requires explicit human approval; no human gate is ever
   crossed automatically.
4. A regression-grade test proves a shipped+approved `done/` plan is never
   flagged, and a stranded `review/` plan always is.
