# CTOC Project Instructions

> CTOC dogfoods its own Iron Loop. The USER is the **CTO Chief** commanding virtual CTOs.
> When context is compacted, PRESERVE (in priority order): 1) human gate rules, 2) current task state + circuit breaker, 3) marketplace rule, 4) test commands, 5) cross-platform rules.

---

## Agent Architecture (v8, 4 tiers)

CTOC v8 organizes the agent layer into four tiers. See [`docs/AGENT_ARCHITECTURE.md`](./docs/AGENT_ARCHITECTURE.md) for the full spec.

```
Tier 0  CTO CHIEF (1)              top-level, sole dispatcher
Tier 1  Sub-orchestrators (16)     incl. NEW synthesizer (cross-pillar)
Tier 2  Specialist skills (72)     leaf agents → skills, structured outputs
Tier 3  Scouts (5, Haiku subagents) fast pre-screens, short-circuit deep dispatches
```

**Model rules (v6.9.29+, corrected)**: Claude Code has two execution contexts that matter for model declarations. The earlier v8.2 guidance — that slash commands run in a "fresh, separate context" and may safely pin any model — was **wrong in practice and caused crashes**. A slash command's `model:` frontmatter switches the **live session**; when it switched to Haiku, the session conversation no longer fit Haiku's smaller context window, forcing autocompact and crashing the session.

| Context | Model rule | Why |
|---|---|---|
| Front process (terminal `claude` session) | Stays on user's chosen model; CTOC never auto-switches | `/model` mid-session preserves context; Opus→Haiku doesn't fit and breaks the session |
| Slash commands (`/ctoc:menu`, `/ctoc:push`, `/ctoc:update`) | **MUST NOT declare `model:` in frontmatter** | A slash command's `model:` switches the live session, not a fresh process; pinning Haiku triggers autocompact + crash |
| Subagents (Task tool — Tier 2/3 dispatches) | MAY declare any model | Subagent is a genuinely fresh Claude instance with isolated 200K context, no inheritance from parent |

Scouts (Tier 3) declare `model: haiku` because they run as **subagents** — isolated context, the Haiku model is safe at this layer. The user's terminal session is untouched. Slash commands are NOT subagents: they run inside the user's session and must never pin a model. Enforced by `tests/slash-command-no-model-pin.test.js`.

## Step-driven question routing

Questions are asked based on which Iron Loop step the user is currently in, not based on who the user is. Every user goes through the same steps and answers (or accepts defaults for) the same step-scoped questions. There is no persona system; the pipeline is technical only.

Business questions (pricing, market, unit economics, key-performance-indicator targets) are OUT OF SCOPE for the CTO Chief technical chain — see the Product Loop in [`docs/PRODUCT_LOOP.md`](./docs/PRODUCT_LOOP.md). They are dispatched outside this chain by the founder or product manager.

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

Iron Loop ships features. Product Loop validates them. See [`docs/PRODUCT_LOOP.md`](./docs/PRODUCT_LOOP.md).

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

KPI status and the weekly product review run inside the Product Loop and are reached through the menu — CTOC ships only three slash commands (`menu`, `push`, `update`).

The Product Loop is dispatched outside the CTO Chief technical chain — the founder or product manager owns it. The CTO Chief implements the technical wiring (instrumentation, dashboards, feature-flag plumbing) inside Iron Loop Step 10 only.

**CTO Chief** (`agents/coordinator/cto-chief.md`, `role: top-level-coordinator`) is the only agent with top-level authority. All other agents and skills are dispatched by CTO Chief — directly or via a sub-orchestrator (planning, iron-loop, implementation-reviewer, synthesizer). No sub-orchestrator dispatches a sibling without routing through CTO Chief.

```
USER (human CTO) → CTO CHIEF (Tier 0) → SCOUTS (Tier 3, parallel)
                                       → SUB-ORCHESTRATORS (Tier 1)
                                       → SPECIALISTS (Tier 2)
                                       → SYNTHESIZER (Tier 1, cross-pillar)
```

CTO Chief is the **final approver** before any plan crosses Gate 3 (review → done). It verifies the 14 quality dimensions and the human-approval marker exist before approving. When sub-orchestrator outputs conflict, the **synthesizer** produces a minimal change list using priority rules (Security > Correctness > Maintainability > Performance > Readability > Consistency); CTO Chief approves.

Every dispatch is logged to `.ctoc/audit/dispatches/YYYY-MM-DD/<dispatch_id>.yaml` per the [`DISPATCH_PROTOCOL.md`](./docs/DISPATCH_PROTOCOL.md). Structural invariants are enforced by `tests/architecture-invariants.test.js`.

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

### 3. Async overnight (documented choices + kickback).

The pipeline drains while the user sleeps. Agents do NOT synchronously block on ambiguity — they make a documented choice, continue, and let morning review catch wrong calls. This applies to every step (Steps 1–15), not just the implementer.

### 4. Literal interpretation (Opus 4.7).

Opus 4.7 follows instructions literally. Vague prompts produce silent drift. Every agent prompt must be explicit, declare its `effort` level, name its `# Decisions Taken Under Ambiguity` write target, and mandate reading the full plan ancestry (vision → canvas → functional → implementation) before acting.

---

## Mandatory Pipeline Use (v7)

When Claude is inside a CTOC project, the **PreToolUse enforcement hook** (`src/hooks/PreToolUse.Edit.js` and siblings for Write/MultiEdit/NotebookEdit) intercepts every file-edit operation. Flow:

1. **Whitelist** — `.gitignore`, `.ctoc/*`, `.local/*`, `plans/*.md`, `VERSION` always pass.
2. **Non-CTOC project** — silent pass; the hook treats this project as out of scope.
3. **Plan-covered target** — allow. The hook checks each active plan's `files:` declaration (in stages `in-progress`, `todo`, `implementation`) and matches the target via minimatch-style globs. Stage priority: in-progress > todo > implementation. Within a stage, most-specific glob wins.
4. **Escape phrase in recent user messages** — allow. See `src/lib/escape-phrases.js` for the canonical list (`hotfix`, `trivial fix`, `urgent`, `skip planning`, `skip iron loop`, `quick fix`, `trivial change`). Case-insensitive, word-bounded.
5. **Otherwise — BLOCK** with a helpful message redirecting to `/ctoc:menu`.

Every decision is logged to `.ctoc/logs/enforcement.json`. Hook fails OPEN on internal error.

**Per-project tuning** via `.ctoc/settings.yaml`:
```yaml
enforcement:
  mode: strict   # strict | soft | off  (default: strict)
```

**Plans must declare `files:`** in YAML frontmatter to be coverage-aware. Pre-v7 plans without this declaration fall through to escape-phrase / block (per the X1 decision: warn-only treatment is logged but not yet block-default for legacy plans).

---

## Critical Rules

### 1. Human Gates (4 Mandatory Approval Points)

Four transitions REQUIRE human approval. NEVER cross these automatically.

| Gate | Transition | Revert To | Why |
|------|------------|-----------|-----|
| Gate 0 | vision -> functional | vision | Prevents exploring the wrong idea |
| Gate 1 | functional -> implementation | functional | Prevents building the wrong thing |
| Gate 2 | implementation -> todo | implementation | Prevents wrong technical approach |
| Gate 3 | review -> done | review | Prevents shipping unreviewed code |

**Enforcement**: Pre-tool hook monitors ALL tool calls. Violations auto-revert the plan, log to `.ctoc/logs/gate-violations.json`, and alert the user. Plans at gate destinations need an `approved_by: human` marker or they get reverted.

**If asked to "complete" or "move to done"**: REFUSE. Explain the human gate requirement.

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

---

## Test & Verify

```bash
node --test tests/*.test.js          # Run all 40 test files (cross-platform)
node src/scripts/release.js          # Sync VERSION to all JSON files
```

All tests must show `# fail 0`. If any test fails, fix before committing. The VERSION file is the single source of truth for version numbers. Do NOT use `run-all.js` (it doesn't exist).

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

```
ctoc/
  CLAUDE.md              This file — start here
  VERSION                Source of truth for version
  docs/                  IRON_LOOP.md, CONTRIBUTING.md, CODE_OF_CONDUCT.md
  src/                   Source code directory
    commands/            3 slash commands (menu, push, update)
    hooks/               10 Claude Code hooks (session start, pre-tool-use, post-tool-use)
    lib/                 72 JS modules (state, quality, security, planning, UI, analysis)
    scripts/             Build utilities (release.js, move-plan.js, coverage map)
    tabs/                8 dashboard tabs (overview, vision, functional, implementation, review, todo, progress, tools)
    data/                Static data files
  agents/                86 agent definitions across 19 categories
  skills/                360 language & framework skill files
  tests/                 40 test files
  .ctoc/                 Config, templates, operations
  .claude-plugin/        Plugin metadata (plugin.json, marketplace.json, hooks.json)
  plans/                 Plan files by stage (vision/, functional/, implementation/, todo/, review/, done/)
                         Note: in-progress is a plan state tracked in YAML frontmatter, not a separate directory
```

**Key entry points:**

| File | Purpose |
|------|---------|
| `src/commands/menu.js` | Dashboard router and UI |
| `src/lib/actions.js` | Plan operations (create, move, approve) |
| `src/lib/state.js` | Plan state management |
| `src/lib/quality-gate.js` | Quality enforcement |
| `src/lib/iron-loop.js` | Step validation and Integrator+Critic |
| `src/lib/init-project.js` | Project initialization |
| `src/hooks/PreToolUse.Bash.js` | Edit/commit enforcement |
| `src/hooks/human-gate-check.js` | Human gate violation detection + auto-revert |
| `.ctoc/operations-registry.yaml` | Agent registry, kanban config |

---

## Iron Loop Summary

16 steps across 4 phases. Full details in [IRON_LOOP.md](./docs/IRON_LOOP.md).

**Steps 1-7 are collaborative**: agents ask questions, present options, and wait for the user's decision. They work WITH the user, not in isolation. **Steps 8-16 are automated**: agents execute without interruption, user reviews at Gate 3.

**Step 1 (IDEATE)**: User dumps an idea → vision-advisor + product-owner agents explore and decompose it into plans. Skip if the request is already specific. This is the recommended entry point — it prevents Claude from bypassing the planning pipeline.

| Step | Label | Agent | Phase |
|------|-------|-------|-------|
| 1 | IDEATE | vision-advisor, product-owner (sonnet) | Ideation — Gate 0: User approves vision |
| 2 | ASSESS | product-owner (sonnet) | Phase 1: Functional |
| 3 | ALIGN | product-owner (sonnet) | |
| 4 | CAPTURE | functional-reviewer (opus) | Gate 1: User approves plan |
| 5 | PLAN | implementation-planner (opus) | Phase 2: Technical |
| 6 | DESIGN | implementation-planner (opus) | |
| 7 | SPEC | implementation-plan-reviewer (opus) then integrator+critic (10 rounds) | Gate 2: User approves approach |
| 8 | TEST | test-maker (opus) | Phase 3: Implementation |
| 9 | PREPARE | quality-checker (sonnet) | |
| 10 | IMPLEMENT | implementer (sonnet) | |
| 11 | REVIEW | self-reviewer (opus) | |
| 12 | OPTIMIZE | optimizer (sonnet) | |
| 13 | SECURE | security-scanner (opus) | |
| 14 | VERIFY | verifier (sonnet) | |
| 15 | DOCUMENT | documenter (sonnet) | |
| 16 | FINAL-REVIEW | implementation-reviewer (opus) | Gate 3: User approves result |

**Step labels are MANDATORY** — validated by `src/lib/plan-validator.js` (library) and enforced at runtime by `src/hooks/validate-plan-steps.js` (hook). Plans with wrong labels are REJECTED.

**Step 10 is ONE step** with sub-items for multiple files. Never create multiple IMPLEMENT steps.

**Step 14 VERIFY is the quality gate**: lint, typecheck, ALL tests, coverage >= 80%, 0 skipped, 0 flaky. Review agents use 14 quality dimensions (ISO 25010 aligned) defined in [IRON_LOOP.md](./docs/IRON_LOOP.md).

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
2. **Discussion mode when creating plans** — critique, find gaps, question assumptions before showing menu
3. **Recommended option first** with `(Recommended)` label
4. **Auto-generate implementation details** when plans move to implementation stage
5. **Every gap gets a question with pros/cons** — never just list gaps. Use `+`/`-` for pros/cons (not emojis)

```
Gap: Settings location unclear
  [1] Global (~/.ctoc/) (Recommended)
      + One config for all projects   - Can't vary per project
  [2] Per-project (.ctoc/)
      + Settings travel with repo     - Must configure every project
```

---

## Subagent Guidelines

**Plans: ALWAYS sequential.** Process todo plans one at a time, FIFO order. Never parallelize plan implementation — plans may modify overlapping files and later plans may depend on earlier changes.

**Everything else: Parallelize when independent.**

| Safe to parallelize | Must serialize |
|---------------------|----------------|
| WebSearch, Read, Glob, Grep, WebFetch | Edit, Write (same file) |
| File creation (different files) | Git operations |
| Analysis, research | Plan implementation |

Example — creating 5 skill files: launch 5 agents in parallel (each writes a different file). Researching a topic: launch parallel WebSearch + Grep + Read agents, then synthesize results.

---

## Quality Non-Negotiables

### No Silent Test Failures

Tests must NEVER silently pass. These patterns are BLOCKED:
- Empty catch blocks that swallow errors
- Early return without assertion (test "passes" without testing)
- Tests without assertions (always green)
- Skipped tests without documented reason
- Mocked-away core logic (testing the mock, not the code)

**If a test cannot run, it must FAIL LOUDLY.**

### Test Quality Checklist

Before marking Step 14 (VERIFY) as passed:
- [ ] Every test has at least one meaningful assertion
- [ ] Error paths are tested, not just happy paths
- [ ] Mocks are minimal — only external dependencies, never core logic
- [ ] No test depends on execution order
- [ ] Coverage >= 80% on new code

---

## Cross-Platform Requirement

All code MUST run on Windows, macOS, and Linux. Use:
- `path.join()` not string concatenation for paths
- `fs.promises` for async file operations
- `process.platform` checks when OS-specific behavior is needed
- `os.homedir()` not hardcoded `~`
- No bash scripts as entry points (Node.js only)

---

## Project Init Procedure

Initialization is automatic. There is no init command — when `/ctoc:menu` runs in a project that has no `.ctoc/` directory, `src/commands/menu.js` calls `initProject()` before rendering the dashboard. The procedure (`src/lib/init-project.js`):

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
