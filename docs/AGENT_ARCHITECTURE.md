# CTOC Agent Architecture v8

> Last updated: 2026-05-14
> Status: ratified (`tests/architecture-invariants.test.js` enforces structural invariants)
> Predecessors: v7 (introduced 3-section dashboard, no-stub rule, async-overnight) · v6 (Iron Loop step labels) · v5 (Smart Quality Gate)

CTOC v8 turns the agent layer from "a folder of prompts" into a **tiered, contract-driven, observable orchestration system** with cost-aware routing, cross-pillar synthesis, and a self-improvement loop.

This document defines the architecture. See companion docs:
- [`DISPATCH_PROTOCOL.md`](./DISPATCH_PROTOCOL.md) — request/response shape and audit log
- [`IRON_LOOP.md`](./IRON_LOOP.md) — 16-step pipeline that uses this architecture
- [`.ctoc/architecture/tier-definitions.yaml`](../.ctoc/architecture/tier-definitions.yaml) — machine-readable tier registry

## Why v8

v7 made CTO Chief the sole top-level coordinator. v8 makes the system **scalable, auditable, and self-improving** by:

1. **Cost-tiering work** so 60-80% of routine checks run on Haiku (Tier 3 scouts) instead of Opus.
2. **Synthesizing across pillars** so the user gets a *minimal change set*, not 12 siloed reports.
3. **Structured dispatch** so every agent call is auditable, replayable, and gradable.
4. **Confidence calibration** so the system learns which agents reliably produce HIGH-confidence findings.
5. **Effort budgets** so no agent runs away with the context window.
6. **Worker isolation** so specialists are proven to work alone before being chained.
7. **MCP + A2A conformance** so the architecture is future-proof for inter-org agent dispatch.

## The four tiers

```
                          ┌─────────────────┐
                          │      USER       │
                          │ (human CTO)     │
                          └────────┬────────┘
                                   │ goals + plans
                                   ▼
                          ┌─────────────────┐
                          │ TIER 0          │
                          │ CTO CHIEF       │   sole top-level coordinator
                          │ (1 agent, opus) │   issues all dispatches
                          └────────┬────────┘
                                   │
                  ┌────────────────┼────────────────────────────┐
                  ▼                ▼                            ▼
        ┌─────────────────┐  ┌───────────────────┐  ┌────────────────────┐
        │ TIER 1          │  │ TIER 3            │  │ TIER 1 (synthesis) │
        │ Sub-orchestrators│  │ Scouts (Haiku)    │  │ synthesizer        │
        │ (~16, opus)     │  │ (~5, fast scan)   │  │ (cross-pillar)     │
        │ planning, iron- │  │ syntax, secret,   │  │ produces minimal-  │
        │ loop, pipeline, │  │ dep, lint, test   │  │ change list across │
        │ reviewers       │  │ pre-screens       │  │ pillars            │
        └────────┬────────┘  └─────────┬─────────┘  └──────────▲─────────┘
                 │ recommend            │ flag                  │ findings
                 │ dispatches           │ pillars               │
                 ▼                      ▼                       │
            ┌──────────────────────────────────────────┐        │
            │ TIER 2                                   │────────┘
            │ Specialist Skills (72, opus/sonnet)      │
            │ quality, testing, doc, security,         │
            │ specialized, infra, frontend, mobile,    │
            │ compliance, data-ml, versioning,         │
            │ ai-quality, architecture, devex, cost    │
            └──────────────────────────────────────────┘
```

### Tier 0 — Top-Level Coordinator

**Members**: `cto-chief` (sole occupant).

**Authority**: dispatches all other agents. Approves all gate crossings. Owns the audit log. Final say in cross-pillar conflicts (delegating synthesis to the synthesizer sub-orchestrator).

**Frontmatter contract** (enforced by `tests/cto-chief-toplevel.test.js`):
```yaml
role: top-level-coordinator
top_level: true
tier: 0
effort: xhigh
reads_ancestry: true
async_choice_protocol: enabled
model_optimized_for: opus-4-7
always_available: true
reports_to: user
dispatches: [<all-19-categories>]
```

**Invariant**: exactly **one** agent file declares `role: top-level-coordinator`.

### Tier 1 — Sub-Orchestrators

**Members** (16):
- Planning (4): `vision-advisor`, `vision-decomposer`, `product-owner`, `implementation-planner`
- Planning reviewers (2): `functional-reviewer`, `implementation-plan-reviewer`
- Iron-loop (3): `iron-loop-integrator`, `iron-loop-critic`, `iron-loop-executor`
- Pipeline (5): `agent-writer`, `agent-critic`, `agent-tester`, `agent-qa`, `agent-publisher`
- Implementation reviewers (1): `implementation-reviewer`
- Synthesis (1, NEW): `synthesizer` — cross-pillar finding integration

**Authority**: recommend dispatches; never execute peer dispatches directly. Read full plan ancestry. Defer-and-continue on ambiguity (no stubs).

**Frontmatter contract**:
```yaml
tier: 1
effort: high              # or xhigh for synthesizer/reviewers
reads_ancestry: true
async_choice_protocol: enabled
model_optimized_for: opus-4-7
reports_to: cto-chief     # invariant: must equal "cto-chief"
dispatch_protocol: v1
```

### Tier 2 — Specialist Skills

**Members** (72, all leaf-converted): 11 quality + 14 testing + 2 documentation + 7 security + 11 specialized + 5 infrastructure + 3 frontend + 3 mobile + 3 compliance + 3 data-ml + 3 versioning + 2 ai-quality + 2 architecture + 2 devex + 1 cost.

**Authority**: domain expert. Single-purpose. Returns structured findings (YAML format per [`DISPATCH_PROTOCOL.md`](./DISPATCH_PROTOCOL.md)).

**Skill file contract** (`skills/<category>/<name>/SKILL.md`):
```yaml
name: <name>
description: <one-line>
type: skill
tier: 2
when_to_load: [...]       # ≥ 5 triggers
related_skills: [...]
effort_level: low | medium | high
effort_budget:
  max_subagents: 0        # leaf agents do not dispatch (the only runtime-enforced cap)
model_optimized_for: opus-4-7
model: opus | sonnet
parallel_safe: true | false
dispatch_protocol: v1
confidence_calibration: enabled
output_contract: ./CONTRACT.yaml  # optional schema ref
```

**Body must include** a "## v8 Output Contract" section declaring the structured findings format.

### Tier 3 — Scouts

**Members** (5, all Haiku subagents, NEW in v8):
- `scouts/syntax-scout` — AST/parser-level syntax check (~50ms)
- `scouts/secret-scout` — pattern-only secret scan (no entropy/verification, ~100ms)
- `scouts/dep-scout` — known-bad CVE list lookup (~50ms)
- `scouts/lint-scout` — fast lint pass via language-native tool
- `scouts/test-scout` — does the test suite currently pass?

**Authority**: pre-screen. Returns one of: `pass`, `flag`, `error`. If `pass`, CTO Chief may skip the corresponding deep specialist. If `flag`, CTO Chief dispatches the Tier 2 specialist.

**Model**: scouts declare `model: haiku` in their frontmatter. They run as **Task-tool subagents** — Claude Code spawns a fresh agent instance with its own isolated 200K-token context. The Haiku model is safe at this layer because subagent context is independent of the user's terminal session. See "Front-process vs subagent model rules" below.

**Frontmatter contract**:
```yaml
tier: 3
effort: low
effort_budget:
  max_subagents: 0
model: haiku
model_optimized_for: haiku-4-5
parallel_safe: true
dispatch_protocol: v1
```

**Cost rationale**: a Haiku scout subagent is ~10-50x cheaper than the Opus/Sonnet specialist it short-circuits. On a clean codebase, 4 of 5 scouts return `pass`, eliminating 4 deep dispatches per gate.

### Front-process vs subagent model rules (corrected v6.9.29)

Claude Code has two execution contexts that matter for model declarations. An earlier version of this document claimed a slash command was "a separate top-level invocation with no session context to preserve" and could therefore declare any model. **That was wrong and it caused crashes.** A slash command's `model:` frontmatter switches the *live session's* model. When `/ctoc:menu` pinned `model: claude-haiku-4-5`, invoking it switched the running session to Haiku; if the session conversation was larger than Haiku's context window, autocompact triggered and the session crashed. The v6.9.29 fix removed the `model:` line from every slash command.

| Context | What it is | Model declarations |
|---|---|---|
| **Front process** | The user's terminal Claude session — the live conversation | **MUST stay on user's chosen model.** `/model` switching mid-session preserves conversation context, but if that context is larger than the new model's window, the session breaks. Do not auto-switch. |
| **Subagent** (Task tool) | A genuinely fresh Claude instance spawned by the Task tool — own isolated 200K context, no inheritance of parent's conversation, returns one summary message back | **MAY declare any model.** Anthropic docs explicitly recommend this for review pipelines: *"during a code review, you can run style-checker, security-scanner, and test-coverage subagents simultaneously"* with different models. |
| **Slash command** | Runs **inside the user's session**, not a separate process — its `model:` frontmatter switches the live session | **MUST NOT declare `model:`.** Pinning a model (especially Haiku) switches the live session and can force autocompact and a crash. |

The rule for CTOC v6.9.29+:
- Agent frontmatter `model:` declarations are **valid only for subagents** (Tier 2 specialists, Tier 3 scouts, Tier 1 sub-orchestrators dispatched via the Task tool)
- Slash command frontmatter must **never** contain a `model:` key
- The **front process** (the live `claude` terminal session) is controlled by the user via `/model` or session-start args
- No code path in CTOC should programmatically `/model`-switch the front process

This preserves both safety (front process untouched, no slash-command-induced model switch) and cost benefit (Haiku scouts deliver 10-50x savings on the Tier 3 subagent dispatches, where the isolated context makes Haiku genuinely safe).

## Dispatch flow

```
1. USER  → CTO CHIEF: "please review my changes"
2. CTO CHIEF → SCOUTS (parallel, Tier 3):
     - syntax-scout
     - secret-scout
     - dep-scout
     - lint-scout
     - test-scout
   Each returns: pass | flag | error
3. CTO CHIEF computes the pillars-to-check set from scout flags + change shape.
4. CTO CHIEF → TIER 1 sub-orchestrators relevant to the change
   (e.g., `implementation-reviewer` for a code change in plans/in-progress).
   Sub-orchestrators recommend Tier 2 specialists.
5. CTO CHIEF dispatches the recommended Tier 2 specialists IN PARALLEL.
   Each returns structured findings (YAML).
6. CTO CHIEF → SYNTHESIZER (Tier 1, NEW):
   Consumes all specialist findings, applies priority rules
   (Security > Correctness > Maintainability > Consistency),
   resolves cross-pillar conflicts, produces a MINIMAL CHANGE LIST.
7. CTO CHIEF approves with audit trail.
8. USER reviews the minimal change list (not 12 siloed reports).
```

Every dispatch goes to `.ctoc/audit/dispatches/YYYY-MM-DD/<dispatch_id>.yaml`.

## Architectural principles (12)

1. **Hierarchy enables scale**. No flat meshes. Every agent has exactly one parent in the dispatch graph.
2. **Specialization beats generalization**. 5 focused agents > 1 monolithic agent.
3. **Cost-tier the work**. Haiku scouts → Sonnet/Opus specialists → Opus orchestrators. Don't pay Opus for what Haiku can decide.
4. **Audit trail is non-negotiable**. Every dispatch is reproducible, replayable, gradable.
5. **Workers prove themselves in isolation** before integration. Specialists must pass isolated tests before sub-orchestrators chain them.
6. **Structured outputs**. YAML/JSON, not prose. Enables automated grading, conflict resolution, and progress tracking.
7. **Effort budgets prevent runaway**. The runtime-enforced cap is `max_subagents` (Tier 2/3 = 0, prevents cascading dispatches). Per-agent token/tool-call caps were noise and dropped in v6.9.3; real session-level budgets (max session hours, max total dispatches, max Iron Loop iterations) live in `.ctoc/config/budget.yaml` (v6.9.4+).
8. **Confidence is calibrated**. HIGH/MEDIUM/LOW is meaningless without measurement. Agents are scored on precision/recall over time.
9. **Cite-your-sources by default**. Every finding cites file+line evidence and a category brief source URL. Cuts hallucination 20-40% (per AI quality research).
10. **Synthesis over enumeration**. The output is a *minimal change list*, not a *complete finding list*. Most systems fail here.
11. **Self-improvement via re-WebSearch**. Briefs decay. Monthly refresh. Diff alerts. Agent grades drive prioritization.
12. **MCP + A2A future-proofs**. Structured protocols beat ad-hoc text. Where possible, conform to open standards.

## Self-improvement loop

```
   Run
    ↓
   Dispatch audit logs
    ↓
   Per-finding outcome tracking:
     - accepted?        → boost agent confidence
     - false positive?  → reduce agent confidence
     - kickback?        → flag agent for re-modernization
    ↓
   Per-agent grade update (.ctoc/agents/grades.yaml)
    ↓
   Monthly: re-WebSearch categories where grades dropped
    ↓
   Brief regeneration + diff alert
    ↓
   Apply diff to affected skill bodies → next run uses fresh briefs
```

## Operating principles inherited from v7

- **Pre-todo is context-building, todo+ is execution**.
- **No-stub rule**: defer-and-continue with a documented choice.
- **Async overnight**: drain the pipeline while user sleeps; review at morning.
- **Literal interpretation**: prompts are explicit, name effort, declare ancestry-read.
- **Three human gates**: functional → impl, impl → todo, review → done.

## Cross-references

- Iron Loop pipeline (16 steps): [`IRON_LOOP.md`](./IRON_LOOP.md)
- Dispatch protocol spec: [`DISPATCH_PROTOCOL.md`](./DISPATCH_PROTOCOL.md)
- Category briefs (research-backed best practices): [`.ctoc/audit/skill-conversion/category-briefs.md`](../.ctoc/audit/skill-conversion/category-briefs.md)
- Tier definitions (machine-readable): [`.ctoc/architecture/tier-definitions.yaml`](../.ctoc/architecture/tier-definitions.yaml)
- Audit log directory: `.ctoc/audit/dispatches/`
- Agent grades: `.ctoc/agents/grades.yaml`

## Test invariants

`tests/architecture-invariants.test.js` enforces:
1. Exactly one agent has `role: top-level-coordinator` (CTO Chief).
2. Every Tier 1 sub-orchestrator declares `reports_to: cto-chief`.
3. Every Tier 2 specialist (converted leaf agents → skills) declares `tier: 2`, `effort_budget`, `parallel_safe`, `dispatch_protocol: v1`.
4. Every Tier 3 scout declares `tier: 3`, `model: haiku`, `model_optimized_for: haiku-4-5`.
5. The synthesizer agent exists at `agents/coordinator/synthesizer.md` with `tier: 1`.
6. At least 5 scouts exist under `agents/scouts/`.
7. No agent outside `agents/coordinator/cto-chief.md` claims `role: top-level-coordinator`.
