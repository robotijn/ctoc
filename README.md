# CTO Chief

> **Your Virtual CTO** — 60 AI agents. 265 expert skills. 15 quality gates.

```
/plugin marketplace add https://github.com/robotijn/ctoc
```
```
/plugin install ctoc
```

GitHub: [robotijn/ctoc](https://github.com/robotijn/ctoc)

---

## What is CTO Chief?

CTO Chief transforms Claude Code into a disciplined engineering system. Instead of jumping straight to code, it follows a 15-step **Iron Loop** methodology:

- **Plan** before code
- **Test** before ship
- **Secure** before deploy
- **Document** before commit

You are the **CTO Chief** — the human commander. The plugin provides 60 specialist agents that execute your vision.

```
                           Y O U
                    (Human CTO Chief)
                           │
                           ▼
                  ┌─────────────────┐
                  │   Coordinator   │
                  └────────┬────────┘
                           │
     ┌─────────────────────┼─────────────────────┐
     │                     │                     │
     ▼                     ▼                     ▼
┌─────────┐          ┌─────────┐          ┌─────────┐
│ Testing │          │ Quality │          │Security │
│9 agents │          │8 agents │          │5 agents │
└─────────┘          └─────────┘          └─────────┘
     │                     │                     │
     ▼                     ▼                     ▼
┌─────────┐          ┌─────────┐          ┌─────────┐
│  Infra  │          │  DevEx  │          │  More   │
│7 agents │          │5 agents │          │26 agents│
└─────────┘          └─────────┘          └─────────┘
```

---

## Installation

From Claude Code:

```
/plugin marketplace add https://github.com/robotijn/ctoc
```
```
/plugin install ctoc
```

Verify: `/plugin` → **Installed** tab → `ctoc` should be listed.

### Enable Auto-Update (Recommended)

To receive automatic updates on Claude Code startup:

1. Run `/plugin`
2. Go to **Marketplaces** tab (use Tab key)
3. Select `robotijn`
4. Select **Enable auto-update**

This makes future updates automatic.

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

15 steps across 4 phases:

```
FUNCTIONAL PLANNING (1-3)
  1. ASSESS   Understand the problem
  2. ALIGN    Business alignment
  3. CAPTURE  Requirements as specs
     └─► GATE 1: User approves what to build

TECHNICAL PLANNING (4-6)
  4. PLAN     Technical approach
  5. DESIGN   Architecture decisions
  6. SPEC     Detailed specifications
     └─► GATE 2: User approves how to build

IMPLEMENTATION (7-10)
  7. TEST      Write tests first (TDD)
  8. QUALITY   Lint, format, type-check
  9. IMPLEMENT Write code
  10. REVIEW   Self-review

DELIVERY (11-15)
  11. OPTIMIZE  Performance tuning
  12. SECURE    Security audit
  13. DOCUMENT  Update docs
  14. VERIFY    Full test suite
  15. COMMIT    Ship with confidence
      └─► GATE 3: User approves commit
```

---

## Agents

60 specialist agents across 16 categories:

| Category | Agents | Examples |
|----------|--------|----------|
| Coordinator | 1 | Orchestrates the entire workflow |
| Testing | 9 | unit, integration, e2e, property, mutation |
| Quality | 8 | types, architecture, complexity, code smells |
| Security | 5 | scanning, secrets, dependencies, validation |
| Specialized | 11 | performance, memory, accessibility, database |
| Frontend | 3 | visual regression, components, bundles |
| Mobile | 3 | iOS, Android, React Native |
| Infrastructure | 4 | Terraform, Kubernetes, Docker, CI/CD |
| Documentation | 2 | docs, changelog |
| Compliance | 3 | GDPR, audit, licenses |
| Data/ML | 3 | data quality, models, feature stores |
| Cost | 1 | cloud cost analysis |
| AI Quality | 2 | hallucination, AI code review |
| DevEx | 2 | onboarding, deprecation |
| Versioning | 3 | backwards compat, feature flags, tech debt |

Agents spawn **conditionally** based on your project and current Iron Loop step.

---

## Skills

261 embedded skills for instant expert knowledge:

| Type | Count | Examples |
|------|-------|----------|
| Languages | 50 | Python, TypeScript, Go, Rust, Java, C#, Swift, Kotlin |
| Web | 85 | React, Next.js, Vue, Django, FastAPI, Rails, Spring Boot |
| AI/ML | 44 | PyTorch, LangChain, Hugging Face, MLflow |
| Data | 52 | PostgreSQL, MongoDB, Redis, Kafka, Spark |
| DevOps | 15 | Docker, Kubernetes, Terraform, Helm |
| Mobile | 15 | React Native, Flutter, SwiftUI |

Stack detected automatically from your project files.

---

## Commands

| Command | Description |
|---------|-------------|
| `/ctoc` | Interactive terminal interface |

### Interactive Interface

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

## Troubleshooting

**Plugin not found** — reinstall:
```
/plugin marketplace add https://github.com/robotijn/ctoc
```
```
/plugin install ctoc
```

**Old marketplace cached** — clear and re-add:
```bash
rm -rf ~/.claude/plugins/marketplaces/robotijn-ctoc
```
Then in Claude Code:
```
/plugin marketplace add https://github.com/robotijn/ctoc
```
```
/plugin install ctoc
```

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

**5.0.21** — Fix plugin installation

- Fixed hooks.json location for plugin installation
- Renamed marketplace to `robotijn` (plugin is now `ctoc@robotijn`)
- Update check on session start (checks GitHub, cached 24h)
- Single source of truth: `ctoc-plugin/`

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
