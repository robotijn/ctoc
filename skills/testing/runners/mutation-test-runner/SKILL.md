---
name: mutation-test-runner
description: Validates test quality by introducing mutations and checking if tests catch them — table stakes for AI-written suites.
type: skill
when_to_load:
  - "run mutation test"
  - "mutation test"
  - "mutation testing"
  - "mutation score"
  - "test quality check"
  - "stryker run"
  - "mutmut run"
related_skills:
  - testing/runners/unit-test-runner
  - testing/coverage-enforcer
  - testing/writers/unit-test-writer
  - testing/quality-gate-runner
effort_level: high
model_optimized_for: opus-4-7
tools: Bash, Read
model: opus
---

# Mutation Test Runner (skill)

> Converted from agents/testing/runners/mutation-test-runner.md as part of CTOC v7 B2 leaf-node sweep.
> Auto-loaded when the user prompt matches a when_to_load trigger.

## Role

You run mutation testing to verify that tests actually catch bugs, not just cover code. Mutations are small code changes (`+` → `-`, `>` → `>=`, `true` → `false`); if tests still pass under a mutation, they aren't catching that bug.

## 2026 Best Practices (Testing category)

Two patterns dominate this skill — and one is the headline for the whole 2026 testing brief:

- **Mutation testing as table stakes for AI-written suites** — line coverage is now the *floor*, mutation score is the *ceiling*. AI-generated tests routinely produce 95% coverage with 30% mutation score because the assertions only re-state the implementation. Run mutation testing on any test suite authored or modified by an LLM-driven writer skill. Target mutation score ≥ 80% for new code; flag suites below 60% as serious gaps.
- **Intent-based test authoring** — surviving mutants point directly at missing intent assertions. Use mutation results to drive better test cases (couple to user-visible behavior), not just more test cases.

## Tools by Language

### Python — mutmut
```bash
mutmut run --paths-to-mutate=src/
mutmut results
mutmut show <id>          # inspect a specific surviving mutant
```

### JavaScript/TypeScript — Stryker
```bash
npx stryker run
npx stryker run --configFile=stryker.conf.js
```

### Java — PIT
```bash
mvn org.pitest:pitest-maven:mutationCoverage
```

### Rust — cargo-mutants
```bash
cargo mutants
```

## Mutation Types

| Type | Original | Mutated |
|------|----------|---------|
| Arithmetic | `a + b` | `a - b` |
| Boundary | `a < b` | `a <= b` |
| Negation | `true` | `false` |
| Return | `return x` | `return null` |
| Remove | `call()` | (removed) |
| Comparison | `==` | `!=` |
| Logical | `&&` | `\|\|` |

## Interpreting Results

| Status | Meaning |
|--------|---------|
| **Killed** | Test caught the mutation — good |
| **Survived** | Test missed the bug — gap |
| **Timeout** | Mutation caused infinite loop |
| **No Coverage** | Code not covered by tests at all |

**Mutation Score** = `Killed / (Killed + Survived) × 100%` (timeouts and no-coverage excluded from denominator).

| Score | Quality |
|-------|---------|
| 80%+ | Good test suite |
| 60–80% | Needs improvement |
| <60% | Serious gaps — AI-written suites often land here |

## Output Format

```markdown
## Mutation Test Report

**Tool**: mutmut
**Duration**: 4m 32s

### Summary
| Metric | Count |
|--------|-------|
| Total Mutants | 245 |
| Killed | 201 |
| Survived | 32 |
| Timeout | 8 |
| No Coverage | 4 |

**Mutation Score**: 82%

### Surviving Mutants (Top 5)
1. `src/calculator.py:45`
   - Mutation: `+ → -`
   - Missing intent: verify addition *result*, not just that it runs

2. `src/auth.py:78`
   - Mutation: `>= → >`
   - Missing intent: boundary test for token-expiry edge

3. `src/validator.py:23`
   - Mutation: `return True → return False`
   - Missing intent: assert validation returns True for valid input

### Uncovered Code (no mutants killed because no tests cover)
- `src/legacy.py` — no tests at all
- `src/admin.py:50-60` — error handling branch

### Recommendations
- Add assertions that verify *behavior outcome*, not just method calls
- Boundary tests for token expiry exactly at limit
- Verify validator returns expected boolean
```

## Configuration Examples

### mutmut (Python) — `setup.cfg`
```ini
[mutmut]
paths_to_mutate=src/
tests_dir=tests/
runner=pytest
```

### Stryker (JavaScript) — `stryker.conf.js`
```javascript
module.exports = {
  mutate: ['src/**/*.ts'],
  testRunner: 'jest',
  reporters: ['html', 'clear-text', 'dashboard'],
  thresholds: { high: 80, low: 60, break: 50 },
  // 'break' = exit nonzero below this score
};
```

## When to Run

- **Per-commit**: NO — too slow for inner loop
- **Nightly CI**: YES — track trend, alert on drops > 5%
- **Pre-release**: YES — gate releases on mutation score for critical paths
- **After AI test generation**: YES — mandatory; AI suites with 90%+ coverage often score < 60% mutation

## Red Lines

- Never replace coverage with mutation (they measure different things)
- Never run mutation on test code itself (loops + nonsense)
- Never accept a release with mutation score < 60% on critical paths (auth, payment)
- Never let AI-generated tests skip the mutation gate
