---
approved_by: human
approved_at: 2026-05-14T16:20:27.830Z
gate_crossed: functional → implementation
---

---
title: "B2 — Leaf-Node Agents → Skills + 360-Skill Sweep"
created: "2026-05-14T00:00:00Z"
priority: HIGH
type: feature
parent_vision: ctoc-v7-opus-47-modernization
program: ctoc-v7
order: 5
depends_on:
  - A1-canvas-layer
  - A2-three-section-dashboard
  - C1-pretooluse-enforcement-hook
  - B1-orchestrator-agent-modernization
---

# Functional Plan: B2 — Leaf-Node Agents → Skills + 360-Skill Sweep

> Created: 2026-05-14
> Status: Draft
> Author: vision-decomposer + product-owner (dogfood)

---

## 1. ASSESS — Problem Understanding

### Business Context
Anthropic's current architectural guidance separates **agents** (orchestrators of multi-step workflows) from **skills** (auto-loaded reusable domain expertise). CTOC currently classes everything as agents — including many leaf-node executors that do one job and stop (quality reviewers, test writers, doc generators, scanners). These are properly skills: lighter context, auto-loadable, cross-surface (Claude.ai / Code / API).

Separately, CTOC's 360 existing skill files were written across multiple Claude versions and need a 4.7 alignment sweep (literal-instruction patterns, adaptive-thinking awareness where applicable, task budgets).

### Current State
- 86 agents in `agents/`, ~50+ are leaf-node single-job executors
- 360 skills in `skills/` covering languages, frameworks, and tools
- No systematic audit of which "agents" are properly skills
- Skill files vary widely in format, completeness, and 4.7-alignment

### Impact
- **Primary**: Leaf-node "agents" burn context unnecessarily — every invocation loads orchestrator-level context for what should be a lightweight skill load
- **Secondary**: Skills don't follow current Anthropic best practices, missing auto-load triggers and 4.7 patterns
- **Tertiary**: CTOC's architectural model diverges from Anthropic's current recommended split, confusing new contributors

---

## 2. ALIGN — Business Alignment

### Business Goals
1. Conservative agent → skill conversion — only obvious leaf-nodes move
2. Lock the converted list at Gate 1 (no scope creep mid-sweep)
3. Modernize all 360 skills for Opus 4.7 patterns
4. Preserve backward compatibility — pre-v7 plans referencing converted agents still work (alias mechanism or update plans)

### Success Metrics
- [ ] **M1**: Conservative-conversion list locked at Gate 1 with exact agent file paths (estimated: ~40-50 agents)
- [ ] **M2**: Each converted agent deleted from `agents/` and recreated as skill in `skills/` with: proper frontmatter (description, when_to_load triggers, related skills), 4.7-aligned prompt, same job semantics
- [ ] **M3**: All 360 existing skills audited; updated entries have 4.7-aligned patterns (literal instructions, declared scope, link to related skills)
- [ ] **M4**: Test suite passes (`node --test tests/*.test.js` → `# fail 0`)
- [ ] **M5**: Backward compatibility — any plan referencing a converted-agent name still resolves (alias mechanism in `src/lib/agent-resolver.js`)
- [ ] **M6**: Skill auto-load triggers tested — invoking via natural language correctly loads the right skill

### Stakeholders
| Stakeholder | Role | Approval Needed |
|---|---|---|
| CTOC Chief | Approves final conversion list at Gate 1 | Yes (Gate 1 + Gate 2) |
| Skills system | Subject of sweep | Programmatic |
| Pre-v7 plans referencing converted agents | Backward-compat constraint | Implicit via alias mechanism |
| Existing skill files | Subject of audit | Programmatic |

### Constraints
- Conservative approach — only obvious leaf-nodes convert (no aggressive aggressive conversion)
- Cross-platform skill files (no OS-specific assumptions)
- Backward compatibility — converted-agent references in pre-v7 plans must still resolve
- No new external dependencies
- Each converted skill must pass through 10-round integrator+critic (same as orchestrators in B1)

---

## 3. CAPTURE — Requirements

### Functional Requirements
| ID | Requirement | Priority | Acceptance Criteria |
|---|---|---|---|
| FR-1 | Lock conversion list at Gate 1 | Must | Document `plans/implementation/B2-conversion-list.md` locks exact agent file paths to convert. Estimated set: 14 quality reviewers, test writers/runners (~10), doc generators (~5), security scanners (~10), specialized leaf-nodes (~10) |
| FR-2 | Convert agents to skills | Must | For each agent in conversion list: delete from `agents/`, create skill at `skills/<category>/<name>.md` with: description, when_to_load triggers, prompt body |
| FR-3 | Skill frontmatter standard | Must | Every skill frontmatter has: `name`, `description` (one-line, used for auto-load matching), `when_to_load` (trigger conditions list), `related_skills` (cross-references), `effort_level` (for 4.7), `model_optimized_for: opus-4-7` |
| FR-4 | Backward-compat alias mechanism | Must | `src/lib/agent-resolver.js` maps old agent names to new skill names. When a pre-v7 plan references `agents/quality/code-reviewer`, it resolves to `skills/quality/code-reviewer` |
| FR-5 | 360-skill audit | Must | All 360 skill files audited against checklist: (a) frontmatter complete? (b) literal instructions? (c) prompt < 4k tokens? (d) trigger conditions explicit? (e) related skills cross-referenced? |
| FR-6 | 360-skill modernization | Must | Skills failing audit are updated to pass. Updates committed in batches (per language/framework category) to keep PRs reviewable |
| FR-7 | 10-round integrator+critic per converted skill | Must | Each converted skill gets the same 10-round treatment as orchestrators in B1. Diff captured under `.ctoc/audit/skill-conversion/<name>.diff.md` |
| FR-8 | Skill loading tests | Must | New tests in `tests/skill-loading.test.js` verify: (a) converted skills auto-load on natural-language triggers, (b) old agent names resolve to new skills via alias, (c) skill frontmatter validates |
| FR-9 | Update CLAUDE.md skill-system section | Must | CLAUDE.md gets a "Skill System" section documenting the agents/skills split and when to add each |
| FR-10 | Update marketplace metadata | Should | `.claude-plugin/marketplace.json` reflects the new skill set if necessary |

### Non-Functional Requirements
| ID | Requirement | Target |
|---|---|---|
| NFR-1 | Test stability | All 40 test files + new skill-loading tests pass (`# fail 0`) |
| NFR-2 | Skill size | Each skill prompt < 4k tokens |
| NFR-3 | Cross-platform | Skill files contain no OS-specific assumptions |
| NFR-4 | Backward compatibility | Pre-v7 plans referencing converted-agent names still work (via alias) |
| NFR-5 | Auto-load accuracy | ≥90% precision on test corpus of natural-language triggers |

### User Stories
```
As Claude needing to review code in a CTOC project
I want the code-review skill to auto-load when I'm reviewing code
So that I get reviewer-level context without paying agent-level cost

As a CTOC Chief reading CLAUDE.md
I want a "Skill System" section that explains the agents/skills split
So that I know whether my new capability should be an agent or a skill

As a pre-v7 plan referencing `agents/quality/code-reviewer`
I want my reference to resolve correctly after conversion
So that I don't break on upgrade

As a contributor adding a new quality check
I want clear guidance that "this is a skill, not an agent"
So that I don't add 87th agent when a skill is the right form
```

### Out of Scope
- Orchestrator agent modernization (handled in B1)
- New agent categories
- Aggressive conversion — only obvious leaf-nodes convert in v7
- Auto-conversion tooling — human decides which agents convert
- Wholesale rewrite of any single skill — modernization, not redesign
- Changes to step labels or gates

---

## Approval Checklist

- [ ] Business problem clearly defined
- [ ] Success metrics measurable
- [ ] Requirements complete and prioritized
- [ ] Stakeholders identified
- [ ] Constraints documented
- [ ] Scope boundaries clear

---

## Approval

**Status**: Pending Approval (Gate 1: functional → implementation)

---

*Iron Loop Steps 2-3-4: ASSESS, ALIGN, CAPTURE complete.*


---

## Implementation Refinements (Critic Round 1)

### I14 — Backward-compat alias = REDIRECT AGENT FILES (not JS resolver)
Claude reads agent files directly (markdown), not JS modules. Resolver must be filesystem-based.

After converting `agents/quality/code-reviewer.md` to `skills/quality/code-reviewer/SKILL.md`, replace the original `agents/quality/code-reviewer.md` with a stub:

```markdown
---
name: code-reviewer
status: redirected-to-skill
target_skill: quality/code-reviewer
---

This agent has been promoted to a skill. Load skills/quality/code-reviewer/SKILL.md instead.
When invoked via the old agent path, follow the skill's instructions.
```

When Claude invokes the old agent name, it sees the redirect note and follows the target skill. Test that this works in practice; if Claude doesn't auto-redirect, change behavior to: keep the original agent file with a "wraps skill" note (single source of truth in the skill, the agent file just loads + delegates).

### Skill loading test must verify auto-load works
Per FR-8, `tests/skill-loading.test.js` must verify that natural-language prompts containing `when_to_load` triggers cause the skill to load. This may require integration test via Claude Code SDK, or a stub that validates the frontmatter matcher logic.
