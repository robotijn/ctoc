---
title: "CTOC v7 — Opus 4.7 Modernization Sweep (Vision B)"
created: "2026-05-14T00:00:00Z"
priority: HIGH
type: vision
status: draft
program: ctoc-v7
order: 3
siblings:
  - ctoc-v7-business-first-architecture
  - ctoc-v7-mandatory-pipeline-enforcement
depends_on:
  - ctoc-v7-business-first-architecture
  - ctoc-v7-mandatory-pipeline-enforcement
approved_by: human
approved_at: 2026-05-14T00:00:00Z
gate_crossed: vision → done (decomposed)
dogfood_retro: true
status: decomposed
---

# CTOC v7 — Opus 4.7 Modernization Sweep (Vision B)

## The Load-Bearing Principles

1. **Pre-todo is context-building. Todo+ is execution.** Every agent prompt must articulate which side of that line it sits on.
2. **No-stub rule.** When an agent hits ambiguity, it makes a **documented reasonable choice** and continues. Stubs are forbidden. Working code is required.
3. **Async overnight loop.** No synchronous "stop and ask the user." Documented choices flow through review; wrong choices kick back to the relevant phase. The pipeline drains while the user sleeps.
4. **Literal interpretation.** Opus 4.7 follows instructions to the letter. Every agent prompt must be explicit, with declared effort level and acceptance criteria.

## Problem Statement

CTOC has accumulated **86 agents across 19 categories** and **360 skill files**. They were written across multiple Claude versions and exhibit drift:

- **Agent prompts are uneven** — some declare effort, most don't; some declare acceptance criteria, most don't; few mandate "read the full plan ancestry first"
- **Many "agents" are really skills** — the 14 quality reviewers, test writers, doc writers don't orchestrate; they execute one job. They burn context as agents and would be lighter as skills
- **No async loop** — agents currently block synchronously when ambiguous. This breaks overnight autonomous mode
- **No "context ancestry" reading** — agents read the current plan but not the upstream vision/canvas/functional. They miss WHY context
- **Skills lack 4.7-specific patterns** — adaptive thinking, task budgets, literal-instruction patterns are absent

Opus 4.7 changes the calculus: it's more literal, more capable when given explicit instructions, but also drifts more silently when given vague ones. CTOC's agent/skill library needs a sweep.

## Vision

A **systematic modernization** of every agent and every skill:

1. **Audit every agent**: catalog effort level, acceptance criteria, ancestry-reading instructions, async-choice protocol, 4.7-specific patterns
2. **10-round integrator+critic per agent** (mirroring Iron Loop Step 7's pattern): one critic challenges, one integrator absorbs, 10 rounds until convergence
3. **Conservative agents→skills conversion**: leaf-node single-job agents (quality reviewers, test writers, doc writers, scanners) move to skills. Orchestrators stay as agents (vision-advisor, product-owner, implementation-planner, integrator, critic, implementer)
4. **Adopt async overnight protocol** in every agent prompt: hit ambiguity → document choice in `# Decisions Taken Under Ambiguity` section → continue → kickback handles wrong calls
5. **Mandatory ancestry read** for every step-N agent: read the chain back to vision before executing
6. **Declare effort level** explicitly per agent (xhigh for design/migration/review; medium for classification/formatting; low for trivial extraction)
7. **Task budgets** for long-running agents (implementer, integrator+critic loops)

## Success Criteria

1. Every agent file declares: `effort: xhigh|high|medium|low`, `reads_ancestry: true|false`, `async_choice_protocol: enabled`
2. Every agent prompt includes the no-stub rule, async-choice instructions, and ancestry-read mandate (where applicable)
3. 10 rounds of integrator+critic completed per agent, with diff captured in `.ctoc/audit/agent-modernization/<agent>.diff.md`
4. Agents converted to skills are deleted from `agents/` and recreated under `skills/` with proper frontmatter
5. Conservative-conversion list approved at Gate 1 — only obvious leaf nodes move
6. Existing 16-step Iron Loop labels unchanged; agent prompts updated, not the step structure
7. All tests pass after the sweep: `node --test tests/*.test.js` shows `# fail 0`
8. CLAUDE.md updated with the four load-bearing principles
9. Backward compatibility: pre-v7 plans process correctly with the modernized agents
10. Cross-platform: agent prompts contain no shell-specific assumptions

## Target Users

- **The agents themselves** — clearer prompts produce more deterministic behavior on Opus 4.7
- **Claude orchestrating the Iron Loop** — better-specified agents reduce drift across the 16 steps
- **Users running CTOC overnight** — the async-choice protocol is what enables genuine autonomous mode

## Scope

**In scope:**
- Audit + modernize all 86 agents in `agents/`
- Audit + modernize all 360 skill files in `skills/`
- Conservative agent→skill conversion (leaf-node single-job agents only)
- Update CLAUDE.md with the four load-bearing principles
- Update `IRON_LOOP.md` to describe the async-choice protocol
- Add `# Decisions Taken Under Ambiguity` section convention to plan templates
- New tests for the async-choice protocol — verify agents don't synchronously block on ambiguity

**Out of scope:**
- Changing the 16-step Iron Loop structure or labels
- Changing the 3 human gates
- New agent categories
- Wholesale rewrite of any single agent — the sweep is incremental modernization, not redesign
- Touching the marketplace install flow

## Key Decisions Already Made

- **Conservative conversion** — only obvious leaf-node single-job agents move to skills
- **10 rounds of integrator+critic per agent** — mirrors the proven Iron Loop Step 7 pattern
- **Run AFTER Visions A and C** — depends on new structure (A) and enforcement (C). The modernized agents are written knowing pipeline use is mandatory
- **No-stub rule is non-negotiable** — every agent's prompt must articulate "make a documented choice, never stub"
- **Async-choice protocol applies to ALL steps**, not just Step 10 (Implement) — vision-advisor, product-owner, planners, reviewers all defer-and-continue when ambiguous

## Conservative Conversion Candidates (Examples, Not Final)

Leaf-node agents likely to convert to skills (final list decided at Gate 1):

- 14 quality reviewers (code-reviewer, architecture-checker, complexity-analyzer, dead-code-detector, duplicate-code-detector, etc.)
- Test writers (unit-test-writer, integration-test-writer, e2e-test-writer, property-test-writer)
- Test runners (unit-test-runner, integration-test-runner, smoke-test-runner, etc.)
- Documenters (changelog-generator, documentation-updater)
- Scanners (secrets-detector, dependency-auditor, sast-scanner)

Stay as agents (orchestrators or long-running):

- vision-advisor, product-owner, implementation-planner, functional-reviewer, implementation-plan-reviewer
- integrator, critic (Iron Loop Step 7 loop drivers)
- implementer, self-reviewer, optimizer, verifier
- cto-chief (top-level coordinator)
- iron-loop-executor, iron-loop-critic, iron-loop-integrator

## Risks

| Risk | Mitigation |
|---|---|
| Sweep introduces silent behavior change in an agent users depend on | 10-round critic captures every change in a diff; user reviews per-agent before commit |
| Converted skills don't auto-load when needed | Skill frontmatter declares trigger conditions explicitly; tests verify load behavior |
| Async-choice protocol produces too many wrong calls | Kickback mechanism (plan returns to phase) handles wrong calls; morning review surfaces them; tune over time |
| Effort declarations push cost up | xhigh used only where 4.7 docs recommend (design, migration, review); medium/low for everything else |
| Backward compatibility breaks for pre-v7 plans | Backward-compat tests run before commit; modernization preserves existing step labels and gate logic |
| Sweep is one giant PR no one can review | Incremental — one or more agents per PR, each with its own integrator+critic diff |

## Open Questions (To Resolve During Functional Planning)

- What's the exact format of the `# Decisions Taken Under Ambiguity` section? Free-form markdown, structured YAML, or hybrid?
- Does the implementer write decisions to the plan file directly, or to a sibling `.decisions.md` file?
- Should the 10-round integrator+critic per agent run automatically (CI) or interactively (user reviews each round)?
- Conservative conversion list — should be locked at Gate 1, or evolve during implementation as we learn?
- Task budget defaults — what number of tokens for the implementer? For integrator+critic loops?
- Do we modernize skills in the same PRs as their related agents, or in a separate sweep?

## Dependencies

- Depends on [Vision A — business-first-architecture] (modernized agents must know about Business/Implementation/Execution sections)
- Depends on [Vision C — mandatory-pipeline-enforcement] (modernized agents are written knowing pipeline bypass is impossible without an escape phrase)
- WebSearch dependency: re-verify Anthropic's Opus 4.7 best-practice docs at sweep start (they evolve)
- No code dependencies beyond Visions A and C
