# Project reference

This text was moved word for word out of this repository's `CLAUDE.md` on 2026-10-06, keeping its original headings, so that `CLAUDE.md` stays small. Read it before you touch agent tiers and model rules, the project templates, the Product Loop, the release menu, project init or self-improvement, or when you need the full wording behind a short rule in `CLAUDE.md`.

## Agent Architecture (v8, 3 tiers)

CTOC v8 organizes the agent layer into three tiers. See [`docs/AGENT_ARCHITECTURE.md`](./AGENT_ARCHITECTURE.md) for the full spec.

```
Tier 0  CTO CHIEF (1)              top-level, sole dispatcher
Tier 1  Sub-orchestrators (20)     incl. synthesizer (cross-pillar) + adversarial gate-critique fleet (4)
Tier 2  Watchers / specialists (99) Opus. They think about the code, structured outputs
        (Tier 3 — DELETED)         a pre-screen that can pass without thinking is a lie
```

**Model rules (v6.9.29+, corrected)**: Claude Code has two execution contexts that matter for model declarations. The earlier v8.2 guidance — that slash commands run in a "fresh, separate context" and may safely pin any model — was **wrong in practice and caused crashes**. A slash command's `model:` frontmatter switches the **live session**; when it switched to Haiku, the session conversation no longer fit Haiku's smaller context window, forcing autocompact and crashing the session.

| Context | Model rule | Why |
|---|---|---|
| Front process (terminal `claude` session) | Stays on user's chosen model; CTOC never auto-switches | `/model` mid-session preserves context; Opus→Haiku doesn't fit and breaks the session |
| Slash commands (`/ctoc:start`, `/ctoc:push`, `/ctoc:update`) | **MUST NOT declare `model:` in frontmatter** | A slash command's `model:` switches the live session, not a fresh process; pinning Haiku triggers autocompact + crash |
| Subagents (Task tool — Tier 1/2 dispatches) | MAY declare any model | Subagent is a genuinely fresh Claude instance with isolated 200K context, no inheritance from parent |

Slash commands are NOT subagents: they run inside the user's session and must never pin a model. Enforced by `tests/slash-command-no-model-pin.test.js`.

**No agent declares `model: haiku`.** The five Haiku pre-screen agents (Tier 3) were deleted on 2026-07-17 — each declared `short_circuits: <a Tier 2 specialist>`, a key whose purpose was to stop a better-equipped agent from looking, and recorded "nothing found" for a scan that never ran. Subagent isolation made Haiku technically *safe* to run; it never made Haiku *adequate* to judge Opus-written code. Enforced by `tests/no-tier-3.test.js`.

## Step-driven question routing

Questions are asked based on which Iron Loop step the user is currently in, not based on who the user is. Every user goes through the same steps and answers (or accepts defaults for) the same step-scoped questions. There is no persona system; the pipeline is technical only.

Business questions (pricing, market, unit economics, key-performance-indicator targets) are OUT OF SCOPE for the CTO Chief technical chain — see the Product Loop in [`docs/PRODUCT_LOOP.md`](./PRODUCT_LOOP.md). They are dispatched outside this chain by the founder or product manager.

## SaaS template library

CTOC ships opinionated templates for common project types. `agents/planning/stack-chooser.md` (Tier 1) selects the matching template and presents defaults to the user.

| Template | Status | Default stack |
|---|---|---|
| `saas/b2c-subscription` | ready | Next.js 15 · Supabase · Clerk · Stripe · Resend · PostHog · Sentry · Vercel |
| `saas/b2b-sales-led` | ready | adds WorkOS SSO · org-scoped data · audit log · MSA/DPA templates · SOC2 docs |
| `saas/usage-based-api` | planned | metered billing · API keys · rate limiting · usage dashboard |
| `app/expo-react-native` | planned | Expo SDK 52 · Clerk Expo · Supabase · RevenueCat · EAS |
| `cli/bun-single-binary` | planned | Bun + cross-platform binary |
| `oss-lib/typescript` | planned | tsup · changesets · GitHub Actions |

SaaS skills under `skills/saas/`:
- `stripe-subscriptions` — Checkout, webhooks, dunning, proration, idempotency
- `clerk-auth` — signup, login, email verification, MFA, session
- `multi-tenancy-row-level` — Postgres RLS, isolation tests
- `resend-email` — SPF/DKIM/DMARC, React Email, welcome/receipt/dunning
- `posthog-analytics` — events, funnels, feature flags, A/B tests
- `legal-scaffold` — Privacy Policy · ToS · Cookie Policy · DPA generators

Production-readiness gate enforced at Gate 3 via `.ctoc/templates/saas/b2c-subscription/production-readiness.yaml` — 20+ checks (domain, HTTPS, auth, billing, email deliverability, RLS, observability, legal docs, support).

## The Product Loop (v8.4+)

Iron Loop ships features. Product Loop validates them. See [`docs/PRODUCT_LOOP.md`](./PRODUCT_LOOP.md).

```
DEFINE → INSTRUMENT → MEASURE → REVIEW → HYPOTHESIZE → EXPERIMENT → LEARN
  ↑                                                                    │
  └───────────────────── continuous post-launch ────────────────────────┘
```

| Step | Owner | When |
|---|---|---|
| DEFINE | founder + product manager (external to CTO Chief) | Canvas phase, via `agents/planning/kpi-planner.md` |
| INSTRUMENT | implementer (inside Iron Loop Step 10) | Implementation, via `skills/saas/posthog-analytics` |
| MEASURE | (automated) | Continuous (PostHog + Stripe) |
| REVIEW | founder + pm | Weekly, via `skills/product/product-reviewer` |
| HYPOTHESIZE | founder + pm | From review findings |
| EXPERIMENT | pm + programmer | Via `skills/product/experiment-designer` |
| LEARN | founder + pm | Post-experiment |

Canonical KPI library at `.ctoc/templates/product-kpis.yaml` — 17 KPIs across acquisition/activation/retention/revenue/churn/satisfaction/engagement. SaaS-b2c launch set: signup_completion, activation_rate, time_to_value, w1_retention, free_to_paid_conversion, monthly_churn, mrr.

KPI status and the weekly product review run inside the Product Loop and are reached through the menu — CTOC ships only three slash commands (`start`, `push`, `update`).

The Product Loop is dispatched outside the CTO Chief technical chain — the founder or product manager owns it. The CTO Chief implements the technical wiring (instrumentation, dashboards, feature-flag plumbing) inside Iron Loop Step 10 only.

**CTO Chief** (`agents/coordinator/cto-chief.md`, `role: top-level-coordinator`) is the only agent with top-level authority. All other agents and skills are dispatched by CTO Chief — directly or via a sub-orchestrator (planning, iron-loop, implementation-reviewer, synthesizer). No sub-orchestrator dispatches a sibling without routing through CTO Chief.

```
USER (human CTO) → CTO CHIEF (Tier 0) → SUB-ORCHESTRATORS (Tier 1)
                                       → SPECIALISTS (Tier 2)
                                       → SYNTHESIZER (Tier 1, cross-pillar)
```

CTO Chief owns the **final review** (Step 16) and verifies the 14 quality dimensions before a plan's completion; review → done then crosses in the menu's code on the recorded checks, or on the human's approval when a question needs him. When sub-orchestrator outputs conflict, the **synthesizer** produces a minimal change list using priority rules (Security > Correctness > Maintainability > Performance > Readability > Consistency); CTO Chief approves.

Dispatch logging is an instruction-level protocol (per [`DISPATCH_PROTOCOL.md`](./DISPATCH_PROTOCOL.md)) that the session model follows — each dispatch is recorded to `.ctoc/audit/dispatches/YYYY-MM-DD/<dispatch_id>.yaml` by that discipline, not by an enforcement hook today. Structural invariants (the tier and dispatch shape) ARE enforced by `tests/architecture-invariants.test.js`.

---

## Pipeline Philosophy (v7)

CTOC v7 introduces four load-bearing principles. Every agent, every plan, every change should honor them.

### 1. Pre-todo is context-building. Todo+ is execution.

| Section | Stages | Purpose |
|---|---|---|
| **Business** | Vision · Canvas · Functional | WHY + business model + product context |
| **Implementation** | Implementation · Todo | Technical context + ready-to-execute queue |
| **Execution** | In-Progress · Review · Done | Doing · verifying · shipped |

By the time work reaches `todo`, every contextual decision is locked. The implementer never guesses. If the implementer would have to guess, upstream context is incomplete — kick back to the appropriate phase.

### 2. No-stub rule.

When an agent (especially the implementer at Step 10) hits ambiguity, it MUST NOT write a stub, a TODO, or a "this needs to be filled in." It MUST make a documented reasonable choice and continue with working code. Document each choice in the plan's `## Decisions Taken Under Ambiguity` section. Wrong choices are caught at review and kicked back; stubs are not caught and rot.

### 3. Maximal lossless progress (documented choices + kickback).

The pipeline makes maximal lossless progress while a session is alive and resumes losslessly when the user returns — it does not run unattended while the user sleeps. Agents do NOT synchronously block on trivia below the question floor: they make a documented reasonable choice, continue, and let review catch wrong calls. A REAL fork — a load-bearing decision — is different: it is surfaced as a decision awaiting review and blocks its subtree until answered, never guessed. This applies to every step (Steps 1–15), not just the implementer.

### 4. Literal interpretation (Opus 4.7).

Opus 4.7 follows instructions literally. Vague prompts produce silent drift. Every agent prompt must be explicit, declare its `effort` level, name its `# Decisions Taken Under Ambiguity` write target, and mandate reading the full plan ancestry (vision → canvas → functional → implementation) before acting.

---

## Release

| Step | Command |
|------|---------|
| 1. Update VERSION | Edit `VERSION` file (e.g., `6.1.26`) |
| 2. Sync versions | `node src/scripts/release.js` |
| 3. Stage & commit | `feat/fix: description (vX.Y.Z)` |
| 4. Push (if requested) | `git push origin main` |

Commit messages ALWAYS include the version: `feat: feature name (vX.Y.Z)`

Semantic versioning: patch (default every commit), minor (user says "minor"), major (user says "major").

**Updates ALWAYS run in the background — never in the foreground (Tijn, non-negotiable).**
Every UPDATE — CTOC self-update (`/ctoc:update`), the version bump + `release.js`
count/version sync, doc-count reconciliation, the `npm test` gate, and commit/push — runs
as a background command or background subagent (`run_in_background`), never blocking the
terminal. Report the result when it lands; never make the human watch a spinner. This is
the never-wait principle (Operating Lesson 8 async-overnight, and the streaming
precompute) applied to CTOC's own maintenance: the foreground stays free for conversation
while updates run behind it.

### Release Menu

When user selects `[8] release` from dashboard, show:
```
[1] patch        vX.Y.Z+1      [4] patch+push
[2] minor        vX.Y+1.0      [5] minor+push
[3] major        vX+1.0.0      [6] major+push
[0] back
```

---

## Architecture

**The plugin manifest registers only the skills a human types.** The `skills` array in `.claude-plugin/plugin.json` is exactly `["./skills/"]`, so the slash-command picker offers the three commands plus the skills directly under `skills/` (today `ask-me-questions`) and nothing else. It once listed every category folder (2026-07-17), which put every specialist skill into the human's picker; the human asked for them to go on 2026-09-30. Specialists are reached by an agent reading `skills/<category>/<name>/SKILL.md` by path, so no agent may hold the `Skill` tool. `tests/plugin-skill-discovery.test.js` holds all of it.

## Iron Loop Summary

16 steps across 4 phases. Full details in [IRON_LOOP.md](./IRON_LOOP.md).

**Steps 1-7 are collaborative**: agents ask the user only what is of high uncertainty or huge importance and record every other choice in the plan. **Steps 8-16 are automated**: agents execute without interruption, and a built plan finishes on its recorded checks unless a question needs the user.

**Step 1 (IDEATE)**: User dumps an idea → vision-advisor + product-owner agents explore and decompose it into plans. Skip if the request is already specific. This is the recommended entry point — it prevents Claude from bypassing the planning pipeline.

| Step | Label | Agent | Phase |
|------|-------|-------|-------|
| 1 | IDEATE | vision-advisor, product-owner (opus) | Ideation — Gate 0: User approves vision |
| 2 | ASSESS | product-owner (opus) | Phase 1: Functional |
| 3 | ALIGN | product-owner (opus) | |
| 4 | CAPTURE | iron-loop-critic (opus) | Gate 1: moves on its evidence |
| 5 | PLAN | implementation-planner (opus) | Phase 2: Technical |
| 6 | DESIGN | implementation-planner (opus) | |
| 7 | SPEC | iron-loop-critic (opus) then iron-loop-integrator+iron-loop-critic (until nothing new, 3 rounds at most) | Gate 2: moves on its evidence |
| 8 | TEST | iron-loop-executor (opus) | Phase 3: Implementation |
| 9 | PREPARE | iron-loop-executor (opus) | |
| 10 | IMPLEMENT | iron-loop-executor (opus) | |
| 11 | REVIEW | iron-loop-critic (opus) | |
| 12 | OPTIMIZE | iron-loop-executor (opus) | |
| 13 | SECURE | security-scanner (opus) | |
| 14 | VERIFY | iron-loop-executor (opus) | |
| 15 | DOCUMENT | iron-loop-executor (opus) | |
| 16 | FINAL-REVIEW | iron-loop-critic (opus) | Gate 3: finishes on its checks |

**Step labels are MANDATORY.** The wired `src/lib/plan-validator.js` rejects a plan that is missing a required step (matched by step *number*). Label-*text* correctness (e.g. `TEST`, not `TESTING`) is checked by `src/hooks/validate-plan-steps.js`, which today runs only as a standalone script (`node src/hooks/validate-plan-steps.js`) and is NOT wired as a runtime hook — so a present-but-mislabeled step is not auto-rejected at runtime.

**Step 10 is ONE step** with sub-items for multiple files. Never create multiple IMPLEMENT steps.

**1 functional plan → N small implementation plans (SIP1).** Steps 5–7 decompose the functional plan into cohesive slices (~1–3 files, a module + its test kept together), each `parent_plan`-linked and `depends_on`-ordered, named `<parent-slug>-s<N>-<slice-name>.md`, each with its own Step 8–16. The `implementation-planner` typically emits many more implementation plans than functional plans. The parent implementation plan is an INDEX of its slices. When the human crosses Gates 2 and 3 himself he can batch per parent via `approveSubplans(parentSlug, fromStage)` in `src/lib/actions.js` — one human decision crosses every sibling (each stamped `approved_by: human`; loops the gate-safe `approvePlan`); plans whose evidence is enough also cross on their own in the menu's code. `listSubplans(parentSlug)` enumerates a parent's set.

**Step 14 VERIFY is the quality gate**: lint, typecheck, ALL tests, coverage at or above the enforced floor (`.ctoc/coverage-baseline.json` `minPct` — **99** today, measured 99.37% src line coverage scoped to `src/**`, a ratchet that may only rise), 0 skipped, 0 flaky. The gate runs via `npm test` (`src/scripts/test-gate.js`); `node --test tests/*.test.js` does NOT enforce coverage or zero-skipped. Review agents use 14 quality dimensions (ISO 25010 aligned) defined in [IRON_LOOP.md](./IRON_LOOP.md).

**Circuit breaker**: Max 3 kickbacks to the same step, max 5 total kickbacks per plan. If exceeded, escalate to user with a summary of what keeps failing and why.

**Escape phrases** bypass Iron Loop enforcement when the overhead would exceed the change itself: "skip planning", "skip iron loop", "quick fix", "trivial fix", "trivial change", "hotfix", "urgent".

### Common Failures (and What to Do)

| Symptom | Root Cause | Fix |
|---------|-----------|-----|
| Step 14 keeps failing on same test | Flaky test or wrong assertion | Fix the test at Step 8, not Step 10 |
| Circuit breaker trips | Misunderstood requirement | Escalate to user; likely needs re-planning |
| Step 10 creates files not in the plan | Scope creep | Add to plan or split into second plan |
| Step 13 finds critical vulnerability | Missing security in design | Kickback to Step 5 if architectural |
| Coverage < 80% after Step 8 | Tests too shallow | Review test cases; add edge case + error path tests |

---

## Menu System Rules

1. **Numbered menus after every CTOC response** — `[1][2][3]...[0]`, where `[0]` is always back/cancel
2. **Discussion mode when creating plans** — critique, find gaps, question assumptions before showing menu. Ask every question using the decision-matrix format in [`.ctoc/ask-me-questions.md`](../.ctoc/ask-me-questions.md): one question per turn, matrix first.
3. **Recommended option first** with `(Recommended)` label
4. **Auto-generate implementation details** when plans move to implementation stage
5. **Every gap gets its own matrix question** — never just list gaps, and never ask more than one at a time. For each gap, render the [`.ctoc/ask-me-questions.md`](../.ctoc/ask-me-questions.md) decision matrix — a real Unicode box-drawing table (`│` separators), columns `Option` · `Pros` · `Cons` · `Recommendation` — then ask the single question via AskUserQuestion. The `Recommendation` cell names the highest-quality option and why. A pipe-character pseudo-table is not acceptable; it must be a real box-drawing matrix.

```
### Question 1 — Where should CTOC settings live?

┌──────────────────────┬───────────────────────────────┬───────────────────────────────┬────────────────────────────────────┐
│ Option               │ Pros                          │ Cons                          │ Recommendation                     │
├──────────────────────┼───────────────────────────────┼───────────────────────────────┼────────────────────────────────────┤
│ Global (~/.ctoc/)    │ One config for all projects.  │ Cannot vary per project.      │                                    │
├──────────────────────┼───────────────────────────────┼───────────────────────────────┼────────────────────────────────────┤
│ Per-project (.ctoc/) │ Settings live with the repo.  │ Must set up every project.    │ Recommended — config versions      │
│                      │                               │                               │ with the code it governs.          │
└──────────────────────┴───────────────────────────────┴───────────────────────────────┴────────────────────────────────────┘
```

---

## Subagent Guidelines

**Plans: ALWAYS sequential.** Process todo plans one at a time, FIFO order. Never parallelize plan implementation — plans may modify overlapping files and later plans may depend on earlier changes.

**Everything else: Parallelize when independent — up to 5 concurrent subagents.** Independent work fans out, but never more than **5 background subagents in flight at any one time**. When 5 are running, wait for one to complete before launching the next, refilling the free slot immediately so the slots stay full while work remains.

| Safe to parallelize | Must serialize |
|---------------------|----------------|
| WebSearch, Read, Glob, Grep, WebFetch | Edit, Write (same file) |
| File creation (different files) | Git operations |
| Analysis, research | Plan implementation |

Example — creating 5 skill files: launch 5 agents in parallel (each writes a different file). Researching a topic: launch parallel WebSearch + Grep + Read agents, then synthesize results.

---

## Project Init Procedure

Initialization is automatic. There is no init command — when `/ctoc:start` runs in a project that has no `.ctoc/` directory, `src/commands/start.js` calls `initProject()` before rendering the dashboard. The procedure (`src/lib/init-project.js`):

1. **Detect**: Scan for languages, frameworks, tools (via `src/lib/stack-detector.js`)
2. **Generate**: Create tailored `CLAUDE.md` from `.ctoc/templates/CLAUDE.md.template`
3. **Configure**: Set up `.ctoc/settings.yaml` with detected stack
4. **Quality**: Configure quality gates based on detected tools
5. **Plans**: Create `plans/` directory structure
6. **Iron Loop**: Initialize state in `.ctoc/state/`

The generated CLAUDE.md includes: CTO persona, Iron Loop steps, detected tools, quality commands, plan management, and skill system integration.

Template: `.ctoc/templates/CLAUDE.md.template`
Generator: `src/lib/init-project.js`

---

## Self-Improvement

CTOC improves itself. When implementing features:
- WebSearch authoritative sources for current best practices before updating skills
- All profile changes need validation (`ctoc validate`)
- Document changes in commit messages with version
- Never break existing installations (backward compatible)

**STOP — Do NOT self-improve when:**
- **Implementing a user feature** — stay focused on the task, do not opportunistically "improve" unrelated skills
- **The improvement is speculative** — must be based on confirmed patterns across 2+ projects
- **It would modify hook behavior or gate logic** — requires explicit user approval (these are safety-critical paths)

### Processing Community Skill Issues (`ctoc process-issues`)

1. Read issues from `/tmp/ctoc-issues-to-process.json` (or `$env:TEMP` on Windows)
2. For each issue: extract skill name, type, suggested improvement, and sources
3. Locate skill file (`skills/languages/{name}.md` or `skills/frameworks/{category}/{name}.md`)
4. Apply improvements, validating against authoritative sources via WebSearch
5. Commit: `skill: update {skill-name} (fixes #{issue-number})`
6. Create PR linking all processed issues

## Critical Rules

### 2. Marketplace Only

CTOC is ALWAYS installed from the online marketplace. NEVER point to local paths.

```
# Install:   /plugin marketplace add https://github.com/robotijn/ctoc && /plugin install ctoc
# Update:    /plugin update ctoc
# Fix stale: Delete the robotijn cache/marketplace dirs under your Claude plugins folder, restart, reinstall
#   Linux/macOS: ~/.claude/plugins/cache/robotijn/ and ~/.claude/plugins/marketplaces/robotijn/
#   Windows: %USERPROFILE%\.claude\plugins\cache\robotijn\ and %USERPROFILE%\.claude\plugins\marketplaces\robotijn\
```

NEVER modify `installed_plugins.json`, `installPath`, or plugin paths to use local directories.
