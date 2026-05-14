---
iron_loop: true
approved_by: human
approved_at: 2026-05-14T16:37:44.274Z
gate_crossed: implementation → todo
approved_by: human
approved_at: 2026-05-14T16:20:27.830Z
gate_crossed: functional → implementation
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
files:
  - "agents/quality/**"
  - "agents/testing/**"
  - "agents/security/**"
  - "agents/specialized/**"
  - "agents/documentation/**"
  - "skills/**"
  - "src/lib/agent-resolver.js"
  - "tests/skill-loading.test.js"
  - "tests/agent-resolver.test.js"
  - "CLAUDE.md"
  - ".claude-plugin/marketplace.json"
  - ".ctoc/audit/skill-conversion/**"
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


---

## 4. PLAN — Technical Approach

### Solution Overview
Two coordinated workstreams:
1. **Leaf-node agent → skill conversion** (conservative, list locked at Gate 1): convert ~30-40 single-job agents to skills under `skills/`. Original agent files become **redirect stubs** pointing to the skill (per I14 — Claude reads markdown, not JS, so the resolver must be filesystem-based).
2. **360-skill audit + modernization**: every existing skill file in `skills/` audited against a 5-point checklist (frontmatter complete, literal instructions, prompt <4k tokens, trigger conditions explicit, related-skills cross-references). Failing skills updated in batches per category.

### Technology Choices
| Component | Technology | Rationale |
|---|---|---|
| Conversion = redirect agent file | Markdown stub | Filesystem-based; no JS resolver needed; Claude reads agent path, finds redirect, follows to skill |
| Audit script | Pure Node.js script | One-shot use; output a checklist |
| Per-skill modernization | Direct file edit | Same pattern as B1 — batched per language/framework category |

### Architecture Decision Records

#### ADR-1: Conversion = filesystem redirect (per I14)
- **Context**: Claude reads agent files directly; JS resolver wouldn't be invoked
- **Decision**: After converting `agents/X/Y.md` → `skills/X/Y/SKILL.md`, replace original with stub: `---\nstatus: redirected-to-skill\ntarget_skill: X/Y\n---\nLoad skills/X/Y/SKILL.md instead.`
- **Consequences**: + No JS dependency. + Easy to undo (delete stub, restore original). + Easy to audit (find redirect files). − Two files per converted agent during the migration period

#### ADR-2: Locked conversion list (Gate 1 boundary)
- **Context**: Avoid scope creep mid-execution
- **Decision**: Concrete list below. Adding to it during execution requires a fresh Gate 1 approval
- **Consequences**: + Bounded scope. − Some agents may be discovered as candidates mid-execution but deferred

#### ADR-3: 360-skill audit produces a manifest before edits start
- **Context**: Editing 360 files blindly risks regressions
- **Decision**: First pass = audit only (produce `.ctoc/audit/skill-conversion/audit-manifest.json` listing each skill's pass/fail and missing checks). Second pass = edit only the failing skills
- **Consequences**: + Surgical edits, fewer breakages. + Audit is independently reviewable. − Two-pass = slower

#### ADR-4: Backward compatibility via redirect stubs, not JS alias
- **Context**: Pre-v7 plans reference `agents/quality/code-reviewer` etc.
- **Decision**: Original agent path remains in `agents/` but becomes a redirect stub. Claude opening the old path sees the redirect note and follows to the skill
- **Consequences**: + Zero breakage for pre-v7 plans. − Redirect stubs add noise to the agents/ tree (acceptable; they're small)

### Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Redirect stub format isn't followed by Claude | Medium | High | First convert 2-3 agents, test that Claude's invocation correctly follows the redirect. If not, fall back to keeping the old agent file as a thin wrapper |
| Skill auto-load triggers don't fire | Medium | High | Per FR-8, test natural-language triggers in `tests/skill-loading.test.js`. May require Claude Code SDK integration |
| 360-skill sweep produces churn without value | Medium | Medium | Audit-first approach: only edit failing skills |
| Conversion list grows during execution | Medium | Low | ADR-2: locked at Gate 1; additions require new approval |

---

## 5. DESIGN — Architecture

### Conservative Conversion List (locked at Gate 1)

| Category | Agent path | Count |
|---|---|---|
| Quality reviewers | `agents/quality/*.md` (code-reviewer, architecture-checker, complexity-analyzer, dead-code-detector, duplicate-code-detector, etc.) | ~14 |
| Test writers/runners | `agents/testing/writers/*.md`, `agents/testing/runners/*.md` | ~10 |
| Documenters | `agents/documentation/changelog-generator.md`, `agents/documentation/documentation-updater.md` | 2 |
| Security scanners | `agents/security/secrets-detector.md`, `agents/security/dependency-auditor.md`, `agents/security/sast-scanner.md` | 3 |
| Specialized leaf-nodes | `agents/specialized/*.md` (accessibility-checker, api-contract-validator, etc., as confirmed leaf-only) | ~10 |
| **TOTAL** | | ~39 |

### Skill Frontmatter Standard

```yaml
name: <skill-slug>
description: <one-line — used for auto-load matching by Claude>
when_to_load:
  - <trigger condition 1>
  - <trigger condition 2>
related_skills:
  - <other skill name>
effort_level: xhigh|high|medium|low
model_optimized_for: opus-4-7
```

### Redirect Stub Format (original agent location)

```markdown
---
name: <agent-name>
status: redirected-to-skill
target_skill: <skill-path>
---

This agent has been promoted to a skill. Load skills/<skill-path>/SKILL.md instead.
When invoked via the old agent path, follow the skill's instructions.
```

### Audit Checklist (per skill)

1. Frontmatter has `name`, `description`, `when_to_load`, `related_skills`?
2. Prompt body uses literal instructions (no vague "consider", "might")?
3. Total token count < 4k (rough heuristic: file size < 16KB)?
4. Trigger conditions explicit (`when_to_load` non-empty)?
5. Related skills cross-referenced (`related_skills` non-empty where applicable)?

Audit script produces `.ctoc/audit/skill-conversion/audit-manifest.json`:
```json
{
  "skills/languages/python.md": { "pass": false, "failing_checks": [1, 4] },
  "skills/frameworks/react.md": { "pass": true }
}
```

---

## 6. SPEC — Technical Specification

### File Changes

| File | Action | Description |
|---|---|---|
| `skills/<category>/<name>/SKILL.md` | Create per converted agent (~39 files) | Skill body with v7 frontmatter |
| `agents/<original>/<name>.md` | Modify per converted agent (~39 files) | Replaced with redirect stub |
| `src/lib/agent-resolver.js` | Create | Helper: given an agent path, return the skill path if redirected. Used by tooling that lists agents (Library area, etc.). NOT used by Claude's invocation path (which is filesystem-based). |
| `tests/agent-resolver.test.js` | Create | Tests: resolver returns skill path for redirect stubs; returns original path for un-converted agents |
| `tests/skill-loading.test.js` | Create | Tests: skills have valid frontmatter; auto-load triggers don't collide; redirect stubs point at existing skills |
| `.ctoc/audit/skill-conversion/audit-manifest.json` | Generate via script | Audit results, one entry per of 360 skills |
| `.ctoc/audit/skill-conversion/<skill>.diff.md` | Generate per modernized skill | Diff captured by 10-round critic |
| `CLAUDE.md` | Modify | New "Skill System" section explaining agent/skill split |
| `.claude-plugin/marketplace.json` | Modify if needed | Reflect new skill set if marketplace expects an inventory |

### Implementation Steps

1. [ ] Write `tests/agent-resolver.test.js` (TDD red)
2. [ ] Write `src/lib/agent-resolver.js`
3. [ ] Write `tests/skill-loading.test.js` (TDD red — schema validation)
4. [ ] Convert 2-3 quality reviewers as pilot batch; verify Claude follows redirects in practice
5. [ ] If pilot works: convert remaining 36-37 agents in 4-5 batches (per category)
6. [ ] If pilot doesn't work: fall back to keeping original agent files as thin wrappers ("This agent delegates to skills/X/Y — read that file and follow its instructions")
7. [ ] Generate skill audit manifest via script
8. [ ] Modernize failing skills in batches per category (languages, frameworks, tools)
9. [ ] Update CLAUDE.md "Skill System" section
10. [ ] Run full test suite; verify no regressions

### Test Plan

| Test Type | Coverage | Files |
|---|---|---|
| Unit | agent-resolver: redirect detection, path resolution | tests/agent-resolver.test.js |
| Unit | Skill frontmatter validation; redirect-stub structure | tests/skill-loading.test.js |
| Integration | Pre-v7 plan referencing converted-agent name resolves correctly | tests/skill-loading.test.js |
| Regression | All 40+ existing tests pass | tests/*.test.js |

### Dependencies

- A1, A2, A3, C1 — shipped; B2 modernized skills assume the v7 structure
- B1 — orchestrator agents modernized first; B2 leaf-node conversion follows
- No new external dependencies

### Rollback Plan

- Per-agent conversion is reversible: delete redirect stub, restore original agent file from git history
- Per-skill modernization is reversible per commit
- Audit manifest is a generated artifact; no rollback needed (regenerate as needed)

---

## Approval

**Status**: Pending Approval (Gate 2: implementation → todo)


---

## Execution Plan (Steps 8-16)

### Step 8: TEST (TDD Red)
- [ ] Write tests for the implementation
- [ ] Test error conditions
- [ ] Run tests - expect RED (failing)

### Step 9: PREPARE
- [ ] Install dependencies if needed
- [ ] Check prerequisites
- [ ] Verify dev environment ready
- [ ] Create directories/config if needed

### Step 10: IMPLEMENT
- [ ] Implement the feature according to requirements
- [ ] Add error handling
- [ ] Wire up integration points

### Step 11: REVIEW
- [ ] Self-review all new code
- [ ] Verify integration points work together
- [ ] Check error handling completeness

### Step 12: OPTIMIZE
- [ ] Remove redundant operations
- [ ] Optimize critical paths
- [ ] Simplify complex code

### Step 13: SECURE
- [ ] Validate inputs (no path traversal)
- [ ] Sanitize outputs
- [ ] No secrets in code
- [ ] Safe file operations

### Step 14: VERIFY
- [ ] Run lint + type check
- [ ] Run ALL tests (TDD Green)
- [ ] Check coverage >= 80%
- [ ] 0 skipped, 0 flaky tests

### Step 15: DOCUMENT
- [ ] Update relevant documentation
- [ ] Add JSDoc comments to new functions
- [ ] Update CHANGELOG if needed

### Step 16: FINAL-REVIEW
- [ ] Verify steps 8-15 completed correctly
- [ ] All quality checks passed
- [ ] Manual verification if needed
- [ ] Ready for human review


---

## Critic Round 2 Refinements (Discussion fixes)

Applied during the /ctoc:menu discuss step. Each item ties back to a numbered critique point.

### B2-1 — Conversion list enumerated (no more "estimated")

Actual files (read from disk on 2026-05-14):

**Quality reviewers (11):**
- agents/quality/architecture-checker.md
- agents/quality/code-reviewer.md
- agents/quality/code-smell-detector.md
- agents/quality/complexity-analyzer.md
- agents/quality/complexity-reducer.md
- agents/quality/consistency-checker.md
- agents/quality/dead-code-detector.md
- agents/quality/duplicate-code-detector.md
- agents/quality/performance-validator.md
- agents/quality/quality-gate.md
- agents/quality/type-checker.md

**Testing (14):**
- agents/testing/coverage-enforcer.md
- agents/testing/coverage-mapper.md
- agents/testing/playwright-qa.md
- agents/testing/quality-gate-runner.md
- agents/testing/smart-test-runner.md
- agents/testing/runners/e2e-test-runner.md
- agents/testing/runners/integration-test-runner.md
- agents/testing/runners/mutation-test-runner.md
- agents/testing/runners/smoke-test-runner.md
- agents/testing/runners/unit-test-runner.md
- agents/testing/writers/e2e-test-writer.md
- agents/testing/writers/integration-test-writer.md
- agents/testing/writers/property-test-writer.md
- agents/testing/writers/unit-test-writer.md

**Documentation (2):**
- agents/documentation/changelog-generator.md
- agents/documentation/documentation-updater.md

**Security (7):**
- agents/security/concurrency-checker.md
- agents/security/dependency-auditor.md
- agents/security/dependency-checker.md
- agents/security/input-validation-checker.md
- agents/security/sast-scanner.md
- agents/security/secrets-detector.md
- agents/security/security-scanner.md

**Specialized (11):**
- agents/specialized/accessibility-checker.md
- agents/specialized/api-contract-validator.md
- agents/specialized/configuration-validator.md
- agents/specialized/database-reviewer.md
- agents/specialized/error-handler-checker.md
- agents/specialized/health-check-validator.md
- agents/specialized/memory-safety-checker.md
- agents/specialized/observability-checker.md
- agents/specialized/performance-profiler.md
- agents/specialized/resilience-checker.md
- agents/specialized/translation-checker.md

**ACTUAL TOTAL: 45 agents to convert** (was estimated ~39).

### B2-2 — Reduced critic rounds for skills

10-round integrator+critic was inherited from B1's orchestrator pattern. For skills (shorter, simpler, single-purpose) it's overkill.

**Revised**: 3-round critic per converted skill. Reserve 10-round for genuinely complex cases discovered during conversion (e.g., a "leaf" agent that turns out to have orchestration concerns). Estimated load: 45 × 3 = 135 rounds — feasible in a multi-session sweep.

For B2b (skill modernization sweep), no per-skill critic. Audit identifies failing skills; updates are mechanical (add missing frontmatter, normalize triggers). A single round of self-review per category is sufficient.

### B2-3 — FR-4 reworded to clarify resolver role

**Updated FR-4**: `src/lib/agent-resolver.js` is **supplemental tooling** that:
- Powers Library area listing (knows which agents have been promoted to skills)
- Provides discovery / cross-link generation
- **NOT used by Claude's invocation path** — that's filesystem-based via the redirect stub (per ADR-1)

The backward-compat mechanism is ADR-1's redirect stub, not this resolver. The resolver is convenience tooling.

### B2-4 — Redirect-follow validation strategy

Cannot fully automate via Claude Code SDK (would require spawning a sub-Claude — out of scope for v7). **Compromise**:

1. Static test: tests/agent-resolver.test.js verifies redirect-stub structure and target-skill existence (catches broken stubs).
2. Manual smoke test documented in B2 plan: after each conversion batch, the implementer pastes "review my code" (or equivalent trigger) and verifies the converted skill's body appears in the response. Failure is logged to `.ctoc/audit/skill-conversion/redirect-failures.json`.
3. If failures > 0: switch the affected agents to **wrapper-fallback** mode (see B2-7 for clarified semantics).

### B2-5 — Skill sweep scope bounded

**Revised**: B2b ships **only the audit manifest** as a v7 deliverable. The actual modernization sweep:
- Each category (languages, frameworks, tools) gets its own follow-up commit AFTER v7 ships
- Categories are addressed when their owner has a real need (e.g., updating Python skill when starting a Python feature)
- No commitment to fix all 360 in v7

This converts B2b from "open-ended sweep" to "produce manifest + opportunistic fixing".

### B2-6 — Auto-load test corpus defined

`tests/skill-loading.test.js` includes a test-prompt corpus at the top of the file:

```js
const TRIGGER_CORPUS = [
  { prompt: 'review my code for issues', expects: 'code-reviewer' },
  { prompt: 'find dead code in this module', expects: 'dead-code-detector' },
  { prompt: 'run the unit tests', expects: 'unit-test-runner' },
  { prompt: 'check accessibility', expects: 'accessibility-checker' },
  { prompt: 'scan for secrets', expects: 'secrets-detector' },
  // ... 25-50 entries covering each converted skill
];
```

NFR-5 acceptance: ≥90% of corpus entries match expected skill via `when_to_load` frontmatter. Test runs each prompt through a simple matcher (`when_to_load` substring match) and counts.

### B2-7 — Wrapper-fallback semantics clarified

If pilot fails (Claude doesn't follow redirect stubs), the fallback agent file has **exactly this content** (no partial business logic):

```markdown
---
name: <agent-name>
type: wrapper
target_skill: <skill-path>
---

This agent's logic lives at skills/<skill-path>/SKILL.md.
Read that file in full, then follow its instructions.
```

The skill remains the **single source of truth**. The agent file is a one-line indirection — never has business content. This eliminates source-of-truth ambiguity.

### B2-8 — Middle-tier agents explicitly out of scope

Added to Out of Scope:
- **Middle-tier agents** (`agents/architecture/`, `agents/pipeline/`, `agents/devex/`, `agents/cost/`, `agents/infrastructure/`, `agents/frontend/`, `agents/mobile/`, `agents/data-ml/`, `agents/ai-quality/`, `agents/versioning/`, `agents/compliance/`) are **not** modernized in B2.
- Defer to a follow-up B3 vision if usage data shows these are leaf-nodes too.
- v7 ships with: B1 (orchestrators modernized) + B2 (45 leaf-nodes converted to skills) + 30+ agents unchanged.

### B2-9 — NFR-1 test count updated

**Revised NFR-1**: "All existing tests pass (`node --test tests/*.test.js` → `# fail 0`). Current count at B2 start: ~50 test files, ~879 tests. Adding tests in B2: `tests/agent-resolver.test.js`, `tests/skill-loading.test.js`."

### B2-10 — Execution plan steps de-duplicated

The boilerplate Steps 8-16 (from `applyIronLoop()`) overlap with the impl spec's Steps 1-3. **Resolution**:
- Boilerplate Steps 8-16 are the *checklist* the implementer ticks off.
- Impl spec Steps 1-10 are the *ordered work items*.
- Mapping: impl steps 1-3 (write tests) = boilerplate Step 8 TEST. Impl steps 4-9 (convert, audit, modernize, document) = boilerplate Steps 10 IMPLEMENT + Step 15 DOCUMENT. Impl step 10 (run tests) = Step 14 VERIFY.

This is cosmetic; both views coexist in the plan.

---

## Structural Recommendation Status

The B2 → B2a/B2b split was proposed but **not applied** in this round per the user's choice ("Edit B2 inline"). The fixes above tighten B2 as a single plan. If B2 execution surfaces fresh problems with the combined scope, the split can be reconsidered at that point (functional kickback → re-plan).
