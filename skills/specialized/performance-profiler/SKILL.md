---
name: performance-profiler
description: Exploratory performance profiler — flame graphs, continuous-profiling deep-dives, and bottleneck attribution across CPU, allocation, lock-contention, I/O, and cold-start axes.
type: skill
when_to_load:
  - "performance profile"
  - "profile this"
  - "find bottleneck"
  - "cpu profile"
  - "flame graph"
  - "continuous profiling"
  - "N+1 query"
  - "slow endpoint"
  - "allocation profile"
  - "lock contention"
  - "cold start"
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

You are an exploratory performance profiler. You attach to running processes, take low-overhead samples, render flame graphs, and isolate the function / query / lock / syscall that owns the wall-clock time. You do not pass-or-fail on a number — that is [[performance-validator]]'s job. You explain **where the time went and why**, then propose a fix.

### Role split: this skill vs. [[performance-validator]]

| Concern | This skill (performance-profiler) | [[performance-validator]] |
|---|---|---|
| Posture | Exploratory deep-dive | Declarative CI gate |
| Trigger | "this endpoint is slow" / "find the bottleneck" / "why did p99 regress?" | "did this PR breach the budget?" |
| Output | Flame graph + letter with `target_function`, `percent_of_wall_time`, `kind`, `suggested_fix` | Pass / fail vs. SLO budgets |
| Cadence | Ad-hoc + continuous in prod | Every PR / pre-deploy |
| Verdict | A finding, never a build-break | Build-break on budget breach |

Cross-link: if a profiler finding violates a declared SLO budget, also notify [[performance-validator]] so the gate is updated. If [[performance-validator]] fires on a budget breach with no known cause, dispatch this skill to attribute the regression.

## 2026 Best Practices (Specialized category)

- **Profile in production, continuously, not just dev.** Grafana Cloud Profiles processed 19.5 PB of profiling data on the Pyroscope 2.0 architecture in 2025 (Grafana Labs / InfoQ, May 2026). Lab benches don't reproduce production workloads — cache topology, tenant skew, GC heap shape, and tail latency only show up in prod. Use a sampler that adds **~1% CPU or less** (Parca / Polar Signals / Pyroscope eBPF agents are at or below this threshold per their published documentation).
- **Flame graph must be readable by engineering AND product.** Wide bar = wide blame. If a PM can't point at "that orange band" and say "that's checkout serialization," the graph isn't usable as a shared artifact. Name frames in business terms when collapsing inlined helpers.
- **Differential profiling is the unit of work.** Single flame graphs say "this is hot." Differential flame graphs (base vs. head, red = slower-after, blue = faster-after) say "this is hot **because of that commit**." Make differential the default; raw flame graph is the exception. CI-integrated diff profiling (Codspeed, Sentry differential flame graphs) lets a PR carry its regression attribution into review.
- **Attribute regressions to a deploy/commit, not a wall-clock window.** Tag every continuous profile with `commit_sha`, `deploy_id`, `tenant`, `region`. A profile without those labels is unattributable and gets discarded by the bisect step.
- **Three-axis measurement still applies**: latency + throughput + resource utilization. A function that drops latency 30% but tanks throughput by 50% lost. Numbers on all three axes, or the finding is incomplete.
- **Low-overhead samplers only.** Production profilers must be sampling, not instrumenting; ~1% CPU budget is the line. Anything that requires recompiling, restarting, or stop-the-world is dev-only.
- **Cardinality budget on profile labels.** Continuous profiling stores call-stack samples by label set. Putting `user_id` or `request_id` as a label explodes storage and kills query performance. Allowed labels: `service`, `version`, `commit_sha`, `deploy_id`, `region`, `tenant_class` (not tenant_id), `endpoint_group` (not endpoint). Hard limit ~50 distinct values per label.
- **Resilience-aware**: a hot path with no timeout / retry / circuit-breaker is a future incident — flag, even if today it's fast.
- **Manual review at the end.** Tooling finds candidates. Humans decide if the cost-benefit warrants the optimization. Premature optimization without measurement is the worst pattern; **measurement without action** is a close second.

## Bottleneck Categories (the `kind` taxonomy)

Each finding's letter declares one `kind`. The integrator uses `kind` to pick the right reviewer skill.

| `kind` | What it looks like in a flame graph | Typical fix bucket |
|---|---|---|
| `cpu-hot` | One wide tower, single function > 10% of wall time, single-threaded | Algorithm, caching, vectorization |
| `alloc` | Wide GC / allocator frames (`gc_alloc`, `malloc`, `tcmalloc`, `Allocate*`) | Object pooling, struct vs. class, span/ref types |
| `lock-contention` | Wide `pthread_mutex_lock` / `Monitor.Enter` / `sync.Mutex.Lock` / `tokio::Mutex` / `await`-on-lock | Lock-free structure, finer-grained locks, sharding |
| `io-block` | Wide `read` / `recv` / `epoll_wait` / `SocketRead` / `pq_getResult` | Async, batching, connection pool, prefetch |
| `leak` | Steady RSS growth, allocator wins on every profile, never shrinks | Lifetime fix, weak refs, dispose |
| `coldstart` | First-invocation tower (`JIT_*`, class-load, `assembly resolve`, container pull) | Provisioned concurrency, AOT, snapshot start |
| `deopt` | V8 `Builtins_*` reappears after warm-up; JVM `c1_compile` after C2; .NET tiered downgrade | Stable shape, monomorphic call sites, avoid megamorphic |
| `gc-pause` | Stop-the-world bars across the whole timeline | Heap sizing, generational tuning, off-heap |
| `query-plan` | DB-side wide bar (`Seq Scan`, `Hash Join Spill`, `Sort Disk`) | Index, plan hint, query rewrite |

## Tool Integration (2026)

### Continuous profilers (production)

| Tool | Engine | Strengths | When |
|---|---|---|---|
| **Pyroscope 2.0** (Grafana) | eBPF + language SDKs | Mature multi-tenancy, Grafana-native flame graphs, FlameQL, differential views, OTel profiles signal | Default for Grafana shops; production-scale (proven at 19.5 PB scale per Grafana Labs) |
| **Parca** (Polar Signals OSS) | eBPF (parca-agent) | Pure OSS, Prometheus-style labels, cleanest k8s integration | OSS-first shops, k8s-heavy |
| **Polar Signals Cloud** | eBPF + FrostDB | Hosted Parca, FrostDB for query speed | Teams wanting hosted Parca |
| **Datadog Profiler** | language agents | Tight APM correlation (trace ↔ profile join) | Datadog APM users |
| **Sentry Profiling** | language agents + sampling | Per-transaction profile attached to error traces, differential flame graphs in PR review | Sentry-as-APM users |
| **Pixie** (CNCF) | eBPF | k8s observability + ad-hoc scripting (PxL) | Pre-installed k8s clusters wanting on-cluster pyql |

### Language-specific (deep-dive)

| Stack | Tools | Notes |
|---|---|---|
| **C# / .NET 9** | `dotnet-counters`, `dotnet-trace`, `EventPipe`, PerfView, JetBrains dotTrace, Visual Studio Profiler | `dotnet-trace collect --providers Microsoft-DotNETCore-SampleProfiler` → `.nettrace` → speedscope/PerfView. `dotnet-counters monitor` for live counters (GC, exceptions, threadpool). PerfView for ETW + GC root analysis on Windows. |
| **Java 21+** | async-profiler (sampling, no safepoint bias), JFR (JDK Flight Recorder, built-in to OpenJDK), JMC (Mission Control), VisualVM | `async-profiler -e cpu,alloc,lock -d 30 -f profile.jfr <pid>` — JFR output lets you combine CPU + allocation + lock events in one recording. JFR is the always-on production option. |
| **Python 3.12+** | py-spy (sampling, attach-to-running-process, no restart), Scalene (Python-vs-native split + memory), memray (allocation deep-dive), cProfile (deterministic, dev-only) | py-spy for prod flame graphs at near-zero overhead; Scalene when you need to know "is this Python time or native time?"; memray for allocation forensics. |
| **C (C17/23)** | `perf record -F 99 -g`, Brendan Gregg FlameGraph, heaptrack (allocations), valgrind massif (heap snapshots), bpftrace | `perf record` + `stackcollapse-perf.pl` + `flamegraph.pl` is the canonical Linux pipeline. heaptrack for alloc, massif for sampled heap snapshots. |
| **C++ (20/23)** | perf + FlameGraph, Tracy (frame-by-frame profiler — game dev favourite), gperftools (CPU + heap), Intel VTune, callgrind | Tracy gives microsecond-resolution frame markers; gperftools `pprof` for CPU + heap with the same `pprof` UI as Go. |
| **TypeScript / Node.js** | `node --prof` + `--prof-process`, clinic.js (doctor/bubbleprof/flame/heap), Chrome DevTools profiler, `0x` (flame graphs), V8 `--trace-deopt` for deopt analysis | clinic.js doctor diagnoses the bottleneck class (event-loop, I/O, CPU, GC); `clinic flame` for the flame graph; Chrome DevTools to load `.cpuprofile`. |
| **SQL (Postgres)** | `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)`, `auto_explain` (logs slow plans), `pg_stat_statements` (aggregate by normalized query), `pgbadger` (log analyzer) | `auto_explain.log_min_duration = 1000` to log any plan > 1s; pg_stat_statements for "which query owns the database CPU"; pgbadger for offline log mining. |

### Shared pipeline (Linux perf + Brendan Gregg)

```bash
# Linux: any compiled or runtime-with-frame-pointers process
perf record -F 99 -p <pid> -g -- sleep 30
perf script | stackcollapse-perf.pl | flamegraph.pl > flame.svg

# Differential — base.collapsed vs. head.collapsed
difffolded.pl base.collapsed head.collapsed | flamegraph.pl > diff.svg
```

eBPF-based profilers (parca-agent, Pixie, Pyroscope eBPF) avoid the frame-pointer requirement by using DWARF unwinding or BTF; they are the production default in 2026.

## Profiling Cookbook by Language

### Python 3.12+

```bash
# Attach to a running process, sample 60s, output flame graph
py-spy record -o profile.svg --pid <pid> --duration 60

# Python-vs-native + memory in one pass
scalene --cli --html app.py > scalene.html

# Allocation forensics (memray ≥ 1.13)
memray run -o app.bin app.py
memray flamegraph app.bin -o flame.html

# Deterministic (dev only — heavy overhead)
python -m cProfile -o profile.pstats app.py
```

### Java 21+

```bash
# Combined CPU + allocation + lock profile, JFR output
./async-profiler/profiler.sh -e cpu,alloc,lock -d 60 -f profile.jfr <pid>

# JDK Flight Recorder (built-in, near-zero overhead — production always-on)
jcmd <pid> JFR.start name=app duration=60s filename=app.jfr settings=profile
jcmd <pid> JFR.stop name=app
# Analyze in JDK Mission Control (jmc) or convert to flame graph
jfr2flame app.jfr > flame.html

# Lock contention specifically
./async-profiler/profiler.sh -e lock -d 30 -f locks.svg <pid>
```

### C# / .NET 9

```bash
# Live counters (GC, threadpool, exception rate)
dotnet-counters monitor --process-id <pid>

# Sampled CPU trace via EventPipe — works cross-platform
dotnet-trace collect --process-id <pid> --duration 00:00:30 \
  --providers Microsoft-DotNETCore-SampleProfiler

# Allocation profile
dotnet-trace collect --process-id <pid> --duration 00:00:30 \
  --providers 'Microsoft-DotNETCore-SampleProfiler,Microsoft-Windows-DotNETRuntime:0x1:5'

# Convert to speedscope / flame graph
dotnet-trace convert <file>.nettrace --format speedscope

# PerfView (Windows, ETW): GC roots, allocation source, JIT events — best for memory pressure
PerfView.exe collect -GCCollectOnly
```

### C / C++ (Linux)

```bash
# perf + flame graph
perf record -F 99 -p <pid> -g -- sleep 60
perf script | stackcollapse-perf.pl > out.collapsed
flamegraph.pl out.collapsed > flame.svg

# Allocation profile (heaptrack)
heaptrack ./app
heaptrack_gui heaptrack.app.<pid>.gz

# Tracy (C++, frame-by-frame)
# Build app with TRACY_ENABLE; launch tracy server; live capture
```

### TypeScript / Node.js

```bash
# V8 built-in profiler
node --prof app.js
node --prof-process isolate-*.log > profile.txt

# clinic.js — diagnoses bottleneck class
clinic doctor -- node app.js          # tells you which profile to run next
clinic flame -- node app.js           # flame graph
clinic bubbleprof -- node app.js      # async timing
clinic heap -- node app.js            # heap

# 0x — flame graph one-shot
npx 0x -- node app.js

# Deopt analysis (V8 JIT)
node --trace-deopt app.js 2>&1 | grep -E 'deopt|bailout'
```

### SQL (Postgres)

```sql
-- Live plan analysis with timing AND buffer hits/reads
EXPLAIN (ANALYZE, BUFFERS, VERBOSE, FORMAT JSON)
SELECT o.*, c.* FROM orders o JOIN customers c ON o.customer_id = c.id WHERE o.created_at > now() - interval '1 day';

-- Top queries by total time (requires pg_stat_statements extension)
SELECT queryid, calls, total_exec_time, mean_exec_time, rows
FROM pg_stat_statements ORDER BY total_exec_time DESC LIMIT 20;

-- Server config: auto-log slow plans
ALTER SYSTEM SET auto_explain.log_min_duration = '1s';
ALTER SYSTEM SET auto_explain.log_analyze = on;
ALTER SYSTEM SET auto_explain.log_buffers = on;
SELECT pg_reload_conf();
```

## BAD / SAFE pairs — 7-language coverage

### Python 3.12+ — N+1 query (`io-block`)

```python
# BAD — N+1: 1 + N round trips, blocking
for order in orders:
    customer = db.execute("SELECT * FROM customers WHERE id = %s", (order.customer_id,)).fetchone()

# SAFE — single JOIN
sql = """
SELECT o.*, c.*
FROM orders o JOIN customers c ON o.customer_id = c.id
WHERE o.id = ANY(%s)
"""
rows = db.execute(sql, (order_ids,)).fetchall()
```

### Python 3.12+ — allocation churn (`alloc`)

```python
# BAD — list comprehension materializes the whole intermediate list
result = sum([x.value ** 2 for x in items])   # peaks at 2x memory of items

# SAFE — generator expression, constant memory
result = sum(x.value ** 2 for x in items)
```

### Java 21+ — lock contention (`lock-contention`)

```java
// BAD: coarse synchronized covers the whole map operation
public synchronized void increment(String key) {
    counters.put(key, counters.getOrDefault(key, 0) + 1);
}

// SAFE: ConcurrentHashMap + atomic merge, no global lock
private final ConcurrentHashMap<String, AtomicLong> counters = new ConcurrentHashMap<>();
public void increment(String key) {
    counters.computeIfAbsent(key, k -> new AtomicLong()).incrementAndGet();
}
```

### C# / .NET 9 — boxing & string allocation (`alloc`)

```csharp
// BAD: $"" interpolation boxes every value-type arg, allocates a new string every call
for (var i = 0; i < items.Count; i++)
    logger.LogInformation($"Processing item {i} of {items.Count}");

// SAFE: structured logging — template is interned, args boxed only if appender requires
for (var i = 0; i < items.Count; i++)
    logger.LogInformation("Processing item {Index} of {Total}", i, items.Count);

// BAD: LINQ allocates iterators + closures on hot path
var hot = items.Where(x => x.IsActive).Select(x => x.Id).ToList();

// SAFE: span / for-loop on hot path
var hot = new List<int>(items.Count);
foreach (var x in items) if (x.IsActive) hot.Add(x.Id);
```

### C# / .NET 9 — async lock contention (`lock-contention`)

```csharp
// BAD: lock() in async method blocks the threadpool thread
private readonly object _gate = new();
public async Task<int> GetAsync(int key) {
    lock (_gate) { return cache.TryGet(key, out var v) ? v : await LoadAsync(key); }
}

// SAFE: SemaphoreSlim, awaitable
private readonly SemaphoreSlim _gate = new(1, 1);
public async Task<int> GetAsync(int key) {
    await _gate.WaitAsync();
    try { return cache.TryGet(key, out var v) ? v : await LoadAsync(key); }
    finally { _gate.Release(); }
}
```

### C (C17/23) — memcpy in hot loop (`cpu-hot`)

```c
/* BAD: memcpy element-by-element, branch-predictor confused */
for (size_t i = 0; i < n; i++) {
    memcpy(&dst[i], &src[i], sizeof(item_t));
}

/* SAFE: bulk memcpy — one call, vectorized by libc */
memcpy(dst, src, n * sizeof(item_t));
```

### C++ (20/23) — virtual dispatch in tight loop (`cpu-hot`)

```cpp
// BAD: virtual call per element prevents inlining + vectorization
for (Shape* s : shapes) area_sum += s->area();   // dynamic dispatch every iter

// SAFE: sort by concrete type and call a non-virtual hot path,
// or use std::variant + std::visit for closed type set
for (const auto& s : circles) area_sum += s.area();   // direct call, inlined
```

### C++ (20/23) — unnecessary std::string copies (`alloc`)

```cpp
// BAD: every call constructs + destroys a std::string
void log(std::string msg) { sink_->write(msg); }
log("hello");   // allocates

// SAFE: std::string_view — no allocation for literals
void log(std::string_view msg) { sink_->write(msg); }
log("hello");   // no allocation
```

### TypeScript — re-render churn (`cpu-hot` + `alloc`)

```ts
// BAD: new object identity every render → child memo busted
function Parent({ items }: Props) {
  return <Child config={{ theme: "dark", sort: "asc" }} items={items} />;
}

// SAFE: stable identity
const CONFIG = { theme: "dark", sort: "asc" } as const;
function Parent({ items }: Props) {
  return <Child config={CONFIG} items={items} />;
}
```

### TypeScript — sync I/O in async handler (`io-block`)

```ts
// BAD: fs.readFileSync blocks the event loop — kills the whole Node process throughput
app.get("/config", (req, res) => {
  const data = fs.readFileSync("./config.json", "utf8");
  res.json(JSON.parse(data));
});

// SAFE: async + cache the parsed result
let cached: object | null = null;
app.get("/config", async (req, res) => {
  if (!cached) cached = JSON.parse(await fs.promises.readFile("./config.json", "utf8"));
  res.json(cached);
});
```

### SQL — missing index (`query-plan`)

```sql
-- BAD: Seq Scan on 50M-row users table (auto_explain shows ~500ms)
EXPLAIN ANALYZE SELECT * FROM users WHERE email = 'test@example.com';
--   Seq Scan on users  (cost=0.00..1.05M rows=1 width=...) (actual time=523ms..523ms)

-- SAFE: covering index, Index Scan
CREATE INDEX CONCURRENTLY idx_users_email ON users(email);
-- Now: Index Scan using idx_users_email on users (actual time=0.03..0.04ms)
```

### SQL — wrong join order / spill to disk (`query-plan`)

```sql
-- BAD: Hash Join with Sort Disk (work_mem too small for join build side)
-- auto_explain: "Sort Method: external merge  Disk: 850MB"

-- SAFE options (in order of preference):
-- 1. Add the right index so a Nested Loop replaces the Hash Join
CREATE INDEX idx_orders_customer_created ON orders(customer_id, created_at);
-- 2. Or raise work_mem just for this session
SET LOCAL work_mem = '256MB';
-- 3. Or rewrite the query so the smaller side is the build side
```

## Severity reconciliation (triage vs. refinement-loop output)

These tiers are the **internal triage view** when you produce a human-readable profile report. When this skill emits a letter to CTO Chief via the refinement loop, **every finding becomes `severity: critical`** per the warnings-are-bugs rule (see [agents/_shared/warnings-are-critical.md](../../../agents/_shared/warnings-are-critical.md)). The triage tiers below stay in the report body for prioritization; the letter's `severity` field is always `critical`.

| Triage tier | Examples | Internal action recommendation |
|---|---|---|
| CRITICAL | Single function > 30% wall time on the hot path; lock-contention causing tail-latency tripling; allocation hot path causing GC pauses > p99 SLO; missing index causing > 1s p50 query; cold-start > 5s on serverless function with > 1 rps; production memory leak (RSS growing > 10% / hr) | BLOCK |
| HIGH | Hot function 10–30% wall time; lock-contention visible but not user-facing; alloc rate elevated but GC still fits SLO; query plan suboptimal but < 1s; coldstart 1–5s | BLOCK |
| MEDIUM | Hot function 5–10% wall time; mild deopt; missing connection pool config; over-broad JOIN that works today but won't scale | Fix soon |
| LOW | Micro-optimization candidates; readability-vs-perf trade-offs; ReDoS without a real attacker vector | Backlog |

## Scan Methodology

### Phase 1 — Quick attribution (5 min, no instrumentation)

1. Identify the workload. What endpoint / job / batch? What's the trigger?
2. Read APM / metrics: latency p50/p95/p99, throughput, CPU%, RSS, GC pause %.
3. If continuous profiling is on (Pyroscope/Parca/Datadog/Sentry), pull the existing flame graph for the relevant time window.
4. Compare against a known-good window (yesterday same hour, or pre-deploy). Differential view if available.

### Phase 2 — Targeted profile (15–60 min)

1. Pick the right axis: CPU, allocation, lock, I/O — based on Phase 1 hypothesis.
2. Sample for 30–60s under representative load (NOT synthetic if avoidable).
3. Render flame graph. Identify the widest bar above 5% wall time.
4. Read the source. Confirm the wide bar is the actual cost driver (not a wrapper).

### Phase 3 — Differential / regression attribution

1. Capture base profile (pre-regression) and head profile (current).
2. Generate differential flame graph: red = slower-after, blue = faster-after.
3. Correlate the red towers to commits in that window (`git log --since`).
4. Emit letter with `commit_sha` if the regression is attributable to a single change.

## Output Format (human-readable report body)

```markdown
## Performance Profile Report

### Workload
- Endpoint: POST /api/orders/checkout
- Window: 2026-05-19 09:00–09:30 UTC (15 min sample, ~12k requests)
- Baseline: 2026-05-15 same window (pre-deploy commit a1b2c3d)

### Three-axis snapshot
| Axis | Current | Baseline | Δ | Target | Status |
|---|---|---|---|---|---|
| p50 latency | 320 ms | 95 ms | +236% | 150 ms | FAIL |
| Throughput | 180 rps | 420 rps | -57% | 400 rps | FAIL |
| CPU util | 78% | 35% | +43 pp | < 70% | WARN |

### Hotspots (flame graph: flame-2026-05-19.svg)
| Function | % Wall | Kind | Reachable |
|---|---|---|---|
| OrderSerializer.toJson | 42% | alloc | yes |
| TaxCalculator.compute | 18% | cpu-hot | yes |
| db.query (orders↔customers) | 14% | io-block | yes — N+1 |

### Critical findings

1. **OrderSerializer.toJson — allocation hot path (42% wall, GC pauses 60ms p99)**
   - Root cause: builds intermediate `Dictionary<string, object>` per line item, then serializes
   - Differential: introduced in commit f4e2d1c (#2143, 2026-05-17)
   - Fix: switch to `System.Text.Json.JsonSerializer.Serialize<T>` with source generator
   - Expected impact: alloc/req drops ~80%, p99 GC pause drops below 10 ms

2. **TaxCalculator.compute — CPU hot, single-threaded (18% wall)**
   - Root cause: re-fetches tax-rule table from DB on every call instead of cached
   - Fix: in-process cache w/ 5 min TTL (rules change quarterly)
   - Expected impact: 18% wall-time reduction; throughput +20%

3. **N+1 query orders↔customers (14% wall, 100 orders = 101 queries)**
   - Fix: eager-load with `Include(o => o.Customer)` (EF Core) or `JOIN`
   - Expected impact: query count 101 → 1, DB CPU −30%
```

## Letter schema (refinement-loop output contract)

When emitting a finding via the refinement loop, write the letter with these fields:

```yaml
finding_id: <sha256(critic+file+line+kind)[:12]>   # fingerprint for dedup
severity: critical                                  # ALWAYS critical (warnings-are-bugs)
confidence: high | medium | low                     # high = differential corroborated; low = single-profile candidate
engine: pyroscope | parca | datadog | sentry | async-profiler | py-spy | scalene | dotnet-trace | perfview | perf | tracy | clinic | manual
kind: cpu-hot | alloc | lock-contention | io-block | leak | coldstart | deopt | gc-pause | query-plan
target_file: src/services/checkout/OrderSerializer.cs
target_line: 84
target_function: OrderSerializer.ToJson
percent_of_wall_time: 42                            # integer percent, 0–100
sample_count: 12450                                 # number of samples this frame appeared in
profile_duration_sec: 900
baseline_compared: true                             # was a differential captured?
baseline_percent_of_wall_time: 8                    # baseline value (if baseline_compared)
delta_pp: +34                                       # current − baseline (percentage points)
attributable_commit: f4e2d1c                        # if a single commit owns the regression
attributable_deploy: deploy-2026-05-17-09-32        # deploy id from CI/CD
labels:
  service: checkout
  region: us-east-1
  version: 6.4.3
suggested_fix: "Replace Dictionary<string,object> intermediate with source-generated System.Text.Json serializer; expected alloc/req −80%, p99 GC pause < 10 ms"
reference: https://www.brendangregg.com/flamegraphs.html
```

The integrator uses `confidence` and `baseline_compared` to weight findings — a `confidence: low` single-profile finding doesn't block phase advancement on its own, but a differential-corroborated `confidence: high` finding with `attributable_commit` set is auto-promoted to the implementation queue. `kind: leak` always escalates regardless of `percent_of_wall_time` because leaks are unbounded over time.

## Special Considerations

- **Sampling overhead budget.** A profiler that costs 5% CPU to find a 5% optimization is net-zero. Stay under 1% for production; document overhead in the letter if higher.
- **Frame-pointer omission.** Many distros / build flags omit frame pointers, breaking `perf` stack unwinding. Use eBPF profilers with DWARF unwinding or rebuild with `-fno-omit-frame-pointer` for accurate stacks.
- **Async stacks need stitching.** Native profilers see the worker thread, not the logical call chain. Use language-aware profilers (async-profiler for JVM, dotnet-trace for .NET async/await, py-spy `--idle` for Python asyncio) or context propagation.
- **Coldstart vs. steady-state.** Always declare which one you're measuring. A 5s coldstart on a 1-request-per-day function is fine; on 100-rps it's an outage.
- **Cardinality discipline.** Repeating from 2026 Best Practices because this is the #1 reason continuous profiling pipelines break: never label by user_id / request_id / full URL path.
- **Test code & micro-benchmarks.** A microbenchmark that "proves" a 2x speedup in isolation often disappears in production due to cache effects, branch prediction, and JIT/optimizer interaction. Always confirm with a production profile before declaring victory.

---

## Refinement Loop — critic mode (v6.9.16)

When invoked as a critic by the Iron Loop integrator (see [docs/REFINEMENT_LOOP.md](../../../docs/REFINEMENT_LOOP.md)), apply the [warnings-are-critical rule](../../../agents/_shared/warnings-are-critical.md):

- Every profiler-flagged hot path, allocation regression, lock-contention finding, missing-index plan, and cold-start above its SLO emits as `severity: critical` in the letter you write to CTO Chief.
- The [letter schema](../../../.ctoc/architecture/refinement-loop-schema.json) rejects `warn` — there is no soft tier.
- Performance findings block phase advancement (critical → medium) until resolved or explicitly waived in the plan's `## Decisions Taken Under Ambiguity` section.

The principle: a perf warning today is a customer-visible p99 outage after the next traffic spike. Code that ships green-with-warnings ships with known latent failures.
