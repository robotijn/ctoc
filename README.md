# CTO Chief

> **Your Virtual CTO** — 60 AI agents. 265 expert skills. 15 quality gates.

```
/plugin marketplace add https://github.com/robotijn/ctoc
```
```
/plugin install ctoc
```

**Enable auto-update:** `/plugin` → Marketplaces tab → `robotijn` → Enable auto-update

GitHub: [robotijn/ctoc](https://github.com/robotijn/ctoc)

| Command | Description |
|---------|-------------|
| `/ctoc` | Interactive dashboard (run in terminal) or status report (via Claude) |
| `/ctoc:update` | Update to latest version (instant, no restart) |

### Updating CTOC

```
/ctoc:update
```

This is a **temporary workaround** due to Claude Code restrictions where `/plugin update` doesn't reliably update plugins ([#19197](https://github.com/anthropics/claude-code/issues/19197)).

**How it works:**
- Uses git to pull latest changes directly from GitHub
- No restart required — changes are live immediately
- Self-healing: auto-clones if cache is missing or corrupted

Once the Claude Code bug is fixed, `/plugin update ctoc` will be the recommended method.

---

## What is CTO Chief?

CTO Chief transforms Claude Code into a disciplined engineering system. Instead of jumping straight to code, it follows a 15-step **Iron Loop** methodology:

- **Plan** before code
- **Test** before ship
- **Secure** before deploy
- **Document** before commit

You are the **CTO Chief** — the human commander. The plugin provides 60 specialist agents and 265 expert skills that execute your vision. Skills are loaded on-demand and token-optimized — you only pay for what you use.

```
YOU (CTO Chief)
       |
       v
  AI Coordinator --> 60 Specialist Agents
       |
       +-- Testing (9)       Quality (8)      Security (5)     Infrastructure (4)
       +-- Validators (11)   Frontend (3)     Mobile (3)       Data/ML (3)
       +-- Compliance (3)    Versioning (3)   AI Quality (2)   Documentation (2)
       +-- DevEx (2)         Cost (1)         Coordinator (1)
```

> **Validators:** accessibility, API contracts, config, database, error handling, health checks, memory safety, observability, performance, resilience, i18n

**Agent Categories:** [Testing](agents/testing/) (9) · [Quality](agents/quality/) (8) · [Security](agents/security/) (5) · [Infrastructure](agents/infrastructure/) (4) · [Specialized](agents/specialized/) (11) · [Frontend](agents/frontend/) (3) · [Mobile](agents/mobile/) (3) · [AI Quality](agents/ai-quality/) (2) · [Data/ML](agents/data-ml/) (3) · [Documentation](agents/documentation/) (2) · [Compliance](agents/compliance/) (3) · [Cost](agents/cost/) (1) · [DevEx](agents/devex/) (2) · [Versioning](agents/versioning/) (3)

---

## Installation

From Claude Code:

**Step 1:** Add the marketplace
```
/plugin marketplace add https://github.com/robotijn/ctoc
```

**Step 2:** Install the plugin
```
/plugin install ctoc
```

**Step 3:** Enable auto-update (important!)
1. Run `/plugin`
2. Go to **Marketplaces** tab (use Tab key)
3. Select `robotijn`
4. Select **Enable auto-update**

This ensures you always have the latest version on startup.

Verify: `/plugin` → **Installed** tab → `ctoc` should be listed.

---

## Quick Start

**1. Start Claude Code**
```bash
claude
```

**2. Check status**
```
/ctoc
```

---

## The Iron Loop

15 steps across 4 phases — [Full methodology →](IRON_LOOP.md)

| Phase | Steps | Description |
|-------|-------|-------------|
| [**Functional Planning**](IRON_LOOP.md#phase-1-product-owner-role-bdd-methodology) | 1-3 | ASSESS → ALIGN → CAPTURE · *Gate 1: User approves what to build* |
| [**Technical Planning**](IRON_LOOP.md#iron-loop-overview) | 4-6 | PLAN → DESIGN → SPEC · *Gate 2: User approves how to build* |
| [**Implementation**](IRON_LOOP.md#hook-enforcement) | 7-10 | TEST → QUALITY → IMPLEMENT → REVIEW |
| [**Delivery**](IRON_LOOP.md#3-human-gates) | 11-15 | OPTIMIZE → SECURE → DOCUMENT → VERIFY → COMMIT · *Gate 3: User approves commit* |

Key features: [Hook Enforcement](IRON_LOOP.md#hook-enforcement) · [Crash Recovery](IRON_LOOP.md#crash-recovery) · [Integrator + Critic Loop](IRON_LOOP.md#integrator--critic-loop) · [14 Quality Dimensions](IRON_LOOP.md#14-quality-dimensions-iso-25010-aligned)

---

## Agents

60 specialist agents across 15 categories — [Browse all →](agents/)

| Category | # | Agents |
|----------|---|--------|
| [Coordinator](agents/coordinator/) | 1 | [cto-chief](agents/coordinator/cto-chief.md) |
| [Testing](agents/testing/) | 9 | [unit](agents/testing/runners/unit-test-runner.md), [integration](agents/testing/runners/integration-test-runner.md), [e2e](agents/testing/runners/e2e-test-runner.md), [mutation](agents/testing/runners/mutation-test-runner.md), [smoke](agents/testing/runners/smoke-test-runner.md) + [writers](agents/testing/writers/) |
| [Quality](agents/quality/) | 8 | [architecture](agents/quality/architecture-checker.md), [code-review](agents/quality/code-reviewer.md), [complexity](agents/quality/complexity-analyzer.md), [type-check](agents/quality/type-checker.md), [code-smell](agents/quality/code-smell-detector.md), [dead-code](agents/quality/dead-code-detector.md), [duplicate](agents/quality/duplicate-code-detector.md), [consistency](agents/quality/consistency-checker.md) |
| [Security](agents/security/) | 5 | [scanner](agents/security/security-scanner.md), [secrets](agents/security/secrets-detector.md), [dependencies](agents/security/dependency-checker.md), [input-validation](agents/security/input-validation-checker.md), [concurrency](agents/security/concurrency-checker.md) |
| [Specialized](agents/specialized/) | 11 | [performance](agents/specialized/performance-profiler.md), [memory](agents/specialized/memory-safety-checker.md), [accessibility](agents/specialized/accessibility-checker.md), [database](agents/specialized/database-reviewer.md), [api-contract](agents/specialized/api-contract-validator.md), [config](agents/specialized/configuration-validator.md), [error](agents/specialized/error-handler-checker.md), [health](agents/specialized/health-check-validator.md), [observability](agents/specialized/observability-checker.md), [resilience](agents/specialized/resilience-checker.md), [i18n](agents/specialized/translation-checker.md) |
| [Frontend](agents/frontend/) | 3 | [bundle](agents/frontend/bundle-analyzer.md), [component](agents/frontend/component-tester.md), [visual-regression](agents/frontend/visual-regression-checker.md) |
| [Mobile](agents/mobile/) | 3 | [ios](agents/mobile/ios-checker.md), [android](agents/mobile/android-checker.md), [react-native](agents/mobile/react-native-bridge-checker.md) |
| [Infrastructure](agents/infrastructure/) | 4 | [terraform](agents/infrastructure/terraform-validator.md), [kubernetes](agents/infrastructure/kubernetes-checker.md), [docker](agents/infrastructure/docker-security-checker.md), [ci-pipeline](agents/infrastructure/ci-pipeline-checker.md) |
| [Documentation](agents/documentation/) | 2 | [docs](agents/documentation/documentation-updater.md), [changelog](agents/documentation/changelog-generator.md) |
| [Compliance](agents/compliance/) | 3 | [gdpr](agents/compliance/gdpr-compliance-checker.md), [audit](agents/compliance/audit-log-checker.md), [license](agents/compliance/license-scanner.md) |
| [Data/ML](agents/data-ml/) | 3 | [data-quality](agents/data-ml/data-quality-checker.md), [ml-model](agents/data-ml/ml-model-validator.md), [feature-store](agents/data-ml/feature-store-validator.md) |
| [Cost](agents/cost/) | 1 | [cloud-cost](agents/cost/cloud-cost-analyzer.md) |
| [AI Quality](agents/ai-quality/) | 2 | [hallucination](agents/ai-quality/hallucination-detector.md), [ai-code-review](agents/ai-quality/ai-code-quality-reviewer.md) |
| [DevEx](agents/devex/) | 2 | [onboarding](agents/devex/onboarding-validator.md), [deprecation](agents/devex/api-deprecation-checker.md) |
| [Versioning](agents/versioning/) | 3 | [backwards-compat](agents/versioning/backwards-compatibility-checker.md), [feature-flags](agents/versioning/feature-flag-auditor.md), [tech-debt](agents/versioning/technical-debt-tracker.md) |

Agents spawn **conditionally** based on your project and current Iron Loop step.

---

## Skills

265 embedded skills for instant expert knowledge — [Browse all →](skills/)

| Type | # | Examples |
|------|---|----------|
| [Languages](skills/languages/) | 50 | [Python](skills/languages/python.md), [TypeScript](skills/languages/typescript.md), [Go](skills/languages/go.md), [Rust](skills/languages/rust.md), [Java](skills/languages/java.md), [C#](skills/languages/csharp.md), [Swift](skills/languages/swift.md), [Kotlin](skills/languages/kotlin.md) |
| [Web](skills/frameworks/web/) | 85 | [React](skills/frameworks/web/react.md), [Next.js](skills/frameworks/web/nextjs.md), [Vue](skills/frameworks/web/vue.md), [Django](skills/frameworks/web/django.md), [FastAPI](skills/frameworks/web/fastapi.md), [Rails](skills/frameworks/web/rails.md), [Spring Boot](skills/frameworks/web/spring-boot.md) |
| [AI/ML](skills/frameworks/ai-ml/) | 44 | [PyTorch](skills/frameworks/ai-ml/pytorch.md), [LangChain](skills/frameworks/ai-ml/langchain.md), [Hugging Face](skills/frameworks/ai-ml/huggingface.md), [MLflow](skills/frameworks/ai-ml/mlflow.md) |
| [Data](skills/frameworks/data/) | 52 | [PostgreSQL](skills/frameworks/data/postgresql.md), [MongoDB](skills/frameworks/data/mongodb.md), [Redis](skills/frameworks/data/redis.md), [Kafka](skills/frameworks/data/kafka.md), [Spark](skills/frameworks/data/spark.md) |
| [DevOps](skills/frameworks/devops/) | 15 | [Docker](skills/frameworks/devops/docker.md), [Kubernetes](skills/frameworks/devops/kubernetes.md), [Terraform](skills/frameworks/devops/terraform.md), [Helm](skills/frameworks/devops/helm.md) |
| [Mobile](skills/frameworks/mobile/) | 15 | [React Native](skills/frameworks/mobile/react-native.md), [Flutter](skills/frameworks/mobile/flutter.md), [SwiftUI](skills/frameworks/mobile/swiftui.md) |

Stack detected automatically from your project files. Also includes: [CTO Persona](skills/cto-persona.md) · [Iron Loop](skills/iron-loop.md) · [Quality Standards](skills/quality-standards.md) · [Enforcement](skills/enforcement.md)

---

## Interactive Interface

The `/ctoc` command opens a full terminal UI with tabs:

| Tab | Purpose |
|-----|---------|
| Overview | Plan counts, agent status |
| Functional | Manage functional plan drafts |
| Implementation | Manage implementation plan drafts |
| Review | Review completed implementations |
| Todo | FIFO queue for agent work |
| Progress | In-progress and finished items |
| Tools | Doctor, Update, Settings |

**Navigation:**
- `←/→` Switch tabs
- `↑/↓` Navigate lists
- `1-9` Jump to item
- `Enter` Select
- `b` Back
- `q` Quit

Or just talk naturally — CTO Chief understands intent.

---

## Enforcement

CTO Chief blocks premature actions:

**Edit/Write blocked** until planning complete (Steps 1-6)
```
❌ BLOCKED: Edit operation blocked
   Current step: 3 (CAPTURE)
   Edit/Write allowed from: Step 7 (TEST)
```

**Commit blocked** until verification complete (Steps 1-13)
```
❌ BLOCKED: Commit blocked
   Current step: 10 (REVIEW)
   Commit allowed from: Step 14 (VERIFY)
```

**Escape hatch** — say "skip planning" or "quick fix" to bypass.

---

## Philosophy

CTO Chief embodies a senior engineering leader who:

**Never compromises on:**
- Tests for critical paths
- No secrets in code
- Error handling in production paths
- Documented public APIs

**Prioritizes:**
- Security > everything
- Correctness > performance
- Maintainability > cleverness

**Asks first:**
- What business problem does this solve?
- How will we know it works?
- What happens if it fails?

---

## Requirements

- Claude Code >= 1.0.0
- Node.js >= 18.0.0

---

## Updating

Run inside Claude Code:
```
/ctoc:update
```

Then restart to load the new version:
```bash
exit
claude --dangerously-skip-permissions --continue
```

> **Note:** `/ctoc:update` works around a [known Claude Code bug](https://github.com/anthropics/claude-code/issues/19197) where `/plugin update` doesn't refresh cached files. The Anthropic team is working on a fix.

---

## Troubleshooting

**Plugin not found** — reinstall:
```
/plugin marketplace add https://github.com/robotijn/ctoc
/plugin install ctoc
```

**Plugin stale after update** — force refresh:
```
/ctoc:update
```
Then restart Claude Code.

**State invalid** — reset:
```bash
rm ~/.ctoc/state/*.json
```

**Health check:**
```
/ctoc doctor
```

---

## Version

**5.2.32** — Fix plugin installation

- Fixed hooks.json location for plugin installation
- Renamed marketplace to `robotijn` (plugin is now `ctoc@robotijn`)
- Update check on session start (checks GitHub, cached 24h)
- Single source of truth: `ctoc-plugin/`

---

## Releasing

Every commit bumps the **patch** version automatically (e.g., `5.2.29` → `5.2.30`).

For larger changes, ask for:
- **"minor release"** → `5.2.29` → `5.3.0` (new features, backward compatible)
- **"major release"** → `5.2.29` → `6.0.0` (breaking changes)

The release script syncs the version across all files automatically.

---

## For Developers

Version management:

```javascript
const { release, getVersion, syncAll, checkForUpdates } = require('./ctoc-plugin/lib/version');

getVersion()       // → '5.0.5'
release()          // → bumps patch: 5.0.5 → 5.0.6, syncs all files
release('minor')   // → bumps minor: 5.0.5 → 5.1.0, syncs all files
release('major')   // → bumps major: 5.0.5 → 6.0.0, syncs all files
syncAll()          // → syncs current version to all files without bumping

// Async update check
const update = await checkForUpdates();
if (update.updateAvailable) {
  console.log(`${update.currentVersion} → ${update.latestVersion}`);
}
```

Files synced automatically by `release()`:
- `VERSION` (source of truth)
- `.claude-plugin/marketplace.json`
- `ctoc-plugin/.claude-plugin/plugin.json`
- `README.md` (version line)

---

## License

MIT — See [LICENSE](LICENSE)

---

## Links

- [Repository](https://github.com/robotijn/ctoc)
- [Issues](https://github.com/robotijn/ctoc/issues)
- [Discussions](https://github.com/robotijn/ctoc/discussions)

---

<p align="center"><i>"Excellence is not an act, but a habit."</i></p>
