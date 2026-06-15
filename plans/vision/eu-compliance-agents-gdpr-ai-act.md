---
title: "EU Compliance Agents — GDPR & EU AI Act (inspect plans + code, recommend EU solutions)"
created: "2026-06-15T00:00:00Z"
priority: HIGH
type: vision
status: draft
program: ctoc-eu-compliance
order: 1
---

# EU Compliance Agents — GDPR & EU AI Act

## The Load-Bearing Principle

**Compliance is context, not cleanup.** In CTOC's pipeline, everything before
`todo` is context-building — so legal constraints belong in the *plan*, before a
line of code exists. A GDPR or EU AI Act obligation discovered at code review is
already a retrofit; discovered at the functional/implementation stage it is just
a requirement. These agents push compliance left, into planning, and stay
human-in-the-loop: they detect, they recommend, the user decides.

## Problem Statement

1. CTOC already ships deep compliance *skills* — `gdpr-compliance-checker`
   (GDPR Arts. 7/13/14/17/20/30/33) and `ai-governance-checker` (EU AI Act
   Reg. 2024/1689 + NIST AI RMF + ISO/IEC 42001). But both are **code-only**
   (`tools: Read, Grep`/`Glob`), **`max_subagents: 0`**, and have **no web
   access**. They cannot inspect plans and cannot recommend concrete solutions.
2. Compliance therefore enters the pipeline too late — only when code is
   scanned — violating the "compliance is context" principle.
3. When a gap is found, the user is told *what* is wrong but not *how* to fix it
   in the EU regulatory context: which EU-region hosted service, which
   self-hostable open-source alternative, or which library closes the gap.
4. There is no per-project notion of *which* regimes apply. A purely internal
   tool, a consumer SaaS, and a high-risk AI system have wildly different
   obligations, but CTOC treats them identically.

## Vision

Two dedicated, EU-focused compliance agents — a **GDPR agent** and an **EU AI
Act agent** — that operate across the whole pipeline and the codebase, recommend
EU-appropriate remediations sourced from the live web, and run only for the
regimes the project has opted into.

### 1. Two agents, building on existing skills (not replacing them)

- **GDPR agent** — wraps and extends `compliance/gdpr-compliance-checker` with
  plan inspection + web-sourced remediation. Regulation (EU) 2016/679. Surface:
  lawful basis, consent (Art. 7), transparency (Arts. 13/14), erasure (Art. 17),
  portability (Art. 20), privacy-by-design (Art. 25), RoPA (Art. 30), processors
  / DPA (Art. 28), breach readiness (Arts. 33/34), DPIA (Art. 35), international
  transfers (DPF / SCCs / data residency). Penalties up to €20M or 4% of global
  turnover.
- **EU AI Act agent** — wraps and extends `compliance/ai-governance-checker`
  (EU AI Act portion). Regulation (EU) 2024/1689. Risk-tier classification
  (prohibited — Title II, in force 2 Feb 2025; high-risk — Annex III,
  enforceable 2 Aug 2026; limited-risk transparency — Art. 50, chatbot
  disclosure + deepfake labeling; minimal), GPAI obligations (Arts. 51–55,
  in force 2 Aug 2025), AI literacy (Art. 4). Penalties up to €35M or 7% of
  global turnover for prohibited practices.

### 2. They inspect plans AND code

- **Plans** — read the plan ancestry (vision → canvas → functional →
  implementation) and flag obligations a plan triggers. E.g. "this functional
  plan collects an email address → Art. 13 notice + lawful basis + erasure path
  required"; "this plan deploys a CV-screening model → likely Annex III
  high-risk → conformity assessment + human oversight + technical documentation
  required." Findings attach to the plan before it reaches `todo`.
- **Code** — the existing skill behavior: scan the PII surface, data flows,
  consent UX, deletion cascades, AI-system inventory, model documentation.

### 3. They recommend EU solutions via web search

When a gap is found, the agent searches authoritative, current sources (EUR-Lex,
EDPB, the AI Office, national DPAs) and the solution landscape, then presents
options in three buckets, **highest-quality first, price stated as a fact**:

- **Hosted** — EU-region / EU-data-residency managed services.
- **Self-hosted** — open-source alternatives deployable in EU infrastructure.
- **Library** — drop-in code (consent management, DSAR handling, PII detection,
  model cards / technical documentation generators).

The user chooses; the agent never silently adopts a vendor.

### 4. Per-project compliance mode (the gate question)

A new project setting — `compliance.mode` — with values **`gdpr`**,
**`eu-ai-act`**, **`both`**, or **`none`**, asked the same ride-along way the
runtime-environment question is (never blocking the dashboard). It governs which
agents run:

- `none` → neither agent runs (default for non-EU / internal-only projects).
- `gdpr` → GDPR agent only.
- `eu-ai-act` → EU AI Act agent only.
- `both` → both agents run.

Resolution mirrors `general.environment`: explicit user setting > default. The
setting NEVER weakens a human gate.

## Success Criteria

1. `compliance.mode` exists in settings, is asked as a non-blocking ride-along
   question, and correctly gates which agents run.
2. Both agents read plan ancestry and emit plan-stage compliance findings before
   `todo`, in addition to the existing code scan.
3. On a finding, each agent returns concrete EU remediation options in the
   hosted / self-hosted / library buckets, web-sourced and dated, with price
   stated factually.
4. The agents extend the existing skills (`gdpr-compliance-checker`,
   `ai-governance-checker`) rather than duplicating their rule sets.
5. Warnings-are-critical holds: any missing mandatory artifact is a critical
   finding, never a soft tier.
6. Accuracy is web-verified at runtime — regulatory dates/thresholds are
   confirmed against authoritative sources, not hardcoded assumptions.

## Open design forks (for Gate 0 discussion)

- **Agent tier** — two Tier-2 specialists, or a Tier-1 "compliance
  sub-orchestrator" coordinating them? (Affects how findings are synthesized
  across both regimes.)
- **Iron Loop integration** — advisory Inbox findings, a dedicated compliance
  step, or a soft gate before `todo`? (The principle argues for early/blocking;
  the four mandatory human gates must remain untouched regardless.)
