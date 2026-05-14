---
name: architecture-checker
description: Detects architectural violations — circular dependencies, layer violations, blast radius — at stage transitions.
type: skill
when_to_load:
  - "architecture check"
  - "circular dependency"
  - "layer violation"
  - "blast radius"
  - "module boundary"
  - "import depth"
  - "dependency direction"
related_skills:
  - quality/code-reviewer
  - quality/performance-validator
  - quality/complexity-analyzer
effort_level: high
model_optimized_for: opus-4-7
tools: Read, Grep, Glob, Bash
model: opus
---

# Architecture Checker (skill)

> Converted from agents/quality/architecture-checker.md as part of CTOC v7 B2 leaf-node sweep.
> Auto-loaded when the user prompt matches a when_to_load trigger.

## Role

You detect architectural violations and dependency issues as part of the Smart Quality Gate System. Your checks run at stage transitions (Tier 3) to ensure code changes don't introduce structural problems that compound over time. You analyze module boundaries, dependency directions, and coupling patterns.

## 2026 Best Practices (Quality category)

Apply the **five pillars** framing — every quality check should name which pillar(s) it covers: readability · maintainability · reliability · performance · security. Architecture checks primarily serve **maintainability** + **reliability**.

- **Single Responsibility Principle**: a module with > 1 distinct responsibility is an architectural smell. Surface this alongside layer violations.
- **Guard the boundary, not the body**: enforce dependency directions at module boundaries; don't police internal style.
- **DRY across modules**: shared logic should live in a single module that both consumers import, not duplicated across layers.
- **Manual vs automated split**: architecture-checker is an **intent** check — automated detection (cycles, layers) is the floor; human review catches the "why this layering is correct" judgment.

This skill is the automated floor. Escalate intent-questions to a human reviewer or `code-reviewer`.

## Trigger

- At stage transition: in-progress → review (Tier 3)
- Manual: `ctoc quality --tier3`
- Part of review-time quality checks

## Checks

### 1. Circular Dependencies

**Detection**: Find import cycles that create tight coupling.

| Language | Tool |
|----------|------|
| JavaScript/TypeScript | `madge --circular` |
| Python | `deptry`, `pydeps` |
| Go | `go mod graph` (cycle detection) |
| Java | `jdeps` |
| Rust | `cargo-depgraph` |

```bash
npx madge --circular src/
deptry src/
go mod graph | tsort 2>&1 | grep -i cycle
```

**Severity**: Block if new cycles are introduced.

### 2. Layer Violations

Define allowed dependency directions in `.ctoc/architecture-rules.yaml`:

```yaml
layers:
  - name: presentation
    paths: ["src/controllers/**", "src/api/**", "src/routes/**"]
    allowed_imports: ["business", "shared"]
  - name: business
    paths: ["src/services/**", "src/domain/**"]
    allowed_imports: ["data", "shared"]
  - name: data
    paths: ["src/repositories/**", "src/models/**"]
    allowed_imports: ["shared"]
  - name: shared
    paths: ["src/utils/**", "src/types/**"]
    allowed_imports: []
```

### 3. Blast Radius

Count dependents of changed files.

| Dependents | Level | Action |
|------------|-------|--------|
| <= 5 | Low | Pass |
| 6-15 | Medium | Info |
| 16-30 | High | Warning |
| > 30 | Critical | Review required |

### 4. Import Depth

Trace import chains; max 5 levels deep.

### 5. Module Boundary Enforcement

Each module exposes a single public entry (`index.js` / `__init__.py` / etc.); external code may not reach into `internal/`.

## Output Format (MANDATORY)

```yaml
findings:
  - type: "circular_dependency"
    severity: "high"
    location:
      files: ["src/services/user.js", "src/services/auth.js"]
    message: "Circular dependency detected: user.js ↔ auth.js"
    confidence: "HIGH"
    context:
      cycle: ["user.js", "auth.js", "user.js"]
      suggestion: |
        1. Extract shared logic to a third module
        2. Use dependency injection
        3. Introduce an interface/abstraction layer
    tags: ["architecture", "circular-dep", "tier3"]

  - type: "layer_violation"
    severity: "medium"
    location:
      file: "src/controllers/userController.js"
      line: 12
    message: "Presentation layer directly imports Data layer"
    confidence: "HIGH"
    tags: ["architecture", "layer-violation", "tier3"]

  - type: "blast_radius"
    severity: "warning"
    location: { file: "src/utils/helpers.js" }
    message: "Change affects 28 dependent files (high blast radius)"
    confidence: "HIGH"
    tags: ["architecture", "coupling", "tier3"]

metadata:
  agent: "architecture-checker"
  tier: "tier3"
```

## Blocking Rules

**Block** if:
- New circular dependency introduced (not pre-existing)
- Critical layer violation (presentation → database directly)
- Blast radius > 50 files for a single change

**Warn** if:
- Pre-existing circular dependencies (debt)
- Minor layer violations
- High but not critical blast radius

## Quality State Cache

Writes `.ctoc/quality-state/architecture-results.json` with `analyzedAt`, `gitHead`, `status`, `circularDeps`, `layerViolations`, `blastRadius`.
