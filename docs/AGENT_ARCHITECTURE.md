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

1. **Dispatching real watchers** that think about the code with Opus and report what they actually found.
2. **Synthesizing across pillars** so the user gets a *minimal change set*, not 12 siloed reports.
3. **Structured dispatch** so every agent call is auditable, replayable, and gradable.
4. **Confidence calibration** so the system learns which agents reliably produce HIGH-confidence findings.
5. **Effort budgets** so no agent runs away with the context window.
6. **Worker isolation** so specialists are proven to work alone before being chained.
7. **MCP + A2A conformance** so the architecture is future-proof for inter-org agent dispatch.

## The three tiers

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
                  ┌────────────────┴────────────────────────────┐
                  ▼                                             ▼
        ┌──────────────────┐                       ┌────────────────────┐
        │ TIER 1           │                       │ TIER 1 (synthesis) │
        │ Sub-orchestrators│                       │ synthesizer        │
        │ (20, opus)       │                       │ (cross-pillar)     │
        │ planning, iron-  │                       │ produces minimal-  │
        │ loop, pipeline,  │                       │ change list across │
        │ reviewers        │                       │ pillars            │
        └────────┬─────────┘                       └──────────▲─────────┘
                 │ recommend                                   │ findings
                 │ dispatches                                  │
                 ▼                                             │
            ┌──────────────────────────────────────────┐       │
            │ TIER 2 — the watchers                    │───────┘
            │ Specialist Skills (99, opus)             │
            │ quality, testing, doc, security,         │
            │ specialized, infra, frontend, mobile,    │
            │ compliance, data-ml, versioning,         │
            │ ai-quality, architecture, devex, cost    │
            └──────────────────────────────────────────┘
```

**There is no Tier 3.** It existed until 2026-07-17 and held five Haiku "scouts"
that pre-screened the watchers above and skipped them on `pass`. See
[Tier 3 — deleted](#tier-3--deleted) for why that was a defect and not a saving.

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
always_available: true
reports_to: user
dispatches: [<all-19-categories>]
```

**Invariant**: exactly **one** agent file declares `role: top-level-coordinator`.

### Tier 1 — Sub-Orchestrators

**Members** (20):
- Planning (4): `vision-advisor`, `vision-decomposer`, `product-owner`, `implementation-planner`
- Planning reviewers (2): `functional-reviewer`, `implementation-plan-reviewer`
- Iron-loop (3): `iron-loop-integrator`, `iron-loop-critic`, `iron-loop-executor`
- Pipeline (5): `agent-writer`, `agent-critic`, `agent-tester`, `agent-qa`, `agent-publisher`
- Implementation reviewers (1): `implementation-reviewer`
- Synthesis (1): `synthesizer` — cross-pillar finding integration
- Gate critique (4, NEW): `premortem-critic`, `devils-advocate-critic`, `red-team-critic` — three independent adversarial lenses run in parallel — and `gate-critic` — synthesizes their findings into the human's per-gate decision questions. Advisory (Read/Grep) and run in the background precompute so the human never waits; the human's streaming answer is the gate crossing.

**Authority**: recommend dispatches; never execute peer dispatches directly. Read full plan ancestry. Defer-and-continue on ambiguity (no stubs).

**Frontmatter contract**:
```yaml
tier: 1
effort: xhigh             # every agent not in EFFORT_EXEMPT; see below
reads_ancestry: true
async_choice_protocol: enabled
reports_to: cto-chief     # invariant: must equal "cto-chief"
dispatch_protocol: v1
```

### Tier 2 — Specialist Skills

**Members** (99 `SKILL.md` bodies across 20 categories): 14 testing + 12 saas + 11 quality + 11 specialized + 10 security + 5 compliance + 5 infrastructure + 3 ai-quality + 3 data-ml + 3 frontend + 3 mobile + 3 safety + 3 versioning + 2 architecture + 2 devex + 2 documentation + 2 legal + 2 product + 2 realtime + 1 cost.

**Wrapper coverage (CU5).** Every one of the 99 `SKILL.md` bodies is now dispatch-reachable through an agent under `agents/<category>/`: a rich agent (which declares `extends_skill:` in frontmatter or references the skill by `skills/<category>/<name>/` path in its body), or a thin `type: wrapper` redirect whose frontmatter is exactly `{name, type, target_skill}` and whose body points at `skills/<category>/<name>/SKILL.md`. CU5 added **12 thin wrappers** for the previously-unwrapped skills — safety/{fault-tree-builder, fmeda-analyzer, redundancy-pattern-picker}, security/{cra-incident-clocks, incident-responder, threat-modeler}, legal/{clm-obligations, dsar-handler}, realtime/{hil-harness, wcet-budget}, compliance/sbom-cra-checker, and ai-quality/llm-security-tester — creating three new agent directories: `agents/safety/`, `agents/legal/`, and `agents/realtime/`. The 13th candidate, `compliance/gdpr-compliance-checker`, gets **no** thin wrapper: it is already covered by the rich `agents/compliance/gdpr-agent.md`, which subsumed and deleted the old thin wrapper in EC2-s3 and delegates to the same SKILL.md body — CU5 honors that removal rather than re-introducing a redundant wrapper. Net +12 agent files → 124 agent `.md` files across 25 categories. `tests/cu5-wrapper-coverage-completeness.test.js` enforces that the unwrapped set stays empty. The subsequent adversarial gate-critique fleet added 4 more Tier-1 agents (`premortem-critic`, `devils-advocate-critic`, `red-team-critic`, `gate-critic`) → 128 agent `.md` files across 25 categories. Plan F3b then deleted the 5 Tier-3 pre-screen agents and the `agents/scouts/` directory with them → **123 agent `.md` files across 24 categories** (the live count today; `tests/doc-counts.test.js` and `tests/readme-numbers.test.js` hold it to disk).

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
model: opus | sonnet
parallel_safe: true | false
dispatch_protocol: v1
confidence_calibration: enabled
output_contract: ./CONTRACT.yaml  # optional schema ref
```

**Body must include** a "## v8 Output Contract" section declaring the structured findings format.

### Tier 3 — deleted

<!-- tier-3-tombstone:begin — prose about the deleted tier; tests/no-tier-3.test.js
     permits the dead agents to be NAMED inside this marked region so the record can
     say what was removed and who covers its domain now. Nothing here is a live
     pointer. Do not extend this region to shelter a live roster. -->

**Tier 3 no longer exists.** It held five Haiku "scouts" (`syntax-scout`,
`secret-scout`, `dep-scout`, `lint-scout`, `test-scout`) that pre-screened the
Tier 2 watchers and let CTO Chief skip them on a `pass`. It was removed on
2026-07-17 by plan F3b, on the owner's ruling:

> "A scout is NOT A STUPID REGEX WITH HAIKU, IT IS AN OPUS THINKING ABOUT THE
> CODE. CTO Chief dispatches real agents to check on the code and aggregates the
> information, then steers the build."

**Why it was a defect, not a saving.** Each scout declared
`short_circuits: <a Tier 2 specialist>` — a frontmatter key whose whole purpose
was to stop a better-equipped agent from looking. `secret-scout` pattern-matched
the twenty highest-prevalence secret formats with a Haiku model. A credential in
any other shape returned `pass`, the deep `security/secrets-detector` never ran,
and the audit record said *scanned, nothing found*. That is not a cheap scan; it
is a **false-green machine** that manufactures unwarranted confidence. It broke
this repo's own rule: a critique that did not RUN is not "nothing found" —
absence of evidence is never evidence of absence.

**Nothing was lost.** Every scout's domain was already owned by an Opus watcher
that reads the code rather than grepping it:

| Deleted scout | Domain now owned by |
|---|---|
| `secret-scout` | `security/secrets-detector` — the very agent it short-circuited |
| `dep-scout` | `security/dependency-auditor` |
| `lint-scout` | `quality/code-smell-detector`, `quality/complexity-analyzer` |
| `syntax-scout` | `quality/type-checker` |
| `test-scout` | `testing/smart-test-runner` |

**Do not re-add this tier.** The absence is fenced by
[`tests/no-tier-3.test.js`](../tests/no-tier-3.test.js), which asserts that
`agents/scouts/` does not exist, that no agent declares `model: haiku`, that no
agent declares `short_circuits:`, and that the dispatch schema's `target_tier`
maxes at 2. A prior corpus-wide deletion in this repo was silently undone by a
`git restore` and stayed undone because only an edit — not a fence — held it.

<!-- tier-3-tombstone:end -->

### Front-process vs subagent model rules (corrected v6.9.29)

Claude Code has two execution contexts that matter for model declarations. An earlier version of this document claimed a slash command was "a separate top-level invocation with no session context to preserve" and could therefore declare any model. **That was wrong and it caused crashes.** A slash command's `model:` frontmatter switches the *live session's* model. When `/ctoc:start` pinned `model: claude-haiku-4-5`, invoking it switched the running session to Haiku; if the session conversation was larger than Haiku's context window, autocompact triggered and the session crashed. The v6.9.29 fix removed the `model:` line from every slash command.

| Context | What it is | Model declarations |
|---|---|---|
| **Front process** | The user's terminal Claude session — the live conversation | **MUST stay on user's chosen model.** `/model` switching mid-session preserves conversation context, but if that context is larger than the new model's window, the session breaks. Do not auto-switch. |
| **Subagent** (Task tool) | A genuinely fresh Claude instance spawned by the Task tool — own isolated 200K context, no inheritance of parent's conversation, returns one summary message back | **MAY declare any model.** Anthropic docs explicitly recommend this for review pipelines: *"during a code review, you can run style-checker, security-scanner, and test-coverage subagents simultaneously"* with different models. |
| **Slash command** | Runs **inside the user's session**, not a separate process — its `model:` frontmatter switches the live session | **MUST NOT declare `model:`.** Pinning a model (especially Haiku) switches the live session and can force autocompact and a crash. |

The rule for CTOC v6.9.29+:
- Agent frontmatter `model:` declarations are **valid only for subagents** (Tier 2 specialists, Tier 1 sub-orchestrators dispatched via the Task tool)
- Slash command frontmatter must **never** contain a `model:` key
- The **front process** (the live `claude` terminal session) is controlled by the user via `/model` or session-start args
- No code path in CTOC should programmatically `/model`-switch the front process

This keeps the front process untouched and free of slash-command-induced model switches.

Note that the subagent context being *isolated* only ever made Haiku technically
**safe** to run — it never made Haiku **adequate** for judging Opus-written code.
That distinction is what the deleted Tier 3 got wrong, and it is why no agent
declares `model: haiku` today.

## Dispatch flow

```
1. USER  → CTO CHIEF: "please review my changes"
2. CTO CHIEF computes the pillars-to-check set from the shape of the change.
3. CTO CHIEF → TIER 1 sub-orchestrators relevant to the change
   (e.g., `implementation-reviewer` for a code change in plans/in-progress).
   Sub-orchestrators recommend Tier 2 specialists.
4. CTO CHIEF dispatches the recommended Tier 2 watchers IN PARALLEL.
   Each thinks about the actual code and returns structured findings (YAML).
   An empty findings list is a real result: the watcher looked and found nothing.
   No agent may skip another agent — see "Tier 3 — deleted".
5. CTO CHIEF → SYNTHESIZER (Tier 1, NEW):
   Consumes all specialist findings, applies priority rules
   (Security > Correctness > Maintainability > Consistency),
   resolves cross-pillar conflicts, produces a MINIMAL CHANGE LIST.
6. CTO CHIEF approves with audit trail.
7. USER reviews the minimal change list (not 12 siloed reports).
```

Every dispatch goes to `.ctoc/audit/dispatches/YYYY-MM-DD/<dispatch_id>.yaml`.

## Architectural principles (12)

1. **Hierarchy enables scale**. No flat meshes. Every agent has exactly one parent in the dispatch graph.
2. **Specialization beats generalization**. 5 focused agents > 1 monolithic agent.
3. **Never pay for a check with a model that cannot make it.** Cost-tiering was tried and removed (see "Tier 3 — deleted"): a cheap agent that returns `pass` without thinking does not save a dispatch, it fakes one, and the audit trail then lies. Anything that judges Opus-written code thinks with Opus. Spend less by dispatching *fewer* watchers, never by dispatching *weaker* ones.
4. **Audit trail is non-negotiable**. Every dispatch is reproducible, replayable, gradable.
5. **Workers prove themselves in isolation** before integration. Specialists must pass isolated tests before sub-orchestrators chain them.
6. **Structured outputs**. YAML/JSON, not prose. Enables automated grading, conflict resolution, and progress tracking.
7. **Effort budgets prevent runaway**. The runtime-enforced cap is `max_subagents` (Tier 2 = 0, prevents cascading dispatches). Per-agent token/tool-call caps were noise and dropped in v6.9.3; real session-level budgets (max session hours, max total dispatches, max Iron Loop iterations) live in `.ctoc/config/budget.yaml` (v6.9.4+).
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

## The effort floor

A watcher — any agent that reads code or artifacts and emits findings — declares
`effort: xhigh`. Owner ruling, 2026-07-17, verbatim: **"ok let the agents have xhigh"**,
answering whether effort must rise alongside `model: opus`. It must — to `xhigh`, the
highest level Anthropic ships no caveat against.

The model floor and the effort floor are two separate controls and the first cannot see
the second: `model: opus` with `effort: low` satisfies every model assertion in the
corpus and still produces a shallow read — a green record rather than a review. Both are
fenced in `tests/agent-model-floor.test.js`.

The rule is written as an **exemption**, not a roster. `EFFORT_EXEMPT` in that fence names
every agent permitted below `xhigh`, each with a written reason; everything else must be
`xhigh`. A new agent therefore defaults to being a watcher and must be argued *into* the
map to think at anything less. The exempt groups are actuators (they write, they do not
watch), planners (they ask the human; the bottleneck is the answer, not thinking depth),
and the `saas/*` agents scheduled for demotion to skills.

Coordinators are deliberately **not** exempt: `synthesizer` resolves every cross-pillar
conflict in the system.

### Why `xhigh` and not `max` — read this before "improving" it back

An earlier ruling said `max`, and plan F3c applied `max` to 91 agents in one edit. The
owner **reversed it the same day, on evidence**, after being shown Anthropic's own
guidance in the model configuration reference, verbatim:

> | `max` | Can improve performance on demanding tasks but **may show diminishing returns
> and is prone to overthinking. Test before adopting broadly** |

and: *"`max` provides the deepest reasoning with **no constraint on token spending**."*

Putting `max` on 91 agents at once **is** adopting broadly without testing. `xhigh` is the
highest level on the documented scale (`low, medium, high, xhigh, max`) that carries no
such caveat. `max` remains a legal, documented value and is still accepted by the fences —
what changed is that nothing in this corpus sits at it without the owner deciding so again.

### The caveat that inverts

`xhigh` is **not supported on every model, and `max` is**:

```
Fable 5 · Sonnet 5 · Opus 4.8 · Opus 4.7   ->  low, medium, high, xhigh, max
Opus 4.6 · Sonnet 4.6                      ->  low, medium, high,        max
```

> *"If you set a level the active model does not support, Claude Code falls back to the
> highest supported level at or below the one you set. For example, `xhigh` runs as `high`
> on Opus 4.6."*

So on a pinned older model, `xhigh` **silently drops two steps to `high`** while `max`
would have held — nothing errors, the agent simply thinks less, and every assertion in the
fence still passes. For a pinned older model, `xhigh` is strictly worse than `max`.

This does not bite today, and that is **measured, not assumed**: all 123 agents declare a
model *alias* (`opus`, `sonnet`), zero pin a version, and those aliases resolve to models
that support `xhigh`. The fence case *"every agent declares a model ALIAS, never a pinned
model version"* is the tripwire for the day that stops being true. It is a **warning, not
a ban** — pinning a version is a decision the owner has not made, and the fence does not
make it for him.

## Test invariants

`tests/architecture-invariants.test.js` enforces:
1. Exactly one agent has `role: top-level-coordinator` (CTO Chief).
2. Every Tier 1 sub-orchestrator declares `reports_to: cto-chief`.
3. Every Tier 2 specialist (converted leaf agents → skills) declares `tier: 2`, `effort_budget`, `parallel_safe`, `dispatch_protocol: v1`.
4. The synthesizer agent exists at `agents/coordinator/synthesizer.md` with `tier: 1`.
5. No agent outside `agents/coordinator/cto-chief.md` claims `role: top-level-coordinator`.

[`tests/no-tier-3.test.js`](../tests/no-tier-3.test.js) enforces the absence of Tier 3:
1. `agents/scouts/` does not exist.
2. No agent declares `model: haiku`.
3. No agent declares `short_circuits:` — no agent may suppress another agent.
4. The dispatch schema defines no `scout_response` and caps `target_tier` at 2.
5. No live spec or source points at a deleted pre-screen agent.
