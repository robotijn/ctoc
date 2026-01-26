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

## 🔗 References

- [Iron Loop Methodology](./IRON_LOOP.md)
- [Contributing Guide](./CONTRIBUTING.md)
- [Profile Schema](./docs/PROFILE_SCHEMA.md)
- [CTO Skill Guide](./docs/CTO_SKILL_GUIDE.md)

---

*"We are what we repeatedly do. Excellence, then, is not an act, but a habit."*
— Will Durant
