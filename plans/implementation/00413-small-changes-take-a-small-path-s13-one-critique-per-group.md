---
title: "A parent's slices at the same decision get one critique, dispatched only when no sibling is still behind"
type: implementation
status: implementation
parent_plan: small-changes-take-a-small-path
depends_on: 00412-small-changes-take-a-small-path-s12-critique-queue-and-four-lenses
priority: high
effort: medium
files:
  - src/lib/streaming-gate.js
  - src/lib/streaming-precompute.js
  - agents/iron-loop/gate-critic.md
  - tests/critique-groups.test.js
  # Ratchet file: a new test file moves a documented count.
  - CLAUDE.md
---

# A parent's slices at the same decision get one critique, dispatched only when no sibling is still behind

Read the parent plan first: Part B item 2, decisions 10 and 11, and criteria 20 and 21.

## The problem in plain words

After the previous slices, a critique still covers one plan. A parent planned into fifteen slices therefore costs fifteen critiques and fifteen rounds of the same questions. This slice forms one critique per group: a plan's group is its `parent_plan` (a plan with no parent is a group of one); the critique covers the group's plans currently at the decision stage; and the group is dispatched only when no sibling is still at an earlier stage, so a group that arrives slice by slice is critiqued once, not once per arrival. The receiving side (one quarantine file fanned out to every member, one answer recorded for every member) was built by the group fan-out slice.

## What the code does today (read on 2026-09-30)

```js
// src/lib/streaming-gate.js — pendingGateDecisions(projectRoot): each descriptor carries
// { ref, slug, title, summary, fromStage, toStage, moment, chip, approveLabel,
//   passesValidation, critical, broken, enough, sufficiencyReason,
//   unansweredQuestionIds, blockingQuestionIds } — no parent.
// It reads each plan once through readPlans (plan.content and plan.metadata are available).
```

`parseMetadata` sees only the first frontmatter block, and a plan that crossed an approval moment carries a prepended marker block; `listSubplans` in `src/lib/actions.js` therefore reads `parent_plan` from the merged region with `extractFrontmatterRegion` (required lazily to avoid a require cycle).

`agents/iron-loop/gate-critic.md`, section "Your ONE write — the quarantined pending file", describes one pending object `{ ref, planMtimeMs, questions, attestation }` per dispatch.

## Files and signatures

### Modify `src/lib/streaming-gate.js`

Each descriptor from `pendingGateDecisions` gains `parent: (string|null)`: the `parent_plan` value from the merged frontmatter region of the content `readPlans` already read (no second read), unquoted and control-stripped, or null. Nothing else in the descriptor, the order, or the sufficiency crossing changes.

### Modify `src/lib/streaming-precompute.js`

`critiqueQueue` forms units by group, in one pass over the decisions (never one `listSubplans` call per plan):

- key: `parent` when present, else the plan's own `ref`;
- a group with a parent, at decision stage S, is HELD when any decision with the same parent sits at a stage earlier than S among the stages `pendingGateDecisions` reads (for the approach decision: a sibling still at the what-to-build decision); siblings further along do not hold it;
- the unit's members are all the group's decisions at stage S; the unit is a candidate when at least one member needs questions and no member's critique is in flight; if any member is in flight, the group counts once in `inFlight` and is not dispatched;
- a held group is not dispatched and is reported in `remainder` (one critique, its members' plans, their references), so it appears as "not yet critiqued" (criterion 21);
- units keep the order of their first member in the decisions list.

`plansNeedingQuestions` is unchanged (per plan).

### Modify `agents/iron-loop/gate-critic.md`

In "Your ONE write — the quarantined pending file", add: when the brief lists more than one member, the ONE pending file is named after the FIRST member's ref, its `ref` is that ref, and it carries `"group": { "parent": "<the brief's parent>", "members": [ { "ref": "<ref>", "planMtimeMs": <stamp> }, … ] }` with every member in the brief's order, stamps copied character for character; every other rule of the section is unchanged (one path family, one file per dispatch, never the live path). Dispatched agents load from the installed plugin, so this instruction takes effect in a session only after the plugin is updated and the session restarted (recorded in this repository's memory; not re-verified here).

## Tests to write first (each run and seen failing before any code)

In `tests/critique-groups.test.js`, against scratch pipelines and the real `pendingGateDecisions`:

1. Criterion 20 (the dispatch half): a parent's 15 slices, all in `implementation/`, none with questions, no sibling in `functional/` → `critiqueQueue` returns ONE unit with 15 members, in FIFO order, each with its modification time. Red: 15 units today.
2. Criterion 21: 10 slices in `implementation/` and 5 in `functional/` → no unit for the implementation-stage group; `remainder` counts it as one critique covering 10 plans; the 5 functional slices form their own unit at their own decision.
3. A parent whose slices are in `implementation/` and `todo/` → the todo slices neither hold the group nor join it.
4. One member with a recorded, non-terminal precompute task → the group is not dispatched and `inFlight` counts it once.
5. A plan with no `parent_plan` → a unit of one, exactly as in the previous slice.
6. A slice whose `parent_plan` sits in its second frontmatter block (an approval marker prepended) is still grouped with its siblings.
7. `agents/iron-loop/gate-critic.md` describes the group block with `parent`, `members`, `ref` and `planMtimeMs` (a text pin on the instruction the sweeper's validation in the group fan-out slice expects).
8. End to end, in-process: a pending payload shaped exactly as the updated instruction describes, for a unit `critiqueQueue` produced, is promoted by the real sweeper to every member.

## Where the new code is reached from

`pendingGateDecisions` renders every `/ctoc:start` decision and feeds the critique queue; `critiqueQueue` feeds the session-start directive, the stop-hook directive and the dashboard recipe (previous slice). The critic's instruction is read by the session when it dispatches `gate-critic`.

## Acceptance scenarios

- The human's 15-slice README plan, all slices at the approach decision, costs one critique (four lenses and one synthesizer); he answers each question once; every slice records the answer.
- A parent whose slices are still being planned costs nothing until the last slice arrives, and the banner says it is not yet critiqued.

## Security review

The critic's write capability is unchanged (one quarantine file per dispatch). Group membership is decided by code from plan frontmatter, and re-checked by the promoter; a critic cannot add a plan to a group it was not briefed with.

## Out of scope

The cap (next slice). The on-demand `discuss-all`, which already offers one critique per parent-plan group.

## CLAUDE.md

In the streaming-questions section, one sentence: one critique per parent group, dispatched when no sibling is still at an earlier decision. Update the documented test-file count.

## Decisions Taken Under Ambiguity

1. **Only the stages `pendingGateDecisions` reads can hold a group**; vision and canvas plans carry `parent_vision`, not `parent_plan` (believed from the decomposer's form; not re-read here), so they never hold a slice group.
2. **A group whose members include one with fresh questions is still critiqued as a whole** when any member needs questions, so every member ends up with the same question set and one answer counts for all.
3. **`parent` is read from the content already in memory**, keeping `pendingGateDecisions` at one read per plan.
