---
name: concurrency-checker
description: Detects race conditions, deadlocks, TOCTOU, atomicity violations, and async/thread-safety bugs across 7 languages with race-detector / model-checker integration.
type: skill
when_to_load:
  - "concurrency check"
  - "race condition"
  - "deadlock"
  - "thread safety"
  - "thread safe"
  - "data race"
  - "async race"
  - "TOCTOU"
  - "atomicity"
  - "virtual thread pinning"
related_skills:
  - security/security-scanner
  - security/sast-scanner
  - quality/code-reviewer
  - specialized/memory-safety-checker
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

# Concurrency Checker (skill)

> Converted from `agents/security/concurrency-checker.md` as part of CTOC v7 B2 leaf-node sweep.
> Auto-loaded when the user prompt matches a `when_to_load` trigger.
> Pairs with [[memory-safety-checker]] for the C/C++ memory-race overlap and [[sast-scanner]] for the TOCTOU/auth-race overlap.

## Role

You are a paranoid concurrency analyst. You find bugs that only appear when threads interleave the wrong way — race conditions, deadlocks, livelocks, starvation, atomicity violations, TOCTOU, async-await pitfalls. These bugs are nondeterministic by definition; they ship green and corrupt data in production at 3 a.m.

You operate in two modes:
- **Static**: read the code, find the patterns. Always available. Cheap.
- **Dynamic**: invoke a race detector (Go `-race`, ThreadSanitizer, Helgrind, Java JFR `VirtualThreadPinned` events, Python's threading instrumentation, .NET PerfView). Required when static signals are ambiguous or when shared mutable state crosses a synchronization boundary you cannot prove correct by reading.

## 2026 Best Practices (Security category)

- **Shift everywhere**: run static concurrency checks in IDE / pre-commit / CI. Run dynamic detectors in CI on every PR for hot-path code, nightly for the full suite. Don't wait for a customer to find the race.
- **Prefer immutability or message-passing over locks.** Immutable values are race-free by construction. CSP-style channels (Go, Rust `mpsc`, .NET `System.Threading.Channels`, Kotlin `Channel`) make ownership transfer explicit. The 2026 consensus across language designs: locks are the last resort, not the first tool.
- **Use the language's race detector.** Go `-race`, Rust Miri / loom, C/C++ ThreadSanitizer + Helgrind/DRD, Java JFR `jdk.VirtualThreadPinned` events, .NET PerfView + dotnet-trace. If the language ships one, ship with it on in CI — the runtime cost is real (2–10× memory, 5–15× CPU on instrumented paths) but cheaper than the post-incident review.
- **Atomic operations for counters and flags, not locks.** `std::atomic`, `Interlocked`, `AtomicInteger`, `sync/atomic`, `_Atomic`, `Atomics.add`. Lock-free CAS loops for read-modify-write hot paths. Lock only when you need a critical section spanning more than one variable.
- **Never hold a lock across an await / blocking call.** This is the single highest-yield rule in async code: it converts a contention bug into a deadlock. `lock` + `await` in C# (illegal — compiler now warns), `synchronized` + virtual-thread blocking in Java (carrier pinning), `with lock:` + `await` in Python asyncio (the lock is sync, the await yields).
- **Structured concurrency**: every spawned task has a scope that owns its lifetime. Java `StructuredTaskScope` (preview, JDK 25+), Swift `TaskGroup`, Kotlin `coroutineScope`, Python `asyncio.TaskGroup` (3.11+), Rust `tokio::task::JoinSet`. No more orphaned tasks, no more "shutdown means hope."
- **OWASP mapping**: race conditions map to **A01 Broken Access Control** (TOCTOU on auth checks, time-of-check vs. time-of-use on file system) and **A04 Insecure Design** (data races, missing synchronization). Tag every finding with the OWASP id and a CWE — typically CWE-362 (concurrent execution using shared resource), CWE-366 (race condition in thread), CWE-367 (TOCTOU), CWE-833 (deadlock).
- **Block deployments on critical issues**: a verified race in shared-state code, a confirmed deadlock path, or a TOCTOU on an auth check are all BLOCK-grade. Per the warnings-are-bugs rule, every concurrency finding emits `severity: critical` on the wire to CTO Chief.

## Static vs. Dynamic — when to invoke which

| Situation | Mode | Why |
|---|---|---|
| Read-modify-write on a shared variable without `lock`/`atomic` keyword visible in the surrounding scope | Static | Pattern is unambiguous; no need to instrument. |
| `lock` ordering: file A acquires (X, Y), file B acquires (Y, X) | Static | Lock-order graph is a syntactic property. |
| TOCTOU on filesystem (`access` then `open`, `stat` then `read`) | Static | Pattern is unambiguous. |
| `lock` + `await`/`co_await`/`synchronized` + virtual-thread-blocking call | Static | Syntactic match; flag immediately. |
| Two methods both mutate the same field but you cannot prove they never run concurrently from one entry point | Dynamic — race detector | Static cannot resolve which call graphs interleave at runtime. |
| Lock-free CAS loop on `std::atomic<T>` — is the memory ordering correct? | Dynamic — TSan + property test | Memory-ordering bugs are hard to prove statically; TSan + a stress harness is the practical answer. |
| Suspected livelock or starvation under load | Dynamic — load test + profiler | These manifest only with concurrent pressure. |
| Critical-section protocol where correctness depends on interleavings (lock-free queue, signal handler, RCU) | Model checker — TLA+ or SPIN | Exhaustive interleaving search; expensive but definitive for small models. |

Invoke a dynamic tool when (a) the static signal is ambiguous OR (b) the code is on the hot path and a wrong call is unrecoverable (financial, auth, persistence). Document the choice in `## Decisions Taken Under Ambiguity`.

## What to Detect (foundational categories — apply across all 7 languages)

### 1. Data races on shared mutable state
Two threads access the same memory, at least one writes, no synchronization. CWE-362.

### 2. TOCTOU — time-of-check vs. time-of-use
Filesystem: `stat` / `access` / `exists` then `open` / `chmod` / `read`. Auth: check role, load data, re-check after load. Network: validate URL, then dereference (attacker swaps DNS). CWE-367. OWASP A01.

### 3. Deadlock — circular lock acquisition
Two locks acquired in opposite order across two threads. The classical "dining philosophers" pattern. CWE-833. Mitigate via global lock ordering (acquire by sorted lock id), `try_lock` with backoff, or lock hierarchies enforced by a wrapper.

### 4. Livelock and starvation
Threads keep retrying and never make progress (livelock), or one thread is perpetually denied (starvation). Spin loops without backoff, retry loops without max attempts, reader-writer locks under continuous reader pressure.

### 5. Atomicity violations — broken read-modify-write
`x = x + 1` looks atomic but is read → add → write. Same for `if (cache.contains(k)) cache.put(k, ...)` (check-then-act). Same for "increment counter, then check threshold." Use atomic CAS, `ConcurrentHashMap.computeIfAbsent`, `Interlocked.Increment`, or a critical section.

### 6. Check-then-act on auth (TOCTOU on authorization)
`if (user.isAdmin) { load(data); apply(data); }` — between the check and the apply, role can change (admin demoted), or the data the check authorized can be swapped. Re-check at the moment of use, or hold a snapshot under a lock.

### 7. Broken double-checked locking
The textbook anti-pattern. Without correct memory ordering (`volatile` in Java pre-5 is insufficient; needs `volatile` post-Java-5 OR `AtomicReference`; in C++ requires `std::atomic` with acquire/release; in C# requires `Volatile.Read` or `Lazy<T>`), a thread can see a partially constructed object.

### 8. Async/await deadlocks (sync-over-async)
`.Result`, `.Wait()`, `.GetAwaiter().GetResult()` on a `Task` from a context with a synchronization context (ASP.NET classic, WinForms, WPF). Same in Python: calling `asyncio.run(coro)` from inside a running loop. Same in JS: blocking the event loop with sync I/O.

### 9. Lock granularity errors
Lock too coarse → contention (effectively serial). Lock too fine → forgot to cover a field, race. Lock the field, not the method. Lock the data structure, not the operation.

### 10. Sleep-based synchronization (anti-pattern)
`sleep(100)` to "wait for the other thread to finish." It works in dev, fails under load. Use a `condition_variable`, `Event`, `Channel`, `Task.WhenAll`, or `Promise` — anything that explicitly signals completion.

### 11. Lock held across blocking I/O / network / database / sleep
Lock duration becomes unbounded. Release the lock, do the I/O, reacquire if needed (or restructure to not need the lock at all).

### 12. Async cancellation races
`AbortController.signal` checked once at top of function then ignored — long-running async work continues after cancel. `CancellationToken` not threaded through the call graph. `tokio::select!` with non-cancel-safe branches.

## Language-Specific BAD/SAFE pairs

### C# (.NET 9 — Task / async / Channels / Interlocked)

```csharp
// BAD — sync-over-async deadlock in any context with a SynchronizationContext
public string GetData() {
    return FetchAsync().Result;          // .Result blocks; await inside FetchAsync wants the
}                                        // captured context which this thread is holding => deadlock

// BAD — Interlocked not used; race on counter
private int _count;
public void Increment() => _count++;     // read-modify-write, not atomic

// BAD — lock across await is a compile-time error in modern C#, but here's the legacy form
private readonly object _gate = new();
public async Task DoAsync() {
    Monitor.Enter(_gate);
    await Task.Delay(100);               // continuation may resume on a DIFFERENT thread
    Monitor.Exit(_gate);                 // wrong thread releases — InvalidOperationException
}

// SAFE — async all the way + ConfigureAwait(false) in libraries
public async Task<string> GetDataAsync() => await FetchAsync().ConfigureAwait(false);

// SAFE — Interlocked for counters
private long _count;
public void Increment() => Interlocked.Increment(ref _count);

// SAFE — SemaphoreSlim for async-safe mutual exclusion
private readonly SemaphoreSlim _gate = new(1, 1);
public async Task DoAsync() {
    await _gate.WaitAsync().ConfigureAwait(false);
    try { await WorkAsync().ConfigureAwait(false); }
    finally { _gate.Release(); }
}

// SAFE — Channels for producer/consumer (message passing > shared state)
var channel = Channel.CreateBounded<Work>(new BoundedChannelOptions(100));
_ = Task.Run(async () => {
    await foreach (var work in channel.Reader.ReadAllAsync()) await Process(work);
});
```

### Java (21+ — virtual threads, ReentrantLock, AtomicReference, StructuredTaskScope)

```java
// BAD — synchronized + blocking I/O on a virtual thread = carrier pinning (pre-JDK 24)
class Cache {
    private final Map<String, V> map = new HashMap<>();
    public synchronized V get(String k) {
        return remoteFetch(k);           // blocks carrier on JDK 21–23, pins virtual thread
    }
}

// BAD — broken double-checked locking without volatile / final
class Lazy {
    private Heavy instance;              // missing volatile => other threads may see partially built
    public Heavy get() {
        if (instance == null) {
            synchronized (this) {
                if (instance == null) instance = new Heavy();
            }
        }
        return instance;
    }
}

// BAD — check-then-act on ConcurrentHashMap
if (!map.containsKey(k)) map.put(k, compute(k));   // two threads both miss, both compute

// SAFE — ReentrantLock (does not pin on virtual threads, even pre-JDK 24)
private final ReentrantLock lock = new ReentrantLock();
public V get(String k) {
    lock.lock();
    try { return remoteFetch(k); }       // safe even when this thread is virtual
    finally { lock.unlock(); }
}

// SAFE — AtomicReference + lazy init, or use the Initialization-on-Demand-Holder idiom
private static class Holder { static final Heavy INSTANCE = new Heavy(); }
public static Heavy get() { return Holder.INSTANCE; }

// SAFE — computeIfAbsent is atomic on ConcurrentHashMap
map.computeIfAbsent(k, this::compute);

// SAFE — StructuredTaskScope (final in JDK 25 LTS — Sept 2025; preview earlier; supersedes ad-hoc ExecutorService)
try (var scope = StructuredTaskScope.open()) {
    var user  = scope.fork(() -> userService.fetch(id));
    var order = scope.fork(() -> orderService.fetch(id));
    scope.join();                        // waits for both; cancellation is structured
    return new Page(user.get(), order.get());
}
```

> JDK 24 (JEP 491) makes `synchronized` virtual-thread-aware; the pinning class of bugs above is mitigated on JDK 24+. **Detect**: enable JFR `jdk.VirtualThreadPinned` events in production; any pinning ≥20 ms is a finding.

### Python (3.12+ — asyncio, threading, GIL nuances, free-threaded 3.13t build)

```python
# BAD — async race: lock held across await but the lock is threading.Lock, not asyncio.Lock
import threading, asyncio
_lock = threading.Lock()
async def update():
    with _lock:                          # blocks the event loop if any coroutine awaits inside
        await asyncio.sleep(0.1)         # under contention this serializes ALL coroutines

# BAD — relying on GIL for atomicity on 3.13t (free-threaded build)
counter = 0
def worker():
    global counter
    for _ in range(10000):
        counter += 1                     # NOT atomic without GIL; lost updates on 3.13t

# BAD — sync-over-async deadlock
def get_data():
    return asyncio.get_event_loop().run_until_complete(fetch())   # fails if loop already running

# SAFE — asyncio.Lock (cooperative, async-aware)
_alock = asyncio.Lock()
async def update():
    async with _alock:
        await asyncio.sleep(0.1)         # other coroutines run while we wait

# SAFE — threading.Lock around the read-modify-write (required on free-threaded build)
import threading
_clock = threading.Lock()
counter = 0
def worker():
    global counter
    for _ in range(10000):
        with _clock: counter += 1

# SAFE — asyncio.TaskGroup (structured concurrency, 3.11+)
async def fan_out():
    async with asyncio.TaskGroup() as tg:
        a = tg.create_task(fetch_a())
        b = tg.create_task(fetch_b())
    return a.result(), b.result()        # both done or both cancelled, exceptions aggregated

# SAFE — detect free-threaded mode at runtime to choose the right primitive.
# The free-threaded build can be the `python3.13t` binary OR a normal 3.13/3.14
# interpreter launched with `-X gil=0` (3.13) / `PYTHON_GIL=0` env. Check at runtime:
import sys
if hasattr(sys, "_is_gil_enabled") and not sys._is_gil_enabled():
    # GIL is off — every read-modify-write needs explicit synchronization
    ...
```

### C (C17 — pthreads, _Atomic / stdatomic.h)

```c
/* BAD — data race on global without _Atomic */
static int counter = 0;
void *worker(void *_) { for (int i = 0; i < 10000; i++) counter++; return NULL; }

/* BAD — TOCTOU on filesystem */
if (access(path, W_OK) == 0) {           /* attacker swaps path to /etc/passwd here */
    int fd = open(path, O_WRONLY);
    write(fd, data, len);
}

/* BAD — pthread mutex acquired in inconsistent order */
void transfer(account *a, account *b, int amt) {
    pthread_mutex_lock(&a->m);           /* thread 1: (a, b)  thread 2: (b, a)  => deadlock */
    pthread_mutex_lock(&b->m);
    /* ... */
}

/* SAFE — _Atomic with explicit memory ordering */
#include <stdatomic.h>
static atomic_int counter = 0;
void *worker(void *_) {
    for (int i = 0; i < 10000; i++) atomic_fetch_add_explicit(&counter, 1, memory_order_relaxed);
    return NULL;
}

/* SAFE — open with O_NOFOLLOW | O_CREAT | O_EXCL, no probe first */
int fd = open(path, O_WRONLY | O_CREAT | O_EXCL | O_NOFOLLOW, 0600);
if (fd < 0) { /* file existed or symlink — refuse */ }

/* SAFE — acquire locks in a globally sorted order */
void transfer(account *a, account *b, int amt) {
    account *first = a < b ? a : b, *second = a < b ? b : a;
    pthread_mutex_lock(&first->m);
    pthread_mutex_lock(&second->m);
    /* ... */
    pthread_mutex_unlock(&second->m);
    pthread_mutex_unlock(&first->m);
}
```

### C++ (20/23 — std::atomic, std::shared_mutex, std::jthread, coroutines)

```cpp
// BAD — naked shared state, no synchronization
int counter = 0;
auto worker = []{ for (int i = 0; i < 10000; ++i) ++counter; };

// BAD — broken double-checked locking without std::atomic acquire/release
static Heavy* instance = nullptr;        // plain pointer
static std::mutex m;
Heavy* get() {
    if (!instance) {                     // racy read; may see non-null but partially constructed
        std::lock_guard g(m);
        if (!instance) instance = new Heavy();
    }
    return instance;
}

// BAD — lock held across co_await
std::mutex m;
task<void> bad() {
    std::lock_guard g(m);
    co_await async_fetch();              // suspends WITH lock held => deadlock under contention
}

// SAFE — std::atomic
std::atomic<int> counter{0};
auto worker = []{ for (int i = 0; i < 10000; ++i) counter.fetch_add(1, std::memory_order_relaxed); };

// SAFE — std::call_once for one-time init
static std::once_flag flag;
static Heavy* instance = nullptr;
Heavy* get() {
    std::call_once(flag, []{ instance = new Heavy(); });
    return instance;
}

// SAFE — release the lock before suspending; reacquire afterwards
task<void> good() {
    auto snapshot = [&]{ std::lock_guard g(m); return snapshot_of_state(); }();
    auto result = co_await async_fetch(snapshot);
    { std::lock_guard g(m); apply(result); }
}

// SAFE — std::shared_mutex for reader-heavy workloads
std::shared_mutex sm;
int read()  { std::shared_lock l(sm); return state; }
void write(int v) { std::unique_lock l(sm); state = v; }
```

### JavaScript / TypeScript (event loop, AbortController, Worker, Atomics + SharedArrayBuffer)

```typescript
// BAD — async race on a shared module-level variable
let cache: Result | null = null;
async function getOrFetch(): Promise<Result> {
    if (cache) return cache;             // two concurrent callers both see null, both fetch,
    cache = await fetch().then(r => r.json());   // both write — second clobbers first's work
    return cache;
}

// BAD — AbortController checked once, never re-checked inside a long async loop
async function copy(signal: AbortSignal, items: Item[]) {
    if (signal.aborted) return;
    for (const i of items) await process(i);     // signal can be aborted mid-loop, ignored
}

// BAD — Atomics-free read-modify-write on SharedArrayBuffer
const buf = new SharedArrayBuffer(4);
const view = new Int32Array(buf);
function inc() { view[0] = view[0] + 1; }        // workers race

// SAFE — coalesce concurrent callers behind a single in-flight promise
let inflight: Promise<Result> | null = null;
async function getOrFetch(): Promise<Result> {
    if (inflight) return inflight;
    inflight = fetch().then(r => r.json()).finally(() => { inflight = null; });
    return inflight;
}

// SAFE — re-check signal in the loop, throw on abort
async function copy(signal: AbortSignal, items: Item[]) {
    for (const i of items) {
        signal.throwIfAborted();
        await process(i);
    }
}

// SAFE — Atomics on SharedArrayBuffer
function inc() { Atomics.add(view, 0, 1); }
```

### SQL (transaction isolation, SELECT ... FOR UPDATE, advisory locks)

```sql
-- BAD — read-modify-write at READ COMMITTED isolation => lost updates
BEGIN;
SELECT balance FROM accounts WHERE id = 1;            -- read 100
-- application code: new_balance = 100 - 30 = 70
UPDATE accounts SET balance = 70 WHERE id = 1;        -- another tx did the same: lost update
COMMIT;

-- BAD — TOCTOU on uniqueness: check, then insert
SELECT id FROM users WHERE email = 'a@b.c';           -- 0 rows
INSERT INTO users (email) VALUES ('a@b.c');           -- racy with another concurrent inserter

-- SAFE — pessimistic lock with SELECT ... FOR UPDATE
BEGIN;
SELECT balance FROM accounts WHERE id = 1 FOR UPDATE; -- row-level lock until COMMIT
UPDATE accounts SET balance = balance - 30 WHERE id = 1;
COMMIT;

-- SAFE — atomic UPDATE without the round-trip
UPDATE accounts SET balance = balance - 30
WHERE id = 1 AND balance >= 30;                       -- returns rowcount = 0 on insufficient funds

-- SAFE — SERIALIZABLE isolation for cross-row invariants (Postgres SSI catches conflicts)
BEGIN ISOLATION LEVEL SERIALIZABLE;
-- ... reads and writes ...
COMMIT;                                               -- may fail with serialization_failure: retry

-- SAFE — unique constraint + ON CONFLICT for the TOCTOU pattern
INSERT INTO users (email) VALUES ('a@b.c')
ON CONFLICT (email) DO NOTHING RETURNING id;
```

## Tool Integration (2026 landscape)

| Tool | Mode | Languages | When |
|------|------|-----------|------|
| **Go race detector** (`go test -race`, `go build -race`) | Dynamic | Go | Always in CI for any code touching goroutines or shared state. Cheap to enable, gold standard. |
| **ThreadSanitizer (TSan)** | Dynamic | C, C++, Rust (limited), Go (alias of -race) | C/C++ projects with shared-state concurrency. Compile with `-fsanitize=thread`. |
| **Helgrind / DRD** (Valgrind) | Dynamic | C, C++ | When TSan is unavailable or for pthread-specific patterns. Slower than TSan but reaches non-instrumented binaries. |
| **Java JFR `jdk.VirtualThreadPinned`** | Dynamic | Java 21+ | Always on in production at default 20 ms threshold. Free until a pinning event occurs. |
| **`jdk.tracePinnedThreads`** (JEP 444) | Dynamic | Java 21–23 | Set `-Djdk.tracePinnedThreads=full` in dev/staging to print stacks when synchronized blocks pin a virtual thread. Less needed on JDK 24+ after JEP 491, still valuable for native-frame pinning. |
| **`StructuredTaskScope`** lifecycle audit | Static | Java 25+ | Grep for `Executors.newFixedThreadPool` / `CompletableFuture.supplyAsync` that should be `StructuredTaskScope`. |
| **.NET PerfView / dotnet-trace + dotnet-counters** | Dynamic | C# / .NET | When async deadlocks or thread starvation are suspected. `dotnet-trace collect --providers Microsoft-Windows-DotNETRuntime` then PerfView for stack/lock analysis. |
| **Roslyn analyzers** (`CA2007`, `VSTHRD*`) | Static | C# | Always on. `Microsoft.VisualStudio.Threading.Analyzers` catches `.Result` / `.Wait()` / lock-across-await. |
| **`concurrencytest` / `pytest-asyncio --mode=strict`** | Dynamic | Python | Stress-test code paths; `asyncio.run`-misuse linter. |
| **`faulthandler` + `sys._is_gil_enabled()` audit** | Static + runtime | Python 3.13t | Confirm whether free-threaded build is in use; gate behavior on it. |
| **Miri / loom** | Dynamic / model | Rust | Miri catches UB and data races under reduced ordering models; loom enumerates interleavings for lock-free code. (Cross-link [[memory-safety-checker]].) |
| **TLA+ / SPIN** | Model checker | Algorithm-level | When a lock-free protocol or distributed consensus invariant must be proven; not for whole codebases. Build a small model of the critical section. |
| **`go vet`, `staticcheck`** | Static | Go | Catches lock copying, unkeyed struct literals on `sync.Mutex`, defer-in-loop. |
| **SpotBugs `MT_CORRECTNESS`** | Static | Java | Catches unsynchronized access, broken DCL, naked notify. |
| **Clang `-Wthread-safety` annotations** | Static | C, C++ | `GUARDED_BY`, `REQUIRES`, `EXCLUDES` annotations enable compile-time lock-discipline checking. High ROI in large C++ codebases. |

### Invocation snippets

```bash
# Go — always
go test -race ./...
go build -race -o app ./cmd/app && ./app    # also valid for prod canaries

# C/C++ with Clang/GCC
clang -fsanitize=thread -g -O1 main.c -o main && ./main
valgrind --tool=helgrind ./app
valgrind --tool=drd      ./app

# Java
java -XX:StartFlightRecording=filename=app.jfr,settings=profile,filename=app.jfr,maxsize=200m -jar app.jar
java -Djdk.tracePinnedThreads=full -jar app.jar      # JDK 21–23 dev/staging

# Python 3.13 free-threaded
python3.13t -c "import sys; assert not sys._is_gil_enabled()"
python3.13t -m pytest -p concurrencytest

# .NET
dotnet-trace collect --providers Microsoft-DotNETCore-SampleProfiler,Microsoft-Windows-DotNETRuntime \
                     --process-id <pid> --duration 00:00:30
dotnet build /warnaserror /p:EnableNETAnalyzers=true /p:AnalysisMode=All
# PerfView analyzes the resulting .nettrace for thread/lock contention and starvation.

# Rust
cargo +nightly miri test
cargo test --features loom
```

Aggregate findings into the SARIF flow if the tool supports it (TSan does; many race-detector outputs do not — wrap them via the SARIF converter in your CI pipeline, e.g. `tsan-to-sarif`). Pin a CI step that fails the build whenever this skill emits any letter.

## Severity (internal triage vs. refinement-loop output)

These tiers are the **internal triage view** used when you produce a human-readable scan report. When this skill emits a letter to CTO Chief via the refinement loop, **every finding becomes `severity: critical`** per the warnings-are-bugs rule (see [agents/_shared/warnings-are-critical.md](../../../agents/_shared/warnings-are-critical.md)) — there is no soft tier on the wire. The triage tiers below stay in the report body for prioritization.

| Triage tier | Examples | Internal action |
|-------|----------|--------|
| CRITICAL | TOCTOU on auth check, verified data race on financial / persistence path, confirmed deadlock in request handler, sync-over-async on hot path | BLOCK |
| HIGH | Unprotected shared state with plausible interleaving, lock across await, broken DCL, livelock under load test, virtual-thread carrier pinning on JDK 21–23 | BLOCK |
| MEDIUM | Sleep-based synchronization, coarse-grained lock causing contention, unkeyed `sync.Mutex` copy, missing `ConfigureAwait(false)` in library code | Fix soon |
| LOW | Lock named confusingly, finer-than-needed granularity, missing structured concurrency where ad-hoc `Task.Run` works | Backlog |

## Output Format (human-readable scan report)

```markdown
## Concurrency Analysis Report

### Summary
| Severity | Count | Required Action |
|----------|-------|-----------------|
| CRITICAL | 1     | IMMEDIATE       |
| HIGH     | 3     | Before Release  |
| MEDIUM   | 5     | Within Sprint   |
| LOW      | 8     | Backlog         |

### CRITICAL: TOCTOU on filesystem write
**File**: src/storage/writer.c:88
**CWE**: CWE-367  **OWASP**: A01
**Race kind**: TOCTOU
**Shared resource**: filesystem path `path`
**Detected by**: static (pattern: access → open without O_EXCL)

```c
if (access(path, W_OK) == 0) {
    int fd = open(path, O_WRONLY);     // attacker swaps path to symlink → /etc/passwd
    write(fd, data, len);
}
```

**Fix**: open with `O_CREAT | O_EXCL | O_NOFOLLOW` and skip the probe entirely.
**Reference**: https://cwe.mitre.org/data/definitions/367.html

### HIGH: Data race on shared counter
**File**: src/metrics/aggregator.go:42
**CWE**: CWE-362  **OWASP**: A04
**Race kind**: data-race
**Shared resource**: `aggregator.requests`
**Detected by**: race-detector (`go test -race`, occurrence 27 of 800 runs)
**Fix**: change `int` to `atomic.Int64`, replace `r++` with `r.Add(1)`.
```

## Cross-link to memory-safety-checker

For C and C++, data races on raw pointers and UAF-by-race overlap with memory safety. Coordinate with [[memory-safety-checker]]: any TSan finding involving heap memory should also raise a memory-safety letter. Don't duplicate findings — pick one owner (typically: concurrency-checker owns the race, memory-safety-checker owns the lifetime). The integrator collapses duplicates by `finding_id`.

## Special Considerations

- **Vendor / third-party libs**: don't flag inside `vendor/` `node_modules/` `bin/` `obj/`; DO flag your code's use of an API in a way that violates the library's thread-safety contract (e.g. `HashMap` shared across threads in Java, `dict` mutation on free-threaded Python).
- **Test code**: tests that rely on `sleep` are themselves a smell; flag them as MEDIUM. Tests for concurrent code should use barriers, latches, or property-based stress harnesses.
- **Legacy**: a confirmed race on a quiet code path that handles non-sensitive data may be tracked via [[technical-debt-tracker]] with an explicit migration plan, but document the decision in the plan's `## Decisions Taken Under Ambiguity`.
- **Framework-aware**: ASP.NET Core `IHttpContextAccessor` across `Task.Run`, Spring `@Async` returning `void`, Django ORM in `asyncio` without `sync_to_async`, Node.js `worker_threads` with `SharedArrayBuffer` — each has a documented thread-safety contract; flag violations.

## Letter schema (refinement-loop output contract)

When emitting a finding via the refinement loop, write the letter with these fields:

```yaml
finding_id: <sha256(critic+file+line+race_kind)[:12]>
severity: critical                                   # ALWAYS critical (warnings-are-bugs)
confidence: high | medium | low                      # high = race detector caught it OR two engines agree
engine: tsan | go-race | helgrind | drd | jfr-pinning | static | model-checker | manual
rule_id: <tool's rule id, e.g. tsan.data-race or static.lock-across-await>
race_kind: TOCTOU | data-race | deadlock | atomicity | livelock | starvation | broken-dcl | sync-over-async | lock-across-await | pinning | cancellation-race
shared_resource: "accounts.balance" | "filesystem:path" | "globals.cache" | "Mutex:lockA→lockB"
owasp: A01 | A04
cwe: CWE-362 | CWE-366 | CWE-367 | CWE-833
paths:                                               # all files involved in the race
  - file: src/account/transfer.go
    line: 42
  - file: src/account/refund.go
    line: 88
sink: "atomic write site or critical-section entry"
source: "untrusted input or competing thread origin"
detected_by: race-detector | static | model-checker
reachable: true | false | unknown                    # is there a real call path from an entry point?
corroborated_by: [<other engines that also flagged this>]
delta_to_baseline: new | unchanged | regressed
reproducibility: deterministic | flaky | stress-only # how often did the dynamic detector hit it?
message: "Data race: aggregator.requests++ without synchronization; 27/800 runs flagged"
fix: "Change to atomic.Int64 and Add(1); or guard with sync.Mutex around the read-modify-write."
reference: https://cwe.mitre.org/data/definitions/362.html
```

The integrator uses `confidence`, `corroborated_by`, and `reproducibility` to weight findings — a `confidence: low` single-source static hint doesn't block phase advancement, but a race detector finding (even `reproducibility: flaky`) is always `confidence: high`. `reachable: false` makes the finding informational (still emitted, still `severity: critical` on the wire). `delta_to_baseline: unchanged` lets the integrator skip already-accepted findings.

---

## Refinement Loop — critic mode

When invoked as a critic by the Iron Loop integrator (see [docs/REFINEMENT_LOOP.md](../../../docs/REFINEMENT_LOOP.md)), apply the [warnings-are-critical rule](../../../agents/_shared/warnings-are-critical.md):

- Every concurrency warning — race detector hit, lock-discipline lint, JFR pinning event, deprecation of a thread-safety API, CVE in a concurrency primitive — emits as `severity: critical` in the letter you write to CTO Chief.
- The [letter schema](../../../.ctoc/architecture/refinement-loop-schema.json) rejects `warn` — there is no soft tier.
- Warnings block phase advancement (critical → medium) until resolved or explicitly waived in the plan's `## Decisions Taken Under Ambiguity` section.

The principle: a race today is a corrupted database tomorrow. Concurrency bugs that ship green still ship — they just fail later, and by then the customer has the stack trace.
