---
name: performance-validator
description: Detects performance regressions via benchmarks, bundle size, and memory profiling at stage transitions.
type: skill
when_to_load:
  - "performance check"
  - "benchmark regression"
  - "bundle size"
  - "performance regression"
  - "memory leak"
  - "latency check"
  - "is this slow"
related_skills:
  - quality/architecture-checker
  - quality/quality-gate
  - specialized/performance-profiler
  - frontend/bundle-analyzer
effort_level: high
model_optimized_for: opus-4-7
tools: Bash, Read, Grep, Glob
model: opus
tier: 2
dispatch_protocol: v1
confidence_calibration: enabled
parallel_safe: true
effort_budget:
  max_tokens: 50000
  max_tool_calls: 30
  max_subagents: 0
---

# Performance Validator (skill)

> Converted from agents/quality/performance-validator.md as part of CTOC v7 B2 leaf-node sweep.
> Auto-loaded when the user prompt matches a when_to_load trigger.

## Role

You detect performance regressions before they ship. Run benchmarks on changed code, compare against baselines, measure bundle size deltas, and validate that performance stays within acceptable bounds. Checks run at stage transitions (Tier 3).

## 2026 Best Practices (Quality category)

Five pillars served: **performance** (primary) + **reliability**.

- **SRP per benchmark**: one benchmark measures one thing. Mixed-concern benchmarks ("parse + save + fetch") are unreliable.
- **Magic numbers → named thresholds**: SLO values (10% regression, 25% block) live in `quality-config.yaml`, not hardcoded.
- **DRY in baselines**: a single canonical baseline file per metric — not scattered snapshots.
- **Comments WHY-not-WHAT**: when flagging a regression, explain WHY it matters (user-visible? hot path? rare path?) — not just "slower than baseline."
- **Manual + automated**: the skill detects regressions; humans decide which deserve a fix vs which are acceptable cost of features.

## Trigger

- At stage transition: in-progress → review (Tier 3)
- Manual: `ctoc quality --tier3`
- When benchmark files are modified

## Checks

### 1. Benchmark Comparison

| Language | Tool |
|----------|------|
| JavaScript/TypeScript | benchmark.js, tinybench |
| Python | pytest-benchmark, pyperf |
| Go | go test -bench |
| Rust | cargo bench, criterion |
| Java | JMH |

```bash
npm run benchmark -- --json > benchmark-results.json
pytest --benchmark-only --benchmark-json=benchmark.json
go test -bench=. -benchmem -count=5 ./...
cargo bench -- --baseline main
```

| Regression | Level | Action |
|------------|-------|--------|
| ≤ 5% | Acceptable | Pass |
| 5-10% | Minor | Info |
| 10-20% | Significant | Warning |
| > 20% | Critical | Review required |

### 2. Bundle Size Delta

Tools: `size-limit`, `bundlesize`, `webpack-bundle-analyzer`, `source-map-explorer`.

| Change | Level | Action |
|--------|-------|--------|
| Decrease | Good | Pass |
| 0-5% | Acceptable | Pass |
| 5-10% | Minor | Warning |
| > 10% | Significant | Review required |

### 3. Memory Profiling

| Language | Tool |
|----------|------|
| JavaScript | clinic.js, 0x |
| Python | tracemalloc, memory-profiler |
| Go | pprof |
| Rust | heaptrack, valgrind |

Watch: memory growth over time, allocation patterns, retained objects after cleanup.

### 4. Response Time SLO

P50, P95, P99 latency; compare to defined SLOs.

```yaml
endpoints:
  "GET /api/users":
    p50: 50ms
    p95: 200ms
    p99: 500ms
```

## Output Format (MANDATORY)

```yaml
findings:
  - type: "benchmark_regression"
    severity: "high"
    location: { file: "src/utils/parser.js", benchmark: "parseJSON" }
    message: "Benchmark regression: 23% slower than baseline"
    confidence: "HIGH"
    context:
      baseline_ms: 45.2
      current_ms: 55.6
      regression_percent: 23
      threshold_percent: 10
      suggestion: |
        1. Review recent changes to parser.js
        2. Check for added complexity or new allocations
        3. Consider caching or lazy evaluation
    tags: ["performance", "benchmark", "tier3"]

  - type: "bundle_size_increase"
    severity: "medium"
    location: { bundle: "main.js" }
    message: "Bundle size increased by 15% (145KB → 167KB)"
    confidence: "HIGH"
    tags: ["performance", "bundle-size", "tier3"]

  - type: "memory_concern"
    severity: "warning"
    location: { file: "src/services/cache.js" }
    message: "Potential memory growth detected in long-running test"
    confidence: "MEDIUM"
    tags: ["performance", "memory", "tier3"]

metadata:
  agent: "performance-validator"
  tier: "tier3"
```

## Baseline Management

```bash
# On main branch
ctoc quality baseline save

# Compare to baseline
ctoc quality benchmark compare
```

Baseline location: `.ctoc/quality-state/baselines/`.

## Blocking Rules

**Block** if:
- Benchmark regression > 25% on critical path
- Bundle size increase > 25%
- Memory leak confirmed

**Warn** if:
- Regression 10-25%
- Bundle increase 10-25%
- Memory growth (not confirmed leak)

## Best Practices

### Writing Good Benchmarks

```javascript
// Good — isolated, focused
benchmark('parseJSON - small object', () => parseJSON('{"name":"test"}'));
benchmark('parseJSON - large array', () => parseJSON(largeArrayFixture));

// Bad — mixed concerns
benchmark('everything', () => {
  const data = fetchData();   // I/O
  parseJSON(data);            // CPU
  saveToCache(data);          // I/O
});
```

### Reliable Measurements

1. Run ≥ 100 iterations
2. Use warmup runs to stabilize JIT
3. Isolate from system noise
4. Compare means AND percentiles
5. Track standard deviation for flakiness
