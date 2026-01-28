# CTOC Project — CLAUDE.md

> **This is the CLAUDE.md for the CTOC project itself.**
> CTOC dogfoods its own methodology.

---

## 🎯 Project Vision

**The USER is the CTO Chief** — commanding an army of virtual CTOs.

```
USER (CTO Chief)
    │
    ├── Defines business problems
    ├── Approves technical direction  
    └── Has final say
         │
         ▼
    Super CTO (Alignment Layer)
         │
         ├── Aligns business with technology
         ├── Selects appropriate tech CTOs
         └── Coordinates implementation
              │
              ▼
    Technical CTOs (Implementation Layer)
         │
         ├── Python CTO → FastAPI, Django, PyTorch...
         ├── TypeScript CTO → Next.js, React...
         ├── Rust CTO → Actix, Axum...
         └── ...
```

Each Technical CTO embodies a **senior engineering leader** who:
- Is **adamant** about engineering excellence
- **Refuses to compromise** on quality, security, or maintainability  
- Makes technology decisions that **serve the business**

The name **CTOC** = **CTO Chief** — that's the user, commanding this army.

---

## 🔄 Self-Improvement Protocol

CTOC is a **self-improving system**. After installation, it bootstraps and improves itself.

### How Self-Improvement Works

1. **Profile Learning**: When Claude Code encounters a new pattern, tool, or best practice, it updates the relevant profile
2. **Iron Loop Refinement**: The methodology itself improves based on what works
3. **CTO Skill Enhancement**: Each language's CTO persona learns from real implementations

### Triggering Self-Improvement

When implementing any feature in CTOC itself:

```
ctoc improve [component]
```

Components:
- `profiles/languages/*` — Language best practices
- `profiles/frameworks/*` — Framework best practices  
- `profiles/cto-skills/*` — CTO persona skills
- `templates/*` — CLAUDE.md, IRON_LOOP.md, PLANNING.md templates
- `install.sh` / `install.ps1` — Installation scripts

### Self-Improvement Rules

1. **Research First**: Before updating any profile, search for current best practices (2024-2025)
2. **Cite Sources**: Document where best practices come from
3. **Test Changes**: All profile changes must include validation
4. **Backward Compatible**: Never break existing installations
5. **Document Everything**: Every change gets documented in CHANGELOG

---

## 🔄 Community Skill Improvement System

CTOC uses a GitHub-powered system where users suggest skill improvements via issues, and maintainers process them using Claude Code.

### Processing Skill Improvement Issues

When the user runs `ctoc process-issues`:

1. **Read the issues file** at `/tmp/ctoc-issues-to-process.json` (Linux/macOS) or `$env:TEMP\ctoc-issues-to-process.json` (Windows)

2. **For each issue**, extract:
   - Skill name from "### Skill Name" section
   - Skill type (Language or Framework) from "### Skill Type" section
   - What needs updating from "### What needs updating?" section
   - Suggested improvement from "### Suggested improvement" section
   - Sources from "### Sources" section

3. **Process each skill improvement**:
   a. Locate the current skill file:
      - Languages: `.ctoc/skills/languages/{name}.md`
      - Frameworks: `.ctoc/skills/frameworks/{category}/{name}.md`
   b. Read the current skill content
   c. Research current best practices using web search if sources aren't provided
   d. Apply the suggested improvements, validating against authoritative sources
   e. Update the skill file with improvements

4. **Commit each change** with message format:
   ```
   skill: update {skill-name} (fixes #{issue-number})
   ```

5. **Create a PR** with all changes:
   - Title: "skill: batch update from community suggestions"
   - Body: List all issues being addressed
   - Link to each issue in the PR description

6. **Comment on each issue** linking to the PR:
   ```
   Created PR #{pr-number} with the suggested improvements.
   ```

### Workflow Commands

| Command | Description |
|---------|-------------|
| `ctoc skills feedback <name>` | Open browser to suggest improvement for a skill |
| `ctoc process-issues` | Fetch approved issues for processing |

### Issue Labels

| Label | Meaning |
|-------|---------|
| `skill-improvement` | Issue is a skill improvement suggestion |
| `triage` | Awaiting initial validation |
| `validated` | Skill exists and issue is properly formatted |
| `needs-review` | From new account, requires manual review |
| `invalid-skill` | Skill name not found in index |
| `ready-to-process` | Has 5+ votes, ready for processing |

### Quality Gates

Before processing an issue:
1. Verify it has `ready-to-process` label
2. Check the skill actually exists
3. Validate sources are authoritative
4. Ensure suggested changes are improvements, not regressions

---

## 📁 Project Structure

```
ctoc/
├── CLAUDE.md              # This file (dogfooding!)
├── IRON_LOOP.md           # Current work in progress
├── PLANNING.md            # Feature planning
├── README.md              # User documentation
├── CONTRIBUTING.md        # Contributor guide
├── CHANGELOG.md           # Version history
│
├── profiles/
│   ├── languages/         # Language profiles (100+)
│   │   └── {lang}.yaml
│   ├── frameworks/        # Framework profiles (200+)
│   │   └── {framework}.yaml
│   └── cto-skills/        # CTO persona per language
│       └── {lang}-cto.md
│
├── templates/
│   ├── CLAUDE.md.template
│   ├── IRON_LOOP.md.template
│   ├── PLANNING.md.template
│   └── settings.yaml.template
│
├── install.sh             # Unix installer
├── install.ps1            # Windows installer
│
├── database/
│   └── schema.sql         # Review system schema
│
└── admin/
    └── review/            # Business review interface
```

---

## 🛠️ Commands

### For Contributors

| Command | Description |
|---------|-------------|
| `ctoc` | Check CTOC project status |
| `ctoc plan` | Plan a new feature for CTOC |
| `ctoc implement` | Implement planned feature |
| `ctoc improve profiles` | Update language/framework profiles |
| `ctoc improve cto-skills` | Update CTO persona skills |
| `ctoc validate` | Validate all profiles and templates |
| `ctoc test` | Run test suite |

### For Self-Improvement

| Command | Description |
|---------|-------------|
| `ctoc research [topic]` | Research current best practices |
| `ctoc update-profile [name]` | Update specific profile with research |
| `ctoc add-profile [name]` | Add new language/framework profile |
| `ctoc add-cto-skill [lang]` | Add CTO skill for language |

### For Community Contributions

| Command | Description |
|---------|-------------|
| `ctoc skills feedback <name>` | Open issue form to suggest skill improvement |
| `ctoc process-issues` | Fetch approved skill improvements for processing |

### Plan Lifecycle Commands

| Command | Description |
|---------|-------------|
| `ctoc plan new <title>` | Create a new functional plan |
| `ctoc plan propose <id>` | Submit plan for review |
| `ctoc plan approve <id>` | Approve a plan |
| `ctoc plan start <id>` | Begin work on plan |
| `ctoc plan implement <id>` | Create implementation plan |
| `ctoc plan complete <id>` | Mark plan as implemented |
| `ctoc plan status` | Show plan dashboard |

### Git Workflow Commands

| Command | Description |
|---------|-------------|
| `ctoc sync` | Pull-rebase-push workflow |
| `ctoc commit "message"` | Validated commit with Co-Author |
| `ctoc qc "message"` | Quick commit and push |
| `ctoc status` | Enhanced git status |
| `ctoc lock check [files]` | Check file freshness |
| `ctoc lock resolve` | Smart conflict resolution |
| `ctoc lock setup-rerere` | Enable git rerere |
| `ctoc lock worktree new <branch>` | Create parallel workspace |

### Versioning Rules

**Semantic Versioning:** `vX.Y.Z` (major.minor.patch)

| Action | Version Change | Who Decides |
|--------|----------------|-------------|
| **Default (every commit)** | Patch: `vX.Y.Z` → `vX.Y.Z+1` | Automatic |
| **Minor version** | Minor: `vX.Y.Z` → `vX.Y+1.0` | User specifies |
| **Major version** | Major: `vX.Y.Z` → `vX+1.0.0` | User specifies |

**Rules:**
1. Every commit automatically bumps the **patch** version
2. User says "minor version" → bump minor, reset patch to 0
3. User says "major version" → bump major, reset minor and patch to 0
4. Update `VERSION` file with each commit
5. Update version references in install scripts if needed

**Examples:**
- Normal commit: `2.0.5` → `2.0.6`
- User says "minor release": `2.0.6` → `2.1.0`
- User says "major release": `2.1.0` → `3.0.0`

### Agent Commands

| Command | Description |
|---------|-------------|
| `ctoc agent list` | List all 60 agents |
| `ctoc agent info <name>` | Show agent details |
| `ctoc agent upgrade <name>` | Add capability to upgrade queue |
| `ctoc agent research <name>` | Show research queries for agent |
| `ctoc agent check` | Check for agent updates |
| `ctoc agent apply <name>` | Apply pending upgrades |

### Progress Commands

| Command | Description |
|---------|-------------|
| `ctoc progress` | Quick Iron Loop progress view |
| `ctoc dashboard` | Full progress dashboard |
| `ctoc progress step <n>` | Move to Iron Loop step |
| `ctoc progress complete <n>` | Complete step and advance |

---

## 🎭 The CTO Persona

Every language profile includes a **CTO Skill** — a persona that embodies:

### Core Principles

1. **Business Alignment First**
   - "What business problem are we solving?"
   - "What's the ROI of this technical decision?"
   - "How does this serve our users?"

2. **Engineering Excellence**
   - "We don't ship code without tests"
   - "Security is not optional"
   - "Technical debt is real debt"

3. **Pragmatic Leadership**
   - "Perfect is the enemy of good"
   - "Ship early, iterate often"
   - "Measure everything that matters"

4. **Team Empowerment**
   - "Make the right thing easy"
   - "Automate everything repeatable"
   - "Document for your future self"

### CTO Skill Structure

Each `profiles/cto-skills/{lang}-cto.md` contains:

```markdown
# {Language} CTO Skill

## Identity
You are a senior CTO with 20+ years of {Language} experience...

## Decision Framework
When making technical decisions...

## Code Review Stance
When reviewing code, you are adamant about...

## Business Alignment
You always connect technical decisions to...

## Red Lines (Never Compromise)
- Security vulnerabilities
- Missing tests for critical paths
- Undocumented APIs
- Unhandled errors in production paths
```

---

## 🔧 Development Workflow

### Adding a New Language Profile

1. Research current best practices (2024-2025)
2. Create `profiles/languages/{lang}.yaml`
3. Create `profiles/cto-skills/{lang}-cto.md`
4. Add tests in `tests/profiles/`
5. Update README.md language list

### Adding a New Framework Profile

1. Research current best practices (2024-2025)
2. Create `profiles/frameworks/{framework}.yaml`
3. Link to parent language profile
4. Add tests in `tests/profiles/`
5. Update README.md framework list

### Updating Existing Profiles

1. Research what has changed
2. Document changes with sources
3. Update profile yaml
4. Run validation: `ctoc validate`
5. Update CHANGELOG.md

---

## ✅ Quality Standards

### Profile Requirements

Every profile MUST include:

- [ ] Tools section with current (2024-2025) recommendations
- [ ] Commands for lint, format, test, build
- [ ] Project structure template
- [ ] Best practices with rationale
- [ ] Common issues to check
- [ ] Configuration examples

### CTO Skill Requirements

Every CTO skill MUST include:

- [ ] Clear identity and expertise
- [ ] Decision framework
- [ ] Business alignment focus
- [ ] Red lines (non-negotiables)
- [ ] Code review standards

### Documentation Requirements

- [ ] All public functions documented
- [ ] README.md always current
- [ ] CHANGELOG.md updated for every change
- [ ] Examples for every feature

---

## 🚀 Current Focus

### Immediate Priorities

1. Complete all language profiles (100+)
2. Complete all framework profiles (200+)
3. Add CTO skills for every language
4. Add Data framework profiles (top 20)
5. Add AI/ML framework profiles (top 20)

### Quality Goals

- Every profile researched from authoritative sources
- Every profile includes current (2024-2025) best practices
- Every profile tested and validated

---

## 📚 Key Files

| File | Purpose |
|------|---------|
| `CLAUDE.md` | This file — project instructions |
| `IRON_LOOP.md` | Current work in progress |
| `PLANNING.md` | Feature planning and backlog |
| `templates/CLAUDE.md.template` | Template for user projects |
| `templates/IRON_LOOP.md.template` | Template for user projects |

---

## ⚡ Subagent Usage Guidelines

### Core Principle: Use Subagents Whenever Possible and Safe

**Subagents are your force multiplier.** Always consider whether work can be parallelized across multiple agents. This is not optional optimization — it's the standard way to work efficiently.

### When to Use Subagents

**ALWAYS use subagents when:**
- Creating multiple independent files (each file = one agent)
- Researching multiple topics (each topic = one agent)
- Analyzing different parts of a codebase
- Processing multiple items (issues, profiles, tests)
- Any task that can be decomposed into independent units

**Think before each task:** "Can this be split across agents?"

### Decision Framework

```
┌─────────────────────────────────────────────────────────┐
│                 SUBAGENT DECISION TREE                  │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Is the work decomposable into independent units?       │
│                    │                                    │
│           ┌───────┴───────┐                            │
│           ▼               ▼                            │
│          YES             NO                            │
│           │               │                            │
│           ▼               ▼                            │
│    Do units modify      Do it                          │
│    the same files?      sequentially                   │
│           │                                            │
│    ┌──────┴──────┐                                     │
│    ▼             ▼                                     │
│   YES           NO                                     │
│    │             │                                     │
│    ▼             ▼                                     │
│ Serialize    PARALLELIZE                               │
│ writes       WITH SUBAGENTS                            │
│                                                        │
└────────────────────────────────────────────────────────┘
```

### Parallelism Formula

Use: `max(2, CPU_CORES - 4)` concurrent subagents

This ensures:
- Minimum 2 agents for any system
- Leaves 4 cores for system/IDE/other processes
- Scales with available hardware

### Safe Parallelization Matrix

| Operation Type | Parallel Safe? | Notes |
|----------------|----------------|-------|
| WebSearch | Yes | No state modification |
| Read/Glob/Grep | Yes | Read-only |
| WebFetch | Yes | External fetch |
| Analysis | Yes | Results can merge |
| File creation | Yes | Different files only |
| Edit/Write | **NO** | Serialize by file |
| Bash (read) | Yes | ls, cat, etc. |
| Bash (write) | **NO** | Serialize |
| Git operations | **NO** | Use worktrees for parallelism |

### Pattern: Parallel File Creation

When creating multiple files (common in CTOC):

```
Launch in parallel:
├── Agent 1: Create file-a.md
├── Agent 2: Create file-b.md
├── Agent 3: Create file-c.md
├── Agent 4: Create file-d.md
└── Agent 5: Create file-e.md

All agents work simultaneously → 5x faster
```

### Pattern: Parallel Research

When exploring a problem:

```
Launch in parallel:
├── Agent 1: WebSearch "official docs {topic}"
├── Agent 2: WebSearch "GitHub implementations {topic}"
├── Agent 3: WebSearch "security considerations {topic}"
├── Agent 4: Grep codebase for existing patterns
└── Agent 5: Read related files

Wait for all results, then synthesize.
```

### Pattern: Sequential Writes

When modifying existing files (cannot parallelize):

```
Sequential execution:
1. Edit file A
2. Edit file B
3. Edit file C
4. Run tests
5. Commit
```

### Anti-Pattern: Serial When Parallel is Possible

**DON'T do this:**
```
1. Create file A
2. Wait
3. Create file B
4. Wait
5. Create file C
```

**DO this instead:**
```
Parallel: Create files A, B, C simultaneously
```

---

## 🔗 References

- [Iron Loop Methodology](./IRON_LOOP.md)
- [Contributing Guide](./CONTRIBUTING.md)
- [Profile Schema](./docs/PROFILE_SCHEMA.md)
- [CTO Skill Guide](./docs/CTO_SKILL_GUIDE.md)

---

*"We are what we repeatedly do. Excellence, then, is not an act, but a habit."*
— Will Durant
