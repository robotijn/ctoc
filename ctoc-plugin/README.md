# CTOC Plugin for Claude Code

> **Your Virtual CTO** — Command an army of 60 AI agents, backed by 261 expert skills.

```
/plugin add https://github.com/robotijn/ctoc
```

---

## What is CTOC?

**CTOC (CTO Chief)** transforms Claude Code into a disciplined software engineering system. Instead of jumping straight to code, it follows a structured 15-step **Iron Loop** methodology that ensures every feature is:

- **Planned** before coded
- **Tested** before shipped
- **Secured** before deployed
- **Documented** before committed

You are the **CTO Chief** — the human commander. The plugin gives you command of 60 specialized AI agents that execute your vision with precision.

```
                              Y O U
                       Human CTO Chief
                              │
                              ▼
                    ┌─────────────────┐
                    │   cto-chief     │
                    │ (AI Coordinator)│
                    └────────┬────────┘
                             │
      ┌──────────────────────┼──────────────────────┐
      │                      │                      │
      ▼                      ▼                      ▼
┌───────────┐         ┌───────────┐         ┌───────────┐
│  TESTING  │         │  QUALITY  │         │ SECURITY  │
│  9 agents │         │  8 agents │         │  5 agents │
└───────────┘         └───────────┘         └───────────┘
      │                      │                      │
      ▼                      ▼                      ▼
┌───────────┐         ┌───────────┐         ┌───────────┐
│SPECIALIZED│         │ PLATFORM  │         │COMPLIANCE │
│ 11 agents │         │ 10 agents │         │ 11 agents │
└───────────┘         └───────────┘         └───────────┘
```

**60 agents. 50 languages. 211 frameworks. 15 quality gates.**

---

## Installation

From within Claude Code:

```
/plugin add https://github.com/robotijn/ctoc
```

That's it. Restart Claude Code and the plugin activates.

### Verify Installation

Type `/ctoc:dashboard` to see the dashboard.

---

## Quick Start

### 1. Start Claude Code

```bash
claude
```

### 2. Check Status

```
/ctoc:dashboard
```

Shows your project dashboard with Iron Loop status.

### 3. Start Working

Just talk naturally:

```
I need a login system with email verification
```

CTOC automatically engages the Iron Loop — planning before coding, testing before shipping.

---

## The Iron Loop

The Iron Loop is a **15-step methodology** with three human approval gates:

```
PHASE 1: FUNCTIONAL PLANNING (Steps 1-3)
  1. ASSESS  ─ Understand the problem
  2. ALIGN   ─ Business alignment
  3. CAPTURE ─ Requirements as specs
     └─► GATE 1: Approve functional plan

PHASE 2: TECHNICAL PLANNING (Steps 4-6)
  4. PLAN   ─ Technical approach
  5. DESIGN ─ Architecture decisions
  6. SPEC   ─ Detailed specifications
     └─► GATE 2: Approve technical plan

PHASE 3: IMPLEMENTATION (Steps 7-10)
  7. TEST      ─ Write tests first (TDD)
  8. QUALITY   ─ Lint, format, type-check
  9. IMPLEMENT ─ Write code
  10. REVIEW   ─ Self-review

PHASE 4: DELIVERY (Steps 11-15)
  11. OPTIMIZE  ─ Performance tuning
  12. SECURE    ─ Security audit
  13. DOCUMENT  ─ Update docs
  14. VERIFY    ─ Full test suite
  15. COMMIT    ─ Ship with confidence
      └─► GATE 3: Approve commit
```

### Why This Matters

| Step | If Skipped... |
|------|---------------|
| Assess | Build something nobody wants |
| Plan | Chaotic implementation |
| Test | Unknown if it works |
| Quality | Technical debt accumulates |
| Secure | Vulnerabilities ship |
| Document | Others can't maintain it |
| Verify | Regressions sneak in |

---

## 60 Specialist Agents

CTOC includes 60 specialist agents across 16 categories. The **cto-chief** coordinator spawns the right agents for each Iron Loop step.

### Agent Categories

| Category | Count | Purpose |
|----------|-------|---------|
| **Coordinator** | 1 | cto-chief — orchestrates everything |
| **Testing Writers** | 4 | unit, integration, e2e, property tests |
| **Testing Runners** | 5 | unit, integration, e2e, smoke, mutation |
| **Quality** | 8 | types, review, architecture, complexity, smells, duplicates, dead code |
| **Security** | 5 | scanning, secrets, dependencies, input validation, concurrency |
| **Specialized** | 11 | performance, memory, accessibility, database, API, i18n, observability, errors, resilience, health, config |
| **Frontend** | 3 | visual regression, components, bundle analysis |
| **Mobile** | 3 | iOS, Android, React Native |
| **Infrastructure** | 4 | Terraform, Kubernetes, Docker, CI/CD |
| **Documentation** | 2 | docs update, changelog |
| **Compliance** | 3 | GDPR, audit logs, licenses |
| **Data/ML** | 3 | data quality, ML models, feature stores |
| **Cost** | 1 | cloud cost analysis |
| **AI Quality** | 2 | hallucination detection, AI code review |
| **DevEx** | 2 | onboarding, API deprecation |
| **Versioning** | 3 | backwards compat, feature flags, tech debt |

### Step-to-Agent Mapping

| Step | Agents Spawned |
|------|----------------|
| 7 TEST | unit-test-writer, integration-test-writer, e2e-test-writer |
| 8 QUALITY | type-checker, complexity-analyzer, code-smell-detector |
| 10 REVIEW | code-reviewer, architecture-checker, security-scanner |
| 11 OPTIMIZE | performance-profiler, bundle-analyzer, memory-safety-checker |
| 12 SECURE | security-scanner, secrets-detector, dependency-checker, gdpr-compliance-checker |
| 13 DOCUMENT | documentation-updater, changelog-generator |
| 14 VERIFY | unit-test-runner, integration-test-runner, e2e-test-runner, smoke-test-runner |
| 15 COMMIT | backwards-compatibility-checker, technical-debt-tracker |

Agents are spawned **conditionally** based on your project:
- Frontend project? → visual-regression-checker, component-tester
- Mobile project? → ios-checker, android-checker
- Infrastructure changes? → terraform-validator, kubernetes-checker
- AI/ML code? → hallucination-detector, ml-model-validator

---

## 261 Expert Skills

CTOC embeds expert knowledge for 50 programming languages and 211 frameworks. Skills are loaded **on-demand** based on your project's detected stack.

### Languages (50)

Python, TypeScript, JavaScript, Go, Rust, Java, C#, PHP, Ruby, Swift, Kotlin, Scala, Elixir, C, C++, Dart, R, Julia, Haskell, Clojure, Assembly, COBOL, Fortran, Groovy, MATLAB, Prolog, Solidity, Terraform, GraphQL, and 21 more.

### Frameworks (211)

| Category | Count | Examples |
|----------|-------|----------|
| **Web** | 85 | React, Next.js, Vue, Angular, Svelte, Django, FastAPI, Express, Rails, Laravel, Spring Boot, Gin, Actix, Phoenix |
| **AI/ML** | 44 | PyTorch, TensorFlow, LangChain, LlamaIndex, Hugging Face, MLflow, Gradio, ChromaDB, Pinecone |
| **Data** | 52 | PostgreSQL, MongoDB, Redis, Kafka, Airflow, dbt, Spark, Snowflake, Elasticsearch, Prisma |
| **DevOps** | 15 | Docker, Kubernetes, Terraform, Ansible, Helm, Prometheus, Grafana, Vault |
| **Mobile** | 15 | React Native, Flutter, Expo, SwiftUI, Jetpack Compose, Ionic |

### Automatic Stack Detection

CTOC detects your stack from:
- `package.json` → Node.js, React, Vue, etc.
- `pyproject.toml` / `requirements.txt` → Python, Django, FastAPI, etc.
- `go.mod` → Go, Gin, Echo, etc.
- `Cargo.toml` → Rust, Actix, Axum, etc.
- `pubspec.yaml` → Dart, Flutter
- And many more...

Skills are loaded instantly from embedded files — no additional network requests needed.

---

## Commands

| Command | Description |
|---------|-------------|
| `/ctoc:dashboard` | Show dashboard with current status |
| `/ctoc:start <name>` | Start tracking a new feature |
| `/ctoc:step <n>` | Move to step n (1-15) |
| `/ctoc:progress` | Show detailed Iron Loop progress |
| `/ctoc:plan` | Show plan dashboard |
| `/ctoc:doctor` | Run health check |

---

## Enforcement

CTOC enforces the Iron Loop through **hooks** that block premature actions:

### Edit/Write Blocked (Steps 1-6)

You cannot edit code until planning is complete:

```
❌ BLOCKED: Edit operation blocked
   Current step: 3 (CAPTURE)
   Edit/Write allowed from: Step 7 (TEST)

   Complete planning first, or user can say "skip planning"
```

### Commit Blocked (Steps 1-13)

You cannot commit until verification is complete:

```
❌ BLOCKED: Commit blocked
   Current step: 10 (REVIEW)
   Commit allowed from: Step 14 (VERIFY)

   Complete the Iron Loop or user can say "force commit"
```

### Whitelisted Files

These files can always be edited:
- `.gitignore`, `.gitattributes`
- `.ctoc/**` (plugin config)
- `plans/**/*.md` (plan documents)

### Escape Hatch

The **only** way to bypass enforcement is explicit user intent:
- "skip planning" — allows edit before Step 7
- "quick fix" — allows immediate edit
- "force commit" — allows commit before Step 14

CTOC never suggests skipping. Discipline comes from you.

---

## State Management

Iron Loop state is stored securely:

```
~/.ctoc/state/<project-hash>.json
```

### Features

- **Project-specific**: Each project has isolated state
- **Cryptographically signed**: HMAC-SHA256 prevents tampering
- **Gate expiration**: Approvals expire after 24 hours
- **Portable**: State follows you across machines via the hash

### State Structure

```json
{
  "feature": "user-authentication",
  "currentStep": 7,
  "completedSteps": [1, 2, 3, 4, 5, 6],
  "gates": {
    "functional": { "approved": true, "timestamp": "..." },
    "technical": { "approved": true, "timestamp": "..." }
  },
  "signature": "hmac-sha256-signature"
}
```

---

## Philosophy

CTOC embodies the **CTO persona** — a senior engineering leader who:

### Never Compromises On

1. **Tests for critical paths** — No shipping untested code
2. **No secrets in code** — Environment variables only
3. **Error handling** — All production paths handle failures
4. **Documentation** — Public APIs are documented

### Prioritizes

1. **Security** > everything else
2. **Correctness** > performance
3. **Maintainability** > cleverness
4. **Consistency** > local optimization

### Asks Before Deciding

- "What business problem does this solve?"
- "How will we know it works?"
- "What happens if it fails?"

---

## Project Structure

```
ctoc-plugin/
├── .claude-plugin/
│   └── plugin.json           # Plugin manifest
├── commands/                  # 6 slash commands
│   ├── dashboard.md
│   ├── start.md
│   ├── step.md
│   ├── progress.md
│   ├── plan.md
│   └── doctor.md
├── agents/                    # 60 specialist agents
│   ├── coordinator/          # 1 coordinator
│   ├── testing/              # 9 test agents
│   ├── quality/              # 8 quality agents
│   ├── security/             # 5 security agents
│   ├── specialized/          # 11 specialized agents
│   ├── frontend/             # 3 frontend agents
│   ├── mobile/               # 3 mobile agents
│   ├── infrastructure/       # 4 infra agents
│   ├── documentation/        # 2 doc agents
│   ├── compliance/           # 3 compliance agents
│   ├── data-ml/              # 3 data/ML agents
│   ├── cost/                 # 1 cost agent
│   ├── ai-quality/           # 2 AI quality agents
│   ├── devex/                # 2 dev experience agents
│   └── versioning/           # 3 versioning agents
├── skills/                    # 261 embedded skills
│   ├── languages/            # 50 language skills
│   └── frameworks/           # 211 framework skills
│       ├── web/             # 85 web frameworks
│       ├── ai-ml/           # 44 AI/ML frameworks
│       ├── data/            # 52 data frameworks
│       ├── devops/          # 15 DevOps tools
│       └── mobile/          # 15 mobile frameworks
├── hooks/                     # Enforcement hooks
│   ├── SessionStart.js
│   ├── PreToolUse.Edit.js
│   ├── PreToolUse.Write.js
│   └── PreToolUse.Bash.js
├── lib/                       # Core libraries
│   ├── state-manager.js      # Iron Loop state persistence
│   ├── crypto.js             # HMAC-SHA256 signing
│   ├── stack-detector.js     # Auto-detect project stack
│   ├── skill-loader.js       # Load embedded skills
│   ├── version.js            # Version bump & update check
│   └── ui.js                 # Terminal UI components
└── data/
    └── skills-index.json     # Index of all 261 skills
```

---

## Configuration

CTOC works out of the box with sensible defaults. No configuration required.

### Optional Settings

Create `~/.ctoc/settings.json` for customization:

```json
{
  "enforcement": {
    "editBlockStep": 7,
    "commitBlockStep": 14,
    "gateExpirationHours": 24
  },
  "display": {
    "showAgentSpawns": true,
    "verboseProgress": false
  }
}
```

---

## Comparison

| Feature | Without CTOC | With CTOC |
|---------|--------------|-----------|
| Code quality | Variable | Consistent |
| Test coverage | Optional | Required |
| Security review | Often skipped | Enforced |
| Documentation | Afterthought | Built-in |
| Planning | Ad-hoc | Structured |
| Technical debt | Accumulates | Tracked |

---

## Requirements

- **Claude Code** >= 1.0.0
- **Node.js** >= 18.0.0

---

## Troubleshooting

### "Plugin not found"

Reinstall:

```
/plugin add https://github.com/robotijn/ctoc
```

### "State signature invalid"

Reset state:

```bash
rm ~/.ctoc/state/*.json
```

### "Skill not loading"

Reinstall the plugin:

```
/plugin remove ctoc
/plugin add https://github.com/robotijn/ctoc
```

### Getting Help

```
/ctoc:doctor
```

Runs a comprehensive health check.

---

## Version

**5.0.3** — Streamlined Release

- 60 specialist agents across 16 categories
- 261 embedded skills (50 languages + 211 frameworks)
- Update check on session start (GitHub, cached 24h)
- Version management library (`lib/version.js`)
- Removed legacy duplicates, single source of truth

---

## License

MIT License. See [LICENSE](LICENSE) for details.

---

## Links

- **Repository**: [github.com/robotijn/ctoc](https://github.com/robotijn/ctoc)
- **Issues**: [github.com/robotijn/ctoc/issues](https://github.com/robotijn/ctoc/issues)
- **Discussions**: [github.com/robotijn/ctoc/discussions](https://github.com/robotijn/ctoc/discussions)

---

<p align="center">
  <i>"We are what we repeatedly do. Excellence, then, is not an act, but a habit."</i>
  <br>
  — Will Durant
</p>
