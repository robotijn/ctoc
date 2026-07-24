---
approved_by: human
approved_at: 2026-07-24T12:17:45.605Z
gate_crossed: review → done
override: true
override_reason: Human approved done 2026-07-24 (Push + mark both done). Work shipped and gate-green: sweep 7cec02e, watchdog a22eb55. Plans lack machine-readable step markers but VERIFY genuinely passed (npm test fail 0, coverage 99.01%).
---

---
approved_by: human
approved_at: 2026-07-23T00:00:00.000Z
gate_crossed: implementation → todo
---

---
title: "Improve every skill and every agent — human-commanded fabrication-fix and critique sweep"
type: implementation
parent_plan: none
depends_on: none
priority: CRITICAL
program: corpus-quality
iron_loop: true
files:
  - "skills/**/*.md"
  - "agents/**/*.md"
---

# Human-commanded corpus improvement sweep

Coverage plan recording the human's explicit Gate-2 authorization to improve
EVERY skill and EVERY agent: first fix the six audited fabrications, then run ten
rounds of harsh critique plus real, web-verified improvement per file, five
subagents in parallel, each reading the file fresh every round. Strict
enforcement blocks skill/agent edits and the human did not type an escape phrase,
so this plan is how the human's command is honored WITHOUT routing around the
gate. The broad `skills/**/*.md` + `agents/**/*.md` grant is faithful to an
explicit human command to edit exactly those two trees — not an agent self-grant.
NO FAKES: every factual change is verified against a live source.

## Decisions Taken Under Ambiguity

Recorded per sub-task by the executing subagents.

## Step 8 — TEST
Each factual replacement is verified against a live source before it lands; the
full `npm test` gate runs after the sweep and must stay green.

## Step 10 — IMPLEMENT
Phase 1 fixes the six audited fabrications; Phase 2 runs the ten-round
critique-and-improve loop across all 101 skills and 124 agents.

## Step 14 — VERIFY
`npm test` green (true exit, no pipe); no fence regression; no fabrication introduced.
