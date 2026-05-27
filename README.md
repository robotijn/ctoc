<p align="center">
  <strong>CTO Chief</strong><br>
  <em>The CTO your AI never had.</em>
</p>

<p align="center">
  <a href="https://github.com/robotijn/ctoc"><img alt="GitHub" src="https://img.shields.io/badge/GitHub-robotijn%2Fctoc-blue"></a>
  <a href="LICENSE"><img alt="License: PolyForm Shield" src="https://img.shields.io/badge/License-PolyForm%20Shield-brightgreen.svg"></a>
  <img alt="Version" src="https://img.shields.io/badge/version-6.9.38-blue">
  <img alt="Platform" src="https://img.shields.io/badge/platform-Claude%20Code-purple">
  <img alt="Agents" src="https://img.shields.io/badge/agents-110-orange">
  <img alt="Skills" src="https://img.shields.io/badge/skills-421-blue">
  <img alt="Node" src="https://img.shields.io/badge/node-%3E%3D18-green">
</p>

CTO Chief is a Claude Code plugin that turns AI coding from "generate and pray" into disciplined engineering. Every feature follows a **16-step Iron Loop** — plan before code, test before ship, secure before deploy — wrapped by a **refinement loop** that drives findings (warnings included) to zero before you ever see the result. **110 agents** across **22 categories** route through a **4-tier architecture** (CTO Chief → sub-orchestrators → specialists → Haiku scouts), with **4 mandatory human gates**. The **421-file skill library** (99 Tier-2 specialist bodies + 322 reference files) has been brought to 2026 best-practices quality through a websearch → update → critique → update loop on every specialist — no invented statistics, sourced citations, 7-language coverage. The result: AI that writes production-quality code on the first try.

## Install

```
/plugin marketplace add https://github.com/robotijn/ctoc
/plugin install ctoc
```

> [!TIP]
> Enable auto-update: `/plugin` → Marketplaces tab → `robotijn` → Enable auto-update

## Quick Start

**1.** Start Claude Code:
```bash
claude
```

**2.** Open the dashboard:
```
/ctoc
```

That's it. CTO Chief detects your stack and shows a dashboard.

**3.** Tell Claude what you want to build:
```
I want a SaaS product with AI to help creative writers when they get stuck
```

CTO Chief starts with ideation — agents explore your idea with you, ask clarifying questions, and shape it into actionable plans. **Steps 1-7 are collaborative**: agents ask, you decide. **Steps 8-16 are automated**: agents execute, you review the result. Use numbered menus (`[1]`, `[2]`, `[3]`) to navigate.

> Already know exactly what you want? Just be specific: "Add a /health endpoint returning 200 OK" — CTO Chief skips ideation and goes straight to planning.

<!-- TODO: Record dashboard GIF with charmbracelet/vhs or gifski -->
<!-- <p align="center"><img src="docs/assets/dashboard-demo.gif" alt="CTO Chief in action" width="700"><br><em>From idea to tested, secure code in one session</em></p> -->

> [!NOTE]
> CTO Chief is open source and actively developed. [Issues](https://github.com/robotijn/ctoc/issues), [PRs](https://github.com/robotijn/ctoc/pulls), and [skill improvement suggestions](https://github.com/robotijn/ctoc/issues/new?template=skill-improvement.yml) are welcome.

> [!TIP]
> For autonomous agent workflows, use `claude --dangerously-skip-permissions` to avoid repeated tool-call prompts. This is safe on feature branches where git can revert changes. Add `--continue` to resume a previous session.

---

## Auto-Availability After Install

When you install CTOC from the marketplace, Claude Code auto-discovers every artifact the plugin ships — slash commands, agents, hooks, and skills — per the [Claude Code Plugins reference](https://code.claude.com/docs/en/plugins-reference). No manual wiring is needed. The 99 Tier-2 specialist `SKILL.md` files then become available through **three routing paths**:

1. **Slash-command pipeline** — `/ctoc` (or any sub-command) dispatches CTO Chief, which dispatches a Tier-1 sub-orchestrator, which dispatches the relevant Tier-2 specialist by name. This is the path used during the Iron Loop and refinement loop.
2. **`when_to_load` trigger phrases** — each `SKILL.md` declares a list of natural-language triggers in YAML frontmatter (e.g. `"SBOM"`, `"prompt injection"`, `"NIST 800-61"`). When your conversation matches a trigger, Claude Code auto-loads the skill into context with no slash command needed.
3. **Direct `Skill` tool invocation** — Claude can invoke any skill explicitly via the built-in `Skill` tool (e.g. `Skill(skill_name="ctoc:llm-security-tester")`) based on conversational context.

The auto-discovery is documented behavior of Claude Code's plugin system. Installing CTOC therefore makes the entire 421-file library reachable without configuration — you only pay for what loads, but everything is wired and ready.

---

## Skill Library Quality Bar

Every one of the 99 Tier-2 specialist `SKILL.md` bodies was brought to 2026 best-practices quality through an explicit improvement loop (v6.9.15–v6.9.27). The library is not a grab-bag of LLM-generated stubs — it is engineered.

**The 4-step loop (existing skills, 86 of them):**

```
websearch (May 2026 sources) → update v1 → critique (subagent) → update v2
```

**The 6-step loop (5 new gap-fill skills in v6.9.24, per the new-skill memory rule):**

```
websearch → v1 → critique → v2 → extra critique → v3
```

The extra critique round catches things like missing SLSA/in-toto provenance flows, omitted CVEs (EchoLeak, MCP tool poisoning), and stale tool-lifecycle dates. The loop is documented in commits `ec94f62..e0ee079`.

**Every SKILL.md ships:**

- YAML frontmatter (`tier: 2`, `dispatch_protocol: v1`, `max_subagents: 0`, declared `when_to_load` triggers, `effort_level`, `model_optimized_for`)
- A `## 2026 Best Practices` section with **sourced citations** — no invented stats. Quantitative claims trace back to a primary source (OWASP, NIST, ENISA, EC, CNCF, SLSA.dev, Sigstore, ISO, MITRE ATT&CK/ATLAS, vendor docs, peer-reviewed papers).
- **7-language coverage** (C#, Java, Python, C, C++, JS/TS, SQL) of BAD/SAFE pattern pairs in foundational categories; per-skill rationale where a language is skipped (e.g. SQL skipped in E2E test skills).
- A `## Tool Integration (2026)` matrix with current CLI commands.
- A `## Severity` block that reconciles internal triage tiers with the always-`critical` letter contract on the wire (no soft tiers escape the refinement loop).
- A `## Letter schema (refinement-loop output contract)` so findings are machine-readable.
- A `## Refinement Loop — critic mode` footer cross-linking `agents/_shared/warnings-are-critical.md`.

**Warnings are bugs.** Every critic emits findings at `severity: critical` on the wire. Compiler/linter/type-checker warnings, deprecation notices, and CVEs at any severity block phase advancement. Time is a vector: today's warning is tomorrow's customer-visible crash.

---

## Gap-Fill Skills (v6.9.24)

Five new Tier-2 specialists were created from a v6.9.22 gap analysis — each fills a hole that 2026 regulation, the OWASP/MITRE landscape, or industry incidents made urgent. All went through the 6-step v3 critique loop above.

| Skill | Why it was added |
|---|---|
| [`compliance/sbom-cra-checker`](skills/compliance/sbom-cra-checker/SKILL.md) | EU Cyber Resilience Act reporting goes live **11 Sep 2026** — SBOMs become a legal artifact with 10-year retention and penalties up to €15M / 2.5% turnover. Validates NTIA Minimum Elements, CycloneDX 1.6 / SPDX 2.3+/3.0, signed-SBOM verification, in-toto attestations, SLSA, GUAC, VEX, and ENISA Single Reporting Platform onboarding. |
| [`security/threat-modeler`](skills/security/threat-modeler/SKILL.md) | Design-time threat decomposition before any code is written — STRIDE, PASTA, LINDDUN(-GO and the new GenAI extension, arXiv 2603.06051), attack trees, automotive TARA, and tagging against **MITRE ATT&CK** + **ATLAS v5.4.0** (16 tactics / 84 techniques / 56 sub-techniques). Tool integration: Threagile, OWASP Threat Dragon, pytm, IriusRisk, Microsoft TMT. |
| [`compliance/ai-governance-checker`](skills/compliance/ai-governance-checker/SKILL.md) | **EU AI Act high-risk provisions become enforceable 2 Aug 2026.** Classifies systems against EU AI Act risk tiers (Art. 5 prohibited, Annex III high-risk, GPAI Chap V Arts. 51–55 with the 10²⁵ FLOPs systemic-risk threshold), **NIST AI 600-1** (12 GenAI risks), and **ISO/IEC 42001** (38 Annex A controls). Includes Art. 73 incident-reporting windows (2/10/15-day) to the AI Office. |
| [`ai-quality/llm-security-tester`](skills/ai-quality/llm-security-tester/SKILL.md) | LLM red-team analyst covering **OWASP LLM Top 10 v2 (2025)** all 10 categories, mapped to **MITRE ATLAS v5.4.0** tactics. Covers CVE-2025-53773 (GitHub Copilot RCE, CVSS 9.6), CVE-2025-32711 (EchoLeak), the Cursor IDE chain, persistent memory poisoning, MCP tool poisoning, multi-turn crescendo/TAP jailbreaks, and markdown exfiltration. Tools: Garak, PyRIT, PromptFoo. |
| [`security/incident-responder`](skills/security/incident-responder/SKILL.md) | **NIST SP 800-61r3 (Apr 2025)** rewritten around CSF 2.0 functions plus the regulatory clocks that now bind: ENISA SRP 24h/72h/14d/1m from 11 Sep 2026, SEC Item 1.05 8-K (4 business days), NIS2, CIRCIA (pending), GDPR 72h. Runbooks per incident class, blameless-postmortem template, on-call wiring for PagerDuty / Opsgenie (EOS Apr 2027) / incident.io / FireHydrant. |

These five take the specialist count from 86 → **91**, and the total skill-library file count from 408 → **413**.

---

## Cross-Industry Skills (v6.9.27)

A cross-industry critique — pulling best practice from safety-critical, real-time, legal, and regulated-finance engineering, not just SaaS — added 8 specialists across three new categories plus security:

- **Safety** — `fault-tree-builder` (top-down Fault Tree analysis), `fmeda-analyzer` (failure modes + diagnostic coverage), `redundancy-pattern-picker` (lockstep / N-version / voting / standby selection)
- **Realtime** — `hil-harness` (Model-/Software-/Processor-/Hardware-in-the-Loop test ladder), `wcet-budget` (worst-case execution time bounds)
- **Legal** — `clm-obligations` (contract obligation tracking), `dsar-handler` (GDPR data-subject-access-request flow)
- **Security** — `cra-incident-clocks` (EU Cyber Resilience Act 24h / 72h / 14d incident clocks)

The same pass added a regulatory-regime profile framework and an evaluation-driven-development harness — see [`REGULATORY_OPS.md`](docs/REGULATORY_OPS.md) and [`EVALUATION_HARNESS.md`](docs/EVALUATION_HARNESS.md).

---

## Project Init

Initialization is automatic. The first time you open the dashboard (`/ctoc`) in a project that has not been set up, CTO Chief initializes it before rendering — there is no init command to run. Setup:

1. **Detects your stack** — scans for languages (14), frameworks (20+), and tools (linters, test runners, bundlers)
2. **Generates a tailored `CLAUDE.md`** — project-specific instructions including detected tools, quality commands, and Iron Loop steps
3. **Configures `.ctoc/settings.yaml`** — quality gates, enforcement mode, and agent settings tuned to your stack
4. **Creates the `plans/` directory structure** and initializes Iron Loop state in `.ctoc/state/`

The generated `CLAUDE.md` becomes the single source of truth for how Claude works in your project — agent personality, planning pipeline, test commands, and quality standards. Initialization is idempotent: it skips any file that already exists, so opening the dashboard never overwrites your work.

---

## Why CTO Chief?

**Without CTO Chief** — AI writes code immediately, skips tests, ignores security. You spend hours debugging, refactoring, and adding missing error handling.

**With CTO Chief** — You start with an idea. A product-owner agent explores it with you, asks the right questions, and shapes it into a plan. Only then does AI write code — tests first, security scanned, with your approval at every checkpoint.

| | Without | With CTO Chief |
|--|---------|----------------|
| Ideation | None — AI guesses what you want | Product-owner agent explores your idea, asks questions, shapes the plan |
| Planning | None — straight to code | Functional + implementation plan, reviewed by you |
| Testing | "I'll add tests later" | TDD — tests written before code (Step 8) |
| Security | Hope for the best | Shift-left scanning (Step 9) + full audit (Step 13) |
| Your control | Watch and hope | 4 approval gates — nothing ships without you |
| Quality | Manual review only | Automated: lint, typecheck, tests, 80%+ coverage |

### How CTO Chief Compares

| | CTO Chief | Cursor Rules | Raw Claude Code | GitHub Copilot |
|--|-----------|-------------|----------------|----------------|
| Ideation with product owner | AI explores your idea before planning | None | None | None |
| Planning before coding | 6-step plan with adversarial review | Manual rules file | None | None |
| Step-driven question routing | Questions scoped to your current Iron Loop step | None | None | None |
| 6-month pre-mortem + 5-scenario cash flow | Built into canvas | None | None | None |
| TDD enforcement | Automatic (Step 8) | Manual | Manual | None |
| Security scanning | Built-in (Steps 9, 13) | Manual | Manual | None |
| Threat modeling (STRIDE / PASTA / LINDDUN / ATT&CK / ATLAS) | Built-in (`threat-modeler`) | None | None | None |
| LLM security testing (OWASP LLM Top 10 v2) | Built-in (`llm-security-tester`) | None | None | None |
| EU CRA + SBOM compliance (11 Sep 2026) | Built-in (`sbom-cra-checker`) | None | None | None |
| AI governance (EU AI Act / NIST AI RMF / ISO 42001) | Built-in (`ai-governance-checker`) | None | None | None |
| Incident response (NIST 800-61r3, SEC 8-K, NIS2) | Built-in (`incident-responder`) | None | None | None |
| Iterative refinement to zero findings | Refinement loop (incl. warnings) | None | None | None |
| Human approval gates | 4 mandatory checkpoints | None | None | None |
| Quality verification | Automated gate (Step 14) | Manual | Manual | None |
| Specialist agents | 110 across 22 categories | None | DIY | None |
| Specialist skill library (engineered, sourced) | 99 SKILL.md bodies through critique loop | None | None | None |
| Production-readiness checklist | SaaS templates with 20+ block-severity checks | None | None | None |
| Post-launch product loop | KPI library + experiment designer | None | None | None |

### Example Session

```
You: I want a SaaS product with AI to help creative writers when they get stuck

╭─ IDEATION ─────────────────────────────────────────────────╮
│ Product-owner agent explores your idea:                    │
│                                                            │
│ "What kind of stuck? Writer's block, plot holes, or       │
│  character development? Who's the target — novelists,      │
│  screenwriters, bloggers? Free tier or paid only?"         │
│                                                            │
│ You discuss back and forth. The agent shapes your idea     │
│ into 3 plans:                                              │
│   Plan 1: AI prompt generator for writer's block           │
│   Plan 2: Character voice coach                            │
│   Plan 3: Plot continuity checker                          │
│                                                            │
│ [1] Start with Plan 1 (Recommended)                        │
│ [2] Start with Plan 2                                      │
│ [3] Start with Plan 3                                      │
╰────────────────────────────────────────────────────────────╯

You: 1

╭─ FUNCTIONAL PLANNING (Steps 2-4) ─────────────────────────╮
│ Product-owner agent writes BDD scenarios WITH you:         │
│                                                            │
│ "Should the AI suggest full paragraphs or just prompts?    │
│  What if the writer rejects the suggestion — retry or      │
│  offer alternatives?"                                      │
│                                                            │
│   Scenario: Writer requests help                           │
│     Given a writer is stuck on chapter 3                   │
│     When they describe their block                         │
│     Then AI generates 3 creative prompts                   │
│                                                            │
│ GATE 1: [1] Approve plan  [2] Discuss  [0] Cancel          │
╰────────────────────────────────────────────────────────────╯

You: 1

╭─ TECHNICAL PLANNING (Steps 5-7) ─────────────────────────╮
│ Implementation-planner agent designs the architecture:     │
│                                                            │
│ "Next.js frontend, FastAPI backend, Claude API for         │
│  generation. 4 files to create, 1 to modify."             │
│                                                            │
│ Integrator+Critic refine the plan (10 rounds)...           │
│                                                            │
│ GATE 2: [1] Approve approach  [2] Discuss  [0] Cancel      │
╰────────────────────────────────────────────────────────────╯

You: 1

╭─ IMPLEMENTATION (Steps 8-16, automated) ──────────────────╮
│ Agents execute without interruption:                       │
│                                                            │
│  Step 8:  ✓ Tests written (TDD red)                        │
│  Step 9:  ✓ Dependencies installed, shift-left scan clean  │
│  Step 10: ✓ Code implemented (TDD green)                   │
│  Step 11: ✓ Self-review passed                             │
│  Step 12: ✓ Optimized                                      │
│  Step 13: ✓ Security scan clean                            │
│  Step 14: ✓ All tests pass, 91% coverage                   │
│  Step 15: ✓ Docs updated                                   │
│  Step 16: Ready for your review                            │
│                                                            │
│ GATE 3: [1] Approve and commit  [2] Changes  [0] Cancel    │
╰────────────────────────────────────────────────────────────╯

You: 1
  ✓ Committed and pushed. Plan 1 done — 2 more plans queued.
```

Three approvals per plan. Steps 1-7: agents ask, you decide. Steps 8-16: agents execute, you review.

> [!TIP]
> **Ideation is optional.** If you already know exactly what you want, say it directly (e.g., "Add a /health endpoint returning 200 OK") and CTO Chief skips to planning. Ideation is most valuable when you have a broad idea that needs shaping — like building a full SaaS product from a single sentence.

---

## Key Features

- **Ideation-first workflow** — Product-owner agent explores your idea, asks questions, and shapes it into plans before any code is written
- **Collaborative planning, automated execution** — Steps 1-7: agents ask questions and you decide. Steps 8-16: agents execute and you review the result.
- **110 agents** across 22 categories — testing, security, quality, infrastructure, SaaS, product, scouts, compliance, AI quality, and more
- **421 skill files** — 99 Tier-2 specialist skill bodies (engineered through the websearch → update → critique → update loop) + 50 language refs + 211 framework refs (85 web, 44 AI/ML, 52 data, 15 DevOps, 15 mobile) + 61 per-language quality configs
- **Iron Loop methodology** — 16 steps across 4 phases with 4 human gates
- **Refinement loop** — Iterative critic → test-writer → implementer cycle with tiered K-budgets (critical K=3 · medium K=5 · low K=7 · final sweep K=∞) that drives findings to zero (warnings included) before Gate 3 — see [REFINEMENT_LOOP.md](docs/REFINEMENT_LOOP.md)
- **4-tier agent architecture** — CTO Chief (Tier 0, sole dispatcher) → 16 sub-orchestrators (Tier 1) → specialists (Tier 2) → 5 Haiku scouts (Tier 3) for fast pre-screens — see [AGENT_ARCHITECTURE.md](docs/AGENT_ARCHITECTURE.md)
- **6-month pre-mortem + 5-scenario cash flow** — Every canvas (lean or BMC) now carries a Gary-Klein 6-month pre-mortem (≥5 failure modes scored by likelihood × impact with this-week mitigations) and a Worst / Conservative / Base / Optimistic / Exceptional 18-month cash flow with runway-per-scenario and commit-now decision triggers
- **Warnings are bugs** — Compiler/linter/type-checker warnings, deprecation notices, and CVEs at any severity are classified critical-tier by the refinement loop. Production-readiness gate requires zero warnings across all toolchains and zero open CVEs before Gate 3
- **Production-ready SaaS templates** — Opinionated starters (B2C subscription, B2B sales-led) with 20+ Gate-3 production-readiness block-severity checks: domain, HTTPS, auth, billing, RLS, observability, legal, zero warnings, zero CVEs
- **2026-grade compliance & AI safety** — Five gap-fill skills (`sbom-cra-checker`, `threat-modeler`, `ai-governance-checker`, `llm-security-tester`, `incident-responder`) cover EU CRA, EU AI Act, NIST 800-61r3, OWASP LLM Top 10 v2, MITRE ATLAS v5.4.0, and STRIDE/PASTA/LINDDUN
- **Product Loop** — Post-launch DEFINE → INSTRUMENT → MEASURE → REVIEW → HYPOTHESIZE → EXPERIMENT → LEARN cycle keyed to 17 canonical KPIs across acquisition/activation/retention/revenue/churn — see [PRODUCT_LOOP.md](docs/PRODUCT_LOOP.md)
- **Interactive dashboard** — Numbered menus, plan pipeline, progress tracking
- **Deployment pipeline** — Configurable dev → staging → production promotion triggered automatically after Gate 3 approval
- **Smart quality gates** — Background checks that don't block commits, block pushes
- **Stack detection** — Auto-detects 14 languages, dozens of frameworks, and tools
- **On-demand loading** — Skills load only when needed; you only pay for what you use

---

## The Iron Loop

16 steps, 4 phases, 4 human gates — [full methodology →](docs/IRON_LOOP.md)

```
COLLABORATIVE (Steps 1-7) — agents ask questions, you decide
──────────────────────────────────────────────────────────────
Step 1: IDEATION
  IDEATE — product-owner agent explores your idea with you
  Gate 0: You approve the idea to explore

Steps 2-4: FUNCTIONAL PLANNING
  ASSESS → ALIGN → CAPTURE — agents ask what to build, you approve
  Gate 1: You approve what to build

Steps 5-7: IMPLEMENTATION PLANNING
  PLAN → DESIGN → SPEC — agents ask how to build it, you approve
  Gate 2: You approve how to build it

AUTOMATED (Steps 8-16) — agents execute, you review
──────────────────────────────────────────────────────────────
Steps 8-16: IMPLEMENTATION
  TEST → PREPARE → IMPLEMENT → REVIEW → OPTIMIZE → SECURE → VERIFY → DOCUMENT → FINAL-REVIEW
  Gate 3: You approve the result
```

**Steps 1-7 are collaborative.** Agents don't just generate — they ask questions, present options with pros and cons, and wait for your decision. The product-owner agent shapes your idea; the implementation-planner designs the architecture. You are always in control.

**Steps 8-16 are automated.** Once you approve the plan, agents execute all 9 steps without interruption: write tests, implement code, review, optimize, scan for vulnerabilities, verify quality, update docs. You review the final result at Gate 3.

**Why start with ideation?** Without it, Claude will try to jump straight to code. The ideation phase forces the AI to understand your intent before planning begins. This is what prevents hooks and gates from being bypassed — the AI has a structured path to follow instead of guessing.

**Enforcement** — Hooks block premature code edits (before planning) and premature commits (before verification). Escape phrases: "skip planning", "skip iron loop", "quick fix", "trivial fix", "trivial change", "hotfix", "urgent".

---

## The 4-Tier Agent Architecture

CTO Chief is the only top-level dispatcher. All other agents are dispatched by CTO Chief, directly or via a sub-orchestrator. See [`AGENT_ARCHITECTURE.md`](docs/AGENT_ARCHITECTURE.md) for the full spec.

| Tier | Role | Count | Model | What they do |
|------|------|------:|-------|--------------|
| **Tier 0** | Top-level coordinator | 1 | Opus | CTO Chief — sole dispatcher, owns the audit trail, approves all gate crossings |
| **Tier 1** | Sub-orchestrators | 16 | Opus | Planning (7) · Iron Loop (3) · Pipeline (5) · Synthesizer (1) — recommend dispatches and orchestrate Tier 2/3 fan-out |
| **Tier 2** | Specialists | 72+ | Opus / Sonnet | Domain experts — single-purpose, structured findings output, cannot dispatch other agents |
| **Tier 3** | Scouts | 5 | Haiku 4.5 | Fast pass/flag pre-screens in isolated 200K context: syntax · lint · test · dep · secret. Short-circuit Tier 2 when clean. ~10–50× cheaper than the specialists they replace on the happy path. |

Cross-pillar conflicts (security vs. performance, etc.) are resolved by the **synthesizer** using a fixed priority: Security > Correctness > Maintainability > Performance > Readability > Consistency. Every dispatch is logged to `.ctoc/audit/dispatches/YYYY-MM-DD/<id>.yaml` per the [Dispatch Protocol](docs/DISPATCH_PROTOCOL.md).

---

## The Refinement Loop

Findings from the Iron Loop don't get reviewed-and-shipped on the first pass. They run through the **refinement loop** — an iterative critic → test-writer → implementer cycle that drives findings to zero before Gate 3. See [`REFINEMENT_LOOP.md`](docs/REFINEMENT_LOOP.md).

```
critics → findings → test-writer (TDD red) → implementer (TDD green) → re-critic
                                                                            │
                                                                       still findings?
                                                                            │
                                                                ┌───────────┴───────────┐
                                                              YES                       NO
                                                                │                       │
                                                          loop again                 advance
                                                                                   phase / done
```

**Phase semantics (tiered K-budgets):**

| Phase | K (rounds) | Stops on |
|-------|------------|----------|
| Critical | 3 | 0 critical findings |
| Medium | 5 | 0 medium findings |
| Low | 7 | 0 low findings |
| Final sweep | ∞ (soft cap) | Convergence; escalates to user if it doesn't |

**Warnings are bugs.** Compiler / linter / type-checker warnings, deprecation notices, and CVEs at *any* severity are classified `critical` by every critic — they block phase advancement until fixed. Time is a vector: today's warning is tomorrow's customer-visible crash.

Triggered on `effort: high` plans OR when a risk-surface glob matches (auth, billing, schema migrations, GDPR-relevant paths, etc.). The integrator agent drives the loop; the journal at `.ctoc/loops/<slug>/journal.yaml` records every round.

---

## The Canvas — 6-Month Pre-Mortem + 5-Scenario Cash Flow

Both Lean Canvas (Maurya) and Business Model Canvas (Osterwalder) carry two extra planning sections by default — surfacing 6-month failure modes and runway scenarios up-front so the business plan is interrogated before any feature work begins.

**6-Month Pre-Mortem (Gary Klein, HBR 2007)** — Imagine 6 months from now and the initiative has *already* failed. List ≥5 distinct failure modes scored Likelihood × Impact; pair each with a mitigation that can be **started this week**. Prospective hindsight is ~30% more accurate at identifying failure causes than forward-looking risk analysis. Refresh every 3–4 months.

**Cash Flow Planning — 5 Scenarios over 18 months** — Worst / Conservative / Base / Optimistic / Exceptional. The three middle scenarios must each be plausible (defensible, not aspirational). Stress-test deltas per scenario:

| Variable | Worst | Conservative | Base | Optimistic | Exceptional |
|----------|------:|------:|------:|------:|------:|
| Revenue growth | −50% | −20% | 0 | +25% | +60% |
| CAC | +75% | +25% | 0 | −15% | −30% |
| Monthly churn | 2.0× | 1.3× | 1.0× | 0.8× | 0.6× |
| Time-to-first-pay | +60d | +30d | normal | −15d | −30d |

Includes base-case assumption anchors, per-month MRR table at M3/M6/M9/M12/M15/M18, runway per scenario, and **commit-now decision triggers** (e.g., "if actuals track Worst for 2 consecutive months: switch operating plan to Worst"). Industry signal: startups with 3+ scenarios secure 1.8× the funding (Abacum 2025).

Both sections are owned by the founder or product manager. The CTO Chief technical chain does not produce them; it consumes them when planning instrumentation work.

---

## The Product Loop

The Iron Loop ships features. The **Product Loop** validates that they earn their place. See [`PRODUCT_LOOP.md`](docs/PRODUCT_LOOP.md).

```
DEFINE → INSTRUMENT → MEASURE → REVIEW → HYPOTHESIZE → EXPERIMENT → LEARN
  ↑                                                                    │
  └───────────────── continuous post-launch ───────────────────────────┘
```

| Step | Owner | Cadence |
|------|---------------|---------|
| DEFINE | founder + pm | Canvas phase — via `kpi-planner` |
| INSTRUMENT | programmer | Implementation — via `skills/saas/posthog-analytics` |
| MEASURE | (automated) | Continuous — PostHog + Stripe |
| REVIEW | founder + pm | Weekly — via `skills/product/product-reviewer` |
| HYPOTHESIZE | founder + pm | From review findings |
| EXPERIMENT | pm + programmer | Via `skills/product/experiment-designer` |
| LEARN | founder + pm | Post-experiment |

Canonical KPI library at `.ctoc/templates/product-kpis.yaml` — **17 KPIs** across acquisition / activation / retention / revenue / churn / satisfaction / engagement. SaaS-b2c launch set: signup_completion, activation_rate, time_to_value, w1_retention, free_to_paid_conversion, monthly_churn, mrr.

KPI status and the weekly product review are reached through the `/ctoc:menu` dashboard — CTOC ships only three slash commands (`menu`, `push`, `update`).

---

## SaaS Production-Readiness Templates

CTOC ships opinionated templates for common project types. `agents/planning/stack-chooser.md` (Tier 1) selects the matching template and presents defaults to the user.

| Template | Status | Default stack |
|----------|--------|---------------|
| `saas/b2c-subscription` | ready | Next.js 15 · Supabase · Clerk · Stripe · Resend · PostHog · Sentry · Vercel |
| `saas/b2b-sales-led` | ready | adds WorkOS SSO · org-scoped data · audit log · MSA/DPA templates · SOC2 docs |
| `saas/usage-based-api` | planned | metered billing · API keys · rate limiting · usage dashboard |
| `app/expo-react-native` | planned | Expo SDK 52 · Clerk Expo · Supabase · RevenueCat · EAS |
| `cli/bun-single-binary` | planned | Bun + cross-platform binary |
| `oss-lib/typescript` | planned | tsup · changesets · GitHub Actions |

Each ready template carries a **production-readiness checklist** enforced at Gate 3 (review → done). Block-severity items in the B2C template include:

- **Domain & HTTPS** — custom domain, HTTPS enforced
- **Auth** — signup with email verification, password reset
- **Billing** — real-card-tested, webhook signature verified, failed-payment dunning, billing-portal link
- **Email deliverability** — SPF + DKIM + DMARC, welcome + receipt emails
- **Multi-tenancy** — Postgres RLS enforced, RLS policy per user-data table
- **Observability** — Sentry receiving errors, PostHog receiving events
- **Legal** — Privacy Policy, Terms of Service
- **Support** — support@ email forwards
- **Backups** — DB backups enabled
- **Code quality (v6.9.9+)** — **zero warnings across all toolchains**, **zero open CVEs** in production dependencies

The B2B template adds enterprise-grade gates: TLS A-grade, WorkOS SSO end-to-end, SCIM provisioning/deprovisioning, organization RLS, RBAC at middleware and DB, audit log capturing every mutation + auth event, ACH/wire billing, DPA + MSA templates, public subprocessor list.

SaaS skills under `skills/saas/` (12 skill bodies): stripe-subscriptions · clerk-auth · workos-sso · multi-tenancy-row-level · resend-email · posthog-analytics · sentry-errors · supabase-data · inngest-jobs · rate-limiting · vercel-deploy · legal-scaffold.

---

## Agents

**110 agents across 22 categories** — [browse all →](agents/)

<details>
<summary><strong>Full agent list</strong></summary>

| Category | # | Agents |
|----------|---|--------|
| [SaaS](agents/saas/) | 12 | [clerk-auth](agents/saas/clerk-auth.md), [stripe-subscriptions](agents/saas/stripe-subscriptions.md), [workos-sso](agents/saas/workos-sso.md), [multi-tenancy-row-level](agents/saas/multi-tenancy-row-level.md), [resend-email](agents/saas/resend-email.md), [posthog-analytics](agents/saas/posthog-analytics.md), [sentry-errors](agents/saas/sentry-errors.md), [supabase-data](agents/saas/supabase-data.md), [inngest-jobs](agents/saas/inngest-jobs.md), [rate-limiting](agents/saas/rate-limiting.md), [vercel-deploy](agents/saas/vercel-deploy.md), [legal-scaffold](agents/saas/legal-scaffold.md) |
| [Testing](agents/testing/) | 14 | [unit](agents/testing/runners/unit-test-runner.md), [integration](agents/testing/runners/integration-test-runner.md), [e2e](agents/testing/runners/e2e-test-runner.md), [mutation](agents/testing/runners/mutation-test-runner.md), [smoke](agents/testing/runners/smoke-test-runner.md), [quality-gate-runner](agents/testing/quality-gate-runner.md), [playwright-qa](agents/testing/playwright-qa.md), [coverage-enforcer](agents/testing/coverage-enforcer.md), [coverage-mapper](agents/testing/coverage-mapper.md), [smart-test-runner](agents/testing/smart-test-runner.md), [unit-writer](agents/testing/writers/unit-test-writer.md), [e2e-writer](agents/testing/writers/e2e-test-writer.md), [integration-writer](agents/testing/writers/integration-test-writer.md), [property-writer](agents/testing/writers/property-test-writer.md) |
| [Quality](agents/quality/) | 11 | [architecture-checker](agents/quality/architecture-checker.md), [code-reviewer](agents/quality/code-reviewer.md), [complexity-analyzer](agents/quality/complexity-analyzer.md), [complexity-reducer](agents/quality/complexity-reducer.md), [type-checker](agents/quality/type-checker.md), [code-smell-detector](agents/quality/code-smell-detector.md), [dead-code-detector](agents/quality/dead-code-detector.md), [duplicate-code-detector](agents/quality/duplicate-code-detector.md), [consistency-checker](agents/quality/consistency-checker.md), [quality-gate](agents/quality/quality-gate.md), [performance-validator](agents/quality/performance-validator.md) |
| [Specialized](agents/specialized/) | 11 | [performance-profiler](agents/specialized/performance-profiler.md), [memory-safety-checker](agents/specialized/memory-safety-checker.md), [accessibility-checker](agents/specialized/accessibility-checker.md), [database-reviewer](agents/specialized/database-reviewer.md), [api-contract-validator](agents/specialized/api-contract-validator.md), [configuration-validator](agents/specialized/configuration-validator.md), [error-handler-checker](agents/specialized/error-handler-checker.md), [health-check-validator](agents/specialized/health-check-validator.md), [observability-checker](agents/specialized/observability-checker.md), [resilience-checker](agents/specialized/resilience-checker.md), [translation-checker](agents/specialized/translation-checker.md) |
| [Planning](agents/planning/) | 7 | [vision-advisor](agents/planning/vision-advisor.md), [vision-decomposer](agents/planning/vision-decomposer.md), [product-owner](agents/planning/product-owner.md), [implementation-planner](agents/planning/implementation-planner.md), [stack-chooser](agents/planning/stack-chooser.md), [kpi-planner](agents/planning/kpi-planner.md), [unit-economics-modeler](agents/planning/unit-economics-modeler.md) |
| [Security](agents/security/) | 7 | [security-scanner](agents/security/security-scanner.md), [secrets-detector](agents/security/secrets-detector.md), [dependency-checker](agents/security/dependency-checker.md), [dependency-auditor](agents/security/dependency-auditor.md), [input-validation-checker](agents/security/input-validation-checker.md), [concurrency-checker](agents/security/concurrency-checker.md), [sast-scanner](agents/security/sast-scanner.md) |
| [Infrastructure](agents/infrastructure/) | 6 | [terraform-validator](agents/infrastructure/terraform-validator.md), [kubernetes-checker](agents/infrastructure/kubernetes-checker.md), [docker-security-checker](agents/infrastructure/docker-security-checker.md), [ci-pipeline-checker](agents/infrastructure/ci-pipeline-checker.md), [ci-runner-setup](agents/infrastructure/ci-runner-setup.md), [deployment-setup](agents/infrastructure/deployment-setup.md) |
| [Pipeline](agents/pipeline/) | 5 | [agent-writer](agents/pipeline/agent-writer.md), [agent-critic](agents/pipeline/agent-critic.md), [agent-tester](agents/pipeline/agent-tester.md), [agent-qa](agents/pipeline/agent-qa.md), [agent-publisher](agents/pipeline/agent-publisher.md) |
| [Scouts (Tier 3, Haiku)](agents/scouts/) | 5 | [syntax-scout](agents/scouts/syntax-scout.md), [lint-scout](agents/scouts/lint-scout.md), [test-scout](agents/scouts/test-scout.md), [dep-scout](agents/scouts/dep-scout.md), [secret-scout](agents/scouts/secret-scout.md) |
| [Compliance](agents/compliance/) | 3 | [gdpr-compliance-checker](agents/compliance/gdpr-compliance-checker.md), [audit-log-checker](agents/compliance/audit-log-checker.md), [license-scanner](agents/compliance/license-scanner.md) |
| [Coordinator](agents/coordinator/) | 3 | [cto-chief](agents/coordinator/cto-chief.md) (Tier 0), [ivv-chief](agents/coordinator/ivv-chief.md), [synthesizer](agents/coordinator/synthesizer.md) |
| [Data/ML](agents/data-ml/) | 3 | [data-quality-checker](agents/data-ml/data-quality-checker.md), [ml-model-validator](agents/data-ml/ml-model-validator.md), [feature-store-validator](agents/data-ml/feature-store-validator.md) |
| [Frontend](agents/frontend/) | 3 | [bundle-analyzer](agents/frontend/bundle-analyzer.md), [component-tester](agents/frontend/component-tester.md), [visual-regression-checker](agents/frontend/visual-regression-checker.md) |
| [Iron Loop](agents/iron-loop/) | 3 | [integrator](agents/iron-loop/iron-loop-integrator.md), [critic](agents/iron-loop/iron-loop-critic.md), [executor](agents/iron-loop/iron-loop-executor.md) |
| [Mobile](agents/mobile/) | 3 | [ios-checker](agents/mobile/ios-checker.md), [android-checker](agents/mobile/android-checker.md), [react-native-bridge-checker](agents/mobile/react-native-bridge-checker.md) |
| [Versioning](agents/versioning/) | 3 | [backwards-compatibility-checker](agents/versioning/backwards-compatibility-checker.md), [feature-flag-auditor](agents/versioning/feature-flag-auditor.md), [technical-debt-tracker](agents/versioning/technical-debt-tracker.md) |
| [AI Quality](agents/ai-quality/) | 2 | [hallucination-detector](agents/ai-quality/hallucination-detector.md), [ai-code-quality-reviewer](agents/ai-quality/ai-code-quality-reviewer.md) |
| [Architecture](agents/architecture/) | 2 | [pattern-detector](agents/architecture/pattern-detector.md), [dependency-analyzer](agents/architecture/dependency-analyzer.md) |
| [DevEx](agents/devex/) | 2 | [onboarding-validator](agents/devex/onboarding-validator.md), [api-deprecation-checker](agents/devex/api-deprecation-checker.md) |
| [Documentation](agents/documentation/) | 2 | [documentation-updater](agents/documentation/documentation-updater.md), [changelog-generator](agents/documentation/changelog-generator.md) |
| [Product](agents/product/) | 2 | [product-reviewer](agents/product/product-reviewer.md), [experiment-designer](agents/product/experiment-designer.md) |
| [Cost](agents/cost/) | 1 | [cloud-cost-analyzer](agents/cost/cloud-cost-analyzer.md) |

</details>

Agents spawn conditionally based on your project and current Iron Loop step. Scouts (Tier 3) pre-screen and short-circuit deep dispatches when clean.

> Note: not every Tier-2 specialist `SKILL.md` has a paired top-level agent file. Several skills (e.g. `sbom-cra-checker`, `threat-modeler`, `ai-governance-checker`, `llm-security-tester`, `incident-responder`) are dispatched directly through the skill auto-load mechanism — see "Auto-Availability After Install" above.

---

## Skills

**421 skill files** — [browse all →](skills/). Loaded on demand based on your stack and the current Iron Loop step.

There are two kinds of skills:

1. **Tier-2 specialist skill bodies (99)** — the actual expert agents that run during Iron Loop and refinement-loop steps. Each lives at `skills/<category>/<name>/SKILL.md` with a structured findings contract.
2. **Knowledge skills (322)** — language refs, framework refs, and per-language quality configs. Read by agents (or loaded by code paths like `src/lib/quality-config.js` and `src/lib/skill-loader.js`) to inform their work.

> **v6.9.14**: 38 unreachable reference files were deleted from `skills/` after a usage audit confirmed they had zero code or agent references.
> **v6.9.15–v6.9.23**: all 86 existing `SKILL.md` bodies were rewritten through a websearch → update → critique → update loop (May 2026 sources, 7-language coverage, sourced citations only).
> **v6.9.24**: 5 new gap-fill specialists were added via a 6-step v3 critique loop (see "Gap-Fill Skills" above). Net library: 408 → **413** files; 86 → **91** specialists.
> **v6.9.27**: 8 cross-industry-critique specialists added — new `legal`, `realtime`, and `safety` categories plus `security/cra-incident-clocks`. Net library: 413 → **421** files; 91 → **99** specialists.

<details>
<summary><strong>Specialist skill bodies (Tier 2) — 99 across 20 categories</strong></summary>

| Category | # | Skill bodies |
|----------|---|--------------|
| [SaaS](skills/saas/) | 12 | clerk-auth · stripe-subscriptions · workos-sso · multi-tenancy-row-level · resend-email · posthog-analytics · sentry-errors · supabase-data · inngest-jobs · rate-limiting · vercel-deploy · legal-scaffold |
| [Quality](skills/quality/) | 11 | architecture-checker · code-reviewer · complexity-analyzer · complexity-reducer · code-smell-detector · consistency-checker · dead-code-detector · duplicate-code-detector · performance-validator · quality-gate · type-checker |
| [Specialized](skills/specialized/) | 11 | accessibility-checker · api-contract-validator · configuration-validator · database-reviewer · error-handler-checker · health-check-validator · memory-safety-checker · observability-checker · performance-profiler · resilience-checker · translation-checker |
| [Security](skills/security/) | 10 | security-scanner · sast-scanner · secrets-detector · input-validation-checker · concurrency-checker · dependency-checker · dependency-auditor · **threat-modeler** *(new, v6.9.24)* · **incident-responder** *(new, v6.9.24)* · **cra-incident-clocks** *(new, v6.9.27)* |
| [Testing](skills/testing/) | 14 (5+4+5) | playwright-qa · coverage-enforcer · coverage-mapper · smart-test-runner · quality-gate-runner · 4 writers · 5 runners |
| [Infrastructure](skills/infrastructure/) | 5 | terraform-validator · kubernetes-checker · docker-security-checker · ci-pipeline-checker · ci-runner-setup |
| [Compliance](skills/compliance/) | 5 | audit-log-checker · gdpr-compliance-checker · license-scanner · **sbom-cra-checker** *(new, v6.9.24)* · **ai-governance-checker** *(new, v6.9.24)* |
| [AI Quality](skills/ai-quality/) | 3 | ai-code-quality-reviewer · hallucination-detector · **llm-security-tester** *(new, v6.9.24)* |
| [Data/ML](skills/data-ml/) | 3 | data-quality-checker · feature-store-validator · ml-model-validator |
| [Frontend](skills/frontend/) | 3 | bundle-analyzer · component-tester · visual-regression-checker |
| [Mobile](skills/mobile/) | 3 | android-checker · ios-checker · react-native-bridge-checker |
| [Versioning](skills/versioning/) | 3 | backwards-compatibility-checker · feature-flag-auditor · technical-debt-tracker |
| [Architecture](skills/architecture/) | 2 | pattern-detector · dependency-analyzer |
| [DevEx](skills/devex/) | 2 | api-deprecation-checker · onboarding-validator |
| [Documentation](skills/documentation/) | 2 | changelog-generator · documentation-updater |
| [Product](skills/product/) | 2 | product-reviewer · experiment-designer |
| [Safety](skills/safety/) | 3 | **fault-tree-builder · fmeda-analyzer · redundancy-pattern-picker** *(new category, v6.9.27)* |
| [Legal](skills/legal/) | 2 | **clm-obligations · dsar-handler** *(new category, v6.9.27)* |
| [Realtime](skills/realtime/) | 2 | **hil-harness · wcet-budget** *(new category, v6.9.27)* |
| [Cost](skills/cost/) | 1 | cloud-cost-analyzer |

</details>

<details>
<summary><strong>Knowledge skills — 322 reference files</strong></summary>

| Type | # | Examples |
|------|---|----------|
| [Languages](skills/languages/) | 50 | [Python](skills/languages/python.md), [TypeScript](skills/languages/typescript.md), [Go](skills/languages/go.md), [Rust](skills/languages/rust.md), [Java](skills/languages/java.md), [C#](skills/languages/csharp.md), [Swift](skills/languages/swift.md), [Kotlin](skills/languages/kotlin.md), [Ruby](skills/languages/ruby.md), [PHP](skills/languages/php.md) |
| [Web frameworks](skills/frameworks/web/) | 85 | [React](skills/frameworks/web/react.md), [Next.js](skills/frameworks/web/nextjs.md), [Vue](skills/frameworks/web/vue.md), [Django](skills/frameworks/web/django.md), [FastAPI](skills/frameworks/web/fastapi.md), [Rails](skills/frameworks/web/rails.md), [Spring Boot](skills/frameworks/web/spring-boot.md), [Express](skills/frameworks/web/express.md) |
| [AI/ML frameworks](skills/frameworks/ai-ml/) | 44 | [PyTorch](skills/frameworks/ai-ml/pytorch.md), [LangChain](skills/frameworks/ai-ml/langchain.md), [Hugging Face](skills/frameworks/ai-ml/huggingface-hub.md), [MLflow](skills/frameworks/ai-ml/mlflow.md), [TensorFlow](skills/frameworks/ai-ml/tensorflow.md) |
| [Data frameworks](skills/frameworks/data/) | 52 | [MongoDB](skills/frameworks/data/mongodb.md), [Redis](skills/frameworks/data/redis.md), [Kafka](skills/frameworks/data/kafka.md), [Spark](skills/frameworks/data/spark.md), [Elasticsearch](skills/frameworks/data/elasticsearch.md), [DuckDB](skills/frameworks/data/duckdb.md) |
| [DevOps frameworks](skills/frameworks/devops/) | 15 | [Docker](skills/frameworks/devops/docker.md), [Kubernetes](skills/frameworks/devops/kubernetes.md), [Helm](skills/frameworks/devops/helm.md), [Ansible](skills/frameworks/devops/ansible.md), [Pulumi](skills/frameworks/devops/pulumi.md) |
| [Mobile frameworks](skills/frameworks/mobile/) | 15 | [React Native](skills/frameworks/mobile/react-native.md), [Flutter](skills/frameworks/mobile/flutter.md), [SwiftUI](skills/frameworks/mobile/swiftui.md), [Jetpack Compose](skills/frameworks/mobile/jetpack-compose.md) |
| [Quality configs](skills/quality-configs/) | 61 | Per-language lint, format, and test configs |

</details>

Stack detected automatically from your project files. Skills load on-demand — you only pay for what you use.

---

## Interactive Dashboard

The `/ctoc` command opens an interactive dashboard with 5 areas:

| Area | Purpose |
|------|---------|
| Pipeline | The plan pipeline — Business, Implementation, and Execution sections; drill into any stage |
| Inbox | Morning questions, decisions awaiting review, and plans waiting at a human gate |
| Agent | Background agent status — start, stop, and monitor the todo-queue runner |
| Library | Browse the agent and skill library |
| System | Doctor, update, settings, and logs |

**Plan pipeline** (directories under `plans/`):
```
vision → functional → implementation → todo → [in-progress] → review → done
```
*`in-progress` is a state tracked in plan YAML frontmatter, not a separate directory.*

**4 human gates** — transitions that require your explicit approval:
0. Vision → Functional *(approve the idea to explore)*
1. Functional → Implementation *(approve what to build)*
2. Implementation → Todo *(approve how to build it)*
3. Review → Done *(approve the result)*

Navigate with numbers `[1]`–`[5]` to switch areas, `[0]` for back. Or just talk naturally.

---

## Enforcement

CTO Chief blocks premature actions with hooks:

| Action | Blocked Until | Escape Phrases |
|--------|--------------|----------------|
| Edit/Write code | Planning complete (Step 8+) | "skip planning", "skip iron loop", "quick fix", "trivial fix", "trivial change", "hotfix", "urgent" |
| Git commit | Documentation complete (Step 15+) | "hotfix", "urgent" |

Config and CTOC files are **whitelisted** and never blocked: `.ctoc/**`, `.local/**`, `plans/*.md`, `.gitignore`, `.gitattributes`, `VERSION`.

---

## Smart Quality Gates

Background quality agent runs checks without blocking your workflow:

```
git commit → background agent runs: lint, typecheck, tests, security
                    │
              ┌─────┴─────┐
              ▼           ▼
           PASS         FAIL
              │           │
         auto-push    "Fix: ..."
```

| Tier | When | Checks | Blocking? |
|------|------|--------|-----------|
| 1 | Every commit | lint, typecheck, affected tests, secrets, critical CVEs | Yes (blocks push) |
| 2 | Every commit | coverage, complexity, duplication, medium CVEs | No (warnings) |
| 3 | Stage transitions | docs, circular deps, bundle size, benchmarks | At transition |
| 4 | CI only | full tests, e2e, mutation, memory, license | CI |

---

## Deployment Pipeline

After Gate 3 approval (review → done), CTO Chief can automatically promote your code through environments:

```
Gate 3 approved → development → staging → production
                      │            │           │
                  git-branch   git-branch   git-branch
                  git-tag      webhook      script
                  webhook      script       docker
                  script       docker       ssh
                  docker       ssh
                  ssh
```

**Configurable per environment** — choose a deployment strategy (git-branch, git-tag, webhook, script, docker, ssh), set approval mode (auto or manual), and enable auto-rollback on failure. Any environment can be skipped.

**Setup** — run the `deployment-setup` agent for an interactive walkthrough, or configure directly in `.ctoc/settings.yaml`:

```yaml
deployment:
  enabled: true
  environments:
    - name: staging
      enabled: true
      strategy: git-branch
      branch: deploy/staging
    - name: production
      enabled: true
      strategy: git-branch
      branch: deploy/production
  approval:
    staging: auto
    production: manual    # pause and ask before production
  rollback:
    auto_rollback: true
    keep_history: 10
```

**Status tracking** — deployment history and latest status are stored in `.ctoc/deployments/`. Each entry records environment, status (success/failed/rolled-back), timestamp, commit, and plan name.

---

## How It Works

```
You ──── /ctoc ────► Dashboard
                        │
                  ┌─────┴─────┐
                  ▼           ▼
            Plan Pipeline   Tools
                  │
  ┌───────────────┼────────────────┐──────────────┐
  ▼               ▼                ▼              ▼
Phase 1        Phase 2          Phase 3        Phase 4
(Ideation)     (What)           (How)          (Build)
Step 1 (opt)   Steps 2-4        Steps 5-7      Steps 8-16
  │               │                │              │
  │            [GATE 1]        [GATE 2]       [GATE 3]
  └──► skip    You approve     You approve    You approve
```

Priority: security > correctness > performance > cleverness.

---

## Commands

**Slash commands** (typed in Claude Code):

CTOC ships exactly three slash commands. Everything else — vision, planning, quality, review, agent runs, initialization — goes through the menu.

| Command | Description |
|---------|-------------|
| `/ctoc` (alias for `/ctoc:menu`) | Interactive dashboard. Auto-initializes the project on first run (no init command needed). |
| `/ctoc:push` | Quality checks + push |
| `/ctoc:update` | Update to latest version (workaround for plugin-cache bug) |

**Conversational commands** (said to Claude):

| Command | Description |
|---------|-------------|
| `ctoc doctor` | Health check for your CTOC setup |
| `ctoc process-issues` | Process community-submitted skill improvement issues |
| `ctoc validate` | Validate plan structure + Iron Loop state |

---

## Updating

```
/ctoc:update
```

Then restart Claude Code to load the new version.

> [!NOTE]
> This is a workaround for a Claude Code bug ([#21995](https://github.com/anthropics/claude-code/issues/21995)) where `/plugin update` doesn't refresh the cache. `/ctoc:update` fetches latest, clears cache, and updates the registry.

---

<details>
<summary><strong>Troubleshooting</strong></summary>

**Plugin not found:**
```
/plugin marketplace add https://github.com/robotijn/ctoc
/plugin install ctoc
```

**Plugin stale after update:**
```
/ctoc:update
```
Then restart Claude Code.

**"Edit blocked" or "planning incomplete" error:**
CTO Chief blocks code edits until planning is done (Step 8+). This is intentional. Options:
1. Complete the planning steps first (recommended)
2. Say "quick fix" or "trivial change" to bypass for small edits
3. Set enforcement to `soft` in `.ctoc/settings.yaml` for warnings instead of blocks

**Dashboard shows no plans:**
Start by describing what you want to build. CTO Chief creates the plan for you.

**Health check** (say to Claude):
```
ctoc doctor
```

</details>

<details>
<summary><strong>For developers</strong></summary>

**Requirements:** Claude Code >= 1.0.0, Node.js >= 18.0.0

See [CLAUDE.md](CLAUDE.md) for full contributor instructions and [IRON_LOOP.md](docs/IRON_LOOP.md) for methodology details.

**Run tests:**
```bash
node --test tests/*.test.js
```

**Version management:**
```javascript
const { release, getVersion, syncAll, checkForUpdates } = require('./src/lib/version');

getVersion()       // → '6.9.38'
release()          // → bumps patch, syncs all files
release('minor')   // → bumps minor
release('major')   // → bumps major
```

Files synced by `release()`: `VERSION` (source of truth), `.claude-plugin/marketplace.json`, `.claude-plugin/plugin.json`, `README.md`

**Project structure:**
```
ctoc/
├── docs/            14 docs: IRON_LOOP.md, AGENT_ARCHITECTURE.md, REFINEMENT_LOOP.md,
│                    PRODUCT_LOOP.md, DISPATCH_PROTOCOL.md, EVALUATION_HARNESS.md,
│                    INDEPENDENCE.md, REGULATORY_OPS.md, REALTIME.md, PROCESS_FMEA.md,
│                    CRITICAL_CONTROL_POINTS.md, CONTINUOUS_IMPROVEMENT.md,
│                    CONTRIBUTING.md, CODE_OF_CONDUCT.md
├── src/
│   ├── commands/    3 slash commands — menu, push, update (.md spec + .js impl where needed)
│   ├── hooks/       13 Claude Code hooks (session, pre/post tool use, andon-halt)
│   ├── lib/         106 JS modules (planning, quality, refinement, dispatcher, regulatory-regime, audit-chain, retention, legal-hold, traceability, lineage, eval-harness, comparator, notes)
│   ├── areas/       5 dashboard areas (pipeline, inbox, agent, library, system)
│   ├── tabs/        8 legacy tab modules (superseded by areas/, kept for drill-in flows)
│   ├── scripts/     13 build/release utilities
│   └── data/        Static data files
├── agents/          110 agent definitions across 22 categories
│                    (+ _shared/ — 4 cross-cutting rules: ancestry-read,
│                     async-choice-protocol, no-stub-rule, warnings-are-critical)
├── skills/          421 skill files: 99 Tier-2 specialist bodies (SKILL.md)
│                    + 322 reference files (50 langs, 211 frameworks,
│                    61 quality configs). 38 unreachable refs removed in v6.9.14;
│                    86 existing SKILL.md improved in v6.9.15–v6.9.23;
│                    5 gap-fill SKILL.md added in v6.9.24; 8 cross-industry
│                    SKILL.md added in v6.9.27.
├── tests/           68 test files (1470 passing tests)
├── .ctoc/           Config, templates, operations, audit, loop journals
│   ├── templates/   CLAUDE.md.template, canvas templates, SaaS templates,
│   │                questions.yaml, product-kpis.yaml
│   ├── architecture/  tier-definitions.yaml, dispatch-schema.yaml
│   ├── audit/       dispatches/YYYY-MM-DD/<id>.yaml (one per dispatch)
│   └── loops/       <plan-slug>/journal.yaml (refinement-loop history)
└── .claude-plugin/  Plugin metadata (plugin.json, marketplace.json, hooks.json)
```

</details>

---

## License

[PolyForm Shield 1.0.0](https://polyformproject.org/licenses/shield/1.0.0) — See [LICENSE](LICENSE)

Use CTOC freely for any project. You may not offer CTOC itself or a derivative as a competing product or service without permission. For commercial licensing inquiries, contact the licensor.

## Links

[Repository](https://github.com/robotijn/ctoc) · [Issues](https://github.com/robotijn/ctoc/issues) · [Discussions](https://github.com/robotijn/ctoc/discussions)

---

**6.9.38** · Built by [@robotijn](https://github.com/robotijn)

<p align="center"><i>"Excellence is not an act, but a habit."</i></p>
