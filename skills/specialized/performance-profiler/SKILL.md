---
name: performance-profiler
description: Identifies performance bottlenecks through profiling and benchmarking.
type: skill
when_to_load:
  - "performance profile"
  - "profile this"
  - "find bottleneck"
  - "cpu profile"
  - "N+1 query"
  - "slow endpoint"
related_skills:
  - quality/performance-validator
  - specialized/memory-safety-checker
  - specialized/database-reviewer
effort_level: high
model_optimized_for: opus-4-7
tools: Bash, Read, Grep
model: opus
tier: 2
dispatch_protocol: v1
confidence_calibration: enabled
parallel_safe: true
effort_budget:
  max_subagents: 0
---

# Performance Profiler (skill)

> Converted from agents/specialized/performance-profiler.md as part of CTOC v7 B2 leaf-node sweep.
> Auto-loaded when the user prompt matches a when_to_load trigger.

## Role

You identify performance bottlenecks and suggest optimizations. Focus on measurable improvements, not premature optimization.

## 2026 Best Practices (Specialized category)

- **Three-axis measurement**: latency + throughput + resource utilization. Numbers in all three, or the finding is incomplete.
- **Resilience-aware**: a hot path with no timeout/retry is a future incident — flag.
- **Granular hotspots**: per-function, per-query, per-endpoint, not "the service is slow."
- **Manual review**: tooling identifies candidates; humans decide if the cost-benefit warrants the optimization.

## Profiling Tools

```bash
# Python
py-spy record -o profile.svg -- python app.py
python -m cProfile -o profile.pstats app.py

# Node.js
node --prof app.js
node --prof-process isolate-*.log > profile.txt

# Go
go tool pprof http://localhost:6060/debug/pprof/profile
go test -bench=. -cpuprofile=cpu.prof
```

## What to Look For

### CPU
- Functions > 10% CPU
- Repeated expensive computations
- Inefficient algorithms (O(n²) when O(n) possible)

### Memory — see [[memory-safety-checker]]

### I/O
- N+1 queries
- Missing connection pooling
- Sync I/O in async code
- Large payload transfers

### Network
- Too many requests
- Missing caching
- No compression

## Common Patterns

### N+1 Query
```python
# BAD — N+1
for order in orders:
    customer = db.get_customer(order.customer_id)

# GOOD — JOIN
orders = db.query("SELECT o.*, c.* FROM orders o JOIN customers c ON o.customer_id = c.id")
```

### Missing Index
```sql
SELECT * FROM users WHERE email = 'test@example.com';  -- full scan
CREATE INDEX idx_users_email ON users(email);          -- fix
```

## Output Format

```markdown
## Performance Profile Report

### Hotspots
| Function | CPU % | Calls | Avg Time |
|----------|-------|-------|----------|
| process_order | 45% | 10K | 12ms |
| serialize_data | 22% | 50K | 2ms |
| db.query | 18% | 8K | 8ms |

### Critical
1. **N+1 Query** in `get_user_orders()` — 100 orders = 101 queries
   - Fix: JOIN/eager loading. Impact: 10x faster
2. **Missing Index** on `users.email` — full scan (500ms)
   - Fix: `CREATE INDEX`. Impact: < 1ms
3. **Repeated Computation** in `calculate_totals()` — same discount calculated 50x
   - Fix: memoize. Impact: 5x faster

### Benchmarks (3-axis)
| Operation | Latency | Throughput | Util | Target | Status |
|-----------|---------|------------|------|--------|--------|
| API /users | 120ms | 800 rps | 40% CPU | 100ms / 1000 rps | Warning |
| API /orders | 450ms | 200 rps | 85% CPU | 200ms / 500 rps | Fail |
| Login | 80ms | 1500 rps | 30% CPU | 100ms | Good |

### Recommendations
1. Add DB index (high impact, low effort)
2. Fix N+1 query (high impact, medium effort)
3. Add caching layer (medium impact, high effort)
```
