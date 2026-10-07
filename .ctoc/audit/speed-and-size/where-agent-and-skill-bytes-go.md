I measured all of it and wrote nothing to the repository. Most of the agent bytes come from two changes. On 17 July, 96 agents that had been one-paragraph pointers to their method files got full bodies, and four adversarial critic agents grew from about 5 KB each to 100–130 KB. Copied boilerplate is a smaller share than it looks: about 14% of agent bytes appear in three or more files, and about 21% appear in at least one other file.

## Where the agent bytes are (2,330,902 bytes, 125 files)

By group of files:
1. **The 96 agents that were one-paragraph pointers until 16 July:** 1,303,189 bytes (56%).
2. **The five adversarial critics** (gate, red-team, premortem, devil's-advocate, advocate): 586,307 bytes (25%).
3. **The other 24 agents** (coordinators, planning, pipeline, the three other iron-loop agents and the rest): 441,406 bytes (19%).

By kind of content, from a hand-labelled sample of 200 units (method in section 4):
1. Orders: about 1.07 MB (49%).
2. Reference material: about 0.62 MB (28.5%).
3. Examples: about 0.26 MB (12%).
4. History or rationale as whole sentences: about 0.14 MB (6.5%). A rough check suggests a similar amount again, about 0.13 MB, sits as reasons written inside order sentences.
5. Plain description that is neither an order nor reference: about 0.09 MB (4%).
6. Headings and blank lines: 75 KB. Frontmatter: 73 KB.

Duplication cuts across all of these. 497 KB of agent text (21.3%) also appears in at least one other agent or method file, and 333 KB (14.3%) appears in three or more. For method files the figures are 12.3% and 7.7%.

## 1. Repeated text across files

I matched eight-word windows across files, after making text lower-case and replacing each file's own name, version tags and link depth with placeholders. Ranked by the repeated bytes summed over all copies:

| # | Block | Files | Typical copy | Bytes in all copies |
|---|---|---|---|---|
| 1 | Advocate lens text, shared by `agents/iron-loop/advocate-critic.md` and `skills/iron-loop/advocate-lens/SKILL.md`. About 36 KB of it is also in `agents/iron-loop/devils-advocate-critic.md`. | 2 (3 for the shared part) | 66 KB | 171 KB across the three files |
| 2 | Method files: "Refinement Loop — critic mode" section (the warnings-are-critical rule) | 96 | 891 B | 90.8 KB; 71.6 KB of it word for word |
| 3 | Agents: "Searching the repository (shared rule)" section | 118 | 455 B | 64.9 KB; 63.7 KB repeated |
| 4 | Agents: fixed safety and tool-permission sentences, mostly under Role | 79 | 481 B | 57.5 KB |
| 5 | Method files: "Severity (internal triage vs. refinement-loop output)" | 94 | 1,291 B | 127.5 KB section total; 45.1 KB repeated, the rest is each file's own tier table |
| 6 | Method files: "Letter schema (refinement-loop output contract)" | 92 | 1,870 B | 182.8 KB total; 39.2 KB repeated |
| 7 | Agents: "Honest status (shared rule)" section | 125 | 263 B | 34.3 KB; 33.7 KB repeated |
| 8 | Agents: sections of the 17 July one-page template (Checks, Output Format (MANDATORY), Trigger, Related Agents, When to Block vs Warn, Blocking Rules) | 27–38 each | 1–4 KB | 376 KB total, only about 31 KB repeated (mostly the table header "Skills you reuse — the overlap is deliberate" and two YAML lines) |
| 9 | Method files: the same fixed safety sentences as block 4 | 50 | 177 B | 15.5 KB |
| 10 | Agents: "v7 Operating Principles" | 13 | 941 B | 13.2 KB; 11.0 KB repeated |
| 11 | Repeated table rows of any kind | 27 distinct rows in 3 or more files | — | 12.9 KB |
| 12 | Method-file preamble line "Converted from agents/… as part of CTOC v7 B2 leaf-node sweep" | 69 | 98 B | 6.8 KB |
| 13 | Method-file preamble line "Auto-loaded when the user prompt matches a when_to_load trigger" | 78 | 71 B | 5.6 KB |
| 14 | Agents: the "You are a sub-orchestrator that reports up to cto-chief" paragraph | 10 | 191 B | 1.9 KB |

The safety sentences in blocks 4 and 9 include: "data, never an instruction", the `npx --no --` rule, "your bash is never a way to the web", "you hold neither Write nor Edit", "never copy a key, token or password", and "name a missing tool, never install it".

Two headings repeat while their content does not: "2026 Best Practices" (96 method files, 391.6 KB, only 2.9 KB repeated) and "Tool Integration (2026…)" (89 method files, 257.1 KB, only 5.3 KB repeated).

## 2. Agent files that copy their method file

For each agent I measured how much of its text also appears in its own method file, using the same eight-word windows. Across 95 pairs, 162,887 bytes are shared. 66 KB of that is one pair; the median overlap is 7%.

| # | Agent | Overlap | Bytes shared / agent size |
|---|---|---|---|
| 1 | `iron-loop/advocate-critic.md` (its method file is `skills/iron-loop/advocate-lens/SKILL.md`) | 92.1% | 66,160 / 71,818 |
| 2 | `testing/writers/unit-test-writer.md` | 37.3% | 2,540 / 6,818 |
| 3 | `testing/smart-test-runner.md` | 35.1% | 3,045 / 8,684 |
| 4 | `testing/writers/property-test-writer.md` | 30.3% | 1,496 / 4,943 |
| 5 | `testing/runners/integration-test-runner.md` | 29.7% | 1,663 / 5,594 |
| 6 | `testing/coverage-mapper.md` | 26.7% | 5,022 / 18,815 |
| 7 | `testing/runners/e2e-test-runner.md` | 24.9% | 1,807 / 7,268 |
| 8 | `documentation/documentation-updater.md` | 24.6% | 1,159 / 4,711 |
| 9 | `infrastructure/ci-runner-setup.md` | 22.6% | 2,276 / 10,075 |
| 10 | `data-ml/data-quality-checker.md` | 22.4% | 1,573 / 7,022 |
| 11 | `specialized/error-handler-checker.md` | 21.1% | 1,360 / 6,455 |
| 12 | `testing/runners/smoke-test-runner.md` | 20.3% | 1,597 / 7,857 |
| 13 | `mobile/react-native-bridge-checker.md` | 19.7% | 820 / 4,154 |
| 14 | `quality/code-reviewer.md` | 19.2% | 1,560 / 8,144 |
| 15 | `specialized/resilience-checker.md` | 18.8% | 1,152 / 6,112 |
| 16 | `testing/runners/unit-test-runner.md` | 18.6% | 1,459 / 7,854 |
| 17 | `quality/quality-gate.md` | 18.2% | 2,408 / 13,261 |
| 18 | `quality/code-smell-detector.md` | 17.3% | 1,159 / 6,714 |
| 19 | `quality/complexity-reducer.md` | 16.0% | 2,323 / 14,505 |
| 20 | `mobile/ios-checker.md` | 14.8% | 764 / 5,159 |

- **What the copied parts are:** in the small testing agents, mostly "NO SILENT FAILURES" blocks and output formats.
- **Why the advocate agent copies its method file:** commit `94de74f5` (18 July) says the `skills:` preload did not put the method file into the agent's context, so the whole file was merged back into the agent. I took this from the commit message and did not test the preload myself.
- **devils-advocate-critic:** it has no method file of its own, but 36.5% of it (36.7 KB) is also in the advocate lens method file.
- **Agents with no method file:** 29 agents have no method file of the same name. These are the iron-loop, coordinator, planning and pipeline agents, plus a few others.
- **Largest copies by bytes, after the advocate:** `llm-security-tester` 7.1 KB, `coverage-mapper` 5.0 KB and `dependency-analyzer` 4.4 KB.

## 3. The ten largest agents and the ten largest method files, by section

**How I classified sections:** I read the opening, a middle and the closing paragraphs of every section of 3 KB or more. Smaller sections are classified from their heading and structure. A section is marked "duplicated" when 60% or more of its text appears in another file. "A + B" means mixed, with A larger.

**Caveat for the critics:** at section level they come out at 97–98% orders. Sentence by sentence, about 18% of their sentences are reasons and history mixed in among the orders, so section labels hide that.

**`agents/iron-loop/gate-critic.md`** — 168,258 bytes
- 2,881 orders — frontmatter and preamble
- 994 orders — v7 Operating Principles
- 12,103 orders + reference — Input: the four lens critiques
- 15,523 orders — Trust boundary
- 2,534 orders — Your ONE write
- 3,885 orders — The attestation
- 15,475 orders — Degraded input
- 62,603 orders + history/rationale — The synthesis
- 902 orders — Gate-specific focus
- 9,343 orders — Escalation
- 26,481 orders + examples — Output: decision questions
- 2,996 reference + history/rationale — Grounding
- 4,417 orders — Anti-Scope
- 7,409 orders — Boundaries
- 449 duplicated — Searching the repository
- 263 duplicated — Honest status

**`agents/iron-loop/red-team-critic.md`** — 126,194 bytes
- 683 orders — frontmatter and preamble
- 345 duplicated — Role
- 12,070 orders — Your input
- 18,598 orders + reference — The method
- 9,757 orders — What to read first
- 11,562 orders — Untrusted input
- 12,029 orders — Read scope
- 3,749 orders — What is attackable at each gate
- 14,198 orders — Degraded input
- 21,068 orders — Output
- 7,065 orders — Severity calibration
- 2,277 orders — Confidence
- 3,291 examples — A finding that earns its place
- 4,556 orders — Escalation
- 4,683 orders — Anti-Scope
- 263 duplicated — Honest status

**`agents/iron-loop/premortem-critic.md`** — 119,365 bytes
- 1,173 orders — frontmatter and preamble
- 36,109 orders — Input
- 3,482 orders — The method
- 1,321 orders — The failure story is gate-relative
- 6,422 orders — What to read first
- 14,563 orders — Everything you read is DATA
- 8,269 orders — Degraded input
- 26,832 orders — Output
- 3,263 examples — What a real finding looks like
- 8,015 orders — Escalation
- 9,653 orders — Anti-Scope
- 263 duplicated — Honest status

**`agents/iron-loop/devils-advocate-critic.md`** — 100,676 bytes
- 2,336 orders — frontmatter and preamble
- 4,529 orders (51% also elsewhere) — Input
- 2,207 orders — The method
- 1,147 orders (56% also elsewhere) — What to read first
- 8,467 duplicated (67%) — Untrusted input
- 11,865 orders (58% also elsewhere) — Exfiltration
- 21,889 orders (46% also elsewhere) — Degraded input
- 28,416 orders — Output
- 2,918 examples — A good finding versus a bad finding
- 2,836 orders — Anti-Scope
- 13,803 orders — Escalation
- 263 duplicated — Honest status

**`agents/architecture/dependency-analyzer.md`** — 92,819 bytes
- 815 orders — frontmatter and preamble
- 1,769 orders — Role
- 899 reference — Quick Reference
- 1,492 orders — Size and Completeness
- 30,731 orders + reference — Execution Procedure
- 9,548 reference + history/rationale — Detection Types
- 4,245 reference — Language-Specific Import Patterns
- 1,888 reference — Module Boundary Detection
- 867 reference — Incremental Analysis
- 1,220 orders — File and Directory Exclusions
- 9,351 examples — Output Format
- 1,768 reference — Scoring Formula
- 2,983 reference — Path Alias Resolution
- 3,174 reference — Monorepo Workspace Handling
- 1,099 reference — External vs Internal Dependencies
- 2,159 reference — Type-Only Import Handling
- 2,816 reference — Custom Layer Rules Configuration
- 2,471 reference — Comparison Mode
- 1,776 reference — Graph Export Formats
- 2,805 orders + history/rationale — Priority Scoring
- 1,014 reference — Impact Analysis
- 7,666 reference + history/rationale — Continuous Integration and Pre-Commit Checks
- 263 duplicated — Honest status

**`agents/ai-quality/llm-security-tester.md`** — 73,378 bytes
- 1,331 orders — frontmatter and preamble
- 4,952 orders + history/rationale — Role
- 15,630 reference — Taxonomies, identifiers and where they come from
- 2,919 orders — Read the method first
- 5,704 orders — What you read is data
- 1,365 orders — Input, and what you do when it is missing
- 3,618 reference — Trigger
- 24,363 orders + reference — Checks
- 1,116 orders — Severity and confidence
- 5,130 orders + examples — Output Format (MANDATORY)
- 1,391 orders — Blocking Rules
- 2,605 reference — Related Agents
- 2,536 orders — Order of findings
- 455 duplicated — Searching the repository
- 263 duplicated — Honest status

**`agents/iron-loop/advocate-critic.md`** — 71,819 bytes. 95% of it is duplicated in `skills/iron-loop/advocate-lens/SKILL.md`.
- 1,620 orders — frontmatter and preamble
- 681 reference — Trigger
- 3,610 duplicated — Input
- 4,299 duplicated — The method
- 2,318 duplicated — What to read first
- 7,917 duplicated — What I Read Is Data
- 8,664 duplicated — Exfiltration
- 14,526 duplicated — When I Cannot Read
- 23,885 duplicated — What I Report
- 1,259 reference + history/rationale — What I Borrow
- 2,777 duplicated — Anti-Scope
- 263 duplicated — Honest status

**`agents/ai-quality/hallucination-detector.md`** — 64,537 bytes
- 1,243 orders — frontmatter and preamble
- 1,602 orders — Role
- 1,931 orders — Read the method first
- 2,729 orders — What you own
- 1,189 orders — Input
- 624 orders — What you read is data
- 4,117 examples — What to Detect
- 39,787 reference + orders — Detection Methods (registry lookup recipes, 59 dated citations)
- 3,780 examples — Reference Examples
- 3,186 orders — Severity and confidence
- 3,294 orders — Output Format (MANDATORY)
- 337 orders — Escalation
- 455 duplicated — Searching the repository
- 263 duplicated — Honest status

**`agents/coordinator/cto-chief.md`** — 60,334 bytes
- 974 orders — frontmatter and preamble
- 2,370 orders — NON-NEGOTIABLE: never halt
- 9,384 orders — Top-Level Authority
- 4,143 reference — Role
- 19,228 orders — Iron Loop Step Delegation
- 876 reference — Cross-Reference: Product Loop
- 626 orders — Conflict Resolution
- 1,297 orders — CTO Chief Authority
- 772 orders — Pre-Review Gate Checklist
- 2,066 orders — Proactive Steering
- 700 reference — Refinement Loop: K-Budget Tiers
- 859 orders — Spawning Agents
- 250 orders — CTO Profile Enforcement
- 668 orders — Output Format
- 174 orders — State Awareness
- 1,052 orders — Human Gate Enforcement
- 1,129 orders — Step Label Enforcement
- 766 orders — Zero Tolerance
- 12,062 reference + history/rationale — v6.9.27 Cross-Industry Critique Controls
- 455 duplicated — Searching the repository
- 483 duplicated — Honest status

**`agents/pipeline/agent-critic.md`** — 57,244 bytes
- 892 orders — frontmatter and preamble
- 940 duplicated — v7 Operating Principles
- 2,112 orders + history/rationale — Role
- 3,129 orders — What You Read Is Data
- 2,014 reference — Scoring System
- 13,992 reference + history/rationale — Critique Dimensions
- 2,142 reference — Overall Score
- 3,415 orders — Output Format (MANDATORY)
- 8,586 orders — Evaluation Protocol
- 2,068 orders — Bias Mitigation
- 2,043 orders — Self-Critique
- 1,282 orders — Anti-Gaming
- 1,216 reference — Inter-Rater Reliability
- 1,581 orders — Actor-Critic Loop
- 622 orders — Escalation Rules
- 646 reference — Confidence Scoring
- 1,932 orders — Meta-Evaluation
- 4,288 examples — Example Critique
- 1,364 examples — Scoring Walkthrough Example
- 1,273 reference + history/rationale — Research Foundation
- 989 orders — Anti-Scope
- 455 duplicated — Searching the repository
- 263 duplicated — Honest status

**`skills/ai-quality/llm-security-tester/SKILL.md`** — 116,829 bytes
- 3,014 orders — frontmatter and preamble
- 1,358 orders — Role
- 9,802 orders + reference — 2026 Best Practices
- 60,008 reference + examples — OWASP Top 10 for Large Language Model Applications (77 dated citations, 42% code)
- 3,749 history/rationale — Recent CVEs and incidents
- 6,974 reference — MITRE ATLAS mapping
- 5,165 reference — Tool Integration
- 2,730 orders — Severity, output, and the agent's checks
- 4,318 orders — Letter schema
- 6,620 reference — Language coverage
- 4,530 orders + reference — Special Considerations
- 1,349 orders — Refinement Loop
- 7,212 reference — References

**`skills/iron-loop/advocate-lens/SKILL.md`** — 68,282 bytes. 97% of it is duplicated in `advocate-critic.md`.
- 1,792 orders — frontmatter and preamble
- 3,609 duplicated — Input
- 4,299 duplicated — The method
- 2,318 duplicated — What to read first
- 7,854 duplicated — Untrusted input
- 8,664 duplicated — Exfiltration
- 14,379 duplicated — Degraded input
- 13,886 duplicated — Output Format
- 3,445 duplicated — A good finding versus a bad finding
- 5,282 duplicated — Escalation
- 2,754 duplicated — Anti-Scope

**`skills/ai-quality/hallucination-detector/SKILL.md`** — 65,015 bytes
- 1,308 orders — frontmatter and preamble
- 404 orders — Role
- 15,623 reference + history/rationale — 2026 Best Practices
- 2,893 reference — Hallucination Categories
- 20,166 reference — 7-Language Coverage
- 3,642 orders — Detection Methods
- 10,356 reference — Tool Integration
- 3,464 reference — Common Hallucinations
- 431 orders — Output Format
- 2,643 orders — Severity
- 893 orders — Red Lines
- 2,162 orders — Letter schema
- 1,030 duplicated — Refinement Loop

**`skills/security/incident-responder/SKILL.md`** — 55,953 bytes
- 1,354 orders — frontmatter and preamble
- 2,146 orders — Role
- 11,335 reference + orders — 2026 Best Practices (NIST)
- 5,751 reference — Incident classes and runbook outlines
- 4,596 orders — Categories
- 17,337 reference — Implementation snippets (seven languages)
- 1,690 orders — Methodology
- 2,462 reference — Tool Integration
- 1,127 orders — Severity
- 1,851 examples — Output Format
- 1,922 reference + history/rationale — Special Considerations
- 3,266 orders — Letter schema
- 1,116 duplicated — Refinement Loop

**`skills/ai-quality/ai-code-quality-reviewer/SKILL.md`** — 51,909 bytes
- 1,761 orders — frontmatter and preamble
- 1,462 orders — Role
- 5,532 orders + reference — 2026 Best Practices
- 4,109 examples — General review examples
- 30,665 reference + examples — Review categories
- 1,905 orders — Quality Checklist
- 656 orders — Output Format
- 2,700 reference — Tool Integration
- 997 orders — Severity
- 906 orders — Red Lines
- 1,216 duplicated — Refinement Loop

**`skills/architecture/dependency-analyzer/SKILL.md`** — 49,429 bytes
- 1,318 orders — frontmatter and preamble
- 1,404 orders — Role
- 4,404 reference + history/rationale — 2026 Best Practices
- 1,373 reference — Categories
- 1,242 reference — Quick Reference
- 746 orders — Size
- 15,247 orders + reference — Execution Procedure
- 449 reference — Layer Hierarchy
- 10,531 reference — 7-language coverage
- 4,062 reference — Tool Integration
- 3,277 examples — Output Format
- 955 orders — Severity
- 2,898 orders — Letter schema
- 601 orders — Red Lines
- 922 duplicated — Refinement Loop

**`skills/saas/stripe-subscriptions/SKILL.md`** — 48,349 bytes
- 1,026 orders — frontmatter and preamble
- 448 orders — Role
- 5,907 orders + reference — 2026 Best Practices
- 2,264 reference — Categories
- 12,885 reference — Implementation pattern, TypeScript
- 5,012 reference — Implementation pattern, C#
- 4,384 reference — Implementation pattern, Java
- 3,465 reference — Implementation pattern, Python
- 2,255 reference — SQL companion
- 2,665 history/rationale — Self-critique (v1 → v2 reconciliation)
- 1,030 orders — Severity
- 1,750 reference — Tool Integration
- 2,157 orders — Letter schema
- 592 reference — OWASP mapping
- 1,618 reference — Sources
- 891 duplicated — Refinement Loop

**`skills/compliance/sbom-cra-checker/SKILL.md`** — 44,668 bytes
- 1,361 orders — frontmatter and preamble
- 754 orders — Role
- 8,715 reference + orders — 2026 Best Practices
- 778 orders + history/rationale — Core Principle
- 12,595 orders + reference — Categories
- 6,398 reference — Language / Toolchain Coverage
- 2,817 reference — Tool Integration
- 1,614 orders — Severity
- 1,559 examples — Output Format
- 2,082 orders — Special Considerations
- 2,907 orders — Letter schema
- 1,106 duplicated — Refinement Loop
- 1,982 reference — Sources

**`skills/testing/playwright-qa/SKILL.md`** — 43,400 bytes
- 865 orders — frontmatter and preamble
- 337 orders — Role
- 4,036 orders — 2026 Best Practices
- 1,030 orders — Decision Framework
- 1,275 orders — Selector Strategy
- 18,967 reference + examples — Categories (BAD / SAFE per language)
- 1,597 reference — Page Object Model
- 981 reference — Test Data Management
- 903 reference — Visual Regression
- 1,104 reference — Authentication via Storage State
- 766 reference — Performance Budgets
- 440 reference — Cross-Browser Matrix
- 709 orders — Flaky Investigation
- 3,453 reference — Tool Integration
- 1,211 orders — Red Lines
- 1,369 orders — Severity
- 916 examples — Output Format
- 1,086 orders — Special Considerations
- 1,430 orders — Letter schema
- 925 duplicated — Refinement Loop

**`skills/saas/supabase-data/SKILL.md`** — 40,749 bytes
- 924 orders — frontmatter and preamble
- 1,008 orders — Role
- 5,917 orders — 2026 Best Practices
- 9,167 reference — Implementation pattern
- 11,759 reference — 7-Language BAD/SAFE pairs
- 2,454 reference — Categories
- 1,896 reference — Tool Integration
- 1,645 orders — Severity
- 1,328 orders — Letter schema
- 1,484 orders — Critical pitfalls
- 974 reference — Drift detection in CI
- 1,301 reference — Sources
- 892 duplicated — Refinement Loop

## 4. How much of the agent text is examples, history and orders

**Method:**
- I split every agent file into units: one prose sentence, one table row, or one whole code block.
- I drew two independent random samples of 100 units each, with each unit's chance of being picked proportional to its size, so the shares estimate shares of bytes.
- I labelled all 200 units by reading them, before looking at any automatic label.
- The base is 2,183,655 bytes of content, which excludes headings, blank lines and frontmatter.

| Kind | Share | Bytes (95% range) |
|---|---|---|
| Orders | 49.0% ± 6.9 | 1.07 MB (0.92–1.22 MB) |
| Reference | 28.5% ± 6.3 | 0.62 MB (0.49–0.76 MB) |
| Examples | 12.0% ± 4.5 | 0.26 MB (0.16–0.36 MB) |
| History or rationale | 6.5% ± 3.4 | 0.14 MB (0.07–0.22 MB) |
| Description | 4.0% ± 2.7 | 0.09 MB |

- **The two samples agree:** orders 51 and 47, reference 29 and 28, examples 10 and 14, history 5 and 8.
- **The critics differ from the rest.** Within the five critics (45 units): 73% orders, 18% history or rationale, 2% examples. In the other 120 agents (155 units): 42% orders, 37% reference, 15% examples, 3% history.
- **Error beyond the sample size:**
  - I am the only labeller, and about 15% of the units were judgement calls. Examples: trigger tables (reference or orders), output templates (orders or examples), dated citations (reference or history).
  - Labels are per sentence, so a sentence like "never do X, because Y" counts as orders. A rough measure finds that about 12% of the bytes in order sentences come after a "because" or similar word, which is about 0.13 MB of extra rationale. That measure is crude.
- **I discarded my automatic classifier.** It agreed with the hand labels on only 102 of 200 units, so none of its totals are used above.

## 5. The growth from 3 KB to 15 KB

**The 1 July average was a mix of two very different kinds of file.** There were 114 agent files totalling 365,771 bytes:
- 86 were one-paragraph pointers, about 220 bytes each ("This agent's logic lives at skills/…/SKILL.md. Read that file in full").
- The other 28 were full agents averaging 12.4 KB.

**Total agent size by date:**

| Date | Files | Bytes |
|---|---|---|
| 15 July | 124 | 396,418 |
| 18 July | 123 | 1,694,794 |
| 1 August | 124 | 1,933,369 |
| Today | 125 | 2,330,902 |

**Largest additions between 10 July and 5 August:**
1. **`247c9c52`, 17 July: +1,275,979 bytes over 128 files.**
   - 97 pointer agents got full bodies, adding 842 KB.
     - 402 KB of the new text (47%) is those agents' own text from before May, when they were turned into pointers. The largest restored part is 101 KB of old "Output Format" report templates.
     - About 460 KB is new. 431 KB of the new text is in eight sections of the one-page template: Checks 108 KB, Output Format (MANDATORY) 96 KB (mostly worked sample findings in YAML), Role 54 KB, frontmatter 54 KB, Trigger 36 KB, Blocking Rules 33 KB, Related Agents 26 KB, When to Block vs Warn 24 KB.
     - Only 8% of the new text is also in the agents' method files.
   - The four critics grew from 4–6 KB each to 100–130 KB, adding 456 KB. The new text is input contracts, trust-boundary and read-scope rules, degraded-input tables, output contracts and escalation tables.
   - The commit message is mainly about fixing how three quality gates read test output. It mentions the new template in one line and does not mention the critics growing.
2. **`9a8734b5`, 24 July: +76 KB over 102 files.** A corpus-wide quality pass that checked claims against live sources. The gains are spread out, the largest being Role (+7.6 KB).
3. **`94de74f5`, 18 July: +65 KB.** The advocate lens method file was merged back into the advocate agent, as described in section 2.
4. **`d26b4396`, 18 July: +36 KB.** The advocate lens was created, and gate-critic went from three lenses to four.
5. **`e41f2b3a`, 31 July: +33 KB.** The honest-status section was added to 123 agents.
6. **`c5db0fcd`, 16 July: +20 KB.** The critic agents were created.
7. **Everything else in the window is under 8 KB per commit.** Two commits removed bytes: `462e6d8b` (−14.3 KB) and `f59f0fe9` (−5.4 KB).

**After 5 August, +397 KB:**
- Three rounds of improvements to single agents: `dependency-analyzer` +61 KB, `hallucination-detector` +56 KB, `llm-security-tester` +54 KB, `ai-code-quality-reviewer` +24 KB.
- The 6 October tool-permission commits added about 170 KB, which is where the fixed safety sentences (block 4 in section 1) came from.

**Limits:**
- I measured the working tree, which includes the uncommitted `dependency-analyzer` edit (HEAD is 2,329,017 bytes).
- Duplication is counted with exact eight-word windows, so reworded copies are missed. With five-word windows, agent-to-method-file overlap rises from 206 KB to 264 KB.
- The section labels in section 3 and the sample in section 4 rest on my reading alone; no second person checked them.

Everything is in `<temporary folder>`. Start with `HEADLINE_NUMBERS.md`; then:
- `repeated_blocks.json` for section 1
- `item2_agent_vs_own_method_file.json` for section 2
- `item3_table.txt` for section 3
- `validation_sample_labelled.json` for section 4
- `commit_section_deltas.json` and `wrapper_fill_by_section.json` for section 5
