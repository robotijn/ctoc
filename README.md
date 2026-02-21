<p align="center">
  <strong>CTO Chief</strong><br>
  <em>Stop AI from writing code before it thinks.</em>
</p>

<p align="center">
  <a href="https://github.com/robotijn/ctoc"><img alt="GitHub" src="https://img.shields.io/badge/GitHub-robotijn%2Fctoc-blue"></a>
  <a href="LICENSE"><img alt="License: PolyForm Shield" src="https://img.shields.io/badge/License-PolyForm%20Shield-brightgreen.svg"></a>
  <img alt="Version" src="https://img.shields.io/badge/version-6.1.29-blue">
  <img alt="Platform" src="https://img.shields.io/badge/platform-Claude%20Code-purple">
  <img alt="Agents" src="https://img.shields.io/badge/agents-85-orange">
  <img alt="Skills" src="https://img.shields.io/badge/skills-360-blue">
  <img alt="Node" src="https://img.shields.io/badge/node-%3E%3D18-green">
</p>

CTO Chief is a Claude Code plugin that turns AI coding from "generate and pray" into disciplined engineering. Every feature follows a **16-step Iron Loop** — plan before code, test before ship, secure before deploy. 85 specialist agents handle everything from TDD to security scanning while 4 human gates ensure you approve every decision. The result: AI that writes production-quality code on the first try.

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
| TDD enforcement | Automatic (Step 8) | Manual | Manual | None |
| Security scanning | Built-in (Steps 9, 13) | Manual | Manual | None |
| Human approval gates | 4 mandatory checkpoints | None | None | None |
| Quality verification | Automated gate (Step 14) | Manual | Manual | None |
| Specialist agents | 85 across 19 categories | None | DIY | None |

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
- **85 specialist agents** across 19 categories — testing, security, quality, infrastructure, and more
- **360 expert skills** — 50 languages, 85 web frameworks, 44 AI/ML, 52 data, 15 DevOps, 15 mobile, and more
- **Iron Loop methodology** — 16 steps across 4 phases with 4 human gates
- **Interactive dashboard** — Numbered menus, plan pipeline, progress tracking
- **Smart quality gates** — Background checks that don't block commits, block pushes
- **Stack detection** — Auto-detects your languages, frameworks, and tools
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

## Agents

85 specialist agents across 19 categories — [browse all →](agents/)

<details>
<summary><strong>Full agent list</strong></summary>

| Category | # | Agents |
|----------|---|--------|
| [Testing](agents/testing/) | 14 | [unit](agents/testing/runners/unit-test-runner.md), [integration](agents/testing/runners/integration-test-runner.md), [e2e](agents/testing/runners/e2e-test-runner.md), [mutation](agents/testing/runners/mutation-test-runner.md), [smoke](agents/testing/runners/smoke-test-runner.md), [quality-gate](agents/testing/quality-gate-runner.md), [playwright](agents/testing/playwright-qa.md), [coverage-enforcer](agents/testing/coverage-enforcer.md), [coverage-mapper](agents/testing/coverage-mapper.md), [smart-runner](agents/testing/smart-test-runner.md), [unit-writer](agents/testing/writers/unit-test-writer.md), [e2e-writer](agents/testing/writers/e2e-test-writer.md), [integration-writer](agents/testing/writers/integration-test-writer.md), [property-writer](agents/testing/writers/property-test-writer.md) |
| [Quality](agents/quality/) | 11 | [architecture](agents/quality/architecture-checker.md), [code-review](agents/quality/code-reviewer.md), [complexity](agents/quality/complexity-analyzer.md), [complexity-reducer](agents/quality/complexity-reducer.md), [type-check](agents/quality/type-checker.md), [code-smell](agents/quality/code-smell-detector.md), [dead-code](agents/quality/dead-code-detector.md), [duplicate](agents/quality/duplicate-code-detector.md), [consistency](agents/quality/consistency-checker.md), [quality-gate](agents/quality/quality-gate.md), [performance](agents/quality/performance-validator.md) |
| [Specialized](agents/specialized/) | 11 | [performance](agents/specialized/performance-profiler.md), [memory](agents/specialized/memory-safety-checker.md), [accessibility](agents/specialized/accessibility-checker.md), [database](agents/specialized/database-reviewer.md), [api-contract](agents/specialized/api-contract-validator.md), [config](agents/specialized/configuration-validator.md), [error](agents/specialized/error-handler-checker.md), [health](agents/specialized/health-check-validator.md), [observability](agents/specialized/observability-checker.md), [resilience](agents/specialized/resilience-checker.md), [i18n](agents/specialized/translation-checker.md) |
| [Security](agents/security/) | 7 | [scanner](agents/security/security-scanner.md), [secrets](agents/security/secrets-detector.md), [dependencies](agents/security/dependency-checker.md), [dependency-auditor](agents/security/dependency-auditor.md), [input-validation](agents/security/input-validation-checker.md), [concurrency](agents/security/concurrency-checker.md), [sast](agents/security/sast-scanner.md) |
| [Infrastructure](agents/infrastructure/) | 5 | [terraform](agents/infrastructure/terraform-validator.md), [kubernetes](agents/infrastructure/kubernetes-checker.md), [docker](agents/infrastructure/docker-security-checker.md), [ci-pipeline](agents/infrastructure/ci-pipeline-checker.md), [ci-runner](agents/infrastructure/ci-runner-setup.md) |
| [Pipeline](agents/pipeline/) | 5 | [writer](agents/pipeline/agent-writer.md), [critic](agents/pipeline/agent-critic.md), [tester](agents/pipeline/agent-tester.md), [qa](agents/pipeline/agent-qa.md), [publisher](agents/pipeline/agent-publisher.md) |
| [Planning](agents/planning/) | 4 | [vision-advisor](agents/planning/vision-advisor.md), [vision-decomposer](agents/planning/vision-decomposer.md), [product-owner](agents/planning/product-owner.md), [implementation-planner](agents/planning/implementation-planner.md) |
| [Iron Loop](agents/iron-loop/) | 3 | [integrator](agents/iron-loop/iron-loop-integrator.md), [critic](agents/iron-loop/iron-loop-critic.md), [executor](agents/iron-loop/iron-loop-executor.md) |
| [Compliance](agents/compliance/) | 3 | [gdpr](agents/compliance/gdpr-compliance-checker.md), [audit](agents/compliance/audit-log-checker.md), [license](agents/compliance/license-scanner.md) |
| [Data/ML](agents/data-ml/) | 3 | [data-quality](agents/data-ml/data-quality-checker.md), [ml-model](agents/data-ml/ml-model-validator.md), [feature-store](agents/data-ml/feature-store-validator.md) |
| [Frontend](agents/frontend/) | 3 | [bundle](agents/frontend/bundle-analyzer.md), [component](agents/frontend/component-tester.md), [visual-regression](agents/frontend/visual-regression-checker.md) |
| [Mobile](agents/mobile/) | 3 | [ios](agents/mobile/ios-checker.md), [android](agents/mobile/android-checker.md), [react-native](agents/mobile/react-native-bridge-checker.md) |
| [Versioning](agents/versioning/) | 3 | [backwards-compat](agents/versioning/backwards-compatibility-checker.md), [feature-flags](agents/versioning/feature-flag-auditor.md), [tech-debt](agents/versioning/technical-debt-tracker.md) |
| [AI Quality](agents/ai-quality/) | 2 | [hallucination](agents/ai-quality/hallucination-detector.md), [ai-code-review](agents/ai-quality/ai-code-quality-reviewer.md) |
| [Architecture](agents/architecture/) | 2 | [pattern-detector](agents/architecture/pattern-detector.md), [dependency-analyzer](agents/architecture/dependency-analyzer.md) |
| [DevEx](agents/devex/) | 2 | [onboarding](agents/devex/onboarding-validator.md), [deprecation](agents/devex/api-deprecation-checker.md) |
| [Documentation](agents/documentation/) | 2 | [docs](agents/documentation/documentation-updater.md), [changelog](agents/documentation/changelog-generator.md) |
| [Coordinator](agents/coordinator/) | 1 | [cto-chief](agents/coordinator/cto-chief.md) |
| [Cost](agents/cost/) | 1 | [cloud-cost](agents/cost/cloud-cost-analyzer.md) |

</details>

Agents spawn conditionally based on your project and current Iron Loop step.

---

## Skills

360 expert skills for instant domain knowledge — [browse all →](skills/)

<details>
<summary><strong>Full skill breakdown</strong></summary>

| Type | # | Examples |
|------|---|----------|
| [Languages](skills/languages/) | 50 | [Python](skills/languages/python.md), [TypeScript](skills/languages/typescript.md), [Go](skills/languages/go.md), [Rust](skills/languages/rust.md), [Java](skills/languages/java.md), [C#](skills/languages/csharp.md), [Swift](skills/languages/swift.md), [Kotlin](skills/languages/kotlin.md), [Ruby](skills/languages/ruby.md), [PHP](skills/languages/php.md) |
| [Web](skills/frameworks/web/) | 85 | [React](skills/frameworks/web/react.md), [Next.js](skills/frameworks/web/nextjs.md), [Vue](skills/frameworks/web/vue.md), [Django](skills/frameworks/web/django.md), [FastAPI](skills/frameworks/web/fastapi.md), [Rails](skills/frameworks/web/rails.md), [Spring Boot](skills/frameworks/web/spring-boot.md), [Express](skills/frameworks/web/express.md) |
| [AI/ML](skills/frameworks/ai-ml/) | 44 | [PyTorch](skills/frameworks/ai-ml/pytorch.md), [LangChain](skills/frameworks/ai-ml/langchain.md), [Hugging Face](skills/frameworks/ai-ml/huggingface-hub.md), [MLflow](skills/frameworks/ai-ml/mlflow.md), [TensorFlow](skills/frameworks/ai-ml/tensorflow.md) |
| [Data](skills/frameworks/data/) | 52 | [MongoDB](skills/frameworks/data/mongodb.md), [Redis](skills/frameworks/data/redis.md), [Kafka](skills/frameworks/data/kafka.md), [Spark](skills/frameworks/data/spark.md), [Elasticsearch](skills/frameworks/data/elasticsearch.md), [DuckDB](skills/frameworks/data/duckdb.md) |
| [DevOps](skills/frameworks/devops/) | 15 | [Docker](skills/frameworks/devops/docker.md), [Kubernetes](skills/frameworks/devops/kubernetes.md), [Helm](skills/frameworks/devops/helm.md), [Ansible](skills/frameworks/devops/ansible.md), [Pulumi](skills/frameworks/devops/pulumi.md) |
| [Mobile](skills/frameworks/mobile/) | 15 | [React Native](skills/frameworks/mobile/react-native.md), [Flutter](skills/frameworks/mobile/flutter.md), [SwiftUI](skills/frameworks/mobile/swiftui.md), [Jetpack Compose](skills/frameworks/mobile/jetpack-compose.md) |

| [Testing](skills/testing/) | 15 | [Playwright](skills/testing/playwright/), coverage tools, test patterns |
| [Security](skills/security/) | 5 | OWASP, input validation, secrets management |
| [Architecture](skills/architecture/) | 7 | Patterns, dependency analysis, design |
| [Complexity](skills/complexity/) | 3 | Metrics, limits, refactoring patterns |
| [Quality](skills/quality/) | 2 | Quality metrics and scoring |
| [Quality Configs](skills/quality-configs/) | 61 | Per-language lint, format, and test configs |
| Core | 6 | [CTO Persona](skills/cto-persona.md), [Iron Loop](skills/iron-loop.md), [Quality Standards](skills/quality-standards.md), [Enforcement](skills/enforcement.md) |

</details>

Stack detected automatically from your project files. Skills load on-demand — you only pay for what you use.

---

## Interactive Dashboard

The `/ctoc` command opens an interactive dashboard with 8 tabs:

| Tab | Purpose |
|-----|---------|
| Pipeline | Plan counts per stage, navigate to any stage |
| Vision | Start here — dump ideas, explore, decompose into plans |
| Functional | Product owner refines ideas into BDD specs |
| Implementation | Technical approach and architecture |
| Review | Review completed implementations |
| Todo | FIFO queue for agent work |
| Progress | In-progress and finished items |
| Tools | Release, Doctor, Update, Settings |

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

Navigate with numbers: `[1]` `[2]` `[3]`... `[0]` for back. Or just talk naturally.

---

## Enforcement

CTO Chief blocks premature actions with hooks:

| Action | Blocked Until | Escape Phrases |
|--------|--------------|----------------|
| Edit/Write code | Planning complete (Step 8+) | "skip planning", "skip iron loop", "quick fix", "trivial fix", "trivial change", "hotfix", "urgent" |
| Git commit | Documentation complete (Step 15+) | "hotfix", "urgent" |

Config and CTOC files are **whitelisted** and never blocked: `.ctoc/**`, `.local/**`, `plans/*.md`, `.gitignore`, `.gitattributes`.

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

| Command | Description |
|---------|-------------|
| `/ctoc` | Interactive dashboard with 8 tabs |
| `/ctoc:update` | Update to latest version |
| `/ctoc:push` | Quality checks + push |
| `/ctoc:quality` | Run quality checks on changed files |
| `/ctoc:vision` | Vision pipeline — explore and decompose ideas |

**Conversational commands** (said to Claude):

| Command | Description |
|---------|-------------|
| `ctoc init` | Initialize a project with CTOC methodology |
| `ctoc doctor` | Health check for your CTOC setup |

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

getVersion()       // → '6.1.29'
release()          // → bumps patch, syncs all files
release('minor')   // → bumps minor
release('major')   // → bumps major
```

Files synced by `release()`: `VERSION` (source of truth), `.claude-plugin/marketplace.json`, `.claude-plugin/plugin.json`, `README.md`

**Project structure:**
```
ctoc/
├── docs/            IRON_LOOP.md, CONTRIBUTING.md, CODE_OF_CONDUCT.md
├── src/
│   ├── commands/    8 slash commands
│   ├── hooks/       10 Claude Code hooks
│   ├── lib/         71 JS modules
│   ├── tabs/        8 dashboard tabs
│   ├── scripts/     Build utilities
│   └── data/        Static data files
├── agents/          85 agent definitions (19 categories)
├── skills/          360 language & framework skills
├── tests/           39 test files
├── .ctoc/           Config, templates, operations
└── .claude-plugin/  Plugin metadata
```

</details>

---

## License

[PolyForm Shield 1.0.0](https://polyformproject.org/licenses/shield/1.0.0) — See [LICENSE](LICENSE)

Use CTOC freely for any project. You may not offer CTOC itself or a derivative as a competing product or service without permission. For commercial licensing inquiries, contact the licensor.

## Links

[Repository](https://github.com/robotijn/ctoc) · [Issues](https://github.com/robotijn/ctoc/issues) · [Discussions](https://github.com/robotijn/ctoc/discussions)

---

**6.1.29** · Built by [@robotijn](https://github.com/robotijn)

<p align="center"><i>"Excellence is not an act, but a habit."</i></p>
