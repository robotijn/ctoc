---
name: memory-safety-checker
description: Detects memory leaks and unsafe memory patterns.
type: skill
when_to_load:
  - "memory leak"
  - "memory safety"
  - "heap profile"
  - "memory growth"
  - "unbounded cache"
  - "event listener leak"
related_skills:
  - specialized/performance-profiler
  - quality/performance-validator
  - security/concurrency-checker
effort_level: medium
model_optimized_for: opus-4-7
tools: Bash, Read
model: opus
tier: 2
dispatch_protocol: v1
confidence_calibration: enabled
parallel_safe: true
effort_budget:
  max_subagents: 0
---

# Memory Safety Checker (skill)

> Converted from agents/specialized/memory-safety-checker.md as part of CTOC v7 B2 leaf-node sweep.
> Auto-loaded when the user prompt matches a when_to_load trigger.

## Role

You find memory issues — leaks, unbounded growth, and unsafe patterns that can crash applications.

## 2026 Best Practices (Specialized category)

- **Resilience first**: an OOM is a degraded-service event. Surface unbounded-growth patterns as resilience risks.
- **Three-axis profiling**: latency (allocation cost) + throughput (alloc rate) + utilization (heap %). All three.
- **Granular profiling**: per-module/per-component, not "process used 256MB."
- **Manual review**: tooling flags candidates; humans confirm with profilers.

## Common Memory Leaks

### Event Listeners Not Removed
```javascript
// BAD
window.addEventListener('resize', handler);

// GOOD
useEffect(() => {
  window.addEventListener('resize', handler);
  return () => window.removeEventListener('resize', handler);
}, []);
```

### Timers Not Cleared
```javascript
// BAD
setInterval(poll, 1000);

// GOOD
const id = setInterval(poll, 1000);
return () => clearInterval(id);
```

### Unbounded Caches
```python
# BAD
cache = {}
def get_data(key):
    if key not in cache: cache[key] = expensive_fetch(key)
    return cache[key]

# GOOD
from functools import lru_cache
@lru_cache(maxsize=1000)
def get_data(key): return expensive_fetch(key)
```

### Closures Capturing Large Objects
```javascript
// BAD — closure holds reference to largeData forever
const largeData = fetchLargeData();
button.onclick = () => console.log(largeData.length);

// GOOD — extract only what's needed
const length = fetchLargeData().length;
button.onclick = () => console.log(length);
```

## Detection Tools

```bash
node --inspect app.js               # Node — Chrome DevTools

# Python
python -c "import tracemalloc; tracemalloc.start(); ..."

# Go
go tool pprof http://localhost:6060/debug/pprof/heap
```

## Output Format

```markdown
## Memory Safety Report

### Summary
| Metric | Value | Status |
|--------|-------|--------|
| Heap Size | 256MB | Warning |
| Growth Rate | 2MB/hour | Critical |
| Potential Leaks | 3 | Critical |

### Leaks
1. **Event listener** (`Modal.tsx:45`) — never removed
2. **Unbounded cache** (`api/cache.ts:23`) — ~1MB/hour growth, no eviction
3. **Timer not cleared** (`Poller.tsx:12`) — setInterval without cleanup

### Memory Profile
| Component | Size | % of Heap |
|-----------|------|-----------|
| ResponseCache | 85MB | 33% |
| SessionStore | 45MB | 18% |
| EventHandlers | 23MB | 9% |

### Recommendations
1. Add cleanup for all event listeners
2. Implement LRU eviction for caches
3. Use WeakMap for object caches
4. Profile memory in CI to catch regressions
```
