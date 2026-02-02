# Quality Modes

CTOC enforces three quality modes, each designed for different project stages and requirements.

## Mode Overview

| Mode | Coverage | Complexity | Target | CI Blocking |
|------|----------|------------|--------|-------------|
| **Strict** | 80% | Max 10 cyclomatic | New projects | All checks |
| **Strictest** | 90% | Max 7 cyclomatic | High-stakes | All + warnings |
| **Legacy** | 50% | Max 15 cyclomatic | Existing code | Critical only |

---

## Strict Mode (Default for New Projects)

The standard quality bar for professional software development.

### Coverage Requirements

| Metric | Threshold | Enforcement |
|--------|-----------|-------------|
| Lines | 80% | CI blocks below |
| Branches | 80% | CI blocks below |
| Functions | 80% | CI blocks below |
| Statements | 80% | CI blocks below |

### Linting Requirements

- **Zero errors**: All linter errors must be resolved
- **Warnings reviewed**: Warnings are logged but do not block
- **Format enforced**: Auto-formatting required on commit

### Security Requirements

| Severity | Action |
|----------|--------|
| Critical | Block CI immediately |
| High | Block CI immediately |
| Medium | Warning, fix within sprint |
| Low | Log only |

### Complexity Limits

| Metric | Limit | Rationale |
|--------|-------|-----------|
| Cyclomatic | 10 | Functions should have limited decision paths |
| Cognitive | 15 | Code should be readable without excessive context |
| Function length | 50 lines | Encourages single-responsibility functions |
| File length | 400 lines | Encourages modular design |
| Parameters | 4 | More parameters suggest need for object/struct |
| Nesting depth | 4 | Deep nesting indicates need for extraction |

### Type Safety (Typed Languages)

| Requirement | TypeScript | Python | Java/Go/Rust |
|-------------|------------|--------|--------------|
| Strict mode | Required | mypy strict | N/A (built-in) |
| `any` types | Discouraged | `Any` discouraged | N/A |
| Null safety | `strictNullChecks` | Optional type hints | Built-in |

### When to Use Strict

- New projects starting from scratch
- Projects with established testing culture
- Teams with CI/CD infrastructure
- Production-bound code

---

## Strictest Mode (High-Stakes Projects)

Maximum quality enforcement for mission-critical systems.

### Coverage Requirements

| Metric | Threshold | Enforcement |
|--------|-----------|-------------|
| Lines | 90% | CI blocks below |
| Branches | 90% | CI blocks below |
| Functions | 90% | CI blocks below |
| Statements | 90% | CI blocks below |

### Linting Requirements

- **Zero errors**: No exceptions
- **Zero warnings**: Warnings treated as errors
- **Format enforced**: Pre-commit hook required

### Security Requirements

| Severity | Action |
|----------|--------|
| Critical | Block CI, page on-call |
| High | Block CI, create incident |
| Medium | Block CI |
| Low | Warning, track in backlog |

### Complexity Limits

| Metric | Limit | Rationale |
|--------|-------|-----------|
| Cyclomatic | 7 | Each function should be trivially testable |
| Cognitive | 10 | Any developer should understand at first read |
| Function length | 30 lines | Strict single-responsibility |
| File length | 300 lines | Strong modular separation |
| Parameters | 3 | Use parameter objects liberally |
| Nesting depth | 3 | Flat is better than nested |

### Type Safety (Typed Languages)

| Requirement | TypeScript | Python | Other |
|-------------|------------|--------|-------|
| Strict mode | `"strict": true` | mypy `--strict` | Maximum strictness |
| No `any` | `"noImplicitAny": true`, no explicit `any` | No `Any` type | N/A |
| Null safety | All null checks explicit | Full type hints | Built-in |
| Type coverage | 100% | 100% | 100% |

### Architecture Enforcement

- **Dependency direction**: Enforced via static analysis
- **Circular dependencies**: Zero tolerance
- **Layer violations**: Block CI
- **Import boundaries**: Explicit module boundaries

### Documentation Requirements

- **100% public API**: All public functions documented
- **README current**: Updated with each feature
- **Architecture decision records**: Required for significant changes

### When to Use Strictest

- Financial systems (banking, trading, payments)
- Healthcare applications (HIPAA compliance)
- Safety-critical systems (automotive, aerospace)
- Security-sensitive code (authentication, encryption)
- Government/defense contracts
- High-volume systems where bugs cost millions

---

## Legacy Mode (Existing Codebases)

Pragmatic quality gates for gradual improvement of existing code.

### Coverage Requirements

| Metric | Threshold | Enforcement |
|--------|-----------|-------------|
| Lines | 50% baseline | New code must have 80% |
| Branches | 50% baseline | New code must have 80% |
| Functions | 50% baseline | New code must have 80% |
| Statements | 50% baseline | New code must have 80% |

### Coverage Differential Enforcement

Legacy mode uses **differential coverage** to prevent regression while allowing gradual improvement:

```
Total project coverage: Must not decrease
New files: Must meet 80% coverage
Modified files: Changed lines must have 80% coverage
```

### Linting Requirements

- **Errors allowed**: Baseline existing errors, block new ones
- **Warnings allowed**: Track trend over time
- **Format optional**: Encourage but don't enforce

### Security Requirements

| Severity | Action |
|----------|--------|
| Critical | Block CI |
| High | Warning, fix within 2 weeks |
| Medium | Log, track in backlog |
| Low | Log only |

### Complexity Limits

| Metric | Limit | Rationale |
|--------|-------|-----------|
| Cyclomatic | 15 | Allow complex legacy code |
| Cognitive | 20 | Accept higher cognitive load |
| Function length | 100 lines | Don't break working code |
| File length | 600 lines | Legacy files often larger |
| Parameters | 6 | Legacy APIs often have many params |
| Nesting depth | 6 | Refactor incrementally |

### Baseline Management

Legacy mode maintains a baseline file (`.quality-baseline.json`) that tracks:

```json
{
  "created": "2024-01-15T10:30:00Z",
  "coverage": {
    "lines": 45,
    "branches": 38,
    "functions": 52
  },
  "lint": {
    "errors": 127,
    "warnings": 456
  },
  "security": {
    "high": 0,
    "medium": 12,
    "low": 45
  }
}
```

Rules:
1. Coverage must not decrease below baseline
2. Lint errors must not increase
3. Security issues must not increase in severity
4. Baseline updates require explicit approval

### Gradual Improvement Path

Legacy mode includes automatic upgrade suggestions when:

| Metric | Trigger | Suggestion |
|--------|---------|------------|
| Coverage | Reaches 70% | Consider upgrading to Strict |
| Lint errors | Reaches 0 | Consider upgrading to Strict |
| Security | All medium fixed | Consider upgrading to Strict |
| Complexity | Avg < 10 | Consider upgrading to Strict |

### When to Use Legacy

- Inheriting an unmaintained codebase
- Starting quality enforcement on existing project
- Gradual migration to quality standards
- Proof-of-concept that became production
- Limited time/resources for improvement

---

## Mode Detection Heuristics

CTOC automatically suggests a mode based on project analysis:

### Suggests Strict When

- New project (< 6 months old based on git history)
- Already has > 70% coverage
- Has linter configuration
- Has CI/CD pipeline
- Uses modern tooling (TypeScript strict, mypy, etc.)

### Suggests Strictest When

- Financial domain indicators (payment, transaction, banking keywords)
- Healthcare indicators (patient, HIPAA, medical keywords)
- Security domain (auth, crypto, password keywords)
- Already meets strict requirements
- Has architecture enforcement in place

### Suggests Legacy When

- No existing tests or < 30% coverage
- No linter configuration
- Many linter errors when analyzed
- Large codebase with minimal quality tooling
- Git history shows long neglect periods

---

## Mode Comparison Matrix

| Feature | Strict | Strictest | Legacy |
|---------|--------|-----------|--------|
| Coverage threshold | 80% | 90% | 50% |
| Coverage enforcement | Block CI | Block CI | Baseline |
| Lint errors | Block CI | Block CI | Baseline |
| Lint warnings | Log | Block CI | Allow |
| Security critical/high | Block CI | Block CI | Block CI |
| Security medium | Warning | Block CI | Log |
| Complexity | Moderate | Tight | Relaxed |
| Type safety | Recommended | Required | Optional |
| Documentation | Recommended | Required | Optional |
| Architecture | Checked | Enforced | Unchecked |
| Upgrade path | To Strictest | N/A | To Strict |

---

## Selecting the Right Mode

### Decision Framework

```
Is this a new project?
├── Yes → Is it high-stakes (financial, healthcare, security)?
│         ├── Yes → Strictest
│         └── No → Strict
└── No → Does it have > 70% coverage and CI?
          ├── Yes → Strict
          └── No → Legacy
```

### Mode Override

Projects can override the suggested mode in `.ctoc/settings.yaml`:

```yaml
quality:
  mode: strict  # strict | strictest | legacy
  override_reason: "Team decision for aggressive quality"
```

---

## See Also

- [Upgrade Paths](./upgrade-paths.md) - How to upgrade between modes
- [Quality Configuration](../lib/quality-config.js) - Implementation details
- [Coverage Checker](../lib/coverage-checker.js) - Coverage enforcement
