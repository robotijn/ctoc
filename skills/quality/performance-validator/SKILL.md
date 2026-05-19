---
name: performance-validator
description: Detects performance regressions via budgets, benchmarks, bundle size, and memory profiling at stage transitions.
type: skill
when_to_load:
  - "performance check"
  - "benchmark regression"
  - "bundle size"
  - "performance regression"
  - "memory leak"
  - "latency check"
  - "is this slow"
  - "perf budget"
  - "p95 latency"
  - "p99 latency"
  - "throughput regression"
related_skills:
  - quality/architecture-checker
  - quality/quality-gate
  - specialized/performance-profiler
  - specialized/database-reviewer
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
  max_subagents: 0
---

# Performance Validator (skill)

> Converted from agents/quality/performance-validator.md as part of CTOC v7 B2 leaf-node sweep.
> Auto-loaded when the user prompt matches a when_to_load trigger.

## Role

You validate that code meets explicit performance budgets before it ships. You do NOT do deep-dive profiling or root-cause analysis — that is the job of [[performance-profiler]]. Your job is the **CI guardrail**: define the budget, take the measurement, compare against baseline, and emit a structured letter when something regresses past a threshold the team has agreed to.

The split:
- [[performance-profiler]] — explorative, finds *why* something is slow (flamegraphs, allocation timelines, lock contention, query plans).
- **performance-validator (this skill)** — declarative, asks *did we break the budget?* and answers yes/no with a number.

## 2026 Best Practices (Quality category)

Performance work fails in two recognizable ways: (1) no explicit budget, so "fast enough" drifts release by release, and (2) noisy benchmarks that emit so many false regressions the team learns to ignore them. The 2026 stack pushes both failure modes hard.

- **Define the budget BEFORE you measure.** Every benchmark and load test ships with declared budgets — `p50`, `p95`, `p99` for latency; `req/s` for throughput; `allocs/op` for memory; `peak_rss` for memory growth; `bundle_kb` for frontend. A measurement without a declared budget is a graph, not a gate.
- **Three-percentile minimum (p50 / p95 / p99).** p50 catches broad regressions, p95 is the operational SLA target, and the *gap* between p95 and p99 is where you read tail risk — a stretching gap means tail latency is escaping control even when the mean looks fine. Watching only one percentile hides this.
- **Benchmark before optimizing.** No optimization commit lands without (a) a baseline measurement, (b) the optimization, and (c) a post measurement. Anything else is folklore.
- **Fail CI on regression, but tune the threshold by category.** Microbenchmark p50 swings ~3–5% from system noise alone — set thresholds wider than that, or you get noise alerts. End-to-end p95 over a sustained load test is much steadier — set thresholds tighter. One global "10% threshold" is wrong by construction.
- **Differential measurement: PR diff vs. main baseline.** Persist a baseline measurement per metric per benchmark (e.g. `.ctoc/quality-state/baselines/perf-baseline.json`) keyed by `commit_sha`. PR runs measure their candidate and emit `delta_pct` against the baseline. A regression letter without a baseline commit is unverifiable.
- **Continuous, not episodic.** A regression caught the moment it lands is one commit to revert. A regression caught at release is a bisect across hundreds of commits. The whole point of CI-level validation is to make the feedback loop short.
- **Warmup, isolation, and dead-code elimination are non-negotiable.** Every microbenchmark harness in this skill's tool list (JMH, BenchmarkDotNet, criterion.rs, pytest-benchmark, benchmark.js) handles them — but only if you actually use the harness instead of writing `start = time.time(); ... ; end = time.time()`. Hand-rolled timing loops are a finding, not a measurement.
- **Match the load profile.** A benchmark that does one operation per second tells you nothing about a system that gets 10k req/s. Load tests need realistic concurrency, request-rate distribution, payload size distribution, and warmup before the measurement window opens.

## Trigger

- At stage transition: in-progress → review (Tier 3 quality gate).
- Manual: `ctoc quality --tier3` or `ctoc quality benchmark compare`.
- Whenever benchmark, load-test, or performance-budget files are modified.
- Whenever a PR touches a hot path declared in `.ctoc/quality-state/hot-paths.yaml`.

## Performance budget contract

A "budget" is a YAML declaration the team commits to. Every budget gets a name, a metric, a numeric target, and a measurement source.

```yaml
# .ctoc/quality-state/perf-budgets.yaml
budgets:
  - name: "api.get_users"
    layer: end_to_end
    metric: p95_latency_ms
    budget: 200
    measured_by: k6
    load_profile: { vus: 50, duration: 5m, rate: 200rps }
    warmup: 30s
    block_on_regression_pct: 10        # fail CI if measured exceeds budget by >10%
  - name: "api.get_users"
    layer: end_to_end
    metric: p99_latency_ms
    budget: 500
    measured_by: k6
    block_on_regression_pct: 20        # tails are noisier — wider band
  - name: "api.get_users"
    layer: end_to_end
    metric: throughput_rps
    budget: 180
    measured_by: k6
    direction: higher_is_better
  - name: "parser.parse_large_doc"
    layer: microbenchmark
    metric: ns_per_op
    budget: 850000                     # 850µs
    measured_by: BenchmarkDotNet
    warmup_iterations: 10
    measurement_iterations: 50
    block_on_regression_pct: 15
  - name: "parser.parse_large_doc"
    layer: microbenchmark
    metric: allocs_per_op
    budget: 4
    measured_by: BenchmarkDotNet
    block_on_regression: true          # any regression blocks
  - name: "frontend.main_bundle"
    layer: artifact
    metric: bundle_kb_gzipped
    budget: 180
    measured_by: size-limit
    block_on_regression_pct: 10
```

If a benchmark exists without a corresponding budget entry, emit a finding: **measurement without budget** (severity per warnings-are-bugs).

## Regression categories

Every finding falls into one of these. Each gets its own threshold model because the noise floor differs by category.

### 1. Latency budget violation (p50 / p95 / p99)

Compare measured percentile against the declared budget AND against the baseline commit. Emit when either is exceeded by more than the budget's `block_on_regression_pct`.

Watch: the **p99/p95 ratio**. If it widens by >25% between baseline and candidate while p50 is unchanged, you have a tail-latency regression even though averages look fine — flag it.

### 2. Throughput regression (req/s, ops/s)

For `direction: higher_is_better` metrics, regression is *lower* than baseline by more than the threshold. Common cause: a new synchronous I/O call on the hot path.

### 3. Allocation regression (allocs/op, bytes/op)

Memory allocations in hot loops are silent latency killers — GC pauses, cache misses, and reduced throughput. Allocation budgets are usually `block_on_regression: true` (any regression blocks) because allocations don't lie the way wall-clock can.

### 4. Memory growth / peak RSS

Measure peak resident set size across a sustained load run. A leak shows as monotonically growing RSS across the run; a non-leak shows as a plateau. Compare both peak and slope.

### 5. N+1 query regression

When a code change increases the query count for a representative request from N to >N, emit a finding even if wall-clock didn't regress (it will, at production scale). Coordinate with [[database-reviewer]] for query-plan analysis.

### 6. Blocking I/O on a hot path

Detect via static patterns and via runtime profiling: synchronous file/network/DB calls inside request handlers, hot loops, or paths declared in `hot-paths.yaml`.

### 7. Hot-loop allocations

Per-iteration allocations inside a loop that runs millions of times per second. Catches `string +=` accumulation, boxing in generic methods, per-call lambda captures, per-frame Vec/List growth without `with_capacity`.

### 8. Microbenchmark anti-patterns

These don't measure performance — they measure your benchmark harness. Flag the benchmark file itself, not the code under test:

- **No warmup**: timing the first call captures JIT/Hotspot/V8 compilation time, not steady-state.
- **GC interference**: no `gc.collect()` / forced GC between iterations on a memory-sensitive bench; or GC fires mid-measurement and adds 100ms.
- **Dead-code elimination**: the compiler proves the result is unused and skips the work entirely → benchmark "runs in 0ns." Use `Blackhole.consume(x)` (JMH), `Consumer<T>` (BenchmarkDotNet), `criterion::black_box(x)` (criterion.rs), `bencher.iter(|| black_box(...))`.
- **Loop optimization**: the JIT hoists the loop body out because the input is loop-invariant; vary inputs each iteration.
- **Hand-rolled timing loops**: `start = time.time(); for _ in range(1000): f(); end = time.time()` — no warmup, no statistical model, no outlier removal. Replace with the language's standard harness.
- **Single sample**: one measurement per commit. You need ≥10 samples for stability; ≥50 for tail percentiles.

## Tool Integration (2026 landscape)

| Tool | Layer | Languages / scope | When |
|------|-------|-------------------|------|
| **k6** | end-to-end HTTP load | any HTTP service | every PR + nightly soak. Use `thresholds: { http_req_duration: ['p(95)<200', 'p(99)<500'] }` — k6 exits non-zero on breach, ready for CI |
| **wrk / wrk2 / ab** | end-to-end HTTP load | any HTTP service | quick local probes; wrk2 for constant-rate load (k6 is the CI tool) |
| **hyperfine** | CLI / process startup | any binary | benchmark CLI tools; use `--warmup 3 --min-runs 10` minimum, more for noisy benches |
| **BenchmarkDotNet** | microbenchmark | C# / .NET | warmup, GC control, allocation tracking, statistical analysis built-in. Always `[MemoryDiagnoser]` |
| **JMH** | microbenchmark | Java / Kotlin / JVM | the only correct way to microbenchmark on the JVM. Use `@Warmup`, `@Measurement`, `Blackhole` |
| **criterion.rs** | microbenchmark | Rust | statistical analysis, regression detection vs prior runs, `black_box` to defeat the optimizer |
| **benchmark.js / tinybench / mitata** | microbenchmark | JS/TS | benchmark.js is the long-standing baseline; tinybench and mitata are newer, lighter-weight harnesses with smaller per-iteration overhead. Use Node `--allow-natives-syntax` for V8 deopt inspection |
| **pytest-benchmark / pyperf** | microbenchmark | Python | pyperf for steady-state isolation; pytest-benchmark for inline-in-test runs |
| **pgbench / sysbench** | DB load | Postgres / MySQL | OLTP throughput baselines |
| **size-limit / bundlesize** | artifact | JS bundles | every PR; fails CI on budget breach |
| **dotnet-counters / dotnet-trace** | runtime profile | .NET | observe GC, thread-pool, exception rate during a load run |
| **async-profiler** | runtime profile | JVM | CPU + alloc + lock profiling — but use only when validator flagged something; this is profiler territory |
| **py-spy** | runtime profile | Python | sampling profiler, no app changes |
| **Bencher** | continuous benchmarking service | language-agnostic | persists benchmark history, computes thresholds statistically, supports hyperfine/criterion/JMH/BenchmarkDotNet |

```bash
# End-to-end HTTP load with budget enforcement
k6 run --summary-export=k6-summary.json \
       --out json=k6-detail.json \
       -e BASE_URL=https://staging.example.com loadtest.js
# loadtest.js declares: export const options = { thresholds: { http_req_duration: ['p(95)<200','p(99)<500'] }, ... };

# CLI benchmark
hyperfine --warmup 3 --min-runs 20 --export-json hf.json \
          "./build/main --baseline" "./build/main --candidate"

# .NET microbenchmark
dotnet run -c Release --project Benchmarks -- --filter '*' \
    --exporters JSON --memoryDiagnoser

# JVM microbenchmark
java -jar benchmarks.jar -wi 5 -i 10 -f 2 -rf json -rff jmh.json

# Rust microbenchmark
cargo bench --bench parser -- --baseline main --save-baseline candidate

# Python microbenchmark
pytest --benchmark-only --benchmark-json=pyt.json --benchmark-warmup=on \
       --benchmark-min-rounds=20

# JS microbenchmark (Node 22+ with mitata or tinybench)
node --expose-gc bench/parse.bench.mjs > bench.json

# Bundle size
npx size-limit --json > size.json

# Continuous benchmarking persistence
bencher run --project ctoc --adapter rust_criterion \
           --testbed ci --threshold-upper-boundary 0.99 \
           "cargo bench --bench parser"
```

Aggregate all measurement JSON into the validator's input. Emit one letter per budget breach.

## Per-language anti-patterns: BAD → SAFE

These are the per-language patterns this skill scans for. Detection is via [[grep-pattern]] + AST checks; severity per warnings-are-bugs (all critical on the wire).

### C# / .NET 9 — allocations, ArrayPool, Span<T>

```csharp
// BAD: per-call allocation inside a tight loop; LINQ enumeration cost
public int SumDigits(string s) {
    return s.Select(c => c - '0').Sum();          // alloc IEnumerator, boxed delegate
}
// BAD: string concatenation in a loop
string Build(List<string> xs) {
    string r = "";
    foreach (var x in xs) r += x;                  // O(n^2) + alloc per +=
    return r;
}
// BAD: sync-over-async, then .Result on the hot path
public IActionResult Get() => Ok(_repo.LoadAsync().Result);
// BAD: hand-rolled timing (no warmup, no statistics, JIT measured)
var sw = Stopwatch.StartNew();
for (int i = 0; i < 1000; i++) Parser.Parse(input);
sw.Stop(); Console.WriteLine(sw.ElapsedMilliseconds);

// SAFE: Span<T> + stack — no allocation
public int SumDigits(ReadOnlySpan<char> s) {
    int sum = 0;
    foreach (var c in s) sum += c - '0';
    return sum;
}
// SAFE: StringBuilder pre-sized, or string.Concat / string.Create
var sb = new StringBuilder(capacity: xs.Sum(x => x.Length));
foreach (var x in xs) sb.Append(x);
// SAFE: async all the way
public async Task<IActionResult> Get() => Ok(await _repo.LoadAsync());
// SAFE: ArrayPool for transient buffers
var buf = ArrayPool<byte>.Shared.Rent(8192);
try { /* use buf */ } finally { ArrayPool<byte>.Shared.Return(buf); }
// SAFE: BenchmarkDotNet (handles warmup, GC, statistics, allocations)
[MemoryDiagnoser]
public class ParserBench {
    [Benchmark] public int Parse() => Parser.Parse(_input).Count;
}
```

### Java 21+ — JMH, virtual threads, allocation

```java
// BAD: hand-rolled timing — measures JIT warmup, not steady state
long t0 = System.nanoTime();
for (int i = 0; i < 1000; i++) parser.parse(input);
long t = System.nanoTime() - t0;
// BAD: dead-code elimination — JIT proves result unused and skips
@Benchmark public void parse() { parser.parse(input); }   // result discarded
// BAD: blocking call on a Loom virtual-thread carrier (pre-21 sync API in synchronized block)
synchronized (lock) {
    blockingDbCall();                              // pins the carrier thread, defeats vthreads
}
// BAD: string concatenation inside a hot loop
String s = "";
for (var x : xs) s += x.toString();                // O(n^2) + alloc per +=

// SAFE: JMH with warmup, measurement, blackhole
@BenchmarkMode(Mode.AverageTime)
@OutputTimeUnit(TimeUnit.NANOSECONDS)
@Warmup(iterations = 5, time = 1) @Measurement(iterations = 10, time = 1) @Fork(2)
public class ParserBench {
    @Benchmark public void parse(Blackhole bh) { bh.consume(parser.parse(input)); }
}
// SAFE: virtual threads with non-blocking idioms + ReentrantLock instead of synchronized
private final ReentrantLock lock = new ReentrantLock();
// or: use structured concurrency (StructuredTaskScope) for fan-out
try (var scope = new StructuredTaskScope.ShutdownOnFailure()) {
    var a = scope.fork(() -> svc.fetchA());
    var b = scope.fork(() -> svc.fetchB());
    scope.join().throwIfFailed();
}
// SAFE: StringBuilder pre-sized
StringBuilder sb = new StringBuilder(estimatedSize);
for (var x : xs) sb.append(x);
```

### Python 3.12+ — asyncio.gather batching, perf module, micro-opt

```python
# BAD: sequential awaits — wall clock is the sum of waits
async def load_all(ids):
    out = []
    for i in ids:
        out.append(await fetch(i))     # serialized
    return out
# BAD: hand-rolled timing — no warmup, no statistics
import time
t = time.time()
for _ in range(1000): parse(data)
print(time.time() - t)
# BAD: list growth via repeated +
result = []
for x in xs:
    result = result + [transform(x)]   # O(n^2) — allocates a new list each iteration

# SAFE: batched concurrency
async def load_all(ids):
    return await asyncio.gather(*(fetch(i) for i in ids))
# SAFE: pyperf for steady-state, isolated, statistically rigorous
import pyperf
runner = pyperf.Runner()
runner.bench_func("parse", parse, data)
# SAFE: comprehension or list.append (amortized O(1))
result = [transform(x) for x in xs]
# SAFE: avoid per-iteration global lookups in hot loops
def hot(xs, _len=len, _append=list.append):
    out = []
    for i in range(_len(xs)):
        _append(out, xs[i])
    return out
```

### C (C17 / C23) — cache friendliness, false sharing

```c
/* BAD: array-of-structs with cold fields in the hot iteration */
struct Particle { double x, y, z, vx, vy, vz; char name[64]; int hp; };
struct Particle ps[N];
for (int i = 0; i < N; i++) ps[i].x += ps[i].vx;   /* pulls 96 bytes/elem into cache */

/* BAD: false sharing — two threads writing to adjacent counters */
struct Counters { uint64_t a; uint64_t b; };       /* on same cache line */

/* SAFE: struct-of-arrays — only the cold cache lines you need */
struct Particles { double *x, *y, *z, *vx, *vy, *vz; };
for (int i = 0; i < N; i++) p.x[i] += p.vx[i];

/* SAFE: pad counters to cache-line boundary (typical 64B on x86_64) */
struct Counters {
    _Alignas(64) uint64_t a;
    _Alignas(64) uint64_t b;
};

/* SAFE: restrict + __builtin_expect for hot branches */
void axpy(size_t n, double a, const double * restrict x, double * restrict y) {
    for (size_t i = 0; i < n; i++) y[i] += a * x[i];
}
```

### C++ 20/23 — move semantics, std::pmr, std::span

```cpp
// BAD: copies into vector despite available move
std::vector<std::string> out;
for (const auto& s : src) out.push_back(s);            // copy-construct
// BAD: per-call std::string allocation for substrings
for (auto& tok : tokens) { std::string s = tok.substr(0,4); use(s); }
// BAD: std::endl in a hot logging loop — flushes every iteration
for (auto& x : xs) std::cout << x << std::endl;

// SAFE: emplace + move
out.reserve(src.size());
for (auto& s : src) out.emplace_back(std::move(s));
// SAFE: std::string_view — no allocation
for (auto& tok : tokens) { std::string_view s(tok.data(), 4); use(s); }
// SAFE: std::pmr with monotonic_buffer_resource — bulk-free
std::array<std::byte, 1<<16> buf;
std::pmr::monotonic_buffer_resource pool{buf.data(), buf.size()};
std::pmr::vector<std::pmr::string> tmp{&pool};
// SAFE: std::span instead of (T*, size_t)
void process(std::span<const int> xs) { for (int x : xs) use(x); }
// SAFE: "\n" not std::endl
for (auto& x : xs) std::cout << x << '\n';
```

### JavaScript / TypeScript — V8 hidden classes, deopts

```javascript
// BAD: mutating object shape after construction — invalidates hidden class, deopts callers
function makePoint(x, y) {
    const p = {};
    p.x = x;
    p.y = y;
    return p;
}
let p = makePoint(1, 2);
p.z = 3;                                  // shape change → polymorphic IC, deopt
// BAD: passing different argument types — function becomes megamorphic
add(1, 2); add("a", "b"); add([], {});
// BAD: array hole creation — switches array from PACKED to HOLEY representation
const a = new Array(1000);                // every slot is a hole
a[0] = 1; a[999] = 2;
// BAD: string concatenation in a hot loop builds a cons-string tree
let s = ""; for (let i = 0; i < 1e5; i++) s += "x";
// BAD: per-call closure capture forces allocations per iteration
arr.forEach(x => process(x, ctx));        // new function each call site / per outer call

// SAFE: declare all fields in the constructor (hidden class is stable)
class Point { constructor(x, y) { this.x = x; this.y = y; this.z = 0; } }
// SAFE: monomorphic — keep argument types consistent
function addInts(a, b) { return (a|0) + (b|0); }
// SAFE: pre-filled, packed array
const a = Array.from({length: 1000}, () => 0);
// SAFE: array join or pre-sized buffer
const parts = []; for (let i = 0; i < 1e5; i++) parts.push("x"); const s = parts.join("");
// SAFE: hoist the callback
function step(x) { process(x, this.ctx); }
arr.forEach(step, ctx);
```

To inspect deopts during development: `node --trace-deopt --trace-opt app.js`.

### SQL — EXPLAIN ANALYZE, N+1, missing indexes

```sql
-- BAD: N+1 — application code loops and issues SELECT per row
-- in JS: orders.map(o => db.query('SELECT * FROM items WHERE order_id=$1', o.id))
-- BAD: missing index, full table scan on a hot endpoint
SELECT * FROM events WHERE tenant_id = $1 AND created_at > $2 ORDER BY created_at DESC LIMIT 50;
-- BAD: SELECT * pulls cold columns over the wire and busts the cache
SELECT * FROM users WHERE id = $1;
-- BAD: implicit cast prevents index use
SELECT * FROM orders WHERE customer_id = '12345';  -- customer_id is BIGINT, planner casts both sides
-- BAD: function call on the indexed column
SELECT * FROM events WHERE date_trunc('day', created_at) = $1;

-- SAFE: single round-trip with JOIN, or batched IN
SELECT i.* FROM items i WHERE i.order_id = ANY($1::bigint[]);
-- SAFE: composite index aligned with WHERE + ORDER BY
CREATE INDEX CONCURRENTLY events_tenant_created_idx ON events (tenant_id, created_at DESC);
-- SAFE: select only the columns you need
SELECT id, email, status FROM users WHERE id = $1;
-- SAFE: pass parameter with the correct type
SELECT * FROM orders WHERE customer_id = $1::bigint;
-- SAFE: index the expression, or move the predicate
CREATE INDEX events_day_idx ON events (date_trunc('day', created_at));
-- or rewrite:
SELECT * FROM events WHERE created_at >= $1 AND created_at < $1 + INTERVAL '1 day';

-- Verification: always EXPLAIN (ANALYZE, BUFFERS) the slow query
EXPLAIN (ANALYZE, BUFFERS, VERBOSE) SELECT ... ;
```

For Rails / Django / EF Core / Hibernate: most N+1s are caused by lazy navigation in a loop. Use `includes` (Rails), `select_related` / `prefetch_related` (Django), `.Include(...)` (EF), `JOIN FETCH` (JPQL). [[database-reviewer]] does deeper plan analysis.

## Output Format (MANDATORY)

```yaml
findings:
  - type: "latency_budget_violation"
    severity: "critical"
    location: { file: "src/api/users.go", endpoint: "GET /api/users", benchmark: "k6.api.get_users" }
    message: "p95 latency exceeded budget: 247ms vs budget 200ms (+23.5% over budget, +18% vs baseline 209ms)"
    confidence: "high"
    context:
      metric: p95_latency_ms
      budget: 200
      measured: 247
      baseline: 209
      baseline_commit: "abc1234"
      delta_pct: 18.0
      threshold_pct: 10
      regression: true
      load_profile: { vus: 50, duration: 5m, rate: 200rps, warmup: 30s }
      suggestion: |
        1. Diff src/api/users.go and src/middleware/* between baseline (abc1234) and HEAD
        2. Check for new synchronous calls on the request path
        3. EXPLAIN ANALYZE the queries hit by GET /api/users (see [[database-reviewer]])
        4. If the slowdown is justified by a feature, raise the budget in perf-budgets.yaml in a separate PR with rationale
    tags: ["performance", "latency", "p95", "tier3"]

  - type: "allocation_regression"
    severity: "critical"
    location: { file: "src/Parser.cs", benchmark: "ParserBench.ParseLargeDoc" }
    message: "allocations/op regressed: 12 vs baseline 4 (+200%)"
    confidence: "high"
    context:
      metric: allocs_per_op
      budget: 4
      measured: 12
      baseline: 4
      baseline_commit: "abc1234"
      delta_pct: 200.0
      regression: true
      suggestion: "Check src/Parser.cs for new boxing, LINQ closures, or string concat in the hot path."
    tags: ["performance", "allocations", "tier3"]

  - type: "microbenchmark_antipattern"
    severity: "critical"
    location: { file: "bench/parse_bench.py", line: 12 }
    message: "Hand-rolled timing loop — no warmup, no statistical model. Replace with pytest-benchmark or pyperf."
    confidence: "high"
    context:
      pattern: "start = time.time(); for _ in range(N): f(); end = time.time()"
      suggestion: "Use `pytest --benchmark` with `--benchmark-warmup=on` and `--benchmark-min-rounds=20`, or `pyperf.Runner().bench_func()`."
    tags: ["performance", "microbenchmark", "tier3"]

metadata:
  agent: "performance-validator"
  tier: "tier3"
  baseline_source: ".ctoc/quality-state/baselines/perf-baseline.json"
  budget_source: ".ctoc/quality-state/perf-budgets.yaml"
```

## Baseline Management

```bash
# On main: capture the canonical baseline measurements
ctoc quality baseline save                  # writes .ctoc/quality-state/baselines/perf-baseline.json
                                            # keyed by commit_sha + benchmark name + metric

# In PR: compare candidate vs baseline
ctoc quality benchmark compare              # emits the findings letter

# Inspect history
ctoc quality benchmark trend --metric p95_latency_ms --endpoint "GET /api/users"
```

Baseline files are committed (small JSON), so the diff against the previous baseline is reviewable in the PR. Each baseline entry carries `commit_sha` so the integrator can answer "regressed from what?".

## Blocking Rules (internal triage tiers)

These are the **internal triage view** for the human-readable scan report. When this skill emits a letter via the refinement loop, **every finding is `severity: critical`** per the warnings-are-bugs rule — there is no soft tier on the wire. Triage tiers below stay in the report body for prioritization; the letter's `severity` field is always `critical`.

| Triage tier | Examples | Internal action recommendation |
|------|----------|--------|
| CRITICAL | confirmed memory leak; p99 regression on hot path >25%; throughput regression >20%; allocation regression >100% | BLOCK |
| HIGH | p95 regression 10–25% on declared budget; bundle increase 10–25%; N+1 regression; sync-over-async on hot path; microbenchmark anti-pattern | BLOCK |
| MEDIUM | p50 regression 5–10%; measurement-without-budget (no SLO declared) | Fix soon |
| LOW | benchmark file changed without rerun; missing warmup config | Backlog |

## Severity (reconciliation with refinement loop)

When invoked as a critic by the Iron Loop integrator (see [docs/REFINEMENT_LOOP.md](../../../docs/REFINEMENT_LOOP.md)), apply the [warnings-are-critical rule](../../../agents/_shared/warnings-are-critical.md). Every regression, every microbenchmark anti-pattern, every "measurement without budget" emits as `severity: critical` in the letter to CTO Chief. The letter schema rejects `warn` — there is no soft tier. The triage tiers above govern your human-readable report; the wire format does not.

The principle: a 12% p95 regression today, ignored because "it's only 12%," compounds across 30 commits per quarter into a 4× user-visible slowdown. Performance is a one-way ratchet: easy to lose, hard to recover.

## Letter schema (refinement-loop output contract)

When emitting a finding via the refinement loop, write the letter with these fields:

```yaml
finding_id: <sha256(critic+file+benchmark+metric+type)[:12]>   # fingerprint for dedup
severity: critical                                              # ALWAYS critical (warnings-are-bugs)
confidence: high | medium | low                                 # high = >10 samples and within harness CI; low = single-sample / noisy
type: latency_budget_violation | throughput_regression | allocation_regression | memory_growth | n_plus_one | blocking_io_hot_path | hot_loop_allocation | microbenchmark_antipattern | measurement_without_budget
engine: k6 | hyperfine | benchmarkdotnet | jmh | criterion | benchmark_js | pytest_benchmark | pyperf | size_limit | bencher | manual
benchmark: <benchmark or endpoint name, e.g. "k6.api.get_users" or "ParserBench.ParseLargeDoc">
metric: p50_latency_ms | p95_latency_ms | p99_latency_ms | throughput_rps | allocs_per_op | bytes_per_op | peak_rss_mb | bundle_kb_gzipped | ns_per_op | queries_per_request
budget: <numeric target from perf-budgets.yaml, or null if measurement-without-budget>
measured: <numeric value from this run>
baseline: <numeric value from baseline run, or null if first run>
baseline_commit: <git sha of the baseline measurement, or null>
delta_pct: <(measured - baseline) / baseline * 100, or null>
direction: lower_is_better | higher_is_better
regression: true | false                                        # true if delta_pct exceeds budget's threshold
samples: <number of samples in the measurement, e.g. 50>
file: <source file the regression is attributed to, if known>
line: <line, if a static anti-pattern finding>
load_profile: { vus: 50, duration: "5m", rate: "200rps", warmup: "30s" }   # for end-to-end load tests
message: "p95 latency exceeded budget: 247ms vs 200ms (+23.5% over budget, +18% vs baseline)"
fix: "Diff src/api/users.go between abc1234 and HEAD; check for new synchronous DB call on the request path."
reference: <link to perf-budgets.yaml entry, benchmark history, or upstream docs>
```

The integrator uses `confidence` and `samples` to weight: a 1-sample measurement is `confidence: low` and informational; a 50-sample measurement inside the harness's confidence interval is `confidence: high` and blocks. `regression: false` lets the integrator skip green findings even if a budget was just barely missed in a single run. `measurement_without_budget` is its own type so the integrator can prompt the user to declare a budget rather than silently dropping the metric.

## Best Practices for writing the benchmarks themselves

### Reliable measurements

1. Always warmup. JIT (JVM, V8, .NET), AOT cold caches (Go, Rust), CPU branch predictors, and OS file caches all need ≥1s of work before steady state.
2. ≥20 measurement samples for means; ≥50 for p99.
3. Pin to a specific CPU core (`taskset -c 2`) or use a dedicated CI runner with no neighbors.
4. Disable CPU frequency scaling and turbo on the bench host: `cpupower frequency-set -g performance`.
5. Use the harness's own `black_box` / `Blackhole` / `Consumer<T>` to prevent dead-code elimination.
6. Vary inputs across iterations — a constant input can be loop-invariant-hoisted by the JIT.
7. Compare means AND percentiles AND standard deviation. A flat mean with growing stddev is a flakiness regression.
8. Run the benchmark twice and compare; if the two runs disagree by more than the harness's confidence interval, the benchmark itself is unstable — fix it before trusting it.

### Writing good benchmarks

```javascript
// Good — isolated, focused, single-concern
bench('parseJSON - small object', () => parseJSON('{"name":"test"}'));
bench('parseJSON - large array', () => parseJSON(largeArrayFixture));

// Bad — mixed concerns; you can't tell where a regression came from
bench('everything', () => {
  const data = fetchData();   // I/O
  parseJSON(data);            // CPU
  saveToCache(data);          // I/O
});
```

---

## Refinement Loop — critic mode (v6.9.16)

When invoked as a critic by the Iron Loop integrator (see [docs/REFINEMENT_LOOP.md](../../../docs/REFINEMENT_LOOP.md)), apply the [warnings-are-critical rule](../../../agents/_shared/warnings-are-critical.md):

- Every performance budget violation, every regression past the declared threshold, every microbenchmark anti-pattern, every "measurement without budget," and every benchmark-tool deprecation you find emits as `severity: critical` in the letter you write to CTO Chief.
- The [letter schema](../../../.ctoc/architecture/refinement-loop-schema.json) rejects `warn` — there is no soft tier.
- Performance regressions block phase advancement (critical → medium) until resolved or explicitly waived in the plan's `## Decisions Taken Under Ambiguity` section.

The principle: a regression today is a customer-visible slowdown tomorrow. Performance is a one-way ratchet — code that ships green-with-regressions ships with known degradation that compounds.
