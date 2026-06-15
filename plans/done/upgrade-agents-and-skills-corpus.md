---
title: "Upgrade the Agent & Skill Corpus — fill the thin reference library, fix targeted gaps"
created: "2026-06-15T00:00:00Z"
priority: HIGH
type: vision
status: decomposed
program: ctoc-corpus-quality
order: 1
approved_by: human
approved_at: "2026-06-15T00:00:00Z"
gate_crossed: "vision → done (decomposed 2026-06-15)"
---

# Upgrade the Agent & Skill Corpus

## The Load-Bearing Principle

**Upgrade what is thin; do not churn what is solid.** A blanket "upgrade every
agent and skill" pass would waste effort rewriting already-excellent files and
risk regressions. A 5-subagent read-only audit (2026-06-15) showed the agent and
SKILL.md layers are in strong health; the genuine emptiness is concentrated in
the **trigger-loaded reference library** (`skills/languages/`,
`skills/frameworks/`, `skills/quality-configs/`). This vision targets the audited
gaps, prioritized by leverage, and leaves the healthy majority alone.

## Problem Statement (audit-grounded, 2026-06-15)

The audit covered 110 agents, 99 SKILL.md files, and 322 non-SKILL reference
`.md` files. Findings:

1. **Reference library is the real gap (≈178 thin files).** These are
   trigger-loaded "Claude Code correction guides" (indexed in
   `.ctoc/skills.json`, loaded when Claude edits a matching file). They should be
   substantive correction surfaces but most sit at a bare 5-section template:
   - `languages/` — ~40 of 50 at template floor (~50 lines). The most-used
     languages (python 48, javascript 49, typescript 50, go 53, java 53,
     rust 57) are the *thinnest* — highest upgrade leverage.
   - `frameworks/` — 126 of 211 at floor. The *entire* ai-ml tree (pytorch 50,
     tensorflow 50, langchain 53, transformers 58), core web (react 63,
     nextjs 70), data (pandas 60, numpy 51, prisma 55), mobile (react-native 51,
     flutter 57). Richness is inversely correlated with popularity.
   - `quality-configs/` — 12 of 61 are abandoned-looking stubs from an
     early-alphabet authoring pass (php/strictest 36 vs ruby/strictest 534;
     csharp/legacy 27 vs kotlin/legacy 691).
2. **Agent layer is healthy with one real defect + one systemic staleness.**
   - `agents/infrastructure/deployment-setup.md` (576 lines, interactive,
     pipeline-run) never got the v8 4-tier frontmatter and is absent from the
     `TIER_1_AGENTS` list in `tests/architecture-invariants.test.js` — drifting
     unenforced.
   - 18 substantive agents still declare `model_optimized_for: opus-4-7`; the
     running model is Opus 4.8.
   - 15 SKILL.md files have no Tier-2 agent wrapper (coverage decision needed).
3. **SKILL.md layer is strong; only a handful of targeted fixes.**
   - `security/dependency-checker` — CRA references are placeholder-thin (no
     Reg. (EU) 2024/2847 number, no 11 Sep 2026 / 11 Dec 2027 dates, no NTIA
     minimum-elements) while siblings `dependency-auditor` and `sbom-cra-checker`
     are precise. (Warnings-are-critical: a vague regulatory pointer is a latent
     miss.)
   - `testing/runners/unit-test-runner` — missing the `type: skill` frontmatter
     field (sole structural inconsistency across the testing/quality cohort).
   - `mobile/react-native-bridge-checker` — only 2 dated source-refs vs the
     ~10+ category bar; currency under-sourced.
   - `data-ml/feature-store-validator` — C#/Java examples thinner than siblings.
   - Minor language-example gaps: `saas/posthog-analytics` (SQL BAD/SAFE),
     `saas/sentry-errors` (C++ example).
   - No skill carries a `last verified: <date>` line — weakest for the
     regulation-bearing compliance/security/legal skills.
   - Frontmatter inconsistency: 5 realtime/safety skills use `allowed-tools:`
     array syntax vs `tools:` string used by the other 94.

## Vision

A prioritized, leverage-ordered upgrade of the corpus that fills the thin
reference library and closes the targeted agent/skill gaps — without touching the
healthy majority.

### Work tiers (by leverage)

- **Tier 0 — quick wins (targeted fixes, low effort, high correctness value):**
  deployment-setup v8 frontmatter + add to TIER_1_AGENTS test; refresh the 18
  stale `model_optimized_for` to Opus 4.8; dependency-checker CRA grounding;
  unit-test-runner `type: skill`; normalize `allowed-tools:`→`tools:`; add
  `last verified:` lines to regulation-bearing skills; posthog SQL + sentry C++
  examples; react-native-bridge currency refresh.
- **Tier 1 — high-traffic reference upgrades (most leverage):** the mainstream
  `languages/` (python, js, ts, go, java, rust, c#, c, c++, ...) and the
  highest-traffic `frameworks/` (ai-ml: pytorch/tensorflow/langchain/transformers
  /the SDKs; web: react/nextjs; data: pandas/numpy/prisma; mobile:
  react-native/flutter/expo).
- **Tier 2 — long tail:** remaining template-floor `frameworks/` files and the
  12 thin `quality-configs/`.
- **Tier 3 — coverage decision:** the 15 skills without an agent wrapper —
  decide per skill whether a Tier-2 wrapper is warranted.

### Quality bar for an upgraded reference file

Each upgraded `languages/`/`frameworks/` guide must go beyond the 5-section
floor with real correction surface: concurrency footguns, error-handling idioms,
dependency/security gotchas (with CVE classes where relevant), testing
conventions, performance traps, and version-specific gotchas — dated and sourced.
Per CTOC standard, any BAD/SAFE code examples cover the 7 languages where
applicable; reference guides scoped to one language are exempt from cross-language
coverage but must be deep within their language.

## Success Criteria

1. Tier 0 fixes land first; `node --test tests/*.test.js` stays green; the
   architecture-invariants test enforces deployment-setup as Tier 1.
2. No already-SOLID file (per audit) is rewritten without a specific defect —
   the no-churn rule is honored.
3. Each upgraded reference guide measurably exceeds the 5-section floor with
   sourced, dated, correction-focused depth (not padding).
4. Upgrades proceed in leverage order (Tier 1 mainstream before Tier 2 long
   tail); each batch is independently verifiable.
5. The audit artifact (per-file verdicts) is preserved so progress is trackable
   and no thin file is silently skipped.

## Note on self-improvement scope

Per CLAUDE.md, self-improvement must be deliberate and not speculative. This
vision is grounded in a concrete 2026-06-15 audit (confirmed thin files, not
guesses) and explicitly excludes hook/gate logic. It does not opportunistically
modify unrelated solid skills.
