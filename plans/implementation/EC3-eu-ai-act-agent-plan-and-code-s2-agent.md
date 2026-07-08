---
title: "EC3-s2 — eu-ai-act-agent.md (Tier-2 specialist: plan-ancestry inspection + code-scan wrapper) + content-contract test"
type: implementation
parent_plan: EC3-eu-ai-act-agent-plan-and-code
depends_on: EC3-eu-ai-act-agent-plan-and-code-s1-helpers
program: ctoc-eu-compliance
priority: HIGH
risk_level: HIGH
iron_loop: true
files:
  - agents/compliance/eu-ai-act-agent.md
  - tests/eu-ai-act-agent.test.js
---

# EC3-s2 — eu-ai-act-agent.md + content-contract test

> Slice 2 of EC3. The **Tier-2 specialist agent** that reads plan ancestry, provisionally
> classifies the AI system's EU AI Act risk tier, flags triggered obligations at the plan
> stage, delegates the code scan to the `ai-governance-checker` skill, and applies the
> EU-AI-Act output filter. **The agent prose is not `node --test`-executable** — so per
> the PI4 rule, the testable contract is asserted by a **content test**
> (`tests/eu-ai-act-agent.test.js`) that reads the agent markdown and asserts the
> load-bearing facts hold (gate reference, `max_subagents: 0`, references to the s1 helper
> functions by name, no re-stated skill rule, dates-from-profile). Depends on **s1** —
> the agent references s1's helper exports by name.

**Read before acting (CF1 / ancestry-read):** the parent index
`plans/implementation/EC3-eu-ai-act-agent-plan-and-code.md`; slice s1
(`...-s1-helpers.md`) for the exact helper export names/contracts; the real infra —
`src/lib/compliance-regime.js` (`shouldRunEuAiAct(projectRoot)` → boolean, fail-open
false), `skills/compliance/ai-governance-checker/SKILL.md` (the skill this agent wraps;
its letter schema + six phases + `defers_to`), the existing thin wrapper
`agents/compliance/gdpr-compliance-checker.md` (the house wrapper shape), and
`.ctoc/regulatory-regimes/eu-ai-act-high-risk.yaml`. Trust the file on disk over this
brief; surface drift.

---

## Implementation Details

### Architecture Decision

**The agent re-states NO rule from the skill.** All code-rule evaluation, the letter
schema, the scan phases, the classification decision tree, and every BAD/SAFE example
stay in `skills/compliance/ai-governance-checker/SKILL.md`. The agent (a) reads plan
ancestry (vision → canvas → functional → implementation) which the code-only skill
cannot; (b) calls the s1 deterministic helpers by name for the machine-checkable parts;
(c) invokes the full skill for the code scan and then applies `filterToEuAiAct()` to the
skill's output. This "wrap + delegate + filter" shape is why the content test can assert
"no skill rule is re-stated" as a contract.

**Gate first.** The agent's first action is: if `shouldRunEuAiAct(projectRoot)` (EC1,
`src/lib/compliance-regime.js`) is not `true`, exit immediately — no file reads, no
findings, no tool calls (AC "Profile absent — agent produces no output").

**`max_subagents: 0` preserved** — plan-ancestry reading is done by the agent itself, not
fanned out. Matches the skill's `effort_budget.max_subagents: 0`.

**Content test, not behavioral test, for the agent** (PI4). The prose cannot be executed
by `node --test`; a snapshot of "a section rendered" would be false-green. Instead the
content test asserts the **load-bearing contract facts** that, if broken, silently break
the agent: the gate function is named, `max_subagents: 0` is declared, the five s1 helper
functions are referenced by name (so the wiring cannot drift from s1), the enforcement
dates are sourced from the profile (not hardcoded literals in the agent), and no skill
scan-phase / letter-field definition is copied into the agent file.

### Dependency Graph

```
agents/compliance/eu-ai-act-agent.md
  --references-by-name--> src/lib/eu-ai-act-helpers.js exports        (s1 — must exist first)
  --gates-on------------> src/lib/compliance-regime.js shouldRunEuAiAct (EC1 — shipped)
  --wraps/delegates-to--> skills/compliance/ai-governance-checker/SKILL.md (existing)
  --cites-dates-from----> .ctoc/regulatory-regimes/eu-ai-act-high-risk.yaml (existing)
  --tested-by-----------> tests/eu-ai-act-agent.test.js               (this slice, content test)
depends_on: s1. Depth 2 (s1 → s2). No cycle.
```

### File Specifications

#### File: `agents/compliance/eu-ai-act-agent.md`
**Action:** CREATE
**Purpose:** Tier-2 specialist that adds plan-ancestry EU-AI-Act inspection on top of the code-only `ai-governance-checker` skill, gated on EC1, scoped to EU AI Act only via the s1 output filter.
**Change Type:** new-module (agent definition)

##### Frontmatter (the testable contract surface)
```yaml
name: eu-ai-act-agent
description: EU AI Act (Regulation (EU) 2024/1689) plan-inspection + code-scan specialist — provisionally classifies AI-system risk tier from plan ancestry, flags triggered obligations, wraps the ai-governance-checker skill for the code scan, and filters output to EU AI Act only.
tools: Bash, Read, Grep, Glob
model: opus
tier: 2
category: compliance
reports_to: cto-chief
dispatch_protocol: v1
reads_ancestry: true
effort_budget:
  max_subagents: 0
gated_by: shouldRunEuAiAct        # EC1 gate; agent no-ops when false
extends_skill: compliance/ai-governance-checker
regime_profile: eu-ai-act-high-risk
```

##### Body sections (prose; each backed by a content-test assertion where a contract exists)
- **Gate** — "First action: if `shouldRunEuAiAct(projectRoot)` is not true, exit immediately with no output." (Content test asserts the string `shouldRunEuAiAct` appears.)
- **Ancestry read** — read vision → canvas → functional → implementation; identify AI-system descriptions, intended purposes, deployment contexts.
- **Plan-stage classification** — call `classifyFromPlanText(planText)` (s1); emit an Inbox finding carrying `risk_class`, `annex_iii_category`, `regulation_ref`, the triggered-obligation list, and `confidence`. Prohibited match (Art. 5) → stop-ship finding `kind: prohibited-use-detected`, `severity: critical`. Chatbot → `kind: missing-transparency`, `regulation_ref: "EU-AI-Act Art. 50"`. GPAI provider → Chapter V Arts. 51–55 artifact list.
- **Code-stage scan** — invoke the full `ai-governance-checker` skill (all six phases), then apply `filterToEuAiAct(findings)` (s1) so only `regulation: "eu-ai-act"` findings remain; then `normalizeSeverity` + `routeFinding` (s1) each survivor.
- **Dates** — cite enforcement dates via `readEnforcementDates('.ctoc/regulatory-regimes/eu-ai-act-high-risk.yaml')` (s1); mark every date citation `unverified-this-run` (EC4 verifies live). NO literal date strings in the agent file.
- **Scope boundary** — owns EU AI Act only; NIST/ISO findings are dropped by the filter, never re-raised. `defers_to` mirrors the skill (`ml-model-validator`, `llm-security-tester`, `hallucination-detector`, `gdpr-compliance-checker`).
- **No new gate** — advisory findings only (Inbox / refinement-loop letter); the four human gates are untouched.

##### Dependencies (conceptual — the agent is markdown)
- References `src/lib/eu-ai-act-helpers.js` exports by name (s1).
- References `shouldRunEuAiAct` from `src/lib/compliance-regime.js` (EC1).
- Wraps `skills/compliance/ai-governance-checker/SKILL.md`.

##### Called By
- `.ctoc/operations-registry.yaml` entry (s3) makes the agent dispatchable by CTO Chief.

##### Error Handling
- Gate false → silent no-op (documented, not an error).
- The agent inherits the skill's fail behavior for the code scan; plan-ancestry read failures are reported as a finding, not a crash.

##### Cross-Platform Notes
- Agent prose only; no code. Any path it names uses forward-slash repo-relative form (`.ctoc/regulatory-regimes/...`) as the other agent/skill files do.

### Test Plan

#### Tests: `tests/eu-ai-act-agent.test.js`
**Action:** CREATE
**Framework:** `node:test` (`describe` / `it` / `assert/strict`) — **content-contract test** reading the agent markdown from disk.

##### Test Cases
1. **Agent file exists and parses frontmatter.** Read `agents/compliance/eu-ai-act-agent.md`; assert frontmatter `name: eu-ai-act-agent`, `tier: 2`, `category: compliance`.
2. **Gate is named.** Assert the body contains `shouldRunEuAiAct` (the agent must reference the EC1 gate). (Maps AC "runs only when shouldRunEuAiAct true".)
3. **`max_subagents: 0` declared.** Assert frontmatter `effort_budget.max_subagents` is `0`. (Maps design decision "max_subagents: 0 preserved".)
4. **References all five s1 helper functions by name.** Assert the body contains `classifyFromPlanText`, `filterToEuAiAct`, `normalizeSeverity`, `routeFinding`, `readEnforcementDates` — so the agent↔helper wiring cannot silently drift from s1.
5. **Wraps the skill, does not re-state it.** Assert the body references `compliance/ai-governance-checker` (delegation) AND assert it does NOT contain a copied scan-phase heading or letter-field enum (e.g. assert the six-phase heading text `Phase 6 — GPAI` and the letter-schema line `finding_id: <sha256` do NOT appear — a coarse but real "no rule re-stated" guard). (Maps AC "No rule from the skill is re-stated in the agent".)
6. **Dates are not hardcoded.** Assert the body does NOT contain literal enforcement-date strings (`2 Aug 2026`, `2 February 2025`, `2 Feb 2025`, `2 Aug 2025`) and DOES reference `readEnforcementDates` + the profile path `eu-ai-act-high-risk`. (Maps AC "Regulatory dates cited from profile, not hardcoded".)
7. **Scope isolation stated.** Assert the body references `eu-ai-act` as the owned regulation and mentions dropping NIST/ISO via the filter (contains `filterToEuAiAct` and `nist` / `iso` in the "dropped" context).
8. **No new gate.** Assert the body states advisory-only / no-new-gate (contains `Inbox` or `refinement-loop` and does NOT claim to add a human gate).

##### Coverage Targets
- Content test — coverage is of the assertion set, not executable lines. Every load-bearing contract fact above has an assertion. No skipped tests.

### Security Review

- [x] **Path traversal:** the content test reads a fixed repo-relative path (`agents/compliance/eu-ai-act-agent.md`) resolved from the project root; no untrusted path.
- [x] **Input validation:** N/A (agent is prose); the test validates file existence before asserting.
- [x] **No secrets:** none in the agent or test.
- [x] **Safe file operations:** test reads only; agent defines no writes.
- [x] **Error messages:** the agent's gate-false path is a silent no-op (no leak); scan errors flow through the skill's existing schema.
- [x] **Prototype pollution / command injection:** N/A — no code in the agent; test uses `safe-fs`/`fs.readFileSync` on a fixed path, no `exec`.

---

## Execution Plan (Steps 8–16)

### Step 8: TEST
- [ ] Write `tests/eu-ai-act-agent.test.js` — the 8 content-contract assertions above (RED first; they fail until the agent file exists). `node:test` + `assert/strict`; read the agent markdown via `fs.readFileSync` on the project-root-resolved path.

### Step 9: PREPARE
- [ ] Confirm s1 (`eu-ai-act-helpers.js`) exists and its export names are exactly `classifyFromPlanText`, `filterToEuAiAct`, `normalizeSeverity`, `routeFinding`, `readEnforcementDates` (the agent must name them identically). No new deps.

### Step 10: IMPLEMENT
- [ ] Create `agents/compliance/eu-ai-act-agent.md` — frontmatter + body sections per the File Specification. Reference the s1 helpers and `shouldRunEuAiAct` by name; delegate the code scan to the skill; cite dates ONLY via `readEnforcementDates`; no literal date strings; no copied skill rule/phase/letter-field. No stubs.

### Step 11: REVIEW
- [ ] Self-review against AC scenarios: gate named, `max_subagents: 0`, five helpers referenced, no skill rule re-stated, dates from profile, scope isolation stated, no new gate. Cross-check `defers_to` mirrors the skill.

### Step 12: OPTIMIZE
- [ ] Keep the agent thin — delegate maximally, duplicate nothing from the skill; prose is minimal and reasoning-cheap.

### Step 13: SECURE
- [ ] Verify: gate-false is a true no-op; no new human gate introduced; test reads a fixed path only. Lint the test (`--max-warnings 0`).

### Step 14: VERIFY
- [ ] `node --test tests/eu-ai-act-agent.test.js` → all 8 GREEN, 0 skipped. Then `node --test tests/*.test.js` → `# fail 0`. Typecheck + lint pass.

### Step 15: DOCUMENT
- [ ] The agent file is self-documenting; add a one-line header note that all EU-AI-Act rule logic lives in the skill and all machine-checkable rules in `src/lib/eu-ai-act-helpers.js`.

### Step 16: FINAL-REVIEW
- [ ] implementation-reviewer verifies the agent re-states no skill rule, honors `max_subagents: 0`, gates on EC1, and touches no human gate. Gate 3 approval batched at the EC3 parent level.

## Decisions Taken Under Ambiguity

- **Agent content test lives in `tests/eu-ai-act-agent.test.js` (the parent-plan's named test file).** The parent listed this file as covering helpers + agent; s1 took the helper unit tests into `tests/eu-ai-act-helpers.test.js`, so this file now holds the agent content-contract assertions only — a clean single-file-per-slice split.
- **"No rule re-stated" is asserted coarsely by absence of specific skill strings** (a phase heading, the `finding_id: <sha256` letter line). A perfect semantic diff against the skill is out of scope for a `node --test` content check; the coarse guard catches the common copy-paste regression and is honest about its bound.
- **`gated_by`/`extends_skill`/`regime_profile` are added as frontmatter keys** for machine-discoverability of the gate + wrapped skill + profile; they mirror the intent of the existing thin-wrapper `target_skill:` key while carrying the extra EC3 context.
