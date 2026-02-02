# Quality Mode Upgrade Paths

This guide provides detailed checklists, effort estimates, and strategies for upgrading between quality modes.

---

## Legacy to Strict Upgrade

The most common upgrade path for teams improving code quality.

### Pre-Upgrade Assessment

Before starting, gather these metrics:

| Metric | How to Measure | Target |
|--------|----------------|--------|
| Current coverage | `ctoc detect quality` | Know starting point |
| Lint errors | Run linter with strict config | Count total |
| Type coverage | TypeScript: `--noImplicitAny` errors | Count total |
| Cyclomatic complexity | `ctoc quality dashboard` | Count violations |
| Circular dependencies | `ctoc quality dashboard` | Count cycles |

### Upgrade Checklist

#### Phase 1: Foundation (Week 1-2)

- [ ] **Install quality tooling**
  - [ ] Linter configured (ESLint, Ruff, etc.)
  - [ ] Formatter configured (Prettier, black, etc.)
  - [ ] Type checker configured (TypeScript strict, mypy)
  - [ ] Coverage tool configured (Istanbul, coverage.py, etc.)

- [ ] **Set up CI pipeline**
  - [ ] Coverage reporting in CI
  - [ ] Lint checks in CI (warning mode initially)
  - [ ] Security scanning in CI

- [ ] **Create baseline file**
  ```bash
  ctoc quality baseline create
  ```

#### Phase 2: Coverage Push (Week 3-6)

- [ ] **Identify low-coverage areas**
  ```bash
  ctoc coverage uncovered
  ```

- [ ] **Add tests for critical paths first**
  - [ ] Authentication/authorization
  - [ ] Payment/financial logic
  - [ ] Data validation
  - [ ] Error handling

- [ ] **Add tests for new code (mandatory)**
  - [ ] Pre-commit hook for coverage on changed files
  - [ ] PR requirement: 80% coverage on new code

- [ ] **Backfill tests incrementally**
  - [ ] Target: 5% coverage increase per week
  - [ ] Focus on files with highest change frequency

#### Phase 3: Lint Cleanup (Week 5-8)

- [ ] **Auto-fix what's possible**
  ```bash
  eslint --fix .
  ruff --fix .
  ```

- [ ] **Prioritize remaining issues**
  - [ ] Security-related first
  - [ ] Type errors second
  - [ ] Style issues last

- [ ] **Enable blocking mode**
  - [ ] Lint errors block CI
  - [ ] New warnings block CI

#### Phase 4: Complexity Reduction (Week 7-10)

- [ ] **Identify complex functions**
  ```bash
  ctoc quality complexity
  ```

- [ ] **Refactor highest complexity first**
  - [ ] Extract helper functions
  - [ ] Use early returns
  - [ ] Simplify conditionals

- [ ] **Set complexity limits**
  - [ ] Cyclomatic: 10
  - [ ] Cognitive: 15

#### Phase 5: Final Switch (Week 10-12)

- [ ] **Verify all metrics**
  - [ ] Coverage >= 80%
  - [ ] Lint errors = 0
  - [ ] Security high/critical = 0
  - [ ] Complexity within limits

- [ ] **Update configuration**
  ```bash
  ctoc quality mode strict
  ```

- [ ] **Remove baseline file**
  ```bash
  rm .quality-baseline.json
  ```

### Effort Estimates by Codebase Size

| Codebase Size | Lines of Code | Estimated Duration | Team Size |
|---------------|---------------|-------------------|-----------|
| Small | < 10,000 | 4-6 weeks | 1-2 devs |
| Medium | 10,000-50,000 | 8-12 weeks | 2-3 devs |
| Large | 50,000-200,000 | 16-24 weeks | 3-5 devs |
| Enterprise | > 200,000 | 6-12 months | 5+ devs |

### Common Blockers and Solutions

#### Blocker: "Tests are too slow"

**Symptoms**: Test suite takes > 10 minutes, developers skip tests

**Solutions**:
1. Parallelize test execution
2. Use test sharding in CI
3. Mock external dependencies
4. Use in-memory databases for unit tests
5. Separate unit and integration tests

#### Blocker: "Legacy code is untestable"

**Symptoms**: Global state, tight coupling, no dependency injection

**Solutions**:
1. Start with integration tests (test from outside)
2. Add seams gradually using extract and override
3. Introduce dependency injection incrementally
4. Use testing libraries for legacy code (e.g., jest mocking)

#### Blocker: "No time for refactoring"

**Symptoms**: Sprint pressure, feature deadlines

**Solutions**:
1. Boy Scout Rule: Leave code better than you found it
2. Test-Driven Bugfixes: Write test first for every bug
3. Refactoring Fridays: Dedicate time weekly
4. Technical Debt Sprint: Quarterly quality sprint

#### Blocker: "Too many lint errors"

**Symptoms**: Thousands of errors, overwhelming

**Solutions**:
1. Baseline approach: Only block new errors
2. Auto-fix campaign: Run auto-fix, review, commit
3. File-by-file: Enable strict linting per file
4. Gradual config: Enable rules incrementally

#### Blocker: "Circular dependencies everywhere"

**Symptoms**: Import cycles, tight coupling

**Solutions**:
1. Introduce interface layers (ports/adapters)
2. Use dependency injection
3. Extract shared code to common modules
4. Use barrel files carefully (or remove them)

### Metrics to Track During Upgrade

| Metric | Frequency | Target Trend |
|--------|-----------|--------------|
| Coverage % | Weekly | Increasing |
| Lint errors | Weekly | Decreasing |
| Cyclomatic avg | Monthly | Decreasing |
| Build time | Weekly | Stable |
| Test time | Weekly | Stable |
| PR review time | Weekly | Decreasing |
| Bug rate | Monthly | Decreasing |

---

## Strict to Strictest Upgrade

For teams ready to achieve maximum code quality.

### Pre-Upgrade Assessment

| Metric | Requirement | How to Check |
|--------|-------------|--------------|
| Coverage | >= 80% | `ctoc coverage` |
| Lint errors | 0 | CI status |
| Security issues | 0 critical/high | `ctoc security` |
| Architecture | Defined | `ctoc architecture` |
| Documentation | > 70% | `ctoc docs coverage` |

### Upgrade Checklist

#### Phase 1: Coverage Push to 90% (Week 1-4)

- [ ] **Identify uncovered code**
  ```bash
  ctoc coverage detail --threshold 90
  ```

- [ ] **Focus on edge cases**
  - [ ] Error paths
  - [ ] Boundary conditions
  - [ ] Null/undefined handling
  - [ ] Race conditions

- [ ] **Add mutation testing** (optional but recommended)
  ```bash
  npx stryker run
  ```

#### Phase 2: Type Hardening (Week 3-6)

- [ ] **Eliminate `any` types**
  ```typescript
  // tsconfig.json
  {
    "compilerOptions": {
      "noImplicitAny": true,
      "noExplicitAny": true  // custom rule
    }
  }
  ```

- [ ] **Full strict mode**
  ```typescript
  // tsconfig.json
  {
    "compilerOptions": {
      "strict": true,
      "noUncheckedIndexedAccess": true,
      "exactOptionalPropertyTypes": true
    }
  }
  ```

- [ ] **Type-only imports**
  ```typescript
  import type { SomeType } from './types';
  ```

#### Phase 3: Complexity Tightening (Week 5-8)

- [ ] **Reduce complexity limits**
  - [ ] Cyclomatic: 10 -> 7
  - [ ] Cognitive: 15 -> 10
  - [ ] Function length: 50 -> 30

- [ ] **Refactor complex functions**
  - [ ] Use strategy pattern for switch statements
  - [ ] Extract validation logic
  - [ ] Use early returns

#### Phase 4: Architecture Enforcement (Week 7-10)

- [ ] **Define module boundaries**
  ```javascript
  // .dependency-cruiser.js
  module.exports = {
    forbidden: [
      { from: { path: '^src/domain' }, to: { path: '^src/infrastructure' } }
    ]
  };
  ```

- [ ] **Zero circular dependencies**
  ```bash
  ctoc architecture cycles --strict
  ```

- [ ] **Layer violation blocking**
  - [ ] Add to CI pipeline
  - [ ] Fail on any violation

#### Phase 5: Documentation (Week 9-12)

- [ ] **100% public API documentation**
  ```bash
  typedoc --validation.notDocumented
  ```

- [ ] **Architecture Decision Records**
  ```
  docs/adr/
  ├── 001-use-typescript.md
  ├── 002-hexagonal-architecture.md
  └── 003-database-selection.md
  ```

- [ ] **README completeness**
  - [ ] Installation instructions
  - [ ] Configuration options
  - [ ] API documentation
  - [ ] Contributing guide

### Effort Estimates

| Codebase Size | Starting from Strict | Estimated Duration |
|---------------|---------------------|-------------------|
| Small | Already passing | 4-6 weeks |
| Medium | Already passing | 8-12 weeks |
| Large | Already passing | 12-16 weeks |

### Additional Requirements for Strictest

| Category | Requirement |
|----------|-------------|
| Testing | Mutation testing score > 80% |
| Security | SAST/DAST in pipeline |
| Performance | Benchmark suite exists |
| Monitoring | Error tracking in place |
| Observability | Logging standards defined |

---

## Quick Reference: Upgrade Commands

```bash
# Check current mode and readiness
ctoc detect

# See what's blocking upgrade
ctoc detect upgrade

# Generate upgrade plan
ctoc detect upgrade --plan

# Set new mode after upgrade
ctoc quality mode strict
ctoc quality mode strictest

# Verify upgrade success
ctoc quality check
```

---

## Mode Downgrade (Rare Cases)

Downgrading should be rare and justified.

### Valid Reasons to Downgrade

1. **Acquired codebase**: Inheriting legacy code into a strict project
2. **Emergency maintenance**: Critical system needs rapid changes
3. **Team transition**: New team needs ramp-up time

### Downgrade Process

1. Document reason in ADR
2. Set explicit timeline for return to original mode
3. Create baseline for downgraded mode
4. Set calendar reminder for upgrade review

```yaml
# .ctoc/settings.yaml
quality:
  mode: legacy
  downgrade_reason: "Acquired legacy microservice, upgrade planned Q2 2025"
  downgrade_date: "2024-11-15"
  upgrade_target_date: "2025-04-01"
```

---

## See Also

- [Quality Modes](./modes.md) - Mode definitions
- [Project Analyzer](../lib/project-analyzer.js) - Analysis implementation
- [Mode Suggester](../lib/mode-suggester.js) - Suggestion logic
